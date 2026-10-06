---
description: "The model-facing recall_memory tool: on-demand, literal-keyword topic-file recall over ctx.memoryStorage, for users and maintainers choosing or debugging the tool."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-recall-memory

## Summary

`dsh-tool-recall-memory` gives the agent a `recall_memory` tool for pulling a stored memory entry's full content into context on demand, by literal keyword — distinct from `@deepseek-ai/dsh-memory-recall`'s always-on `agent/pre-step` index injection, which carries only short descriptions. Matching is a case-insensitive substring search over entry names, descriptions, and topic-file bodies; there is no semantic or embedding-based search anywhere in this path.

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

Mount alongside `ctx.tools` and `ctx.memoryStorage`'s dependency chain:

```yaml
- id: tools
  name: '@deepseek-ai/dsh-tools'
- id: memory-storage
  name: '@deepseek-ai/dsh-memory-storage'
- id: tool-recall-memory
  name: '@deepseek-ai/dsh-tool-recall-memory'
```

### What each call does

The model supplies `query` (a literal keyword or phrase) and optionally `type` (restrict to one memory category) and `scope` (`project` | `global` | `both`, default `both`). The tool scans `ctx.memoryStorage.listEntries` for each considered scope, matching `query` case-insensitively against each entry's name, description, and — when the summary fields do not match — its topic-file body, and returns up to ten matches with a short excerpt around the first hit. It needs an owning agent session to resolve `project` scope from the calling session's working directory, matching `remember_fact`'s convention.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design philosophy

- **Literal matching only, by design.** Retrieval is a pure case-insensitive substring search over `ctx.memoryStorage`'s already-loaded records and topic files — no LLM or embedding call, so recall stays a deterministic function of what is stored, per `.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md:88`.
- **Description-first, body-fallback matching.** An entry whose name or description already matches skips its body read entirely; only a candidate that needs the body read incurs the extra I/O, keeping an ordinary query over a small index cheap.
- **A separate tool from the always-on injection.** `@deepseek-ai/dsh-memory-recall`'s index injection already puts every entry's description in context every step; this tool exists for the deliberately more expensive case of pulling a matching entry's full body on demand, so the always-on cost stays bounded by index size alone.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `recall_memory` schema, scope resolution, keyword matching |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- Memory subsystem — the storage domain, Markdown artifacts, and both write paths.
- [memory group map](../README.md) — the sibling group page and its package table.
- [dsh-memory-storage](../memory-storage/README.md) — `listEntries`/`readEntry`, the read API this tool calls.
- [dsh-memory-recall](../memory-recall/README.md) — the always-on index injection this tool complements.
- Generated tool catalog — the `recall_memory` schema the model receives.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schema

#### What the model sees

The generated `recall_memory` schema: an object with a required `query` field and optional `type`/`scope` filters, plus a description stating the match is literal, not semantic.

#### Token effect

Fixed schema cost on every request where the tool is visible; the description and schema are stable.

#### KV Cache effect

Prefix-stable while the definition and visibility are unchanged.

### Tool-call history and result

#### What the model sees

Each call retains its query and filters in the tool-call history. A successful call returns up to ten matches, each as `<name> (<type>, <projectScope>): <excerpt>`, or `No memory entries match "<query>".` when nothing matched.

#### Token effect

Scales with the number of matches and their excerpt length; bounded by the fixed ten-result cap.

#### KV Cache effect

Append-only; result text follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No relevance ranking beyond recency** — matches are sorted by `modified` descending only; there is no match-quality or multi-term scoring.
- **A ten-result cap with no pagination** — a query matching more than ten entries silently drops the rest rather than offering a continuation.
- **Single-substring matching** — `query` is matched as one literal string; there is no multi-keyword AND/OR, phrase, or fuzzy matching.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This package registers one tool definition and owns no relation beyond its registration, which `ctx.tools`'s own invariant already covers.
