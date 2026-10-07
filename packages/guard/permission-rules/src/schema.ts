/**
 * The permission-rule table shape: an ordered set of tool/command-argument
 * match patterns, each carrying a `deny` / `ask` / `allow` outcome and an
 * explicit `priority`. Pure schema and validation — no Cordis wiring, no
 * `tools/pre-execute` or `ctx.tools.guard()` evaluation. A future evaluator
 * (a separate task) reads the resolved table through `./index.ts` and
 * matches each tool call against it in `priority` order.
 *
 * @module @deepseek-ai/dsh-permission-rules/schema
 */

import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

/** Every accepted rule outcome. */
export const RULE_OUTCOMES = ['deny', 'ask', 'allow'] as const

/** One rule's effect when its match applies. */
export type RuleOutcome = typeof RULE_OUTCOMES[number]

/**
 * Every accepted risk tier for an `ask`-outcome rule. `irreversible` actions
 * are gated every time a call reaches the engine, with no session-scoped
 * memory of a prior grant; `reversible` actions may be auto-approved after
 * their first grant in a session (see `./engine.ts`'s `PermissionDecision.riskTier`
 * and `./index.ts`'s reversible-ask cache). Meaningless for `deny` (never
 * reaches the approval seam) and `allow` (never asks); the schema still
 * accepts `risk` on any outcome rather than rejecting it, since a rule
 * authored today as `ask` with `risk: 'reversible'` and edited tomorrow to
 * `deny` should not also require deleting the now-inert field.
 */
export const RISK_TIERS = ['reversible', 'irreversible'] as const

/** An `ask`-outcome rule's blast radius: whether a prior grant in the same session may stand in for a later identical call. */
export type RiskTier = typeof RISK_TIERS[number]

/**
 * What one rule matches against. `tool` is a picomatch pattern compared
 * against the tool's registry name — an exact name (`tool-bash`) or a glob
 * (`mcp_*`). `commandPattern`, when present, is a picomatch pattern a future
 * evaluator compares against a shell-executing tool's reconstructed command
 * text; it is schema-valid on any tool match, including a non-shell-executing
 * one, because this package's schema has no registry of which tool names
 * execute shell commands — see the package README's Known Limitations.
 */
export interface PermissionRuleMatch {
  /** Picomatch pattern matched against the tool's registry name. */
  tool: string
  /**
   * Picomatch pattern matched against a shell-executing tool's command text,
   * when present. A `deny` or `ask` rule also fires when any single command
   * of a compound line (`a && b`, `a | b`, `a; b`) matches, so
   * `git push*` catches `git status && git push origin main`. An `allow`
   * rule fires only when every command of the line matches.
   */
  commandPattern?: string
  /**
   * Picomatch pattern matched against the calling agent's preset id, when
   * present. A rule that names `agent` never matches a call from an agent
   * with no preset.
   */
  agent?: string
}

/**
 * One table entry. `priority` is required and must be unique across the
 * table: rules are evaluated in ascending `priority` order (lower runs
 * first) and the first match wins. A duplicate `priority` is an ambiguous
 * conflict the table cannot resolve on its own, so it is rejected by
 * {@link validateRuleTable} rather than silently broken by array position —
 * see that function's doc comment for the full precedence rationale.
 */
export interface PermissionRule {
  /** Evaluation order; lower runs first. Must be unique across the table. */
  priority: number
  /** What this rule matches. */
  match: PermissionRuleMatch
  /** This rule's effect when it is the first match by ascending `priority`. */
  outcome: RuleOutcome
  /**
   * This rule's risk tier when `outcome` is `ask`; ignored otherwise.
   * Defaults to `irreversible` when omitted — an `ask` rule must opt in to
   * `reversible` (session-scoped auto-approval after a first grant)
   * explicitly rather than getting it by silent default, matching OWASP's
   * "Least Agency" principle: the safer, more-restrictive behavior is what
   * an unannotated rule gets.
   */
  risk?: RiskTier
  /** Optional human-readable note surfaced in a configuration UI or audit log. */
  description?: string
}

/** The {@link apply} config: the rule table's composition-layer default. */
export interface Config {
  /**
   * The rule table; defaults to empty (no rule fires; the caller's existing
   * coarse tiers govern). Volatile: a settings edit reaches the next call.
   */
  rules: Volatile<PermissionRule[]>
}

const MatchSchema: z<PermissionRuleMatch> = z.object({
  tool: z.string().required(),
  commandPattern: z.string(),
  agent: z.string(),
})

const RuleSchema: z<PermissionRule> = z.object({
  priority: z.number().required(),
  match: MatchSchema.required(),
  outcome: z.union(RULE_OUTCOMES).required(),
  risk: z.union(RISK_TIERS),
  description: z.string(),
})

/**
 * The rule-table settings/composition schema. Structural checks only
 * (field types, the `outcome` enum, required-ness) — cross-rule checks
 * (glob syntax, duplicate `priority`) live in {@link validateRuleTable},
 * which a caller runs separately because schemastery has no per-field
 * custom-predicate hook and no cross-element array check.
 */
