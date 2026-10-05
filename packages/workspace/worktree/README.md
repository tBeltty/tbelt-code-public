---
description: "Create, list, and remove git worktrees for sessions, with shared and copied paths, setup commands, per-project settings in cordis.yml, and the sandbox roots a confined git commit needs inside a linked worktree."
kind: "package-reference"
---

# @deepseek-ai/dsh-worktree

## Summary

This plugin lets a host run each session in its own git worktree, so several agents can edit one repository in parallel without touching each other's files. It creates a branch and checkout beside the repository, links or copies the paths a project names, runs its setup commands, and removes the worktree and its merged branch afterwards. Inside a linked worktree it also lets `workspace-write` sessions run `git commit`. Settings are per project in `cordis.yml`. It needs git and does not start sessions itself.

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

Mount it with the `subprocess` capability and a git executable on the Host. Add `sandboxPolicy` to let confined sessions commit inside a worktree.

### When to choose it

Choose it when one repository serves several concurrent sessions. A single session that edits the primary checkout needs no worktree.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-worktree'
  config:
    branchPrefix: 'wt/'
    sharedPaths: ['node_modules']
    setup:
      - ['pnpm', 'install', '--frozen-lockfile']
    projects:
      - path: /Users/me/code/api
        baseRef: origin/main
        copyPaths: ['.env']
```

| Field | Default | Meaning |
|---|---|---|
| `directory` | `../{repo}-worktrees` | Directory holding one subdirectory per worktree; `{repo}` is the primary checkout's name and a relative value resolves against the primary checkout |
| `baseRef` | `HEAD` | Ref a new worktree branches from |
| `branchPrefix` | empty | Text placed before the worktree name in its branch name |
| `sharedPaths` | `[]` | Repository-relative paths symlinked from the primary checkout |
| `copyPaths` | `['.env', '.env.local']` | Repository-relative paths copied into each worktree; missing paths are skipped |
| `setup` | `[]` | Argument lists run in order inside a new worktree; the first failure stops the rest |
| `projects` | `[]` | Per-repository overrides of the six fields above, matched by absolute primary checkout path; omitted fields keep the defaults |
| `copyBudget` | 2 GiB, 50000 entries | Ceilings measured before copying; a path over them is skipped with a warning |
| `timeoutMs`, `outputMaxBytes`, `setupTimeoutMs` | 60 s, 8 MiB, 10 min | Bounds for one git command and one setup command |
| `grantGitAccess` | `true` | Contribute the git directories a confined `git commit` needs |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-worktree) is the exhaustive source for every accepted field.

`ctx.worktrees.create({ repoPath, name?, baseRef? })` returns the new path, branch, qualified base ref, starting commit, primary checkout, and warnings. A failed copy, link, or setup command becomes a warning and the worktree stays usable. `list(repoPath)` reports every worktree with its branch, head, primary, locked, and prunable state. `uncommittedChanges(path)` lists what a removal would lose. `remove({ path, force?, keepBranch? })` refuses the primary checkout and locked worktrees, and refuses uncommitted changes unless `force` is set. It deletes the branch only when it is fully merged.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`WorktreeService` resolves one git executable, runs every command through `ctx.subprocess` with bounded output and a timeout, and layers the project's settings over the defaults. Creation finds a free name and slot, runs `git worktree add --no-track -b`, reads the head, then materializes `sharedPaths` as symlinks and `copyPaths` as copies. On macOS a copy uses an APFS clone when the source and target share a volume. Every copy is sized first against the copy budget. Setup commands run last, without a shell.

Removal unlinks shared links before git touches the directory, so a symlinked `node_modules` is never deleted through the link.

The sandbox side registers an extra-roots provider with `ctx.sandboxPolicy`. For a workspace that is a linked worktree, `git-dirs.ts` reads the `.git` file and grants only host-verified directories: the worktree's private git directory plus the shared `objects`, `refs`, and `logs`. It grants nothing when the `.git` file, its `commondir`, or the back-link in the private git directory disagree with each other, so a model that rewrites `.git` gains no directory. Hooks and `config` are never granted, because a hook or `core.fsmonitor` value written there would run outside the sandbox.

| Source | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Service, config schema, create, list, remove |
| [`src/worktrees.ts`](src/worktrees.ts) | git worktree operations and slot search |
| [`src/linked-paths.ts`](src/linked-paths.ts) | Shared links and copies, with the copy budget |
| [`src/git-dirs.ts`](src/git-dirs.ts) | Validated writable roots for a linked worktree |
| [`src/settings.ts`](src/settings.ts) | Per-project settings and directory resolution |
| [`src/apfs-clone.ts`](src/apfs-clone.ts), [`src/copy-budget.ts`](src/copy-budget.ts) | Clone fast path and size ceilings |

**Runtime invariant:** No companion is published. The service owns no state beyond effect-owned registrations, and the git state it reads is not observed independently.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Sandbox policy](../../sandbox/sandbox-policy/README.md) — the seam that carries the extra writable roots.
- [Subprocess capability](../../subprocess/README.md) — how git and setup commands run.
- [Workspace changes](../../deliverables/workspace-changes/README.md) — turn summaries, which read a worktree like any repository.
- [Workspace subsystem](../../../docs/subsystems/workspace.md) — how projects and worktrees relate.
- [Session worktrees decision](../../../.agents/notes/proposed/architecture/2026-10-05-session-worktrees.md) — why roots come from host state.

<a id="model-experience"></a>
## Model Experience

### Sandbox policy context in a linked worktree

#### What the model sees

When the session's workspace is a linked worktree and `grantGitAccess` is on, the sandbox policy section gains one sentence naming the granted directories, appended after the workspace sentence:

##### Verbatim text for this field

```markdown
It may also modify files under: "<private git directory>", "<common>/objects", "<common>/refs", "<common>/logs".
```

#### Token effect

About forty tokens, fixed for the Session while the worktree layout stays the same. Nothing is added outside a linked worktree.

#### KV Cache effect

The sentence is part of the logged runtime-context snapshot, so it repeats unchanged within a Session and extends the stable prefix. Creating or removing a worktree changes the text only for Sessions whose workspace changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Windows** — the `windows-acl` runner does not support extra writable roots, so a confined session in a linked worktree fails closed there with a sandbox-unavailable error.
- **Hooks and config** — a confined session cannot edit `hooks` or `config` in the shared git directory, so `git config` and hook installation fail inside the sandbox by design.
- **Existing directories only** — a `logs` directory that does not exist yet is not granted; a commit that must create it fails until a first reflog write happens outside the sandbox.
- **Packed refs** — `packed-refs` is not granted, so a confined `git pack-refs` or `git gc` fails.
- **Setup is unconfined** — setup commands run with the Host's authority, so they come from `cordis.yml` only, never from a model.
- **Shared dependencies** — a `sharedPaths` entry such as `node_modules` is one directory for every worktree; a session that changes its dependencies changes them for all.
- **Branch cleanup** — an unmerged branch is kept after removal and must be deleted by hand.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
