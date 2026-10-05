---
description: "Package map for the loop-hygiene and safety guard family: the advisory repeat-tool reminder, the per-tool-call timeout policy, the destructive-command classifier, permission rules, and model spend limits, for users and maintainers choosing or composing the guards."
kind: "package-group"
---

# guard/ — loop-hygiene guard family

## Summary

The `guard/` group keeps the agent loop productive, safe, and within budget. `repeat-tool-reminder` reminds the model when it repeats the same tool call. `timeout-policy` times out tool calls that declare a limit. `destructive-command-policy` classifies a shell command as destructive with no Cordis wiring. `permission-rules` enforces a hot-reloadable deny/ask/allow rule table on every tool call, including that classifier. `spend-budget` prices each model request at its route's list price and refuses model steps once a session or monthly spend limit is reached; `command-budget` adds `/budget` to show and change those limits. All six ship enabled in the `dsh` base bundle.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

Six small plugins cover these patterns; each README below explains when to keep, tune, or remove it.

| Package | What it provides |
|---|---|
| [`repeat-tool-reminder/`](repeat-tool-reminder/README.md) | Reminds the model when it repeats the same tool call, so it changes approach or finishes |
| [`timeout-policy/`](timeout-policy/README.md) | Times out tool calls that declare a limit, so the model gets a clear error instead of waiting forever |
| [`destructive-command-policy/`](destructive-command-policy/README.md) | Classifies a shell command as destructive; a pure function with no Cordis wiring of its own |
| [`permission-rules/`](permission-rules/README.md) | Validated, hot-reloadable per-tool/per-command-argument-pattern deny/ask/allow rule table, enforced on every tool call via `ctx.tools.guard()` and `tools/pre-execute`, including the always-on `destructive-command-policy` classifier |
| [`spend-budget/`](spend-budget/README.md) | Local model spend ledger priced from provider-reported usage and list prices; refuses model steps past a session or monthly spend limit |
| [`command-budget/`](command-budget/README.md) | The `/budget` command: shows session and monthly spend and sets or clears either limit |

-----

<a id="related-documentation"></a>
## Related documentation

Start with the tools subsystem reference for the tool-call pipeline, then the reminder's configuration and the timeout-library decision behind the policy.

- [Tools subsystem reference](../../docs/subsystems/tools.md) — the tool-call pipeline and decisions both guards build on.
- [Generated configuration catalog](../../docs/config-catalog.md#deepseek-aidsh-repeat-tool-reminder) — every accepted field of the repeat-call reminder.
- [Timeout deadline library Agent Note](../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md) — the timing/termination split `timeout-policy` enforces.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
