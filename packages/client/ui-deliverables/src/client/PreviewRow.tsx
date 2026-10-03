/** Preview call status, a reopen action, and the automatic open of a live result. */
import { useEffect, useRef } from 'react'
import { DisclosureRow, IconGlobeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import css from './PresentRow.module.css'

/** Opens a loopback URL in the right Sidebar, or outside the app when no Browser tab type is composed. */
export interface PreviewInjected {
  /** Show one URL beside the conversation. */
  openUrl: (url: string) => void
}

type PreviewRowProps = ToolCallViewProps & PropsLocale<typeof NS> & InjectFace<PreviewInjected>

/* v8 ignore next -- Non-expandable rows never invoke DisclosureRow's required toggle callback. */
const noop = (): void => undefined

/**
 * Read the recorded target; raw arguments can be partial while a call is streaming.
 * @param raw - recorded or streaming argument JSON.
 * @returns the trimmed target, or an empty string when none is readable yet.
 */
export function previewTarget(raw: string): string {
  let args: unknown
  try { args = JSON.parse(raw) }
  catch { return '' } // Truncated tool JSON has no complete target until the call completes.
  if (typeof args !== 'object' || args === null || !('target' in args) || typeof args.target !== 'string') return ''
  return args.target.trim()
}

/**
 * Render a preview call and open its target once when the result settles while the row is on screen.
 *
 * A row that first mounts with a settled result belongs to history and does not open.
 * @param props - tool call, localized copy, and URL opener.
 * @returns a status row with an open action after success.
 */
export function PreviewRow(props: PreviewRowProps) {
  const { openFile, openUrl, t } = props
  const settled = props.phase === 'result'
  const ok = props.phase === 'result' && !props.block.isError && props.block.error === undefined
  const args = props.phase === 'preparing' ? '' : props.phase === 'result' ? props.block.call?.argsRaw ?? '' : props.block.argsRaw
  const target = previewTarget(args)
  const show = (): void => {
    if (/^https?:\/\//i.test(target)) openUrl(target)
    else openFile(target)
  }
  const sawLive = useRef(!settled)
  const opened = useRef(false)
  useEffect(() => {
    if (!ok || !sawLive.current || opened.current || target === '') return
    opened.current = true
    show()
  })
  const state = props.phase === 'preparing' ? 'preparing' : props.phase === 'start' ? 'running'
    : props.block.error?.code === 'interrupted' ? 'stopped' : ok ? 'ok' : 'error'
  return <div data-tool="preview" data-state={state}>
    <DisclosureRow title={t('preview.title')} icon={<IconGlobeOutlineRegular size={14} />}
      open={false} expandable={false} onToggle={noop} running={!settled}
      collapsedContent={<span className={css.summary}><span>{t(`preview.${state}`)}</span><span className={css.paths}>{target}</span>
        {ok && target !== '' && <button type="button" className={css.inspect} onClick={show}>{t('preview.open')}</button>}
      </span>} />
  </div>
}
