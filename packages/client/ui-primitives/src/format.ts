/**
 * Number and plural formatting that follows the language of the app. Callers
 * pass the `format.locale` tag of their translator, so the decimal mark, the
 * digit grouping and the plural category agree with the copy around them.
 * @module @deepseek-ai/dsh-client-ui-primitives/format
 */

/** Tag used when a translator returns something that is not a language tag. */
const FALLBACK_TAG = 'en-US'

/** Number formats by tag and digit range, so a list of rows builds each once. */
const NUMBER_FORMATS = new Map<string, Intl.NumberFormat>()

/** Plural rules by tag. */
const PLURAL_RULES = new Map<string, Intl.PluralRules>()

/**
 * Accept a language tag.
 * @param candidate - value a translator returned for `format.locale`.
 * @returns the candidate when it is a well-formed tag; US English otherwise, which is what a test translator that echoes keys yields.
 */
export function localeTag(candidate: string): string {
  try {
    return Intl.getCanonicalLocales(candidate).join('')
  } catch {
    // Intl.getCanonicalLocales throws RangeError for a string such as a bare message key; the fallback tag is the intended answer.
    return FALLBACK_TAG
  }
}

/**
 * Format a number with a fixed range of fraction digits.
 * @param tag - language tag from `format.locale`.
 * @param value - the number.
 * @param minimumFractionDigits - fewest digits after the decimal mark.
 * @param maximumFractionDigits - most digits after the decimal mark.
 * @returns the text with the language's decimal mark and digit grouping.
 */
export function formatNumber(
  tag: string,
  value: number,
  minimumFractionDigits = 0,
  maximumFractionDigits = minimumFractionDigits,
): string {
  const resolved = localeTag(tag)
  const key = `${resolved}|${minimumFractionDigits}|${maximumFractionDigits}`
  let format = NUMBER_FORMATS.get(key)
  if (format === undefined) {
    format = new Intl.NumberFormat(resolved, { minimumFractionDigits, maximumFractionDigits })
    NUMBER_FORMATS.set(key, format)
  }
  return format.format(value)
}

/**
 * Name the decimal mark of a language.
 * @param tag - language tag from `format.locale`.
 * @returns the character that separates the integer and fraction digits.
 */
export function decimalMark(tag: string): string {
  return formatNumber(tag, 1.5, 1).replace(/\d/gu, '')
}

/**
 * Pick the dictionary suffix for a count.
 * @param tag - language tag from `format.locale`.
 * @param count - the count a message names.
 * @returns `one` when the language's plural rule puts the count in its singular category;
 *   `other` for every other category, which the dictionaries share.
 */
export function pluralSuffix(tag: string, count: number): 'one' | 'other' {
  const resolved = localeTag(tag)
  let rules = PLURAL_RULES.get(resolved)
  if (rules === undefined) {
    rules = new Intl.PluralRules(resolved)
    PLURAL_RULES.set(resolved, rules)
  }
  return rules.select(count) === 'one' ? 'one' : 'other'
}
