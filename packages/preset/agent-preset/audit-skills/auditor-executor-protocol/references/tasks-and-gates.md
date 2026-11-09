# Writing Tasks and Gates

Part of the `auditor-executor-protocol` skill. Load when writing a task or a gate. Section names in
quotes ("Rules of engagement", "Auditing", ...) refer to `SKILL.md` unless they are in
this file.

## Writing a task (Auditor)

```
### <TASK-ID> — <imperative, one line>

**Goal:** one sentence. What is true after this that was not before.
**Files:** every path the Executor should read or change.
**Blast radius:** every caller or reader of anything a step renames, empties, deletes, or
  redefines — including a later task's planned work. Empty if genuinely none; never left
  blank.
**Steps:** numbered. Exact enough that two Executors produce the same thing.
**Verify:** the literal command, and the output that counts as success.
**Report:** the task ID.
```

Rules for the steps:

- Encode decisions, do not re-open them. "Polling, not a push channel — this is
  decided, believing otherwise is a stop, not a choice to make while implementing."
- **Name the failure you expect.** If a field might get overwritten, if a type behaves
  differently across two environments, if a cap is a layout decision and not a data
  one — say so in the task. Most bad output comes from an ambiguity the task's author
  already saw and didn't write down.
- State what must *not* change alongside what must.
- **The Blast radius field is not optional decoration — write it before the step, not
  after something breaks.** When a task renames or redefines what an existing field or
  column means, the task text must include the command to find every other reader of
  it, and the Executor must run it and account for every hit, not only the call sites
  the task's file list happened to name. When a step would empty, delete, or replace
  shared code, check whether a *later* task in the same phase was planned to still call
  it — if so, the step is "leave a delegating stub," not "empty it," until the task that
  owns that caller lands. A task's file list is a lower bound on its blast radius,
  discovered by the person who wrote the task before the work started — not the whole
  of it, discovered later by whoever happens to hit the stale or broken reader next.
- **When a task changes what triggers an automatic action** (a scheduler, a background
  job, a materializer, anything that can fire without a human pressing a button), the
  task must require checking — before shipping — what state the change leaves the
  system in and whether anything is now primed to fire destructively on its next
  ordinary trigger. Passing tests prove the new code path is correct; they do not
  prove nothing is about to run against real data the moment it gets the chance.

## Writing a gate (Auditor)

A gate is a claim that can be proven false. "Tests pass" is not a gate. "The
visibility check was observed failing with the filter removed" is.

Every gate names how it is proven. Include, whenever the phase produces a security,
privacy, or financial-integrity boundary, a **negative control**: the Executor must
remove the protection, observe the check fail, restore it, and observe it pass. A
check never seen failing has not been verified. It must also fail for the right
reason: a syntax error or a missing import fails just as loudly, so the control names
the failure it expects (the assertion, the status code) and the Auditor checks the
output shows it. Paste the failing output into the log.

**A gate defined by more than one command must be re-run in full, not cited from
whichever half was last checked.** A compound gate closed in one phase by running only
one of its checks, then cited as "already satisfied" in later phase gates without ever
re-running the rest, can let real violations accumulate for phases before anyone
notices. If a gate's own definition lists multiple checks, every phase that claims it as
satisfied re-runs all of them — a partial citation from an earlier phase does not close
a compound gate.

**A shared test fixture that always uses a simplified shape hides bugs that only appear
with a realistic one.** A helper that builds request URLs, headers, or IDs for tests
should default to a realistic shape (a base URL with its own path prefix, a populated
auth header, a non-empty ID) rather than the minimal shape that's easiest to write —
otherwise every test built on it passes for the wrong reason. When gating a feature that
touches an external contract, prove it against at least one realistically-shaped
fixture, not only the simplified one most unit tests use.

**When a decision restricts what one channel may carry, check every other channel
available for the same call.** A rule like "this value travels only via the field
scoped for it, never the generic payload" is not proven by testing the transport where
that rule was enforced — check whether the same data can leak through a sibling channel
on a transport the restriction was never applied to, especially one that leaves your own
infrastructure for a third party. A restriction proven on one channel or transport is
not proven on all of them.
