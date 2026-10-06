---
description: "Plan mode in the Web GUI: the composer chip, plan cards, sidebar plan documents, and anchored plan comments sent as review feedback; for users and maintainers of plan mode."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-plan

## Summary

Plan mode lets you review a plan before implementation. Enter with `/plan` and leave with the composer chip. Submitted plans open automatically in the right sidebar for review and remain available from cards in the completed Turn’s final artifact area after approval, rejection, or dismissal. Each Session shows one plan tab: a revised plan replaces the previous one in the same tab, and a version bar switches between the plans of one plan-mode episode. Browser reload restores the document from Session history. Comments anchored to plan text are sent to the model as review feedback, with the next message, or on their own from the composer chip.

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

Mount this plugin alongside `ui-conversation` and `dsh-plan-mode`; the chip then occupies the composer's plan seat to the right of the access-mode control whenever plan mode is active. Enter plan mode through the `/plan` command path — choose Plan from the composer's `+` Command menu or type `/plan` — and turn it off with the chip.

### What the chip shows

While the effective target is plan mode, the seat renders the blue "Plan" status button — the plan glyph ahead of the label, swapped for a circled cross while the enabled button is hovered or keyboard-focused — which executes `/plan off`. Otherwise the seat stays empty: a host without plan mode, or a Draft with no session, shows nothing. While plan mode is the effective target, the composer textarea's placeholder switches to the plan-task hint — "describe your task to generate plan" — unless the owning surface supplies its own placeholder.

### Reading submitted plans

When a Turn ends, each submitted plan appears in its final artifact area, using the file-delivery card treatment with the plan icon, title, and Open action. A pending plan opens automatically once per submission in the current browser session. Closing it stays effective across review remounts; a new submission opens its own plan. Historical cards open only when clicked. Use the card or review strip’s View full plan link to read the complete Markdown. Plan tabs show the same plan icon: a sheet with a checklist in the accent color. Opening any plan of a Session while that Session already shows a plan tab replaces that tab in place; the review buttons alone decide whether implementation may begin.

### Plan versions

Every plan submitted between one `plan/mode` activation and the next is a version of the same document. When the open plan has more than one version, a `v1`, `v2`, … bar above it marks the version on screen; choosing another version navigates the same tab. The newest version takes over the unsent comments of earlier versions whose quoted text it still contains; other comments stay on their version. Comments a sent answer or message already carried stay on their version as read-only `Sent` entries and are no longer highlighted.

A review without a logged invocation also opens automatically. Its complete text lives only in the tab’s navigation memory, and the pending review card can reopen it. Reloading the page loses that text; an expired preview directs the user back to a pending review. Plans opened from an embedded child conversation use the visible sidebar while retaining the child’s address for document reads.

### Commenting on a plan

A plan document of a top-level Session accepts comments while it is open in the sidebar. Select text and choose the floating Comment button, or choose the `+` in the right margin beside a hovered block (or the block holding the text caret) to comment the whole block. The editor saves with Add comment or Ctrl/Cmd+Enter; Cancel or Escape discards the draft. Saved comments highlight their text, and a margin marker per block lists its comments for editing or deletion. A comment is anchored by its quoted text, its block index, and its offset in the block, so re-rendering the document keeps it in place; a quote that no longer occurs keeps only its margin marker.

While a Session has unsent comments, a `N comments` chip appears above its composer next to `Send to agent`; the chip expands into a list of excerpts and comments, each removable. `Send to agent` sends every unsent comment of the Session as one queued user message. Comments stay in this browser's memory across tab and Session switches and are lost on reload; plan documents of subagent Sessions do not accept comments.

Comments reach the model through these paths, as one paragraph per comment in document order: the Markdown-quoted excerpt (whitespace collapsed, at most 200 characters, cut at a word boundary with `…`), then the comment on the next line.

```text
> Read the store
Which store?

> Ship it
Add a rollback step.
```

- **Review decision.** Without comments, the review card offers `Request changes`, which returns the composer, and Approve. While the pending review's plan has comments, it offers `Approve without comments` and `Request changes (N comments)`. Request changes answers the review with Keep planning and the comments as feedback, so the agent revises at once and the `exit_plan_mode` result reads `The user chose to keep planning; their feedback: …` followed by the instruction to present the complete revised plan with `exit_plan_mode` and keep any chat reply to one line. Approval with pending comments requires the explicit `Approve without comments` action, which discards them once the approval is sent; a plain Approve is never offered while comments exist.
- **Composer message.** The next plain message of the Session carries every unsent comment of the Session before the typed text, separated by a blank line, through the composer message-prefix registry of `ui-conversation`. The Session log records the complete user message, so it holds exactly what the model received.
- **Send to agent.** The chip sends the same text as its own queued user message.

