---
description: "Shared upward marker-directory search that locates a project root from a working directory for tBelt Code."
kind: "package-library"
---

# @deepseek-ai/dsh-project-root

## Summary

`@deepseek-ai/dsh-project-root` gives package authors one shared implementation of "walk upward from a working directory until a marker directory is found." It exists so a new project-tier consumer does not add a third private copy of the walk that `packages/context/agent-instructions` and `packages/skill/skill-filesystem` each already carry privately. Use it as a direct library dependency, not through `cordis.yml`.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

```ts
import { findProjectRoot, DEFAULT_PROJECT_ROOT_MARKERS } from '@deepseek-ai/dsh-project-root'

declare const cwd: string

const root = await findProjectRoot(cwd, DEFAULT_PROJECT_ROOT_MARKERS)
```

`findProjectRoot(cwd, markers, fileSystem?, signal?)` walks upward from `cwd`, returning the first ancestor (inclusive) containing any of `markers` as a direct child. When no ancestor matches, it returns `cwd` unchanged — there is no unresolved-root error case. `fileSystem` is an optional `@deepseek-ai/dsh-fs` provider; omitting it probes the host filesystem directly with Node's `fs/promises`. A provider `FS_NOT_FOUND` error and a host `ENOENT`/`ENOTDIR` error both mean "marker absent, keep walking upward"; any other error propagates. `DEFAULT_PROJECT_ROOT_MARKERS` is `['.git']`, the convention every current caller of the two private copies uses.

-----

<a id="model-experience"></a>
## Model Experience

### Project-root resolution

#### What the model sees

Nothing. The package computes a host-side directory path (`findProjectRoot`); it registers no tool, prompt, or session event, so no request field ever carries this package's return value directly.

#### Token effect

Zero direct tokens on every request.

#### KV Cache effect

Independent of live requests: the package never touches a request prefix, so it cannot invalidate provider cache reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Not yet adopted by its two predecessor copies** — `packages/context/agent-instructions/src/files.ts` and `packages/skill/skill-filesystem/src/index.ts` each keep their own private, functionally equivalent walk. This package stops a third copy from appearing, but migrating the two existing ones is a separate, unstarted change.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The package is a pure, stateless function library with no owned runtime relation to check between independent observations.
