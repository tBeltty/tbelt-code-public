---
description: "Define an Agent’s child plugins in ordinary Cordis YAML. Declare several presets and let sessions select one. Definitions load eagerly, and edits affect subsequently created Agents."
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-preset

## Summary

Define an Agent’s child plugins in ordinary Cordis YAML. Declare several presets and let sessions select one. Definitions load eagerly, and edits affect subsequently created Agents.

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

```yaml
- id: agent-preset-registry
  name: '@deepseek-ai/dsh-agent-preset-registry'
  config:
    default: standard
- id: preset-standard
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: standard
    plugins: []
```

| Field | Default | Meaning |
|---|---|---|
| `id` | required | Stable preset identifier |
| `plugins` | required | Child plugin entry list |
| `name` | unset | Display name |
| `description` | unset | Display description |
| `order` | unset | Roster order |

The declaration row’s `id` addresses Loader edits; `config.id` is the preset identity saved by sessions. Child entry IDs may be omitted and assigned by Loader.

The package also ships the `skills/` directory that Standard and Creator modes mount through `skill-filesystem`. It holds one skill, `dsh-doc`: a short `SKILL.md` that sets the order for finding DSH facts (runtime inspection when its tools are available, then the installed documentation and package sources) and states that loading the skill authorizes no file or profile change, plus `references/` read on demand and copyable `templates/` bundles. The references cover locating documentation, plugin development, bundle display metadata and detail documents, Web UI plugins, MCP bundles, extension practices, user actions, verification and user experience review, icon and feature-image drawing, agent presets, the Loader patch dialect, tool design, upgrades across DSH releases, and `references/packages.md`, which `scripts/gen-plugin-packages.ts` generates and `doc-sync` checks for freshness. The rendered `SKILL.md` and every reference except `packages.md`, read with line numbers, stay under the 8192-character threshold above which the standard preset's tool-result pruner trims results.

The `audit-skills/` directory holds the `auditor-executor-protocol` skill that the `audit` and `audit-autonomous` presets mount, and `presets/audit-autonomous.md` is the agent file that derives `audit-autonomous` from `audit-manual`. `audit-manual` runs Guided: the persona tells the agent to end each message with a handoff the owner pastes. Neither preset is the default; the user picks one. The run mode is the `Run mode:` sentence in each persona.

The `presets/roles/` directory holds the `inspector`, `coder` and `tester` agent files that extend `standard`; the Web profile's `subagent_inspector`, `subagent_coder` and `subagent_tester` tools select them with `agentPreset`. `inspector` denies `write`, `edit`, `bash` and `pwsh`.

Edit tool design rules in [skills/dsh-doc/references/tool-design.md](skills/dsh-doc/references/tool-design.md). The repository skill `.agents/skills/agent-experience/SKILL.md` only links to that file.

<a id="agent-definition-files"></a>
### Agent definition files

`@deepseek-ai/dsh-agent-preset/markdown` registers one preset per `*.md` file in its `dirs`. The file name without `.md` is the preset id (lowercase letters, digits and hyphens). The bundled Web profile scans `~/.dsh/presets` and extends `standard`.

```markdown
---
name: Reviewer
description: Reads changes and reports problems
extends: standard
permission:
  edit: deny
  bash:
    "*": allow
    "git push*": deny
---
You review changes. Do not edit files.
```

| Front matter | Default | Meaning |
|---|---|---|
| `extends` | plugin `extends` | Preset whose plugins the agent starts from; it must be declared before the plugin loads |
| `provider`, `model` | delegation tool's route | LLM route that children of this agent run on. Set both together; an unknown route fails the delegation that starts the child |
| `reasoning_effort` | adapter default | Reasoning effort on that route; requires `provider` and `model` |
| `skills` | every skill | Names of the skills children of this agent may see, through the skill registry; `[]` hides them all |
| `name`, `description`, `order` | unset | Roster fields |
| `permission` | none | Tool names (globs) mapped to `allow`, `ask` or `deny`, or to command patterns with those outcomes; `*` as a pattern matches every call of the tool. Later entries win |

A non-empty body replaces the prefix of the base preset’s persona row, or adds one. Each child of an agent runs one task: it accepts no follow-up messages, and its completion notice is its final answer. Unknown front matter keys, such as `tools`, make the plugin skip the file with a warning naming it. The route of an agent file is authorized by the file itself, and each agent file is offered to delegation tools as an `agent_preset` choice without configuration. A skill name that no layer provides is ignored. Permission entries become `permission-rules` rules limited to this preset. A directory that does not exist contributes no agents. The first directory is the authoring folder: the Settings editor creates, replaces and removes `<id>.md` there, and each change reloads the folder before the write returns. The plugin rescans `dirs` every `pollIntervalMs` (default 2000), so an added, edited or removed file applies at the next scan without a restart; a running child keeps the composition it started with. A file that extends another agent file is reloaded when that file changes. A file that fails keeps one warning and loads when its text or its base changes.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[markdown.ts](src/markdown.ts) parses agent files and composes their definitions. [index.ts](src/index.ts) registers a definition and returns its disposer to Cordis. The plugin’s group marker preserves child `!!js` expressions until their own plugins load. The [registry](../agent-preset-registry/README.md) owns revision retention and release.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Scope](../../core/scope/README.md) — Registration isolation.
- [Agent](../../core/agent/README.md) — Session runtime.
- Cordis — Plugin configuration and lifecycle.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the declared plugins, which own model-visible tools and prompts.

#### KV Cache effect

A live Agent’s composition stays stable; new Agents can use an updated definition.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Requires the `agentPresets` service. Duplicate preset IDs fail declaration loading. Declarations provide no directory, file-copy or file-delete operations.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
