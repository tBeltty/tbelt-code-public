# Failure Modes and Worked Example

Part of the `auditor-executor-protocol` skill. Load when auditing a delivery or looking for a filled-in run. Section names in
quotes ("Rules of engagement", "Auditing", ...) refer to `SKILL.md` unless they are in
this file.

## Failure modes seen in practice

- **Self-expansion.** The Executor implements phases marked "do not start." Work
  arrives with no checkpoints between phases; a defect in an early one gets built on
  before anyone looks.
- **Zero stops.** An empty "Blocked" section across dozens of tasks means ambiguities
  were resolved silently, not that none existed.
- **Letter over intent.** The task says "add a check for case X"; a check appears, it
  passes, and the condition X exists to detect is routed around by fixture ordering or
  test isolation. Anticipate this by naming the expected failure in the task itself.
- **Evidence-free `DONE`.** Treat as `FAILED`. Say so in the reporting rules up front.
- **The Auditor shrinks the goal.** Asked for a whole outcome, the plan delivers a
  slice of it and calls the rest "follow-up," backed by a risk/ROI argument. Shrinking
  the goal is never authorized; splitting it into phases is fine, as long as the goal
  is met. Big goals get more phases, never a smaller goal — later phases are part of
  the run, not a follow-up.
- **Silent model inheritance.** A subagent launched without an explicit model runs on
  the Auditor's own model. Nothing fails; the rule is just broken on every task. Pass
  it every time.
- **Guided by habit.** In Autonomous mode, the Auditor ends a turn after a `PASS` to
  "report," or asks the owner a question the charter already lets it decide. Each one
  costs the owner a message and adds nothing.
- **A defect ships and nobody owns re-checking its blast radius.** A task changes what
  an existing field means; every other reader of that field is now a latent bug, and
  the person who finds it is usually a different, unrelated task that happens to hit
  it — not a re-audit of the original task. Grep for every reader before signing off,
  not after something breaks.
- **A change primes something to fire on its own before anyone can see or stop it.** A
  migration or config change that alters what triggers an automated write can leave
  the system armed to act — at scale, on real data — the moment its ordinary trigger
  next runs, with no one having pressed a button and no UI yet built to see or cancel
  it. Check the state the change leaves behind, not only the correctness of the new
  code path.

## Worked example

Everything below is fictional and sanitized. It shows the shape of each artifact, not
content to copy. Names, commands and risks in a real run come from that project.

**Plan:** "Notifications as a standalone service" in a web shop. Goal set by the owner:
every notification leaves the monolith. Acceptance criteria AC1-AC4. Phases P0-P5, with
P0-P2 expanded into tasks and P3-P5 fixed in scope, expanded by the Auditor at each gate.
Mode: Autonomous (governance decision D9 in the plan of record).

**Rules-of-engagement block (item 8)**, as it would appear in each handoff:

```
- One task at a time.
- Verification = run the command and the negative controls, not read the code.
- Fetch and compare against the remote branch before starting and before pushing.
- <project's quality-gate command> exits 0 before any push.
- Every commit to the main branch bumps the version with <project's version script>.
- No AI tool co-authorship on commits.
```

**Auditor brief (abridged):**

```
ROLE: Auditor of plan "Notifications as a standalone service". You do not write feature
code. You run this in Autonomous mode: launch Executors as subagents, audit each
delivery by re-running it, resolve their questions, expand P3-P5 once the previous gate
is APPROVED. Follow the auditor-executor-protocol skill.

AUTONOMY (D9; "Coordination and autonomy" section of the guide):
- You decide anything the documents leave open; amend decisions by annex with evidence.
  You never amend AC1-AC4 or reduce scope.
- BLOCKED → decision entry in the log; the task continues.
- Permissions needing the owner: one batched request. Short report per closed phase.
- ONLY reasons to interrupt the owner:
  1. Reducing or reinterpreting AC1-AC4.
  2. Deleting production data without a verified, restorable backup.
  3. A real email or SMS sent to a customer.
  4. Charges, refunds, or billing changes not proven equivalent.
  5. Production down after a deploy with no successful rollback.
  6. An exposed secret.
  7. Force-push or disabling CI.

EXECUTOR MODEL ASSIGNMENT: small/fast tier for P0-T1, P1-T3, P2-T4 (listed commands,
bump, gate, push). Mid tier for the rest. Top tier never. Model explicit on every
launch; if a small-tier task goes off-script, relaunch the whole task on the mid tier.

STATE: clean tree, plan committed and pushed. First task: P0-T1 on the small/fast tier.

GOAL (non-negotiable): no notification leaves the monolith. RUN COMPLETE only with
P5-G1 APPROVED, which proves AC1-AC4.

WHAT'S VERIFIED AND WHAT ISN'T:
- Verified (command in the plan): all 14 send sites in the inventory.
- Not verified: whether the SMS provider accepts idempotency keys (P2-T2 measures it).

TRAPS: "doesn't send" checks that pass because the mock was never registered; negative
controls restored with a command that wipes other uncommitted work; a small-tier task
that patches an unexpected surprise itself instead of escalating.

FIRST STEP: read the three documents, confirm the log is empty, launch P0-T1 on the
small/fast tier.
```
