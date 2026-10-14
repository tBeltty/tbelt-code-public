# Handoffs

Part of the `auditor-executor-protocol` skill. Load when handing a task to an Executor or writing a remediation order. Section names in
quotes ("Rules of engagement", "Auditing", ...) refer to `SKILL.md` unless they are in
this file.

## Handing off a task (Auditor)

Writing the execution guide is not the handoff. The Executor's session starts cold — it
has none of the investigation behind the guide, and "read the execution guide, task
`<ID>`" is a pointer to an instruction, not the instruction itself. Producing the actual,
paste-ready message for a fresh Executor session is Auditor work, not something left for
whoever is relaying the plan to assemble by hand.

**The rules-of-engagement block in the template below is item 8, settled when the run
started** ("Rules of engagement" in `SKILL.md`) — not re-derived here, and not re-asked per
task. If you're about to write a handoff and item 8 is still blank, that's the actual
problem: go settle it before drafting the message, don't paste a rule set from a
different project or a different run to fill the gap. A rule copied in from elsewhere
either asserts something false about this codebase or hands the Executor a stop it has
no way to satisfy.

### Handoff template

One task per message, addressed to a fresh Executor session with no shared context. Fill
every section — do not leave "see the execution guide" where a fact belongs.

```
ROLE: Executor. Work from <EXECUTION_GUIDE> (Phase <n>, `<TASK-ID>`) only; report in
<COMPLIANCE_LOG>, section `<TASK-ID>` (already exists, empty).

[Autonomous mode only:] You are the Auditor's subagent. Questions go as BLOCKED in the
log and in your final report; you do not address the owner.

REPORTED STATE: <what is already DONE in the log, and whether it was audited or only
self-reported — do not conflate the two>. Do not reopen <prior tasks>.

TASK: <TASK-ID> — <imperative title>
Source: <EXECUTION_GUIDE>, section "<TASK-ID>" in full.

Goal: <one sentence — what is true after this that was not before>.

Key finding (already verified, do not re-check it): <the concrete fact driving this
task, with the file/line/command that established it>.

Decided points, not reopenable without evidence that contradicts them:
1. <decision>
2. <decision>
...

Failure to avoid explicitly: <the specific mistake a context-free Executor would make by
reflex — copying a neighboring task's filter that doesn't apply here, re-deriving a
fact that was already established and getting it wrong, etc.>.

Verify (literal):
<exact command>

Success, minimum: <what the check(s) must prove, in terms of cases — not "it passes">.

Report: <TASK-ID>, in <COMPLIANCE_LOG>, section already created.

RULES OF ENGAGEMENT (this run's — confirmed at the start, not a default):
<the block settled above>
```

`Key finding` and `Failure to avoid` exist because a fresh Executor has no memory of the
investigation behind the task — it will make exactly the mistake full context would have
prevented. Naming the specific reflex to avoid is cheaper than an Executor discovering it
mid-task.

Do not paste a rules-of-engagement block from one project's run into another's handoff
without re-confirming it applies. It is a per-run artifact, not part of this skill.

## Remediation handoff (Auditor)

A verdict is not the deliverable — a well-evidenced `CONDITIONAL` or `REJECTED` that
ends in prose still leaves the Executor with nothing to act on. This is the
`Remediation order (annex)` from "The document set": write it, and hand it off the same
way the first task was handed off, not as a narrative the reader has to translate into
next steps themselves.

```
ROLE: Executor. Work from this remediation only; the rest of <EXECUTION_GUIDE> is
unaffected unless named below. Report in <COMPLIANCE_LOG>, appended under <GATE-ID> —
do not overwrite the original entry.

MODEL: <the original task's, or the next tier up if this is an escalation>.

AUDIT RESULT: <Phase/Task> — <CONDITIONAL | REJECTED>. <one line: what was
independently re-verified and passed, so the Executor knows what not to touch>.

BLOCKED: <GATE-ID> — <what's actually wrong, in the Auditor's own re-run terms, not a
restatement of what the original delivery claimed>.

Root cause (verified — carries the command that established it, not reasoned from the
code): <the mechanism, with file/line and the falsifying probe or command that proved
it wrong>.

Candidate fix — a recommendation, not a decided point; the Auditor has not run it:
<the shape of a fix. Mark explicitly as unverified — the Executor confirms it, and may
find a better one, per "a factual claim always is reopenable">.

Do not touch: <what already passed and must not be disturbed by this fix — the other
approved gates or tasks in this delivery>.

Verify (literal): <the exact re-run command(s), including re-running the falsifying
probe that caught this — it must now pass>.

Success, minimum: <what must be true afterward — the probe that failed now passes, the
original suite stays green, nothing named under "Do not touch" moved>.

Report: <GATE-ID>, in <COMPLIANCE_LOG>, as a remediation entry.

RULES OF ENGAGEMENT: <this run's block>
```

The "candidate fix, not a decided point" framing matters — the Auditor found the defect
by running a probe, not by running the fix. Presenting it as settled would violate the
Auditor's own rule 4 ("The Auditor is bound by rule 4 too" in `SKILL.md`).

**No verdict ends the loop by itself if anything is left to run — and "anything left to
run" is not only "a phase remains" or "a remediation order is needed."** It also covers
the most common case of all: a plain `PASS` on one task, mid-phase, with something else
already outstanding — an earlier remediation, the next task in line. That case has no
name of its own in the Verdicts table of `SKILL.md`, which is exactly why it's the easiest one
to ship without a handoff: closing with a status sentence that *describes* what's still
pending, instead of resending the pasteable block for it. Only a genuine "nothing left"
closes without a handoff. Otherwise: send the outstanding remediation, or the next
phase's first task, or the handoff already sent and not yet acted on — with the literal
template from "Remediation handoff" or "Handing off a task" above, in the same message
as the verdict, never as a sentence describing it. The Executor's next session starts
cold no matter which verdict just landed; a one-line summary of what's still owed is
exactly the kind of pointer-not-an-instruction this whole document exists to close.
