/**
 * Help text: the keys and commands of the terminal client.
 * @module @deepseek-ai/dsh-terminal-views/help
 */
import { t } from './copy.ts'
import type { Style } from './ansi.ts'

/**
 * The key and command reference.
 * @param style - text styles.
 * @returns lines without trailing newlines.
 */
export function helpLines(style: Style): string[] {
  return [
    style.bold(t('help.title')),
    t('help.send'),
    t('help.newline'),
    t('help.history'),
    t('help.edit'),
    t('help.cancel'),
    t('help.exit'),
    t('help.sessions'),
    t('help.rename'),
    t('help.model'),
    t('help.modelDefault'),
    t('help.new'),
    t('help.attach'),
    t('help.providers'),
    t('help.webSearch'),
    t('help.settings'),
    t('help.plugins'),
    t('help.agents'),
    t('help.permissions'),
    t('help.queue'),
    t('help.reference'),
    t('help.deliverables'),
    t('help.trajectory'),
    t('help.skills'),
    t('help.subagents'),
    t('help.jobs'),
    t('help.schedule'),
    t('help.goal'),
    t('help.feedback'),
    t('help.fork'),
    t('help.organize'),
    t('help.status'),
    t('help.workspaces'),
    t('help.worktrees'),
    t('help.open'),
    t('help.budget'),
    t('help.plan'),
    t('help.commandsList'),
    t('help.commands'),
  ]
}
