/**
 * Verify the surface parity manifest (`docs/product/surface-parity-manifest.yml`).
 * Every user capability names its GUI package and its terminal view, or carries
 * an `exempt` or `pending` entry with a reason; `exempt` also needs an expiry
 * that has not passed and lies at most 90 days ahead. A `presenter` field must
 * name existing `packages/presentation` packages, comma separated. An entry marked
 * `implemented: true` names a terminal view whose module exists in `packages/terminal-client/views/src`.
 * Reads only the manifest and the `packages/client`, `packages/presentation` and terminal view
 * listings, so it is cheap enough for the pre-push hook.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { load as loadYaml } from 'js-yaml'

/** Manifest location relative to the repository root. */
export const MANIFEST_PATH = 'docs/product/surface-parity-manifest.yml'

/** Longest accepted distance between today and an exemption expiry, in days. */
export const MAX_EXEMPTION_DAYS = 90

const TERMINAL_VIEW = /^terminal\/[a-z][a-z0-9-]*$/
const PRESENTER = /^presentation\/([a-z][a-z0-9-]*)$/
const ID = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9.-]*$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

/** One parsed manifest entry; unlisted fields are documentation read by people. */
interface Entry {
  readonly id?: unknown
  readonly presenter?: unknown
  readonly gui?: unknown
  readonly terminal?: unknown
  readonly implemented?: unknown
  readonly reason?: unknown
  readonly expires?: unknown
}

/** Inputs of one verification run. */
export interface ParityInput {
  /** Repository root holding `packages/client`. */
  readonly root: string
  /** Manifest text. */
  readonly manifest: string
  /** Current day as `YYYY-MM-DD`. */
  readonly today: string
}

/** Names of the `ui-*` packages directly under `packages/client`. */
function clientUiPackages(root: string): string[] {
  return readdirSync(join(root, 'packages/client'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('ui-'))
    .map(entry => entry.name)
    .sort()
}

/** Split a `gui` field such as `ui-chat, ui-conversation` into package names. */
function guiPackages(gui: string): string[] {
  return gui.split(',').map(name => name.trim()).filter(name => name.length > 0)
}

/** Whether a non-empty string. */
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

/** Check one `exempt` or `pending` entry's reason and expiry. */
function checkException(id: string, entry: Entry, today: string, errors: string[]): void {
  const state = entry.terminal as string
  if (!isText(entry.reason)) errors.push(`${id}: terminal "${state}" needs a reason`)
  if (state === 'pending') return
  const expires = entry.expires instanceof Date ? entry.expires.toISOString().slice(0, 10) : entry.expires
  if (typeof expires !== 'string' || !DATE.test(expires)) {
    errors.push(`${id}: exempt needs an "expires" date (YYYY-MM-DD)`)
    return
  }
  if (expires < today) {
    errors.push(`${id}: exemption expired on ${expires}; renew it with a new reason or implement the terminal view`)
    return
  }
  const days = Math.round((Date.parse(expires) - Date.parse(today)) / DAY_MS)
  if (days > MAX_EXEMPTION_DAYS) {
    errors.push(`${id}: exemption expires in ${days} days, more than the ${MAX_EXEMPTION_DAYS}-day limit`)
  }
}

/** Check that a `presenter` field names existing `packages/presentation/<name>` packages, comma separated. */
function checkPresenter(id: string, presenter: unknown, root: string, errors: string[]): void {
  const listed = typeof presenter === 'string' ? presenter.split(',').map(item => item.trim()) : []
  if (listed.length === 0 || listed.some(item => PRESENTER.exec(item) === null)) {
    errors.push(`${id}: "presenter" must be presentation/<name>`)
    return
  }
  for (const item of listed) {
    const name = PRESENTER.exec(item)?.[1] as string
    if (!existsSync(join(root, 'packages/presentation', name, 'package.json'))) {
      errors.push(`${id}: presenter presentation/${name} does not exist under packages/presentation`)
    }
  }
}

/** Where terminal views live, relative to the repository root. */
export const TERMINAL_VIEWS_DIR = 'packages/terminal-client/views/src'

/** Check that an `implemented` entry names a terminal view with a module in code. */
function checkImplemented(id: string, entry: Entry, root: string, errors: string[]): void {
  if (entry.implemented === undefined) return
  if (entry.implemented !== true) {
    errors.push(`${id}: "implemented" must be true when present`)
    return
  }
  const terminal = entry.terminal
  if (typeof terminal !== 'string' || !TERMINAL_VIEW.test(terminal)) {
    errors.push(`${id}: only an entry with a terminal/<name> view can be implemented`)
    return
  }
  const view = terminal.slice('terminal/'.length)
  if (!existsSync(join(root, TERMINAL_VIEWS_DIR, `${view}.ts`))) {
    errors.push(`${id}: terminal/${view} is marked implemented but ${TERMINAL_VIEWS_DIR}/${view}.ts does not exist`)
  }
}

/** Return every parity violation of a manifest; an empty list means it passes. */
export function verifySurfaceParity(input: ParityInput): string[] {
  const errors: string[] = []
  const parsed = loadYaml(input.manifest)
  if (!Array.isArray(parsed)) return [`${MANIFEST_PATH}: expected a list of capability entries`]
  const entries = parsed as Entry[]
  const available = new Set(clientUiPackages(input.root))
  const covered = new Set<string>()
  const seen = new Set<string>()

  for (const entry of entries) {
    const id = isText(entry.id) ? entry.id : '(entry without id)'
    if (!isText(entry.id) || !ID.test(entry.id)) {
      errors.push(`${id}: "id" must look like <area>.<capability>`)
      continue
    }
    if (seen.has(id)) errors.push(`${id}: duplicate id`)
    seen.add(id)

    if (!isText(entry.gui)) {
      errors.push(`${id}: "gui" must name ui-* packages or "none"`)
    } else if (entry.gui.trim() !== 'none') {
      for (const name of guiPackages(entry.gui)) {
        covered.add(name)
        if (!available.has(name)) errors.push(`${id}: GUI package ${name} does not exist under packages/client`)
      }
    }

    if (entry.presenter !== undefined) checkPresenter(id, entry.presenter, input.root, errors)

    const terminal = entry.terminal
    if (terminal === 'exempt' || terminal === 'pending') checkException(id, entry, input.today, errors)
    else if (typeof terminal !== 'string' || !TERMINAL_VIEW.test(terminal)) {
      errors.push(`${id}: "terminal" must be terminal/<name>, "exempt" or "pending"`)
    }
    checkImplemented(id, entry, input.root, errors)
  }

  for (const name of available) {
    if (!covered.has(name)) {
      errors.push(`${name}: no manifest entry lists this GUI package; add a capability or extend an existing "gui" field`)
    }
  }
  return errors
}

/** Format a local date as `YYYY-MM-DD`. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename

if (isMain) {
  const root = resolve(import.meta.dirname, '..')
  if (!existsSync(join(root, MANIFEST_PATH))) {
    console.error(`verify-surface-parity: ${MANIFEST_PATH} is missing`)
    process.exit(1)
  }
  const errors = verifySurfaceParity({
    root,
    manifest: readFileSync(join(root, MANIFEST_PATH), 'utf8'),
    today: isoDay(new Date()),
  })
  if (errors.length === 0) {
    console.log('verify-surface-parity: every capability and GUI package has a declared equivalent or a live exemption.')
    process.exit(0)
  }
  console.error(`verify-surface-parity: ${MANIFEST_PATH} violates the parity rules (see docs/cookbook/adding-a-capability.md):`)
  for (const error of errors) console.error(`  ${error}`)
  process.exit(1)
}
