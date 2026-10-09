/**
 * Workflow runs: the lines the transcript prints for the events of a run and
 * its member agents.
 * @module @deepseek-ai/dsh-terminal-views/workflow-run
 */
import { t } from './copy.ts'
import type { Style } from './ansi.ts'
import { numberField, oneLine, stringField } from './lines.ts'

/** Whether a record type is one of the workflow run events. */
export function isWorkflowEvent(type: string): boolean {
  return type === 'tool-workflow/run-start' || type === 'tool-workflow/agent-start'
    || type === 'tool-workflow/agent-end' || type === 'tool-workflow/run-end'
}

/** Remembers run names and member labels so a closing event can say what it closes. */
export class WorkflowRunLines {
  readonly #names = new Map<string, string>()
  readonly #labels = new Map<string, string>()
  readonly #phases = new Map<string, string>()

  /**
   * The lines for one workflow event.
   * @param style - text styles.
   * @param type - the event type, one of the four `tool-workflow/` types.
   * @param data - the event payload, which is wire data.
   * @returns lines to print; empty when the payload has no run id.
   */
  lines(style: Style, type: string, data: unknown): string[] {
    const runId = stringField(data, 'runId')
    if (runId === undefined) return []
    if (type === 'tool-workflow/run-start') {
      const name = oneLine(stringField(data, 'name') ?? '', 60)
      this.#names.set(runId, name)
      return [style.cyan(t('workflow.start', { name }))]
    }
    if (type === 'tool-workflow/agent-start') {
      const key = `${runId}:${String(numberField(data, 'seq'))}`
      const label = oneLine(stringField(data, 'label') ?? '', 60)
      this.#labels.set(key, label)
      const phase = stringField(data, 'phase')
      const heading = phase !== undefined && this.#phases.get(runId) !== phase
      if (phase !== undefined) this.#phases.set(runId, phase)
      return [
        ...heading ? [style.dim(`  ${t('workflow.phase', { phase: oneLine(phase, 60) })}`)] : [],
        style.dim(`  ${t('workflow.agentStart', { label })}`),
      ]
    }
    if (type === 'tool-workflow/agent-end') {
      const key = `${runId}:${String(numberField(data, 'seq'))}`
      const label = this.#labels.get(key) ?? t('workflow.agentUnnamed')
      this.#labels.delete(key)
      const outcome = stringField(data, 'outcome')
      const text = t('workflow.agentEnd', { label, outcome: outcomeText(outcome) })
      return [outcome === 'failed' ? style.red(`  ${text}`) : style.dim(`  ${text}`)]
    }
    const name = this.#names.get(runId) ?? t('workflow.unnamed')
    this.#names.delete(runId)
    this.#phases.delete(runId)
    const reason = stringField(data, 'stopReason')
    const text = t('workflow.end', { name, outcome: outcomeText(reason === 'error' ? 'failed' : reason) })
    return [reason === 'error' ? style.red(text) : style.cyan(text)]
  }
}

/** The words for a member outcome or run stop reason. */
function outcomeText(outcome: string | undefined): string {
  switch (outcome) {
    case 'completed': return t('workflow.completed')
    case 'cancelled': return t('workflow.cancelled')
    case 'failed': return t('workflow.failed')
    default: return t('workflow.stopped')
  }
}
