/**
 * Real Loader composition: `ctx.repoMap` injects a budget-bounded repo map
 * on `agent/pre-step`, recomputes only touched tracked files, defers a
 * mid-step touch to `step/end`, and never trips the token-meter budget gate.
 * Mirrors `session-reference`'s `loader-composition.spec.ts` template.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import * as sessionPlugin from '@deepseek-ai/dsh-session'
import * as sessionProjectionPlugin from '@deepseek-ai/dsh-session-projection'
import * as subprocessLocalPlugin from '@deepseek-ai/dsh-subprocess-local'
import * as tokenMeterPlugin from '@deepseek-ai/dsh-token-meter'
import * as systemPromptPlugin from '@deepseek-ai/dsh-system-prompt'
import * as toolsPlugin from '@deepseek-ai/dsh-tools'
import * as fsLocalPlugin from '@deepseek-ai/dsh-fs-local'
import * as toolFsPlugin from '@deepseek-ai/dsh-tool-fs'
import * as repoMapPlugin from '@deepseek-ai/dsh-repo-map'
import * as registerTurnBoundaryPlugin from './fixtures/register-turn-boundary.ts'

let context: Context | undefined
let root: string | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

const ALPHA_SOURCE = `export class AlphaOne {}
export class AlphaTwo {}
export function alphaThree(): void {}
export function alphaFour(): void {}
export function alphaFive(): void {}
export function alphaSix(): void {}
export interface AlphaSeven { x: number }
export interface AlphaEight { y: number }
export function alphaNine(): void {}
export function alphaTen(): void {}
`

const BETA_SOURCE = `export class BetaOne {}
export class BetaTwo {}
export function betaThree(): void {}
export function betaFour(): void {}
export function betaFive(): void {}
export function betaSix(): void {}
export interface BetaSeven { x: number }
export interface BetaEight { y: number }
export function betaNine(): void {}
export function betaTen(): void {}
`

const GAMMA_SOURCE = `export class GammaOne {}
export function gammaTwo(): void {}
`

interface Fixture {
  ctx: Context
  agent: Agent
  session: Session
  projectDir: string
}

async function bootFixture(): Promise<Fixture> {
  root = await mkdtemp(join(tmpdir(), 'repo-map-loader-'))
  const projectDir = join(root, 'project')
  await mkdir(projectDir, { recursive: true })
  await writeFile(join(projectDir, 'alpha.ts'), ALPHA_SOURCE)
  await writeFile(join(projectDir, 'beta.ts'), BETA_SOURCE)
  await writeFile(join(projectDir, 'gamma.ts'), GAMMA_SOURCE)

  const fixture = await readFile(new URL('./fixtures/cordis.yml', import.meta.url), 'utf8')
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, fixture.replace('{{rootDir}}', projectDir.replaceAll('\\', '/')))

  const ctx = context = new Context()
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-session', sessionPlugin],
    ['@deepseek-ai/dsh-session-projection', sessionProjectionPlugin],
    ['@deepseek-ai/dsh-subprocess-local', subprocessLocalPlugin],
    ['@deepseek-ai/dsh-token-meter', tokenMeterPlugin],
    ['@deepseek-ai/dsh-system-prompt', systemPromptPlugin],
    ['@deepseek-ai/dsh-tools', toolsPlugin],
    ['@deepseek-ai/dsh-fs-local', fsLocalPlugin],
    ['@deepseek-ai/dsh-tool-fs', toolFsPlugin],
    ['./register-turn-boundary.ts', registerTurnBoundaryPlugin],
    ['@deepseek-ai/dsh-repo-map', repoMapPlugin],
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

  const session = ctx.sessions.create(SessionId('repo-map-target'))
  const agent = { id: session.id, ctx, session, options: {} } as Agent
  return { ctx, agent, session, projectDir }
}

async function preStep(ctx: Context, agent: Agent, message: ReturnType<typeof createUserMessage>) {
  return agentEvents(ctx, agent).waterfall('agent/pre-step', {
    messages: [message], turn: 1, step: 1, signal: new AbortController().signal,
  }, () => Promise.resolve({ kind: 'enter' as const, messages: [message] }))
}

function directMessage(text: string): ReturnType<typeof createUserMessage> {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

describe('repo-map real Loader composition', () => {
  it('injects a budget-bounded repo map on a step for a project with real source files', async () => {
    const { ctx, agent } = await bootFixture()
    const direct = directMessage('What does this project contain?')
    const decision = await preStep(ctx, agent, direct)
    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter') throw new Error('expected admitted repo map')
    expect(decision.messages).toHaveLength(2)
    const repoMapMessage = decision.messages[1]!
    expect(repoMapMessage.source).toEqual({ kind: 'repo-map', form: 'instructions' })
    const block = repoMapMessage.content[0]
    if (block?.type !== 'text') throw new Error('expected repo-map text block')
    expect(block.text).toContain('Repo map (auto-generated, naive v1')
    // The tight fraction below forces truncation, so only the file(s) that
    // fit are asserted here; which file survives depends on mtime ordering,
    // not on any specific filename.
    expect(/(Alpha|Beta|Gamma)(One|Two)/.test(block.text)).toBe(true)

    // Authoritative budget gate: the real ctx.tokenMeter count, not byte length.
    const tokens = ctx.tokenMeter.estimateMessage(repoMapMessage)
    // repoMapContextFraction: 0.05 against the no-adapter fallback context
    // window (DEFAULT_MIN_REPO_MAP_BYTES / 4 = 2048) yields a ~102-token cap;
    // three fixture files (30+ symbols) comfortably exceed that unbounded, so
    // this only passes if truncation actually ran.
    expect(tokens).toBeLessThanOrEqual(110)
    expect(ctx.repoMap.walkCount).toBe(1)
  })

  it('does not recompute for a touch to an untracked file (no full re-walk)', async () => {
    const { ctx, agent, projectDir } = await bootFixture()
    const direct = directMessage('hello')
    await preStep(ctx, agent, direct)
    expect(ctx.repoMap.walkCount).toBe(1)
    const recomputeBefore = ctx.repoMap.fileRecomputeCount

    const newFilePath = join(projectDir, 'delta.ts')
    const result = await ctx.tools.execute({
      name: 'write',
      callId: ToolCallId('write-untracked'),
      arguments: { file_path: newFilePath, content: 'export function deltaOne(): void {}\n' },
      agent,
      signal: new AbortController().signal,
    })
    expect(result.isError).toBe(false)

    // Drain the per-agent projection tail by round-tripping another pre-step.
    await preStep(ctx, agent, direct)
    expect(ctx.repoMap.fileRecomputeCount).toBe(recomputeBefore)
    expect(ctx.repoMap.walkCount).toBe(1)
  })

  it('recomputes a targeted single file when a tracked source file is touched', async () => {
    const { ctx, agent, projectDir } = await bootFixture()
    const direct = directMessage('hello')
    const first = await preStep(ctx, agent, direct)
    if (first.kind !== 'enter') throw new Error('expected admitted repo map')
    const recomputeBefore = ctx.repoMap.fileRecomputeCount

    const alphaPath = join(projectDir, 'alpha.ts')
    const result = await ctx.tools.execute({
      name: 'edit',
      callId: ToolCallId('edit-tracked'),
      arguments: {
        file_path: alphaPath,
        old_string: 'export function alphaTen(): void {}',
        new_string: 'export function alphaTen(): void {}\nexport function alphaEleven(): void {}',
      },
      agent,
      signal: new AbortController().signal,
    })
    expect(result.isError).toBe(false)

    await preStep(ctx, agent, direct)
    expect(ctx.repoMap.fileRecomputeCount).toBe(recomputeBefore + 1)
    expect(ctx.repoMap.walkCount).toBe(1)
  })

  it('defers a mid-step touch to step/end, mirroring agent-instructions stepTouches', async () => {
    const { ctx, agent, session, projectDir } = await bootFixture()
    const direct = directMessage('hello')
    await preStep(ctx, agent, direct)
    const recomputeBefore = ctx.repoMap.fileRecomputeCount

    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })

    const betaPath = join(projectDir, 'beta.ts')
    const result = await ctx.tools.execute({
      name: 'edit',
      callId: ToolCallId('edit-mid-step'),
      arguments: {
        file_path: betaPath,
        old_string: 'export function betaTen(): void {}',
        new_string: 'export function betaTen(): void {}\nexport function betaEleven(): void {}',
      },
      agent,
      signal: new AbortController().signal,
    })
    expect(result.isError).toBe(false)

    // Still mid-step: the touch is queued in stepTouches, not yet projected.
    expect(ctx.repoMap.fileRecomputeCount).toBe(recomputeBefore)

    session.append('step/end', { turn: 1, step: 1 })
    // step/end synchronously queues the deferred touch's projection tail;
    // await one microtask turn for that queued promise to settle.
    await Promise.resolve()
    await preStep(ctx, agent, direct)
    expect(ctx.repoMap.fileRecomputeCount).toBe(recomputeBefore + 1)
  })

  it('[negative control] the token-meter budget gate — real implementation stays under budget', async () => {
    const { ctx, agent } = await bootFixture()
    const direct = directMessage('hello')
    const decision = await preStep(ctx, agent, direct)
    if (decision.kind !== 'enter') throw new Error('expected admitted repo map')
    const repoMapMessage = decision.messages[1]!
    const tokens = ctx.tokenMeter.estimateMessage(repoMapMessage)
    // This is the assertion a broken/removed token-meter shrink loop fails:
    // see the executor's report for the paired "fails when weakened, passes
    // when real" run of this exact test.
    expect(tokens).toBeLessThanOrEqual(110)
  })
})
