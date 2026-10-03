---
description: "The memory group map: persistent cross-session recall for tBelt Code, for users and maintainers navigating the group."
kind: "package-group"
---

# packages/memory

## Summary

The memory group gives an agent durable, typed recall across sessions: facts about the user, corrections about how to work, ongoing project state, and pointers to external systems. `memory-storage` is the storage/schema layer and sole read/write API — `writeEntry` validates, redacts (via `memory-redact`), and durably writes the domain record and Markdown artifacts. `command-remember` and `tool-remember` are the explicit and automatic write triggers. `memory-recall` injects each relevant scope's index as untrusted, attributed `agent/pre-step` context, with a consolidation nudge past a configured size; `tool-recall-memory` is the on-demand, literal-keyword complement.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`memory-storage`](memory-storage/README.md) | Durable, schema-validated storage domain and read/write API for typed memory entries and their Markdown artifacts | `ctx.memoryStorage` |
| [`memory-redact`](memory-redact/README.md) | Fail-closed, content-based secret detection for text destined for a memory write; pure function, no Cordis plugin | none |
| [`command-remember`](command-remember/README.md) | Explicit `/remember` command over the write API | none |
| [`tool-remember`](tool-remember/README.md) | Automatic `remember_fact` model-facing tool over the write API | none |
| [`memory-recall`](memory-recall/README.md) | Untrusted, attributed memory-index injection on `agent/pre-step`, plus a consolidation nudge | none |
| [`tool-recall-memory`](tool-recall-memory/README.md) | On-demand `recall_memory` model-facing tool, literal-keyword search over stored entries | none |

-----

<a id="related-documentation"></a>
## Related documentation

- [Memory subsystem reference](../../docs/subsystems/memory.md) — entry identity, categories, the durable record shape, and the storage domain.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
