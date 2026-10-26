/** Shared model fields and actions for both adapter catalog editors; only the pi-ai editor edits list prices. */

import type { DragEvent, ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconDragHandleOutlineRegular,
  IconTrashOutlineRegular, Tooltip, useRowDragPreview,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeepSeekModelDraft } from './DeepSeekModelsEditor.tsx'
import type { ModelsKey } from './locales.ts'
import { ModelInputTypes } from './ModelInputTypes.tsx'
import { ModelReasoningEfforts } from './ModelReasoningEfforts.tsx'
import type { ModelRowOrder } from './useModelRows.ts'
import styles from './ModelsSection.module.css'

/** A capacity's editable text and adapter-specific inherited hint. */
interface CapacityInput {
  value: string
  placeholder: string
  onChange: (value: string) => void
  onBlur?: () => void
}

/** The rates a row edits, in US dollars per million tokens. */
export type PriceField = 'input' | 'output' | 'cacheRead'

/** Adapter-owned data and actions for one model row. */
interface ModelRowProps {
  model: DeepSeekModelDraft
  rowKey: number
  position: number
  order: ModelRowOrder
  inputField: 'inputModalities' | 'input'
  inputFallback?: readonly string[] | undefined
  inputLoading?: boolean
  expanded: boolean
  disabled: boolean
  t: (key: ModelsKey) => string
  contextWindow: CapacityInput
  maxTokens: CapacityInput
  /** Levels the row's `reasoningEfforts` may declare; absent or empty shows no reasoning control. */
  reasoningLevels?: readonly string[] | undefined
  /** List-price inputs; absent on an adapter whose models take no configured price. */
  pricing?: Readonly<Record<PriceField, CapacityInput>> | undefined
  onFieldChange: (field: 'id' | 'name', value: string | undefined) => void
  onIdBlur?: (value: string) => void
  onChange: (model: DeepSeekModelDraft) => void
  onToggle: () => void
  onRemove: () => void
}

/** Copy key of each price input's label. */
const PRICE_LABEL: Readonly<Record<PriceField, ModelsKey>> = {
  input: 'modelPriceInput',
  output: 'modelPriceOutput',
  cacheRead: 'modelPriceCacheRead',
}

function rowHalf(event: DragEvent<HTMLElement>): 'before' | 'after' {
  const rect = event.currentTarget.getBoundingClientRect()
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

/**
 * Render consistent model identity, capacity, and input-type controls.
 * @param props - drafted fields and their owning editor's actions.
 * @returns one expandable model entry.
 */
export function ModelRow(props: ModelRowProps): ReactNode {
  const { model, position, t, disabled } = props
  const preview = useRowDragPreview(styles['modelDragPreview'] as string)
  return (
    <div
      className={styles['modelEntry']}
      data-row-key={props.rowKey}
      data-dragging={props.order.dragging || undefined}
      data-drop-target={props.order.dragging ? undefined : props.order.target}
      onDragOver={(event) => {
        if (!props.order.canDrop) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        props.order.onOver(rowHalf(event))
      }}
      onDragLeave={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
        props.order.onLeave()
      }}
      onDrop={(event) => {
        if (!props.order.canDrop) return
        event.preventDefault()
        props.order.onDrop(rowHalf(event))
      }}
    >
      <div className={styles['modelRow']}>
        <Tooltip label={t('reorderModelHelp')}>
          <button
            type="button"
            className={`${styles['iconButton']} ${styles['modelDragHandle']}`}
            aria-label={`${t('reorderModel')} ${String(position)}`}
            aria-keyshortcuts="ArrowUp ArrowDown"
            aria-description={t('reorderModelHelp')}
            disabled={disabled}
            draggable={!disabled}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('application/x-dsh-model-order', String(position))
              props.order.onStart()
              preview.start(event, event.currentTarget.closest('[data-row-key]') as HTMLElement)
            }}
            onDragEnd={() => { if (preview.clear()) props.order.onEnd() }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
              event.preventDefault()
              event.stopPropagation()
              props.order.onMove(event.key === 'ArrowUp' ? -1 : 1)
            }}
          >
            <IconDragHandleOutlineRegular size={14} />
          </button>
        </Tooltip>
        {(['id', 'name'] as const).map(field => (
          <input
            key={field}
            className={styles['input']}
            type="text"
            value={typeof model[field] === 'string' ? model[field] : ''}
            placeholder={t(field === 'id' ? 'modelId' : 'modelName')}
            aria-label={`${t(field === 'id' ? 'modelId' : 'modelName')} ${String(position)}`}
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value
              props.onFieldChange(field, field === 'name' && value === '' ? undefined : value)
            }}
            onBlur={field === 'id' ? event => props.onIdBlur?.(event.target.value) : undefined}
          />
        ))}
        <button
          type="button"
          className={styles['iconButton']}
          aria-label={`${t('modelAdvanced')} ${String(position)}`}
          aria-expanded={props.expanded}
          title={t('modelAdvanced')}
          onClick={props.onToggle}
        >
          {props.expanded ? <IconChevronDownOutlineRegular /> : <IconChevronRightOutlineRegular />}
        </button>
        <button
          type="button"
          className={`${styles['iconButton']} ${styles['iconButtonDanger']}`}
          aria-label={`${t('removeModel')} ${String(position)}`}
          title={t('removeModel')}
          disabled={disabled}
          onClick={props.onRemove}
        >
          <IconTrashOutlineRegular size={14} />
        </button>
      </div>
      {props.expanded
        ? (
          <div className={styles['modelAdvanced']}>
            {(['contextWindow', 'maxTokens'] as const).map(field => (
              <label className={styles['modelField']} key={field}>
                <span className={styles['modelFieldLabel']}>{t(field)}</span>
                <input
                  className={styles['input']}
                  type="text"
                  inputMode="numeric"
                  value={props[field].value}
                  placeholder={props[field].placeholder}
                  aria-label={`${t(field)} ${String(position)}`}
                  disabled={disabled}
                  onChange={(event) => { props[field].onChange(event.target.value) }}
                  onBlur={props[field].onBlur}
                />
              </label>
            ))}
            {props.pricing === undefined
              ? null
              : (
                <fieldset className={styles['modelPrice']}>
                  <legend className={styles['modelFieldLabel']}>{t('modelPrice')}</legend>
                  {(['input', 'output', 'cacheRead'] as const).map(field => (
                    <label className={styles['modelField']} key={field}>
                      <span className={styles['modelPriceLabel']}>{t(PRICE_LABEL[field])}</span>
                      <input
                        className={styles['input']}
                        type="text"
                        inputMode="decimal"
                        value={props.pricing?.[field].value}
                        placeholder={props.pricing?.[field].placeholder}
                        aria-label={`${t(PRICE_LABEL[field])} ${String(position)}`}
                        disabled={disabled}
                        onChange={(event) => { props.pricing?.[field].onChange(event.target.value) }}
                      />
                    </label>
                  ))}
                </fieldset>
              )}
            <ModelInputTypes
              model={model} field={props.inputField} position={position}
              fallback={props.inputFallback} disabled={disabled || props.inputLoading === true} t={t} onChange={props.onChange}
            />
            {props.reasoningLevels !== undefined && props.reasoningLevels.length > 0
              ? (
                <ModelReasoningEfforts
                  model={model} levels={props.reasoningLevels} position={position} disabled={disabled} t={t} onChange={props.onChange}
                />
              )
              : null}
          </div>
        )
        : null}
    </div>
  )
}
