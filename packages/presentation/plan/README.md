---
description: "Plan documents recovered from logged exit_plan_mode calls and the progress line of a todo list, shared by the GUI and the terminal client."
kind: "package-library"
---

# dsh-presentation-plan

## Summary

Gives the GUI and the terminal client the same reading of plan data in the Session log. `submittedPlan` reads the Markdown and title of one `exit_plan_mode` call. `loggedPlan` adds every version submitted in the same plan-mode episode. `todoProgress` counts done items of a `todo_write` list and names the active ones. The package has no DOM, Cordis service or I/O, so a Node process calls it directly. Addresses of plan resources and the review controls stay in the clients.

## Table of Contents

- [Use this package](#use-this-package)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

`submittedPlan(event)` accepts `tool/call`, `tool/ptc-dispatch-start` and `tool/ptc-dispatch` events and returns `undefined` for anything else, including malformed arguments and a plan without a level-one heading, which stays in the generic tool row. `loggedPlan(events, callId)` groups the plans submitted after the same `plan/mode` activation, oldest first, and returns `undefined` when the events hold no such plan.

`todoProgress(todos)` takes the whole list as the model sent it, so any field may be missing or mistyped. It returns `done` and `total`, the content of the first `in_progress` item, and how many more are active, because parallel work runs several tasks at once. An unusable name on the first active item leaves the counts and drops only the name.

-----

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Review controls are not shared yet** — the Approve and Request changes panel still lives in `ui-user-questions`; the terminal client reuses its decisions in phase 3.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This library owns no mutable runtime relationship.
