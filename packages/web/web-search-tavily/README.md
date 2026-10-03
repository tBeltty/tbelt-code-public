---
description: "The Tavily-backed search provider for ctx.web: how deployments mount Tavily search with extracted snippets, an optional generated answer, and a checked API key."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-tavily

## Summary

With `dsh-web-search-tavily`, the harness searches the web through Tavily and gets sources with extracted page text as snippets, plus Tavily's generated answer when requested. Choose it when a deployment has a Tavily API key. The model-facing `web_search` tool lives in `dsh-tool-web`.

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

Mount the provider in a composition that already loads the web service; it registers as the `tavily` search provider, so `ctx.web.search()` resolves it automatically when it is the only usable search backend, or when `searchProvider: tavily` pins it.

### When to choose it

Choose this backend when a deployment holds a Tavily API key and wants search results with page text extracted for the query. The provider is unavailable, and every search call fails with a structured error, while no key is configured, the endpoint base does not parse, or `maxResults` is not a positive integer.

### Minimal configuration

Load the web service and the provider. The key is read at each search from the `TAVILY_API_KEY` credential reference through the credentials service, or from the launch environment where no credentials service is mounted.

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-tavily'
```

| Field | Default | Meaning |
|---|---|---|
| `apiKey` | (unset) | Literal key; when non-empty it wins over `apiKeyEnv` |
| `apiKeyEnv` | `TAVILY_API_KEY` | Credential reference resolved at each search |
| `baseURL` | `https://api.tavily.com` | Endpoint base; `/search` is appended |
| `searchDepth` | `basic` | `basic` (one credit per search) or `advanced` (two) |
| `includeAnswer` | `false` | Request Tavily's generated answer as the result's `content` |
| `maxResults` | (unset) | Default result count when a request carries no `maxResults` |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-web-search-tavily) is the exhaustive source for every accepted field and its JSDoc.

### What a search returns

Each entry of `results[]` maps to a `WebSearchSource`: `url`, `title`, the extracted `content` as `snippet`, and `published_date` as `publishedAt`. With `includeAnswer`, Tavily's `answer` becomes the result's `content`. A request's `maxResults` is sent as `max_results`; the service enforces the final bound.

### Checking a key

`checkKey()` runs a one-result basic search without an answer, against the configured endpoint only. It resolves when Tavily accepts the key and rejects with `WEB_PROVIDER_AUTH` for a rejected key or `WEB_PROVIDER_QUOTA` for an exhausted plan (HTTP 432 or 433) or rate limit.

### Failures and recovery

A rejected key surfaces as `WEB_PROVIDER_AUTH`, a plan, credit, or rate limit as `WEB_PROVIDER_QUOTA`, and other HTTP, network, or body failures as `WEB_PROVIDER_ERROR`; an aborted request surfaces as `WEB_ABORTED`. HTTP redirects are rejected before the `Location` target is contacted.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema, credential reference, provider registration |
| [`src/provider.ts`](src/provider.ts) | The `TavilySearchProvider`: request dispatch, key check, result mapping |
| [`src/types.ts`](src/types.ts) | Tavily wire types: `TavilySearchResponse`, `TavilyResult`, `TavilySearchDepth` |
| — | No runtime invariant companion is published; this package exposes no independent event sequence or mutable data relation beyond contracts enforced at its owning seam. |

### Request and mapping flow

`search()` resolves the key through the plugin's `SearchApiKey`, then posts the query, depth, answer flag, and result count to `{baseURL}/search` with a bearer key through `requestProviderJson` from `dsh-web`, which refuses redirects and classifies refusals. `available()` reads the key state `SearchApiKey` last observed, so it never makes a network call.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Web subsystem](../../../docs/subsystems/web.md) — the exhaustive search request/result vocabulary and error codes.
- [Web package map](../README.md) — the eight-package family and each role.
- [dsh-web](../web/README.md) — the web service this provider registers into.
- [dsh-tool-web](../tool-web/README.md) — the model-facing `web_search` tool that renders this provider's sources.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-web`, which retains this provider's `maxResults`-bounded URLs, titles, snippets, dates, and the optional answer, or its failures: `Tavily has no API key configured; the user must add one`, `Tavily rejected the API key (HTTP <status>)…`, `Tavily refused the search for quota, credit, or rate limits (HTTP <status>)…`, `Tavily search aborted`, `Tavily search request failed: <error>`, and `Tavily returned an unprocessable response body: <error>`, under the consumer's error wrapper.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Topic, time-range, and domain filters are not exposed** — they wait on provider-neutral service fields.
- **A key check spends one credit** of the key's plan, because the check is a real search.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
