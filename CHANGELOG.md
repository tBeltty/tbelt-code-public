# Changelog

Notable changes to tBelt Code, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/tBeltty/tbelt-code-public/compare/v0.2.0-rc.2.20261006...HEAD
[0.2.0-rc.2.20261006]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261006
[0.2.0-rc.2.20261004]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261004
[0.2.0-rc.2.20261003]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261003
[0.2.0-rc.2.20261002]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261002
