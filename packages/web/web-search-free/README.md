---
description: "The keyless search providers for ctx.web: how a fresh install searches the web with no account or API key, and how they yield to providers that have a key."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-free

## Summary

With `dsh-web-search-free`, the harness searches the web without an account or an API key. It registers `exa-free`, which asks Exa's public MCP endpoint, and `ddg-html`, which reads DuckDuckGo's HTML results page, and returns titles, URLs, and snippets. Choose it so a fresh install can search before the user configures anything. The web service uses it only when no search provider with a key is usable. Both limit anonymous use without publishing limits, so a search can fail with a rate-limit error; the second provider then answers. The model-facing `web_search` tool lives in `dsh-tool-web`.

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

Mount the plugin in a composition that already loads the web service. It registers `exa-free` and then `ddg-html`, both flagged as free. `ctx.web.search()` tries them in that order when no other search provider is usable, moving to the next after a failure other than cancellation. `searchProvider: exa-free` or `searchProvider: ddg-html` pins one alone. A usable provider with a key always wins over it, without an ambiguity error, and a failing provider with a key never falls back to it.

### When to choose it

Choose it for a default that works out of the box. Do not choose it where queries must not leave to a third party without a user decision: every search sends its query text to the configured endpoint, and nothing else from the session. Set `exa: false` or `duckduckgo: false` to drop a provider.

### Minimal configuration

Load the web service and the plugin; every field has a default.

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-free'
```

| Field | Default | Meaning |
|---|---|---|
| `exa` | `true` | Register `exa-free` |
| `exaUrl` | `https://mcp.exa.ai/mcp` | Exa MCP endpoint |
| `count` | `5` | Results requested from Exa when a search carries no `maxResults`; 1–25 |
| `duckduckgo` | `true` | Register `ddg-html`, after `exa-free` |
| `duckduckgoUrl` | `https://html.duckduckgo.com/html/` | DuckDuckGo HTML results endpoint |
| `duckduckgoUserAgent` | `Mozilla/5.0 (compatible; tBeltCode)` | `User-Agent` sent to DuckDuckGo, which answers a bare tool name with a challenge page |
| `duckduckgoMinIntervalMs` | `2000` | Shortest time between two DuckDuckGo requests |
| `snippetChars` | `400` | Longest snippet kept per source, in characters |

The generated configuration catalog is the exhaustive source for every accepted field and its JSDoc.

### What a search returns

Each Exa entry maps to a `WebSearchSource`: `url`, `title`, the page highlights as `snippet`, and the publication date as `publishedAt` when Exa has one. Each DuckDuckGo organic result maps to `url`, `title`, and `snippet`; sponsored results are skipped. Entries without a usable URL are dropped, and the result carries no `content`.

### Failures and recovery

A rate limit surfaces as `WEB_PROVIDER_QUOTA`; for DuckDuckGo that includes a challenge page (HTTP 202) or HTTP 403 and 429. A refusal of anonymous access, another HTTP, network, or answer failure surfaces as `WEB_PROVIDER_ERROR`, and an aborted request as `WEB_ABORTED`. HTTP redirects are rejected before the `Location` target is contacted. The user recovers by adding a key for a keyed provider, which then takes over.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema and provider registration |
| [`src/exa.ts`](src/exa.ts) | The `ExaFreeSearchProvider`: JSON-RPC request, event-stream parsing, entry mapping |
| [`src/ddg.ts`](src/ddg.ts) | The `DuckDuckGoSearchProvider`: request spacing, form request, results-page parsing |
| — | No runtime invariant companion is published; this package exposes no independent event sequence or mutable data relation beyond contracts enforced at its owning seam. |

### Request and mapping flow

`search()` sends one JSON-RPC `tools/call` for `web_search_exa` through `requestProviderJson` from `dsh-web`, which refuses redirects and classifies refusals. The endpoint answers with one JSON message or an event stream carrying it, and the provider reads both. The answer text lists entries that start at `Title:` and carry `URL:`, `Published:`, `Author:`, and `Highlights:` lines. `ddg-html` posts the query as a form to the results endpoint and reads the markup: result links have the class `result__a`, snippets `result__snippet`, and sponsored results `result--ad`. It claims a request slot before waiting, so concurrent searches queue behind `duckduckgoMinIntervalMs` instead of bursting. `available()` only checks that the URL parses.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- Web subsystem — the search request/result vocabulary, selection rules, and error codes.
- [Web package map](../README.md) — the ten-package family and each role.
- [dsh-web](../web/README.md) — the web service these providers register into.
- [dsh-tool-web](../tool-web/README.md) — the model-facing `web_search` tool that renders these sources.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-web`, which retains this provider's `maxResults`-bounded URLs, titles, snippets, and page dates, or its failures: `Exa (free) refused the search for quota, credit, or rate limits (HTTP <status>)…`, `Exa (free) refused anonymous access: …`, `Exa (free) search failed: <detail>`, `Exa (free) search aborted`, `DuckDuckGo refused the search for rate limits or bot checks (HTTP <status>).`, `DuckDuckGo API error (HTTP <status>)`, `DuckDuckGo search request failed: <error>`, `Exa (free) search request failed: <error>`, and `Exa (free) returned an unprocessable response body: <error>`, under the consumer's error wrapper.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Anonymous limits are not published** — Exa may lower or remove anonymous access, and a search then fails until the user adds a key.
- **DuckDuckGo has no search API** — the provider reads page markup, so a markup change returns no results until the parser follows. DuckDuckGo's terms do not grant automated use; the spacing and the fallback-only role keep the volume low.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
