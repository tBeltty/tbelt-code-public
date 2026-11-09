/** Preset roster, the new-task default and the read-only composition viewer for the settings section. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { AgentFileEntry, AgentPresetRow } from '@deepseek-ai/dsh-agent-preset-registry/types'
import { AGENT_PRESET_SETTINGS_NS, requiresCodingTools, writeDefaultPreset } from './settings-store.ts'

/** The read-only composition viewer over one preset. */
export interface PresetView {
  /** The preset being read. */
  id: string
  /** Display name the preset published, or its id. */
  title: string
  /** The declared child plugin list as YAML. */
  content: string
}
/** The agent file editor: a new file, or one already in the authoring folder. */
export interface AgentFileEditor {
  /** Whether the file is new; only a new file's identifier can change. */
  creating: boolean
  /** Preset id the file registers, which is also its file name without `.md`. */
  id: string
  /** Complete file text, front matter included. */
  text: string
  /** Why the last save or removal was refused. */
  error: string | null
  /** Why a saved file did not load; the file is kept and the editor stays open. */
  notLoaded: string | null
  saving: boolean
  /** Whether the next removal click removes the file. */
  confirmingDelete: boolean
}
/** Settings page state. */
export interface AgentPresetSectionState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  saving: boolean
  rows: readonly AgentPresetRow[]
  /** The open viewer, or null. */
  view: PresetView | null
  /** Agent files of the authoring folder, with the reason each one did not load. */
  files: readonly AgentFileEntry[]
  /** The open agent file editor, or null. */
  editor: AgentFileEditor | null
}
const INITIAL: AgentPresetSectionState = { status: 'idle', error: null, saving: false, rows: [], view: null, files: [], editor: null }
/** Identifiers the Host accepts for an agent file; the same grammar the agent-file parser checks. */
const AGENT_ID = /^[a-z0-9][a-z0-9-]*$/
const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Loads the roster, writes the default, and reads one composition at a time. */
export class AgentPresetSectionController {
  /** Observable roster, selection and viewer state. */
  readonly store: SnapshotStore<AgentPresetSectionState> = createSnapshotStore(INITIAL)
  private loading: Promise<void> | undefined
  private pendingSave: Promise<void> | undefined
  private viewRequest = 0
  constructor(private readonly ctx: Context) {}

  private set(patch: Partial<AgentPresetSectionState>): void { this.store.set({ ...this.store.getSnapshot(), ...patch }) }

  /** Refresh the roster; concurrent calls share one read.
   * @returns Once the roster read settles.
   */
  load(): Promise<void> {
    return this.loading ??= Promise.all([this.readRoster(), this.readFiles()])
      .then(() => undefined)
      .finally(() => { this.loading = undefined })
  }
  private async readRoster(): Promise<void> {
    try {
      const result = await this.ctx.remote.agentPresets.list()
      if (!result.ok) throw new Error(result.error.message)
      this.set({ status: 'ready', error: null, rows: result.value.presets })
    } catch (error) { this.set({ status: 'error', error: message(error) }) }
  }
  private async readFiles(): Promise<void> {
    try {
      const result = await this.ctx.remote.agentPresets.listFiles()
      if (!result.ok) throw new Error(result.error.message)
      this.set({ files: result.value.files })
    } catch (error) { this.set({ error: message(error) }) }
  }

  /** Open one preset's declared composition in the viewer.
   * @param id Preset to read.
   * @returns Once the read settles; a current failure lands in `error`, while a read superseded by close or another read is ignored.
   */
  async view(id: string): Promise<void> {
    const request = ++this.viewRequest
    this.set({ error: null, view: null })
    try {
      const result = await this.ctx.remote.agentPresets.read(id)
      if (request !== this.viewRequest) return
      if (!result.ok) throw new Error(result.error.message)
      const { name, content } = result.value
      this.set({ view: { id, title: name ?? id, content } })
    } catch (error) { if (request === this.viewRequest) this.set({ error: message(error) }) }
  }
  /** Close the viewer. */
  closeView(): void { this.viewRequest++; this.set({ view: null }) }

  /** Open the editor on a new agent, starting from the localized template. */
  newAgent(): void {
    const template = this.ctx.locale.bind('settings.agentPreset')('agentTemplate')
    this.set({ editor: { creating: true, id: '', text: template, error: null, notLoaded: null, saving: false, confirmingDelete: false } })
  }

  /** Open the editor on an agent file of the authoring folder.
   * @param id Preset id the file registers.
   * @returns Once the read settles; a failed read lands in `error`.
   */
  async editAgent(id: string): Promise<void> {
    try {
      const result = await this.ctx.remote.agentPresets.readFile(id)
      if (!result.ok) throw new Error(result.error.message)
      this.set({
        editor: { creating: false, id, text: result.value.text, error: null, notLoaded: null, saving: false, confirmingDelete: false },
      })
    } catch (error) { this.set({ error: message(error) }) }
  }

