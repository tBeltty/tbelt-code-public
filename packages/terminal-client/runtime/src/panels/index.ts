/**
 * The panels of the terminal: views and actions over the session's queue,
 * files, work in progress and workspace. Each is a flow over the Remote
 * namespaces and client services the GUI pages use, run in place of the
 * composer like the configuration screens.
 * @module @deepseek-ai/dsh-terminal-client/panels
 */
import type { PanelName } from '@deepseek-ai/dsh-terminal-views'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { FlowUi } from '../config/ui.ts'
import { runBudget } from './budget.ts'
import { runCommands } from './commands.ts'
import type { PanelContext } from './context.ts'
import { runDeliverables } from './deliverables.ts'
import { runFeedback } from './feedback.ts'
import { runFork } from './fork.ts'
import { runGoal } from './goal.ts'
import { runJobs } from './jobs.ts'
import { runOpen } from './open.ts'
import { runOrganize } from './organize.ts'
import { runPlan } from './plan.ts'
import { runQueue } from './queue.ts'
import { runSchedule } from './schedule.ts'
import { runSkills } from './skills.ts'
import { runStatus } from './status.ts'
import { runSubagents } from './subagents.ts'
import { runTrajectory } from './trajectory.ts'
import { runWorkspaces } from './workspaces.ts'
import { runWorktrees } from './worktrees.ts'

export type { PanelContext, PanelServices, PanelSession, SwitchTarget } from './context.ts'

/**
 * Run one panel.
 * @param panel - which panel to open.
 * @param argument - the text after the command name; only `/open` reads it.
 * @param ctx - the session and the Remote namespaces.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export function runPanel(panel: PanelName, argument: string, ctx: PanelContext, ui: FlowUi): Promise<void> {
  switch (panel) {
    case 'queue': return runQueue(ctx, ui)
    case 'skills': return runSkills(ctx, ui)
    case 'subagents': return runSubagents(ctx, ui)
    case 'jobs': return runJobs(ctx, ui)
    case 'schedule': return runSchedule(ctx, ui)
    case 'goal': return runGoal(ctx, ui)
    case 'deliverables': return runDeliverables(ctx, ui)
    case 'trajectory': return runTrajectory(ctx, ui)
    case 'feedback': return runFeedback(ctx, ui)
    case 'fork': return runFork(ctx, ui)
    case 'organize': return runOrganize(ctx, ui)
    case 'status': return runStatus(ctx, ui)
    case 'workspaces': return runWorkspaces(ctx, ui)
    case 'worktrees': return runWorktrees(ctx, ui)
    case 'open': return runOpen(argument, ctx, ui)
    case 'budget': return runBudget(ctx, ui)
    case 'plan': return runPlan(ctx, ui)
    case 'commands': return runCommands(ctx, ui)
    /* v8 ignore next -- PanelName is closed and every name is handled above. */
    default: return assertNever(panel, 'PanelName')
  }
}
