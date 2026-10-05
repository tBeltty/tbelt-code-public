---
description: "Fail-closed, content-based secret detection for free text destined for a memory write, for maintainers wiring the mandatory redaction pass and reviewing its pattern coverage."
kind: "package-reference"
---

# @deepseek-ai/dsh-memory-redact

## Summary

Use this package's `redactMemoryContent(text)` to decide whether free text about to be written to memory (`@deepseek-ai/dsh-memory-storage`) contains a secret. It matches realistic secret **value** shapes an agent might otherwise write to memory — API keys, GitHub/Slack tokens, JWTs, PEM private-key blocks, credentialed connection strings, bearer tokens — plus a key-name heuristic extended from `@deepseek-ai/dsh-subprocess`'s `SENSITIVE_ENV_PATTERN` for assignment-shaped text (`token: ...`, `password=...`). This package is pure logic: no Cordis wiring. A value this classifier cannot confidently confirm as a known secret shape, but that follows a sensitive key-name assignment, is still withheld — fail-closed, never passed through unredacted.

## Table of Contents

- [Use this package](#use-this-package)
- [Design notes](#design-notes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

```ts
import { redactMemoryContent } from '@deepseek-ai/dsh-memory-redact'

redactMemoryContent('AWS key is AKIAABCDEFGHIJKLMNOP')
// { text: 'AWS key is [REDACTED]', redacted: true, findings: [{ start: 11, end: 31, id: 'aws-access-key-id', confidence: 'confirmed' }] }

redactMemoryContent('the API key is stored in `.env`')
// { text: 'the API key is stored in `.env`', redacted: false, findings: [] }
```

### What you get

`redactMemoryContent(text: string): MemoryRedactionResult` — `{ text, redacted, findings }`. `findings` records only positions, pattern ids, and confidence (`'confirmed' | 'ambiguous'`), never the withheld value itself, mirroring `@deepseek-ai/dsh-settings`'s `RedactedSecret` audit-record shape. A caller that requires an all-or-nothing write (reject the whole value rather than store a partially redacted one) should check `redacted` rather than inspect `text` for the marker string.

The policy errs toward over-flagging: a false "this needs confirmation or gets withheld" costs one blocked write or a manual edit; a false negative is a leaked secret. An assignment-shaped span (`internal_note: qz7-unknown-shape`) whose value matches no known secret shape is still withheld (`confidence: 'ambiguous'`) rather than guessed safe — the mandatory fail-closed behavior this package exists to guarantee.

-----

<a id="design-notes"></a>
## Design notes

### Precedent checked, and why neither solves this

`@deepseek-ai/dsh-settings`'s `redactSecrets(schema, value)` (`packages/settings/settings/src/redact.ts:105`) is the one existing redaction mechanism in the repo, but it is schema-**structural**: it walks a live schemastery schema and strips fields the schema itself declares `meta.role === 'secret'`. It has no way to classify an arbitrary string's content, which is exactly what a memory-write value is. Its own `default` branch (`src/redact.ts:86-91`) documents an open gap — `TODO(settings-wire-redaction): Fail closed instead` — where a secret reachable only through a union, intersection, or transform is returned verbatim with nothing recording the miss. This package is built specifically so that failure mode is not repeated here: every span this classifier cannot confirm as safe is withheld, not passed through.

`@deepseek-ai/dsh-subprocess`'s `SENSITIVE_ENV_PATTERN` (`packages/subprocess/subprocess/src/index.ts:46`, `/KEY|PASSWORD|SECRET|TOKEN/i`) is the one existing name-heuristic classifier, but it matches environment variable **names** with no word boundaries — safe there because env names are whole identifiers (`API_KEY`), not prose. Reused verbatim against free text it would flag "monkey" and "turkey" on the bare "key" substring. `src/patterns.ts`'s `SENSITIVE_NAME_ASSIGNMENT` extends the same word list with letter-based lookaround boundaries (not `\b`, which treats `_` as a word character and would miss compound identifiers like `internal_token:`) and requires an assignment-shaped tail (`name\s*[:=]\s*value`), so a sentence that only mentions a security-adjacent word without attaching a value — "the API key is stored in `.env`" — never matches at all.

### No maintained dependency fits

Checked `pnpm-lock.yaml` and root `package.json`'s dependency list for a secret-pattern-matching or entropy-scoring library (`detect-secrets`, `gitleaks`, `trufflehog`, or similar) before hand-rolling, per this repo's "prefer maintained dependencies over hand-rolling" convention. None exists in the workspace dependency tree. The Phase 7 research pass that scoped this task found no coding-agent-space vendor ships this at all; a genuinely hand-rolled, table-driven pattern set (mirroring `@deepseek-ai/dsh-destructive-command-policy`'s own table-driven, no-external-classifier design) is the defensible choice here, not a shortcut around the convention.

### Why two pattern tables, not one

`src/patterns.ts` keeps `SECRET_VALUE_SHAPES` (value shape alone, no name context — an agent can paste a raw key with no surrounding label) and `SENSITIVE_NAME_ASSIGNMENT` (name context plus an attached value, whatever its shape) as separate concerns. A confirmed value-shape match is high-confidence regardless of context; a name-value assignment is lower-confidence when the value's own shape is unrecognized, but it is not therefore safe — hence `confidence: 'ambiguous'`, still withheld. Every pattern is stored as `{ source, flags }`, not a live `RegExp`, because a shared global `RegExp` instance carries `lastIndex` state across calls; a pure, repeatedly-called classifier must not carry state between invocations.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package exposes no Cordis plugin of its own; `packages/memory/memory-storage`'s write path (a later task) calls `redactMemoryContent` directly from its own write method, before any value reaches durable storage.

#### KV Cache effect

Nothing here enters a model request, so provider cache reuse is unaffected.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No Cordis wiring in this package itself** — it exports only a pure function; `packages/memory/memory-storage`'s write path is the consumer that must call `redactMemoryContent` on every value before a write, with no bypass. This package cannot enforce that call happens; it can only make the check correct once called.
- **Ordinary prose about security topics can still be withheld when it happens to use an assignment shape** — for example `Set API_KEY=your_real_key_here in .env` (an instructional note, not a real secret) matches the name-value heuristic and is withheld, because the classifier cannot distinguish a real secret from a documented placeholder in that shape. This is the deliberate over-flagging bias, not an oversight: the cost of a false positive here is a blocked write or a rephrase, not a leaked secret.
- **No entropy scoring** — a random-looking but unlabeled, unshaped string (e.g. a bare 40-character hex string with no surrounding key name and no known-vendor prefix) is not detected unless it matches one of the named value shapes or an assignment context. A general entropy classifier was deliberately not built from scratch for this first version (see "No maintained dependency fits" above); this is a real, named gap, not a claim of full coverage.
- **Detection is regex/shape-based, not a real credential validator** — a value can match `openai-style-key`'s shape (`sk-` plus 20+ alphanumeric characters) without being a live, callable API key, and a genuine secret in an unanticipated vendor shape with no sensitive key name nearby passes through undetected. Both directions (over- and under-detection on shape alone) are accepted trade-offs of a pattern-table approach; the over-detection direction is the one this package's design deliberately biases toward.

No runtime invariant companion is published because classification is a pure function over one input string, with no owned mutable relationship to diverge.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
