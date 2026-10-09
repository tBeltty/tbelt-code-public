/**
 * Terminal views: the pure functions that draw the terminal client. They take
 * Session events and shared presenter models and return text; they perform no
 * I/O and hold no Cordis service.
 * @module @deepseek-ai/dsh-terminal-views
 */
export { createStyle, stripAnsi, supportsColor } from './ansi.ts'
export type { Style } from './ansi.ts'
export { approvalKeyChoice, approvalPromptLines } from './approval.ts'
export {
  composerWithHistory, EMPTY_COMPOSER, reduceComposer, renderComposer,
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
export type { ConfigScreenName, SubmittedInput } from './input.ts'
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
export { createPrompt, reducePrompt, renderPrompt } from './prompt.ts'
export type { PromptEffect, PromptOptions, PromptState, PromptStep } from './prompt.ts'
export { Screen } from './screen.ts'
export type { ScreenSink } from './screen.ts'
export { chooseSession } from './session-open.ts'
export { ageText, sessionItems } from './session-picker.ts'
export type { SessionChoice, SessionChoiceContext } from './session-picker.ts'
export type { OpenCandidate, OpenChoice, OpenRequest } from './session-open.ts'
export { bannerLines, farewellLine, SHORT_ID_LENGTH, shortSessionId, workingLine } from './status.ts'
export type { BannerFacts } from './status.ts'
export { sanitizeOutput, toolCallLine, toolResultLines } from './tool-lines.ts'
export type { ToolViewContext } from './tool-lines.ts'
export { TranscriptRenderer } from './transcript.ts'
export type { LiveChunkEvent, TranscriptEvent, TranscriptOptions } from './transcript.ts'
export { graphemes, textWidth, truncate, wrapRows } from './width.ts'
