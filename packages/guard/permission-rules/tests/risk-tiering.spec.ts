/**
 * Real Loader composition proving risk-tiered `ask` gating: an
 * `irreversible`-tier decision (the default; also the always-on
 * destructive-command classifier) asks on every call, even a second
 * identical call granted in the same session — the mandatory negative
 * control, since "the second identical call skips the prompt" is exactly
 * the anti-pattern this task exists to prevent. A `reversible`-tier decision
 * asks once, then auto-approves a later identical call in the same session
 * without re-prompting — the positive case proving the feature isn't pure
 * friction. Boot/call helpers mirror `tests/permission-engine.spec.ts`.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import * as sessionPlugin from '@deepseek-ai/dsh-session'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import * as systemPromptPlugin from '@deepseek-ai/dsh-system-prompt'
import * as toolsPlugin from '@deepseek-ai/dsh-tools'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import * as approvalPlugin from '@deepseek-ai/dsh-user-approval'
import * as permissionRulesPlugin from '@deepseek-ai/dsh-permission-rules'
import type { PermissionRule } from '@deepseek-ai/dsh-permission-rules'

let context: Context | undefined
let root: string | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot a real Loader composition: session, tools, approval, and the permission engine over a given rule table. */
async function boot(rules: PermissionRule[]): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-risk-tiering-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-user-approval'",
    "- name: '@deepseek-ai/dsh-permission-rules'",
    '  config:',
    `    rules: ${JSON.stringify(rules)}`,
    '',
  ].join('\n'))
  const ctx = context = new Context()
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-session', sessionPlugin],
    ['@deepseek-ai/dsh-system-prompt', systemPromptPlugin],
    ['@deepseek-ai/dsh-tools', toolsPlugin],
    ['@deepseek-ai/dsh-user-approval', approvalPlugin],
    ['@deepseek-ai/dsh-permission-rules', permissionRulesPlugin],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error('Unexpected Loader import: ' + specifier)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()

  const runCount = { value: 0 }
  ctx.tools.register(defineContentToolFixture({
    name: 'bash',
    description: 'run a command',
    parameters: { command: { type: 'string' } },
    async execute({ command }: { command: string }) {
      runCount.value += 1
      return [{ type: 'text', text: `ran: ${command}` }]
    },
  }))
  ;(ctx as unknown as { runCount: () => number }).runCount = () => runCount.value
  return ctx
}

/** A fake Agent whose real Session (owned by the booted composition) starts inside an open turn. */
function agentWithOpenTurn(ctx: Context, id: string): Agent {
  const session = ctx.sessions.create(SessionId(id))
  session.append('turn/start', { turn: 1 })
  return { id: session.id, session, ctx, inject: () => {} } as unknown as Agent
}

let callCounter = 0
function call(ctx: Context, args: unknown, agent?: Agent) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId(`call-${++callCounter}`),
    name: 'bash',
    arguments: args,
    ...agent ? { agent } : {},
  })
}

function runCount(ctx: Context): number {
  return (ctx as unknown as { runCount: () => number }).runCount()
}

function permissionDecisions(agent: Agent): SessionEvent[] {
  return agent.session.snapshotEvents().filter(e => e.type === 'permission/decision')
}

const IRREVERSIBLE_ASK_RULE: PermissionRule = {
  priority: 0,
  match: { tool: 'bash', commandPattern: 'git push --force*' },
  outcome: 'ask',
  risk: 'irreversible',
  description: 'force push requires approval every time',
}

const REVERSIBLE_ASK_RULE: PermissionRule = {
  priority: 0,
  match: { tool: 'bash', commandPattern: 'npm test*' },
  outcome: 'ask',
  risk: 'reversible',
  description: 'running the test suite is safe to remember for this session',
}

/** Counts each `ctx.on('approval/request', ...)` dispatch — one composed answerer that always grants. */
function countingAnswerer(ctx: Context): { calls: number } {
  const counter = { calls: 0 }
  ctx.on('approval/request', () => {
    counter.calls += 1
    return Promise.resolve<ApprovalOutcome>('allowed-once')
  })
  return counter
}

