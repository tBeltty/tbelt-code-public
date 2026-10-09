/**
 * Terminal views: the pure functions that draw the terminal client. They take
 * Session events and shared presenter models and return text; they perform no
 * I/O and hold no Cordis service.
 * @module @deepseek-ai/dsh-terminal-views
 */
export { createStyle, stripAnsi, supportsColor } from './ansi.ts'
export type { Style } from './ansi.ts'
export type { ActiveAtToken } from '@deepseek-ai/dsh-file-reference/grammar'
export { approvalKeyChoice, approvalPromptLines } from './approval.ts'
export {
  completeToken, composerWithHistory, EMPTY_COMPOSER, reduceComposer, renderComposer,
} from './composer.ts'
export type {
  ComposerEffect, ComposerFrame, ComposerRenderOptions, ComposerState, ComposerStep,
} from './composer.ts'
export { copyKey, t } from './copy.ts'
export type { CopyKey, CopyParams } from './copy.ts'
export { helpLines } from './help.ts'
export { hostTitle, ORCA_TITLE_MARKER, titleSequence, WORKING_FRAMES } from './host-title.ts'
export type { HostActivity, HostTitleFacts } from './host-title.ts'
export { pastedPath, resolveTypedPath } from './directory-input.ts'
export type { TypedPathFacts } from './directory-input.ts'
export {
  attachedImageName, detectImageProtocol, imageMarker, renderImage, sniffImageType,
} from './images.ts'
export type { ImageFacts, ImageProtocol, ImageSetting } from './images.ts'
export { modelItems, parseModelValue } from './model.ts'
export type { ModelCatalogChoice } from './model.ts'
export { classifyInput } from './input.ts'
export type { ConfigScreenName, PanelName, SubmittedInput } from './input.ts'
export {
  BRACKETED_PASTE_OFF, BRACKETED_PASTE_ON, decodeKeys, PASTE_END, PASTE_START,
} from './keys.ts'
export type { Key, KeyName } from './keys.ts'
export { keyProblemText } from './credentials.ts'
export { permissionItems } from './permission.ts'
export type { PermissionRow } from './permission.ts'
export { bundleItems, PLUGIN_INSTALL, PLUGIN_SINGLE, pluginItems } from './plugins.ts'
export type { BundleRow, PluginRow } from './plugins.ts'
export { presetItems } from './presets.ts'
export type { PresetRow } from './presets.ts'
export { CUSTOM_PROVIDER, providerItems } from './providers.ts'
export type { ProviderListRow } from './providers.ts'
export {
  namespaceItems, SETTINGS_DOCUMENT, settingItems, shownValue, WEB_SEARCH_AUTOMATIC, webSearchItems,
} from './settings.ts'
export type { SettingRow, WebSearchRow } from './settings.ts'
export { createMultiPicker, createPicker, PICKER_DONE, PICKER_ROWS, reducePicker, renderPicker, visibleItems } from './picker.ts'
export type { PickerChecks, PickerEffect, PickerItem, PickerState, PickerStep } from './picker.ts'
export {
  answerLine, questionLines, QUESTION_OTHER, reduceQuestions, renderQuestions, startQuestions,
} from './question.ts'
export type {
  QuestionAnswerFacts, QuestionEffect, QuestionFacts, QuestionFlow, QuestionOptionFacts, QuestionStepResult,
} from './question.ts'
export { queueItems, queueRows, queueStatusLine } from './queue.ts'
export type { QueueRow } from './queue.ts'
export { attachedFileName } from './attachments.ts'
export { budgetLines } from './budget.ts'
export type { SpendScope, SpendSummary } from './budget.ts'
export { commandItems } from './commands.ts'
export type { CommandRow } from './commands.ts'
export {
  changedSummaryLine, DeliverablesTracker, deliverableLines, mutationPath, presentedLines, turnDeliverables,
} from './deliverables.ts'
export type { PresentedPath, TurnDeliverables } from './deliverables.ts'
export { lastReply, ratingItems } from './feedback.ts'
export type { Rating, RatedReply } from './feedback.ts'
export { goalActions, goalLines } from './goal.ts'
export type { GoalAction, GoalRow } from './goal.ts'
export { jobIsLive, jobItems, jobOutputLines } from './jobs.ts'
export type { JobOutput, JobRow } from './jobs.ts'
export { durationText, numberField, oneLine, recordOf, relativeText, stringField } from './lines.ts'
export { applicationItems, OPEN_REVEAL } from './open.ts'
export type { ApplicationRow } from './open.ts'
export { latestPlan, planLines } from './plan.ts'
export { referenceFor, referenceItems } from './references.ts'
export type { FileCandidate, Reference, SessionCandidate } from './references.ts'
export { deliveryLines, parseTiming, scheduleItems, timingText } from './schedule.ts'
export type { ScheduleDelivery, ScheduleRow, TimingChange, TimingKind, TimingResult } from './schedule.ts'
export { skillItems, skillMessage } from './skills.ts'
export type { SkillRow } from './skills.ts'
export { subagentItems, subagentRows } from './subagent.ts'
export type { SubagentMode, SubagentRow } from './subagent.ts'
export { FORK_END, forkItems, ledgerLines, outlineRows, statsRow, trajectoryHeader, trajectoryItems, turnSlices } from './trajectory.ts'
export type { SessionStatsRow, TurnOutlineRow } from './trajectory.ts'
export { isWorkflowEvent, WorkflowRunLines } from './workflow-run.ts'
export { organizeItems, workspaceItems } from './workspace.ts'
export type { OrganizeAction, WorkspaceRow } from './workspace.ts'
export { WORKTREE_CREATE, worktreeItems, worktreeLines } from './worktrees.ts'
export type { WorktreeRow } from './worktrees.ts'
export { createPrompt, reducePrompt, renderPrompt } from './prompt.ts'
export type { PromptEffect, PromptOptions, PromptState, PromptStep } from './prompt.ts'
export { Screen } from './screen.ts'
export type { ScreenSink } from './screen.ts'
export { chooseSession } from './session-open.ts'
export { ageText, sessionItems } from './session-picker.ts'
export type { SessionChoice, SessionChoiceContext } from './session-picker.ts'
export type { OpenCandidate, OpenChoice, OpenRequest } from './session-open.ts'
export { bannerLines, farewellLine, SHORT_ID_LENGTH, shortSessionId, statusLines, workingLine } from './status.ts'
export type { BannerFacts, StatusFacts } from './status.ts'
export { sanitizeOutput, toolCallLine, toolResultLines } from './tool-lines.ts'
export type { ToolViewContext } from './tool-lines.ts'
export { TranscriptRenderer } from './transcript.ts'
export type { LiveChunkEvent, TranscriptEvent, TranscriptOptions } from './transcript.ts'
export { graphemes, textWidth, truncate, wrapRows } from './width.ts'
