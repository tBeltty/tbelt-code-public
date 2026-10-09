---
description: "Package map for client-neutral presentation: pure conversions from Session records to the text, titles and states that both the GUI and the terminal client show."
kind: "package-group"
---

# presentation/ — client-neutral presenters

## Summary

The `presentation/` group holds the conversions from Session records and tool arguments to display facts that the GUI and the terminal client must show identically: tool call titles, one-line summaries, lifecycle states, flattened results, per-tool cards, approval prompts, plans and provider setup. Every package is pure, with no DOM, React, Cordis service or I/O, so a Node terminal process loads it without booting any `packages/client/ui-*` plugin. The GUI packages consume these presenters and add only drawing; locale keys, never translated text, cross the package boundary. The surface parity manifest names the presenter that each capability shares.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role |
|---|---|
| [`tool-call/`](tool-call/README.md) | Tool call blocks and the pure tool row model: variant, title key, summary, file path, state, result text and Auto-review denial |
| [`tool-card/`](tool-card/README.md) | Shell, diff, read and search card models, and the added/removed line summary |
| [`approval/`](approval/README.md) | Plain-language approval prompt, its decisions and session-scoped grants |
| [`plan/`](plan/README.md) | Plan documents from logged `exit_plan_mode` calls and todo progress |
| [`settings/`](settings/README.md) | Provider list, credential references, model entries and key checks for adding a provider |

-----

<a id="related-documentation"></a>
## Related documentation

- [Root package map](../README.md) — where `presentation/` sits among all package groups.
- Terminal client transport note — why presenters leave the `ui-*` packages.
- Adding a package cookbook — how a new presenter lands in this group.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
