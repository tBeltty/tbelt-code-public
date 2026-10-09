/**
 * The client tree of the terminal: a Cordis root holding the data-tier client
 * plugins every Remote client needs (Connection, Gateway, Remote proxies, file
 * upload, Session controller, job and workspace controllers), booted from the same `lib/client.js` bundles the
 * browser loads, over an {@link InProcessTransport}. No UI plugin is loaded.
 * @module @deepseek-ai/dsh-terminal-client/client-tree
 */
import { createRequire } from 'node:module'
import { NodeModuleTable } from './module-table.ts'
import type { InProcessTransport } from './carrier.ts'
import type { ClientServicesPort } from './ports.ts'

/** Client plugins of the data tier, in dependency order. */
export const CLIENT_ROSTER: readonly string[] = [
  '@deepseek-ai/dsh-typert-registry',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-api-gateway',
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-client-file-upload',
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-api-job-controller',
  '@deepseek-ai/dsh-api-workspace-controller',
]

/** The Client store every client bundle takes as an external. */
const STORE_SPECIFIER: string = '@deepseek-ai/dsh-client-store'

/** Longest wait for the first connection generation. */
const CONNECT_TIMEOUT_MS = 30_000

/** The Cordis calls the tree uses; the real class comes from `@deepseek-ai/cordis`. */
interface ClientRoot {
  plugin(plugin: unknown): unknown
  get(name: string): unknown
  inject(names: readonly string[], callback: () => void): unknown
  fiber: { dispose(): Promise<void> }
}

/** Page globals the Connection and file-upload plugins read when they apply. */
interface TransportGlobals {
  __DSH_TRANSPORT__?: unknown
  __DSH_FILE_UPLOAD__?: unknown
}

/** A running client tree. */
export interface ClientTree {
  /** The services the terminal uses. */
  readonly services: ClientServicesPort
  /** Stop the plugins and withdraw the transport globals. */
  dispose(): Promise<void>
}

/** What a tree is built from; the defaults are the installed packages. */
export interface ClientTreeSources {
  /** The Cordis module, which the bundles take as an external. */
  readonly cordis: { readonly Context: new () => unknown }
  /** The Client store module, which the bundles take as an external. */
  readonly store: object
  /** Client plugins to mount, in dependency order. */
  readonly roster: readonly string[]
  /**
   * Locate the browser bundle of a plugin.
   * @param specifier - package name of the plugin.
   * @returns the absolute path of its `lib/client.js`.
   */
  bundleFile(specifier: string): string
}

/**
 * Resolve the browser bundle of a client plugin from the installed packages.
 * @param specifier - package name of the plugin.
 * @returns the absolute path of its `lib/client.js`.
 * @throws when the package has no built client bundle, which means the client artifacts were not built.
 */
function installedBundleFile(specifier: string): string {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve(`${specifier}/client`)
  } catch (error) {
    throw new Error(
      `terminal client: cannot find the built client bundle of ${specifier}; run the client build first`,
      { cause: error },
    )
  }
}

/**
 * The installed Cordis, Client store and bundles.
 * @returns the sources of a production tree.
 */
export async function installedSources(): Promise<ClientTreeSources> {
  const [cordis, store] = await Promise.all([
    import('@deepseek-ai/cordis'),
    // A computed specifier keeps the Client program's sources out of this Host program.
    import(STORE_SPECIFIER) as Promise<object>,
  ])
  return { cordis, store, roster: CLIENT_ROSTER, bundleFile: installedBundleFile }
}

/**
 * Wait until the Connection holds its first generation and the Session service exists.
 * @param root - the client root.
 * @returns resolves when connected.
 * @throws when no generation is established within the timeout.
 */
function connected(root: ClientRoot): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`terminal client: no connection to the Host within ${String(CONNECT_TIMEOUT_MS / 1000)} seconds`))
    }, CONNECT_TIMEOUT_MS)
    root.inject(['connection', 'sessions'], () => {
      const connection = root.get('connection') as {
        state: { getSnapshot(): string | undefined; subscribe(listener: () => void): () => void }
      }
      const settle = (): boolean => {
        if (connection.state.getSnapshot() !== 'connected') return false
        clearTimeout(timer)
        resolve()
        return true
      }
      if (!settle()) {
        const unsubscribe = connection.state.subscribe(() => {
          if (settle()) unsubscribe()
        })
      }
    })
  })
}

/**
 * Boot the client tree over an in-process transport.
 * @param transport - the carrier to the Host.
 * @param sources - Cordis, the store and the bundles; {@link installedSources} for a production tree.
 * @returns the running tree once the first connection generation is established.
 */
export async function bootClientTree(
  transport: InProcessTransport,
  sources: ClientTreeSources,
): Promise<ClientTree> {
  const { cordis, store, roster, bundleFile } = sources
  const table = new NodeModuleTable({ '@deepseek-ai/cordis': cordis, '@deepseek-ai/dsh-client-store': store })
  for (const specifier of roster) table.load(bundleFile(specifier))

  const globals = globalThis as TransportGlobals
  const previous = { transport: globals.__DSH_TRANSPORT__, upload: globals.__DSH_FILE_UPLOAD__ }
  globals.__DSH_TRANSPORT__ = transport
  globals.__DSH_FILE_UPLOAD__ = { fetch: transport.fetch }
  const restore = (): void => {
    globals.__DSH_TRANSPORT__ = previous.transport
    globals.__DSH_FILE_UPLOAD__ = previous.upload
  }

  const root = new cordis.Context() as ClientRoot
  try {
    for (const specifier of roster) root.plugin(table.require(specifier))
    await connected(root)
  } catch (error) {
    await root.fiber.dispose()
    restore()
    throw error
  }
  return {
    services: {
      sessions: root.get('sessions') as ClientServicesPort['sessions'],
      remote: root.get('remote') as ClientServicesPort['remote'],
      jobs: root.get('jobs') as ClientServicesPort['jobs'],
      workspaces: root.get('workspaces') as ClientServicesPort['workspaces'],
      fileUpload: root.get('fileUpload') as ClientServicesPort['fileUpload'],
    },
    async dispose() {
      await root.fiber.dispose()
      restore()
    },
  }
}
