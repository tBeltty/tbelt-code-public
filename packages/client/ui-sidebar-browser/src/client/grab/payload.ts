/**
 * Element pick payload: its types, budgets, the host-side clamp, and the text a
 * pick becomes in a composer message. The budgets, attribute allow-list, secret
 * patterns, and clamp follow Orca's `browser-grab-types.ts` and
 * `browser-grab-payload.ts` (MIT, see `LICENSES/Orca-MIT.txt`).
 */

/** Per-field size limits, enforced in the guest script and again in {@link clampPick}. */
export const PICK_BUDGET = {
  textSnippetMaxLength: 200,
  nearbyTextEntryMaxLength: 200,
  nearbyTextMaxEntries: 10,
  htmlSnippetMaxLength: 4096,
  ancestorPathMaxEntries: 10,
  selectorMaxLength: 700,
  pathMaxLength: 900,
  cssClassesMaxLength: 500,
} as const

/** Attribute names kept in a pick; `aria-*` attributes are kept too. */
export const PICK_SAFE_ATTRIBUTES: readonly string[] = [
  'id', 'class', 'name', 'type', 'role', 'href', 'src', 'alt', 'title', 'placeholder', 'for', 'action', 'method',
]

/** Substrings that mark an attribute or class value as a credential; such values become `[redacted]`. */
export const PICK_SECRET_PATTERNS: readonly string[] = [
  'access_token', 'auth_token', 'api_key', 'apikey', 'client_secret', 'oauth_state', 'x-amz-',
  'session_id', 'sessionid', 'csrf', 'secret', 'password', 'passwd',
]

/** Computed style properties a pick records. */
export const PICK_STYLE_PROPERTIES: readonly string[] = [
  'display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'backgroundColor',
  'border', 'borderRadius', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'zIndex',
]

/** One element the user pointed at in a page, after the host clamped it. */
export interface ElementPick {
  readonly page: {
    /** Page address without query or fragment. */
    readonly url: string
    readonly title: string
    readonly viewportWidth: number
    readonly viewportHeight: number
  }
  readonly target: {
    readonly tagName: string
    /** CSS selector that identifies the element, as unique as the page allows. */
    readonly selector: string
    /** Short readable ancestor chain ending at the element. */
    readonly elementPath: string
    readonly cssClasses: string
    readonly textSnippet: string
    readonly htmlSnippet: string
    readonly attributes: Readonly<Record<string, string>>
    readonly accessibility: { readonly role: string; readonly accessibleName: string }
    /** Viewport rectangle in CSS pixels. */
    readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
    readonly computedStyles: Readonly<Record<string, string>>
  }
  readonly nearbyText: readonly string[]
  readonly ancestorPath: readonly string[]
}

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'file:'])

const clampText = (value: unknown, max: number): string => {
  const text = typeof value === 'string' ? value : ''
  return text.length <= max ? text : `${text.slice(0, max)} (truncated)`
}

const hasSecret = (value: string): boolean => {
  const lower = value.toLowerCase()
  return PICK_SECRET_PATTERNS.some(pattern => lower.includes(pattern))
}

const safeText = (value: unknown, max: number): string => {
  const text = clampText(value, max)
  return text !== '' && hasSecret(text) ? '[redacted]' : text
}

const finite = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}

function cleanUrl(value: unknown): string {
  if (typeof value !== 'string' || value === '') return ''
  try {
    const url = new URL(value)
    if (url.protocol === 'about:') return url.toString() === 'about:blank' ? 'about:blank' : ''
    if (!SAFE_PROTOCOLS.has(url.protocol)) return ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    // An unparsable address could be a script URL; keeping none is the safe answer.
    return ''
  }
}

function clampAttributes(raw: unknown): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const [key, value] of Object.entries(record(raw))) {
    const name = key.toLowerCase()
    if (!PICK_SAFE_ATTRIBUTES.includes(name) && !name.startsWith('aria-')) continue
    const text = clampText(value, 2000)
    if (hasSecret(text)) attributes[name] = '[redacted]'
    else if (name === 'href' || name === 'src' || name === 'action') attributes[name] = text === '' ? '' : cleanUrl(text)
    else attributes[name] = clampText(value, name === 'class' ? 200 : 500)
  }
  return attributes
}

