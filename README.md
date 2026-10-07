# tBelt Code

<img src="docs/brand/tbelt_logo.png" alt="tBelt logo" width="64" />

tBelt Code is a desktop coding agent. It works with any model provider and runs commands in the operating system's sandbox on your machine.

Download it from [tbelt.online](https://tbelt.online). It is a developer preview; see [SAFETY.md](SAFETY.md).

## Features

- Any provider: hosted APIs with your own key, or local models through Ollama or LM Studio.
- Sandboxed commands with per-session access: Read Only, Workspace Write or Full. Destructive shell and git commands need confirmation, and permission rules can apply to a single agent preset.
- Your own agents as Markdown files in `~/.dsh/presets`, with instructions and per-tool permissions in the front matter.
- A checkpoint before every edit, restored with `/undo`.
- Sessions in git worktrees, so several agents edit one repository in parallel.
- Line comments in the change review, sent to the agent as notes.
- Quote text from an assistant message into your next message.
- Plans with inline comments and versions, reviewed before you approve.
- An Artifacts page listing the files each turn delivered or changed.
- A side panel preview for HTML pages, images, PDFs and local dev servers.
- Point at an element in the preview and the agent knows exactly which one.
- Run buttons on shell commands, executed in a terminal in the side panel.
- Web search through Exa, Perplexity, Brave or Tavily, with your own key.
- Model prices in the model picker, refreshable from a JSON directory you name, with spend per chat and per month and limits with `/budget`.
- Native notifications and an attention filter for sessions that wait for you.
- Automatic context compaction, including for local models with small context windows.
- Memory per project or global with `/remember`, with secrets redacted.
- A repository map in context at the start of each session.
- Inspector, Coder and Tester subagents, and saved agent presets.
- MCP servers, skills and plugins.
- Sessions are stored locally, and usage analytics are off.

## Platforms

| Platform | Package | Updates |
| --- | --- | --- |
| Windows 10 or 11, x64 | `.exe` | In the app |
| macOS 12+, Apple silicon | `.dmg` | Manual |
| Linux x64 | AppImage | In the app |

Builds are not code-signed yet.

## Contributing

Bug reports, ideas and pull requests are welcome. Open an [issue](https://github.com/tBeltty/tbelt-code-public/issues) for bugs and feature ideas, or send a pull request directly. This repository is published from a mirror, so accepted changes are merged by hand and can take a while to land.

Contributions are licensed under the same terms as the project.

## License

Copyright (C) 2026 tBelt. Licensed under the [GNU Affero General Public License v3.0](LICENSE), with an [additional permission](LICENSES/Claude-Agent-SDK-exception.txt) to combine it with the Claude Agent SDK. tBelt Code builds on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), which keeps its [MIT license](LICENSES/DeepSeek-Harness-MIT.txt). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
