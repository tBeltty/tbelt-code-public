/**
 * Pure per-tool card models: shell, diff, read and search data derived from
 * recorded tool calls, shared by the GUI and the terminal client.
 * @module @deepseek-ai/dsh-presentation-tool-card
 */
export { diffHunks, diffSummary, diffSummaryParts, diffTotals } from './diff-lines.ts'
export type { DiffHunk, DiffSummary, DiffSummaryPart, DiffTotals } from './diff-lines.ts'
export { diffCardModel } from './diff-card.ts'
export type { DiffCardModel } from './diff-card.ts'
export { readCallLine, readCardModel } from './read-card.ts'
export type { ReadCardLine, ReadCardModel } from './read-card.ts'
export { searchCardModel } from './search-card.ts'
export type { SearchCardData, SearchCardMatch, SearchCardModel, SearchFileGroup } from './search-card.ts'
export { isSettledPersistentShellCall, isSpilledShellCall, terminalCardModel, terminalFailed } from './terminal-card.ts'
export type { TerminalCardModel } from './terminal-card.ts'
