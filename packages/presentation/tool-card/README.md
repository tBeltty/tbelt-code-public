---
description: "Pure shell, diff, read and search card models derived from recorded tool calls, plus the added/removed line summary, shared by the GUI and the terminal client."
kind: "package-library"
---

# dsh-presentation-tool-card

## Summary

Gives the GUI and the terminal client the same card data for the tool kinds that show more than a title line. `terminalCardModel` returns a shell call's command, directory, output and exit status, `diffCardModel` a write or edit's hunks, `readCardModel` a file read's lines, and `searchCardModel` the matches of `grep` or the paths of `glob`. `diffSummaryParts` turns hunks into the quiet `+N -M` line with a green and a red segment. The package has no DOM, Cordis service or runtime state; clients own every user-facing word.

## Table of Contents

- [Use this package](#use-this-package)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Each `*CardModel(block, ...)` takes a running or settled tool call block (see `dsh-presentation-tool-call`) and returns `null` when the call is not the shape the card draws, such as malformed arguments, an error result, a nested call or a spilled shell result. A client then falls back to the generic row. `terminalCardModel` keeps the `copy` field unlocalized: a shell call carries the command and description verbatim, and a `terminal_send` call carries the text and session id for the client to phrase. `terminalFailed` reports a non-zero exit or a signal, which the bash tool does not mark as an error.

`diffHunks(diff)` returns exact local patches, or one whole-fragment replacement when the edit-graph search exceeds 256 edits. `diffTotals` counts added and removed lines from those patches, so shared context does not count. `diffSummary` adds the number of distinct files. `diffSummaryParts` returns the segments a client colors: `+N` in the added tone, `-N` in the removed tone, a zero count omitted. A diff is shown as this summary on the tool row and the transcript's changed-files line, never as a card in the Artifacts tab.

-----

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Web, image, todo and details card models stay in `ui-tool`** — they type their output with `ui-primitives` props or `ui-conversation` records; the terminal client needs them as plain data before phase 3 can close.
- **Row geometry is not here** — the number of lines a chat row shows before it folds belongs to each client's layout.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This library owns no mutable runtime relationship.
