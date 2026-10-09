---
description: "Browser approval UI that answers Host permission requests through the scoped interaction path."
kind: "package-reference"
---
# @deepseek-ai/dsh-client-ui-approval

## Summary

Browser approval presentation over the Agent-scoped Remote Event waterfall. The plugin publishes each pending request through `ctx.uiSession`, takes over the Conversation composer, optionally renders correlated Tool detail, and returns the user's decision to the waiting Host request. Use it when a browser must collect approval for a waiting Host operation.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

The prompt comes from `dsh-presentation-approval`: a plain sentence says what the agent needs ("I need permission to run a command"), the requester's reason follows as "Because", and the tool name and the Tool-owned detail sit in a collapsed Technical details block. The arrow beside Allow once opens Allow for this session. The plugin keeps one set of grants per Session, answers a later request from the same tool with the same audit reason as a one-time allow without showing it, and forgets the set with the window. The Host receives only `allowed-once` or `rejected`.

Focus the approval detail region to approve with Enter or reject with Escape. The mounted plugin reserves both keys against editable shortcuts. Enter on the focused Reject button retains its native reject action. Input controls and IME candidates keep their own keys. Keyboard and pointer actions share one pending-request lock; a withdrawn or replaced request cannot accept another answer, and an earlier failed answer cannot unlock its replacement.

<a id="model-experience"></a>
## Model Experience

None, as this package presents approval requests in the browser and registers nothing model-facing.

#### KV Cache effect

None; approval request and response rendering does not alter a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The panel exposes transient decisions only** — it supports allow-once, allow for this session and reject; the session grant lives in the browser and is not logged, and persistent permission policy remains owned by Host-side approval packages. Requester-supplied localized presentation copy follows the UI language without changing the audit reason or translating model-generated text.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. Registries own and observe the Remote listener and temporary Slot entry.
