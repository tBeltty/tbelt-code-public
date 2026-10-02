# Changelog

Notable changes to tBelt Code, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/tBeltty/tbelt-code-public/compare/v0.2.0-rc.2.20261002...HEAD
[0.2.0-rc.2.20261002]: https://github.com/tBeltty/tbelt-code-public/releases/tag/v0.2.0-rc.2.20261002
