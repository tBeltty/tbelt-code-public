/**
 * Configuration and stable diagnostics for the repo-map composition plugin.
 * @module @deepseek-ai/dsh-repo-map/config
 */

/** Default fraction of the model's context window reserved for the composed repo map. */
export const DEFAULT_REPO_MAP_CONTEXT_FRACTION = 0.05
/**
 * Minimum UTF-8 byte budget for the composed repo map, applied when a model's
 * context window is small or unresolvable. Mirrors `session-reference`'s
 * `DEFAULT_MAX_REFERENCE_BYTES` floor shape (`session-reference/src/config.ts:8`),
 * scaled down: a repo map is a secondary, budget-bounded context block, not
 * the primary payload session-reference's floor sizes.
 */
export const DEFAULT_MIN_REPO_MAP_BYTES = 8_192

/** Repo-map plugin configuration. */
export interface Config {
  /** Directory to walk and parse; defaults to the requesting agent's session `cwd`. */
  rootDir?: string
  /** Fraction of the model context window, estimated at four bytes per token, reserved for the composed repo map; between zero and one. */
  repoMapContextFraction?: number
}

/** Stable failure codes exposed to host adapters. */
export type RepoMapErrorCode = 'REPO_MAP_INVALID_CONFIG' | 'REPO_MAP_MISSING_PROJECTION'

/** Typed repo-map failure suitable for host protocol error mapping. */
export class RepoMapError extends Error {
  /** @param message Human-readable diagnosis. @param code Stable routing code. @param options Optional cause. */
  constructor(
    message: string,
    readonly code: RepoMapErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'RepoMapError'
  }
}
