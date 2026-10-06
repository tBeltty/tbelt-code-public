/** A Session whose cwd is a linked git worktree records and compares its turn's changes like one in a primary checkout. */
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import * as WorkspaceChanges from '../src/index.ts'
import { changes, endTurn, git, mutate, scratchDir, settle, startTurn, toolCall } from './support.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
})

const signal = new AbortController().signal

/** A repository on `main` with one commit and a linked worktree on branch `feature` beside it. */
async function repositoryWithWorktree(): Promise<{ primary: string; linked: string }> {
  const parent = await realpath(await scratchDir('dsh-workspace-changes-worktree-', cleanups))
  const primary = join(parent, 'app')
  await mkdir(primary)
  git(primary, 'init', '-q', '-b', 'main')
  await writeFile(join(primary, 'a.txt'), 'l1\nl2\n')
  await writeFile(join(primary, '.gitignore'), '.env\n')
  git(primary, 'add', '-A')
  git(primary, 'commit', '-q', '-m', 'init')
  const linked = join(parent, 'app-worktrees', 'feature')
  git(primary, 'worktree', 'add', '-q', '-b', 'feature', linked)
  return { primary, linked }
}

describe('workspace-changes in a linked worktree', () => {
  it('records the turn from the worktree and leaves the primary checkout and its object store alone', async () => {
    const { primary, linked } = await repositoryWithWorktree()
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    await ctx.plugin(SessionStore)
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(WorkspaceChanges, {} as WorkspaceChanges.Config)
    const primaryObjects = Number(git(primary, 'count-objects').split(' ')[0])
    const session = ctx.sessions.create(SessionId('worktree'), { meta: { cwd: linked } })
    startTurn(session, 1)
    await settle(ctx, session)

    await mutate(ctx, session, 1, 'edit', { file_path: 'a.txt', old_string: 'l2', new_string: 'l2 model' },
      () => writeFile(join(linked, 'a.txt'), 'l1\nl2 model\n'))
    await writeFile(join(linked, 'new.txt'), 'n1\n')
    toolCall(session, 1, 'bash', { command: 'printf > new.txt' })
    await mutate(ctx, session, 1, 'write', { file_path: '.env', content: 'A=1\n' }, () => writeFile(join(linked, '.env'), 'A=1\n'))
    endTurn(session, 1)
    await settle(ctx, session)

    const [recorded, ...rest] = changes(ctx, session)
    expect(rest).toEqual([])
    expect(recorded).toMatchObject({ turn: 1, cwd: linked, total: 3, added: 3, deleted: 1 })
    expect(recorded!.files.map(file => file.display)).toEqual(['.env', 'a.txt', 'new.txt'])
    const seq = session.snapshotEvents().filter(event => event.type === 'workspace/changes').at(-1)!.seq
    expect(await ctx.workspaceChanges.diff(session.id, seq, 1, signal)).toMatchObject({
      kind: 'text', path: 'a.txt', before: true, after: true, hunks: [{ lines: [' l1', '-l2', '+l2 model'] }],
    })
    expect(await ctx.workspaceChanges.diff(session.id, seq, 2, signal)).toMatchObject({ kind: 'text', path: 'new.txt', before: false, after: true })

    // The turn's edits are the worktree's own; its index and the primary checkout stay as git left them.
    expect(git(linked, 'status', '--porcelain').split('\n').filter(Boolean)).toEqual([' M a.txt', '?? new.txt'])
    expect(git(primary, 'status', '--porcelain')).toBe('')
    expect(Number(git(primary, 'count-objects').split(' ')[0])).toBe(primaryObjects)
  })
})
