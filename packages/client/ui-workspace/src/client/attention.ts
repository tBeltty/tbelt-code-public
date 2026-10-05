/**
 * Attention buckets for Session rows. The bucket model and the rule that a
 * finished, unviewed Session stays visible until opened are adapted from
 * Orca's dashboard row bucketing (MIT, see LICENSES/Orca-MIT.txt).
 */
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { SessionNode } from './tree.ts'

/** Where a Session sits relative to the user: waiting on them, working, finished unviewed, or quiet. */
export type SessionBucket = 'attention' | 'working' | 'done' | 'idle'

/** Display order of the buckets. */
export const SESSION_BUCKET_ORDER: readonly SessionBucket[] = ['attention', 'working', 'done', 'idle']

/** The status facts a bucket is derived from. */
export type BucketFacts = Pick<SessionNode, 'pendingInteraction' | 'running' | 'runningSubagentCount' | 'completed'>

/**
 * Classify one Session by its live status. A pending interaction outranks
 * activity, and activity outranks an unviewed completion.
 * @param facts - pending interaction, own and descendant activity, and the unviewed-completion mark.
 * @returns the Session's bucket.
 */
export function sessionBucket(facts: BucketFacts): SessionBucket {
  if (facts.pendingInteraction !== undefined) return 'attention'
  if (facts.running || facts.runningSubagentCount > 0) return 'working'
  return facts.completed ? 'done' : 'idle'
}

/**
 * Whether a bucket needs the user to look: a waiting interaction or a
 * finished turn they have not opened.
 * @param bucket - bucket from {@link sessionBucket}.
 * @returns true for `attention` and `done`.
 */
export function awaitsUser(bucket: SessionBucket): boolean {
  switch (bucket) {
    case 'attention':
    case 'done':
      return true
    case 'working':
    case 'idle':
      return false
    /* v8 ignore next 2 -- closed-union backstop */
    default:
      return assertNever(bucket)
  }
}

/**
 * Count Sessions per bucket.
 * @param nodes - Session facts to tally.
 * @returns one count per bucket, zero when absent.
 */
export function tallyBuckets(nodes: Iterable<BucketFacts>): Record<SessionBucket, number> {
  const counts: Record<SessionBucket, number> = { attention: 0, working: 0, done: 0, idle: 0 }
  for (const node of nodes) counts[sessionBucket(node)] += 1
  return counts
}
