/**
 * Pre-copy size admission for worktree copies. Adapted from Orca's
 * `worktree-include-copy-budget.ts` (MIT, see `LICENSES/Orca-MIT.txt`).
 * @module @deepseek-ai/dsh-worktree/copy-budget
 */

import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Ceiling on what one worktree creation may copy, measured before any byte is written; both limits are cumulative across the run. */
export interface CopyBudget {
  /** Total bytes the copies may hold. */
  maxBytes: number
  /** Total files and directories the copies may hold. */
  maxEntries: number
}

/**
 * The sizing walk gets headroom over the copy budget so one refused
 * dependency tree cannot starve the small entries listed after it: it burns
 * `maxEntries + 1` measuring, and without headroom nothing else would be sized.
 */
const SIZING_HEADROOM = 5

/** Why an entry was refused. `sizing` is not the entry's fault: earlier entries used up the total sizing walk. */
export type CopyBudgetExceededReason = 'bytes' | 'entries' | 'sizing'

/** The budget decision for one source: its measured size, or the limit it crossed. */
export type CopySizeVerdict =
  | { withinBudget: true; bytes: number; entries: number }
  | { withinBudget: false; reason: CopyBudgetExceededReason }

/** A configured copy path the budget refused. */
export interface SkippedCopyPath {
  /** Repository-relative path as configured. */
  path: string
  /** The limit that refused it. */
  reason: CopyBudgetExceededReason
  /** The copy was abandoned after it started, so leftovers may remain. */
  mayBePartial?: boolean
}

/** Options for {@link CopyBudgetTracker.admit}. */
export interface CopyAdmitOptions {
  /** False when the backend clones copy-on-write, where bytes cost nothing and only the entry count is real work. */
  bytesAreCopied?: boolean
}

/** Cumulative admission state for one worktree creation. */
export interface CopyBudgetTracker {
  /**
   * Measure `source` against what is left of the budget. A within-budget
   * verdict consumes the measured size, an over-budget verdict consumes
   * nothing, so later and smaller entries still get their chance. Await each
   * call before the next: the pool is read before the walk and written after.
   * @param source - file or directory about to be copied.
   * @param options - whether the copy will cost bytes.
   * @returns the verdict for this entry.
   */
  admit: (source: string, options?: CopyAdmitOptions) => Promise<CopySizeVerdict>
  /**
   * Bill bytes that were measured but not charged because a copy-on-write
   * clone was expected and then failed.
   * @param bytes - the measured size of the entry.
   * @returns false when the bytes no longer fit, in which case the caller must not copy.
   */
  chargeBytes: (bytes: number) => boolean
}

/** A measurement plus the entries it walked, which the tracker charges so refused entries cannot re-walk without bound. */
interface MeasuredCopySize {
  verdict: CopySizeVerdict
  walked: number
}

/** Walk `source` until it is measured or a ceiling is crossed; symlinks count as one entry and are not followed. */
async function measureCopySize(
  source: string,
  remainingBytes: number,
  remainingEntries: number,
  remainingWalk: number,
): Promise<MeasuredCopySize> {
  let bytes = 0
  let entries = 0
  const pending: string[] = [source]
  while (pending.length > 0) {
    const current = pending.pop() as string
    let stats: Awaited<ReturnType<typeof lstat>>
    try {
      stats = await lstat(current)
    } catch {
      // The entry vanished between listing and measuring; the copy skips it too.
      continue
    }
    entries += 1
    if (entries > Math.min(remainingEntries, remainingWalk)) {
      // Blame the ceiling that bound: quoting the file limit for a walk earlier entries used up would be wrong.
      const reason = remainingWalk < remainingEntries ? 'sizing' : 'entries'
      return { verdict: { withinBudget: false, reason }, walked: entries }
    }
    // Both copy backends reproduce a nested symlink as a symlink, so following one would double-count its target or loop on a cycle.
    if (stats.isSymbolicLink()) continue
    if (stats.isDirectory()) {
      try {
        for (const name of await readdir(current)) pending.push(join(current, name))
      } catch {
        // An unreadable directory has nothing measurable; the copy reports it.
      }
      continue
    }
    bytes += stats.size
    if (bytes > remainingBytes) return { verdict: { withinBudget: false, reason: 'bytes' }, walked: entries }
  }
  return { verdict: { withinBudget: true, bytes, entries }, walked: entries }
}

