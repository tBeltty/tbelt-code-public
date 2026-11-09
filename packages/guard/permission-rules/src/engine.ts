/**
 * Real-time evaluation of the permission-rule table against a live tool
 * call. Pure functions only — no Cordis wiring; `./index.ts` owns the
 * `ctx.tools.guard()` and `tools/pre-execute` registrations that call these
 * on every pending call, each independently re-evaluating the current
 * resolved table rather than sharing a decision between the two mechanisms.
 *
 * @module @deepseek-ai/dsh-permission-rules/engine
 */

import picomatch from 'picomatch'
import { isDestructiveCommand, tokenizeShellLine } from '@deepseek-ai/dsh-destructive-command-policy'
import type { PermissionRule, RiskTier, RuleOutcome } from './schema.ts'
import type { PermissionDecisionMatch } from './types.ts'

/**
 * Registry tool names this package treats as shell-executing: their
 * `arguments.command` string is what a rule's `commandPattern` and the
 * destructive-command classifier evaluate. Fixed, not configurable — these
 * are the harness's own tool identities (`packages/shell/tool-bash`,
 * `packages/shell/tool-pwsh`, and their persistent variants, which register
 * under these same two names), a protocol constant rather than a
 * deployment-varying choice.
 */
const SHELL_EXECUTING_TOOLS: ReadonlySet<string> = new Set(['bash', 'pwsh'])

/**
 * Extract a shell-executing tool call's command text.
 * @param toolName - the registry tool name of the pending call.
 * @param args - the pending call's raw, deep-frozen arguments.
 * @returns the command string, or `undefined` for any other tool or a malformed payload.
 */
export function commandTextOf(toolName: string, args: unknown): string | undefined {
  if (!SHELL_EXECUTING_TOOLS.has(toolName)) return undefined
  if (typeof args !== 'object' || args === null) return undefined
  const command = (args as { command?: unknown }).command
  return typeof command === 'string' ? command : undefined
}

/**
 * A character that cannot occur in a shell command string or a
 * `commandPattern` (both are `string`s validated as JS text, never carrying
 * a raw NUL). Substituting every literal `/` with it before a
 * `commandPattern` match neutralizes picomatch's file-glob assumption that a
 * bare `*`/`?` never crosses a path separator (`makeRe('rm -rf *')` compiles
 * to `[^/]*?`, matching zero directory segments). Command text is not a
 * filesystem path — `rm -rf /`, `rm -rf /tmp/scratch`, and `git push
 * --force origin main` all contain `/` incidentally — so a `commandPattern`
 * author writing `rm -rf /*` reasonably expects `*` to match `/` itself, not
 * to silently never match any command touching the filesystem root. Without
 * this substitution, a `deny` rule as plausible-looking as `rm -rf /*` would
 * never fire, which is exactly the class of silent-bypass bug this phase
 * exists to close (`isDestructiveCommand`'s own tokenizer rewrite, P8-T1).
 */
const SLASH_PLACEHOLDER = '\0'

/** Neutralize picomatch's path-segment handling of `/` for command-text matching (see {@link SLASH_PLACEHOLDER}). */
function forCommandGlob(value: string): string {
  return value.replaceAll('/', SLASH_PLACEHOLDER)
}

/**
 * Split a shell line into one text per command invocation (`a && b | c`
 * yields `a`, `b`, `c`), each rebuilt by joining the command's parsed
 * arguments with single spaces.
 * @param command - the shell command text.
 * @returns the per-command texts, or `undefined` when the line is not valid shell syntax or holds no command.
 */
export function commandSegments(command: string): string[] | undefined {
  let commands: ReturnType<typeof tokenizeShellLine>
  try {
    commands = tokenizeShellLine(command)
  } catch (_syntaxError: unknown) {
    // Invalid POSIX syntax: callers fall back to whole-line matching and `allow` rules do not fire.
    return undefined
  }
  if (commands.length === 0) return undefined
  return commands.map(tokens => tokens.map(token => token.text).join(' '))
}

/** Whether `pattern` matches `command` itself or, per `rule.outcome`, its individual commands (see `PermissionRuleMatch`). */
function commandMatches(rule: PermissionRule, pattern: string, command: string): boolean {
  const matches = (text: string): boolean => picomatch.isMatch(forCommandGlob(text), forCommandGlob(pattern))
  const segments = commandSegments(command)
  if (rule.outcome === 'allow') return segments !== undefined && matches(command) && segments.every(matches)
  return matches(command) || (segments?.some(matches) ?? false)
}

/**
 * Find the first rule (ascending `priority`, the table's resolved evaluation
 * order) whose match applies to this call. `match.tool` is a picomatch
 * pattern against the registry tool name (ordinary picomatch semantics — a
 * tool's registry name never contains `/`, so no substitution is needed
 * there). `match.commandPattern`, when present, only ever matches a
 * shell-executing call with resolvable command text — a rule that names a
 * `commandPattern` never matches a non-shell-executing tool, or a
 * shell-executing call whose command text cannot be resolved: there is
 * nothing to validate the pattern against, and matching on the tool name
 * alone would silently widen the rule past its configured scope.
 * `match.agent`, when present, is matched against the caller's preset id and
 * never matches a call with no preset.
 * @param rules - the resolved table, already sorted ascending by `priority`.
 * @param toolName - the registry tool name of the pending call.
 * @param command - the call's command text, when resolvable.
 * @param agentPreset - the calling agent's preset id, when it has one.
 * @returns the first matching rule, or `undefined`.
 */
