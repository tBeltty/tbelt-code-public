# Autonomous Mode

Part of the `auditor-executor-protocol` skill. Load when the run is in Autonomous mode or you are writing the Auditor brief. Section names in
quotes ("Rules of engagement", "Auditing", ...) refer to `SKILL.md` unless they are in
this file.

## Autonomous mode (Auditor)

The Auditor runs the whole run: launches Executors, audits each delivery by re-running
it, gives verdicts, answers questions, expands later phases when the previous gate is
`APPROVED`, and writes annexes and remediations. The owner does not relay messages.

### The autonomy charter

Write it into the execution guide (a "Coordination and autonomy" section) and point to
it from a governance decision in the plan of record. It has four parts:

1. **What the Auditor decides alone.** Anything the documents leave open. `BLOCKED`
   entries are answered with a **decision entry** in the log — question, evidence (pasted
   command), decision, reason — or with an annex, and the task resumes. The Auditor may
   amend a decided item by annex when evidence justifies it.
2. **What the Auditor may never change.** The acceptance criteria and the stated scope.
   Splitting work into more phases is allowed; shrinking the goal is not. A plan that
   covers less than the owner asked for is a scope change, and only the owner makes those.
3. **The critical-risk list** — the only reasons to interrupt the owner. Write it per
   project, concretely, and number it. The categories that almost always belong:
   - reducing or reinterpreting the acceptance criteria;
   - irreversible loss of production data (a destructive step without a verified,
     restorable backup, or a failed production migration that left data inconsistent);
   - someone losing access to production, or a message sent to anyone but the owner;
   - real money (charging, refunding, cancelling a real customer; billing changes the
     tests cannot prove equivalent);
   - production down or degraded after a deploy, not restored by the pipeline's rollback;
   - a secret exposed or needing rotation (the Auditor never handles secret values);
   - actions the project's own rules reserve for the owner (typical: force-push,
     disabling CI or checks, hand-edited server config outside version control, copy
     shown to every user such as release notes);
   - a harness block the Auditor cannot resolve within its authority.

   Everything not on the list is decided, recorded and the run continues. "Should I
   continue?" is never on the list.
4. **How the owner hears about progress.** One short report per closed phase, no
   questions unless they are on the list:

   ```
   <PHASE> — <APPROVED | CONDITIONAL>. Shipped: <version/commit, or "nothing">. Decisions
   made: <decision-entry IDs, or "none">. Next: <phase/task already launched>.
   ```

   Harness permission prompts that need the owner go in **one batched request**, not one
   at a time. When every phase is `APPROVED` and the plan of record declares no further
   phase, say so as its own line — see "Closing the run" in `SKILL.md`.

### Executor model assignment

Pick the Executor's model per task, in a table in the execution guide, and name it in
each handoff. The shape that has worked here:

| Tier | Use for |
|---|---|
| Small/fast tier | Mechanical, fully specified, low blast radius: run listed commands, bump/gate/commit/push, small isolated files |
| Mid tier | Anything with judgement or risk: security, migrations, production data, transports, moving code, cross-file wiring, UI, user-facing copy |
| Top tier, usually the Auditor's own | Not used for Executors unless the owner says otherwise. If unsure, the mid tier |

- **Pass the model explicitly on every launch.** A subagent launched without an explicit
  model parameter **inherits the Auditor's model**, which silently breaks the rule.
  Require the same of any subagent the Executor spawns, in the handoff text.
- **Escalation goes one tier up, from the start.** A small-model task that hits anything
  outside its script (failing gate, unexpected diff, a `BLOCKED` condition) stops and
  logs what it saw; the Auditor relaunches the whole task on the mid tier. Never a retry
  on the top tier. A small-model Executor that "solved" the surprise itself is a process
  finding, even if the fix is right.
- Every task added when later phases are expanded gets a row in the table before it is
  launched.
- A model-rule violation is a **process finding** in the verdict, recorded separately
  from the code findings.
- **A recurring sandbox/permission block goes in the reserved-to-Auditor steps list**
  (see "The document set" in `SKILL.md`) the first time it turns out predictable, not in a
  per-task Observations note nobody reads again.

### The per-task cycle

1. Fetch and check the remote hasn't moved; read the task's log section.
2. Launch the Executor subagent with the model from the table and the full handoff
   template as the prompt, not a pointer to the guide.
3. When it returns: re-run every Verify and negative control yourself ("Auditing" in `SKILL.md`).
4. Write the verdict in the log, process findings separate from code findings.
5. Not clean: write the remediation and relaunch. Clean: launch the next task in the same
   turn. Gate `APPROVED`: send the owner the phase report and, if the next phase is not
   yet expanded, expand it (tasks, gate, model per task, log sections) before launching
   its first task.

Do not end a turn between a verdict and the next launch unless something on the
critical-risk list is open. A run that stops to report a `PASS` and wait is Guided
mode by accident.

### Starting the Auditor (the Auditor brief)

An autonomous run is started by giving a fresh Auditor session a brief, the same way an
Executor gets a handoff. The owner (or whoever planned the run) writes it once. Fill
every section; the Auditor starts cold too.

```
ROLE: Auditor of plan "<name>" in <repo>. Model: <model>. You do not write feature code.
You run the whole thing autonomously: launch Executors as subagents, audit each delivery
by re-running it, give the verdicts, resolve their questions, expand <pending phases>
once the previous gate is APPROVED, and write annexes and remediations. Follow the
auditor-executor-protocol skill to the letter.

AUTONOMY (<governance decision>, "<charter>" section of the guide):
- What you decide alone; what you can never amend (<acceptance criteria>, scope).
- Executors are your subagents; the owner does not paste handoffs.
- BLOCKED → decision entry or annex; the task continues.
- Harness permissions needing the owner: one batched request.
- Short report per closed phase, no questions except the list.
- ONLY reasons to interrupt the owner: <numbered critical-risk list>.

EXECUTOR MODEL ASSIGNMENT: <per-task table, escalation rule, model always explicit,
using the forbidden tier = process finding>.

DOCUMENTS: <plan of record, guide, log — what each contains and who writes where>.

STATE: <local/pushed commits, clean tree or not, first task and its model>.

GOAL (non-negotiable): <the owner's objective, in their own words>. Splitting into
phases, yes; shrinking it, no. RUN COMPLETE only with <final gate> APPROVED.

WHAT'S VERIFIED AND WHAT ISN'T: <facts with their evidence command / open questions some
task must measure — never mixed together>.

TRAPS TO WATCH FOR WHILE AUDITING: <the concrete shortcuts an Executor on this run would
take by reflex>.

YOUR PER-TASK CYCLE: <the 5 steps of "The per-task cycle">.

REPO RULES THAT APPLY TO EVERYONE: <citations by section, not copied in>.

FIRST STEP: <read the documents, confirm the log's state, launch <task> with <model>>.
```

`WHAT'S VERIFIED AND WHAT ISN'T` and `TRAPS` do for the Auditor what `Key finding` and
`Failure to avoid` do for the Executor: they carry the planning session's knowledge
across the cold start. A filled-in, fictional brief is in `references/failure-modes-and-example.md`; it shows
the shape, not a default to paste.
