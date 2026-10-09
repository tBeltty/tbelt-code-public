---
description: "The Host plugin behind `dsh terminal`: a Remote API client in the Host process that draws one Session in the terminal, for maintainers of the terminal client."
kind: "package-reference"
---

# @deepseek-ai/dsh-terminal-client

## Summary

`dsh terminal` shows one Session in your terminal and talks to the same Remote API as the browser GUI. This plugin builds that client inside the Host process from the Client plugins' browser bundles, connected over an in-process carrier with no socket, port or launch token. A `TerminalSession` draws the transcript and composer, sends prompts, cancels turns and answers permission requests. Slash commands open screens for providers, API keys, web search, settings, plugins, agent presets and permissions, so a fresh install is set up without the GUI. Use `dsh-headless` instead for one task per process.

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

The plugin is mounted by the `terminal` profile, so the command is `dsh terminal` (the same as `dsh --profile terminal`). It needs an interactive terminal on standard input and output and fails with a one-line message otherwise.

```sh
dsh terminal                    # new session in this directory
dsh terminal --continue         # the latest session started in this directory
dsh terminal --resume 3f9a      # the session whose id starts with 3f9a
dsh terminal --cwd ~/code/app   # work in another directory
tbelt                           # the same command as dsh terminal
```

`tbelt` and `dsh-tui` are other names for `dsh terminal` that the npm package installs next to `dsh`; Orca lists its agent when it finds `dsh-tui`. They take the same arguments, and `tbelt --version` prints the launcher's version. `dsh` stays installed under its own name because terminal hosts such as Orca detect agents by it.

The session id printed at start and at exit is the part after `session-`, so the line at exit can be pasted back after `--resume`.

