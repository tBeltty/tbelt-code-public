/**
 * Model picker rows: every model the Host can route, grouped by provider.
 * @module @deepseek-ai/dsh-terminal-views/model
 */
import type { PickerItem } from './picker.ts'

/** The model catalog fields the picker reads. */
export interface ModelCatalogChoice {
  readonly default: { readonly provider: string; readonly model: string }
  readonly groups: readonly {
    readonly id: string
    readonly name: string
    readonly models: readonly { readonly id: string; readonly name: string }[]
  }[]
}

/** Separator between provider and model in a model item's value. */
const MODEL_SEPARATOR = '\u0000'

/**
 * Rows of the model picker.
 * @param catalog - the models the Host can route.
 * @param selected - the model now in use, when known; the catalog default otherwise.
 * @returns one row per model, grouped by provider in catalog order.
 */
export function modelItems(
  catalog: ModelCatalogChoice,
  selected?: { readonly provider: string; readonly model: string },
): PickerItem[] {
  const current = selected ?? catalog.default
  return catalog.groups.flatMap(group => group.models.map(model => ({
    value: `${group.id}${MODEL_SEPARATOR}${model.id}`,
    label: model.name,
    detail: group.name,
    current: group.id === current.provider && model.id === current.model,
  })))
}

/**
 * Read a model item's value back.
 * @param value - the `value` of an item from {@link modelItems}.
 * @returns the provider route and model id.
 */
export function parseModelValue(value: string): { readonly provider: string; readonly model: string } {
  const at = value.indexOf(MODEL_SEPARATOR)
  return { provider: value.slice(0, at), model: value.slice(at + 1) }
}
