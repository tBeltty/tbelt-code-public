/**
 * Permissions a person allowed for the rest of one session. Each client keeps
 * one set per session and answers a repeated request without asking again.
 * @module @deepseek-ai/dsh-presentation-approval/grants
 */

/** Set of permission keys ({@link approvalScopeKey}) allowed for one session. */
export class ApprovalGrants {
  readonly #keys = new Set<string>()

  /**
   * Remember a permission.
   * @param scopeKey - key from the approval model.
   */
  grant(scopeKey: string): void {
    this.#keys.add(scopeKey)
  }

  /**
   * Tell whether a permission was already allowed.
   * @param scopeKey - key from the approval model.
   * @returns whether the person allowed it for this session.
   */
  allows(scopeKey: string): boolean {
    return this.#keys.has(scopeKey)
  }

  /** Forget every permission, such as when the session ends. */
  clear(): void {
    this.#keys.clear()
  }
}
