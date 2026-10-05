---
description: "Pre-edit file snapshots recorded as checkpoint commits under refs/tbelt-code/checkpoints, and the undo() restore path over them, for maintainers reviewing the git safety net's plumbing and composition rules."
kind: "package-reference"
---

# @deepseek-ai/dsh-git-safety-net

English

## Summary

This package snapshots a file's content immediately before an agent-initiated edit proceeds, recording it as a checkpoint commit under a dedicated ref via raw git plumbing only — never `git add`, `git commit`, or `git stash` — so the user's actual index, `HEAD`, and stash stay untouched. Outside a git repository, or on any internal failure, it logs and no-ops rather than blocking the edit. It also exports `undo(ctx, agent, signal)`, which restores every file the current turn touched back to its pre-turn content; `@deepseek-ai/dsh-command-undo` exposes it as `/undo`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

```ts
import type { Context } from '@deepseek-ai/cordis'
import * as GitSafetyNet from '@deepseek-ai/dsh-git-safety-net'

declare const ctx: Context

await ctx.plugin(GitSafetyNet)
```

### When to choose it

Mount it in any composition that also mounts `ctx.fs` (`@deepseek-ai/dsh-fs` plus a backend such as `@deepseek-ai/dsh-fs-local`) and wants every agent-initiated edit to leave a recoverable pre-edit snapshot behind, with no visible tool call and no effect on the user's own git state. It registers no service and no model-facing tool — mounting it is the entire integration surface.

### What you get

One `fs/edit-intent` listener, registered with `prepend: true` so it always observes the pre-edit content before any other `fs/edit-intent` listener (such as `@deepseek-ai/dsh-fs-observation-policy`) gets a chance to own the decision and short-circuit without calling `next()`. On each edit-intent for a target inside a git working tree, it reads the file's current content, writes it as a blob, builds a tree identical to the checkpoint chain's parent except that one blob, commits it with a fixed, user-independent author/committer identity and a `Checkpoint-Turn:` trailer naming the recording agent's current turn (0 when no agent, or no `@deepseek-ai/dsh-agent-loop`, is composed), and points `refs/tbelt-code/checkpoints` at the new commit. Consecutive checkpoints in the same process chain onto each other (each checkpoint's parent is the previous checkpoint, or the repository's `HEAD` for the first one), so the ref is a real, walkable history.

The package also exports `undo(ctx, agent, signal)`: it reads `agent.session`'s `turnBoundary` projection to find the current turn, walks the checkpoint chain back through every commit tagged with that turn, and for each distinct file restores the content from the OLDEST such checkpoint (immediately before the turn's first edit to it) via `ctx.fs.resolve` → the `fs/write-intent` waterfall → `ctx.fs.writeText` → `fs/observed` — the same whole-file-replacement sequence a full-content tool write uses, so a file independently modified since its checkpoint reports `FS_STALE_VERSION` instead of being silently overwritten. `undo()` registers no service; it is a plain exported function so `@deepseek-ai/dsh-command-undo` (or any other caller) invokes it directly with an already-injected `Context`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design philosophy

