---
description: "The model-facing remember_fact tool over ctx.memoryStorage: automatic write trigger, schema, and redaction, for users and maintainers choosing or debugging the tool."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-remember

## Summary

`dsh-tool-remember` gives the agent a `remember_fact` tool: it calls this mid-session, without waiting for the user to type `/remember`, when it judges something durably useful — a fact or preference about the user, a correction about how to work, ongoing project state, or a pointer to an external system. It writes through `@deepseek-ai/dsh-memory-storage`'s `writeEntry`, the same write API `@deepseek-ai/dsh-command-remember`'s explicit `/remember` command calls, so content is screened for secrets before it reaches disk on either path.

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

Mount this package when the agent should be able to save durable memory on its own initiative, not only when the user explicitly asks with `/remember`.

### When to choose it

Choose it alongside `@deepseek-ai/dsh-command-remember` when both an automatic and an explicit write trigger are wanted; choose only `command-remember` when writes should always be user-initiated. It needs an owning agent session — a non-agent caller is rejected, matching `todo_write`'s convention.

### What each call does

The model supplies `name` (slug), `type` (one of the four memory categories), `description` (short index summary), `content` (the full text to remember), and `projectScope` (`project` or `global`). The tool redacts `description` and `content` via `@deepseek-ai/dsh-memory-redact` before either reaches the domain record or a topic Markdown file, resolves `project` scope from the calling session's working directory, and returns a short confirmation naming whether anything was withheld.

### Composing the tool

Mount `ctx.tools`, `ctx.memoryStorage`'s dependency chain, and this plugin:

```yaml
- id: system-prompt
  name: '@deepseek-ai/dsh-system-prompt'
- id: tools
  name: '@deepseek-ai/dsh-tools'
- id: storage
  name: '@deepseek-ai/dsh-storage'
- id: storage-json
  name: '@deepseek-ai/dsh-storage-json'
  config:
    root: !!js dshHomePath('storages')
- id: storage-domain
  name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
- id: memory-storage
  name: '@deepseek-ai/dsh-memory-storage'
- id: tool-remember
  name: '@deepseek-ai/dsh-tool-remember'
```

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the tool; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

- **One write choke point, shared with the explicit path.** This tool adds no redaction or durability logic of its own; it validates arguments only enough to satisfy the tool schema and calls `ctx.memoryStorage.writeEntry`, identically to `command-remember`.
- **Required, explicit fields.** `type` and `projectScope` are required tool arguments rather than defaulted server-side, so the model states its intent explicitly and the composed description documents both choices — mirroring `todo_write`'s "no hidden defaults" convention.
- **Non-agent callers are rejected.** Scope resolution needs a session `cwd`; a call with no owning agent has nowhere to scope a project-tier entry, so it fails loud rather than silently defaulting to global.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `remember_fact` schema, registration, `writeEntry` call |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- Memory subsystem — the storage domain, Markdown artifacts, and both write paths.
- [memory group map](../README.md) — the sibling group page and its package table.
- [dsh-memory-storage](../memory-storage/README.md) — the write API this tool calls.
- [dsh-command-remember](../command-remember/README.md) — the explicit write path, over the same write API.
- Generated tool catalog — the `remember_fact` schema the model receives.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schema

#### What the model sees

The generated `remember_fact` schema: an object with required `name`, `type`, `description`, `content`, and `projectScope` fields, plus a description explaining when to use it and that content is screened for secrets.

#### Token effect

Fixed schema cost on every request where the tool is visible; the description and schema are stable.

#### KV Cache effect

Prefix-stable while the definition and visibility are unchanged.

### Tool-call history and result

#### What the model sees

Each call retains its full arguments, including `content`, in the tool-call history. Success returns `Remembered "<name>" (<type>, <projectScope>).`, or the same with `; some content was withheld as a possible secret.` appended when redaction found something. A non-agent call returns `Error: remember_fact requires an owning agent session`.

#### Token effect

Token growth scales with the content the model submits; the result itself is small and fixed-shape.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No read-back or edit tool** — this package only writes; recalling or editing a stored entry is a separate concern (see the memory subsystem doc for the read side and the deferred recall-injection work).
- **No trigger guidance beyond the tool description** — whether the model calls this tool at the right moments depends entirely on prompting; there is no separate heuristic or hook that nudges the model to call it.
- **Non-agent callers are rejected** — matching `todo_write`'s convention, but meaning this tool is unusable from any automation-only surface with no owning agent session.

No runtime invariant companion is published because writes are delegated to the memory-storage service, which owns the one relationship (index vs. entry files) that could diverge; this package adds no independent mutable relationship of its own.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

#### Open question: prompted or hooked triggering

This task built the tool call itself as the automatic write trigger; it did not add prompt guidance beyond the tool's own description, nor a hook on an existing seam (e.g. end-of-turn) that could nudge or auto-invoke a write. Whether either is worth adding is open.

</details>
