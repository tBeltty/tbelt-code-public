# tBelt Code

<img src="docs/brand/tbelt_logo.png" alt="tBelt logo" width="64" />

tBelt Code is a coding agent for your desktop. It reads your code, edits files and runs commands in a sandbox on your own machine, using the model you pick. You decide what each session may touch.

Download it from [tbelt.online](https://tbelt.online). The app is a developer preview, so read [SAFETY.md](SAFETY.md) before you point it at anything you can't afford to lose.

## What it does

- It works with any model. Connect a hosted provider with an API key, or run a model locally with Ollama or LM Studio. No provider comes preconfigured.
- It works through a task step by step: it reads your code, edits files, then runs your tests or build to check the change. You see each step as it happens.
- Before it edits a file, it saves a checkpoint, and `/undo` puts the files back.
- `/remember` stores a fact for later sessions, in one project or in all of them. Text that looks like a key or password is redacted before it is saved.
- At the start of a session it gives the model a map of your repository.
- Commands run inside the operating system's sandbox, with Read Only, Workspace Write or Full access per session. `rm -rf`, `git reset --hard` and force pushes wait for your confirmation.
- Sessions stay on your computer. Only the requests to your model provider leave it.
- The Inspector, Coder and Tester subagents can take parts of a large task, and you can save agent presets for work you repeat.
- MCP servers, skills and plugins are added from the settings.

## Platforms

| Platform | Package | Updates |
| --- | --- | --- |
| Windows 10 or 11, 64-bit | Installer (`.exe`) | In the app |
| macOS 12 or later on Apple silicon (M1 or newer) | Disk image (`.dmg`) | Download the new version from [tbelt.online](https://tbelt.online) |
| Linux x86-64 | AppImage | In the app |

The macOS build does not run on Intel Macs. The macOS and Windows builds are not code-signed yet, so the first launch asks for confirmation; the download page shows how.

## This repository

Each commit here is the source of a released version, published for review and audit. Pull requests are not accepted. Report bugs and security problems in [Issues](https://github.com/tBeltty/tbelt-code-public/issues).

## License

The source is available under an [audit-only license](LICENSE): you may read, build and run it to review it, but you may not use, modify or redistribute it. tBelt Code builds on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), whose code keeps its [MIT license](LICENSES/DeepSeek-Harness-MIT.txt). Third-party dependencies are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
