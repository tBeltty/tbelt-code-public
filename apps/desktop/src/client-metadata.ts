/** Desktop client identity sent with each mandatory-update policy request. */

/** Build version, active UI language, and UTC offset of the calling Desktop client. */
export interface DesktopClientMetadata {
  /** Installed client build version. */
  readonly version: string
  /** Raw active UI language, such as `es` or `en-US`. */
  readonly locale: string
  /** Whole seconds east of UTC at sampling time. */
  readonly timezoneOffsetSeconds: number
}

/**
 * Read the client build version inlined by the Desktop build.
 * @returns the version embedded in this application build.
 * @throws Error when the build carries no client version, instead of reporting a guessed one.
 */
export function desktopClientVersion(): string {
  const version = process.env.DSH_CLIENT_VERSION
  if (version === undefined || version === '') {
    throw new Error('desktop account: this application build carries no DSH_CLIENT_VERSION')
  }
  return version
}

/**
 * Sample the Desktop client identity for one policy request.
 * @param locale - current resolved Desktop language.
 * @returns this call's build version, the raw active language, and the UTC offset in whole seconds east.
 */
export function desktopClientMetadata(locale: string): DesktopClientMetadata {
  return {
    version: desktopClientVersion(),
    locale,
    // Date.getTimezoneOffset reports minutes west of UTC; Platform wants seconds east.
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  }
}

/**
 * Reduce a UI language to the region-tagged locale the policy service reads.
 * @param locale - active UI language such as `zh-CN`, `zh_TW`, or `en-US`.
 * @returns `zh_CN` for Chinese languages, otherwise `en_US`.
 */
export function policyWireLocale(locale: string): 'zh_CN' | 'en_US' {
  return locale.toLowerCase().split(/[-_]/)[0] === 'zh' ? 'zh_CN' : 'en_US'
}

/**
 * Build the client identity headers for one policy request.
 * @param platform - Desktop operating system, or null for a non-Desktop client.
 * @param client - identity of the calling client for this request.
 * @returns the five client headers; the bundle ID is intentionally empty.
 */
export function policyClientHeaders(platform: 'darwin' | 'win32' | null, client: DesktopClientMetadata): Record<string, string> {
  return {
    'x-client-bundle-id': '',
    'x-client-platform': platform === null ? 'web' : platform === 'win32' ? 'desktop-win' : 'desktop-mac',
    'x-client-version': client.version,
    'x-client-locale': policyWireLocale(client.locale),
    'x-client-timezone-offset': String(client.timezoneOffsetSeconds),
  }
}
