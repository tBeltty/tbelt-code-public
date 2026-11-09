import { describe, expect, it, vi } from 'vitest'
import type { PanelName } from '@deepseek-ai/dsh-terminal-views'
import { runPanel } from '../../src/panels/index.ts'
import { fakePanelContext, scriptedUi } from '../fakes.ts'

const { runners } = vi.hoisted(() => ({ runners: new Map<string, ReturnType<typeof vi.fn>>() }))

/** A module whose `runX` export records that it was called. */
function stub(name: string): Record<string, ReturnType<typeof vi.fn>> {
  const run = vi.fn(() => Promise.resolve())
  runners.set(name, run)
  return { [`run${name[0]!.toUpperCase()}${name.slice(1)}`]: run }
}

vi.mock('../../src/panels/queue.ts', () => stub('queue'))
vi.mock('../../src/panels/skills.ts', () => stub('skills'))
vi.mock('../../src/panels/subagents.ts', () => stub('subagents'))
vi.mock('../../src/panels/jobs.ts', () => stub('jobs'))
vi.mock('../../src/panels/schedule.ts', () => stub('schedule'))
vi.mock('../../src/panels/goal.ts', () => stub('goal'))
vi.mock('../../src/panels/deliverables.ts', () => stub('deliverables'))
vi.mock('../../src/panels/trajectory.ts', () => stub('trajectory'))
vi.mock('../../src/panels/feedback.ts', () => stub('feedback'))
vi.mock('../../src/panels/fork.ts', () => stub('fork'))
vi.mock('../../src/panels/organize.ts', () => stub('organize'))
vi.mock('../../src/panels/status.ts', () => stub('status'))
vi.mock('../../src/panels/workspaces.ts', () => stub('workspaces'))
vi.mock('../../src/panels/worktrees.ts', () => stub('worktrees'))
vi.mock('../../src/panels/open.ts', () => stub('open'))
vi.mock('../../src/panels/budget.ts', () => stub('budget'))
vi.mock('../../src/panels/plan.ts', () => stub('plan'))
vi.mock('../../src/panels/commands.ts', () => stub('commands'))

const PANELS: PanelName[] = [
  'queue', 'skills', 'subagents', 'jobs', 'schedule', 'goal', 'deliverables', 'trajectory', 'feedback',
  'fork', 'organize', 'status', 'workspaces', 'worktrees', 'open', 'budget', 'plan', 'commands',
]

describe('runPanel', () => {
  it.each(PANELS)('runs the %s panel and no other', async (panel) => {
    const ctx = fakePanelContext()
    const { ui } = scriptedUi([])
    await runPanel(panel, 'src', ctx, ui)
    for (const [name, run] of runners) {
      if (name === panel) expect(run).toHaveBeenCalled()
      else expect(run).not.toHaveBeenCalled()
      run.mockClear()
    }
  })

  it('hands the typed argument to /open only', async () => {
    const ctx = fakePanelContext()
    const { ui } = scriptedUi([])
    await runPanel('open', 'src/app', ctx, ui)
    expect(runners.get('open')).toHaveBeenCalledWith('src/app', ctx, ui)
  })
})
