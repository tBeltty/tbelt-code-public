---
description: "The /budget command: view this session's and this month's model spend, and set or clear either spend limit."
kind: "package-reference"
---

# @deepseek-ai/dsh-command-budget

## Summary

`dsh-command-budget` adds a `/budget` command to chat UIs. With no arguments it shows what this session and this month have spent on model requests and their limits. With an amount it sets this session's spend limit; `month <usd>` sets the monthly limit for every session; `off` clears either one. Spend and the limits are owned by [`@deepseek-ai/dsh-spend-budget`](../spend-budget/README.md), which refuses the next model step once a limit is reached. The command does not consume a model turn.

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

### Using the command

| Input | Result |
|---|---|
| `/budget` | `This session: $0.42 of $2.00. This month: $3.10 of $20.00.` — `of …` is left out when there is no limit, and a count of unpriced model calls is added when there are any. |
| `/budget <usd>` | Sets this session's limit, for example `/budget 2` or `/budget $2.50`: `This session's spend limit is now $2.00.` |
| `/budget off` | Clears this session's limit: `This session has no spend limit now.` |
| `/budget month <usd>` | Sets the monthly limit through Settings: `The monthly spend limit is now $20.00.` |
| `/budget month off` | Removes the monthly limit from the profile: `There is no monthly spend limit now.` |
| anything else | `Usage: /budget, /budget <usd>, /budget off, /budget month <usd>, or /budget month off` |

An amount is digits with an optional fraction and an optional leading `$`. In a subagent session the command reads and sets the limit of the top session of its subagent lineage. When Settings cannot write the monthly limit, the command answers `Could not change the monthly spend limit: <reason>`.

### Composing the command

Mount the command registry, the spend budget service, and this plugin:

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: spend-budget
  name: '@deepseek-ai/dsh-spend-budget'
- id: command-budget
  name: '@deepseek-ai/dsh-command-budget'
```

The `dsh` base bundle mounts both rows; the Web and Desktop app keep them on the host plane, so `/budget` is available in every session.

### What happens to the conversation

The command records only its own `command/run`/`command/done` pair in the session log; it never adds conversation messages.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`parseBudgetInput` turns the raw input into a summary or limit request, and `describeSummary` renders the one-line summary; both are exported pure functions. The handler waits for pending accounting before a summary so a request that just finished is included. The lifecycle effect unregisters `/budget` before draining started handlers, so teardown waits for any in-flight limit write.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: parsing, summary text, limit changes, registration and drain |
| — | No runtime invariant companion is published: the command owns no state; `dsh-spend-budget` owns the ledger and the command registry owns dispatch. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Spend budget package](../spend-budget/README.md) — pricing, storage, and the step guard behind the figures.
- [Commands package](../../interaction/commands/README.md) — the registry and dispatch contract behind chat commands.

-----

<a id="model-experience"></a>
## Model Experience

### Human `/budget` control

#### What the model sees

The slash input and its result never enter a model request; only the command's `command/run`/`command/done` pair is recorded in the session log.

#### Token effect

Zero. The command performs no model request and adds no model-visible content.

#### KV Cache effect

None: the command adds no request content, so it neither extends nor invalidates any cached prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Command adapters only** — surfaces without `ctx.commands` cannot show or change the limits; a Settings page and a status display are not built yet.
- **`month off` removes only the profile value** — a monthly limit set in a lower configuration layer, such as a bundle patch, applies again after `/budget month off`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
