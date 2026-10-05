/**
 * Resolve the newest tBelt Code installer for each download platform from the
 * electron-builder channel metadata that `apps/desktop/scripts/upload-target.ts`
 * publishes to the update bucket.
 */

/** Download platforms shown on the site, keyed by their public URL segment. */
export const PLATFORMS = {
  windows: { target: 'win-x64', metadataSuffix: '', installerExtension: 'exe' },
  mac: { target: 'mac-arm64', metadataSuffix: '-mac', installerExtension: 'dmg' },
  linux: { target: 'linux-x64', metadataSuffix: '-linux', installerExtension: 'AppImage' },
}

/**
 * Bucket layouts the uploader has used, newest first. Current releases publish
 * `nightly` feeds (plus `latest` for stable versions) under `dsh-desk/feeds/<target>`
 * with absolute binary URLs; older releases kept feeds beside their binaries.
 */
const LAYOUTS = [
  { prefix: 'dsh-desk/feeds', channels: ['latest', 'nightly'] },
  { prefix: '_/harness/desktop/stable', channels: ['latest', 'rc', 'beta', 'alpha'] },
]

/** Seconds the edge caches bucket metadata, so a new release shows up within minutes. */
const METADATA_CACHE_SECONDS = 300

/**
 * Read the top-level fields this site needs from electron-builder metadata.
 * Values may be plain, quoted, or folded (`url: >-` with the value on the next,
 * more indented line), which electron-builder writes for long URLs.
 * @param {string} text - Contents of a channel metadata file such as `nightly-mac.yml`.
 * @returns {{ version: string, url: string, releaseDate: string | null } | null} Parsed fields, or null when the file is not channel metadata.
 */
export function parseChannelMetadata(text) {
  const lines = text.split(/\r?\n/)
  const version = scalarValue(lines, /^version:(.*)$/)
  const url = scalarValue(lines, /^\s*-\s*url:(.*)$/)
  if (version === undefined || url === undefined) return null
  const releaseDate = scalarValue(lines, /^releaseDate:(.*)$/) ?? null
  return { version, url, releaseDate }
}

/**
 * Read the first YAML scalar whose key line matches `pattern`.
 * @param {string[]} lines - Metadata lines.
 * @param {RegExp} pattern - Key line pattern; group 1 captures the text after the colon.
 * @returns {string | undefined} The unquoted value, or undefined when the key is absent or empty.
 */
function scalarValue(lines, pattern) {
  for (let index = 0; index < lines.length; index++) {
    const inline = pattern.exec(lines[index])?.[1]?.trim()
    if (inline === undefined) continue
    // Block scalar indicators put the value on the following, more indented lines.
    if (/^[>|][+-]?$/.test(inline)) {
      // A key inside a sequence item (`  - url:`) is indented to its column after the dash.
      const keyIndent = /^[\s-]*/.exec(lines[index])[0].length
      const block = []
      for (const line of lines.slice(index + 1)) {
        if (line.trim() !== '' && /^\s*/.exec(line)[0].length <= keyIndent) break
        block.push(line.trim())
      }
      const value = block.filter(part => part !== '').join(inline.startsWith('>') ? ' ' : '\n')
      return value === '' ? undefined : value
    }
    const value = inline.replace(/^(['"])(.*)\1$/, '$2')
    return value === '' ? undefined : value
  }
  return undefined
}

/**
 * Order two semantic versions; a prerelease sorts before its release.
 * @param {string} a - First version.
 * @param {string} b - Second version.
 * @returns {number} Negative, zero, or positive like `Array.prototype.sort`.
 */
export function compareVersions(a, b) {
  const [coreA, preA] = splitVersion(a)
  const [coreB, preB] = splitVersion(b)
  for (let index = 0; index < 3; index++) {
    const difference = (coreA[index] ?? 0) - (coreB[index] ?? 0)
    if (difference !== 0) return difference
  }
  if (preA.length === 0 || preB.length === 0) return preB.length - preA.length
  for (let index = 0; index < Math.max(preA.length, preB.length); index++) {
    if (preA[index] === undefined) return -1
    if (preB[index] === undefined) return 1
    const numberA = Number(preA[index])
    const numberB = Number(preB[index])
    const numeric = Number.isInteger(numberA) && Number.isInteger(numberB)
    const difference = numeric ? numberA - numberB : preA[index].localeCompare(preB[index])
    if (difference !== 0) return difference
  }
  return 0
}

/**
 * Fetch one bucket object through the edge cache.
 * @param {string} url - Object URL.
 * @param {string} [method] - HTTP method.
 * @returns {Promise<Response | null>} The response, or null when the bucket could not be reached.
 */
async function fetchCached(url, method = 'GET') {
  try {
    return await fetch(url, { method, cf: { cacheTtl: METADATA_CACHE_SECONDS, cacheEverything: true } })
  }
  catch (error) {
    console.error(`releases: ${method} ${url}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function splitVersion(version) {
  const [core, ...pre] = version.split('+')[0].split('-')
  return [core.split('.').map(Number), pre.length === 0 ? [] : pre.join('-').split('.')]
}

/**
 * Find the newest published installer for one platform.
 * @param {string} origin - Public HTTPS origin of the update bucket.
 * @param {keyof typeof PLATFORMS} platform - Download platform.
 * @returns {Promise<{ platform: string, version: string, url: string, filename: string, size: number | null, releaseDate: string | null } | null>} The installer, or null when none is published.
 */
export async function resolveRelease(origin, platform) {
  const config = PLATFORMS[platform]
  if (config === undefined) return null
  const base = origin.replace(/\/+$/, '')
  const feeds = LAYOUTS.flatMap(layout => layout.channels.map(channel =>
    ({ folder: `${base}/${layout.prefix}/${config.target}`, channel })))
  const candidates = await Promise.all(feeds.map(async ({ folder, channel }) => {
    const response = await fetchCached(`${folder}/${channel}${config.metadataSuffix}.yml`)
    if (response === null || !response.ok) return null
    const metadata = parseChannelMetadata(await response.text())
    return metadata === null ? null : { ...metadata, folder }
  }))
  const newest = candidates
    .filter(candidate => candidate !== null)
    .sort((a, b) => compareVersions(b.version, a.version))[0]
  if (newest === undefined) return null

  // Current feeds hold absolute binary URLs; older ones name a file beside the feed.
  const absolute = /^https:\/\//.test(newest.url)
  const binaryFolder = absolute ? newest.url.slice(0, newest.url.lastIndexOf('/')) : newest.folder
  // macOS metadata points at the updater zip; the site offers the disk image beside it.
  const filename = decodeURIComponent(newest.url.slice(newest.url.lastIndexOf('/') + 1))
    .replace(/\.[^.]+$/, `.${config.installerExtension}`)
  const url = `${binaryFolder}/${encodeURIComponent(filename)}`
  const head = await fetchCached(url, 'HEAD')
  if (head === null || !head.ok) return null
  const length = Number(head.headers.get('content-length'))
  return {
    platform,
    version: newest.version,
    url,
    filename,
    size: Number.isFinite(length) && length > 0 ? length : null,
    releaseDate: newest.releaseDate,
  }
}
