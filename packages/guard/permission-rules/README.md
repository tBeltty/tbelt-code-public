---
description: "The validated, hot-reloadable permission-rule table (per-tool and per-command-argument-pattern deny/ask/allow rules) and its tool-call enforcement, for maintainers composing the harness's permission tier and users editing the settings document."
kind: "package-reference"
---

# @deepseek-ai/dsh-permission-rules

## Summary

Use this package to define, validate, and hot-reload a permission-rule table — rules matching a tool name plus an optional command-argument pattern, each carrying a `deny` / `ask` / `allow` outcome and, for `ask`, a `reversible`/`irreversible` risk tier — and to enforce it on every tool call. `ctx.permissionRules.get()` returns the resolved table. Mounting the plugin registers a `ctx.tools.guard()` for `deny` (unloosenable) and a `tools/pre-execute` listener for `ask`, an explicit `allow` override, and the always-on `destructive-command-policy` classifier. `irreversible` `ask` (the default) always re-prompts; `reversible` may auto-approve a later identical call in the session. Every non-default decision is logged as `permission/decision`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

```ts
import { Config } from '@deepseek-ai/dsh-permission-rules'

const table = Config({
  rules: [
    { priority: 0, match: { tool: 'tool-bash', commandPattern: 'rm -rf *' }, outcome: 'deny' },
    { priority: 10, match: { tool: 'mcp_*' }, outcome: 'ask', description: 'unreviewed MCP tools' },
  ],
})
```

Mount the plugin to install the `permission-rules` settings namespace and `ctx.permissionRules`:

```yaml
- name: '@deepseek-ai/dsh-permission-rules'
  config:
    rules:
      - priority: 0
        match: { tool: 'tool-bash', commandPattern: 'rm -rf *' }
        outcome: deny
```

A consumer reads the resolved, precedence-ordered table:

```text
for (const rule of ctx.permissionRules.get()) {
  // match rule.match.tool / rule.match.commandPattern against a real call
}
```

### Rule shape

| Field | Required | Meaning |
|---|---|---|
| `priority` | yes | Evaluation order; lower runs first. Must be unique across the table. |
| `match.tool` | yes | Picomatch pattern (exact name or glob) matched against the tool's registry name. |
| `match.commandPattern` | no | Picomatch pattern matched against a shell-executing tool's command text and against each command of a compound line. |
| `match.agent` | no | Picomatch pattern matched against the calling agent's preset id; never matches an agent with no preset. |
| `outcome` | yes | `deny`, `ask`, or `allow`. |
| `risk` | no | `reversible` or `irreversible`; meaningful only when `outcome` is `ask`. Defaults to `irreversible`. |
| `description` | no | Human-readable note for a configuration UI or audit log. |

The table defaults to empty. With no configured rules, every non-shell-executing call falls through to `allow` unchanged, and every shell-executing call (`bash`/`pwsh`) still passes through the always-on `destructive-command-policy` classifier — mounting this plugin is not a no-op even with an empty table, because that classifier is wired to real enforcement here (see "Enforcement" below).

### Enforcement

Evaluation order, per call: an explicit rule-table match (ascending `priority`, first match wins) decides outright at whatever outcome it declares, including an `allow` that overrides what the classifier would otherwise flag. Absent a rule match, a shell-executing call whose command classifies as destructive resolves `ask`, never `deny` — the classifier's own documented stance is deliberate over-flagging (a false positive costs one prompt; a false negative is the real failure), so a hard denial would turn its known false positives into an outright block of a legitimate action. Everything else resolves `allow`: an empty or non-matching table is "no rule fires, the caller's existing coarse tiers (sandbox mode, approval policy) govern," not "deny everything."

`deny` is enforced by a `ctx.tools.guard()` registration — the harness's one genuinely unloosenable tool-call tier (`packages/core/tools/src/index.ts`'s own doc: "no guard can force-allow a call another guard denied"), consulted unconditionally on every `allow` resolution from the `tools/pre-execute` waterfall regardless of which listener produced it. `ask` is enforced by a `tools/pre-execute` listener returning `{ kind: 'ask', reason }`, which gets the full approval round-trip for free from the tool registry's own `serviceAsk()`. The two mechanisms evaluate the live table independently on every call rather than sharing a decision: the listener falls through to `next()` for any match it resolves as `deny`, leaving `guard()` to deny it regardless of what the listener decided.

Every matched decision (a rule match, or an unmatched destructive-command classification) appends one `permission/decision` session event — log-only, carrying the tool name, the resolved outcome, and the deciding rule's `priority`/`description` or the classifier's reason, without repeating the call's raw arguments (already logged via `tool/call`). An `ask` decision's resolved outcome is not repeated here — it is the paired `approval/asked`/`approval/decided` audit trail, correlated by `callId`. An unmatched default `allow` is not logged at all, to avoid duplicating an event for every ordinary tool call.

