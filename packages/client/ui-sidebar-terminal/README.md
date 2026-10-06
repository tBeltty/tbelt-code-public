---
description: "Open, recover and control interactive shell tabs in the Web right sidebar."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-terminal

## Summary

Choose an installed shell from the right sidebar's Start page to run commands in the Session workspace. Rename terminals in their tabs and recover retained processes after reloading the page. Collapse the sidebar to keep commands running; close a terminal tab to request process termination. Tab completion follows the shell configuration. Commands use the execution environment’s system-user permissions independently of Agent permissions; see [user-terminal execution](../../api/terminal-controller/README.md#use-this-package).

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

The `terminal.new` command creates a separate terminal in the focused dock pane, replacing a guide and retaining existing content pages. From the conversation or a floating content page, it uses the active dock pane. The guide card right-aligns the current effective shortcut as unboxed text without a duplicate tooltip. Windows and macOS Web use the [shortcut service’s platform defaults](../shortcuts/README.md); Linux Web leaves the command unbound by default.

Open the right sidebar and click **New terminal** to open the remembered available shell immediately. The separate arrow beside the title opens the installed-shell menu; selecting an item remembers it and opens that shell directly. Discovery runs when the menu opens and does not allocate a terminal. A failed lookup offers Retry in the menu. Use **New tab** to return to the guide and open another terminal.

Double-click the terminal's tab title to rename it. **Take control** makes the current attachment writable when another page owns input. A temporary disconnect preserves the screen and offers **Reconnect**, without exposing transport diagnostics. An exited shell remains visible with its exit code and offers **New terminal**; it never restarts automatically. Exited terminals count toward the Session limit; close unused tabs when the limit is reached.

Closing or replacing a terminal tab removes it immediately and ends its process in the background. Cleanup failures have no notification or manual retry action; saved unfinished close requests are retried when the Client plugin starts. Collapsing, switching tabs or Sessions, floating and fullscreen presentation preserve the process.

