---
description: "Untrusted, attributed memory-index injection on agent/pre-step, plus an index-size consolidation nudge, for users and maintainers of the recall layer over ctx.memoryStorage."
kind: "package-reference"
---

# @deepseek-ai/dsh-memory-recall

## Summary

`dsh-memory-recall` makes stored memory entries model-visible by injecting each relevant scope's `MEMORY.md` index into the model request on `agent/pre-step` — the same seam `@deepseek-ai/dsh-session-reference` and `@deepseek-ai/dsh-agent-instructions` already use. The injected message is untrusted, read-only background information (never followed as instructions) and carries a typed `source` field naming which entries it lists, so a downstream consumer can tell a memory-recall injection apart from an ordinary user message. A scope with no stored entries injects nothing; a scope whose entry count passes a configured threshold gets a surfaced consolidation suggestion, never automatic consolidation.

## Table of Contents

- [Use this package](#use-this-package)
- [Design notes](#design-notes)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this package alongside `ctx.memoryStorage`'s dependency chain, on any host that already composes `agent/pre-step` (any Cordis app using `@deepseek-ai/dsh-agent`'s loop).

```yaml
- id: memory-storage
  name: '@deepseek-ai/dsh-memory-storage'
- id: memory-recall
  name: '@deepseek-ai/dsh-memory-recall'
  config:
    consolidationThreshold: 40
```

`consolidationThreshold` (default `40`) is the entry count above which an injected scope's index carries a consolidation nudge.

-----

<a id="design-notes"></a>
## Design notes

**Seam and framing.** The `agent/pre-step` listener registers with `{ prepend: true }`, mirroring `session-reference`'s registration at `packages/context/session-reference/src/index.ts:135-142`: it calls `next()` first, so every other pre-step listener's messages (including `agent-instructions`'s baseline/dynamic context) are already settled, then appends the recall message at the end of the accepted batch. The untrusted-content framing and warning sentence are reused in substance, verbatim, from `session-reference`'s `REFERENCE_WARNING` (`packages/context/session-reference/src/spill.ts:8-10`); that constant is not exported, so the literal text is copied into `src/index.ts` rather than imported.

**Scope resolution.** Every pre-step considers the fixed global scope, plus the calling session's project scope when `agent.session.header.cwd` is known. A scope with zero stored entries is dropped before rendering — a project or session with nothing recalled gets no injected block, not an empty one.

**Attribution.** The injected message's `source` (`MemoryRecallSource`, `src/types.ts`) carries the package's own `memory-recall` kind, declared on `MessageSourceMap`, with `form: 'snapshot'`. Session format v4 refuses the retired `{ kind: 'plugin' }` wrapper on persisted messages. Each section's `entries` names every included entry's id, category, and `modified` timestamp, so a permission rule or audit log can attribute the content without re-parsing the rendered index text. `isMemoryRecallSource(source)` narrows a message source to this shape.

**Determinism.** Recall reads only `ctx.memoryStorage`'s in-memory table and durable index file — no LLM or embedding call anywhere in this path, per `.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md:88`: "an LLM or embedding call [in the recall path] breaks keyless replay determinism; recall stays a pure function of the log."

**On-demand detail recall** (a matching entry's full topic-file body, by literal keyword) is `@deepseek-ai/dsh-tool-recall-memory`, a separate sibling package: this package's injection carries only the always-visible index (name/type/description/modified), never full entry bodies, to bound its token cost independent of how much has been remembered.

-----

<a id="further-exploration"></a>
## Further Exploration

- Memory subsystem — the storage domain, Markdown artifacts, and both write paths this package reads from.
- [memory group map](../README.md) — the sibling group page and its package table.
- [dsh-memory-storage](../memory-storage/README.md) — `listEntries`/`readIndex`, the read API this package calls.
- [dsh-session-reference](../../context/session-reference/README.md) — the package whose `agent/pre-step` registration and framing this package mirrors.
- [dsh-tool-recall-memory](../tool-recall-memory/README.md) — the on-demand detail-recall tool built on the same read API.

-----

<a id="model-experience"></a>
## Model Experience

### Request context and condition

#### What the model sees

An untrusted `<memory-index>`-wrapped Markdown block per non-empty scope, on every step, once at least one memory entry exists for that scope (global, or the current project). Nothing when no memory has been stored yet.

#### Token effect

Zero when no memory exists. Once entries exist, scales with the number and description length of stored entries — the index, not entry bodies, so growth is bounded by index size rather than total remembered content.

#### KV Cache effect

Appended after every other pre-step context, so an earlier request's reusable prefix survives; the block's own text changes whenever a memory write changes the underlying index, invalidating cache from that point forward on the next request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No per-entry relevance ranking** — every stored entry for a considered scope is injected every step; there is no scoring, recency weighting, or task-relevance filter beyond the index/detail split itself.
- **The consolidation nudge is a fixed entry-count threshold** — it does not distinguish stale from actively useful entries, and does not itself trigger or perform any consolidation.
- **No cross-machine or multi-process cache invalidation signal** — the injected text is read fresh from disk every step, so it is always current within one process, but there is no push notification across processes sharing the same `dshHome`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This package's only owned relation — the `agent/pre-step` listener registered at plugin apply — is a fixed registration, not a diverging observation to check.
