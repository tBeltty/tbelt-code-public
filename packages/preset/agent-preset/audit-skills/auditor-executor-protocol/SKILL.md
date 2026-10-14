---
name: auditor-executor-protocol
description: Runs multi-phase work as two roles. The Auditor writes numbered, verifiable tasks and signs off phases by re-running them. The Executor implements one task at a time and reports command output.
---

# Auditor / Executor Protocol

Two roles, one paper trail. The Auditor defines what "done" means and proves it independently. The Executor implements and reports evidence. Neither does the other's job. Say which role you hold at the start of a session.

## Roles

| | Auditor | Executor |
|---|---|---|
| Owns | Instructions, gates, verdicts | Implementation, evidence |
| Never | Writes feature code | Redesigns or decides scope |
| Output | Task expansions, verdicts, remediation orders | Working code, pasted command output |

## Run mode

The mode is the owner's choice. The preset states it; use it without asking again.

- **Guided (manual):** the owner launches each Executor and sees each verdict. End every message with the literal handoff the owner pastes into a fresh session.
- **Autonomous:** the Auditor launches Executors as subagents, audits each delivery, answers `BLOCKED` entries with a decision entry in the log, and expands later phases. The owner hears one short report per closed phase. Read `references/autonomous-mode.md` before task 1. Without a subagent tool, run Guided and say so.

Switching modes mid-run happens only when the owner asks, recorded by annex.

## Documents

Keep four documents separate. Merging them turns instructions back into a discussion.

1. **Plan of record:** the what and the why. Phases, decisions, trade-offs, and a deferred items ledger (`ID | What | Deferred to | Closed by`). Nobody implements from it.
2. **Execution guide:** the how. Numbered tasks (`P0-T1`) with files, steps, a literal verify command and its expected output. Gates (`P0-G1`) close each phase. Rules of engagement at the head.
3. **Compliance log:** one empty entry per task and gate ID, filled by the Executor with verbatim command output.
4. **Annexes:** a self-contained remediation order after any verdict that is not a clean `APPROVED`. Never edit an order in flight; issue an annex that names what it replaces.

Before drafting a phase, read the ledger for rows deferred to it. Each open row becomes a task or is re-deferred in the row, never dropped.

## Rules of engagement (Executor)

1. One task at a time, in order. No phase starts before its predecessor is `APPROVED`.
2. Never invent a value the codebase or environment declares. Read it.
3. Never guess a cause. Observe it: read the log, run the query, print the value.
4. Verification is running the thing. "I reviewed it and it looks correct" is `FAILED`.
5. Scope is the task text. Record unrelated problems as observations, do not fix them.
6. Stop and ask when the instruction contradicts the code or needs a decision the document does not make. If you resolve one without stopping, log the decision.
7. When the system cannot do what a task asks, report that and stop. A well-argued finding is a success.
8. Project rules (version bumps, commit rules, locale parity, CI gate) are settled once before task 1. Look at the project first, then ask yes/no questions with the finding attached. Cite the source file, do not restate it.

## Auditing

Re-run everything. Do not read the report and agree with it.

- Run each verify command and gate yourself, from the right directory.
- Re-run negative controls: remove the protection, watch the check fail, restore from a backup copy.
- Check that artifacts exist. Read the checks, not only their names, and ask what would make them pass for the wrong reason.
- Write a probe when a claim is load-bearing.
- Send the next handoff or remediation in the same message as the verdict.

| Verdict | Meaning |
|---|---|
| `APPROVED` | Every gate independently verified |
| `CONDITIONAL` | Accepted except named items, with what closes them |
| `REJECTED` | The deliverable does not do what it claims, even if green |

A passing check that documents wrong behavior as correct is a rejection. Record process findings separately from code findings. When every phase is `APPROVED` and the plan declares no further phase, say `RUN COMPLETE` on its own line.

## Executor report

```
ROLE: Executor, reporting on <TASK-ID>.
STATUS: <DONE | BLOCKED | FAILED>, logged in the compliance log.
Verify results: <one line>.
Deviations from the task text: <any, or "none">.
Stops logged: <any, or "none">.
Ready for: <audit of the phase | the next task>.
```

## References (read when you reach the step)

| File | Read when |
|---|---|
| `references/tasks-and-gates.md` | Writing a task or a gate |
| `references/handoffs.md` | Handing a task to an Executor, or writing a remediation |
| `references/autonomous-mode.md` | The run is Autonomous, or you write the Auditor brief |
| `references/failure-modes-and-example.md` | Auditing a delivery, or you want a filled-in example |
