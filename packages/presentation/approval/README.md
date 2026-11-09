---
description: "Plain-language approval prompt, its decisions and session-scoped grants, shared by the GUI and the terminal client."
kind: "package-library"
---

# dsh-presentation-approval

## Summary

Gives the GUI and the terminal client one approval prompt. `approvalModel` returns a locale key for "I need permission to …" chosen by the kind of tool, the requester's reason apart as a "because" line, a technical block with the tool name and call id, and the decisions to offer: Allow once, Allow for this session in a menu beside it, and Reject. `ApprovalGrants` remembers what a person allowed for one session. The package has no DOM, Cordis service or I/O. Clients translate the keys with their own dictionaries.

## Table of Contents

- [Use this package](#use-this-package)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The main sentence never carries a path, command or flag; those belong in the technical block, which a client shows collapsed. `approvalModel` classifies the tool with `dsh-presentation-tool-call`, so a tool added there as a shell, edit, read, search or code tool gets the matching sentence, and every other tool gets the generic one.

`approvalScopeKey` names a permission: the same tool asking for the same reason is the same permission. A client keeps one `ApprovalGrants` per session. When the person picks Allow for this session, it calls `grant(model.scopeKey)` and answers the Host with `approvalOutcome(choice)`, which is a one-time `allowed-once`; later requests with the same key are answered with `allows(key)` and never shown. The Host and the session log see only one-time allows, so the grant cannot outlive the client or reach another session.

-----

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Grants live in the client** — closing the window or reloading forgets them, and a second client of the same session does not see them. Persisting them needs a session event so that the log can replay what the model was allowed to do.
- **A grant matches tool and stated reason, not arguments** — two commands from one tool with the same reason share a grant.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This library owns no mutable runtime relationship.
