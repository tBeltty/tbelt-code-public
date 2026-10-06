---
description: "The Brave Search-backed search provider for ctx.web: how deployments mount Brave web search with plain-text snippets, page dates, and a checked API key."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-brave

## Summary

With `dsh-web-search-brave`, the harness searches the web through the Brave Search web API and gets ranked results with plain-text snippets and page dates. Choose it when a deployment has a Brave Search API key. Brave's web endpoint returns no generated answer, so results carry no `content`, only citeable sources. The model-facing `web_search` tool lives in `dsh-tool-web`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the provider in a composition that already loads the web service; it registers as the `brave` search provider, so `ctx.web.search()` resolves it automatically when it is the only usable search backend, or when `searchProvider: brave` pins it.

### When to choose it

Choose this backend when a deployment holds a Brave Search API key and wants independent-index web results. The provider is unavailable, and every search call fails with a structured error, while no key is configured, the endpoint base does not parse, or `count` is outside 1–20.

### Minimal configuration

Load the web service and the provider. The key is read at each search from the `BRAVE_API_KEY` credential reference through the credentials service, or from the launch environment where no credentials service is mounted.

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-brave'
```

| Field | Default | Meaning |
|---|---|---|
| `apiKey` | (unset) | Literal key; when non-empty it wins over `apiKeyEnv` |
| `apiKeyEnv` | `BRAVE_API_KEY` | Credential reference resolved at each search |
| `baseURL` | `https://api.search.brave.com` | Endpoint base; `/res/v1/web/search` is appended |
| `count` | (unset) | Default result count when a request carries no `maxResults`; 1–20 |

The generated configuration catalog is the exhaustive source for every accepted field and its JSDoc.

### What a search returns

Each entry of `web.results[]` maps to a `WebSearchSource`: `url`, `title`, `description` with its `<strong>` markup removed as `snippet`, and `page_age` as `publishedAt`. A request's `maxResults` is sent as `count`, capped at Brave's limit of 20; the service enforces the final bound.

### Checking a key

`checkKey()` runs a one-result search with the candidate key against the configured endpoint only. It resolves when Brave accepts the key and rejects with `WEB_PROVIDER_AUTH` for a rejected key or `WEB_PROVIDER_QUOTA` for a plan or rate limit, so a settings surface can refuse a bad key before storing it.

### Failures and recovery

A rejected key surfaces as `WEB_PROVIDER_AUTH`, a quota, plan, or rate limit as `WEB_PROVIDER_QUOTA`, and other HTTP, network, or body failures as `WEB_PROVIDER_ERROR`; an aborted request surfaces as `WEB_ABORTED`. HTTP redirects are rejected before the `Location` target is contacted.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema, credential reference, provider registration |
| [`src/provider.ts`](src/provider.ts) | The `BraveSearchProvider`: request dispatch, key check, result mapping |
| [`src/types.ts`](src/types.ts) | Brave wire types: `BraveSearchResponse`, `BraveWebResult` |
| — | No runtime invariant companion is published; this package exposes no independent event sequence or mutable data relation beyond contracts enforced at its owning seam. |

### Request and mapping flow

`search()` resolves the key through the plugin's `SearchApiKey`, then sends `GET {baseURL}/res/v1/web/search?q=…&count=…` with the key in `X-Subscription-Token` through `requestProviderJson` from `dsh-web`, which refuses redirects and classifies refusals. `available()` reads the key state `SearchApiKey` last observed, so it never makes a network call.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- Web subsystem — the exhaustive search request/result vocabulary and error codes.
- [Web package map](../README.md) — the eight-package family and each role.
- [dsh-web](../web/README.md) — the web service this provider registers into.
- [dsh-tool-web](../tool-web/README.md) — the model-facing `web_search` tool that renders this provider's sources.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-web`, which retains this provider's `maxResults`-bounded URLs, titles, snippets, and page dates, or its failures: `Brave Search has no API key configured; the user must add one`, `Brave Search rejected the API key (HTTP <status>)…`, `Brave Search refused the search for quota, credit, or rate limits (HTTP <status>)…`, `Brave Search search aborted`, `Brave Search search request failed: <error>`, and `Brave Search returned an unprocessable response body: <error>`, under the consumer's error wrapper.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Only `count` is exposed** — Brave's country, language, freshness, and safe-search controls wait on provider-neutral service fields.
- **A key check spends one query** of the key's plan, because Brave offers no free key-validation endpoint.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