export function matchRule(
  rules: readonly PermissionRule[],
  toolName: string,
  command: string | undefined,
  agentPreset?: string,
): PermissionRule | undefined {
  return rules.find((rule) => {
    if (!picomatch.isMatch(toolName, rule.match.tool)) return false
    if (rule.match.agent !== undefined) {
      if (agentPreset === undefined || !picomatch.isMatch(agentPreset, rule.match.agent)) return false
    }
    if (rule.match.commandPattern === undefined) return true
    if (command === undefined) return false
    return commandMatches(rule, rule.match.commandPattern, command)
  })
}

/** One resolved evaluation: the outcome to enforce and the fact that produced it. */
export interface PermissionDecision {
  readonly outcome: RuleOutcome
  readonly matched: PermissionDecisionMatch | { readonly kind: 'none' }
  /**
   * Present only when `outcome` is `'ask'`: whether a prior grant for the
   * identical call shape, within the same session, may stand in for asking
   * again. A `destructive-command` match is always `'irreversible'` —
   * hardcoded, not configurable through the rule table, matching the
   * classifier's own "definitionally high-impact" stance. A `rule` match
   * takes the rule's own `risk` field, defaulting to `'irreversible'` when
   * the rule omits it (see `./schema.ts`'s `PermissionRule.risk` doc for why
   * the default is the more-restrictive tier). `deny` and `allow` never
   * reach the approval seam, so a risk tier is meaningless for them and this
   * field is omitted.
   */
  readonly riskTier?: RiskTier
}

/**
 * Resolve one pending tool call's full permission decision.
 *
 * Precedence: an explicit rule-table match wins outright at whatever
 * outcome it declares — including `allow`, which is how an operator
 * overrides a command the destructive-command classifier would otherwise
 * flag (P8-T2's schema comment: rules are user-authored and explicit,
 * outranking the always-on classifier). Absent any rule match, a
 * shell-executing call whose command classifies as destructive resolves to
 * `ask` — never `deny`: the classifier's own documented stance is
 * deliberate over-flagging ("a false 'needs confirmation' costs one prompt,
 * while a false negative is the actual safety failure"), and a hard denial
 * would turn every one of its known false positives (e.g. `rm -rf
 * ./build`, a path nested inside the project) into an outright block of a
 * legitimate action rather than a single confirmation. Everything else — no
 * rule match, not classified destructive, including every non-shell tool
 * call with an empty rule table — resolves `allow`: the rule table's own
 * schema documents an empty table as "no rule fires; the caller's existing
 * coarse tiers govern" (sandbox mode, approval policy), not "deny
 * everything"; a global default-deny for every tool call is not what this
 * schema, or the phase's storage layer, was built to support.
 * @param rules - the resolved rule table (ascending `priority`).
 * @param toolName - the registry tool name of the pending call.
 * @param args - the pending call's raw arguments.
 * @param agentPreset - the calling agent's preset id, when it has one.
 * @returns the decision and the fact that produced it.
 */
export function evaluateCall(
  rules: readonly PermissionRule[],
  toolName: string,
  args: unknown,
  agentPreset?: string,
): PermissionDecision {
  const command = commandTextOf(toolName, args)
  const rule = matchRule(rules, toolName, command, agentPreset)
  if (rule !== undefined) {
    return {
      outcome: rule.outcome,
      matched: { kind: 'rule', priority: rule.priority, ...rule.description !== undefined ? { description: rule.description } : {} },
      ...rule.outcome === 'ask' ? { riskTier: rule.risk ?? 'irreversible' } : {},
    }
  }
  if (command !== undefined) {
    const classified = isDestructiveCommand(command)
    if (classified.destructive) {
      return {
        outcome: 'ask',
        matched: { kind: 'destructive-command', reason: classified.reason ?? `"${toolName}" classified as destructive` },
        riskTier: 'irreversible',
      }
    }
  }
  return { outcome: 'allow', matched: { kind: 'none' } }
}

/**
 * Render a rule-table or classifier match into a model/UI-facing reason string.
 * @param decision - the resolved decision from {@link evaluateCall}.
 * @param toolName - the registry tool name of the pending call.
 * @returns the rule's `description`, the classifier's reason, or a fallback naming the rule's `priority` and outcome.
 */
export function reasonFor(decision: PermissionDecision, toolName: string): string {
  if (decision.matched.kind === 'destructive-command') return decision.matched.reason
  if (decision.matched.kind === 'rule') {
    if (decision.matched.description !== undefined) return decision.matched.description
    return `permission-rules: rule[priority=${decision.matched.priority}] ${decision.outcome}s "${toolName}"`
  }
  return `permission-rules: "${toolName}" allowed`
}