/**
 * Create the admission state for one creation. A measuring pass runs before
 * any copy because `fs.cp` ignores its `signal`, so a started copy cannot be
 * cancelled and would strand a partial tree; refusing first keeps the worktree
 * in a state the user can reason about. The walk is itself bounded.
 * @param budget - the byte and entry ceilings.
 * @returns a tracker that admits entries until the budget is spent.
 */
export function createCopyBudgetTracker(budget: CopyBudget): CopyBudgetTracker {
  let remainingBytes = budget.maxBytes
  let remainingEntries = budget.maxEntries
  // Refused entries consume no copy budget, so a separate ceiling on walking keeps a long list
  // of oversized directories from re-freezing creation.
  let remainingWalk = budget.maxEntries * SIZING_HEADROOM
  return {
    admit: async (source, { bytesAreCopied = true } = {}) => {
      if (remainingWalk <= 0) return { withinBudget: false, reason: 'sizing' }
      const { verdict, walked } = await measureCopySize(
        source,
        bytesAreCopied ? remainingBytes : Number.POSITIVE_INFINITY,
        remainingEntries,
        remainingWalk,
      )
      remainingWalk -= walked
      if (verdict.withinBudget) {
        if (bytesAreCopied) remainingBytes -= verdict.bytes
        remainingEntries -= verdict.entries
      }
      return verdict
    },
    chargeBytes: (bytes) => {
      if (bytes > remainingBytes) return false
      remainingBytes -= bytes
      return true
    },
  }
}

/** Render a byte ceiling in the larger of GB or MB. */
function formatByteLimit(maxBytes: number): string {
  const gigabytes = maxBytes / (1024 * 1024 * 1024)
  if (gigabytes >= 1) return `${Number(gigabytes.toFixed(1))} GB`
  return `${Math.max(1, Math.round(maxBytes / (1024 * 1024)))} MB`
}

/** Entries named in one warning sentence before the rest are counted. */
const MAX_NAMED_SKIPPED_ENTRIES = 5

/**
 * Describe the entries the budget refused so a worktree quietly missing its
 * copied files says which ones it left behind.
 * @param skipped - the refused entries.
 * @param budget - the ceilings that applied.
 * @returns the warning, or undefined when nothing was skipped.
 */
export function formatSkippedCopyWarning(skipped: readonly SkippedCopyPath[], budget: CopyBudget): string | undefined {
  if (skipped.length === 0) return undefined
  const nameList = (entries: readonly SkippedCopyPath[]): string => {
    const shown = entries.slice(0, MAX_NAMED_SKIPPED_ENTRIES)
    const names = shown.map(entry => `"${entry.path}"`).join(', ')
    const rest = entries.length - shown.length
    return rest > 0 ? `${names} and ${rest.toLocaleString('en-US')} more` : names
  }
  const describe = (entries: readonly SkippedCopyPath[]): string => {
    const subject = entries.length === 1 ? 'entry' : 'entries'
    const verb = entries.length === 1 ? 'was' : 'were'
    return `copy ${subject} ${nameList(entries)} ${verb} not copied into the new worktree`
  }
  const pronoun = (count: number): string => (count === 1 ? 'it' : 'them')
  // An entry refused because earlier ones used up the sizing walk never approached the limits itself.
  const overBudget = skipped.filter(entry => entry.reason !== 'sizing')
  const unsized = skipped.filter(entry => entry.reason === 'sizing')
  const sentences: string[] = []
  if (overBudget.length > 0) {
    sentences.push(
      `${describe(overBudget)}: copying ${pronoun(overBudget.length)} would exceed the `
      + `${formatByteLimit(budget.maxBytes)} / ${budget.maxEntries.toLocaleString('en-US')} `
      + 'file limit that keeps worktree creation responsive.',
    )
  }
  if (unsized.length > 0) sentences.push(`${describe(unsized)}: earlier entries used up the budget for measuring what to copy.`)
  const partial = skipped.filter(entry => entry.mayBePartial)
  if (partial.length > 0) {
    // The copy was abandoned after it started, so copying by hand would merge into what the interrupted run left.
    sentences.push(`${nameList(partial)} may hold a partial copy from the interrupted attempt; check ${pronoun(partial.length)} before reusing this worktree.`)
  }
  sentences.push(`Copy ${pronoun(skipped.length)} in manually if this worktree needs ${pronoun(skipped.length)}.`)
  return sentences.join(' ')
}