export const Config = z.object({
  rules: z.array(RuleSchema).default([]).volatile(),
})

/** One bracket kind that must close before the pattern ends. */
const BRACKET_CLOSERS: Record<string, string> = { '[': ']', '{': '}' }

/**
 * Scans for an unbalanced picomatch bracket group (`[...]` character class,
 * `{...}` brace expansion), honoring `\`-escapes. picomatch's own compiler
 * (`makeRe`) never throws on a malformed pattern — an unbalanced `[` or `{`
 * compiles to a regex that matches nothing or something unintended, rather
 * than failing — so this is the actual "bad glob" check; picomatch is not.
 * @param pattern - a match or command-argument pattern string.
 * @returns a human-readable reason when unbalanced, `undefined` when clean.
 */
function findUnbalancedGlobSyntax(pattern: string): string | undefined {
  const stack: string[] = []
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '\\') { i++; continue }
    if (char === '[' || char === '{') stack.push(char)
    else if (char === ']' || char === '}') {
      const opener = stack.pop()
      if (opener === undefined || BRACKET_CLOSERS[opener] !== char) {
        return `"${char}" at position ${i} has no matching opener`
      }
    }
  }
  const unclosed = stack.at(-1)
  if (unclosed !== undefined) {
    return `"${unclosed}" is never closed`
  }
  return undefined
}

/**
 * Validate one glob/pattern string in isolation: non-empty, balanced
 * bracket/brace groups.
 * @param pattern - the pattern to check.
 * @returns a reason string when invalid, `undefined` when valid.
 */
export function validateGlobPattern(pattern: string): string | undefined {
  if (pattern.length === 0) return 'must not be empty'
  return findUnbalancedGlobSyntax(pattern)
}

/**
 * Cross-rule validation the schema cannot express: every `priority` is
 * unique, and every `match.tool` / `match.commandPattern` is a well-formed
 * pattern. Throws on the first problem found, naming the offending rule's
 * index — misconfiguration fails loud at load, not at match time.
 *
 * Precedence is deliberately an explicit, required `priority` field rather
 * than implicit array position ("first-match-wins") or an inferred
 * "most-specific-wins" ranking: array position silently changes meaning when
 * rules are reordered or merged from another source (a later project/managed
 * tier, `Array.prototype.sort`'s instability across engines is not a risk
 * here, but hand-reordering YAML entries is exactly the kind of edit that
 * should not silently change enforcement), and "most specific" has no single
 * defensible ordering between a `commandPattern` rule and a narrower `tool`
 * glob without inventing a specificity metric this package would then own
 * and version. An explicit `priority` is auditable directly in the stored
 * YAML, and two rules that both claim the same `priority` are a genuine
 * authoring conflict — this function rejects that at validation time instead
 * of letting array order silently decide it.
 * @param rules - the full rule table to validate.
 * @throws when a `priority` repeats, or a `match.tool`/`match.commandPattern` is not a valid pattern.
 */
export function validateRuleTable(rules: readonly PermissionRule[]): void {
  const priorityOwners = new Map<number, number>()
  rules.forEach((rule, index) => {
    if (!Number.isInteger(rule.priority)) {
      throw new Error(`permission-rules: rule[${index}].priority must be an integer (got ${rule.priority})`)
    }
    const owner = priorityOwners.get(rule.priority)
    if (owner !== undefined) {
      throw new Error(
        `permission-rules: rule[${owner}] and rule[${index}] both declare priority ${rule.priority} — `
        + 'precedence between them is undefined; assign distinct priorities',
      )
    }
    priorityOwners.set(rule.priority, index)

    const toolReason = validateGlobPattern(rule.match.tool)
    if (toolReason !== undefined) {
      throw new Error(`permission-rules: rule[${index}].match.tool ("${rule.match.tool}") is not a valid pattern: ${toolReason}`)
    }
    if (rule.match.commandPattern !== undefined) {
      const commandReason = validateGlobPattern(rule.match.commandPattern)
      if (commandReason !== undefined) {
        throw new Error(`permission-rules: rule[${index}].match.commandPattern ("${rule.match.commandPattern}") is not a valid pattern: ${commandReason}`)
      }
    }
    if (rule.match.agent !== undefined) {
      const agentReason = validateGlobPattern(rule.match.agent)
      if (agentReason !== undefined) {
        throw new Error(`permission-rules: rule[${index}].match.agent ("${rule.match.agent}") is not a valid pattern: ${agentReason}`)
      }
    }
  })
}

/**
 * Sort a validated rule table into evaluation order (ascending `priority`).
 * {@link validateRuleTable} guarantees unique priorities, so this ordering is
 * total; callers must validate before calling this.
 * @param rules - a rule table already accepted by {@link validateRuleTable}.
 * @returns a new array in ascending-`priority` evaluation order.
 */
export function resolveRuleOrder(rules: readonly PermissionRule[]): PermissionRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority)
}
