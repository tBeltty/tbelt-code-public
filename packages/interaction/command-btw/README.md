---
description: "Side conversation for a running Session: the `/btw` command and the `btw` Host Remote that answer a question without interrupting the agent and deliver the exchange to it as context; for users and maintainers composing or debugging side questions."
kind: "package-reference"
---

# @deepseek-ai/dsh-command-btw

## Summary

`dsh-command-btw` lets a user ask a question while the agent is still working, without stopping it. A separate model call answers from a text copy of the main conversation, so the agent's turn and context stay untouched. Delivering the side conversation queues the exchange, or a short summary of a long one, on the agent as a user message that it reads at its next step or turn. The package ships a `/btw` command for any command adapter and the `btw` Host Remote behind the Web dialog. It ships with the standard `dsh` base and needs no configuration.

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

The command ships with the standard `dsh` base and needs no configuration. In the Web and desktop client a bare `/btw`, or `/btw` followed by a question, opens the side-question dialog (see [ui-btw](../../client/ui-btw/README.md)); in the terminal client the command prints the answer in the transcript.

### The `/btw` command

| Input | Result |
|---|---|
| `/btw why did you pick that file?` | Answer the question and keep it in the side conversation. |
| `/btw --send` | Deliver the turns not yet delivered to the main conversation. |
| `/btw --reset` | Discard the side conversation. |
| `/btw` | A usage error. |

Each question sees the main conversation as it stands, including the turn in progress, plus every earlier side turn. The side model cannot call tools or change files, and it uses the provider and model of the Session's latest request.

### Delivering context

`--send` carries only turns not delivered before. An exchange up to `maxVerbatimChars` characters goes word for word; a longer one is condensed first by one more model call. The delivery is a user message that tells the agent the user held a side conversation and that its content is context for the next steps, not a new request. A running agent reads it at its next step boundary; an idle agent reads it with the next message the user sends. Delivering never starts a turn.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `maxTranscriptChars` | `60000` | Characters of the main conversation passed with each question; older entries are dropped first |
| `maxAnswerTokens` | `2048` | Token cap for one answer |
| `maxVerbatimChars` | `3000` | Longest exchange delivered word for word |
| `maxSummaryTokens` | `600` | Token cap for a condensed delivery |

The generated configuration catalog is the exhaustive source for every accepted field and its JSDoc.

### Asking from your own UI

A UI calls the `btw` Remote instead of the command, which keeps the side conversation out of the transcript. `ask`, `send`, `reset`, and `get` take a `sessionId`; `ask` also takes the question. Each answers `session-not-found` when no live Session carries the id, and a second operation while one is running answers `busy`. A custom app mounts the command registry and this plugin:

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: command-btw
  name: '@deepseek-ai/dsh-command-btw'
```

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design concept

The side conversation is a separate request, not a second agent: it never enters the main Session's history, so the main agent's cache prefix, step ordering, and tool state are untouched. Only delivery crosses over, and it crosses through the agent's inbox, the one path that logs a model-visible message.

### How a question runs

The service renders the Session's derived messages as labelled text, keeping the newest entries within `maxTranscriptChars`; tool calls appear by name and tool results are clipped. Text keeps the call independent of tool declarations and reasoning replay state, so any provider route accepts it. One tool-less `ctx.llm.stream()` call carries the transcript, the earlier side turns, and the question. The thread lives in memory per live Agent, so it ends with the process or the Session's unload; a delivered exchange stays in the main conversation as the logged user message.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `BtwService` (the `btw` Remote and command logic), `Config`, `/btw` registration |
| [`src/transcript.ts`](src/transcript.ts) | Text rendering of the main conversation within a character budget |
| [`src/types.ts`](src/types.ts) | Thread, Remote request, and result types shared with the browser |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They cover the registry, the inbox the delivery uses, and the Web dialog.

- [dsh-commands](../commands/README.md) — the registry that discovers the global command.
- [dsh-agent](../../core/agent/README.md) — `inject` and the inbox the delivery queues on.
- [ui-btw](../../client/ui-btw/README.md) — the Web dialog and its "Send context to chat" button.
- [Interaction package map](../README.md) — where side questions sit next to the other human controls.

-----

<a id="model-experience"></a>
## Model Experience

### Side question and delivered context

#### What the model sees

The main agent sees nothing while a side question runs. After a delivery it sees one user message: a short framing that the user held a side conversation and that its content is context for the next steps, then the exchange or its summary between `<side_conversation>` tags. The side model sees its own instruction, a text rendering of the main conversation, the earlier side turns, and the question. The question, the answer, and `/btw` lifecycle records are log-only; the delivered message is logged as an inbox insertion and a user message.

#### Token effect

A side question adds no tokens to the main conversation. Each question costs one separate request carrying up to `maxTranscriptChars` characters of transcript, with no cache reuse from the main request. A delivery adds the exchange, or at most `maxSummaryTokens` tokens of summary, to the main conversation once.

#### KV Cache effect

The main request prefix is unchanged by a side question. A delivery appends one user message after the existing history at a step boundary, so the cached prefix stays reusable.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define where the side conversation is a poor fit or behaves differently than a user might expect. They are current package constraints, not a task backlog.

- **No tools in the side conversation** — it cannot read files or run commands, so it answers from the transcript and general knowledge; tool results appear clipped.
- **Thread is not durable** — the side conversation lives in memory per live Agent and is lost on restart or unload; only a delivered exchange survives, in the main log.
- **One operation at a time** — a question, delivery, or reset while another runs answers `busy`.
- **Delivery waits for the next step** — an idle agent reads delivered context only with the next message the user sends, and a request whose step boundary already passed reads it one step later.
- **Terminal answers enter the transcript** — the `/btw` text command records the question and answer as command lifecycle events; only the Remote path stays out of the transcript.
- **Web and terminal clients only among the shipped entry points** — headless mode, ACP automation, and JSON-RPC provide no command adapter.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers; it is explicitly non-authoritative. Shipped behavior, limits, and rationale live in the sections above and the package code.

- The delivery framing and the `<side_conversation>` tags are pinned by [`tests/command-btw.spec.ts`](tests/command-btw.spec.ts); changing them changes model-visible text.
- A durable side thread would need its own session event; nothing in the current contract reserves a format for it.

</details>
