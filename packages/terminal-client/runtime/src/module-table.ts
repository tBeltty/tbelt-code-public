/**
 * Module table for browser-format client bundles in a Node process. A client
 * plugin builds to `lib/client.js`, which registers a factory through
 * `window.__ModuleLoader__.load({ id, factory })` instead of exporting ESM.
 * The table evaluates such a file, answers each `require` from the seeded
 * platform modules or from another registered bundle, and runs a factory once.
 * @module @deepseek-ai/dsh-terminal-client/module-table
 */
import { readFileSync } from 'node:fs'
import { runInThisContext } from 'node:vm'

/** The exports object a bundle factory returns: a Cordis plugin module. */
export type BundleExports = Record<string, unknown>

/** The synchronous `require` a bundle factory receives. */
interface BundleRequire {
  (specifier: string): unknown
  async(specifier: string): Promise<unknown>
}

/** One factory registration a bundle submits when it executes. */
interface Registration {
  readonly id: string
  readonly chunk?: string
  readonly factory: (require: BundleRequire) => BundleExports
}

/**
 * The package a specifier names: a bundle requests another plugin as
 * `<package>/client`, and both spellings denote the same registered bundle.
 * @param specifier - module request from a bundle factory.
 * @returns the specifier without a trailing `/client`.
 */
function packageOf(specifier: string): string {
  return specifier.endsWith('/client') ? specifier.slice(0, -'/client'.length) : specifier
}

/** Evaluates client bundles and resolves their module requests. */
export class NodeModuleTable {
  readonly #seed: ReadonlyMap<string, unknown>
  readonly #factories = new Map<string, Registration['factory']>()
  readonly #exports = new Map<string, BundleExports>()
  readonly #materializing = new Set<string>()

  /** @param seed - platform modules a bundle may request, by specifier. */
  constructor(seed: Readonly<Record<string, unknown>>) {
    this.#seed = new Map(Object.entries(seed))
  }

  /**
   * Execute one bundle file so its factory is registered.
   * @param file - absolute path of a `lib/client.js` bundle.
   * @throws when the bundle registers a package twice or does not register any factory.
   */
  load(file: string): void {
    const before = this.#factories.size
    const source = readFileSync(file, 'utf8')
    const wrapper = runInThisContext(`(function (window) {\n${source}\n})`, { filename: file }) as (window: unknown) => void
    wrapper({ __ModuleLoader__: { load: (registration: Registration) => { this.#register(registration, file) } } })
    if (this.#factories.size === before) throw new Error(`terminal client: ${file} registered no client bundle`)
  }

  /**
   * Materialize a registered bundle.
   * @param id - package name of the bundle.
   * @returns the bundle's exports, created on first use.
   * @throws when no bundle registered the package.
   */
  require(id: string): BundleExports {
    return this.#resolve(id) as BundleExports
  }

  #register(registration: Registration, file: string): void {
    if (registration.chunk !== undefined) {
      throw new Error(`terminal client: ${file} loads a package-local chunk, which this module table does not serve`)
    }
    const id = packageOf(registration.id)
    if (this.#factories.has(id)) throw new Error(`terminal client: ${id} was registered twice`)
    this.#factories.set(id, registration.factory)
  }

  #resolve(specifier: string): unknown {
    const id = packageOf(specifier)
    if (this.#seed.has(id)) return this.#seed.get(id)
    const loaded = this.#exports.get(id)
    if (loaded !== undefined) return loaded
    const factory = this.#factories.get(id)
    if (factory === undefined) {
      throw new Error(`terminal client: a client bundle requires "${specifier}", which the module table neither holds nor has loaded`)
    }
    if (this.#materializing.has(id)) throw new Error(`terminal client: ${id} requires itself through a cycle`)
    this.#materializing.add(id)
    try {
      const require: BundleRequire = Object.assign(
        (request: string) => this.#resolve(request),
        { async: (request: string) => Promise.resolve(this.#resolve(request)) },
      )
      const exports = factory(require)
      this.#exports.set(id, exports)
      return exports
    } finally {
      this.#materializing.delete(id)
    }
  }
}
