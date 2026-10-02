---
description: "The explicit /remember command over ctx.memoryStorage: argument shape, redaction, and scope resolution, for users and maintainers choosing or debugging the command."
kind: "package-reference"
---

# @deepseek-ai/dsh-command-remember

## Summary

`dsh-command-remember` adds a `/remember` command to chat UIs: the user types it to durably remember something — a fact, preference, correction, or pointer — that should be recalled in a later, unrelated session. It writes through `@deepseek-ai/dsh-memory-storage`'s `writeEntry`, which redacts the content before it reaches disk, so a value that looks like a credential is withheld rather than stored verbatim. This is the explicit half of Phase 7's dual write path; `@deepseek-ai/dsh-tool-remember`'s `remember_fact` tool is the automatic half, and both call the same write API.

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

Type `/remember` in a chat UI to durably store a fact, preference, correction, or pointer.

### Using the command

`/remember [--type=user|feedback|project|reference] [--global] <name> <text to remember>`

| Argument | Meaning |
|---|---|
| `--type=...` | One of the four memory categories; defaults to `user` when omitted. |
| `--global` | Store at the global tier (every project); omitted defaults to the project tier, scoped from the session's working directory. |
| `<name>` | The entry's slug: lowercase, hyphen-separated, the first whitespace-delimited token after any flags. |
| `<text to remember>` | Everything after the name; stored as the entry's content and (truncated) its index description. |

| Input | Result |
|---|---|
| `/remember --global ci-preferences Never add a Co-Authored-By trailer.` | `Remembered "ci-preferences" (user, global).` |
| `/remember local-fact This project uses pnpm workspaces.` | `Remembered "local-fact" (user, this project).` |
| `/remember just-a-name` (no content) | `Usage: /remember [--type=...] [--global] <name> <text to remember>` |
| `/remember --type=bogus name text` | `Unknown --type value "bogus". Valid types: user, feedback, project, reference.` |
| Content containing a detectable secret | Success text ends with `(some content was withheld as a possible secret)`; the secret span is replaced with a marker before it reaches disk. |

### Composing the command

Mount the command registry and this plugin's `ctx.memoryStorage` dependency:

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: storage
  name: '@deepseek-ai/dsh-storage'
- id: storage-json
  name: '@deepseek-ai/dsh-storage-json'
  config:
    root: !!js dshHomePath('storages')
- id: storage-domain
  name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
- id: memory-storage
  name: '@deepseek-ai/dsh-memory-storage'
- id: command-remember
  name: '@deepseek-ai/dsh-command-remember'
```

### What happens to the conversation

The write happens through `ctx.memoryStorage`, entirely outside the session log's message history; only the command lifecycle (`command/run`/`command/done`) is recorded. A project-scope write with no known session `cwd` reports an error rather than silently falling back to global.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the command; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

- **One write choke point.** This command owns argument parsing and result-text formatting only; every validation, redaction, and durability decision belongs to `ctx.memoryStorage.writeEntry`, which this command calls exactly like `remember_fact` does — neither package duplicates or works around the other's logic.
- **Registration shape mirrors `command-undo`.** An in-flight `Set` of pending operations and a drain-before-teardown `ctx.effect`, so an aborted `/remember` settles before root disposal completes.
- **Fails loud on missing scope.** A project-scope write with no session `cwd` is a usage error, not a silent fallback to global — a global write and a project write have different visibility, and guessing would be surprising.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: argument parsing, `/remember` registration, lifecycle drain |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Memory subsystem](../../../docs/subsystems/memory.md) — the storage domain, Markdown artifacts, and both write paths.
- [memory group map](../README.md) — the sibling group page and its package table.
- [dsh-memory-storage](../memory-storage/README.md) — the write API this command calls.
- [dsh-tool-remember](../tool-remember/README.md) — the automatic write path, over the same write API.

-----

<a id="model-experience"></a>
## Model Experience

### Human `/remember` control

#### What the model sees

The slash input and direct result never enter a model request; only the command's own `command/run`/`command/done` pair is recorded in the session log.

#### Token effect

The command lifecycle adds no model tokens.

#### KV Cache effect

Discovery and command bookkeeping do not affect the cache; this command performs no model request itself.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No edit or delete** — `/remember` only ever writes a new entry or metadata-patches an existing one by reusing its name; there is no command to remove an entry.
- **Description is derived, not authored** — the index summary is the content itself, truncated; there is no separate short-description argument.
- **Command adapters only** — surfaces without `ctx.commands` cannot invoke it.

No runtime invariant companion is published because writes are delegated to the memory-storage service, which owns the one relationship (index vs. entry files) that could diverge; this package adds no independent mutable relationship of its own.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