After reload, the [sidebar restores its layout](../../client/ui-sidebar-right/README.md#state) and each terminal reconnects to its saved Host identity in the original tab. Collapsed and inactive tabs do not create recovery duplicates or change selection. Host terminals absent from the saved layout do not reopen automatically and have no UI recovery entry; they remain subject to the controller's unattended idle reclamation and Session/Host disposal. A missing saved process shows a localized unavailable panel with **New terminal**. Clicking it replaces the unavailable tab in place with a fresh terminal; recovery never creates that replacement automatically.

Settled `bash`, `sh`, `shell` and `zsh` fences in the conversation show **Run in terminal** in their header. Clicking it runs the fence source in the execution environment's default shell, in a new terminal tab with the same user permissions as **New terminal**, so the user can answer prompts such as a `sudo` password there. A status row below the fence shows progress and exit status and offers **Show terminal**. When the process exits, or the user closes its tab, the conversation queues a user message with the command, its exit status and the final screen text. Identical fences in one Session share one run state; **Run again** starts a new terminal. A run continues and reports its result after the fence scrolls away or another Session is shown.

The terminal background, default text, cursor, and selection follow the DSH theme, including system preference and theme-token overrides. Theme changes preserve the running shell, output, and application OSC color overrides. Reset commands restore colors to the current DSH defaults. xterm adjusts text toward 4.5:1 contrast; the cursor keeps at least 3:1 contrast against its cell background, including Vim colorschemes.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This plugin registers the `terminal` type and body/title seats with the right sidebar. The guide reuses the Plugins page’s blue terminal artwork; tab titles use the line glyph. The React-free terminal model belongs to `api-terminal-controller`; keyed framework hooks expose its state. `ui-primitives` Menu and Button provide the shell picker and startup controls, including keyboard navigation and the selected-item marker. The body loads its package-local `client.terminal.js` chunk when a terminal view mounts, keeping xterm.js and FitAddon out of the startup `client.js`; they then render the screen and measure the viewport. The body reserves an 8px gap below the tab strip within the pane height. Input, including Tab and control characters, travels unchanged to the PTY.

The terminal controller saves each globally unique content identity's Host association independently and owns content recovery; the sidebar owns layout persistence. A recovered view cannot allocate a replacement process. The sidebar's close handler schedules cleanup through the [terminal controller](../../api/terminal-controller/README.md#understand-the-implementation) and returns synchronously. Browser component cleanup and the tab's abort signal only detach browser work.

The Client provides the optional `chatCodeRunner` service that Chat passes to its Markdown delegate. Each Session has one runner whose run states are keyed by fence source and outlive fence components; plugin unload cancels pending result waits without closing terminals. The [terminal controller](../../api/terminal-controller/README.md#use-this-package) creates the command terminal and returns its result.

At plugin startup, terminal-kind entries in the sidebar's complete open-tab inventory retain matching saved Host identities, including dormant Sessions. This window hold remains independent of React mounts and screen subscriptions. Removing the last matching occurrence releases it; collapsing or switching views does not. The [terminal controller](../../api/terminal-controller/README.md#use-this-package) owns unattended idle reclamation and long-command protection.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Subprocess](../../subprocess/subprocess/README.md)
- [Right Sidebar](../../client/ui-sidebar-right/README.md)
- Web terminal decision

<a id="model-experience"></a>
## Model Experience

### User-run command guidance in the system prompt

#### What the model sees

The Host half contributes the static `ui:user-run-commands` system-prompt section at the `USER_RUN_COMMANDS` order:

##### User-run command instruction

```markdown
When a command needs the user's own permissions, such as one your sandbox or approval policy blocked, one that needs sudo or the user's credentials, or one that must change files outside the workspace, write it in a ```bash fenced block and ask the user to run it. The user can run each bash, sh, zsh, or shell block from the conversation: it runs in their default shell in a terminal beside the conversation, where they can answer prompts such as a password, and its exit status and final output arrive as the user's next message. Put one complete command or script in each block. Run commands yourself whenever your tools allow it.
```

#### Token effect

One fixed paragraph whenever this package is loaded.

#### KV Cache effect

The section is static for the lifetime of the package mount, so it remains in the reusable prompt prefix and does not change across Turns.

### Command results

#### What the model sees

After a run ends, the Session receives an ordinary queued user message: a localized introduction, the command in a fence of its own language, the exit code or a stopped or failed status, and up to the terminal controller's `maxCommandOutputChars` of final screen text in a `text` fence, preceded by an omission note when history was dropped. Interactive terminal output never reaches the model.

#### Token effect

Each run adds one user message whose size follows the command and its bounded output.

#### KV Cache effect

The message is appended after the existing conversation, so earlier request prefixes stay reusable.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Shell discovery or native PTY startup can fail. The tab reports the failure without launching a different shell.
- Completion menus and inline suggestions depend on shell configuration. The Web UI adds no independent completion engine.
- Application OSC color overrides are retained by the mounted renderer; a newly opened renderer cannot recover them from the Host screen snapshot.
- Run uses the execution environment's default shell for every accepted fence language; a `bash` fence runs in `zsh` when that is the default shell, and Windows `cmd.exe` cannot run POSIX fences.
- Command terminals count toward the Session terminal limit after they exit; Run reports the limit error until unused tabs are closed. Reporting needs the Session's Client binding, so a Session released from the window shows the report failure and keeps the output in its terminal tab.
- A command's reported output is the final screen and bounded scrollback, so earlier output and full-screen application frames can be missing.
- Terminal history is bounded. Interactive terminal output is not sent to the Agent. The feature does not provide split terminal panes inside a tab, or restore processes after Host restart.
- A failed terminal chunk load requires a page reload because React caches a rejected lazy import for the page lifetime.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

No runtime invariant companion is published. One owner orders terminal metadata and screen updates; the provider exposes no independently observed dimensions to compare.

</details>
