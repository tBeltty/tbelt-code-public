/** Git command bounds, executable resolution, and helper commands. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { Git, GitCommandError, resolveGit } from '../src/git.ts'
import { runCollected } from '../src/run-command.ts'
import { scratchDir } from './support.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
})

const signal = new AbortController().signal

async function runtime(): Promise<SubprocessRuntime> {
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  await ctx.plugin(LocalSubprocessRuntime)
  return ctx.subprocess
}

describe('Git', () => {
  it('runs a command and reports a nonzero exit as a result, or as GitCommandError through must', async () => {
    const cwd = await scratchDir('dsh-git-', cleanups)
    const git = new Git(await runtime(), 'git', { timeoutMs: 30_000, outputMaxBytes: 1024 * 1024 })
    const version = await git.run(['--version'], cwd, signal)
    expect(version.exitCode).toBe(0)
    expect(version.stdout).toContain('git version')
    const failed = await git.run(['rev-parse', '--git-dir'], cwd, signal)
    expect(failed.exitCode).not.toBe(0)
    const error = await git.must(['rev-parse', '--git-dir'], cwd, signal).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(GitCommandError)
    expect((error as GitCommandError).message).toContain('git rev-parse --git-dir failed')
    expect(await git.must(['--version'], cwd, signal)).toContain('git version')
  })

  it('reports timeouts and external aborts as failures', async () => {
    const cwd = await scratchDir('dsh-git-', cleanups)
    const slow = new Git(await runtime(), 'git', { timeoutMs: 1, outputMaxBytes: 1024 })
    await expect(slow.run(['--version'], cwd, signal)).rejects.toThrow('timed out after 1ms')
    const quick = new Git(await runtime(), 'git', { timeoutMs: 30_000, outputMaxBytes: 1024 })
    const aborted = new AbortController()
    setTimeout(() => { aborted.abort() }, 0)
    await expect(quick.run(['--version'], cwd, aborted.signal)).rejects.toThrow('git --version was aborted')
  })
})

/** A subprocess double whose `resolveExecutable` and probe results are scripted. */
function scripted(resolved: string | Error, probe: { exitCode: number | null } | Error = { exitCode: 0 }): SubprocessRuntime {
  return {
    resolveExecutable: () => (resolved instanceof Error ? Promise.reject(resolved) : Promise.resolve(resolved)),
    spawn: () => ({ done: probe instanceof Error ? Promise.reject(probe) : Promise.resolve(probe) }),
  } as unknown as SubprocessRuntime
}

describe('resolveGit', () => {
  it('returns the executable, or null when none is on the path', async () => {
    expect(await resolveGit(scripted('/usr/local/bin/git'), signal)).toBe('/usr/local/bin/git')
    expect(await resolveGit(scripted(new Error('not found')), signal)).toBeNull()
  })

  it('treats the macOS developer-tools stub as absent until xcode-select reports a path', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    expect(await resolveGit(scripted('/usr/bin/git', { exitCode: 0 }), signal)).toBe('/usr/bin/git')
    expect(await resolveGit(scripted('/usr/bin/git', { exitCode: 2 }), signal)).toBeNull()
    expect(await resolveGit(scripted('/usr/bin/git', new Error('spawn failed')), signal)).toBeNull()
    expect(await resolveGit(scripted('/opt/homebrew/bin/git', { exitCode: 2 }), signal)).toBe('/opt/homebrew/bin/git')
  })
})

describe('runCollected', () => {
  it('returns stdout and rejects with the stderr of a failing command', async () => {
    const subprocess = await runtime()
    expect((await runCollected(subprocess, [process.execPath, '-e', "process.stdout.write('out')"], signal)).stdout).toBe('out')
    await expect(runCollected(subprocess, [process.execPath, '-e', "console.error('bad'); process.exit(4)"], signal)).rejects.toThrow('exited 4: bad')
  })
})
