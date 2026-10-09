---
description: "Pure terminal views: transcript lines, composer editing, key decoding, approval prompts, pickers and inline images for the terminal client."
kind: "package-library"
---

# dsh-terminal-views

## Summary

Draws a Session as text for a terminal and turns terminal input into edits; it also holds the rows and questions of the configuration screens. `TranscriptRenderer` converts Session events into append-only lines, `reduceComposer` and `renderComposer` edit a multi-line message with history, and `decodeKeys` reads raw-mode bytes. `Screen` redraws the composer under the scrolling output, `renderPicker` draws a filterable list in its place, and `renderImage` draws an image inline or as a text line. The package has no Cordis service and does no I/O; the caller supplies a write function and the key bytes.

## Table of Contents

- [Use this package](#use-this-package)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

`approvalPromptLines` and `approvalKeyChoice` show the shared approval prompt and read its answer. `createPicker` and `reducePicker` run a picker, `createMultiPicker` lets Enter tick several items, and `createPrompt`, `reducePrompt` and `renderPrompt` ask one line of text with an optional masked mode for keys. `sessionItems`, `modelItems`, `providerItems`, `bundleItems`, `pluginItems`, `presetItems`, `permissionItems`, `webSearchItems`, `settingItems` and `namespaceItems` fill a picker with the rows of each screen, and `keyProblemText` words a rejected key. `detectImageProtocol` chooses how images draw, and `resolveTypedPath` turns a typed or dropped path into an absolute one.

Tool rows, cards and approvals come from `dsh-presentation-*`, the same presenters the GUI uses, so a tool is titled and summarized identically on both surfaces. The presenters return locale keys; `t` and `copyKey` resolve them in the terminal's English dictionary. Output is never an alternate screen: lines scroll into the terminal's own scrollback and `Screen` only erases and redraws the rows the composer occupies.

Text that came from a tool or a model passes through `sanitizeOutput` before printing, so cursor movement and color sequences in it cannot corrupt the screen. Color is chosen once with `supportsColor` (`NO_COLOR`, `FORCE_COLOR`, `TERM=dumb`) and `createStyle`.

Image sequences are written only for bytes the caller fetched. Kitty graphics decode PNG, so other formats fall back to the text line, and neither protocol is used under tmux or screen. `sniffImageType` identifies PNG, JPEG, WebP and GIF by their first bytes.

`chooseSession` decides what `--resume <id-or-prefix>` and `--continue` open from a catalog listing; `--continue` means the latest non-empty session started in the same directory, and subagent sessions are never offered.

-----

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Tool titles are duplicated** — the terminal keeps its own English copy of the tool title and approval sentences, checked against the presenters' key types, so a new tool title fails the type check here until its English text is added.
- **Streamed text is not re-wrapped** — the terminal wraps the lines it prints; a resize does not reflow what is already in scrollback.
- **Images in tool results are not drawn** — only images in user messages draw inline; an image a tool returns shows through the tool's own result lines.
- **Sixel is not supported** — a terminal that speaks only Sixel shows the text line.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This library owns no mutable runtime relationship.
