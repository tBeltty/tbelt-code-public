---
description: "The terminal profile for dsh: the Host of the web bundle without its web server or browser plugins, plus the terminal client, for users working in a terminal."
kind: "package-bundle"
---

# @deepseek-ai/dsh-terminal-app

## Summary

Run `dsh terminal` to work with the agent in your terminal. It uses the same model access, tools, permissions and sessions as the browser GUI, because it is the same Host with a terminal as its client. The profile turns off the web server and every browser plugin, so nothing listens on a port, and it mounts no analytics or telemetry plugin. Choose it for work in a terminal or over SSH; use `dsh-web-app` for the browser and `dsh-headless` for one task per process.

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

```sh
dsh terminal                    # new session in this directory
dsh terminal --continue         # the latest session started in this directory
dsh terminal --resume 3f9a      # the session whose id starts with 3f9a
dsh terminal --cwd ~/code/app   # work in another directory
dsh terminal .                  # the same as --cwd ., for hosts that pass the workspace as an argument
dsh terminal --help
```

`--resume` takes a session id or the start of one and fails with the matching ids when the start is ambiguous. `--continue` reopens the latest non-empty session started in the current directory. Using both is a usage error. `--cwd` starts in another directory and also sets where `--continue` looks; the command stops if the directory does not exist. A single directory argument means the same as `--cwd`; giving both is a usage error. The keys and the permission prompt are described in [dsh-terminal-client](../../terminal-client/runtime/README.md#use-this-package).

### Use it in Orca

Run `dsh terminal` in an Orca terminal pane. Orca recognizes the `dsh` process and reads the pane's window title for its tab, which shows a spinner while a turn runs and the session name at rest.

For Orca's own status, enable Orca's DeepSeek Harness status hooks. Orca then writes `~/.orca/agent-hooks/dsh-hooks.json`, and in an Orca pane the terminal profile loads that file itself, whichever tBelt Code home the launcher chose, so the pane reports working, finished and the session id Orca needs to resume. When the home this process reads already holds Orca's own block in `cordis.patch.yml`, the profile leaves it to that block. The plugin setting `orcaHooks: off` turns the automatic load off.

To launch or resume the session from Orca's agent menu, set that agent's command in Orca to `dsh terminal`; Orca then resumes with `dsh terminal --resume <id>`. Orca lists the agent only when `dsh-tui` is on the PATH, which the npm package installs as another name for `dsh terminal`. The tab title and the hooks behave the same for a pane started from the shell.

The terminal client sends no telemetry. The analytics and telemetry rows that the base and web layers ship disabled stay disabled, and the profile's composition test fails if one becomes enabled.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The profile template layers `dsh-base`, `dsh-web-app` and this bundle. The web layer keeps the Host half of the Remote API: the Session, Workspace, Job, Settings and Account controllers, the agent presets, Connection and the forwarded Remote events. This layer disables the rows that exist only to serve a browser: the web server and its start-up flags, the web runtime, the client bundle server, hot reload, the directory picker, the locale, shortcut and theme services, and every `ui-*` row. The Connection row keeps its Host half and drops the web-runtime injection that only fed its browser trust fence.

`terminal-startup` parses `--resume`, `--continue`, `--cwd` and the directory argument with commander and publishes the `terminalStartup` service. The `terminal-client` row reads it through lazy `!!js` config, so a rejected flag or `--help` leaves the client pending and the launcher exits.

After parsing, `terminal-startup` mounts `dsh-hooks-claude-code` on the hook file from [`src/orca-hooks.ts`](src/orca-hooks.ts) when `ORCA_PANE_KEY` is set, the file exists and `$DSH_HOME/cordis.patch.yml` carries no Orca block. Orca's installer writes that block under `~/.dsh` unless Orca itself runs with `DSH_HOME`, while the launchers shipped with the app read `~/.tbelt-code`, so the block alone would sit where this process never looks. The bridge reports `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse` and `Stop`; Orca has no hook for an approval pause, so a pane waiting for permission reads as working there while its title shows `!`.

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The patch over base and web: disabled browser rows and the two terminal rows |
| [`src/index.ts`](src/index.ts) | The `terminal-startup` provider and the Orca hook mount |
| [`src/orca-hooks.ts`](src/orca-hooks.ts) | Where Orca's hook file is, and whether this process should load it |
| [`tests/startup.spec.ts`](tests/startup.spec.ts) | Command-line parsing and the Orca hook mount over a real Loader tree |
| [`tests/orca-hooks.spec.ts`](tests/orca-hooks.spec.ts) | The hook file lookup against fake machines |
| [`tests/composition.spec.ts`](tests/composition.spec.ts) | The composed entry list: Host rows kept, browser rows off, no analytics or telemetry mounted |
| — | No runtime invariant companion is published; the patch registers nothing and holds no mutable relation to audit. |

### Invariant ownership

No invariant companion is published because the bundle contributes configuration rows and a command-line provider only.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Bundle package map](../README.md) — the surfaces built on the same core.
- [dsh-terminal-client](../../terminal-client/runtime/README.md) — the plugin this profile mounts.
- [dsh-web-app](../web-app/README.md) — the browser surface whose Host this profile reuses.
- [dsh-cmdline](../../boot/cmdline/README.md) — how the launcher hands the command line to the app.

-----

<a id="model-experience"></a>
## Model Experience

None, as the bundle adds no prompt section, tool or environment variable and the composed base and web rows own the prompts and tools.

#### KV Cache effect

None; the bundle changes no request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Layered over the web bundle** — the profile keeps the web layer's Host rows and turns the browser rows off one by one, so a row added to the web layer for the browser needs a line here when it cannot run without a web server; the composition test names the ones that must be off.
- **Needs an interactive terminal** — redirected input or output fails at start with a one-line message.
- **No `tbelt` alias** — the alias for `dsh terminal` is not installed.
- **Orca agent menu** — Orca lists the DeepSeek Harness agent when `dsh-tui` or `dst` is on the PATH, and recognizes the process `dsh`, not `tbelt`. The npm package installs `dsh-tui` but not `dst`; a community `dsh-tui` installed in the same prefix conflicts with it.
- **Orca approvals** — Orca has no hook for an approval pause and answers permission prompts only in the pane; the pane's title shows `!` while one waits.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The patch registers nothing and holds no mutable relation.
