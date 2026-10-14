---
description: "The Web side-conversation dialog: `/btw` opens a modal for questions asked while the agent keeps working, with a button that sends the exchange to the main chat; for users and maintainers of the side-question experience."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-btw

## Summary

This package is the Web GUI's side-conversation surface. A bare `/btw`, or `/btw` followed by a question, opens a dialog where the user asks questions while the agent keeps working; the agent is not interrupted and the questions stay out of the chat transcript. The dialog's "Send context to chat" button queues what was discussed on the main agent as context, so a decision made while it worked reaches it. One controller per Session backs the dialog and the command, and the thread persists in the Host while the dialog is closed.

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

Mount this plugin alongside `ui-conversation` and `ui-commands`; Side question then appears in the composer menu and `/btw` opens the dialog. Type a question and press Enter, or choose Ask; Shift+Enter adds a line. Each answer joins the thread above, and the next question sees the earlier ones. The agent keeps working behind the dialog, and closing it keeps the thread.

Send context to chat queues the exchanges not yet sent on the main agent as a message from the user. A running agent reads it at its next step; an idle agent reads it with the next message you send. Sent exchanges carry a marker, a toast confirms the delivery, and a long exchange is condensed before it is sent. Clear discards the thread. `/btw --send` and `/btw --reset` open the dialog on its thread; the terminal client runs the same flags as text commands.

### Failures

A failed question returns to the field so it can be retried, and a warning toast names the cause: the model could not answer, no model is selected in the main chat yet, or the previous question is still running.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package contributes the `btw-dialog` entry (order 3) of `conversation.input.overlay`, which renders the Modal and Toast primitives through body portals and centers the toasts over the composer card it mounts inside. The `btwUi.open(sessionId, question?)` Client service opens that dialog for a Session. The `/btw` decoration is an `action` registered through `ctx.commandUi.decorate`; its `runWithInput` hook, added to the action contract for this command, takes an argued line away from the Host command so a typed question opens the dialog instead of landing in the transcript as a command row.

Per Session, one `BtwDialogController` mirrors the Host's thread and runs ask, send, and clear through `ctx.remote.btw`. Opening reads `btw.get` first, so a thread asked earlier or from another client appears. A failed ask restores the question into an empty field; a successful send marks every present turn as sent and raises the toast; work that settles after the controller is disposed publishes nothing.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Plugin entry: dictionaries, per-session surfaces, overlay entry, `/btw` decoration |
| [`src/client/controller.ts`](src/client/controller.ts) | Headless dialog state and the three operations over the `btw` Remote |
| [`src/client/BtwDialog.tsx`](src/client/BtwDialog.tsx) | The modal, its thread view, and the toasts |
| [`src/client/locales.ts`](src/client/locales.ts) | English and Spanish dictionaries |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the dialog is not enough. They cover the Host side and the command contract.

- [dsh-command-btw](../../interaction/command-btw/README.md) — the `/btw` command, the `btw` Remote, and what the delivery contains.
- [ui-commands](../ui-commands/README.md) — the command decoration contract the `/btw` row goes through.
- [ui-conversation](../ui-conversation/README.md) — declares the composer overlay.
- [Client package map](../README.md) — adjacent browser UI packages.

-----

<a id="model-experience"></a>
## Model Experience

None, as the dialog keeps questions and answers out of the main conversation until a delivery, which [dsh-command-btw](../../interaction/command-btw/README.md#model-experience) defines.

#### KV Cache effect

None; a delivery appends after the existing history, so the cached prefix stays reusable.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define where the side-question dialog behaves differently than a user might expect. They are current package constraints, not a task backlog.

- **Thread is not durable** — the Host keeps the thread in memory per live Session, so a restart empties it; only sent exchanges persist, in the main log.
- **One dialog per Session** — the dialog is modal, so a second question waits for the first answer.
- **No stop button for a running answer** — an answer in flight finishes or fails; closing the dialog does not cancel it.
- **Flags are not run in the Web client** — `/btw --send` and `/btw --reset` open the dialog; its buttons perform them.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers; it is explicitly non-authoritative. Shipped behavior, limits, and rationale live in the sections above and the package code.

- The two button labels are pinned by [`tests/dialog.client.spec.tsx`](tests/dialog.client.spec.tsx); changing them changes user-visible copy.
- Cancelling an in-flight answer would need an abort route on the `btw` Remote.

</details>
