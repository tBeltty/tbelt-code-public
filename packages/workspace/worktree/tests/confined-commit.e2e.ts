import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { SandboxPolicy } from '@deepseek-ai/dsh-sandbox'
import { LocalSandboxProvider } from '@deepseek-ai/dsh-sandbox-local'
import { linkedWorktreeWritableRoots } from '../src/git-dirs.ts'

/**
 * Real confinement of `git commit` inside a linked worktree: the roots derived from the checkout
 * must be exactly enough to commit, while the primary checkout and the repository's hooks and
 * config stay read-only. HOME-based directories avoid bwrap's ephemeral `/tmp`. Skips when no
 * confining backend is usable.
 */

let ctx: Context | undefined
const tempDirs: string[] = []
afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

async function confinedRun(command: string, policy: SandboxPolicy) {
  const sandbox = ctx?.sandbox as LocalSandboxProvider
  const confined = await sandbox.confine(['bash', '-c', command], policy)
  return spawnSync(confined.argv[0] as string, confined.argv.slice(1), { timeout: 30_000, encoding: 'utf8' })
}

async function setup(): Promise<{ repo: string; worktree: string } | undefined> {
  ctx = new Context()
  await ctx.plugin(LocalSandboxProvider, {})
  const root = await mkdtemp(join(homedir(), 'dsh-worktree-e2e-'))
  tempDirs.push(root)
  const repo = join(root, 'app')
  await mkdir(repo)
  git(repo, 'init', '-q', '-b', 'main')
  await writeFile(join(repo, 'README.md'), 'hello\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'initial')
  const worktree = join(root, 'wt')
  git(repo, 'worktree', 'add', '-q', '-b', 'topic', worktree)
  const probe = await confinedRun('true', { mode: 'workspace-write', workspaceRoot: worktree }).catch(() => undefined)
  return probe?.status === 0 ? { repo, worktree } : undefined
}

describe('confined git in a linked worktree', () => {
  it('commits with the derived roots, and cannot write hooks, config, or the primary checkout', async ({ skip }) => {
    const fixture = await setup()
    if (fixture === undefined) return skip()
    const { repo, worktree } = fixture
    const policy: SandboxPolicy = { mode: 'workspace-write', workspaceRoot: worktree, extraWritableRoots: linkedWorktreeWritableRoots(worktree) }
    const without = await confinedRun('echo a > a.txt && git add -A && git -c user.email=t@e -c user.name=t -c commit.gpgsign=false commit -q -m nope', { ...policy, extraWritableRoots: [] })
    expect(without.status).not.toBe(0)
    const commit = await confinedRun(`cd ${worktree} && echo b > b.txt && git add -A && git -c user.email=t@e -c user.name=t -c commit.gpgsign=false commit -q -m confined`, policy)
    expect(commit.stderr).toBe('')
    expect(commit.status).toBe(0)
    expect(git(worktree, 'log', '-1', '--format=%s').trim()).toBe('confined')
    const hook = await confinedRun(`echo x > ${join(repo, '.git', 'hooks', 'pre-commit')}`, policy)
    const config = await confinedRun(`echo x >> ${join(repo, '.git', 'config')}`, policy)
    const primary = await confinedRun(`echo x >> ${join(repo, 'README.md')}`, policy)
    expect([hook.status, config.status, primary.status].every(status => status !== 0)).toBe(true)
    expect(existsSync(join(repo, '.git', 'hooks', 'pre-commit'))).toBe(false)
  })
})
