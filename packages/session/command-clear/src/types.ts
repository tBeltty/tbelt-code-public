/**
 * `context/clear` session event vocabulary: the shadow-price record for a
 * manual full-history clear, mirroring `compaction/prune`'s shape under its
 * own name so a `/clear` never enters compaction's own analytics.
 *
 * @module @deepseek-ai/dsh-command-clear/types
 */

import type { CommandId } from '@deepseek-ai/dsh-commands/brand'
import type { SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { ClearId } from './brand.ts'

export type { ClearId }
export type { SessionSeq }

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Shadow price of one manual `/clear` — log-only, no surfaceOp. Priced
     * like `compaction/prune`: the immediately following `user/message`
     * replacement is the surface `replace` event this event prices, so a
     * pure consumer can subtract the shadowed range without retaining
     * per-node state. The replacement MUST be appended synchronously right
     * after this event.
     */
    'context/clear': {
      clearId: ClearId
      sourceCommandId?: CommandId
      /** The cleared surface span, first and last shadowed surface-node seqs. */
      shadowedRange: { start: SessionSeq; end: SessionSeq }
      /** The seqs of all shadowed surface nodes, in surface order. */
      shadowedSeqs: SessionSeq[]
      /** Heuristic price of the shadowed content under the token-meter's fixed estimator. */
      shadowedTokenCount: number
    }
  }
}
