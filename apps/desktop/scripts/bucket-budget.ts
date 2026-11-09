/** Keep the Desktop update bucket inside a fixed storage budget before an upload writes to it. */

/** One stored object as reported by an S3-compatible listing. */
export interface BucketObject {
  readonly key: string
  readonly size: number
}

/** Inputs that decide which old releases of one target the bucket retains. */
export interface BucketBudgetRequest {
  /** Every object currently in the bucket, across all targets. */
  readonly objects: readonly BucketObject[]
  /** Objects this upload is about to write; a key that already exists is replaced, not added. */
  readonly uploads: readonly BucketObject[]
  /** Folder that holds this target's releases, without a trailing slash. */
  readonly keyPrefix: string
  /** Filename stem before the version, such as `tbelt-code`. */
  readonly productSlug: string
  /** Filename part after the version, such as `linux-x64`. */
  readonly targetSuffix: string
  /** Version this upload publishes. */
  readonly version: string
  /** Releases of this target to keep, counting the one being uploaded. */
  readonly keepVersions: number
  /** Largest total bucket size, in bytes, the upload may leave behind. */
  readonly limitBytes: number
}

/** Outcome of a budget check: what to delete after the upload and the resulting size. */
export interface BucketBudgetPlan {
  readonly currentBytes: number
  readonly projectedBytes: number
  /** Old release objects of this target, deleted only after the new release is live. */
  readonly prune: readonly BucketObject[]
}

function compareVersions(left: string, right: string): number {
  const parts = (value: string): string[] => value.split(/[.+-]/u)
  const a = parts(left)
  const b = parts(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = a[index] ?? ''
    const y = b[index] ?? ''
    const numeric = /^\d+$/u.test(x) && /^\d+$/u.test(y)
    const order = numeric ? Number(x) - Number(y) : x.localeCompare(y)
    if (order !== 0) return order
  }
  return 0
}

/**
 * Choose old releases of one target to delete and refuse an upload that would exceed the budget.
 * Channel metadata (`latest*.yml`) and other targets are never pruned.
 * @param request - Bucket listing, pending uploads, retention, and limit.
 * @returns The bytes stored now and after the upload and pruning, plus the objects to delete.
 * @throws {Error} When the bucket would still exceed `limitBytes` after pruning.
 */
export function planBucketBudget(request: BucketBudgetRequest): BucketBudgetPlan {
  if (!Number.isSafeInteger(request.keepVersions) || request.keepVersions < 1) {
    throw new Error(`desktop upload: keep at least one version, got ${request.keepVersions}`)
  }
  if (!Number.isFinite(request.limitBytes) || request.limitBytes <= 0) {
    throw new Error(`desktop upload: the bucket limit must be a positive size, got ${request.limitBytes}`)
  }
  const folder = `${request.keyPrefix}/`
  const stem = `${request.productSlug}-`
  const ending = `-${request.targetSuffix}`
  const versions = new Map<string, BucketObject[]>()
  for (const object of request.objects) {
    if (!object.key.startsWith(folder)) continue
    const filename = object.key.slice(folder.length)
    if (filename.includes('/') || !filename.startsWith(stem)) continue
    const end = filename.indexOf(`${ending}.`, stem.length)
    if (end <= stem.length) continue
    const version = filename.slice(stem.length, end)
    versions.set(version, [...versions.get(version) ?? [], object])
  }
  versions.delete(request.version)
  const older = [...versions.keys()].sort(compareVersions).reverse()
  const prune = older.slice(request.keepVersions - 1).flatMap(version => versions.get(version) ?? [])

  const sizes = new Map(request.objects.map(object => [object.key, object.size]))
  const currentBytes = [...sizes.values()].reduce((total, size) => total + size, 0)
  for (const object of prune) sizes.delete(object.key)
  for (const object of request.uploads) sizes.set(object.key, object.size)
  const projectedBytes = [...sizes.values()].reduce((total, size) => total + size, 0)
  if (projectedBytes > request.limitBytes) {
    throw new Error(`desktop upload: refusing to upload; the bucket would hold ${formatBytes(projectedBytes)}, above the ${formatBytes(request.limitBytes)} limit (now ${formatBytes(currentBytes)})`)
  }
  return { currentBytes, projectedBytes, prune }
}

/**
 * Render a byte count for logs.
 * @param bytes - Size in bytes.
 * @returns The size in GB with two decimals.
 */
export function formatBytes(bytes: number): string {
  return `${(bytes / 1e9).toFixed(2)} GB`
}
