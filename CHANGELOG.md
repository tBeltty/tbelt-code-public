# Changelog

Notable changes to tBelt Code, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/tBeltty/tbelt-code-public/compare/v0.2.0-rc.2.20261006.5...HEAD
[0.2.0-rc.2.20261006.5]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261006.5
[0.2.0-rc.2.20261006.4]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261006.4
[0.2.0-rc.2.20261006.3]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261006.3
[0.2.0-rc.2.20261006.2]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261006.2
[0.2.0-rc.2.20261006]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261006
[0.2.0-rc.2.20261004]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261004
[0.2.0-rc.2.20261003]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261003
[0.2.0-rc.2.20261002]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261002
