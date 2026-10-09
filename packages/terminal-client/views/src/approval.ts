/**
 * Approval prompt: draws the shared approval model as lines and maps a key to
 * a decision.
 * @module @deepseek-ai/dsh-terminal-views/approval
 */
import type { ApprovalChoice, ApprovalModel } from '@deepseek-ai/dsh-presentation-approval'
import { copyKey, t } from './copy.ts'
import type { Style } from './ansi.ts'
import type { Key } from './keys.ts'
import { sanitizeOutput } from './tool-lines.ts'

/**
 * Draw one approval request.
 * @param style - text styles.
 * @param model - the shared approval model.
 * @returns lines without trailing newlines: the sentence, the reason, the technical detail and the keys.
 */
export function approvalPromptLines(style: Style, model: ApprovalModel): string[] {
  const lines = [style.yellow(`? ${t(copyKey(model.needKey))}`)]
  if (model.because !== null) lines.push(`  ${t('because', { reason: sanitizeOutput(model.because) })}`)
  const technical = [t('technical.tool', { toolName: sanitizeOutput(model.technical.toolName) })]
  if (model.technical.callId !== undefined) technical.push(t('technical.call', { callId: model.technical.callId }))
  lines.push(style.dim(`  ${technical.join(' · ')}`))
  lines.push(style.dim(`  ${t('approval.keys')}`))
  return lines
}

/**
 * Map a key to a decision.
 * @param key - a decoded key while an approval is pending.
 * @returns the decision, or undefined when the key answers nothing.
 */
export function approvalKeyChoice(key: Key): ApprovalChoice | undefined {
  if (key.type === 'key') {
    if (key.name === 'enter') return 'allowed-once'
    return key.name === 'escape' ? 'rejected' : undefined
  }
  if (key.type !== 'text') return undefined
  switch (key.text.toLowerCase()) {
    case 'y': return 'allowed-once'
    case 's': return 'allowed-session'
    case 'n': return 'rejected'
    default: return undefined
  }
}
