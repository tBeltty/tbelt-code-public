---
description: "The on-demand /undo command for interactive compositions: what it does, what you see, and how to mount it."
kind: "package-reference"
---

# @deepseek-ai/dsh-command-undo

## Summary

`dsh-command-undo` adds an `/undo` command to chat UIs: type it and every file the current turn edited is restored to the content it had immediately before that turn's first edit to it. It reverts through `@deepseek-ai/dsh-git-safety-net`'s checkpoint chain and does not consume a model turn; after it finishes you see which files were restored, or that there was nothing to undo. The command works alongside `@deepseek-ai/dsh-git-safety-net` and requires nothing else composed to record checkpoints — the two packages are typically mounted together.

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

Type `/undo` in a chat UI to revert the current turn's file edits.

### Using the command

| Input | Result |
|---|---|
| `/undo` | Restore every file the current turn checkpointed to its pre-turn content, then report which files were restored. |
| `/undo` with no started turn, or no checkpoint belonging to it | `Nothing to undo.` — nothing changes. |
| `/undo <anything>` | `Usage: /undo (no arguments)` — the command takes no arguments. |

### What you see

| Situation | Message you see |
|---|---|
| A file changed independently since its checkpoint (a stale-version conflict), or another filesystem failure | `Undo could not restore the file: <detail>` |
| The command is cancelled mid-restore | `Undo cancelled.` — files already restored before cancellation stay reverted. |

### Composing the command

Mount the command registry, `@deepseek-ai/dsh-git-safety-net`, and this plugin:

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: git-safety-net
  name: '@deepseek-ai/dsh-git-safety-net'
- id: command-undo
  name: '@deepseek-ai/dsh-command-undo'
```

Mounting `@deepseek-ai/dsh-agent-loop` alongside these composes `/undo`'s notion of "the current turn" (`agent.session`'s `turnBoundary` projection); without it every call reports `Nothing to undo.`, matching that projection's own capability-absence contract rather than failing.

### What happens to the conversation

The restore writes files on disk through the ordinary `ctx.fs` write path; it never edits the session's conversation history, and the command lifecycle (`command/run`/`command/done`) is recorded in the session log but never enters model history.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the command; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

- **Thin command over `undo()`.** The handler depends only on `@deepseek-ai/dsh-git-safety-net`'s exported `undo(ctx, agent, signal)`; this package owns argument rejection, result-text formatting, and turning an `FsError` into a human-facing message, not the restore mechanics themselves.
- **Expected filesystem failures become messages, not rethrows.** A restore conflict (the file changed since its checkpoint) and any other `FsError` `undo()` can surface are exactly the situations a human invoking `/undo` needs explained; anything else is an implementation bug and rethrows, matching `command-compact`'s own failure-mapping convention.
- **Quiescent teardown.** The lifecycle effect unregisters `/undo` before draining already-started handlers, so an aborted command's in-flight restore settles before root disposal completes.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `/undo` registration, argument rejection, `FsError`-to-message mapping, lifecycle drain |
| — | No runtime invariant companion is published; this command adapter owns no state or event stream; `git-safety-net` owns the checkpoint chain and restore mechanics, and the command registry owns registration and dispatch lifecycle. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough; they move from the command to the checkpoint mechanism it reverts and the registry it dispatches through.

- [Git safety net package](../git-safety-net/README.md) — the checkpoint chain and `undo()` restore path this command triggers.
- [Commands package](../../interaction/commands/README.md) — the registry and dispatch contract behind chat commands.
- [Agent-loop package](../../core/agent-loop/README.md) — the `turnBoundary` projection `undo()` reads to determine the current turn.

-----

<a id="model-experience"></a>
## Model Experience

### Human `/undo` control

#### What the model sees

The slash input and direct result never enter a model request. Restored files are ordinary on-disk changes with no session-log event of their own; only the command's own `command/run`/`command/done` pair is recorded.

#### Token effect

The command lifecycle adds no model tokens. A restored file's later contents (if re-read by a tool) reflect the reverted state on the next read.

#### KV Cache effect

Discovery and command bookkeeping do not affect the cache; this command performs no model request itself.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the command is a poor fit; they are the current package constraints.

- **No partial-failure recovery** — a restore conflict on one file stops the loop; files already restored earlier in the same call stay reverted, and the command does not retry or roll them back.
- **No arguments** — the argument-free form keeps behavior stable across command adapters; there is no way to target a specific earlier turn or a single file.
- **Command adapters only** — surfaces without `ctx.commands` cannot invoke it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
