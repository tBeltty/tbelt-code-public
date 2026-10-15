# tBelt Code

<img src="docs/brand/tbelt_logo.png" alt="tBelt logo" width="64" />

[![Release](https://img.shields.io/github/v/release/tBeltty/tbelt-code-public?include_prereleases&label=release&style=flat&labelColor=2b2b2b&color=4a4a4a)](https://github.com/tBeltty/tbelt-code-public/releases)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL%20v3-4a4a4a?style=flat&labelColor=2b2b2b)](LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-4a4a4a?style=flat&labelColor=2b2b2b)](https://code.tbelt.online)

tBelt Code is a coding agent for your desktop and your terminal. It works with any model provider and runs commands in the operating system's sandbox on your machine.

Download the app from [code.tbelt.online](https://code.tbelt.online). It can install the `tbelt` command for your terminal. It is a developer preview; see [SAFETY.md](SAFETY.md).

## Features

- Any provider: hosted APIs with your own key, or local models through Ollama or LM Studio.
- Browser sign-in for providers that support it, such as ChatGPT for OpenAI, in the app and in `dsh terminal`.
- Sandboxed commands with per-session access: Read Only, Workspace Write or Full. Destructive shell and git commands need confirmation, and permission rules can apply to a single agent preset.
- Your own agents as Markdown files in `~/.dsh/presets`, with instructions and per-tool permissions in the front matter.
- A checkpoint before every edit, restored with `/undo`.
- Side questions with `/btw` while the agent keeps working, and one action to send what you learned to the chat.
- Sessions in git worktrees, so several agents edit one repository in parallel. A worktree row shows its branch.
- Line comments in the change review, sent to the agent as notes.
- Quote text from an assistant message into your next message.
- Long pasted text becomes a file attachment with a preview, and one click puts it back as text.
- Images over 30 MB attach as files, with an upload percentage, instead of being refused.
- Plans with inline comments and versions, reviewed before you approve.
- The app and `dsh terminal` are available in English, Spanish, Greek and French, and follow your system language until you pick one.
- A light theme next to the dark one, or follow the system setting.
- Choose the font for text, code and the terminal.
- An Artifacts page listing the files each turn delivered or changed.
- A side panel preview for HTML pages, images, PDFs and local dev servers.
- Point at an element in the preview and the agent knows exactly which one.
- `dsh terminal`: the same sessions in a terminal, with streaming, tool lines, plain-language permission prompts, agent questions with or without a time limit, plan review and resume.
- In the terminal, switch sessions, rename them, pick the model, start in another directory, and attach images that draw inline.
- In the terminal, manage the queue, background jobs, subagents, scheduled follow-ups, goals, skills, workspaces and worktrees, and complete `@` references with Tab.
- In the terminal, add providers and API keys, choose models, set web search, edit settings, manage plugins and agent presets, and pick permission modes.
- In Orca, a `dsh terminal` pane shows live status in the tab.
- Run buttons on shell commands, executed in a terminal in the side panel.
- Web search through Exa, Perplexity, Brave or Tavily, with your own key.
- Model prices in the model picker, refreshable from a JSON directory you name, with spend per chat and per month and limits with `/budget`.
- Native notifications and an attention filter for sessions that wait for you.
- Automatic context compaction, including for local models with small context windows.
- Memory per project or global with `/remember`, with secrets redacted.
- A repository map in context at the start of each session.
- An Automation tasks page for the tasks and reminders agents schedule.
- Inspector, Coder and Tester subagents, and saved agent presets.
- Fast mode: a short prompt and a few core tools. The agent turns on search, web, subagents and other tool groups when a task needs them.
- Manual and autonomous audit modes: the agent splits work into numbered tasks with checks and approves a task only after re-running its checks.
- MCP servers, skills and plugins.
- `tbelt` opens `dsh terminal`, and `dsh-tui` does the same. Install both, and `dsh`, from the app on macOS, Windows and Linux.
- A built-in skill that shows agents how to write and install new skills.
- Sessions are stored locally, and usage analytics are off.

## Platforms

| Platform | Package | Updates |
| --- | --- | --- |
| Windows 10 or 11, x64 | `.exe` | In the app |
| macOS 12+, Apple silicon | `.dmg` | Manual |
| Linux x64 | AppImage | In the app |

The terminal command installs from the app on all three. Builds are not code-signed yet.

## Contributing

Bug reports, ideas and pull requests are welcome. Open an [issue](https://github.com/tBeltty/tbelt-code-public/issues) for bugs and feature ideas, or send a pull request directly. This repository is published from a mirror, so accepted changes are merged by hand and can take a while to land.

Contributions are licensed under the same terms as the project.

## License

Copyright (C) 2026 tBelt. Licensed under the [GNU Affero General Public License v3.0](LICENSE), with an [additional permission](LICENSES/Claude-Agent-SDK-exception.txt) to combine it with the Claude Agent SDK. tBelt Code builds on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), which keeps its [MIT license](LICENSES/DeepSeek-Harness-MIT.txt). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