describe('risk-tiered ask gating — real composition', () => {
  it('NEGATIVE CONTROL: an irreversible-tier ask asks again on a second identical call in the same session', async () => {
    const ctx = await boot([IRREVERSIBLE_ASK_RULE])
    const answerer = countingAnswerer(ctx)
    const agent = agentWithOpenTurn(ctx, 'irreversible-session')

    const first = await call(ctx, { command: 'git push --force origin main' }, agent)
    const second = await call(ctx, { command: 'git push --force origin main' }, agent)

    expect(first.isError).toBe(false)
    expect(second.isError).toBe(false)
    expect(runCount(ctx)).toBe(2)
    // The actual negative control: the second identical call must NOT skip
    // the prompt. If it did, the answerer would only have been invoked once.
    expect(answerer.calls).toBe(2)
    expect(permissionDecisions(agent)).toHaveLength(2)
  })

  it('NEGATIVE CONTROL (default risk): an ask rule with no risk field asks again on a second identical call', async () => {
    const { risk: _risk, ...ruleWithoutRisk } = IRREVERSIBLE_ASK_RULE
    const defaultRiskRule: PermissionRule = ruleWithoutRisk
    const ctx = await boot([defaultRiskRule])
    const answerer = countingAnswerer(ctx)
    const agent = agentWithOpenTurn(ctx, 'default-risk-session')

    await call(ctx, { command: 'git push --force origin main' }, agent)
    await call(ctx, { command: 'git push --force origin main' }, agent)

    expect(answerer.calls).toBe(2)
  })

  it('NEGATIVE CONTROL: the always-on destructive-command classifier asks again on a second identical call, with no rule involved', async () => {
    const ctx = await boot([])
    const answerer = countingAnswerer(ctx)
    const agent = agentWithOpenTurn(ctx, 'destructive-session')

    const first = await call(ctx, { command: 'rm -rf /' }, agent)
    const second = await call(ctx, { command: 'rm -rf /' }, agent)

    expect(first.isError).toBe(false)
    expect(second.isError).toBe(false)
    expect(answerer.calls).toBe(2)
  })

  it('POSITIVE CASE: a reversible-tier ask is not re-prompted on a second identical call in the same session', async () => {
    const ctx = await boot([REVERSIBLE_ASK_RULE])
    const answerer = countingAnswerer(ctx)
    const agent = agentWithOpenTurn(ctx, 'reversible-session')

    const first = await call(ctx, { command: 'npm test --watch=false' }, agent)
    const second = await call(ctx, { command: 'npm test --watch=false' }, agent)

    expect(first.isError).toBe(false)
    expect(second.isError).toBe(false)
    expect(runCount(ctx)).toBe(2)
    expect(answerer.calls).toBe(1)
    const decisions = permissionDecisions(agent)
    expect(decisions).toHaveLength(2)
    expect(decisions[0]?.data).toMatchObject({ outcome: 'ask' })
    expect(decisions[1]?.data).toMatchObject({ outcome: 'allow' })
  })

  it('a reversible-tier grant does not leak across sessions', async () => {
    const ctx = await boot([REVERSIBLE_ASK_RULE])
    const answerer = countingAnswerer(ctx)
    const agentA = agentWithOpenTurn(ctx, 'reversible-session-a')
    const agentB = agentWithOpenTurn(ctx, 'reversible-session-b')

    await call(ctx, { command: 'npm test --watch=false' }, agentA)
    await call(ctx, { command: 'npm test --watch=false' }, agentB)

    expect(answerer.calls).toBe(2)
  })

  it('a reversible-tier ask still denies when the answerer rejects, and does not cache a denial', async () => {
    const ctx = await boot([REVERSIBLE_ASK_RULE])
    let rejectFirst = true
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>(rejectFirst ? 'rejected' : 'allowed-once'))
    const agent = agentWithOpenTurn(ctx, 'reversible-reject-session')

    const first = await call(ctx, { command: 'npm test --watch=false' }, agent)
    rejectFirst = false
    const second = await call(ctx, { command: 'npm test --watch=false' }, agent)

    expect(first.isError).toBe(true)
    expect(second.isError).toBe(false)
    expect(runCount(ctx)).toBe(1)
  })
})
