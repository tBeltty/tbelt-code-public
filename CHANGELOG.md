# Changelog

Notable changes to tBelt Code, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0-rc.2.20261009] - 2026-10-09

### Added

- Manage dsh Command now also works on Linux AppImage installs, and installing it adds `tbelt` and `dsh-tui` commands next to `dsh` on macOS, Windows and Linux.
- A built-in skill, `tbelt-skill-authoring`, teaches agents where skills live and how to write, install and fix them. Ask the agent to add a skill, or run `/tbelt-skill-authoring`. A skill with the same name in your own skills folder replaces it.
- `dsh terminal` opens a session in your terminal. It streams replies, shows tool calls as short lines, asks for permission in plain words with "Allow for this session", and Ctrl+C cancels the running turn. `--resume <id>` and `--continue` reopen earlier sessions. It sends no telemetry.
- In `dsh terminal`, `/sessions` switches to another stored session, `/rename` names the current one, `/model` picks the model, and `/new [directory]` starts a session in another directory; `--cwd` does the same at launch. `/attach <image>` adds an image to your next message, and images in the conversation draw inline in Kitty, Ghostty, iTerm2 and WezTerm, or as a one-line marker elsewhere. The npm package installs `tbelt` as another name for `dsh terminal`.
- In `dsh terminal`, `/providers` adds a provider from the catalog or a local server such as Ollama, checks its API key, lets you tick the models, and replaces or removes keys. `/model default`, `/web-search`, `/settings`, `/plugins`, `/agents` and `/permissions` cover the default model, web search, plain settings, plugins, agent presets and permission modes, so a fresh install is set up without the app.
- `dsh terminal` sets the window title to the session name with a spinner while a turn runs, so tabs show which sessions work. In an Orca pane it also reports working, finished and the session to resume through Orca's status hooks, whichever tBelt Code home you use. `dsh terminal .` starts in the current directory, the way Orca passes a workspace, and the npm package installs `dsh-tui` as another name for `dsh terminal` so Orca lists the agent.

### Changed

- The download site moves to code.tbelt.online.
- The Web app no longer offers the DeepSeek account route or its sign-in. Every provider, DeepSeek included, is added in Settings with its own key.
- Quote opens a comment box next to the selected text, with focus in the reply field. Enter or the send button adds the quote and your comment above the message box; Escape cancels.
- A saved API key now reads "API key configured" with a Replace API button, in Web search and on every provider card in Settings. The key field opens only when you press Replace, and Keep current key closes it without touching the saved key.
- On a provider's card in Settings, the model list and Fetch available models are in view; only the rows fold away, behind "Edit model list". "Customized settings" keeps the base URL and other fine settings.
- Typing a new API key on a provider's card checks it with the provider and warns if it is rejected or has no credit left. You can still save.
- The Add provider list in Settings gets a search box once it has more than eight providers.
- The permission menu, in Settings and in the message box, says what each mode allows under its name. The Settings row shows the same line for the current choice.
- The sidebar's empty session list offers Add workspace.
- `dsh --version` prints `tBelt Code` followed by the version.
- The `dsh` command installed by the desktop app now uses `~/.tbelt-code`, the same home as the app, unless `DSH_HOME` is set.
- A permission prompt says in plain words what the agent wants to do and why. The tool name and the command or file stay in a collapsed "Technical details" block.
- The arrow beside Allow once offers "Allow for this session". The same request from the same tool is then allowed without asking until the session ends.
- The Artifacts tab lists only delivered files. Code changes show as green and red line counts on the tool row.

### Fixed

- `remember_fact` and `/remember` save memories again. Every write used to fail with `per-record key ... is not path-safe`.

## [0.2.0-rc.2.20261008.2] - 2026-10-08

### Changed

- Adding a provider in Settings now works like first-run setup: paste the API key, the models it can use appear right away, and you tick the ones to add. The "Customized settings" section and the Fetch models button are no longer needed for this. Providers that need no key have a "Set up without an API key" option.

### Fixed

- `/clear` no longer fails with `cannot get property "tokenMeter" without inject`.

## [0.2.0-rc.2.20261008] - 2026-10-08

### Added

- Pasting more than 8000 characters into the message box attaches the text as a file instead. The card shows the first lines, and Insert as text puts it back in the message. `pasteToFileChars` in `cordis.yml` sets the limit; 0 turns it off.
- An image larger than 30 MB is attached as a file instead of being refused: it uploads in the background and the agent receives its path. The limit is `maxImageBytes` in `cordis.yml`.
- Uploading file cards show the upload percentage.

## [0.2.0-rc.2.20261007] - 2026-10-07

### Added

- Define an agent in a Markdown file. Each `.md` file in `~/.dsh/presets` becomes an agent preset: the front matter sets its name, description, base preset and permissions, and the text becomes its instructions.
- Model context windows, output limits and prices can be refreshed from a JSON directory you name in `cordis.yml` (`modelMetadata`). It is off by default, has no built-in source, and never overrides a price you set by hand.
- Permission rules can be limited to one agent preset, so a reviewer can be kept from running `git push` while other agents run it freely.

### Changed

- A permission rule for a command such as `git push*` now also catches it inside a longer line like `git status && git push origin main`. An allow rule only applies when every command in the line matches.

## [0.2.0-rc.2.20261006.5] - 2026-10-06

### Changed

- The update dialog lists what changed in the new version and links its release page.

## [0.2.0-rc.2.20261006.4] - 2026-10-06

### Added

- Point at an element in the side panel browser: click the pick button, click the element, and your next message tells the agent exactly which one.

