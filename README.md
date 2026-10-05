# tBelt Code

<img src="docs/brand/tbelt_logo.png" alt="tBelt logo" width="64" />

tBelt Code is a desktop coding agent. It works with any model provider and runs commands in the operating system's sandbox on your machine.

Download it from [tbelt.online](https://tbelt.online). It is a developer preview; see [SAFETY.md](SAFETY.md).

## Features

- Any provider: hosted APIs with your own key, or local models through Ollama or LM Studio.
- Sandboxed commands with per-session access: Read Only, Workspace Write or Full. Destructive shell and git commands need confirmation.
- A checkpoint before every edit, restored with `/undo`.
- Memory per project or global with `/remember`, with secrets redacted.
- A repository map in context at the start of each session.
- Inline comments on a plan before you approve it.
- Model prices in the model picker, and monthly or per-session spend limits with `/budget`.
- Inspector, Coder and Tester subagents, and saved agent presets.
- MCP servers, skills and plugins.
- Sessions are stored locally.

## Platforms

| Platform | Package | Updates |
| --- | --- | --- |
| Windows 10 or 11, x64 | `.exe` | In the app |
| macOS 12+, Apple silicon | `.dmg` | Manual |
| Linux x64 | AppImage | In the app |

Builds are not code-signed yet.

## This repository

The source of each release. Pull requests are not accepted; report bugs and security issues in [Issues](https://github.com/tBeltty/tbelt-code-public/issues).

## License

Copyright (C) 2026 tBelt. Licensed under the [GNU Affero General Public License v3.0](LICENSE), with an [additional permission](LICENSES/Claude-Agent-SDK-exception.txt) to combine it with the Claude Agent SDK. tBelt Code builds on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), which keeps its [MIT license](LICENSES/DeepSeek-Harness-MIT.txt). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