  /** Replace fields of the open editor; a change clears the previous refusal and the removal confirmation.
   * @param patch Fields to replace. The identifier changes only for a new file.
   */
  updateAgent(patch: { readonly id?: string; readonly text?: string }): void {
    const editor = this.store.getSnapshot().editor
    if (editor === null) return
    this.patchEditor({
      ...patch.text === undefined ? {} : { text: patch.text },
      ...patch.id === undefined || !editor.creating ? {} : { id: patch.id },
      error: null,
      confirmingDelete: false,
    })
  }

  /** Validate, write and reload the open agent file. A file that saves but does not load stays open
   * with its reason.
   * @returns Once the save settles; a refusal stays in the editor.
   */
  async saveAgent(): Promise<void> {
    const editor = this.store.getSnapshot().editor
    if (editor === null || editor.saving) return
    const localize = this.ctx.locale.bind('settings.agentPreset')
    if (!AGENT_ID.test(editor.id)) { this.patchEditor({ error: localize('agentIdInvalid') }); return }
    if (editor.creating && this.store.getSnapshot().files.some(file => file.id === editor.id)) {
      this.patchEditor({ error: localize('agentIdTaken') })
      return
    }
    this.patchEditor({ saving: true, error: null })
    try {
      const result = await this.ctx.remote.agentPresets.writeFile(editor.id, editor.text)
      if (!result.ok) throw new Error(result.error.message)
      await this.load()
      if (result.value.error === undefined) {
        this.set({ editor: null })
      } else {
        this.patchEditor({ creating: false, saving: false, notLoaded: result.value.error })
      }
    } catch (error) { this.patchEditor({ saving: false, error: message(error) }) }
  }

  /** Remove the open agent file. The first call asks for confirmation; the second removes it.
   * @returns Once the removal settles; a refusal stays in the editor.
   */
  async deleteAgent(): Promise<void> {
    const editor = this.store.getSnapshot().editor
    if (editor === null || editor.creating || editor.saving) return
    if (!editor.confirmingDelete) { this.patchEditor({ confirmingDelete: true }); return }
    this.patchEditor({ saving: true, error: null })
    try {
      const result = await this.ctx.remote.agentPresets.deleteFile(editor.id)
      if (!result.ok) throw new Error(result.error.message)
      this.set({ editor: null })
      await this.load()
    } catch (error) { this.patchEditor({ saving: false, error: message(error) }) }
  }

  /** Close the editor without saving. */
  closeAgent(): void { this.set({ editor: null }) }

  private patchEditor(patch: Partial<AgentFileEditor>): void {
    const editor = this.store.getSnapshot().editor
    if (editor !== null) this.set({ editor: { ...editor, ...patch } })
  }

  /** Set the default and synchronize the current blank task when supplied.
   * @param id Selected default.
   * @param sync Blank-session synchronization callback.
   * @returns Once saved and refreshed.
   */
  async makeDefault(id: string, sync?: (id: string) => Promise<string | undefined>): Promise<void> {
    await this.save(() => writeDefaultPreset(this.ctx, id), sync)
  }

  /** Replace a hidden built-in default after accepted Coding Tools changes.
   * @param shouldReset Rechecked after waiting; false when tools are enabled or this owner is disposed.
   * @returns Once the conditional save settles; errors remain visible in the section.
   */
  async reconcileCodingTools(shouldReset: () => boolean): Promise<void> {
    while (this.pendingSave !== undefined) await this.pendingSave
    if (!shouldReset()) return
    const settings = this.ctx.configForms.get(AGENT_PRESET_SETTINGS_NS).getSnapshot()
    if (settings.status !== 'ready' || !settings.writable || settings.revision === undefined) return
    await this.load()
    if (!shouldReset() || this.store.getSnapshot().status !== 'ready') return
    const rows = this.store.getSnapshot().rows
    if (!requiresCodingTools(rows.find(row => row.isDefault))) return
    if (!rows.some(row => row.id === 'standard' && row.broken === undefined)) {
      this.set({ error: this.ctx.locale.bind('settings.agentPreset')('standardUnavailable') })
      return
    }
    await this.save(() => writeDefaultPreset(this.ctx, 'standard', settings.revision))
  }

  private async save(write: () => Promise<string | undefined>, sync?: (id: string) => Promise<string | undefined>): Promise<void> {
    if (this.store.getSnapshot().saving) return
    const completion = Promise.withResolvers<void>()
    this.pendingSave = completion.promise
    this.set({ saving: true, error: null })
    try {
      const error = await write()
      await this.load()
      if (error !== undefined) throw new Error(error)
      const selected = this.store.getSnapshot().rows.find(row => row.isDefault)
      if (selected !== undefined) {
        const error = await sync?.(selected.id)
        if (error !== undefined) throw new Error(error)
      }
    } catch (error) { this.set({ error: message(error) }) }
    finally {
      this.pendingSave = undefined
      this.set({ saving: false })
      completion.resolve()
    }
  }
}