## [0.2.0-rc.2.20261006.3] - 2026-10-06

### Added

- The spend reading under the composer turns amber at 80% of the session or monthly limit, before the limit stops the agent.

## [0.2.0-rc.2.20261006.2] - 2026-10-06

### Added

- Select text in an assistant message and press Command+L (Control+L elsewhere) to quote it. Quotes wait above the composer and go with your next message.
- An Artifacts page in the right sidebar lists the files each turn delivered or changed. A button in the session header opens it and shows the count.
- Start a session in a new git worktree from the workspace menu. Removing a worktree lists its uncommitted changes first.
- Line comments in the change review: click the + next to a line number to leave a note, and send the notes to the agent from the review header or with your next message.

## [0.2.0-rc.2.20261006] - 2026-10-06

### Added

- Native notifications when an agent finishes a turn or waits for your approval. They are skipped while the window is focused, and Settings > General has switches for them.
- The computer stays awake while agents run. A General setting turns it off.
- The session list has an attention filter with a count of sessions that wait for you or finished while you were away.
- A worktree plugin creates, lists and removes git worktrees for sessions, so several agents can edit one repository in parallel. Settings are per project in `cordis.yml`.
- Plugins can add writable folders to `workspace-write`, so a confined `git commit` works inside a linked worktree.
- Bug and feedback issue forms for beta testers.

### Changed

- The site explains how to open the unsigned builds on each system and how updates work.
- The README accepts issues and pull requests.
- The app no longer ships with usage analytics or feedback upload turned on, and no collector address is built in. Nothing but model requests, your configured web search and update checks leaves your computer.

## [0.2.0-rc.2.20261004] - 2026-10-04

### Added

- Shell commands in the chat have a Run button. The command runs in a terminal in the side panel with your permissions, so you can type a password if it asks for one, and the agent reads the output when it finishes. The agent offers these when its sandbox blocks a command or the command needs sudo.
- Skills in a project's `.claude/skills` folder load on their own. A skill whose header leaves out its name or description still loads, named after its folder and described by its first paragraph.

### Changed

- The agent checks your skills before it starts each task and follows the ones that apply. When it hands work to a subagent, it tells the subagent which skills to use.
- Plans and plain-text files have their own icons in tabs and cards.
- Every screen and message in the app says tBelt Code.
- New installs keep their default workspace in `~/Documents/tbelt-code`. App data and logs from an earlier version move to tBelt Code folders on first launch.

### Fixed

- `/clear` no longer fails in every session with an error saying an operation is still active.
- Automatic compaction no longer stops after its first warning on models with a small context window, such as many local models.

## [0.2.0-rc.2.20261003] - 2026-10-03

### Added

- Web search through Exa, Perplexity, Brave or Tavily. Pick one in Settings > Plugins > Web search and paste its API key. The app checks the key with that provider before saving it and sends it to no other service.
- Provider setup has a search field and lists every provider in one place.
- Entering an API key checks it with the provider and lists that provider's models right away, with none selected.
- The model picker has an "Add model…" entry that opens the model settings.
- What the current chat has spent shows under the message box. Hover it for this month's total; click it to open the spending settings.
- Settings has a Spending page with this month's spend and a monthly limit. There is no limit unless you set one.
- Each model in the model settings can have its own price per million tokens, so spend also counts for models from any provider.
- Fetching models from OpenRouter and compatible gateways keeps the price they publish.
- A custom provider whose address uses plain `http:` on another machine shows a warning that the key would travel unencrypted.
- The agent shows HTML pages, images, PDFs and local dev servers in the side panel instead of opening your browser. The page shows first, and the code is one click away.

### Changed

- When a search fails, the message says whether the provider rejected the key or the key ran out of quota.
- tBelt Code is now free software under the GNU AGPL v3.0.
- Settings has its own button in the sidebar instead of sitting inside the "More" menu.

### Fixed

- Long text in plan comments and in the plan review card no longer overflows its box.
- Arrow keys keep moving through the model picker after the first step.

## [0.2.0-rc.2.20261002] - 2026-10-02

### Added

- First public release of the source, for review and audit.
- Setup on first launch: pick a provider, enter its API key, then pick a model.
- Memory, `/undo` and the repository map are on by default.
- The model picker shows each model's price per million tokens when the provider publishes one.
- `/budget` sets a spending limit for the month or for one session. When a limit is reached, the model stops and the app says which limit and how much was spent.
- You can select text in a plan and comment on it before you approve the plan.

### Changed

- The welcome screen no longer favors a provider.

### Fixed

- New sessions no longer fail on their first message.
- Downloads no longer return an older installer.
- A key that ran out of credit or hit its spending limit is reported as a quota problem instead of an invalid API key.

[Unreleased]: https://github.com/tBeltty/tbelt-code-public/compare/v0.2.0-rc.2.20261009...HEAD
[0.2.0-rc.2.20261009]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261009
[0.2.0-rc.2.20261008.2]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261008.2
[0.2.0-rc.2.20261008]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261008
[0.2.0-rc.2.20261007]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261007
[0.2.0-rc.2.20261006.5]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261006.5
[0.2.0-rc.2.20261006.4]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261006.4
[0.2.0-rc.2.20261006.3]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261006.3
[0.2.0-rc.2.20261006.2]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261006.2
[0.2.0-rc.2.20261006]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261006
[0.2.0-rc.2.20261004]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261004
[0.2.0-rc.2.20261003]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261003
[0.2.0-rc.2.20261002]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261002
