---
description: "Budget-bounded repo-map context: gitignore-aware directory traversal, Tree-sitter symbol extraction, and a ctx.repoMap plugin that injects a naive-v1 flat symbol map on agent/pre-step, recomputed only for touched files."
kind: "package-reference"
---

# @deepseek-ai/dsh-repo-map

## Summary

`dsh-repo-map` mounts `ctx.repoMap`, which composes a flat, unranked per-file symbol list (classes, functions, interfaces, imports) from a `.gitignore`-aware Tree-sitter walk and injects it as durable context on `agent/pre-step`. Composed text is bounded to a configured fraction of the model's context window, verified against `ctx.tokenMeter`'s real token count. A successful file-mutating tool call recomputes only that one file, gated to step boundaries, never a full repo re-walk. Choose it for a standing, cheap workspace symbol inventory; it does no cross-file ranking, so a large repo's map is naively truncated, not prioritized by relevance.

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

### When to choose it

Mount `dsh-repo-map` when an agent should see a standing inventory of the workspace's TypeScript/TSX/JavaScript symbols without the harness re-walking or re-parsing the tree on every step. Skip it for a one-off symbol lookup — call `walkRepoFiles`/`extractFileSymbols` directly instead, since they need no plugin mount.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-repo-map'
  config:
    repoMapContextFraction: 0.05
```

| Field | Default | Meaning |
|---|---|---|
| `rootDir` | the requesting agent's session `cwd` | Directory to walk and parse. |
| `repoMapContextFraction` | `0.05` | Fraction of the model's context window (four bytes/token heuristic) reserved for the composed repo map; `ctx.tokenMeter` is the authoritative second gate. |

### Entry point

```ts
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { walkRepoFiles, extractFileSymbols } from '@deepseek-ai/dsh-repo-map'

const ctx = new Context()
await ctx.plugin(LocalSubprocessRuntime)

const files = await walkRepoFiles(ctx, '/path/to/workspace')
for (const path of files) {
  const result = await extractFileSymbols(path)
  // result.symbols: RepoMapSymbol[] (kind/name/line), or
  // result.diagnostic: 'unsupported-language' | 'syntax-error' when skipped
}
```

`walkRepoFiles` and `extractFileSymbols` remain plain functions with no plugin dependency (`walkRepoFiles` needs a `ctx.subprocess` provider; `extractFileSymbols` needs none) — mount `RepoMap` (this package's default export) only when a consumer wants the composed, budget-bounded, event-invalidated `agent/pre-step` injection built on top of them.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

| File | Role |
|---|---|
| `src/walk.ts` | Spawns the packaged `@vscode/ripgrep` binary through `ctx.subprocess` with `rg --files` and no `--no-ignore`/`--hidden` overrides, so `.gitignore` and ripgrep's other default ignore rules apply. Mirrors `dsh-tool-fs-search/search-core.ts`'s spawn discipline (packaged-binary resolution, `--no-config`, bounded collected stdout, exit-code classification) without depending on that package. |
| `src/tree-sitter.ts` | Language detection by file extension and lazy-loaded, memoized `web-tree-sitter` WASM grammars from the `tree-sitter-wasms` bundle. `parseSource` never throws for malformed input: an unsupported extension or a tree with `rootNode.hasError` returns a skip diagnostic instead. |
| `src/symbols.ts` | `extractSymbols` walks a parsed tree's `class_declaration`/`abstract_class_declaration`/`function_declaration`/`generator_function_declaration`/`interface_declaration`/`import_statement` descendants (via `Node#descendantsOfType`, which returns document order) into a flat, unranked list. |
| `src/extract.ts` | `extractFileSymbols` composes a file read, `parseSource`, and `extractSymbols` into one per-file result. |
| `src/types.ts` | Shared `RepoMapSymbol`/`RepoMapFileResult`/`RepoMapLanguage`/diagnostic vocabulary. |
| `src/render.ts` | Pure, budget-bounded rendering: `orderFilesByRecency` (most-recently-touched first, path tiebreak) and `renderRepoMap` (renders whole file blocks in that order, dropping the tail — never truncating mid-file — once the next block would exceed a byte budget). |
| `src/config.ts` | `Config` (`rootDir`, `repoMapContextFraction`), the byte-budget floor `DEFAULT_MIN_REPO_MAP_BYTES`, and `RepoMapError`. |
| `src/plugin.ts` | `RepoMap`, the `ctx.repoMap` service: per-session symbol cache, budget derivation and the `ctx.tokenMeter` gate, `tools/result`-driven targeted invalidation with step-boundary gating, and the `agent/pre-step` splice. |

