/** Credential values shared by DeepSeek model and web providers; callers own protocol headers and missing-key errors. */
import type { Context } from '@deepseek-ai/cordis'
import { normalizeApiKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { INVALID_CREDENTIAL_CODE, LlmError } from '@deepseek-ai/dsh-llm'

/**
 * Accept one supplied key, or refuse it as unusable.
 *
 * Surrounding whitespace is trimmed silently. Any other defect fails here rather than inside `fetch`, whose
 * ByteString refusal names a UTF-16 code point instead of the setting to change. The key never enters the message:
 * `ref` names where to fix it.
 * @param raw - the key exactly as supplied.
 * @param pkg - the refusing package name, prefixed to the diagnostic.
 * @param ref - the credential reference the value resolved through.
 * @returns the trimmed, usable key.
 * @throws LlmError coded `INVALID_CREDENTIAL` when the key is blank or holds characters no HTTP header can carry.
 */
function assertUsableApiKey(raw: string, pkg: string, ref: string): string {
  const checked = normalizeApiKey(raw)
  if (checked.ok) return checked.value
  throw new LlmError(
    checked.reason === 'empty'
      ? `${pkg}: the API key resolved from ${ref} is blank; set ${ref} to the raw key`
        + ' (the web Models page writes it) or export it in the launching environment'
      : `${pkg}: the API key resolved from ${ref} contains characters no HTTP header can carry;`
        + ` set ${ref} to the raw key alone (the web Models page writes it)`,
    INVALID_CREDENTIAL_CODE,
  )
}

/**
 * Read and validate one API key. An installed credentials service is authoritative, including absence;
 * only deployments without that service read the launch environment. Store and format failures propagate.
 * @param ctx - context providing the credential and launch-environment services.
 * @param ref - credential reference to resolve.
 * @returns the validated key, or undefined when no key is configured.
 */
export async function resolveDeepSeekApiKey(ctx: Context, ref: CredentialRef): Promise<string | undefined> {
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    const hit = await credentials.resolve(ref)
    return hit === undefined ? undefined : assertUsableApiKey(hit.value, 'llm-deepseek', ref)
  }
  const ambient = launchEnvironmentOf(ctx).get(ref)
  return ambient === undefined || ambient.value.length === 0 ? undefined : assertUsableApiKey(ambient.value, 'llm-deepseek', ref)
}

/**
 * Check key presence without resolving a credential-store value or validating its format. Store failures propagate.
 * @param ctx - context providing the credential and launch-environment services.
 * @param ref - credential reference to inspect.
 * @returns whether the authoritative credential source reports a configured key.
 */
export async function deepSeekApiKeyConfigured(ctx: Context, ref: CredentialRef): Promise<boolean> {
  const credentials = ctx.get('credentials')
  return credentials === undefined
    ? (launchEnvironmentOf(ctx).get(ref)?.value.length ?? 0) > 0
    : (await credentials.describe(ref)).configured
}
