// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { SpendSummaryReading } from '@deepseek-ai/dsh-api-remotes/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { formatSpend, SpendPill } from '../src/client/SpendPill.tsx'
import { en } from '../src/client/locales.ts'

const t: ComponentProps<typeof SpendPill>['t'] = (key, params) => {
  const template = (en as Record<string, string>)[key] ?? key
  return params === undefined
    ? template
    : template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
}

function summary(session: Partial<SpendSummaryReading['session']>, monthly: Partial<SpendSummaryReading['monthly']> = {}): SpendSummaryReading {
  return {
    budgetSession: SessionId('s'),
    session: { spentUsd: 0, unpricedCalls: 0, ...session },
    month: '2026-10',
    monthly: { spentUsd: 0, unpricedCalls: 0, ...monthly },
  }
}

/** Render the pill over a mutable read result and a manual refresh trigger. */
async function renderPill(first: SpendSummaryReading, open?: () => void) {
  let current = first
  let refresh = (): void => {}
  const read = vi.fn(() => Promise.resolve(current))
  const view = render(
    <SpendPill
      read={read}
      subscribe={(listener) => { refresh = listener; return () => { refresh = () => {} } }}
      spendSettings={() => open}
      t={t}
    />,
  )
  await act(async () => { await Promise.resolve() })
  return {
    view,
    read,
    update: async (next: SpendSummaryReading) => {
      current = next
      await act(async () => { refresh(); await Promise.resolve() })
    },
  }
}

afterEach(() => { cleanup() })

describe('composer spend reading', () => {
  it('formats amounts to the cent and keeps sub-cent spend visible', () => {
    expect(formatSpend(0)).toBe('$0.00')
    expect(formatSpend(0.004)).toBe('<$0.01')
    expect(formatSpend(1234.5)).toBe('$1,234.50')
  })

  it('stays hidden until the chat has something to show, then follows refreshes', async () => {
    const { view, update, read } = await renderPill(summary({}))
    expect(view.container.querySelector('[data-composer-spend]')).toBeNull()
    await update(summary({ spentUsd: 0.42 }, { spentUsd: 3.1, limitUsd: 20 }))
    expect(read).toHaveBeenCalledTimes(2)
    const pill = screen.getByLabelText('This session $0.42 · This month $3.10 / $20.00')
    expect(pill.textContent).toBe('$0.42')
  })

  it('shows the chat limit, marks uncounted calls, and flags a reached limit', async () => {
    const { view } = await renderPill(summary({ spentUsd: 2.03, limitUsd: 2, unpricedCalls: 3 }))
    const root = view.container.querySelector('[data-composer-spend]')
    expect(root?.getAttribute('data-reached')).toBe('true')
    expect(root?.textContent).toBe('$2.03 / $2.00')
    expect(screen.getByLabelText(/3 calls used a model with no price and are not counted$/)).toBeTruthy()
  })

  it('opens the Spending settings on click while a settings shell is present', async () => {
    const open = vi.fn()
    await renderPill(summary({ spentUsd: 1 }), open)
    fireEvent.click(screen.getByRole('button'))
    expect(open).toHaveBeenCalledOnce()
  })
})
