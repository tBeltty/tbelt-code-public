---
description: "Pure classifier deciding whether a shell command string is destructive enough to require explicit user confirmation, for maintainers wiring the guard and reviewing its pattern coverage."
kind: "package-reference"
---

# @deepseek-ai/dsh-destructive-command-policy

English

## Summary

Use this package's `isDestructiveCommand(command)` to decide whether a shell command string is destructive enough to pause for explicit user confirmation. It matches realistic command shapes an LLM would emit — `rm -rf` variants, `git push --force`, `git reset --hard`, disk-format commands, `dd` writing to a block device, and recursive `chmod`/`chown` on `/` — using a real POSIX-shell parse (`@yarnpkg/parsers`) for chain-splitting and quoting. This package is pure logic: no Cordis wiring. `packages/guard/permission-rules` wires it into enforcement, calling it for any shell call no explicit rule matches, resolving to `ask` — never `deny`, matching this package's over-flagging stance.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

```ts
import { isDestructiveCommand } from '@deepseek-ai/dsh-destructive-command-policy'

const result = isDestructiveCommand('rm -rf /tmp/build')
// { destructive: true, reason: 'rm -rf (recursive + force removal) targeting /tmp/build' }

const safe = isDestructiveCommand('git push origin main')
// { destructive: false }
```

### When to choose it

