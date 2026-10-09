/**
 * Tool call blocks and the pure row model every client derives its tool lines from.
 * @module @deepseek-ai/dsh-presentation-tool-call
 */
export type {
  PreparingToolCall, RunningToolCall, StartedToolCall, ToolCallBlock, ToolResultNode,
} from './blocks.ts'
export { parsedToolCall, singleResultText, validEscalationFields } from './raw-tool-call.ts'
export type { ParsedToolCall } from './raw-tool-call.ts'
export {
  VARIANT_TITLE_KEYS, classifyTool, formatToolBody, resultText, toolRowModel, toolTitleKey,
} from './tool-row.ts'
export type {
  AutoReviewDenial, ToolRowModel, ToolRowState, ToolRowVariant, ToolTitleKey,
} from './tool-row.ts'