| Input | Effect |
|---|---|
| Enter | Send the message |
| Alt+Enter, or `\` then Enter | Add a line; pasted text keeps its line breaks |
| Up, Down | Move between lines, then through earlier messages |
| `/help`, `/exit` | Show the keys, leave |
| `/sessions` | Choose another stored session; type to filter by title, directory or id |
| `/rename <title>` | Name this session |
| `/model` | Choose the model for the next message |
| `/model default` | Choose the model new sessions start with |
| `/providers` | Add, configure or remove a model provider, replace or remove its API key, choose its models |
| `/web-search` | Choose the web search provider and store its key |
| `/settings` | Edit agent loop, shell, subagent and other plain settings, or open the settings file |
| `/plugins` | Turn bundles and single plugins on or off, install or remove a bundle |
| `/agents` | Show an agent preset, use it for this session or make it the default |
| `/permissions` | Choose how freely the agent may act, for this session and optionally for new sessions |
| `/new [directory]` | Start a session in this or another directory |
| `/attach <file>`, `/detach` | Add a file or image to the next message, or remove the attached ones |
| Tab after `@` | Complete a file, directory or session name and write it as a reference |
| `/queue` | Edit, send into the running turn or remove messages that wait |
| `/skills` | List the skills and run one with arguments |
| `/subagents` | Open a subagent session, send it a message or interrupt it |
| `/jobs` | Show background jobs, read the output of one, stop one |
| `/schedule` | List scheduled follow-ups; read their history, retitle, reword, retime or delete one |
| `/goal` | Show, set, edit, pause, resume, complete or clear the goal; `/goal <text>` still sets it directly |
| `/deliverables` | Files a turn changed or presented |
| `/trajectory` | Turns with their timing, and the events of one turn |
| `/feedback` | Rate the last reply or send feedback about the session; `/feedback <text>` still sends it directly |
| `/fork` | Copy this session up to the end of a turn and open the copy |
| `/organize` | Archive, bring back or pin a session |
| `/status` | Model, permissions, plan mode, goal, queue, turns, tokens and context |
| `/workspaces` | Add, rename or remove a workspace |
| `/worktrees` | Create, inspect, open or remove a git worktree of this workspace |
| `/open [path]` | Open this directory or a path in an application of the Host's machine |
| `/budget` | Spend of this session and month against their limits; `/budget <usd>` still sets a limit |
| `/plan show` | Print the newest plan the agent submitted; `/plan` still turns plan mode on or off |
| `/commands` | List every command the Host offers and put the chosen one in the composer |
| Any other `/command` | Run the slash command on the Host; a name that is a skill runs the skill |
| Ctrl+C | Stop the running turn; with a draft, clear it; otherwise leave |
| Ctrl+D | Leave when the composer is empty |
| Ctrl+L | Clear the screen |

A screen asks its questions in place of the composer, one at a time, and `/help` lists the commands. A picker replaces the composer while it is open: type to filter, Up and Down move, Enter chooses, Esc or Ctrl+C closes it. `/sessions` marks the open session and hides sessions that are empty or belong to a subagent. Choosing another session ends this one at the prompt, prints the line that resumes it, and opens the other in its own directory without leaving the process; if the other cannot be opened, the terminal says why and returns to this one. `/model` lists the models the Host can route, marks the one in use, and selects the chosen one for the next message through the same Remote method as the GUI. Typed paths accept `~`, quotes and the backslash-escaped spaces a dropped file brings.

The agent's own questions (`ask_user_question`) and the review of a plan from plan mode appear the same way: the question lists its options with a last row for an answer of your own, Enter chooses, and a question that allows several answers ticks them with Enter and continues from the first row. A plan under review prints the plan and offers Approve and Keep planning. Esc or Ctrl+C leaves the questions, so the agent is told you declined and, for a plan, stays in plan mode to wait for your message. While one waits, the window title shows `!`. A slash command that the Host runs prints its result under the command line; a name the Host does not know says so.

The panels (`/queue` to `/commands` above) run like the configuration screens, in place of the composer, over the same Remote methods and client services the GUI pages call. The rows, summaries and lines they draw come from `dsh-terminal-views`. A turn that changed files ends with a line that points to `/deliverables`. Workflow runs print a line when a run starts, when each member agent starts and ends, and when the run ends. The status line above the composer counts queued messages and attachments waiting for the next message.

A screen reads and writes through the Remote methods the GUI settings pages call, so it shows the same providers, keys and values and refuses what the GUI refuses. Lists that tick several items (the models of a provider) take Enter to tick and the first row to continue. Questions that take a key hide what you type, check the key with the provider (`llm.discoverModels` with `live`, or `web.checkSearchKey`) before anything is stored, and never print it. A new provider is written in the order profile, then key, so a refused profile leaves no orphan key; the first model of a provider added while no model could run becomes the default for new sessions. `/providers` adds a local or custom server (Ollama, LM Studio or any compatible address) from the same templates as the GUI, and a provider can be set up with a typed model list when its server lists none. Only one screen is open at a time.

`/attach` reads a PNG, JPEG, WebP or GIF by its first bytes, never by its extension, and sends it as an image part of the next message, after the text. Any other regular file is uploaded to the Host through the service the GUI uses and goes as a file part. A message the Host refuses keeps its attachments for the next try. Images in the conversation draw inline when the terminal speaks Kitty graphics (PNG only) or the iTerm2 protocol (every format, including WezTerm); elsewhere, and inside tmux or screen, they show as a line such as `[image shot.png · 800×600 · 24 KB]`. History of a reopened session shows markers only, so resuming a long session does not fetch every image.

The window title shows what the session is doing, so a tab strip or a host such as Orca can tell a working session from a resting one: `✦ <title>` at rest, a braille spinner frame while a turn runs, `! <title>` while a permission question waits. The title is the session name, or the directory name before the session has one, and it is handed back to the terminal when the session closes. In a pane with `ORCA_PANE_KEY` set, the whale emoji follows the prefix (`✦ 🐋 <title>`), the marker Orca reads to identify a `dsh` pane; elsewhere no marker is written.

A tool that needs permission asks in plain words and shows the technical detail beneath: `y` or Enter allows once, `s` allows the same permission for the rest of the session (kept by this terminal only, so it ends with it), `n` or Esc rejects.

| Field | Default | Meaning |
|---|---|---|
| `resume` | none | Session id or unique id prefix to reopen |
| `continueLatest` | `false` | Reopen the latest non-empty session started in the working directory |
| `cwd` | process directory | Directory new sessions start in and `--continue` searches; `~` and relative paths are resolved, and a missing directory stops the start |
| `images` | `auto` | `auto` picks Kitty or iTerm2 images from the terminal environment, `kitty` or `iterm2` forces one, `off` prints a text marker |
| `imageMaxBytes` | 20 MiB | Largest image file `/attach` reads |
| `fileMaxBytes` | 20 MiB | Largest other file `/attach` uploads |
| `title` | `auto` | `auto` keeps the window title in step with the session, `off` never writes it |
| `titleFrameMs` | `500` | Time between spinner frames in the title while a turn runs; at least 100 |

The generated configuration catalog is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser and terminal clients share every Client plugin of the data tier. The Client plugins build to `lib/client.js`, a browser-format file that registers a factory through `window.__ModuleLoader__`. `NodeModuleTable` evaluates those files in Node, answers their `require` calls from the seeded `@deepseek-ai/cordis` and `@deepseek-ai/dsh-client-store` modules or from another registered bundle, and refuses package-local chunks, duplicate registrations and cycles. The Client store is the Client program's module, so it loads through a computed specifier that keeps its sources out of the Host program.

`createInProcessTransport` is the pair of hooks the worker preview installs as `globalThis.__DSH_TRANSPORT__` and `__DSH_FILE_UPLOAD__`, with function calls in place of `postMessage`. Unary calls become a `Request` against the Host's `connection.createSharedFetchHandler('/api')`. Streams open through `typertGateway.wireStream`; a Host failure crosses as an error carrying the `dshRemoteStreamFailure` marker the Gateway client reads, and an abort rethrows the abort reason. The carrier declares `ownsHost`, because the process that runs the client also runs the Host.

`bootClientTree` installs the hooks, mounts the roster in dependency order on a fresh Cordis root, waits until the Connection reports `connected` (30 seconds at most), and returns the `sessions` and `remote` services. Disposal stops the plugins and restores the previous hook values. Those services are used through structural `ports.ts` interfaces, because the Client bundles' `Context` declarations cannot share a TypeScript program with the Host's; the transport contract suite runs the real services against the same scenario that the ports describe.

`runTerminal` waits for the first Session list, applies `chooseSession`, creates the session in the working directory or reopens the chosen one, retains it, and puts standard input into raw mode with bracketed paste. A `/sessions` or `/new` choice makes the `TerminalSession` dispose itself and report a `SwitchTarget`; the runner releases that session, mounts the next and, if mounting fails, mounts the previous one again. Each panel is a flow over `FlowUi`: it reads the Session projections, `jobs`, `workspaces` and the Remote namespaces the GUI reads, and every change goes through the call the GUI makes. A deliverable is derived from the events of the loaded history, so a long session lists only the turns that are loaded. `TerminalSession` keeps output in order with a single chain: an appended user message that carries images waits for their bytes (`readAttachment`, one fetch per image) and everything scheduled after it prints behind it. It follows the retained session's event window: a replaced window prints as history, an appended one prints new lines, a settled reply prints only what live chunks did not already show. Permission requests arrive through `remote.$on('approval/request')` on the Agent's Context; `listenForApprovals` answers those of its own session and delegates the rest. `listenForQuestions` does the same for `user-questions/request`, except for timed questions, and a rejection named `UserQuestionError` with code `ASK_CANCELLED` is how a question is declined.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The `terminal-client` plugin: connects the carrier, boots the tree, starts the runner, stops both on disposal |
| [`src/runner.ts`](src/runner.ts) | Session choice, raw mode, bracketed paste, resize, restore on exit |
| [`src/terminal-session.ts`](src/terminal-session.ts) | One conversation: input, composer, pickers, questions, commands, images, cancel, permission prompts |
| [`src/host-title.ts`](src/host-title.ts) | The window title writer: writes on change, animates the spinner while a turn runs, hands the title back on release |
| [`src/config/index.ts`](src/config/index.ts) | The configuration screens and their `FlowUi` questions: `providers`, `web-search`, `settings`, `plugins`, `agents`, `permissions`, `models` |
| [`src/panels/index.ts`](src/panels/index.ts) | The panels, one module each, and the `runPanel` switch over `PanelName` |
| [`src/panel-ports.ts`](src/panel-ports.ts) | The Remote namespaces and client services the panels call, as interfaces |
| [`src/files.ts`](src/files.ts) | Reading an image or file to attach and checking a directory on the local disk |
| [`src/client-tree.ts`](src/client-tree.ts) | The Client roster and its boot over the carrier |
| [`src/carrier.ts`](src/carrier.ts) | The in-process transport |
| [`src/module-table.ts`](src/module-table.ts) | Evaluation of browser-format bundles in Node |
| [`src/ports.ts`](src/ports.ts) | The Client services the terminal calls, as interfaces |
| [`tests/transport-contract.host.spec.ts`](tests/transport-contract.host.spec.ts) | One scenario over the GUI's carrier and the in-process carrier through the real Host Connection |
| — | No runtime invariant companion is published; the only relation the plugin owns is the one client tree per Host, which the plugin's effect disposes. |

### Invariant ownership

No invariant companion is published because the plugin owns no relation that two independent observations could contradict.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Terminal client group](../README.md) — the views and this runtime.
- [dsh-terminal-views](../views/README.md) — the pure drawing and input functions this runtime calls.
- [dsh-terminal-app](../../bundle/terminal-app/README.md) — the profile that mounts this plugin.
- Terminal client transport note — why the client runs in the Host process.
- Surface parity manifest — which capabilities the terminal offers.

-----

<a id="model-experience"></a>
## Model Experience

None, as the plugin sends what you type, and the files you attach, as an ordinary user message through the Session controller and registers no prompt section, tool or environment variable; the composed base rows own the prompts and tools. An attached image or file costs the tokens the model counts for it, the same as in the GUI. `/skills` and a skill name typed as a command send `/<name> <arguments>` as a user message, which the Host expands. A reference written with Tab is plain text in the message. API keys typed into a screen go to the credential store and never into a message or the Session log.

#### KV Cache effect

None; typed text and attached files are the only model input and the plugin changes no request prefix. Choosing another model with `/model` changes the model of the next request, as the GUI's selector does. `/agents` and `/permissions` change the preset or permission mode of the session as the GUI does, which changes the prompt and tools of the next request and so starts a new cache prefix; the other screens change settings for later sessions.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits tell you what `dsh terminal` does not do yet and what it needs from the build. They are current constraints; the parity manifest lists the later phases.

- **Needs the client build** — the client bundles come from `pnpm run build`; an installation without them fails at start and names the missing bundle.
- **Files attach by path only** — there is no clipboard paste. Sixel and tmux passthrough are not drawn.
- **Kitty shows PNG only** — other formats under Kitty graphics print the text line.
- **The session picker filters titles, directories and ids** — it does not search message content as the GUI's search does.
- **Directory input is typed** — there is no folder browser or "create folder" in the terminal.
- **`/model` does not choose a reasoning effort** — the model's default effort applies.
- **Timed questions are left to the Host** — a question with a countdown is not shown in the terminal, so it ends with the Host default when the time runs out.
- **Esc leaves the whole batch of questions** — the agent receives a cancellation, not the answers given so far.
- **Slash commands are not completed as you type** — `/commands` lists the Host's commands and puts one in the composer; other lines go to the Host as typed, and the terminal prints the result of those that answer with text.
- **Panels cannot reorder** — workspaces and sessions are not dragged into an order; the session list sorts by recency.
- **Plan comments are not anchored** — the terminal answers a plan question with a note, not with comments on a selection of the plan.
- **Settings lists and records are edited in the file** — `/settings` edits plain values and opens the settings file in your editor for lists, records and per-model tables.
- **Plugin install cannot be cancelled** — `/plugins` waits for `installBundle` to answer; browsing registries, cancelling an install and the plugin inventory are GUI-only.
- **No provider account sign-in** — `/providers` offers key-based and local providers only, so no vendor account login is offered, in line with the model-agnostic policy.
- **No attach to a running Host** — the client always runs in the Host process it starts; attaching over loopback would reuse the same client with a token-based carrier.
- **Partial escape sequences are not buffered** — a terminal that splits one key's bytes over two reads types the pieces as text.
- **The desktop installer does not yet install `tbelt`** — the npm package installs it; the desktop command shim is part of the distribution phase.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The plugin owns one client tree per Host and disposes it in its effect.
