/** Shared fixtures: temporary git repositories and a mounted worktree service. */
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import WorktreeService from '@deepseek-ai/dsh-worktree'
import type { Config } from '@deepseek-ai/dsh-worktree'

/** Run git synchronously inside a fixture repository. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/** A temporary directory removed by the returned cleanup. */
export async function scratchDir(prefix: string, cleanups: Array<() => Promise<unknown>>): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

/** Write a file, creating its directory. */
export async function put(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

/** A repository on branch `main` with one commit, inside a scratch parent whose siblings receive worktrees. */
export async function makeRepo(cleanups: Array<() => Promise<unknown>>): Promise<{ parent: string; repo: string }> {
  const parent = await scratchDir('dsh-worktree-', cleanups)
  const repo = join(parent, 'app')
  await mkdir(repo)
  git(repo, 'init', '-q', '-b', 'main')
  await put(join(repo, 'README.md'), 'hello\n')
  await put(join(repo, '.gitignore'), '.env\n.env.local\nnode_modules\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'initial')
  return { parent, repo }
}

/** Mount the worktree service over the local subprocess runtime. */
export async function mount(config: Partial<Config>, cleanups: Array<() => Promise<unknown>>): Promise<Context> {
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(WorktreeService, config as Config)
  return ctx
}
