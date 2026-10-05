/** Stable failure classes a manual `/clear` can raise, for command-layer message mapping. */
export type ManualClearErrorCode =
  | 'busy'
  | 'cancelled'
  | 'commit'
  | 'persistence'

/** One classified `/clear` failure, distinguishing expected outcomes from defects. */
export class ManualClearError extends Error {
  override readonly name = 'ManualClearError'

  /**
   * Create one classified clear failure.
   * @param code - stable failure class.
   * @param message - backend diagnostic retained as the Error message.
   * @param options - optional original failure.
   */
  constructor(
    readonly code: ManualClearErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}