**Splice position.** `RepoMap` enters its message immediately after the claimed message batch on `agent/pre-step`, mirroring `dsh-agent-instructions`'s splice-after-claimed-messages shape rather than `dsh-memory-recall`'s prepend-and-append-last shape: a repo map is unconditional baseline context present on every step once computed, not context fetched in response to a citation in the user's message.

**Event-driven invalidation, never a full re-walk per step.** A successful, non-aborted `write`/`edit`/`search_replace` call, or a content-mutating `str_replace_editor` command (`create`/`str_replace`/`insert`, not `view`), queues a targeted single-file recomputation — mirroring `dsh-agent-instructions`'s `tools/result` → `stepIsOpen` → `stepTouches`/`step/end` machinery. `read` is deliberately not watched: `agent-instructions` watches it to track instruction *visibility*, but repo-map only cares whether a file's *content* changed. Recomputation only ever touches files the initial walk already tracked — a touch to a brand-new or never-walked path is skipped entirely, which is also what keeps an unrelated touch from forcing any recomputation, let alone a full re-walk.

**Budget derivation.** `Math.max(DEFAULT_MIN_REPO_MAP_BYTES, Math.floor(contextWindow * 4 * repoMapContextFraction))` sizes an initial byte budget (mirrors `dsh-session-reference`'s `referenceContextFraction` formula shape). The naive flat rendering is then checked against `ctx.tokenMeter.estimateMessage()`'s real count on the actually-composed message; when that exceeds the token budget, the least-recently-touched tracked file is dropped and the message re-composed and re-measured until it fits or no files remain.

**The message carries its own `repo-map` source kind.** `buildMessage` sets `source: { kind: 'repo-map', form: 'instructions' }`, declared on `MessageSourceMap`. Session format v4 refuses the retired `{ kind: 'plugin' }` wrapper on every persisted message, so a turn that injected one failed before reaching the model.

**Ripgrep's `.gitignore` default requires a `.git` directory.** Ripgrep only applies `.gitignore` filtering by default when the walked tree is inside a directory containing `.git` (its `--no-require-git` flag turns this requirement off; this package does not pass it). Every real repo-map caller walks an actual working tree, so this holds in practice; a walk of a plain directory with a `.gitignore` but no `.git` returns every file, ignore rules included. `tests/walk.spec.ts` creates a bare `.git` marker directory in its temp fixtures for this reason.

**Native vs. WASM Tree-sitter.** This package uses `web-tree-sitter` (WASM) instead of native `tree-sitter` Node bindings. This repo ships a single-executable `pkg` build (see `resolveRgPath`'s `-rg` sidecar handling, mirrored from `dsh-tool-fs-search`, and `native/README.md`'s native-module release story for this repo's OWN native addons). A native `.node` grammar addon cannot be `require()`d from `pkg`'s virtual filesystem without a per-platform sidecar copy-out — the same problem ripgrep's binary already needs a workaround for — multiplied by every supported language grammar instead of one binary. A `.wasm` grammar file has no such constraint: it is read with `node:fs/promises.readFile` like any other data file and handed to `Language.load()` as a buffer. This also sidesteps per-platform/per-arch native compilation entirely, at the cost of WASM's slightly slower parse throughput, which is not a binding constraint for a per-file, non-realtime symbol extraction pass.

**Grammar source.** `tree-sitter-wasms` (community-maintained, MIT) bundles pre-built `.wasm` grammars for the languages this package supports (`tree-sitter-typescript.wasm`, `tree-sitter-tsx.wasm`, `tree-sitter-javascript.wasm`), avoiding an Emscripten build step this repo has no other reason to carry. It is the same grammar-bundling approach several other Tree-sitter-based coding tools use for exactly this repo-map use case.

**`Language.load()` takes a buffer, not a path.** `web-tree-sitter`'s ESM entry (`tree-sitter.js`) resolves a path-string argument through a bundler-shimmed `require("fs/promises")` that throws under a plain ESM entrypoint (no `require` global in scope: `Dynamic require of "fs/promises" is not supported`). Reading the grammar bytes directly and passing a `Buffer` to `Language.load()` takes the library's buffer branch instead, which has no such dependency.

**Language coverage.** TypeScript, TSX, and JavaScript (including `.mts`/`.cts`/`.mjs`/`.cjs`/`.jsx`) — this repo's own primary language per `docs/AGENTS.md`'s ESM-everywhere convention, and the minimum this task's spec requires. Additional languages are a future extension of `EXTENSION_LANGUAGES`/`GRAMMAR_FILENAMES` in `tree-sitter.ts`, gated on the Plan of Record naming a concrete target language.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Context group](../README.md) — how this package's `ctx.repoMap` plugin fits alongside `agent-instructions` and `session-reference`.
- [`dsh-agent-instructions`](../agent-instructions/README.md) — the `tools/result`/step-boundary invalidation pattern this package's plugin mirrors.
- [`dsh-token-meter`](../../llm/token-meter/README.md) — the `ctx.tokenMeter` service that authoritatively gates the composed repo map's size.
- [`dsh-tool-fs-search`](../../fs/tool-fs-search/README.md) — the model-facing `glob`/`grep` tools whose ripgrep-spawn discipline this package's walker mirrors.
- [`dsh-subprocess`](../../subprocess/subprocess/README.md) — the `ctx.subprocess` Service Definition `walkRepoFiles` consumes.

-----

<a id="model-experience"></a>
## Model Experience

### Repo-map context message

#### What the model sees

One durable user-role message per step, spliced immediately after the claimed message batch, `source: { kind: 'repo-map', form: 'instructions' }`. Its text is a header noting the list is auto-generated, unranked, and may be truncated to fit budget, followed by one block per included file: the path, then one `- <kind> <name> (L<line>)` line per class/function/interface/import symbol.

#### Token effect

Sized to `Math.max(DEFAULT_MIN_REPO_MAP_BYTES, contextWindow * 4 * repoMapContextFraction)` bytes, then checked against `ctx.tokenMeter.estimateMessage()`'s real token count on the actually-composed message; when that count exceeds the derived token budget, the least-recently-touched tracked file is dropped and the message re-measured until it fits or no files remain. A larger workspace or a smaller `repoMapContextFraction` includes fewer files, never a partial file.

#### KV Cache effect

The message's content changes only when a watched file's symbols actually change (a targeted, single-file recomputation), which invalidates the request prefix from that message onward on the next step, same as any other durable context edit. An unrelated touch — a file outside the tracked set, or any `read` — never changes it, so the cache prefix survives untouched turns.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No cross-file ranking or scoring.** `extractSymbols` produces a flat, unranked per-file list by design (naive v1, per the Plan of Record's "naive before Aider-style PageRank" guidance); `renderRepoMap`'s truncation order (most-recently-touched first) is a deterministic tiebreak, not a relevance rank. A later task may add real ranking.
- **A brand-new file is invisible until the next full walk (a fresh session, effectively).** Targeted invalidation only recomputes files the initial walk already tracked; a file created after that walk is never added to the composed map for the life of the cached session state. This is what makes "an unrelated/untracked touch never re-walks" true by construction rather than by a race against a debounce.
- **Language coverage is TypeScript/TSX/JavaScript only.** A file in any other language returns `diagnostic: 'unsupported-language'` with an empty symbol list rather than a partial or best-effort parse.
- **A file with a Tree-sitter error node is skipped, not partially extracted.** `parseSource` treats `rootNode.hasError` as a hard skip (`diagnostic: 'syntax-error'`) rather than attempting to extract symbols from the well-formed regions of a partially invalid tree, to avoid returning symbols read from an inconsistent parse.
- **Import symbols record the module specifier, not each bound local name.** One `import { A, B } from 'mod'` statement extracts as a single `{ kind: 'import', name: 'mod' }` entry; per-binding import symbols are not part of this task's flat list.
- **The composed message is identified by `source.kind === 'repo-map'`.** Session format v4 converts released V3 `{ kind: 'plugin', plugin: 'repo-map' }` sources to `plugin:repo-map`; this package writes only the current kind.

No runtime invariant companion is published because extraction and rendering are pure functions over their inputs, with no owned mutable relationship whose two sides could diverge.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
