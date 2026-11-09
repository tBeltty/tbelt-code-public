/**
 * Fail-closed, content-based secret detection for free text destined for a
 * memory write. Pure, unit-testable classifier — no Cordis wiring lives
 * here; `packages/memory/memory-storage`'s write path (a later task) calls
 * this before any value reaches durable storage.
 *
 * `@deepseek-ai/dsh-settings`'s `redactSecrets` (`packages/settings/settings/src/redact.ts`)
 * is the one existing precedent in this repo, but it is schema-**structural**:
 * it walks a live schemastery schema and strips fields the schema itself
 * declares `meta.role === 'secret'`. It cannot classify an arbitrary
 * string's content, and its own `default` branch documents an open gap
 * (`TODO(settings-wire-redaction): Fail closed instead`) — a secret
 * reachable only through a union, intersection, or transform is returned
 * verbatim there, with nothing recording that it was missed. This module
 * exists because memory-write content is exactly that unstructured case
 * (a free-text string, not a schema-described field), and is built so the
 * settings redactor's open gap is not repeated: every value this module
 * cannot confidently classify as safe is withheld, never passed through.
 *
 * @module @deepseek-ai/dsh-memory-redact
 */

import type { PatternSource } from './patterns.ts'
import { SECRET_VALUE_SHAPES, SENSITIVE_NAME_ASSIGNMENT } from './patterns.ts'

/** Confidence level of one detected span. */
export type MemoryRedactionConfidence =
  /** The span matched a realistic secret value shape (API key, token, PEM block, credentialed connection string). */
  | 'confirmed'
  /**
   * The span followed a sensitive key-name assignment (`token: ...`) but its
   * value matched no known secret shape — still withheld: an unrecognized
   * shape is not evidence of safety.
   */
  | 'ambiguous'

/** One withheld span, recorded without the value itself. */
export interface MemoryRedactionFinding {
  /** Start offset (inclusive) in the original text. */
  start: number
  /** End offset (exclusive) in the original text. */
  end: number
  /** Which pattern matched — see {@link SECRET_VALUE_SHAPES} and {@link SENSITIVE_NAME_ASSIGNMENT} ids. */
  id: string
  /** See {@link MemoryRedactionConfidence}. */
  confidence: MemoryRedactionConfidence
}

/** Outcome of classifying one piece of text before a memory write. */
export interface MemoryRedactionResult {
  /** `text` with every withheld span replaced by a redaction marker. Identical to the input when nothing was found. */
  text: string
  /**
   * `true` when at least one span was withheld — callers that require an
   * all-or-nothing write should reject the whole value rather than store
   * `text`.
   */
  redacted: boolean
  /**
   * Every withheld span, in original-text order. Never carries the withheld
   * value itself, mirroring `RedactedSecret`'s "something was redacted
   * here, without saying what" shape.
   */
  findings: MemoryRedactionFinding[]
}

const REDACTION_MARKER = '[REDACTED]'

/** Builds a fresh `RegExp` from a `PatternSource` — never a shared, stateful instance (see `./patterns.ts`'s module doc). */
function freshRegExp(pattern: PatternSource): RegExp {
  return new RegExp(pattern.source, pattern.flags)
}

interface RawSpan {
  start: number
  end: number
  id: string
  confidence: MemoryRedactionConfidence
}

/** Every confirmed secret-value-shape span in `text`, across all {@link SECRET_VALUE_SHAPES} patterns. */
function confirmedShapeSpans(text: string): RawSpan[] {
  const spans: RawSpan[] = []
  for (const pattern of SECRET_VALUE_SHAPES) {
    for (const match of text.matchAll(freshRegExp(pattern))) {
      spans.push({ start: match.index, end: match.index + match[0].length, id: pattern.id, confidence: 'confirmed' })
    }
  }
  return spans
}

/** Whether `value` on its own matches a known secret shape (used to upgrade a name-value assignment's confidence). */
function matchesKnownShape(value: string): boolean {
  return SECRET_VALUE_SHAPES.some(pattern => new RegExp(`^(?:${pattern.source})$`, pattern.flags.replace('g', '')).test(value))
}

/**
 * Every `name: value` / `name=value` assignment span whose name looks
 * sensitive (see `./patterns.ts`). The captured value's own shape decides
 * `confirmed` vs `ambiguous` — either way the span is reported, per this
 * module's fail-closed contract.
 */
function nameValueSpans(text: string): RawSpan[] {
  const spans: RawSpan[] = []
  for (const match of text.matchAll(freshRegExp(SENSITIVE_NAME_ASSIGNMENT))) {
    if (match.indices === undefined) continue
    const valueRange = match.indices[1]
    if (valueRange === undefined) continue
    const [start, end] = valueRange
    const value = match[1] ?? ''
    spans.push({
      start,
      end,
      id: SENSITIVE_NAME_ASSIGNMENT.id,
      confidence: matchesKnownShape(value) ? 'confirmed' : 'ambiguous',
    })
  }
  return spans
}

/**
 * Merges overlapping/adjacent spans (sorted by `start`) into one finding
 * each, keeping the strongest confidence and every contributing id.
 */
function mergeSpans(spans: RawSpan[]): MemoryRedactionFinding[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: MemoryRedactionFinding[] = []
  for (const span of sorted) {
    const last = merged.at(-1)
    if (last !== undefined && span.start <= last.end) {
      last.end = Math.max(last.end, span.end)
      if (span.confidence === 'confirmed') last.confidence = 'confirmed'
      if (!last.id.includes(span.id)) last.id = `${last.id}+${span.id}`
      continue
    }
    merged.push({ ...span })
  }
  return merged
}

/**
 * Classifies `text` for secret content before a memory write. Fail-closed:
 * a span that follows a sensitive key-name assignment but whose value
 * matches no confirmed secret shape is still withheld (`confidence:
 * 'ambiguous'`) rather than passed through — an unrecognized value shape is
 * not evidence of safety, only evidence this classifier could not confirm
 * either way.
 * @param text - free-text content a memory write would otherwise store verbatim.
 * @returns the redacted text, whether anything was withheld, and the ordered findings.
 */
export function redactMemoryContent(text: string): MemoryRedactionResult {
  const findings = mergeSpans([...confirmedShapeSpans(text), ...nameValueSpans(text)])
  if (findings.length === 0) return { text, redacted: false, findings: [] }

  let output = ''
  let cursor = 0
  for (const finding of findings) {
    output += text.slice(cursor, finding.start) + REDACTION_MARKER
    cursor = finding.end
  }
  output += text.slice(cursor)

  return { text: output, redacted: true, findings }
}
