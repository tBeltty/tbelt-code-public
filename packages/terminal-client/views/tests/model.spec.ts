import { describe, expect, it } from 'vitest'
import { modelItems, parseModelValue } from '../src/model.ts'

describe('modelItems', () => {
  const catalog = {
    default: { provider: 'p1', model: 'm1' },
    groups: [
      { id: 'p1', name: 'Provider One', models: [{ id: 'm1', name: 'Model One' }, { id: 'm2', name: 'Model Two' }] },
      { id: 'p2', name: 'Provider Two', models: [{ id: 'm1', name: 'Model One' }] },
    ],
  }

  it('lists every model by provider and marks the default', () => {
    const items = modelItems(catalog)
    expect(items.map(item => item.detail)).toEqual(['Provider One', 'Provider One', 'Provider Two'])
    expect(items.map(item => item.current)).toEqual([true, false, false])
  })

  it('marks the selected model, matching provider and model together', () => {
    const items = modelItems(catalog, { provider: 'p2', model: 'm1' })
    expect(items.map(item => item.current)).toEqual([false, false, true])
  })

  it('reads a value back', () => {
    const [first] = modelItems(catalog)
    expect(parseModelValue((first as { value: string }).value)).toEqual({ provider: 'p1', model: 'm1' })
  })
})
