---
description: "The local model spend ledger and spend limits: how spend is priced, where it is stored, what a reached limit does, and the ctx.spendBudget API."
kind: "package-reference"
---

# @deepseek-ai/dsh-spend-budget

## Summary

`dsh-spend-budget` keeps a local record of what model requests cost and stops the agent once a limit is reached. Spend is the provider-reported token usage of each request multiplied by the route's published list price. It is kept per UTC calendar month across every session and per session. A session can have its own limit, and `monthlyLimitUsd` sets a limit for the month; whichever is reached first refuses the next model step, and the turn fails with a message naming the limit. The [`/budget` command](../command-budget/README.md) shows and changes both limits.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin on the host plane, beside a storage domain facility, the model runtime, and the session store:

```yaml
- id: spend-budget
  name: '@deepseek-ai/dsh-spend-budget'
  config:
    monthlyLimitUsd: 20
```

| Config field | Type | Meaning |
|---|---|---|
| `monthlyLimitUsd` | number at or above 0, optional, user-editable setting | Spend in US dollars at which every session's next model step is refused for the rest of the UTC calendar month. Absent means no monthly limit. |

The `dsh` base bundle mounts this row without a monthly limit. In the Web and Desktop app it stays on the host plane, so every session is counted and limited whichever agent preset it uses.

### How spend is priced

| Usage bucket | Rate |
|---|---|
| Uncached input tokens (`inputTokens`) | `pricing.input` |
| Output tokens, including reasoning | `pricing.output` |
| Cache-read tokens | `pricing.cacheRead`, or `pricing.input` when the route publishes no cache-read rate |
| Cache-write tokens | `pricing.cacheWrite`, or `pricing.input` when the route publishes no cache-write rate |

Prices are US dollars per million tokens from `ctx.llm.resolveModelInfo(provider, model).pricing`. A route that publishes no price adds nothing and counts one unpriced call, which `/budget` reports.

Each committed `assistant/message` and each `assistant/attempt` (a failed, retried, or cancelled request) that carries usage is one request. A successful request is priced under its message's `source.provider`/`source.model`; an attempt is priced under the session's latest `request/context` route.

A subagent session's spend and limit belong to the top session of its subagent lineage, so delegated work counts against the limit the user set on the conversation that started it. A fork is a separate session.

### What a reached limit does

Before every model step the guard waits for pending accounting and compares spend with the limits. When spend is at or above a limit, the step does not start: no model request is sent, the turn ends with an error whose code is `SPEND_LIMIT`, and the Web chat shows it on its failed-turn line, for example:

```text
This session reached its spend limit: $2.03 spent of $2.00. Raise it with /budget <usd> or remove it with /budget off.
```

```text
This month reached its spend limit: $20.10 spent of $20.00 (UTC calendar month). Raise it with /budget month <usd>, remove it with /budget month off, or change the monthlyLimitUsd setting.
```

When both limits are reached, both sentences appear, session first. The user message that started a refused turn is not added to the model-visible conversation.

### Service API

| Member | Contract |
|---|---|
| `summary(session)` | Synchronous spend, limit, and unpriced-call count for the session's budget session and for the current UTC month (`SpendSummary`). Reflects settled accounting. |
| `whenSettled()` | Resolves once no accounting job is pending, including jobs started while waiting. |
| `setSessionLimit(session, limitUsd \| undefined)` | Durably sets or clears the budget session's limit; rejects a negative or non-finite value with `RangeError`. |
| `setMonthlyLimit(limitUsd \| undefined)` | Writes `monthlyLimitUsd` into this plugin's profile entry through Settings, updating the live value without a remount; clearing removes the profile value. Throws when no Settings service or profile entry exists, or when Settings refuses the write. |

`findBreaches`, `spendLimitMessage`, `usageCostUsd`, `settlementUsage`, `utcMonthOf`, and `formatUsd` are exported pure helpers.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Storage

The `spend_budget` domain (version 1, `per-record` layout) has a `months` table keyed `YYYY-MM` holding `{ spentUsd, unpricedCalls }` and a `sessions` table keyed by session id holding `{ spentUsd, unpricedCalls, limitUsd? }`. A record that fails its schema rejects the domain open rather than being skipped, because a skipped record would under-count spend.

### Accounting

The service listens to the host `session/event` feed, which fires only for appended events, so replayed or fork-seeded history is never charged twice. Each request is priced first, then its month and session records are updated on one serial read-modify-write chain, and both writes enter the domain queue together. The month comes from the event's commit time; the guard compares against the month of the current time, so the monthly figure starts again at zero at the UTC month boundary.

### Guard

The `agent/pre-step` listener throws `LlmError(message, 'SPEND_LIMIT')`. The agent loop records any thrown pre-step error on the turn's `turn/end` reason as `{ kind: 'error', error: { message, code } }`; a `{ kind: 'reject' }` decision would instead end the turn as `blocked`, which no client displays.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `SpendBudget` service: domain lifetime, accounting, guard, service API |
| [`src/spec.ts`](src/spec.ts) | `spend_budget` domain and record schemas |
| [`src/cost.ts`](src/cost.ts) | Usage extraction, pricing, UTC month, dollar formatting |
| [`src/limits.ts`](src/limits.ts) | Limit evaluation and refusal text |
| [`src/types.ts`](src/types.ts) | Public summary and breach types |
| — | No runtime invariant companion is published: the ledger is the only record of spend, so no independent observation can diverge from it. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`/budget` command](../command-budget/README.md) — the human-facing view and editor for both limits.
- [Token meter](../../llm/token-meter/README.md) — the usage accounting these prices are applied to.
- [Storage subsystem](../../../docs/subsystems/storage.md#declaring-a-domain) — the domain mechanism the ledger uses.
- [Settings package](../../settings/settings/README.md) — how `monthlyLimitUsd` is edited and persisted.

-----

<a id="model-experience"></a>
## Model Experience

### Refused model step

#### What the model sees

Nothing. A refused step sends no request, and the refusal is recorded only on the turn's `turn/end` reason, which no model request includes.

#### Token effect

Zero direct tokens. A refused step spends no tokens at all.

#### KV Cache effect

None: the package adds no request content, so it neither extends nor invalidates any cached prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **List prices, not bills** — spend uses each route's published price; discounts, tiers, per-request fees, and tool or search charges billed by the provider are not counted, and a route without a published price is counted only as an unpriced call.
- **Model calls outside a session log are not counted** — requests that append no `assistant/message` or `assistant/attempt` event, such as session-title generation or compaction summaries, add nothing.
- **The limit is checked between steps** — a step that starts below the limit runs to completion, so spend can end above the limit by the cost of that step.
- **Shutdown can lose in-flight accounting** — a request still being priced when the host shuts down may be recorded only in the month record or not at all, because the storage backend can close before this plugin's drain finishes.
- **No per-month history view or reset** — past month records stay stored but no operation lists or clears them.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
