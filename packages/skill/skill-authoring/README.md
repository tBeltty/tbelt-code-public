---
description: "The bundled skill-authoring guide for users and maintainers who want agents to know how to add, edit, and troubleshoot skills in tBelt Code."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-authoring

## Summary

Agents can load a bundled guide, `tbelt-skill-authoring`, that explains where skills live, how to write a `SKILL.md`, how to install an existing skill, and how to check that it loaded. The guide ships inside the app and the web and desktop profiles enable it, so it needs no file in the user's skill folders. The shared base composition declares it disabled, so headless, SDK, and ACP sessions keep their catalogs unchanged.

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

The model sees `tbelt-skill-authoring` in its skill catalog and loads it when the user asks to add, write, edit, move, remove, or install a skill. Users can also run it with `/tbelt-skill-authoring`.

### Replace or hide the guide

The guide is not a file, so it cannot be deleted by accident. A skill named `tbelt-skill-authoring` in any project, custom, or user skill root replaces it, because bundled skills have the highest rank number (600). To remove it from a deployment, set `disabled: true` on the `skill-authoring` row of the web profile.

```yaml
- id: skill-authoring
  disabled: true
```

Other profiles enable it with `disabled: false` on the same row.

### Observable success and failures

Mounting the plugin makes the skill appear in the catalog and load by name. The provider is immutable, so discovery always returns exactly one skill.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The provider registers one fixed candidate at `BUNDLED_SKILL_RANK` under the provider name `dsh-skill-authoring`, exposes its packaged `assets/` directory as the resource base, and reads the guide from `assets/tbelt-skill-authoring.md` on every load. The guide's roots, ranks, and frontmatter rules mirror [`skill-filesystem`](../skill-filesystem/README.md); change them together.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry and the immutable provider: one candidate, resource base, body load |
| — | No runtime invariant companion is published; the package owns one immutable provider registration, while the skill registry owns registration uniqueness and lifecycle checks. |
| [`assets/`](assets/) | Packaged guide body (`tbelt-skill-authoring.md`) |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- Skill subsystem reference — the registry and provider contract this provider implements.
- [skill-filesystem package](../skill-filesystem/README.md) — the roots and frontmatter the guide describes.
- [tool-skill package](../tool-skill/README.md) — how the guide reaches the session catalog and the model.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-skill`, which renders the provider's catalog entry and the selected skill body to the model.

#### KV Cache effect

The catalog entry joins every session's skill catalog, so enabling or disabling the plugin changes the provider KV prefix once, at the catalog message. Loading the guide adds its body at the point of the `skill` call.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the bundled provider does not do. They are current package constraints, not a task backlog.

- **One fixed skill, English only** — the guide is not translated or customized per deployment; replace it with a same-name skill instead.
- **Install steps are generic** — the guide shows manual copy and download; it does not call any skill installer.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
