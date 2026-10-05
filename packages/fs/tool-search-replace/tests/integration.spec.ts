import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as FsPolicy from '@deepseek-ai/dsh-fs-observation-policy'
import SandboxedFileSystem from '@deepseek-ai/dsh-fs-sandbox'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolSearchReplace from '@deepseek-ai/dsh-tool-search-replace'
import { unsupportedInbox } from '@deepseek-ai/dsh-agent-loop-testkit'

const contexts: Context[] = []
const roots: string[] = []
let callNumber = 0

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function agent(ctx: Context, cwd: string): Promise<Agent> {
  const id = SessionId(`search-replace-owner-${callNumber}`)
  const scope = ctx.plugin(() => {})
  const session = Session.create(id, [], {
    version: SESSION_FORMAT_VERSION, id, createdAt: 0, cwd, isSeeded: false,
  })
  const value: Agent = {
    id,
    options: {},
    session,
    inbox: unsupportedInbox(),
    status: 'idle',
    ctx: scope.ctx,
    send: () => {},
    followup: () => {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }),
    inject: () => {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  await ctx.agents.register(value)
  return value
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

function call(ctx: Context, owner: Agent | undefined, args: unknown) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId(`search-replace-${++callNumber}`),
    name: 'search_replace',
    arguments: args,
    ...owner === undefined ? {} : { agent: owner },
  })
}

function block(search: string, replace: string): string {
  return `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`
}

async function setup(
  options: { fsPolicy?: boolean; sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access' } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-tool-search-replace-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  if (options.sandboxMode === undefined) {
    await ctx.plugin(LocalFileSystem, { cwd: root })
  } else {
    // SandboxPolicy declares the registry as a required injection; mount it
    // before the policy activates.
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SandboxPolicy, { mode: options.sandboxMode, workspaceRoot: root })
    await ctx.plugin(SandboxedFileSystem, { cwd: root })
  }
  if (options.fsPolicy === true) await ctx.plugin(FsPolicy)
  const fiber = await ctx.plugin(ToolSearchReplace)
  return { ctx, root, fiber, owner: await agent(ctx, root) }
}

describe('tool-search-replace integration', () => {
  it('mutates the file on disk with no policy plugin mounted (unconditional default)', async () => {
    const { ctx, root, owner } = await setup()
    const sample = join(root, 'sample.txt')
    await writeFile(sample, 'one\ntwo\nthree\n')

    const result = await call(ctx, owner, {
      path: sample,
      diff: block('two', 'TWO'),
    })
    expect(result.isError).toBe(false)
    expect(text(result)).toBe('one\nTWO\nthree\n')
    // The assertion that matters: the write actually landed on disk, not
    // just in the in-memory result the tool returned.
    expect(await readFile(sample, 'utf8')).toBe('one\nTWO\nthree\n')
  })

  it('applies multiple blocks in sequence and reports fuzzy matches in the result text', async () => {
    const { ctx, root, owner } = await setup()
    const sample = join(root, 'multi.txt')
    // The tab between "foo" and "bar" means the space-separated SEARCH text
    // below has zero exact (substring) matches, only a whitespace-normalized
    // one — this exercises the fuzzy fallback, not the exact-match path.
    await writeFile(sample, 'alpha\nfoo\tbar\ngamma\n')

    const diff = [
      block('alpha', 'ALPHA'),
      block('foo bar', 'FOOBAR'),
    ].join('\n')
    const result = await call(ctx, owner, { path: sample, diff })
    expect(result.isError).toBe(false)
    expect(text(result)).toContain('matched only after whitespace/indentation normalization')
    expect(await readFile(sample, 'utf8')).toBe('ALPHA\nFOOBAR\ngamma\n')
  })

  it('requires a read-before-edit observation when fs-observation-policy is mounted', async () => {
    const { ctx, root, owner } = await setup({ fsPolicy: true })
    const sample = join(root, 'guarded.txt')
    await writeFile(sample, 'before\n')

    const blindEdit = await call(ctx, owner, {
      path: sample,
      diff: block('before', 'after'),
    })
    expect(blindEdit.error).toMatchObject({ info: { code: 'FS_NOT_OBSERVED' } })
    expect(await readFile(sample, 'utf8')).toBe('before\n')

    // Reading it first (any fs-mutating tool's observation counts, per
    // fs-observation-policy's owner/target map) allows the edit to proceed.
    const target = await ctx.fs.resolve(sample)
    const info = await ctx.fs.stat(target)
    if (info === undefined) throw new Error('expected the file to exist')
    ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, {
      agent: owner,
      signal: new AbortController().signal,
      callId: ToolCallId('observe-1'),
    })

    const guardedEdit = await call(ctx, owner, {
      path: sample,
      diff: block('before', 'after'),
    })
    expect(guardedEdit.isError).toBe(false)
    expect(await readFile(sample, 'utf8')).toBe('after\n')
  })

  it('reports the sandbox-denial marker text rather than an uncaught exception', async () => {
    const { ctx, root, owner } = await setup({ sandboxMode: 'read-only' })
    const sample = join(root, 'blocked.txt')
    await writeFile(sample, 'before\n')

    const result = await call(ctx, owner, {
      path: sample,
      diff: block('before', 'after'),
    })
    expect(result.error).toMatchObject({ info: { code: 'FS_SANDBOX_DENIED' } })
    expect(text(result)).toContain('[sandbox: file access denied under read-only mode]')
    expect(await readFile(sample, 'utf8')).toBe('before\n')
  })

  it('rejects relative paths, missing files, and directories without mutating anything', async () => {
    const { ctx, root, owner } = await setup()
    const missing = join(root, 'missing.txt')

    const relative = await call(ctx, owner, { path: 'relative.txt', diff: block('a', 'b') })
    expect(relative.isError).toBe(true)
    expect(text(relative)).toContain('is not an absolute path')

    const notFound = await call(ctx, owner, { path: missing, diff: block('a', 'b') })
    expect(notFound.error).toMatchObject({ info: { code: 'FS_NOT_FOUND' } })
  })

  it('maps unexpected backend write failures through the tool result', async () => {
    const { ctx, root, owner } = await setup()
    const sample = join(root, 'backend-error.txt')
    await writeFile(sample, 'old\n')
    ctx.fs.writeText = async (): Promise<never> => {
      throw new Error('backend write failed')
    }

    const result = await call(ctx, owner, { path: sample, diff: block('old', 'new') })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('backend write failed')
    expect(await readFile(sample, 'utf8')).toBe('old\n')
  })
})
