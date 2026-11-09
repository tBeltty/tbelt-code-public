---
description: "Durable, schema-validated storage domain and read/write API (ctx.memoryStorage) for typed cross-session memory entries and their Markdown artifacts, for hosts and maintainers of the write triggers and recall layer built on top of it."
kind: "package-reference"
---

# @deepseek-ai/dsh-memory-storage

## Summary

`@deepseek-ai/dsh-memory-storage` declares and opens the `memory` storage domain — one schema-validated `entries` table holding typed, durable cross-session memory entries (`user`/`feedback`/`project`/`reference`) — and is the sole read/write API over it. `writeEntry` validates a record, redacts its `description` and `content` via `@deepseek-ai/dsh-memory-redact`, commits the domain record, and durably writes the entry's Markdown artifacts (its topic file and its scope's regenerated `MEMORY.md` index); `readEntry`, `listEntries`, and `readIndex` are the read side. No caller can reach the domain table or the Markdown files any other way, so every write — `@deepseek-ai/dsh-command-remember`'s explicit `/remember` or `@deepseek-ai/dsh-tool-remember`'s automatic `remember_fact` — is redacted here by construction.

## Table of Contents

- [Use this package](#use-this-package)
- [Design notes](#design-notes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount `MemoryStorage` (its default export) on a Cordis context that already provides `storageDomain`. It opens the `memory` domain at init and registers the close as a named `ctx.effect` disposer (`memoryStorage.domainClose`), following the same pattern as `@deepseek-ai/dsh-workspace` and `@deepseek-ai/dsh-session-projection-cache`.

```ts
import type { Context } from '@deepseek-ai/cordis'
import MemoryStorage from '@deepseek-ai/dsh-memory-storage'

declare const ctx: Context

await ctx.plugin(MemoryStorage)
```

### Writing and reading entries

```ts
import type { Context } from '@deepseek-ai/cordis'

declare const ctx: Context

const result = await ctx.memoryStorage.writeEntry({
  name: 'ci-preferences',
  type: 'feedback',
  description: 'Never add a Co-Authored-By trailer naming an AI tool.',
  content: 'The owner wants sole authorship credit on every commit.',
  projectScope: 'global',
})
// result.redacted is true when writeEntry withheld a detected secret span.

const read = await ctx.memoryStorage.readEntry('global', 'ci-preferences')
// read?.body is the topic file's content, already redacted.

const entries = ctx.memoryStorage.listEntries('global')
// listEntries is a synchronous, in-memory read of the domain table only.
```

A write with `content` omitted patches only the entry's frontmatter fields (e.g. `description`), leaving its existing topic-file body byte-identical — see [Design notes](#design-notes) for why a content-carrying write is different.

### Building a storage key

A memory entry's storage key is `<scope-id>_<name>`. `GLOBAL_SCOPE_ID` (`'global'`) is the fixed scope id for every global-tier entry; `projectScopeId(projectRoot)` derives a stable 16-character hex id for a project-tier entry, since the domain has exactly one `entries` table shared by every project — project identity lives in the key, not in a second domain instance. `resolveMemoryProjectRoot(cwd, fileSystem?, signal?)` finds the project root for a project-tier key, walking upward from `cwd` for a `.git` directory (via `@deepseek-ai/dsh-project-root`). `memoryEntryKey(scopeId, name)` builds the branded `MemoryEntryKey`.

```ts
import { GLOBAL_SCOPE_ID, memoryEntryKey, projectScopeId, resolveMemoryProjectRoot } from '@deepseek-ai/dsh-memory-storage'

declare const sessionCwd: string | undefined

const globalKey = memoryEntryKey(GLOBAL_SCOPE_ID, 'ci-preferences')
const projectRoot = await resolveMemoryProjectRoot(sessionCwd ?? process.cwd())
const projectKey = memoryEntryKey(projectScopeId(projectRoot), 'active-refactor')
```

-----

<a id="design-notes"></a>
## Design notes

The domain spec (`src/spec.ts`) mirrors `packages/session/session-projection-cache/src/spec.ts`: `layout: 'per-record'` (one document per entry — memory entries are sparse and individually disposable) and `invalidRecords: 'backup-and-skip'` (a schema-failing stored entry never blocks every other entry from loading; the backend moves it aside and logs the failure). Every additive future field must carry `.default(...)`, the convention `packages/workspace/workspace/src/spec.ts` establishes for this same storage-domain family, so already-stored records keep parsing unchanged.

`modified` is an ISO-8601 timestamp with an explicit offset or `Z` (`z.iso.datetime({ offset: true })`), matching `packages/workspace/workspace/src/spec.ts`'s `createdAt`/`updatedAt` string convention at this same storage-domain boundary — the natural spelling once a later Markdown read/write layer writes this field into a topic file's YAML frontmatter. This differs from `SessionHeader.createdAt`'s epoch-millisecond convention, which belongs to the session wire format, not a storage-domain record.

Project-root resolution is extracted to `@deepseek-ai/dsh-project-root` instead of adding a third private copy of the walk that already exists, independently, in `packages/context/agent-instructions/src/files.ts` and `packages/skill/skill-filesystem/src/index.ts`. See that package's own "Known Limitations and Deferred Work" — neither existing private copy is migrated onto the shared implementation by this change.

### Markdown artifacts and the frontmatter writer

Each scope directory (`<dshHome>/memory/<scope-id>/`) holds a `MEMORY.md` index and one `topics/<name>.md` file per entry. `src/frontmatter.ts` is this repository's first YAML-frontmatter *writer* — the only prior art, `skill-filesystem`'s `parseFrontmatter`, only reads. `patchFrontmatterFields` adapts `@deepseek-ai/dsh-settings-file`'s `parseDocument`-then-`setIn` minimal-diff discipline to a frontmatter block embedded in a Markdown document: it parses the frontmatter text alone as a mutable tree, applies field edits, and re-renders only that block, so the body substring after it is never re-parsed or touched. `writeEntry` decides which mode applies: `content` given means the whole topic file is rewritten (the content itself is the value being written, not preserved prose); `content` omitted means only frontmatter fields are patched and the existing body survives byte-identical. `MEMORY.md` is different again — fully regenerated from the domain table on every write, because it is a code-assembled, frozen pointer list the model never authors by hand (the role `.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md:9` describes for an index artifact), so there is no human formatting in it to preserve. Both artifacts share `settings-file`'s durability discipline: directory creation, a cross-process `withFileLock`, and an atomic `writeFileAtomic` at `0o600`/`0o700`.

-----

<a id="model-experience"></a>
## Model Experience

### Memory domain storage and write API

#### What the model sees

Nothing directly. This package opens a host-side storage domain and exposes `ctx.memoryStorage`'s read/write API; it registers no tool, prompt, or session event itself, so no request field ever carries this package's data directly. `@deepseek-ai/dsh-command-remember` and `@deepseek-ai/dsh-tool-remember` are the model- and human-facing write triggers built on top of it; a later recall-injection layer is what makes stored memory entries model-visible on read.

#### Token effect

Zero direct tokens on every request.

#### KV Cache effect

Independent of live requests: the package never touches a request prefix, so it cannot invalidate provider cache reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No secondary index over entries** — `listEntries` scans the full in-memory domain table by `scopeId` prefix; filtering by `type` or searching by name is the caller's job, not a storage-domain feature (one write touches exactly one record).
- **`projectScopeId` truncates its hash to 16 hex characters** — a deliberately short, filesystem-friendly key prefix, not a security or full-collision-resistance property; two distinct project roots occupying the same 64-bit truncated space would collide (astronomically unlikely at this scale but not provably impossible).
- **No recall injection yet** — nothing in this package or its write-trigger siblings puts stored memory into a model request; that is a later, separate addition on the `agent/pre-step` seam.
- **No edit or delete of an entry's name/type/projectScope** — `writeEntry` only ever creates or updates the entry addressed by its `name`/scope; there is no rename, retype, or delete operation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. `MemoryStorage` has no diverging observation to check: it owns exactly one relation (the opened domain matches its registered `ctx.effect` disposer), which the storage-domain package's own invariant already covers.
