---
description: "The web search settings page on the dsh web client's Plugins page: the search provider the agent uses and that provider's API key, checked before it is stored."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-web-search

## Summary

Open **Plugins** in the sidebar and select **Web search** in the Official group to choose the search provider the agent uses and enter its API key. The page stages what is typed and writes it only on save. Before saving, the Host checks a new key with the chosen provider alone; a rejected key is reported and nothing is stored. The key is written through the credentials domain rather than the settings document, so its literal never rides a response. The page exists while the Host serves the `web` namespace.

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

The **Web search** card in the Official group opens the page. **Search provider** lists the providers the Host serves (Exa, Perplexity, Brave, and Tavily in the shipped app) as radio buttons; choosing one stages the `web` namespace's `searchProvider` and drops a key typed for a previous choice. **API key** appears for the chosen provider, starts blank on every load, and reports only whether a key is configured; a blank draft keeps the stored key, and the control is disabled when the credential cannot be written from here, such as a key the process environment supplies.

**Save** first sends a typed key to `remote.web.checkSearchKey`. A rejected key, or a check that could not run, shows the provider's message and writes nothing; a key the provider accepts with no quota left is saved, with a note that searches fail until the quota renews. Choosing a provider that has no key, and typing none, stops the save with a prompt to add one. Leaving the page drops the drafts.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half is an empty `apply`, present only so the package holds a Loader row the client module system serves the browser half for. The browser half binds the `web` namespace through `ctx.configForms.get` and keeps the staged form in `WebSearchCardController` over the shared `SettingsFormModel` of `ui-primitives`, with `searchProvider` as a text field and the key as the form's one secret control. The provider list and each provider's credential reference come from `remote.web.searchProviders`; key states come from `remote.credentials.describe`. The controller's `save` runs `remote.web.checkSearchKey` before the form's own save, which writes `searchProvider` and then the key through `remote.credentials.set` under the chosen provider's reference. The controller re-reads key states when the Host reports `credentials/reference-updated` for a listed reference. The page registers `WebSearchCard` into the Plugins page's `plugins.item` slot through `ctx.configForms.whileServed`.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-plugin-manager](../ui-plugin-manager/README.md) — the Plugins page and the `plugins.item` slot the page registers into.
- [ui-settings](../ui-settings/README.md) — the settings scope and the served-namespace watch the page rides.
- [ui-primitives](../ui-primitives/README.md) — the settings form model and fields the page renders.
- [credentials](../../credentials/README.md) — the credential-reference seam the key writes through.
- [dsh-web](../../web/web/README.md) — the web service that owns the `web` namespace and the key-check Remote methods.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side settings surface that registers no model surface.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Provider tuning is not on the page** — each provider's endpoint, result count, and depth stay at their composed values; the page edits the provider choice and its key only.
- **No way to turn search off from the page** — clearing the choice needs a settings-file edit, and with no provider pinned the service still auto-selects the one provider whose key is configured.
- **Runtime invariant:** No companion is published. The page holds no owned relationship of its own: what it shows derives from the settings mirror and the credentials domain, and what it writes the Host validates.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