function clampStyles(raw: unknown): Record<string, string> {
  const source = record(raw)
  return Object.fromEntries(PICK_STYLE_PROPERTIES.map(name => [name, clampText(source[name], 200)]))
}

/**
 * Re-validate a payload that came out of a page, before it reaches the composer.
 * @param raw - the value the guest script returned; any value is accepted.
 * @returns the pick with every field clamped and credential-looking values redacted, or undefined when `page` or `target` is missing.
 */
export function clampPick(raw: unknown): ElementPick | undefined {
  const source = record(raw)
  if (typeof source.page !== 'object' || source.page === null || typeof source.target !== 'object' || source.target === null) return undefined
  const page = record(source.page)
  const target = record(source.target)
  const accessibility = record(target.accessibility)
  const rect = record(target.rect)
  const list = (value: unknown, entries: number, length: number): string[] =>
    (Array.isArray(value) ? value : []).slice(0, entries).map(item => clampText(item, length))
  return {
    page: {
      url: cleanUrl(page.url),
      title: clampText(page.title, 500),
      viewportWidth: finite(page.viewportWidth),
      viewportHeight: finite(page.viewportHeight),
    },
    target: {
      tagName: clampText(target.tagName, 50),
      selector: clampText(target.selector, PICK_BUDGET.selectorMaxLength),
      elementPath: safeText(target.elementPath, PICK_BUDGET.pathMaxLength),
      cssClasses: safeText(target.cssClasses, PICK_BUDGET.cssClassesMaxLength),
      textSnippet: clampText(target.textSnippet, PICK_BUDGET.textSnippetMaxLength),
      htmlSnippet: clampText(target.htmlSnippet, PICK_BUDGET.htmlSnippetMaxLength),
      attributes: clampAttributes(target.attributes),
      accessibility: { role: safeText(accessibility.role, 500), accessibleName: safeText(accessibility.accessibleName, 500) },
      rect: { x: finite(rect.x), y: finite(rect.y), width: finite(rect.width), height: finite(rect.height) },
      computedStyles: clampStyles(target.computedStyles),
    },
    nearbyText: list(source.nearbyText, PICK_BUDGET.nearbyTextMaxEntries, PICK_BUDGET.nearbyTextEntryMaxLength),
    ancestorPath: list(source.ancestorPath, PICK_BUDGET.ancestorPathMaxEntries, 200),
  }
}

/**
 * Format one pick as the text the model receives.
 * @param pick - a clamped pick.
 * @returns labeled lines for the page, the selector, the element's text and attributes, and its HTML, in a fenced block.
 */
export function formatPick(pick: ElementPick): string {
  const { page, target } = pick
  const attributes = Object.entries(target.attributes).map(([name, value]) => `${name}="${value}"`).join(' ')
  const lines = [
    'Browser element:',
    `Page: ${page.title === '' ? page.url : `${page.title} (${page.url})`}`,
    `Element: <${target.tagName}> at ${Math.round(target.rect.x)},${Math.round(target.rect.y)} ${Math.round(target.rect.width)}x${Math.round(target.rect.height)}`,
    `Selector: ${target.selector}`,
    ...target.elementPath === '' ? [] : [`Path: ${target.elementPath}`],
    ...target.textSnippet === '' ? [] : [`Text: ${target.textSnippet}`],
    ...attributes === '' ? [] : [`Attributes: ${attributes}`],
    'HTML:',
    '```html',
    target.htmlSnippet.replace(/```/g, '` ` `'),
    '```',
  ]
  return lines.join('\n')
}

/**
 * Format picks as one message prefix.
 * @param picks - clamped picks in the order the model reads them.
 * @returns the formatted picks separated by blank lines.
 */
export function formatPicks(picks: readonly ElementPick[]): string {
  return picks.map(formatPick).join('\n\n')
}
