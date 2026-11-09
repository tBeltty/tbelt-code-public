/**
 * Configuration for memory-index recall injection.
 * @module @deepseek-ai/dsh-memory-recall/config
 */

import z from '@deepseek-ai/schemastery'

/** Above how many entries a scope's index surfaces a consolidation nudge. Deployment-varying, not a fixed protocol constant. */
const DEFAULT_CONSOLIDATION_THRESHOLD = 40

/** User-facing memory-recall injection configuration. */
export interface Config {
  /**
   * Entry count above which an injected scope's index carries a
   * consolidation suggestion instead of silently growing forever. This is a
   * surfaced suggestion only — no automatic or silent consolidation happens
   * at or above this count.
   */
  consolidationThreshold?: number
}

export const Config: z<Config> = z.object({
  consolidationThreshold: z.number().step(1).min(1).default(DEFAULT_CONSOLIDATION_THRESHOLD),
})

/** Normalized memory-recall injection configuration. */
export interface ResolvedConfig {
  consolidationThreshold: number
}

/**
 * Normalize a caller-supplied config.
 * @param config - raw plugin config.
 * @returns the resolved configuration with defaults applied.
 */
export function resolveConfig(config: Config): ResolvedConfig {
  return {
    consolidationThreshold: config.consolidationThreshold ?? DEFAULT_CONSOLIDATION_THRESHOLD,
  }
}
