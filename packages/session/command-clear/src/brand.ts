import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity shared by one clear transaction's log event and its replacement checkpoint. */
export type ClearId = Branded<'ClearId'>

/**
 * Brand an implementation-minted clear identity.
 * @param id - opaque transaction identity.
 * @returns the same string, branded; no validation is performed.
 */
export function ClearId(id: string): ClearId {
  return id as ClearId
}
