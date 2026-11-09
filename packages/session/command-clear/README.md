---
description: "The human-facing /clear and /cleared commands for users and maintainers who need to reset a session's model-visible context on demand, without losing the durable log."
kind: "package-reference"
---

# @deepseek-ai/dsh-command-clear

## Summary

Type `/clear` to reset the current conversation to empty context: every prior message except the system prompt stops being visible to the model and the UI, replaced by one "Context cleared" checkpoint. Nothing is deleted — the durable session log keeps every original event, so `/cleared` can read back exactly what the last clear removed. An active Goal is not affected; the command only notes that its explaining context was just cleared.

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

Mount the command registry and this plugin:

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: command-clear
  name: '@deepseek-ai/dsh-command-clear'
```

### Using the commands

| Input | Result |
|---|---|
| `/clear` | Shadow the current surface after the system prompt; report the item count and estimated tokens. |
| `/clear` with no history yet | `Nothing to clear yet.` — nothing changes. |
| `/clear <anything else>` | Usage error — takes no argument. |
| `/cleared` | Reconstruct and print the most recently cleared span as readable text. |
| `/cleared` before any clear | `Nothing has been cleared in this session yet.` |
| `/cleared <anything else>` | Usage error — takes no argument. |

Two separate, both argument-free commands, not one command with a `--history` flag. A command that declares a client-side `input` descriptor (`CommandInputDescriptor`) — the mechanism that would let one line carry both an action and free-form arguments — puts every invocation through the composer's two-step claim-then-submit flow, including the common bare case. `/clear`'s common case is bare, so it stays argument-free, matching `/compact`'s own choice for the same reason; the read-back path gets its own bare command instead of an argument on this one.

### What happens to the conversation

Every message the model or the UI can currently see, except the system prompt at the head of the surface, is shadowed by one replacement checkpoint under a `context/clear` transaction, the same `surfaceOp: { op: 'replace' }` mechanism compaction uses, kept under its own event name so a manual clear never enters compaction's own analytics. The durable log is append-only and is never rewritten. The rendered text of the shadowed span is captured into the replacement checkpoint's own message source while that content is still live, which is exactly what `/cleared` reads back. An open Goal is untouched by a clear; the command only appends a note that the context explaining it was just removed. The system prompt stays because the session accepts only a `system/message` replacement over that node.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design philosophy

- **Reuse the shadow mechanism, not a new one.** The only two `SurfaceOp` variants are `append` and `replace`; `/clear` is the full-range special case of the same `replace` transaction compaction and the tool-result pruner already use, not new session-log machinery.
- **An idle agent is required**, via `Agent.runMaintenance` — the same guarantee `/compact`'s backend relies on for a session mutation, so a clear cannot race a running turn.
- **Recoverable by design.** Unlike a summary, a clear loses no information — the shadowed span is read back verbatim, not reconstructed from a lossy digest.
- **Two commands, not one with a flag** — see [Using the commands](#use-this-package) above for why a shared `--history` argument was rejected after live verification showed its real composer-side cost.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `clearNow`, `readClearedHistory`, `/clear` and `/cleared` registration |
| [`src/checkpoint.ts`](src/checkpoint.ts) | The `{ kind: 'clear-checkpoint' }` message-source marker and predicate |
| [`src/types.ts`](src/types.ts) | The `context/clear` `SessionEventMap` declaration |
| [`src/errors.ts`](src/errors.ts) | `ManualClearError` and its closed failure-code union |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Compaction seam](../../compaction/compaction/README.md) — the `replace` shadow mechanism this command reuses.
- [Commands package](../../interaction/commands/README.md) — the registry and dispatch contract behind chat commands, including `CommandInputDescriptor`.
- [Goal package](../../goal/goal/README.md) — the service this command reads to note an open Goal, never to block on it.

-----

<a id="model-experience"></a>
## Model Experience

### Human `/clear` and `/cleared` control

#### What the model sees

Both commands are human-only; the model never invokes them. A cleared span is never model-visible again after the checkpoint lands — the next model turn sees only the replacement message `Context cleared.` in that position, with no trace of the shadowed content.

#### Token effect

Clearing removes the shadowed span's tokens from every later request; the replacement message is a small, fixed-size addition in their place.

#### KV Cache effect

A clear invalidates any cache keyed on the shadowed prefix, the same as compaction's own surface replacement.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- `/cleared` only reconstructs the single most recent clear; earlier ones are still in the durable log but need a direct log read, not this command.
- There is no UI card for the clear checkpoint yet — it renders through the generic command-result line, consistent with every other command in this product's palette (Goal, Plan, Compact, Permission, Model, Export are all text-only too).
- The open-Goal check is advisory text only; it does not block the clear or require a confirmation argument.

No runtime invariant companion is published because this command reuses `@deepseek-ai/dsh-session`'s own surface-replace mechanism, which owns the one relationship (log vs. surface) that could diverge; this package adds no independent mutable relationship of its own.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
