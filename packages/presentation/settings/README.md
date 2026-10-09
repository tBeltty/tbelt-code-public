---
description: "Provider list, credential references, model entries and key checks that the GUI Models page and the terminal /providers screen share."
kind: "package-library"
---

# dsh-presentation-settings

## Summary

Gives the GUI Models page and the terminal `/providers` screen one set of rules for adding a provider. `joinProviderDirectory` merges the providers the Host can configure with the routes that are live now. `deriveKeyRef` and `providerKeyRef` name the credential reference a key is stored under, so no screen asks for an environment variable name. `setupOps` and `customProfile` build the settings edits that store a key reference and the chosen models, and `apiKeyFailure` rejects a pasted key that cannot be valid before the provider is asked. The package has no DOM, Cordis service or I/O.

## Table of Contents

- [Use this package](#use-this-package)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

A client reads `llm.listProviders` and `llm.listConfigurableProviders`, joins them with `joinProviderDirectory`, and shows one row per provider. To add a provider it asks the provider which models a typed key can use (`llm.discoverModels` with `live: true`), lets the person choose, writes `setupOps(path, storedProfile, keyRef, chosen)` through `settings.mutate`, and then stores the key with `credentials.set` under the same `keyRef`. The profile is written first so a failed key write can be retried without repeating it.

A provider the catalog does not list (a local server or an OpenAI-compatible gateway) is written at `providers.<route>` with `customProfile`. `ROUTE_PATTERN` keeps the route usable as a credential reference stem, `isHttpUrl` checks the base URL, and `cleartextRemote` tells a client to warn before a key travels over plain HTTP to another machine.

`apiKeyFailure` repeats the character rule of `normalizeApiKey` in `dsh-llm`, because presenters depend on no Host package. Keep the two in step.

-----

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The key rule is a copy** — `apiKeyFailure` does not read `normalizeApiKey`. A change to the Host rule needs the same change here.
- **No protocol list** — the wire protocols a hand-declared provider may name come from the namespace schema, which each client reads itself.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This library owns no mutable runtime relationship.
