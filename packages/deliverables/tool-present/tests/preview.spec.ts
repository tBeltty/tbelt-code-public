/** preview accepts existing files and loopback URLs and names the target in its result. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { unsupportedInbox, unsupportedModel, provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import * as Present from '../src/index.ts'

const cleanups: Array<() => Promise<unknown>> = []
let callNumber = 0
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
})

async function agent(ctx: Context, cwd: string | undefined): Promise<Agent> {
  const id = SessionId(`preview-owner-${++callNumber}`)
  let scope: Scope
  const session = Session.create(id, [], {
    version: SESSION_FORMAT_VERSION, id, createdAt: 0, ...cwd === undefined ? {} : { cwd }, isSeeded: false,
  })
  const value: Agent = {
    id,
    options: {},
    session,
    inbox: unsupportedInbox(),
    model: unsupportedModel(),
    status: 'idle',
    get ctx() { return scope.ctx },
    send: () => {},
    followup: () => {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }),
    inject: () => {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, value) }, { inject: ['tools'] }))
  await ctx.agents.register(value)
  return value
}

async function setup(preview = true) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-preview-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context()
  provideWorkingDirectoryFixture(ctx)
  cleanups.push(() => ctx.fiber.dispose())
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  const fiber = ctx.plugin(Present, { maxFiles: 2, preview })
  await fiber
  const owner = await agent(ctx, root)
  const execute = (target: string, caller: Agent | null = owner) => executeToolFixture(ctx, {
    signal: new AbortController().signal, callId: ToolCallId(`call-${++callNumber}`),
    name: 'preview', arguments: { target }, ...caller === null ? {} : { agent: caller },
  })
  return { ctx, owner, root, fiber, execute }
}

function text(result: ToolExecutionResult): string {
  return result.content.map(item => item.type === 'text' ? item.text : '').join('')
}

it('shows an existing file and names it in the result', async () => {
  const { root, execute, fiber, ctx, owner } = await setup()
  await writeFile(join(root, 'index.html'), '<h1>hi</h1>')
  const result = await execute(' index.html ')
  expect(result.isError).toBe(false)
  expect(result.isError ? undefined : result.value).toEqual({ path: 'index.html' })
  expect(text(result)).toBe('Showing index.html in the preview panel')
  await fiber.dispose()
  expect(ctx.tools.get('preview', owner)).toBeUndefined()
})

it.each([
  ['http://localhost:5173', 'http://localhost:5173/'],
  ['https://127.0.0.1:8443/app?x=1', 'https://127.0.0.1:8443/app?x=1'],
  ['HTTP://[::1]:3000/', 'http://[::1]:3000/'],
  ['http://web.localhost:3000/', 'http://web.localhost:3000/'],
])('shows the loopback server %s', async (target, url) => {
  const { execute } = await setup()
  const result = await execute(target)
  expect(result.isError ? undefined : result.value).toEqual({ url })
  expect(text(result)).toBe(`Showing ${url} in the preview panel`)
})

it.each([
  ['', 'requires a file path or a localhost URL'],
  ['http://', 'not a valid URL'],
  ['http://user:secret@localhost:3000/', 'credentials'],
  ['https://example.com/', 'only local servers'],
  ['missing.html', 'file not found'],
  ['site', 'not a regular file'],
])('rejects %j', async (target, message) => {
  const { root, execute } = await setup()
  await mkdir(join(root, 'site'))
  const result = await execute(target)
  expect(result.isError).toBe(true)
  expect(text(result)).toContain(message)
})

it('requires a workspace for file paths but not for URLs', async () => {
  const { ctx, execute } = await setup()
  const noWorkspace = await agent(ctx, undefined)
  expect(text(await execute('index.html', noWorkspace))).toContain('requires a workspace')
  expect(text(await execute('index.html', null))).toContain('requires a workspace')
  expect((await execute('http://localhost:1/', noWorkspace)).isError).toBe(false)
})

it('registers no preview tool when disabled', async () => {
  const { ctx, owner } = await setup(false)
  expect(ctx.tools.get('preview', owner)).toBeUndefined()
  expect(ctx.tools.get('present', owner)).toBeDefined()
})
