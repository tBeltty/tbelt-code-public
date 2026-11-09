import { describe, expect, it } from 'vitest'
import { planBucketBudget, type BucketBudgetRequest } from '../scripts/bucket-budget.ts'

const PREFIX = '_/harness/desktop/stable/linux-x64'
const GB = 1e9

function release(version: string, size = GB, prefix = PREFIX, suffix = 'linux-x64') {
  return { key: `${prefix}/tbelt-code-${version}-${suffix}.AppImage`, size }
}

function request(overrides: Partial<BucketBudgetRequest>): BucketBudgetRequest {
  return {
    objects: [],
    uploads: [release('1.3.0')],
    keyPrefix: PREFIX,
    productSlug: 'tbelt-code',
    targetSuffix: 'linux-x64',
    version: '1.3.0',
    keepVersions: 2,
    limitBytes: 8 * GB,
    ...overrides,
  }
}

describe('planBucketBudget', () => {
  it('keeps the newest older release of the target and prunes the rest', () => {
    const plan = planBucketBudget(request({
      objects: [release('1.2.0'), release('1.10.0'), release('1.9.1'), { key: `${PREFIX}/latest-linux.yml`, size: 400 }],
      version: '1.11.0',
      uploads: [release('1.11.0')],
    }))
    expect(plan.prune.map(object => object.key).sort()).toEqual([release('1.2.0').key, release('1.9.1').key].sort())
    expect(plan.projectedBytes).toBe(2 * GB + 400)
  })

  it('never prunes channel metadata, other targets, or the version being uploaded', () => {
    const macPrefix = '_/harness/desktop/stable/mac-arm64'
    const plan = planBucketBudget(request({
      objects: [
        release('1.0.0', GB, macPrefix, 'mac-arm64'),
        release('1.1.0', GB, macPrefix, 'mac-arm64'),
        release('1.3.0'),
        { key: `${PREFIX}/latest-linux.yml`, size: 400 },
      ],
      keepVersions: 1,
    }))
    expect(plan.prune).toEqual([])
    expect(plan.currentBytes).toBe(3 * GB + 400)
    expect(plan.projectedBytes).toBe(3 * GB + 400)
  })

  it('prunes every object of an old release, including mac blockmaps', () => {
    const mac = '_/harness/desktop/stable/mac-arm64'
    const old = ['dmg', 'zip', 'zip.blockmap'].map(ext => ({ key: `${mac}/tbelt-code-1.0.0-mac-arm64.${ext}`, size: 1 }))
    const plan = planBucketBudget(request({
      objects: [...old, release('1.1.0', 1, mac, 'mac-arm64')],
      keyPrefix: mac,
      targetSuffix: 'mac-arm64',
      uploads: [release('1.2.0', 1, mac, 'mac-arm64')],
      version: '1.2.0',
    }))
    expect(plan.prune).toEqual(old)
  })

  it('refuses an upload that would leave the bucket above the limit', () => {
    expect(() => planBucketBudget(request({
      objects: [release('1.2.0', 5 * GB), { key: 'other/large.bin', size: 2 * GB }],
      uploads: [release('1.3.0', 2 * GB)],
    }))).toThrow('above the 8.00 GB limit')
  })

  it('counts pruned space before deciding and replaces a re-uploaded key instead of adding it', () => {
    const plan = planBucketBudget(request({
      objects: [release('1.1.0', 4 * GB), release('1.2.0', 2 * GB), release('1.3.0', 3 * GB)],
      uploads: [release('1.3.0', 3 * GB)],
    }))
    expect(plan.prune).toEqual([release('1.1.0', 4 * GB)])
    expect(plan.projectedBytes).toBe(5 * GB)
  })

  it('rejects a retention below one release', () => {
    expect(() => planBucketBudget(request({ keepVersions: 0 }))).toThrow('keep at least one version')
  })
})
