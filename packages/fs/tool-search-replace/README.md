---
description: "The standalone search_replace tool over ctx.fs for users and maintainers composing SEARCH/REPLACE block editing for agents."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-search-replace

## Summary

`dsh-tool-search-replace` provides a standalone model-facing `search_replace` tool over `ctx.fs`: the model supplies one or more concatenated SEARCH/REPLACE blocks in a `diff` string, each matched against the file's current content — exactly once, verbatim, or via a whitespace-tolerant fallback — and applied in order. The result is written back through the same `fs/edit-intent` waterfall, sandbox policy, and `fs/observed` emission every fs-mutating tool in this family uses. Choose it for Aider/Claude-Code-style multi-hunk diff editing on absolute paths; `dsh-tool-str-replace-editor` provides the single-hunk alternative, and `dsh-tool-fs` the `read`/`write`/`edit` suite.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the tool alongside a `ctx.fs` backend (and, for guarded mutations, the policy plugin) when the model should edit files through concatenated SEARCH/REPLACE blocks.

### Minimal composition

A backend, optionally the policy plugin, then the tool.

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-fs-observation-policy'
- name: '@deepseek-ai/dsh-tool-search-replace'
```

### The `search_replace` tool

The tool takes an absolute `path` and a `diff` string of one or more concatenated blocks:

Each block opens with a search marker line, holds the exact text to find, a divider line, the replacement text, then a closing replace marker line — see the tool's own `description` in [`src/index.ts`](src/index.ts) for the literal wire format, reproduced there as a `.join('\n')` of plain strings rather than here as a fenced block, since a bare marker line trips this repo's leftover-conflict-marker check.

Each block's SEARCH text must match exactly one place in the file, verbatim, including whitespace. Blocks apply in sequence, each against the result of the previous one, so later blocks may target text a prior block just introduced. When a block's SEARCH text has zero exact (substring) matches, the tool retries with a whitespace/indentation-tolerant comparison (leading/trailing whitespace trimmed per line, internal runs collapsed) before failing; that fallback itself requires a unique match — an ambiguous fuzzy match is still an error, not a guess. A zero or multiple exact/fuzzy match throws `FS_EDIT_NOT_FOUND` / `FS_AMBIGUOUS_EDIT` respectively, with line numbers in the message. A successful result that used the fuzzy fallback for any block is prefixed with an explicit note naming which blocks (1-based) matched only after normalization, so the model isn't misled into thinking the file already had that exact formatting.

### Failures and recovery

Mutations resolve the `fs/edit-intent` waterfall before touching the provider, so a mounted policy plugin's guard (e.g. `FS_NOT_OBSERVED` — read the file, then retry) applies exactly as it does for the other fs-mutating tools; without a policy plugin mounted, the write is unconditional. Sandbox denials surface as the shared `[sandbox: file access denied under <mode> mode]` marker rather than a raw exception. Paths must be absolute; a relative path is refused with a hint. A missing path throws `FS_NOT_FOUND`; a directory throws `FS_NOT_REGULAR_FILE`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the tool and points at the code that realizes them; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design concept

Parsing, exact/fuzzy matching, and application are pure in-memory transforms decoupled from the fs seam, so their correctness is testable without a filesystem. `execute` composes them with the same guard chain `tool-str-replace-editor`'s `replaceInFile` uses: resolve the sandbox policy, resolve the target, run the `fs/edit-intent` waterfall, read the current content, run the pure pipeline, then write the result through `ctx.fs.writeText` guarded by the observed or waterfall-supplied version, mapping a sandbox denial through the shared marker before it reaches the model.

### Source map

| File | Role |
|---|---|
| [`src/parser.ts`](src/parser.ts) | Parses the SEARCH/REPLACE wire format into `{ search, replace }` blocks |
| [`src/fuzzy.ts`](src/fuzzy.ts) | Whitespace/indentation-tolerant fallback matcher, naive line-window normalization only |
| [`src/apply.ts`](src/apply.ts) | Sequential exact-then-fuzzy application of parsed blocks against an in-memory string |
| [`src/index.ts`](src/index.ts) | The tool: schema, sandbox/mutation policy, `fs/edit-intent` wiring, and the read-apply-write flow |

### How a call runs

`execute` resolves the sandbox policy and target, obtains the edit-intent guard (or `undefined` when no policy plugin is mounted), reads the current content, parses and applies the blocks in memory, then writes the result back with the guard's version (or the freshly observed one) as the compare-and-swap basis, wrapped so a provider-level sandbox denial becomes the shared marker text. On success it records the write's resulting version via `fs/observed`.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [Filesystem subsystem](../../../docs/subsystems/filesystem.md) — exhaustive provider contract, policy events, and error taxonomy.
- [dsh-fs](../fs/README.md) — the `ctx.fs` contract this tool consumes.
- [tool-str-replace-editor](../tool-str-replace-editor/README.md) — the single-hunk `view`/`create`/`str_replace`/`insert` alternative this tool's mutation flow mirrors.
- [tool-fs](../tool-fs/README.md) — the alternative `read`/`write`/`edit` tool suite.
- [fs-observation-policy](../fs-observation-policy/README.md) — the policy plugin that guards mutations through the `fs/*` events.
- [fs-sandbox](../fs-sandbox/README.md) — the sandbox-enforcing backend that fences mutations.
- [Generated tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-search-replace) — the exhaustive schema this package registers.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schema

#### What the model sees

The generated [`search_replace` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-search-replace): a required absolute `path` string and a required `diff` string describing one or more concatenated SEARCH/REPLACE blocks.

#### Token effect

Fixed, minimal schema cost while `search_replace` is visible.

#### KV Cache effect

Prefix-stable; the schema does not change at runtime.

### Tool results

#### What the model sees

The file's resulting content on success, optionally prefixed with a note naming which blocks matched only fuzzily. Failures report `FS_EDIT_NOT_FOUND` / `FS_AMBIGUOUS_EDIT` with line numbers, guarded-mutation codes and remedies from the mounted policy plugin, or the `[sandbox: ...]` marker.

#### Token effect

Proportional to the edited file's size; no clipping is applied.

#### KV Cache effect

Append-only tool results follow the reusable request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the tool is a poor fit or needs special operational care. They are current package constraints, not a general editor comparison or a task backlog.

- **Fuzzy fallback is naive line-window normalization only** — leading/trailing whitespace trimmed per line and internal runs collapsed; no token-level similarity scoring. A documented future enhancement, not this version's scope.
- **No `view`, `create`, or `insert` commands** — this package only edits an existing file's content via SEARCH/REPLACE blocks; use `dsh-tool-str-replace-editor` or `dsh-tool-fs` for viewing, creation, or line-based insertion.
- **Every mutation goes through the mounted policy and sandbox** — `fs/edit-intent` resolves the current session sandbox policy and delegates enforcement to the mounted filesystem and policy plugins, so a deployment without them gets unconditional mutations.
- **Operations target UTF-8 text** — binary files are unsupported.

No runtime invariant companion is published because enforcement is delegated to the mounted policy and sandbox plugins; this package owns no independently observable mutable relationship of its own.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
