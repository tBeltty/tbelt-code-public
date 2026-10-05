import { TBELT_LOGO_DATA_URI } from './brand-logo.ts'
import type { IconProps } from './icons/props.ts'

/**
 * The single canonical product name. Every brand-mark, wordmark, and
 * user-visible copy string that names the product reads this constant
 * instead of repeating the literal, so a future rename touches one place.
 */
export const PRODUCT_NAME = 'tBelt Code'

/**
 * Edge length of {@link FishLogo}'s square viewBox, in user units at the
 * component's own base scale (matches {@link IconProps.size}'s default of 24).
 */
export const BRAND_MARK_BOX = 24

/** The monogram the tBelt logo draws, used as the mark's accessible name in tests and fallbacks. */
export const BRAND_MARK_MONOGRAM = 'TB'

/**
 * The mark's artwork in viewBox user units, shared by {@link FishLogo} and the
 * wordmark so both draw the identical mark: the tBelt logo image with the
 * soft blue glow tBelt AI gives it.
 * @returns the logo image element.
 */
export function BrandMarkArt() {
  return (
    <image
      href={TBELT_LOGO_DATA_URI}
      x={0}
      y={0}
      width={BRAND_MARK_BOX}
      height={BRAND_MARK_BOX}
      preserveAspectRatio="xMidYMid meet"
      style={{ filter: 'drop-shadow(0 0 1.5px rgba(0, 122, 205, 0.45))' }}
    >
      <title>{BRAND_MARK_MONOGRAM}</title>
    </image>
  )
}

/**
 * Render the tBelt Code brand mark: the tBelt logo (cyan TB monogram inside a
 * chrome ring).
 * @param props.size - width and height in px (default 24; the mark is square).
 * @param props.className - extra class for layout placement.
 * @returns the mark svg (aria-hidden decorative brand art).
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox={`0 0 ${BRAND_MARK_BOX} ${BRAND_MARK_BOX}`}
      fill="none"
      aria-hidden="true"
    >
      <BrandMarkArt />
    </svg>
  )
}
