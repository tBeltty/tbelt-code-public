# Safety

## Experimental status

tBelt Code is experimental developer-preview software. It has not undergone a security audit and must not be treated as secure or production-ready.

The project can execute model-generated code and commands, load third-party plugins, and access the network, processes, credentials, and files made available to it. Incorrect model output, defects, misconfiguration, malicious input, or untrusted plugins may damage the host computer, modify or delete files, disclose data or credentials, or cause other unintended effects.

## Sandbox limitations

Sandboxing, approval prompts, and permission controls can reduce risk, but they do not guarantee isolation or prevent damage. Even correctly enforced restrictions cannot protect resources that the project is allowed to access.

Do not rely on tBelt Code as the sole security control for untrusted workloads.

## Outbound data and telemetry

tBelt Code does not upload session content to DeepSeek's servers by default, regardless of which model provider is configured.

The inherited `@deepseek-ai/dsh-session-log-deepseek` plugin uploads the full session log — including file and tool content — as an extra request field when the DeepSeek API is the active model provider. It ships `enabled: true` by default upstream. Every bundle this project ships (`base` and everything built on it — `acp-app`, `headless`, `sdk-app`, `web-app` — plus the standalone `sdk-minimal`) sets `enabled: false`: [`packages/bundle/base/cordis.patch.yml`](packages/bundle/base/cordis.patch.yml), [`packages/bundle/sdk-minimal/cordis.patch.yml`](packages/bundle/sdk-minimal/cordis.patch.yml). Each bundle's test suite asserts the override: [`packages/bundle/base/tests/base.spec.ts`](packages/bundle/base/tests/base.spec.ts), [`packages/bundle/sdk-minimal/tests/sdk-minimal.spec.ts`](packages/bundle/sdk-minimal/tests/sdk-minimal.spec.ts).

Two related mechanisms, both opt-in:
- **`@deepseek-ai/dsh-plugin-package-inventory-deepseek`** attaches the active plugin list to a request when the DeepSeek official API is the active provider.
- **OpenTelemetry session upload** (`session-telemetry-otel`) defaults to `FEEDBACK_ONLY`: uploads a session only on explicit feedback, to a collector endpoint set in configuration — no shipped default endpoint.

If you want zero possibility of any request reaching DeepSeek's infrastructure, don't configure DeepSeek as a model provider; this fork ships with no provider pre-registered. For defense in depth, you can also block `api.deepseek.com` at the network/firewall level.

## Dependency vulnerability audit

No CI workflow runs this automatically. Run it before a release or on a recurring cadence:

```sh
pnpm run security:audit
```

`pnpm audit --prod` reports zero advisories at every severity level as of 2026-09-19. Three transitive packages (`fast-uri`, `undici`, `protobufjs`) needed pins in [`pnpm-workspace.yaml`](pnpm-workspace.yaml)'s `overrides` because no direct dependent's own declared range reached the patched version; drop each pin once its dependent's range does. Re-run after every dependency bump.

## Responsible use

- Run the project with the least privileges and access required.
- Prefer a disposable virtual machine, container, or dedicated environment.
- Keep backups of files that the project can access.
- Do not expose sensitive credentials or data unless you accept the risk.
- Review plugins, configuration, and proposed commands before allowing them to run.

## No warranty or liability

Use tBelt Code at your own risk. The software is provided without warranty under its [license](LICENSE). To the maximum extent permitted by applicable law, the authors and copyright holders are not responsible for damage to computers, loss or disclosure of data, loss of files, or other harm arising from use of the project.
