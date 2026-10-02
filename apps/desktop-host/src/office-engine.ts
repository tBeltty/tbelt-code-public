/** Resolve packaged Office engine manifests from their complete, unpacked resource directories. */
import { registerHooks, syncBuiltinESMExports, type ModuleHooks } from 'node:module'
import fs, { realpathSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Locate the archive containing a packaged runtime.
 * @param runtimeDir - Prepared or ASAR-contained runtime directory.
 * @returns Parent archive path, or undefined for a prepared directory.
 */
export function runtimeArchivePath(runtimeDir: string): string | undefined {
  const parent = dirname(runtimeDir)
  return basename(parent) === 'app.asar' ? parent : undefined
}

/**
 * Keep engine executable and resource paths usable by native child processes outside Electron.
 * Hooks apply only to this thread; worker threads must install their own resolver.
 * @param runtimeDir - Prepared or ASAR-contained dsh runtime directory.
 * @returns Installed resolver for the Host lifetime, or undefined for a non-ASAR runtime.
 */
export function installOfficeEngineResolution(runtimeDir: string): ModuleHooks | undefined {
  if (runtimeArchivePath(runtimeDir) === undefined) return undefined
  reportArchiveMissingEntriesAsUndefined()
  const root = realpathSync(runtimeDir)
  const archive = dirname(root)
  const source = pathToFileURL(join(root, 'node_modules', '@deepseek-ai', 'libreoffice-kit-')).href
  const destination = pathToFileURL(join(`${archive}.unpacked`, relative(archive, root), 'node_modules', '@deepseek-ai', 'libreoffice-kit-')).href
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context)
      if (!/^@deepseek-ai\/libreoffice-kit-(?:darwin|win32|linux)-/u.test(specifier)) return resolved
      const canonical = pathToFileURL(realpathSync(fileURLToPath(resolved.url))).href
      if (!canonical.startsWith(source)) {
        if (canonical.startsWith(pathToFileURL(archive + '/').href)) {
          throw new Error(`desktop Office engine resolved outside the runtime package directory: ${resolved.url}`)
        }
        return resolved
      }
      const physical = realpathSync(fileURLToPath(destination + canonical.slice(source.length)))
      return { ...resolved, url: pathToFileURL(physical).href }
    },
  })
}

/**
 * Make `lstatSync` and `statSync` return undefined for a missing ASAR entry when `throwIfNoEntry` is false, as Node does.
 * Electron returns null there, so LibreOfficeKit treats the absent Linux native engine as installed but incomplete instead of selecting WASM.
 */
function reportArchiveMissingEntriesAsUndefined(): void {
  type StatSync = (path: fs.PathLike, options?: fs.StatSyncOptions) => fs.Stats | fs.BigIntStats | undefined
  const writable = fs as { lstatSync: StatSync; statSync: StatSync }
  for (const name of ['lstatSync', 'statSync'] as const) {
    const original = writable[name]
    // Electron's ASAR wrapper returns null where Node's declared result is undefined.
    writable[name] = (path, options) => original(path, options) ?? undefined
  }
  syncBuiltinESMExports()
}