Choose it when a consumer (a `tools/pre-execute` guard, a linter, a pre-flight check) needs a synchronous, dependency-free answer to "does this command string look destructive." Avoid it when the caller needs a complete shell parser — this package deliberately matches common shapes, not arbitrary shell syntax (see [Known Limitations](#known-limitations-and-deferred-work)).

### What you get

`isDestructiveCommand(command: string): { destructive: boolean; reason?: string }`. `reason` is present only when `destructive` is `true` and names the matched pattern class and the offending target, suitable for surfacing directly in a confirmation prompt. A command is parsed as a real POSIX-shell line and split on every real chain operator (`;`, `&`, `&&`, `||`, `|`, `|&`), including inside subshells and groups, with each resulting command classified independently — so a destructive command chained after a benign one, including behind a pipe, is still caught. The policy errs toward over-flagging: a false "needs confirmation" costs one prompt, while a false negative is the actual safety failure — for example, `rm -rf ./build` still flags even though the target is nested inside a project directory, and a command name or target argument that depends on an unresolved shell variable or command substitution flags too, since the classifier runs before the command and cannot know what it resolves to.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design philosophy

- **Table-driven patterns over a real shell parse, not a shell parser reimplementation.** `src/classify.ts` holds an ordered array of `{ id, test }` pattern entries; each `test` receives one command invocation's argv tokens (already chain-split and quoting-resolved by `src/tokenize.ts`) and returns a reason string or `undefined`. Adding a pattern class is one appended array entry.
- **AST-driven tokenization.** `src/tokenize.ts` parses the command string with `@yarnpkg/parsers`' `parseShell` and walks the resulting grammar (`ShellLine` → `CommandLine` → `CommandChain` → `Command`) to enumerate every command invocation reachable through `;`, `&`, `&&`, `||`, `|`, `|&`, subshells, and groups. Each argument's parsed segments are rendered into one token, so shell-quoting (`"some dir with spaces"`) tokenizes correctly instead of splitting on internal whitespace.
- **Conservative on variable expansion and command substitution.** Neither this classifier nor its patterns resolve `$NAME`, `${NAME}`, `$(...)`, or `` `...` `` — doing so would mean actually running the substituted command before deciding whether the outer command is safe to run, which defeats the purpose of a pre-execution guard. Instead: a command name built from an expansion is always flagged (it cannot be classified at all), and a target argument in a pattern that already inspects targets (`rm -rf`'s path, `dd`'s `of=`) is flagged the same as a bare path when it contains one. This is a deliberate stance, not an oversight — see [Known Limitations](#known-limitations-and-deferred-work).
- **Order-agnostic flag matching.** `hasFlag` checks both long options (`--recursive`) and single-dash bundles in any letter order (`-rf`, `-fr`, `-Rf`), so `rm -r -f`, `rm -f -r`, and `rm -rf` all classify identically.

### Source map

| File | Role |
|---|---|
| [`src/tokenize.ts`](src/tokenize.ts) | Parses a command string into per-invocation argv tokens via `@yarnpkg/parsers`, resolving chain-splitting and shell-quoting |
| [`src/classify.ts`](src/classify.ts) | The pattern table and `isDestructiveCommand` |
| [`src/index.ts`](src/index.ts) | Package entry point; re-exports `classify.ts` only (no Cordis wiring yet) |

</details>

-----

<a id="model-experience"></a>
## Model Experience

None, as this package exposes no Cordis plugin of its own; `packages/guard/permission-rules` registers the prompt-visible tool result its classification produces.

#### KV Cache effect

Nothing here enters a model request, so provider cache reuse is unaffected.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No Cordis wiring in this package itself** — it exports only a pure function; it does not register a `tools/pre-execute` listener and does not call `ctx.approval` directly. `packages/guard/permission-rules` is the consumer that wires `isDestructiveCommand` into real enforcement from its own listener.
- **Obfuscated or encoded commands are not detected** — a command that reaches the shell through base64 decoding, `eval`, or similar indirection (e.g. `bash -c "$(echo cm0gLXJmIC8= | base64 -d)"`) is not classified: the classifier parses and inspects the literal shell syntax it is given, and does not decode, evaluate, or otherwise interpret string payloads a command constructs at runtime. This stays out of scope for v1; closing it would mean the classifier itself decoding/simulating arbitrary program output, which is a materially different (and much larger) capability than shell-syntax classification.
- **Shell-quoting and chain-splitting are shell-aware, not textual** — closed by this package's move to `@yarnpkg/parsers`' real POSIX-shell grammar (`src/tokenize.ts`). Quoted arguments tokenize as one field regardless of internal whitespace, and chain-splitting covers every real operator (`;`, `&`, `&&`, `||`, `|`, `|&`) plus subshells and groups, including a pipe on its own — previously a confirmed bug (`echo ok | rm -rf /` went unsplit and unflagged).
- **Variable expansion and command substitution are not resolved, by deliberate design, not by gap** — `rm -rf "$TARGET"`, `dd of=$(cat target)`, and a command name built from `$(...)` all flag as destructive rather than being silently ignored or actually resolved. Resolving them would require running the substituted command (or knowing its output) before deciding whether the outer command is safe, which is a materially different capability than pre-execution classification and would itself execute code before the confirmation gate does its job. The classifier instead treats any command name or already-target-checking pattern's target argument that depends on an unresolved expansion as destructive — a false "needs confirmation" here is preferable to letting a runtime-computed destructive target through unflagged, matching this package's existing over-flagging bias. Expansions elsewhere in a command (an unrelated argument to a non-destructive-pattern command, e.g. `git commit -m "$MESSAGE"`) are not flagged, to avoid drowning every ordinary variable use in confirmation prompts.
- **`git push --force` letter-bundle heuristic is approximate** — `matchGitPushForce` treats any single-dash bundle containing the letter `f` (e.g. a hypothetical `-vf`) as a force flag; real `git push` has no other single-dash flag containing `f`, so this is not currently a false-positive risk, but a future git flag reusing that letter would need this heuristic revisited.
- **A command string that fails to parse as POSIX shell syntax is treated as destructive** — rather than silently passing it through unclassified, `isDestructiveCommand` returns `destructive: true` with a parse-error reason. This is a new behavior this task's AST-based rewrite introduces (the previous whitespace/regex tokenizer could never fail to "parse"), consistent with the package's stated over-flagging bias.

No runtime invariant companion is published because classification is a pure function over one command string, with no owned mutable relationship to diverge.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
