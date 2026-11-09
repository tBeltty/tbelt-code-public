/**
 * The session goal: the lines that show it and the actions its phase allows.
 * @module @deepseek-ai/dsh-terminal-views/goal
 */
import { t } from './copy.ts'
import type { Style } from './ansi.ts'
import type { PickerItem } from './picker.ts'

/** The goal as the Host reports it. */
export interface GoalRow {
  readonly objective: string
  readonly phase: 'active' | 'paused' | 'blocked' | 'complete'
  readonly blockedReason?: { readonly message: string } | undefined
  readonly maxGoalRounds: number
  readonly roundsStarted: number
  readonly activation: 'armed' | 'disarmed'
}

/** What a person can do with the goal. */
export type GoalAction = 'edit' | 'pause' | 'resume' | 'complete' | 'clear'

/**
 * The goal in words.
 * @param style - text styles.
 * @param goal - the current goal.
 * @returns lines to print: the objective, then the phase with rounds used.
 */
export function goalLines(style: Style, goal: GoalRow): string[] {
  const phase = t(`goal.phase.${goal.phase}`)
  const rounds = t('goal.rounds', { started: goal.roundsStarted, max: goal.maxGoalRounds })
  return [
    style.bold(goal.objective),
    style.dim(`${phase} · ${rounds}${goal.activation === 'disarmed' ? ` · ${t('goal.disarmed')}` : ''}`),
    ...goal.blockedReason === undefined ? [] : [style.yellow(goal.blockedReason.message)],
  ]
}

/**
 * The actions open for a goal.
 * @param goal - the current goal.
 * @returns edit and clear always; pause while active; resume while paused or blocked; complete until it is complete.
 */
export function goalActions(goal: GoalRow): PickerItem[] {
  const actions: GoalAction[] = [
    'edit',
    ...goal.phase === 'active' ? ['pause' as const] : [],
    ...goal.phase === 'paused' || goal.phase === 'blocked' ? ['resume' as const] : [],
    ...goal.phase === 'complete' ? [] : ['complete' as const],
    'clear',
  ]
  return actions.map(action => ({ value: action, label: t(`goal.action.${action}`) }))
}
