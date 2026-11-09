/**
 * Approval presenter: the plain-language prompt, its decisions and the
 * session-scoped grants, shared by the GUI and the terminal client.
 * @module @deepseek-ai/dsh-presentation-approval
 */
export { approvalModel, approvalOutcome, approvalScopeKey } from './approval-model.ts'
export type {
  ApprovalChoice, ApprovalChoiceKey, ApprovalChoiceModel, ApprovalChoiceRole, ApprovalModel,
  ApprovalNeedKey, ApprovalRequestFacts,
} from './approval-model.ts'
export { ApprovalGrants } from './grants.ts'
