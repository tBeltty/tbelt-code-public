---
description: "Named tool groups that stay out of the model request until the model enables them, for deployments and maintainers composing a lightweight agent preset."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-groups

## Summary

`dsh-tool-groups` keeps named groups of tools out of the model request until the model asks for them. A deployment lists groups, each with a one-line description and the names of registered tools. Every agent starts with those tools hidden and one small `enable_tools` tool. Calling it with a group name makes that group's tools available from the next step, and the group stays on for the rest of the session, including after resume or fork. Use it to cut the fixed token cost of a preset with many tools while keeping every tool reachable.

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

Mount the plugin in an agent preset after the rows that register the tools it hides.

### When to choose it

Choose it when a preset mounts many tools and most tasks use few of them. Skip it for a preset that needs every tool on the first request, and for tools that a running mode must always offer, such as `exit_plan_mode` while plan mode is active.

### Minimal configuration

```yaml
- id: tool-groups
  name: '@deepseek-ai/dsh-tool-groups'
  config:
    groups:
      - name: web
        description: Search the web and fetch pages.
        tools: [web_search, web_fetch]
```

| Field | Default | Meaning |
|---|---|---|
| `groups` | required | Groups in the order the system prompt lists them |
| `groups[].name` | required | Group name the model passes to `enable_tools`; unique |
| `groups[].description` | required | One line on when the group is worth enabling |
| `groups[].tools` | required | Registered tool names the group hides; a tool belongs to one group |

The generated configuration catalog is the exhaustive source for the accepted fields. A blank or repeated group name, an empty tool list, a tool in two groups, or a group that names `enable_tools` fails at load.

### What the model gets

- A system-prompt section that lists each group that has at least one registered tool.
- The `enable_tools` tool, whose `group` parameter is an enum of the configured group names.
- Hidden tools reject calls as unknown until their group is enabled.

A group whose tools are all absent from the agent is left out of the list, and enabling it fails with `group "<name>" has no tools in this mode`.

### Resume and fork

A group is on at agent creation when any of its tools appears in the last logged request header. A new session starts with every group off. Groups enabled earlier in a session therefore stay on after resume and fork without a dedicated session event.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

On `agent/created`, the plugin resolves each group against the agent's tool view and calls `tools.restrict({ deny })` on the agent context for groups that start off. It keeps each restriction's disposer. `enable_tools` calls that disposer, so the next assembly includes the tools and the agent loop logs the change as a `tool-addition` developer message.

`tools.restrict()` masks tools the agent inherits, not tools registered in the agent's own scope. A plugin that registers a tool per agent, such as `dsh-tool-subagent` with `modelSelectionSettings`, escapes the mask.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `Config` schema, group validation, per-agent masks, prompt section, `enable_tools` |

### Export shape

The plugin is a function plugin: it exports `name`, `inject`, `Config`, and `apply`, and no default export.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Tools](../../core/tools/README.md) — `restrict()` and per-scope visibility.
- Generated tool catalog — the `enable_tools` schema the model receives.
- [Preset group](../README.md) — sibling packages that compose agent capabilities.

-----

<a id="model-experience"></a>
## Model Experience

### Group list section

#### What the model sees

One system-prompt section, present when at least one group has a registered tool, listing the groups.

##### Verbatim text for this field

```markdown
More tools are off until you call enable_tools with a group name. A group stays on for the rest of the session.
- <name>: <description>
```

#### Token effect

A fixed cost of one line per group plus the introduction. The section does not shrink when a group is enabled.

#### KV Cache effect

Prefix-stable. The text depends only on configuration and tool registration, not on which groups are enabled.

### `enable_tools` schema and result

#### What the model sees

The generated `enable_tools` schema: one required `group` parameter restricted to the configured names. Success returns `Enabled <group>: <tools>. Use them from your next step.` or `<group> is already enabled: <tools>.` A group with no tools in the agent returns `group "<name>" has no tools in this mode`.

#### Token effect

A fixed schema cost on every request. Each enabled group adds its tool schemas from the step after the call.

#### KV Cache effect

Append-only on routes that support tool updates: an enabled tool is added after the cached prefix through a logged `tool-addition`. On other routes, the first request after an enable replaces the tool list and starts a new request series.

## Known Limitations and Deferred Work

- **Tools in an agent's own scope are not hidden** — `tools.restrict()` masks inherited tools only, so a tool registered per agent stays visible. The `fast` preset runs subagent tools without `modelSelectionSettings` for this reason.
- **Hiding applies at agent creation** — a tool registered after creation is visible until the agent is recreated.
- **Resume reads the last request header** — a group enabled in the final step, before its request header was logged, is off after resume.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
