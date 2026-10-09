---
description: "Tool call blocks and the pure tool row model: variant, title key, one-line summary, file path, lifecycle state, result text and Auto-review denial, shared by the GUI and the terminal client."
kind: "package-library"
---

# dsh-presentation-tool-call

## Summary

Gives the GUI and the terminal client one tool line per call. `toolRowModel` returns the row variant, a title locale key, a one-line summary, an openable file path, the lifecycle state, the flattened result text and any Auto-review denial. The package also defines the tool call and result records a Session projects. It has no DOM, Cordis service or runtime state, so a Node process calls it directly. Clients translate title keys with their own dictionaries.

## Table of Contents

- [Use this package](#use-this-package)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

`classifyTool(name)` maps a wire tool name to a variant (`search`, `read`, `bash`, `write`, `edit`, `code` or `others`), and `toolTitleKey(name)` selects the tool-owned title, or the variant's title for tools without one. Unknown tools take the `others` variant and the generic title; the summary then carries the tool name. A tool that has its own card in a client, such as `cordis_define` in the Web client, stays out of both tables.

`toolRowModel` reads only the call arguments and the settled result. A `preparing` block has no arguments, so its summary is empty. When arguments are not JSON, the summary falls back to their first line. `cwd` makes workspace-rooted paths display relative, and `home` abbreviates a remaining POSIX home path to `~`. `formatToolBody(variant, argsRaw)` pretty-prints the arguments for an expanded view, or returns the program itself for a `code` row. `resultText(node)` joins text blocks verbatim, prints other block types as JSON and falls back to `name: code` for an error without content.

`parsedToolCall`, `singleResultText` and `validEscalationFields` narrow raw arguments and results for the richer per-tool cards that a client builds on top of this model. The shell, diff, read and search card models live in `dsh-presentation-tool-card`.

-----

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Only the row model lives here** — the web, image, todo and details card models still sit in `ui-tool` because they type their output with `ui-primitives` props; the terminal client needs them as plain data before phase 3 can close.
- **Title keys are a closed set owned here** — a tool added to `TOOL_OWNED_TITLE_KEYS` needs its key in every client dictionary; the Web client fails to compile when its `conversation` namespace lacks one, and the terminal client has no dictionary yet.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This library owns no mutable runtime relationship.
