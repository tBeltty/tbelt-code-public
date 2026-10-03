/**
 * The JSON request every key-authenticated search provider sends to its own
 * API, and the classification of a refused request into a rejected key, an
 * exhausted quota, or another provider failure.
 * @module @deepseek-ai/dsh-web/provider-http
 */

import { userAgent } from '@deepseek-ai/dsh-llm'
import { WebError } from './types.ts'

/** Attribution header sent on every provider request. */
const USER_AGENT = userAgent()

/**
 * Wording that marks a refusal as a quota, credit, or rate limit. It wins over
 * the HTTP status: some providers answer an exhausted key with 401 or 403.
 */
const QUOTA_WORDING = /quota|credit|rate.?limit|usage limit|plan limit|limit exceeded|exceeded|insufficient|balance|too many requests/i

/** Wording that marks a 4xx refusal as a rejected key when its status alone does not. */
const AUTH_WORDING = /api.?key|token|unauthori[sz]ed|forbidden|invalid key|subscription/i

/** Code of one refused provider request. */
export type ProviderFailureCode = 'WEB_PROVIDER_AUTH' | 'WEB_PROVIDER_QUOTA' | 'WEB_PROVIDER_ERROR'

/** One JSON request to a search provider's API. */
export interface ProviderJsonRequest {
  /** Provider name used in error messages. */
  label: string
  /** Absolute endpoint URL, query string included. */
  url: string
  /** HTTP method. */
  method: 'GET' | 'POST'
  /** Provider-specific headers, authentication included. */
  headers: Readonly<Record<string, string>>
  /** JSON body for a POST. */
  body?: unknown
  /** Cancellation signal; an abort rejects with `WEB_ABORTED`. */
  signal?: AbortSignal
}

/**
 * Classify a refused provider request.
 * @param status - the HTTP status.
 * @param detail - the provider's error text, or an empty string.
 * @returns `WEB_PROVIDER_QUOTA` for quota, credit, or rate limits (status 402,
 *   429, 432, 433, or quota wording), `WEB_PROVIDER_AUTH` for a rejected key
 *   (401, 403, or a 400/422 naming the key), and `WEB_PROVIDER_ERROR` otherwise.
 */
export function providerFailureCode(status: number, detail: string): ProviderFailureCode {
  if (status === 402 || status === 429 || status === 432 || status === 433 || QUOTA_WORDING.test(detail)) return 'WEB_PROVIDER_QUOTA'
  if (status === 401 || status === 403) return 'WEB_PROVIDER_AUTH'
  if ((status === 400 || status === 422) && AUTH_WORDING.test(detail)) return 'WEB_PROVIDER_AUTH'
  return 'WEB_PROVIDER_ERROR'
}

/**
 * Send one JSON request and parse the JSON response. Redirects are refused, so
 * the key reaches no host but the configured endpoint.
 * @param request - the endpoint, headers, body, and cancellation signal.
 * @returns the parsed response body, unvalidated.
 * @throws WebError with `WEB_ABORTED` on cancellation, the
 *   {@link providerFailureCode} code on a non-2xx status, and
 *   `WEB_PROVIDER_ERROR` on a network failure or an unparseable body.
 */
export async function requestProviderJson(request: ProviderJsonRequest): Promise<unknown> {
  const { label, signal } = request
  let response: Response
  try {
    response = await fetch(request.url, {
      method: request.method,
      redirect: 'error',
      headers: {
        ...request.headers,
        'accept': 'application/json',
        'user-agent': USER_AGENT,
        ...request.body === undefined ? {} : { 'content-type': 'application/json' },
      },
      ...request.body === undefined ? {} : { body: JSON.stringify(request.body) },
      ...signal === undefined ? {} : { signal },
    })
  } catch (error: unknown) {
    throw transportError(label, 'search request failed', error)
  }
  if (!response.ok) {
    let detail = ''
    try {
      detail = errorDetail(await response.json()) ?? ''
    } catch (error: unknown) {
      // Cancellation is not a provider error, even mid-body.
      if (isAbortError(error)) throw new WebError(`${label} search aborted`, 'WEB_ABORTED', { cause: error })
      // The status is enough on its own; a non-JSON error body (normal for
      // gateway 5xx and 429 answers) only costs the provider's wording.
    }
    throw refusal(label, response.status, detail)
  }
  try {
    const body: unknown = await response.json()
    return body
  } catch (error: unknown) {
    throw transportError(label, 'returned an unprocessable response body', error)
  }
}

/**
 * Build the error for a refused request, worded for the model reading the tool result.
 * @param label - provider name.
 * @param status - HTTP status.
 * @param detail - the provider's error text, or an empty string.
 * @returns the classified error.
 */
function refusal(label: string, status: number, detail: string): WebError {
  const code = providerFailureCode(status, detail)
  const suffix = detail.length > 0 ? `: ${detail}` : ''
  switch (code) {
    case 'WEB_PROVIDER_AUTH':
      return new WebError(`${label} rejected the API key (HTTP ${status})${suffix}; the user must supply a valid key for this provider.`, code)
    case 'WEB_PROVIDER_QUOTA':
      return new WebError(`${label} refused the search for quota, credit, or rate limits (HTTP ${status})${suffix}.`, code)
    case 'WEB_PROVIDER_ERROR':
      return new WebError(`${label} API error (HTTP ${status})${suffix}`, code)
  }
}

/** Map a thrown fetch or body-read failure to its `WebError`. */
function transportError(label: string, what: string, error: unknown): WebError {
  if (isAbortError(error)) return new WebError(`${label} search aborted`, 'WEB_ABORTED', { cause: error })
  return new WebError(`${label} ${what}: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
}

/**
 * Find the provider's error text in a parsed error body. Providers nest it
 * differently: `error`, `error.message`, `error.detail`, `message`, `detail`,
 * or `detail.error`.
 * @param body - the parsed error body.
 * @returns the first non-empty text, if any.
 */
export function errorDetail(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const record = body as Record<string, unknown>
  for (const key of ['error', 'message', 'detail']) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
    if (typeof value === 'object' && value !== null) {
      const nested = value as Record<string, unknown>
      for (const inner of ['message', 'detail', 'error']) {
        const text = nested[inner]
        if (typeof text === 'string' && text.length > 0) return text
      }
    }
  }
  return undefined
}

/** True for a fetch or `AbortSignal` abort. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')
}