### Risk-tiered `ask` (reversible vs. irreversible)

An `ask` decision's risk tier controls whether a prior grant in the same session may stand in for a later identical call — the research behind this package's design flags "ask once, remember for the rest of the session" as the single most-repeated production security failure for agent permission systems, since each approval then monotonically expands trusted surface with no way back down within a session. This package rejects that pattern for anything not explicitly marked safe:

- **`irreversible`** (the default for a rule-table `ask` match with no `risk` field, and always for the destructive-command classifier's fallback `ask` — hardcoded, not configurable through the rule table) asks through the full `ctx.approval` round-trip on every single call, with no exception for an identical prior grant in the same session.
- **`reversible`** (an explicit, rule-table-only opt-in) asks through the same round-trip the first time a given call shape (tool name plus exact arguments) is seen in a session, then auto-approves a later identical call in that session without asking again.

The auto-approval memory (`src/reversible-ask-cache.ts`) is written only from the code path reached when a decision's `riskTier` is `'reversible'` — an `irreversible` decision's call shape is never passed to it, so an irreversible action cannot be silently promoted to a remembered allow by anything short of a rule-table edit changing its `risk` field (an explicit, out-of-band settings-document change, not an in-session side effect of answering yes once). The memory is keyed by session and exact call shape: a grant for one command does not cover a different command matched by the same rule, and a grant in one session is invisible to another.

### Compound command lines

`commandPattern` is matched against the whole command text and against each command the shell parser finds in it (`a && b`, `a | b`, `a; b`), each rebuilt by joining its parsed arguments with single spaces. A `deny` or `ask` rule fires when the line or any one command matches, so `git push*` catches `git status && git push origin main`. An `allow` rule fires only when the line and every command match, so `git status*` does not approve `git status && rm -rf build`. A line that is not valid shell syntax is matched as whole text and no `allow` rule fires for it.

### Per-agent rules

`match.agent` limits a rule to agents whose preset id (the `agentPreset` session projection) matches. Without the projection service, or for an agent with no preset, a rule that names `agent` does not match.

```yaml
rules:
  - priority: 10
    match: { tool: bash, agent: reviewer, commandPattern: 'git push*' }
    outcome: deny
    description: reviewers never push
```

### Contributed rules

`ctx.permissionRules.contribute(rules)` adds rules owned by another plugin, for example the `permission` block of an agent definition file. They are validated like the table (`priority` is unique within the contribution), evaluated after every configured rule in registration order, and removed by the returned disposer. `get()` lists configured rules only.

### Precedence

Rules are evaluated in ascending `priority` order; the first match wins. `priority` is an explicit, required field rather than implicit array position ("first-match-wins by list order") or an inferred "most-specific-wins" ranking — see `validateRuleTable`'s doc comment in `src/schema.ts` for why. Two rules declaring the same `priority` are a genuine authoring conflict: {@link validateRuleTable} rejects the table at validation time rather than letting array order silently decide it.

### Hot reload

Once mounted with `@deepseek-ai/dsh-settings-file` in the composition, editing the `permission-rules` section of the settings document takes effect live: `ctx.permissionRules.get()` reflects the new resolved table after the document reload commits. An edit that fails `validateRuleTable` (a duplicate `priority`, a malformed pattern) is rejected — the settings service keeps the last good table and warns, exactly as `@deepseek-ai/dsh-settings` does for any other namespace.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design philosophy

- **Schema validates shape; `validateRuleTable` validates the table.** schemastery (`src/schema.ts`'s `Config`) checks field types, the `outcome` enum, and required-ness — but has no cross-element array check and no per-field custom predicate, so a duplicate `priority` and a malformed glob both need a separate pass. `validateRuleTable` is that pass, run both at plugin load (against the composition entry) and from the settings `validate` hook (against every write), so a bad table is refused at the boundary it enters through, never accepted and left to misbehave when an evaluator matches against it later.
- **picomatch does not throw on a malformed pattern.** `makeRe('rm -rf [')` compiles to a regex that matches nothing, not an error — so `validateGlobPattern`'s bracket-balance check is the actual "bad glob" gate this package's tests exercise; picomatch itself is not.
- **`ctx.permissionRules` is a plain read accessor, not a matcher.** `PermissionRulesReader.get()` returns the resolved table in evaluation order; matching and enforcement live in `src/engine.ts` and the `ctx.tools.guard()`/`tools/pre-execute` registrations in `src/index.ts`, kept separate from the reader so a consumer that only wants to inspect the table (a settings UI) doesn't pull in `@deepseek-ai/dsh-tools`.
- **`guard()` and the `tools/pre-execute` listener each independently call `engine.ts`'s `evaluateCall` against the live table** rather than one computing a decision the other trusts — this is what makes the `deny` tier genuinely unloosenable: it does not depend on, and cannot be redirected by, anything the `tools/pre-execute` waterfall decided first.
- **`commandTextOf` fixes the shell-executing tool set (`bash`, `pwsh`) as a constant, not a config field.** These are the harness's own protocol-level tool identities (`packages/shell/tool-bash`, `packages/shell/tool-pwsh`, and their persistent variants register under the same two names) — a security invariant this package's own schema comment already documents as out of its registry knowledge, not a deployment-varying choice a `Config` field would legitimately expose.

### Source map

| File | Role |
|---|---|
| [`src/schema.ts`](src/schema.ts) | Rule/match/`Config` types, the schemastery schema, `validateGlobPattern`, `validateRuleTable`, `resolveRuleOrder` |
| [`src/engine.ts`](src/engine.ts) | Pure evaluation: `commandTextOf`, `matchRule`, `evaluateCall`, `reasonFor` — `evaluateCall` also resolves an `ask` decision's `riskTier` |
| [`src/types.ts`](src/types.ts) | The `permission/decision` session event (`SessionEventMap` declaration merge) |
| [`src/reversible-ask-cache.ts`](src/reversible-ask-cache.ts) | `ReversibleAskCache`: session-scoped memory of a granted `reversible`-tier `ask`, keyed by exact call shape |
| [`src/index.ts`](src/index.ts) | The `permission-rules` settings namespace, `ctx.permissionRules`, the `ctx.tools.guard()` and `tools/pre-execute` registrations, and `resolveReversibleAsk` |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- Permission rules subsystem reference — the rule table, precedence, and settings integration.
- Settings subsystem reference — namespace registration, resolution, and hot reload this package builds on.
- Permission presets subsystem — the coarse sandbox/approval tier this rule table layers above, never extends.
- [`destructive-command-policy/`](../destructive-command-policy/README.md) — the always-on shell-command classifier this package consults for any shell-executing call no rule matches.

-----

<a id="model-experience"></a>
## Model Experience

### Denied or approval-gated tool call

#### What the model sees

A `deny` match becomes that call's error result, exactly `Error: <rule description>` (or, absent a `description`, `Error: permission-rules: rule[priority=N] denies "<tool>"`). An `ask` match runs the ordinary approval round-trip through `ctx.approval`; a rejected or unavailable approval denies with the tool registry's own distinct-reason text (`user rejected`, `no approval channel is available`, and so on), not this package's — the model cannot tell an `ask`-then-rejected call apart from any other approval rejection. An accepted `ask` runs the call normally, with no denial text at all.

#### Token effect

No cost on `allow`. A `deny` or a rejected `ask` adds one short error string to that call's result; nothing is added on an accepted `ask`.

#### KV Cache effect

Append-only, and only ever after the model's own tool call already sits in the transcript — a denial or rejection reason follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **`commandPattern` sees arguments joined by single spaces, not the original quoting.** Each command of a compound line is rebuilt from its parsed arguments, so `git  push   'origin'` is matched as `git push origin`. Command and process substitutions are matched as the placeholder `$(...)`, and shell variables as `${NAME}`.
- **User-tier settings only — no project or managed/enterprise tier.** `@deepseek-ai/dsh-settings` resolves schema defaults, one composition `base`, and one user document section (see that package's own Known Limitations); this package adds nothing on top. A deployment cannot today declare a repo-local (`.dsh/permissions.yaml`-shaped) rule set that a user layer can tighten but not loosen, nor a managed/enterprise tier that no local edit can override — both are real, named headroom this package deliberately does not build for v1. Building the project tier honestly would mean: a second document source read at a fixed repo-relative path, merge semantics where a project-declared `deny` cannot be loosened by the user layer (the managed-tier-cannot-be-overridden principle at a smaller scope), and its own hot-reload watch — a materially larger storage and merge-policy surface than schema/validation, and a natural unit for a follow-up task rather than folded silently into this one.
- **`ReversibleAskCache` entries are not cleared on session disposal.** The cache is keyed by `SessionId` and lives for the process lifetime of the owning plugin instance (`apply()`'s closure), not the session's own lifecycle — a long-running host process that creates and disposes many sessions accumulates one `Set<string>` per distinct session id seen, with no eviction. A real, deliberate v1 gap: bounding this needs a session-disposal hook this package does not currently listen for, a materially larger change than this task's risk-tiering scope.
- **`match.commandPattern` is schema-valid on any tool, including a non-shell-executing one.** The schema itself has no registry of which tool names execute shell commands; a rule pairing `commandPattern` with a non-shell tool is accepted at validation time and simply never matches at enforcement time — `commandTextOf` (`src/engine.ts`) resolves command text only for the fixed shell-executing tool set, so `matchRule` treats such a rule as never applicable rather than rejecting it or matching on tool name alone.

No runtime invariant companion is published because rule evaluation reads settings through `@deepseek-ai/dsh-settings`, which already owns the one relationship (its resolved document vs. its schema) that could diverge; this package adds no independent mutable relationship of its own.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
