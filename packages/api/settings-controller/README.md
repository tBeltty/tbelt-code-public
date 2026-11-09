---
description: "Host Remote owner for settings and credential configuration surfaces, including redacted reads, writes, credential references, and native document opening."
kind: "package-reference"
---
# Settings Controller

## Summary

`@deepseek-ai/dsh-api-settings-controller` exposes generated `ctx.remote.settings`, `ctx.remote.credentials` and `ctx.remote.authorization` namespaces for configuration surfaces. It returns redacted settings and credential metadata, supports settings and credential writes without returning secret values, and opens provider-owned settings or Agent preset locations on the Host desktop. The `authorization` namespace runs a provider's browser sign-in for a surface that cannot hold the flow's conversation open. When a provider is absent, the namespace remains registered and returns an actionable configuration error.

## Table of Contents

- [Use this package](#use-this-package)
- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this package as a Loader entry in a profile that serves browser configuration. The entry registers the namespaces independently of their providers so a missing provider produces a named configuration error at invocation. Its generated descriptors enter the strict Typert registry, while the settings and credential Definitions remain plain Cordis Services with no wire obligations of their own.

`describe(refs)` answers one map keyed by the requested names, so a settings page describing every reference its rows carry settles those rows together. It accepts at most 64 names per call, reports an invalid name or empty write value as `bad-request`, and copies each answer field by field — a provider returning more than `CredentialInfo` declares cannot widen what crosses. Valid `set(ref, value)` and `unset(ref)` calls report a provider refusal as `credential-rejected`, carrying the provider's message with only the reference in its details. Secret values cross in this direction only: no method here returns one.

`settings.describe()` returns deployment facts and every namespace under `redactSecrets: true`. `settings.update`, `settings.replace`, and `settings.mutate` expose the settings service's three write operations and return the namespace's new redacted view; stale writes use `settings-conflict` and other provider refusals use `settings-rejected`.

`authorization.flows()` lists the sign-in flows installed providers offer and is empty while no authorization service is mounted. `authorization.begin(key, method)` starts an attempt and returns at once, `read(key, id)` reports its latest notice (page to open, code to enter) and the question it waits on, `answer(key, id, promptId, answer)` answers that question (`null` declines), and `cancel(key)` withdraws it. One attempt runs per flow key, and disposing the controller withdraws all of them. No method returns a token: the flow stores the credential itself.

`settings.openSettingsDocument()` prepares the provider-owned document and opens it with the native text editor; it accepts no browser-supplied filesystem target.

-----

<a id="configuration"></a>
## Configuration

| Field | Default | Meaning |
|---|---|---|

The generated configuration catalog is the exhaustive source for accepted fields and their JSDoc.

-----

<a id="model-experience"></a>
## Model Experience

None, as settings and credential configuration are browser and Host state and register no prompt, tool, or session event.

#### KV Cache effect

No direct effect; reading or writing these configuration values does not alter model requests already in flight.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The batch bound is fixed at 64 references and is not a deployment-configurable field.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