A comment becomes resolved only after the Host accepts the answer or message that carried it; a failed send keeps it unsent.

### Failures

Admission failures (`matched: false`, business errors, transport faults) surface as an inline error and the chip stays until the projection confirms the exit.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The chip occupies the conversation-declared `conversation.input.plan` single seat; the node half is an empty apply (the roster row). Reads ride the generic projection pair through the standard-kit `useProjection`: the effective target is `pending ? !active : active` — a folded host value, not client optimism, so an arriving frame corrects the chip either way. The seat's injected face carries one verb, `exitPlanMode`, which executes `/plan off` through `ctx.remote.commands.execute` and maps admission failures to an inline error line. The placeholder and hint text live in ui-conversation's `conversation` locale namespace and are shared verbatim with the claimed `/plan` command hint.

Plan cards derive from native `tool/call` or PTC dispatch arguments through a Conversation Definition, with each invocation’s resolved Turn location. They contribute to the additive `conversation.chat.turnTail` list alongside file deliveries. The plan resource address identifies the invocation and its complete ordinary or direct-parent subagent Session address; its provider reads existing Session history, paging back until it has read the `plan/mode` activation before the invocation, and returns the plan with the versions of that episode, without storing document text in sidebar layout. Opening a logged plan looks up the on-screen Session's open tabs in `sidebarRight.openTabs` and passes `replaceTab` when a plan tab of the same plan Session exists. The question plugin owns the review action slot and supplies its request key, complete text, and optional invocation identity. The automatic open reads `ctx.sidebarRight.mounted` through a bound hook and runs once a Session is on screen: the Sidebar names the returning Session before the commit that mounts the review renders, so a review that arrived while a global panel or another Session was on screen opens from that commit's effect. The decision explains why review lifetime and document lifetime remain separate. Subagent plan addresses also preserve unknown mode so history reads can resolve the child descriptor.

Plan comments live in one snapshot store created by `apply` and shared through the inject `hooks` compartment by the sidebar tab, the `conversation.plan-review.decision` occupant, and the `conversation.input.dock` chip. The document address keys each document's comments: a logged plan address, or the temporary review address built from the browser review window and the request key, which the decision occupant derives the same way. `ctx.conversation.prefixes` receives a provider that formats the Session's comments and removes them on commit. The CSS Custom Highlight `dsh-plan-comment` paints anchored ranges without changing the Markdown DOM.

The framework-bound `usePlans(turn)` exposes only submitted-plan data for that Turn. Chat indexes membership on Node updates and orders this collection when read; card rendering neither scans the transcript nor subscribes to other Turns or Node kinds.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the plan surface is not enough. They move from the chip to the plan-mode domain and the composer shell.

- [dsh-plan-mode](../../plan/plan-mode/README.md) — owns plan mode, the `/plan` command, the projection, and the policy section.
- [ui-conversation](../ui-conversation/README.md) — declares the composer's `conversation.input.plan` seat and the placeholder locale keys.
- Tool catalog — the `exit_plan_mode` tool schema the model uses to leave plan mode.
- [Client package map](../README.md) — adjacent browser UI packages.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the `/plan off` command line the chip dispatches: `dsh-plan-mode` owns the model-visible policy section, the exit-tool schema, and the logged state that line drives. Plan comments become model-visible text in the `exit_plan_mode` review answer or in the user's next message, both recorded in the Session log; their format is shown in [Commenting on a plan](#commenting-on-a-plan).

#### KV Cache effect

Entering or leaving plan mode changes the active `plan:policy` system-prompt section and therefore the request prefix; the chip itself adds no prompt content. Comments add tokens only to the newest tool result or user message, after the cached prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define the current plan chip. They are current package constraints, not a plan-mode comparison or a task backlog.

- **Plan mode is guidance, not an execution sandbox** — deployments that require enforced read-only planning must compose the independent sandbox and approval policies.
- **The chip belongs to the default composer** — a pending whole-composer interaction such as plan review temporarily replaces the InputBar and its chip.
- **Comments are browser-local** — unsent and resolved comments do not survive reload, do not synchronize to another browser, and are not offered on subagent plan documents.
- **Carry-over matches plain text** — a comment moves to a newer version only when its whitespace-collapsed quote occurs in that version's plain text.
- **Highlights need the CSS Custom Highlight API** — browsers without it show the margin markers only.
- **No inactive plan control** — entry uses the shared Command source; a session with the capability but inactive mode shows no plan affordance in the tool row.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. Plan state and boundary ownership are audited by dsh-plan-mode, while the control is a slot effect whose declaration, registration, and teardown are exercised by this package.
