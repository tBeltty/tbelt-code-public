// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { PickDock } from '../src/client/grab/PickDock.tsx'
import { clampPick } from '../src/client/grab/payload.ts'
import { ElementPickStore } from '../src/client/grab/picks.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const pick = (text: string) => clampPick({
  page: {}, target: { tagName: 'button', selector: 'button#buy', textSnippet: text },
})!

it('lists this session\'s unsent picks and removes one', () => {
  const store = new ElementPickStore()
  const mine = 'mine' as SessionId
  store.add(mine, pick('Buy now'))
  store.add(mine, pick(''))
  store.add('other' as SessionId, pick('Elsewhere'))
  const removePick = vi.fn((sessionId: SessionId, id: number) => { store.remove(sessionId, [id]) })
  const usePicks = <S,>(select: (state: ReturnType<typeof store.state.getSnapshot>) => S): S =>
    select(useSyncExternalStore(listener => store.state.subscribe(listener), () => store.state.getSnapshot()))
  const view = render(<PickDock sessionId={mine} usePicks={usePicks} removePick={removePick}
    t={(key: string) => (en as Record<string, string>)[key] ?? key} />)
  const items = view.getAllByRole('listitem')
  expect(items.map(item => item.textContent)).toEqual(['<button> Buy now', '<button>'])
  fireEvent.click(view.getAllByRole('button', { name: en['pick.remove'] })[0]!)
  expect(removePick).toHaveBeenCalledWith(mine, 1)
  expect(view.getAllByRole('listitem')).toHaveLength(1)
  fireEvent.click(view.getByRole('button', { name: en['pick.remove'] }))
  expect(view.container.firstChild).toBeNull()
})
