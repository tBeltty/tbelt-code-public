---
description: "Package map for the git safety net family: pre-edit checkpoint snapshots recorded via git plumbing and the /undo command that restores them, for users and maintainers relying on or extending the safety net."
kind: "package-group"
---

# git-safety/ — pre-edit checkpoint safety net

## Summary

The `git-safety/` group gives every agent-initiated file edit a durable, recoverable pre-edit snapshot, without ever touching the user's own git state, and a human-triggered way to restore it. `git-safety-net` records a checkpoint commit before each edit inside a git repository, via git plumbing only — never `git add`, `git commit`, or `git stash`; outside a repository, or on any internal failure, it logs and no-ops rather than blocking the edit. `command-undo` registers `/undo`, which reverts every file the current turn checkpointed back to its pre-turn content through the ordinary `ctx.fs` write path.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | What it provides |
|---|---|
| [`git-safety-net/`](git-safety-net/README.md) | Records a checkpoint commit before each agent-initiated edit, via git plumbing only, and the `undo()` restore path |
| [`command-undo/`](command-undo/README.md) | Registers `/undo`, which reverts the current turn's checkpointed edits |

-----

<a id="related-documentation"></a>
## Related documentation

Start with the filesystem subsystem for the `fs/edit-intent` waterfall this group listens on.

- Filesystem subsystem reference — the `fs/*` waterfalls and provider contract this group's listener composes with.
- [`fs/` group README](../fs/README.md) — the filesystem capability family's package map.
- Cordis waterfall semantics — how a single-decision waterfall composes multiple listeners, and why registration order matters here.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
