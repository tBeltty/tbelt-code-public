---
description: "The context group map: request-context plugins that add durable, model-visible context without defining tools, for users and maintainers navigating the group."
kind: "package-group"
---

# context/ — Request-context plugins

## Summary

The context group provides plugins that add model-visible context to each request without defining any tool: workspace instruction files become guidance, `@file` mentions offer path completion, other sessions can be referenced as bounded snapshots, and the model can see the current time and the agent's tmux location. Only `agent-instructions` (`dsh-base`) ships mounted by default; the rest are opt-in. Context is durable: injected instructions and references enter session history as user-role messages, so they persist, replay, and compact like other conversation content. This page maps the group; each package README owns the per-package contract.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`agent-instructions/`](agent-instructions/README.md) | Loads `AGENTS.md`/`CLAUDE.md` workspace instructions into context and refreshes them after file edits | — |
| [`session-reference/`](session-reference/README.md) | References other sessions: mention one and its bounded read-only snapshot becomes context | `ctx.sessionReferenceResolver` |
| [`repo-map/`](repo-map/README.md) | Budget-bounded, naive-v1 flat repo symbol map injected on `agent/pre-step`, recomputed only for touched files | `ctx.repoMap` |
| [`file-reference/`](file-reference/README.md) | `@file` mention discovery and the shared mention grammar for host-backed UIs | `ctx.fileReferences` |
| [`file-reference-local/`](file-reference-local/README.md) | Local-workspace completion provider for `@file` mentions | — |
| [`time-context/`](time-context/README.md) | Current time, browser zone, and elapsed time per step | — |
| [`tmux-context/`](tmux-context/README.md) | The agent's tmux session, window, and pane location | — |

-----

<a id="related-documentation"></a>
## Related documentation

- Session-reference subsystem — canonical mention URIs, snapshot semantics, and the stable error taxonomy.
- Repo-map subsystem — extracted symbol types and `ctx.repoMap`'s composition/invalidation ownership.
- Workspace-context decision record — why instruction context is per-agent/per-session and durably logged.
- Generated configuration catalog — every config field the group's packages accept.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
