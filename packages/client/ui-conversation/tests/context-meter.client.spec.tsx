// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn, es as commonEs } from '@deepseek-ai/dsh-client-locale/src/locales/index.ts'
import { ContextMeter, type ContextMeterProps } from '../src/client/skeleton/ContextMeter.tsx'
import { contextOccupancy } from '../src/client/context-occupancy.ts'
import css from '../src/client/skeleton/ContextMeter.module.css'
import { en, es } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(es, commonEs) as ContextMeterProps['t']
const tEn = makeTranslate(en, commonEn) as ContextMeterProps['t']

const BREAKDOWN = { systemTokens: 120, toolsTokens: 21_500, messageTokens: 477_000 }

const segmentClass = css.segment
if (segmentClass === undefined) throw new Error('segment class missing from ContextMeter.module.css')

function projections(values: Record<string, unknown>): ContextMeterProps['useProjection'] {
  return (key: string) => values[key]
}

function meter(values: Record<string, unknown>, translate: ContextMeterProps['t'] = t) {
  return render(<ContextMeter useProjection={projections(values)} t={translate} />)
}

describe('ContextMeter', () => {
  it('computes occupancy only when both a numerator and capacity are known', () => {
    expect(contextOccupancy({ pressureTokens: 32_000, projectedTokens: 6_000, contextWindow: 128_000 }))
      .toEqual({ percent: 5, usedTokens: 6_000, contextWindow: 128_000 })
    expect(contextOccupancy({ pressureTokens: 32_000, contextWindow: 128_000 }))
      .toEqual({ percent: 25, usedTokens: 32_000, contextWindow: 128_000 })
    expect(contextOccupancy({ pressureTokens: 32_000 })).toBeNull()
    expect(contextOccupancy({ contextWindow: 128_000 })).toBeNull()
    expect(contextOccupancy(undefined)).toBeNull()
    expect(contextOccupancy({ pressureTokens: 300_000, contextWindow: 128_000 })?.percent).toBe(100)
  })

  it('renders nothing until both pressure and capacity are known', () => {
    expect(meter({}).container.textContent).toBe('')
    expect(meter({ contextPressure: { pressureTokens: 32_000 } }).container.textContent).toBe('')
    expect(meter({ contextPressure: { contextWindow: 128_000 } }).container.textContent).toBe('')
  })

  it('shows the occupancy ring and opens the breakdown panel on click', () => {
    const view = meter({
      contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    })
    const trigger = view.getByRole('button', { name: '25% del contexto usado' })
    expect(view.queryByRole('dialog')).toBeNull()
    fireEvent.click(trigger)
    const panel = view.queryByRole('dialog')!
    expect(panel.textContent).toContain('~32 mil / 128 mil')
    expect(panel.textContent).toContain('25%')
    expect(panel.textContent).toContain('del contexto usado')
    expect(panel.textContent).toContain('Prompt del sistema~120')
    expect(panel.textContent).toContain('Definiciones de herramientas~21,5 mil')
    expect(panel.textContent).toContain('Mensajes~477 mil')
    // The occupancy bar splits into one colored segment per composition row.
    expect(panel.getElementsByClassName(segmentClass)).toHaveLength(3)
    // Clicking the trigger again toggles the panel shut.
    fireEvent.click(trigger)
    expect(view.queryByRole('dialog')).toBeNull()
  })

  it('lets each locale own the headline word order around the reading', () => {
    const values = {
      contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    }
    const esView = meter(values)
    fireEvent.click(esView.getByRole('button', { name: '25% del contexto usado' }))
    // The reading follows the label in Chinese and leads it in English; both
    // headers read as one sentence rather than a concatenated fragment.
    expect(esView.queryByRole('dialog')!.textContent)
      .toMatch(/^25%del contexto usado/)
    const enView = meter(values, tEn)
    fireEvent.click(enView.getByRole('button', { name: '25% of context used' }))
    expect(enView.queryByRole('dialog', { name: 'of context used' })!.textContent)
      .toMatch(/^25%of context used/)
  })

  it('draws no bar segment at zero occupancy', () => {
    const view = meter({
      contextPressure: { pressureTokens: 0, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    })
    fireEvent.click(view.getByRole('button', { name: '0% del contexto usado' }))
    const panel = view.queryByRole('dialog')!
    // `.segment` carries a min-width, so a zero-width part would still paint a
    // filled sliver over an empty context.
    expect(panel.getElementsByClassName(segmentClass)).toHaveLength(0)
    expect(panel.textContent).toContain('~0 / 128 mil')
  })

  it('reads the ring from the projected figure so a compaction shows at once', () => {
    // Same provider sample, a surface a compaction just shrank: the ring must
    // follow the projection rather than the sample it is anchored to.
    const view = meter({
      contextPressure: { pressureTokens: 32_000, projectedTokens: 3_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    })
    const trigger = view.getByRole('button', { name: '2% del contexto usado' })
    fireEvent.click(trigger)
    expect(view.queryByRole('dialog')!.textContent).toContain('~3 mil / 128 mil')
  })

  it('omits the composition rows while the contextBreakdown projection is absent', () => {
    const view = meter({ contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 } })
    fireEvent.click(view.getByRole('button', { name: '25% del contexto usado' }))
    const panel = view.queryByRole('dialog')!
    expect(panel.textContent).toContain('~32 mil / 128 mil')
    expect(panel.textContent).not.toContain('Prompt del sistema')
    expect(panel.textContent).not.toContain('Mensajes')
    // Without composition shares, the bar falls back to one plain segment.
    expect(panel.getElementsByClassName(segmentClass)).toHaveLength(1)
  })

  it('closes when capacity disappears and stays closed when it returns', () => {
    let values: Record<string, unknown> = {
      contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    }
    const view = render(<ContextMeter useProjection={(key: string) => values[key]} t={t} />)
    fireEvent.click(view.getByRole('button', { name: '25% del contexto usado' }))
    expect(view.queryByRole('dialog')).not.toBeNull()

    values = { contextPressure: { pressureTokens: 32_000 }, contextBreakdown: BREAKDOWN }
    view.rerender(<ContextMeter useProjection={(key: string) => values[key]} t={t} />)
    expect(view.container.textContent).toBe('')

    values = {
      contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    }
    view.rerender(<ContextMeter useProjection={(key: string) => values[key]} t={t} />)
    expect(view.getByRole('button', { name: '25% del contexto usado' }).getAttribute('aria-expanded')).toBe('false')
    expect(view.queryByRole('dialog')).toBeNull()
  })

  it('closes on outside pointerdown and Escape — but not inside clicks', () => {
    const view = meter({
      contextPressure: { pressureTokens: 32_000, contextWindow: 128_000 },
      contextBreakdown: BREAKDOWN,
    })
    const trigger = view.getByRole('button', { name: '25% del contexto usado' })
    const openPanel = () => {
      fireEvent.click(trigger)
      return view.queryByRole('dialog')!
    }
    // A pointerdown inside the panel keeps it open; outside closes it.
    const again = openPanel()
    fireEvent.pointerDown(again)
    expect(view.queryByRole('dialog')).not.toBeNull()
    fireEvent.pointerDown(document.body)
    expect(view.queryByRole('dialog')).toBeNull()
    // Escape.
    openPanel()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(view.queryByRole('dialog')).toBeNull()
  })
})
