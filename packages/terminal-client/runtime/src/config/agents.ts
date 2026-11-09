/**
 * The `/agents` screen: the agent presets, including the ones defined as
 * Markdown files, with their definition, a choice for this session and the
 * default for new sessions. The same screen creates, edits and deletes the
 * agent files of the Host's authoring folder.
 * @module @deepseek-ai/dsh-terminal-client/config/agents
 */
import { presetItems, t } from '@deepseek-ai/dsh-terminal-views'
import type { PickerItem } from '@deepseek-ai/dsh-terminal-views'
import type { RemotePort } from '../ports.ts'
import { remoteDone, remoteValue } from './ui.ts'
import type { FlowUi } from './ui.ts'

/** The settings namespace whose `selectedDefault` names the default preset. */
const AGENT_PRESET_NS = 'agent-preset-registry'

/** Identifiers the Host accepts for an agent file; the same grammar the agent-file parser checks. */
const AGENT_ID = /^[a-z0-9][a-z0-9-]*$/

/** Value of the list item that creates an agent. */
const NEW_AGENT = 'new-agent'

/** Prefix of the list items for agent files that did not load, which have no preset row. */
const FILE_ITEM = 'file:'

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
  const files = (await remoteValue(ui, message => t('agents.filesFailed', { message }), () => remote.agentPresets.listFiles()))?.files ?? []
  const loaded = new Set(roster.presets.map(preset => preset.id))
  const notLoaded: PickerItem[] = files
    .filter(file => file.error !== undefined && !loaded.has(file.id))
    .map(file => ({ value: `${FILE_ITEM}${file.id}`, label: file.id, detail: t('agents.notLoaded', { reason: file.error ?? '' }) }))
  ui.info(t('agents.hint'))
  const picked = await ui.pick(t('agents.title'), [
    ...presetItems(roster.presets),
    ...notLoaded,
    { value: NEW_AGENT, label: t('agents.new') },
  ])
  if (picked === undefined) return
  if (picked.value === NEW_AGENT) {
    await createAgentFile(remote, ui, new Set(files.map(file => file.id)))
    return
  }
  if (picked.value.startsWith(FILE_ITEM)) {
    await fileActions(remote, ui, picked.value.slice(FILE_ITEM.length))
    return
  }
  const preset = roster.presets.find(candidate => candidate.id === picked.value)
  if (preset === undefined) return
  const name = preset.name ?? preset.id
  const isFile = files.some(file => file.id === preset.id)
  const actions = await ui.pick(name, [
    ...preset.broken === undefined
      ? [
        { value: 'session', label: t('agents.action.session') },
        { value: 'default', label: t('agents.action.default') },
      ]
      : [],
    { value: 'show', label: t('agents.action.show') },
    ...isFile ? [{ value: 'edit', label: t('agents.action.edit') }, { value: 'delete', label: t('agents.action.delete') }] : [],
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
  } else if (actions?.value === 'edit') {
    await editAgentFile(remote, ui, preset.id)
  } else if (actions?.value === 'delete') {
    await deleteAgentFile(remote, ui, preset.id)
  }
}

/**
 * Choose what to do with an agent file that did not load.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where questions and messages go.
 * @param id - preset id the file registers.
 */
async function fileActions(remote: RemotePort, ui: FlowUi, id: string): Promise<void> {
  const action = await ui.pick(id, [
    { value: 'edit', label: t('agents.action.edit') },
    { value: 'delete', label: t('agents.action.delete') },
  ])
  if (action?.value === 'edit') await editAgentFile(remote, ui, id)
  else if (action?.value === 'delete') await deleteAgentFile(remote, ui, id)
}

/**
 * Ask for an identifier and a definition, then create the agent file.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where questions and messages go.
 * @param taken - identifiers of the agent files that already exist.
 */
async function createAgentFile(remote: RemotePort, ui: FlowUi, taken: ReadonlySet<string>): Promise<void> {
  const id = await ui.ask(t('agents.idLabel'), { hint: t('agents.idHint') })
  if (id === undefined) return
  if (!AGENT_ID.test(id)) {
    ui.warn(t('agents.idInvalid'))
    return
  }
  if (taken.has(id)) {
    ui.warn(t('agents.idTaken'))
    return
  }
  const text = await ui.edit(t('agents.newTitle', { id }), { hint: t('agents.editHint'), initial: t('agents.template') })
  if (text !== undefined) await writeAgentFile(remote, ui, id, text)
}

/**
 * Open an agent file's complete text for editing, then save what the person wrote.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where questions and messages go.
 * @param id - preset id the file registers.
 */
async function editAgentFile(remote: RemotePort, ui: FlowUi, id: string): Promise<void> {
  const document = await remoteValue(ui, message => t('agents.readFailed', { message }), () => remote.agentPresets.readFile(id))
  if (document === undefined) return
  const text = await ui.edit(t('agents.editTitle', { id }), { hint: t('agents.editHint'), initial: document.text })
  if (text !== undefined) await writeAgentFile(remote, ui, id, text)
}

/**
 * Save one agent file and report whether it loads.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where questions and messages go.
 * @param id - preset id the file registers.
 * @param text - the complete file text.
 */
async function writeAgentFile(remote: RemotePort, ui: FlowUi, id: string, text: string): Promise<void> {
  const saved = await remoteValue(ui, message => t('agents.saveFailed', { message }), () => remote.agentPresets.writeFile(id, text))
  if (saved === undefined) return
  if (saved.error === undefined) ui.info(t('agents.saved', { id }))
  else ui.warn(t('agents.savedNotLoaded', { reason: saved.error }))
}

/**
 * Remove an agent file after the person confirms.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where questions and messages go.
 * @param id - preset id the file registers.
 */
async function deleteAgentFile(remote: RemotePort, ui: FlowUi, id: string): Promise<void> {
  const answer = await ui.pick(t('agents.deleteTitle', { id }), [
    { value: 'yes', label: t('agents.deleteYes') },
    { value: 'no', label: t('agents.deleteNo') },
  ])
  if (answer?.value !== 'yes') return
  const removed = await remoteDone(ui, message => t('agents.deleteFailed', { message }), () => remote.agentPresets.deleteFile(id))
  if (removed) ui.info(t('agents.deleted', { id }))
}
