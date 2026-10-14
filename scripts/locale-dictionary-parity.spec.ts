/** Test-lane run of the locale parity check in `locale-parity.ts`. */

import { describe, expect, it } from 'vitest'
import { checkLocaleParity } from './locale-parity.ts'

describe('shipped locale dictionaries', () => {
  it('declares exactly the same keys in es, el, fr and en, so no key falls back and none is orphaned', () => {
    const { files, comparedPairs, problems } = checkLocaleParity()
    // Guard the discovery itself: an empty or narrowed sweep would pass every
    // assertion below while checking nothing. The shipped dictionary count
    // only grows; a collapse means discovery or pairing broke, which would
    // hide real asymmetry.
    expect(files).toBeGreaterThan(500)
    expect(comparedPairs).toBeGreaterThan(75)
    expect(problems).toEqual([])
  })
})
