/**
 * The `/agents` screen: the agent presets, including the ones defined as
 * Markdown files, with their definition, a choice for this session and the
 * default for new sessions.
 * @module @deepseek-ai/dsh-terminal-client/config/agents
 */
import { presetItems, t } from '@deepseek-ai/dsh-terminal-views'
import type { RemotePort } from '../ports.ts'
import { remoteDone, remoteValue } from './ui.ts'
import type { FlowUi } from './ui.ts'

/** The settings namespace whose `selectedDefault` names the default preset. */
const AGENT_PRESET_NS = 'agent-preset-registry'

/**
 * Run the `/agents` screen once.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where questions and messages go.
 * @param sessionId - the session a choice applies to.
 * @returns settles when the person finished or left the screen.
 */
export async function runAgents(remote: RemotePort, ui: FlowUi, sessionId: string): Promise<void> {
  const roster = await remoteValue(ui, message => t('picker.loadFailed', { message }), () => remote.agentPresets.list())
  if (roster === undefined) return
  if (roster.presets.length === 0) {
    ui.info(t('agents.none'))
    return
  }
  ui.info(t('agents.hint'))
  const picked = await ui.pick(t('agents.title'), presetItems(roster.presets))
  const preset = roster.presets.find(candidate => candidate.id === picked?.value)
  if (preset === undefined) return
  const name = preset.name ?? preset.id
  const actions = await ui.pick(name, [
    ...preset.broken === undefined
      ? [
        { value: 'session', label: t('agents.action.session') },
        { value: 'default', label: t('agents.action.default') },
      ]
      : [],
    { value: 'show', label: t('agents.action.show') },
  ])
  if (actions?.value === 'show') {
    const document = await remoteValue(ui, message => t('agents.readFailed', { message }), () => remote.agentPresets.read(preset.id))
    if (document !== undefined) ui.info(document.content.trimEnd())
  } else if (actions?.value === 'session') {
    const selected = await remote.agentPresets.select(sessionId, preset.id).catch((error: unknown) => ({
      ok: false as const, error: { code: 'terminal/call-failed', message: error instanceof Error ? error.message : String(error) },
    }))
    if (selected.ok) ui.info(t('agents.selected', { name }))
    else ui.warn(selected.error.code === 'agent-preset/locked' ? t('agents.locked') : t('agents.selectFailed', { message: selected.error.message }))
  } else if (actions?.value === 'default') {
    const written = await remoteDone(ui, message => t('settings.writeFailed', { message }), () => remote.settings.update(AGENT_PRESET_NS, { selectedDefault: preset.id }, undefined))
    if (written) ui.info(t('agents.defaultSet', { name }))
  }
}
