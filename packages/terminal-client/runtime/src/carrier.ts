/**
 * In-process carrier: the client's Remote API calls reach the Host's Connection
 * and Gateway directly, with no socket, port or token. It is the same pair of
 * hooks the worker preview installs, with function calls in place of
 * `postMessage` frames.
 * @module @deepseek-ai/dsh-terminal-client/carrier
 */

/** Origin that request URLs resolve against; the Host fetch handler reads only the path. */
const CARRIER_ORIGIN = 'http://terminal.invalid'

/** The Host half of unary calls: `connection.createSharedFetchHandler('/api')`. */
export interface HostFetchHandler {
  fetch(request: Request): Promise<Response>
}

/** The Host half of streams: `typertGateway.wireStream`. */
export interface HostWireStream {
  readonly open: (
    endpoint: string,
    payload: unknown,
    uplink: AsyncIterable<unknown>,
    peer: undefined,
    signal: AbortSignal,
  ) => Promise<AsyncIterable<unknown>>
  readonly failure: (error: unknown) => {
    readonly code: string
    readonly message: string
    readonly details: object
  }
}

/** What the client's Connection and file-upload services read from the page globals. */
export interface InProcessTransport {
  /** Unary Remote calls and uploads. */
  fetch(input: string | URL, init: RequestInit): Promise<Response>
  /** Decoded Remote streams, with the client's items as `uplink`. */
  openStream(
    endpoint: string,
    payload: unknown,
    signal: AbortSignal,
    uplink?: AsyncIterable<unknown>,
  ): AsyncIterable<unknown>
  /** The process that runs the client also runs the Host, so the privileged surface is reachable. */
  readonly ownsHost: true
}

/**
 * Error carrying a Remote stream failure across independently bundled code.
 * The Gateway client recognizes it by the marker field, not by class.
 */
class CarrierStreamError extends Error {
  readonly dshRemoteStreamFailure: { readonly kind: 'remote'; readonly code: string; readonly details: object }

  constructor(failure: { readonly code: string; readonly message: string; readonly details: object }, options: ErrorOptions) {
    super(failure.message, options)
    this.name = 'CarrierStreamError'
    this.dshRemoteStreamFailure = { kind: 'remote', code: failure.code, details: failure.details }
  }
}

/** An uplink for a stream the client sends nothing on; it ends when the stream is aborted. */
async function* silentUplink(signal: AbortSignal): AsyncGenerator<never> {
  if (!signal.aborted) {
    await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
  }
}

/**
 * Connect a client to the Host in the same process.
 * @param handler - the Host's shared API fetch handler.
 * @param wire - the Host Gateway's stream adapter.
 * @returns hooks for `__DSH_TRANSPORT__` and `__DSH_FILE_UPLOAD__`.
 */
export function createInProcessTransport(handler: HostFetchHandler, wire: HostWireStream): InProcessTransport {
  return {
    fetch: (input, init) => handler.fetch(new Request(new URL(String(input), CARRIER_ORIGIN), init)),
    async *openStream(endpoint, payload, signal, uplink) {
      signal.throwIfAborted()
      try {
        const source = await wire.open(endpoint, payload, uplink ?? silentUplink(signal), undefined, signal)
        for await (const value of source) {
          signal.throwIfAborted()
          yield value
        }
      } catch (error) {
        if (signal.aborted) throw signal.reason
        throw new CarrierStreamError(wire.failure(error), { cause: error })
      }
    },
    ownsHost: true,
  }
}
