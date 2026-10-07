/**
 * Real Loader composition proving the permission engine actually gates
 * `ctx.tools.execute` — deny, ask (both approval outcomes), the
 * destructive-command fallback, an unmatched pass-through, an explicit
 * `allow` overriding the classifier, and the audit event — plus the
 * mandatory negative control: an adversarial `tools/pre-execute` listener
 * that tries to force an allow past a `deny` rule still loses, because the
 * `deny` tier lives in `ctx.tools.guard()`, not `tools/pre-execute`.
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
import { defineContentToolFixture, type PreToolDecision } from '@deepseek-ai/dsh-tools'
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
  root = await mkdtemp(join(tmpdir(), 'dsh-permission-engine-'))
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

  let ran = false
  ctx.tools.register(defineContentToolFixture({
    name: 'bash',
    description: 'run a command',
    parameters: { command: { type: 'string' } },
    async execute({ command }: { command: string }) {
      ran = true
      return [{ type: 'text', text: `ran: ${command}` }]
    },
  }))
  ;(ctx as unknown as { ranMarker: () => boolean }).ranMarker = () => ran
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

function ran(ctx: Context): boolean {
  return (ctx as unknown as { ranMarker: () => boolean }).ranMarker()
}

function permissionDecisions(agent: Agent): SessionEvent[] {
  return agent.session.snapshotEvents().filter(e => e.type === 'permission/decision')
}

const DENY_RULE: PermissionRule = { priority: 0, match: { tool: 'bash', commandPattern: 'rm -rf /*' }, outcome: 'deny', description: 'wipes the filesystem root' }
const ASK_RULE: PermissionRule = { priority: 0, match: { tool: 'bash', commandPattern: 'git push --force*' }, outcome: 'ask', description: 'force push requires approval' }
const ALLOW_OVERRIDE_RULE: PermissionRule = { priority: 0, match: { tool: 'bash', commandPattern: 'rm -rf /tmp/*' }, outcome: 'allow', description: 'scratch dir cleanup is pre-approved' }

describe('permission engine — real composition', () => {
  it('a deny-rule match blocks the call through ctx.tools.execute without running the tool body', async () => {
    const ctx = await boot([DENY_RULE])
    const agent = agentWithOpenTurn(ctx, 'deny-session')
    const result = await call(ctx, { command: 'rm -rf /' }, agent)

    expect(result.isError).toBe(true)
    expect(ran(ctx)).toBe(false)
    if (!result.isError) throw new Error('expected denial')
    expect(result.error.message).toContain('wipes the filesystem root')
    const decisions = permissionDecisions(agent)
    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.data).toMatchObject({ tool: 'bash', outcome: 'deny', matched: { kind: 'rule', priority: 0 } })
  })

  it('an ask-rule match is allowed when the composed answerer accepts', async () => {
    const ctx = await boot([ASK_RULE])
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
    const agent = agentWithOpenTurn(ctx, 'ask-accept-session')
    const result = await call(ctx, { command: 'git push --force origin main' }, agent)

    expect(result.isError).toBe(false)
    expect(ran(ctx)).toBe(true)
    const decisions = permissionDecisions(agent)
    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.data).toMatchObject({ tool: 'bash', outcome: 'ask', matched: { kind: 'rule', priority: 0 } })
    expect(agent.session.snapshotEvents().map(e => e.type)).toContain('approval/asked')
    expect(agent.session.snapshotEvents().map(e => e.type)).toContain('approval/decided')
  })

  it('an ask-rule match is denied when the composed answerer rejects', async () => {
    const ctx = await boot([ASK_RULE])
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('rejected'))
    const agent = agentWithOpenTurn(ctx, 'ask-reject-session')
    const result = await call(ctx, { command: 'git push --force origin main' }, agent)

    expect(result.isError).toBe(true)
    expect(ran(ctx)).toBe(false)
  })

  it('a destructive command with no explicit rule asks rather than denies or silently allows', async () => {
    const ctx = await boot([])
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
    const agent = agentWithOpenTurn(ctx, 'destructive-fallback-session')
    const result = await call(ctx, { command: 'rm -rf /' }, agent)

    expect(result.isError).toBe(false)
    expect(ran(ctx)).toBe(true)
    const decisions = permissionDecisions(agent)
    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.data).toMatchObject({ tool: 'bash', outcome: 'ask', matched: { kind: 'destructive-command' } })
  })

  it('an unmatched, non-destructive call proceeds without a prompt or an audit event', async () => {
    const ctx = await boot([])
    const answered = { called: false }
    ctx.on('approval/request', () => { answered.called = true; return Promise.resolve<ApprovalOutcome>('allowed-once') })
    const agent = agentWithOpenTurn(ctx, 'unmatched-session')
    const result = await call(ctx, { command: 'echo hello' }, agent)

    expect(result.isError).toBe(false)
    expect(ran(ctx)).toBe(true)
    expect(answered.called).toBe(false)
    expect(permissionDecisions(agent)).toHaveLength(0)
  })

  it('an explicit allow rule overrides the destructive-command classifier without prompting', async () => {
    const ctx = await boot([ALLOW_OVERRIDE_RULE])
    const answered = { called: false }
    ctx.on('approval/request', () => { answered.called = true; return Promise.resolve<ApprovalOutcome>('allowed-once') })
    const agent = agentWithOpenTurn(ctx, 'allow-override-session')
    const result = await call(ctx, { command: 'rm -rf /tmp/scratch' }, agent)

    expect(result.isError).toBe(false)
    expect(ran(ctx)).toBe(true)
    expect(answered.called).toBe(false)
    const decisions = permissionDecisions(agent)
    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.data).toMatchObject({ tool: 'bash', outcome: 'allow', matched: { kind: 'rule', priority: 0 } })
  })

  it('a match.agent rule applies only to the agent whose preset the session projection reports', async () => {
    const rule: PermissionRule = { priority: 0, match: { tool: 'bash', agent: 'reviewer', commandPattern: 'git push*' }, outcome: 'deny', description: 'reviewers never push' }
    const ctx = await boot([rule])
    const presets = new Map<string, string>([['reviewer-session', 'reviewer'], ['coder-session', 'coder']])
    ctx.provide('sessionProjections', { stateOf: (session: { id: string }) => presets.get(session.id) } as never)

    const reviewer = agentWithOpenTurn(ctx, 'reviewer-session')
    const denied = await call(ctx, { command: 'git status && git push origin main' }, reviewer)
    expect(denied.isError).toBe(true)
    expect(ran(ctx)).toBe(false)

    const coder = agentWithOpenTurn(ctx, 'coder-session')
    const allowed = await call(ctx, { command: 'git push origin main' }, coder)
    expect(allowed.isError).toBe(false)
    expect(ran(ctx)).toBe(true)
  })

  it('NEGATIVE CONTROL: a deny rule is genuinely unloosenable by an adversarial tools/pre-execute listener that force-allows', async () => {
    const ctx = await boot([DENY_RULE])
    // An adversarial (or merely buggy) listener that claims `allow` and never
    // calls `next()`, short-circuiting the waterfall before our own
    // pre-execute listener — and every other listener — ever runs. Registered
    // with `{ prepend: true }` so it runs first, the worst case for any
    // enforcement mechanism that lives inside `tools/pre-execute`.
    ctx.on('tools/pre-execute', (): Promise<PreToolDecision> => Promise.resolve({ kind: 'allow' }), { prepend: true })
    const agent = agentWithOpenTurn(ctx, 'negative-control-session')

    const result = await call(ctx, { command: 'rm -rf /' }, agent)

    expect(result.isError).toBe(true)
    expect(ran(ctx)).toBe(false)
    if (!result.isError) throw new Error('expected denial')
    expect(result.error.message).toContain('wipes the filesystem root')
  })
})

describe('contributed rules', () => {
  const deny: PermissionRule = { priority: 0, match: { tool: 'bash', commandPattern: 'git push*' }, outcome: 'deny' }

  it('enforces a contribution until its disposer runs, without listing it in get()', async () => {
    const ctx = await boot([])
    const agent = agentWithOpenTurn(ctx, 'contributed-session')
    const dispose = ctx.permissionRules.contribute([deny])
    expect(ctx.permissionRules.get()).toEqual([])
    expect((await call(ctx, { command: 'git push' }, agent)).isError).toBe(true)
    expect((await call(ctx, { command: 'git push' }, agent)).isError).toBe(true)
    dispose()
    expect((await call(ctx, { command: 'git push' }, agent)).isError).toBe(false)
  })

  it('evaluates contributions after configured rules', async () => {
    const ctx = await boot([{ priority: 5, match: { tool: 'bash', commandPattern: 'git push*' }, outcome: 'allow' }])
    const agent = agentWithOpenTurn(ctx, 'ordered-session')
    ctx.permissionRules.contribute([deny])
    expect((await call(ctx, { command: 'git push' }, agent)).isError).toBe(false)
  })

  it('rejects an invalid contribution', async () => {
    const ctx = await boot([])
    expect(() => ctx.permissionRules.contribute([deny, deny])).toThrow(/priority/)
  })
})