- **`node:child_process`, not `ctx.shell`.** `ctx.shell` is the model-facing bash execution seam: depending on composition it may run behind a sandboxing executor (`dsh-bash-sandbox`), applies output-byte caps and a model-friendly terminal environment meant for foreground tool calls, and its `ShellExecRequest.stdin` is a `string`, not a `Buffer` — lossy for arbitrary (including binary-adjacent) file content. This package's snapshots are internal, non-model-visible plumbing with no reason to inherit any of that; `node:child_process.spawn` gives direct `Buffer` stdin/stdout with no sandbox-composition dependency.
- **Plumbing only, never porcelain that touches shared state.** `git hash-object -w --stdin` writes a loose blob straight into the object database. Building the tree uses a scratch index file (`GIT_INDEX_FILE` pointed at a private temp path for that one build) so `git read-tree`/`git update-index`/`git write-tree` never open the repository's real `.git/index`. `git commit-tree` and `git update-ref refs/tbelt-code/checkpoints` never touch `HEAD` or any other ref. No command in this package ever runs `git add`, `git commit`, `git checkout`, or `git stash`.
- **Fixed checkpoint identity.** Checkpoint commits use a fixed `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_NAME`/`GIT_COMMITTER_EMAIL` rather than the user's own git config, so checkpointing never depends on (or pollutes) the user's identity configuration and an unconfigured `git config user.*` never blocks a snapshot.
- **`prepend: true` is load-bearing, not stylistic.** `fs/edit-intent` is a single-decision waterfall: `@deepseek-ai/dsh-fs-observation-policy`'s own listener occupies the decision slot and never calls `next()`. A listener registered afterward in the ordinary (push) slot would never run at all whenever that policy is mounted. Registering with `prepend: true` guarantees this listener always observes the pre-edit content first, regardless of the bundle's own registration order.
- **Fails open, always.** Every failure path — not inside a git repository, the `git` binary missing, a plumbing command failing, the file being unreadable — is caught, logged through `ctx.logger`, and never rethrown. The listener always calls `next()` so the edit it is meant to protect against is never itself blocked by the safety net.
- **Turn attribution reads an optional projection, never history.** Checkpointing reads `ctx.get('sessionProjections')` (optional — `inject` does not require it) rather than requiring `@deepseek-ai/dsh-agent-loop` to be composed, and never calls a synchronous whole-log Session reader (`Session.ownEvents()` and siblings are deprecated for new production callers). Absence of the registry, or of the `turnBoundary` key inside it, reads as turn `0`, matching that projection's own documented capability-absence contract.
- **Turn and path are read from commit-message trailers, not diffed off the tree.** A checkpoint's tree is frequently IDENTICAL to its parent's — a file's first checkpoint in a session records the same content already at `HEAD`, so `git diff-tree` finds no changed path in exactly that common case. `undo()` instead parses the `Checkpoint-Turn:`/`Checkpoint-Path:` trailer lines `commitCheckpointTree`'s caller embeds in every checkpoint's message body.
- **Exact content requires skipping `runGit`'s newline trim.** `runGit` trims one trailing newline by default because every plumbing command that reports a SHA, ref, or status line ends its own output in exactly one `\n`; the restore read (`git show <sha>:<path>`) passes `trimTrailingNewline: false` so a real file ending in `\n\n`, or with no trailing newline at all, restores byte-for-byte instead of losing or gaining a character.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The Cordis plugin: `fs/edit-intent` registration, per-repository checkpoint chaining, turn attribution, error containment |
| [`src/git-plumbing.ts`](src/git-plumbing.ts) | The `node:child_process`-based git plumbing primitives: checkpoint recording (`runGit`, `findRepoRoot`, `writeBlob`, `buildCheckpointTree`, `commitCheckpointTree`, `updateCheckpointRef`) and checkpoint restore (`resolveCheckpointRef`, `readCheckpointCommit`, `readCheckpointedContent`) |
| [`src/undo.ts`](src/undo.ts) | `undo(ctx, agent, signal)`: walks the checkpoint chain for the current turn and restores each file through the ordinary `ctx.fs` write path |

</details>

-----

<a id="model-experience"></a>
## Model Experience

None, as this package registers no prompt, tool schema, or model-visible result — its `fs/edit-intent` listener runs entirely between an edit tool's decision to proceed and the edit itself, and is designed so a checkpoint never appears as a visible tool call in the session log.

#### KV Cache effect

Nothing here enters a model request, so provider cache reuse is unaffected.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **File mode fidelity is not preserved** — checkpoint blobs are always recorded with mode `100644` (regular, non-executable). A checkpoint of an executable file loses its executable bit; `undo()` restores content only and does not reapply it.
- **No pruning or size bound on `refs/tbelt-code/checkpoints`** — every edit-intent inside a git repository grows the checkpoint chain by one commit (plus the blob and tree objects it references) for as long as the process runs. Nothing in this package expires old checkpoints or runs `git gc`; a long-running session on a repository with many large-file edits accumulates object-database growth with no built-in cap.
- **Checkpoint chaining is per-process** — the "previous checkpoint or `HEAD`" parent choice is tracked in an in-memory map that resets when this plugin's composition disposes (a fresh process, or an HMR reload); a resumed session's first edit after a fresh process chains onto `HEAD` again, not onto its own pre-restart checkpoints.
- **Symlinked and non-regular targets are not specially handled** — the listener reads whatever `ctx.fs.readText` returns for the target; a target `readText` rejects (a directory, a binary file, a target `FS_NOT_FOUND` mid-race) surfaces as a caught, logged, no-op checkpoint rather than a typed distinction between these cases.
- **`undo()` stops at the first restore failure** — a stale-version conflict or other filesystem error partway through a multi-file turn leaves earlier files in the same call restored and later ones untouched; there is no automatic rollback or retry.

No runtime invariant companion is published because the checkpoint chain is in-memory, per-process state with no durable counterpart it could drift from.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
