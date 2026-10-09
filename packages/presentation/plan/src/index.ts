/**
 * Plan presenters: plan documents recovered from logged `exit_plan_mode` calls
 * and the progress line of a todo list, shared by the GUI and the terminal client.
 * @module @deepseek-ai/dsh-presentation-plan
 */
export { loggedPlan, submittedPlan } from './plan-document.ts'
export type { LoggedPlan, PlanDocument, PlanVersion, SubmittedPlan } from './plan-document.ts'
export { todoProgress } from './todo-progress.ts'
export type { TodoItemLike, TodoProgress } from './todo-progress.ts'
