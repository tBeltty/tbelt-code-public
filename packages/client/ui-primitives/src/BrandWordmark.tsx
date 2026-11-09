import type { IconProps } from './icons/props.ts'
import { BRAND_MARK_BOX, BrandMarkArt, PRODUCT_NAME } from './FishLogo.tsx'

/** Display options for the official brand wordmark. */
export interface BrandWordmarkProps extends IconProps {
  /** Whether to include the leading logo mark; defaults to true. */
  includeMark?: boolean | undefined
}

/** The wordmark's two words: the tBelt name in ink, the product word in the accent, as tBelt AI writes its own name. */
const [WORDMARK_BRAND, ...WORDMARK_REST] = PRODUCT_NAME.split(' ')
const WORDMARK_PRODUCT = WORDMARK_REST.join(' ')

/** Gap between the mark and the wordmark text, in viewBox user units. */
const MARK_GAP = 8

/** Width reserved for the wordmark text, in viewBox user units. */
const TEXT_WIDTH = 160

/**
 * Render the full brand wordmark: the tBelt logo mark followed by the
 * wordmark text in the product's own casing (`tBelt Code`).
 * @param props.size - height in px (default 24; width follows the selected artwork).
 * @param props.className - extra class for layout placement.
 * @param props.includeMark - whether to include the leading logo mark.
 * @returns the wordmark svg (aria-hidden decorative brand art).
 */
export function BrandWordmark({ size = 24, className, includeMark = true }: BrandWordmarkProps) {
  const width = includeMark ? BRAND_MARK_BOX + MARK_GAP + TEXT_WIDTH : TEXT_WIDTH
  const viewBox = includeMark
    ? `0 0 ${width} ${BRAND_MARK_BOX}`
    : `${BRAND_MARK_BOX + MARK_GAP} 0 ${TEXT_WIDTH} ${BRAND_MARK_BOX}`
  const textX = BRAND_MARK_BOX + MARK_GAP
  return (
    <svg
      width={(size * width) / BRAND_MARK_BOX}
      height={size}
      className={className}
      viewBox={viewBox}
      fill="none"
      aria-hidden="true"
    >
      {includeMark && <BrandMarkArt />}
      <text
        x={textX}
        y={BRAND_MARK_BOX / 2}
        dominantBaseline="central"
        fontFamily="var(--dsw-font-family)"
        fontWeight={700}
        fontSize={15}
        letterSpacing="-0.02em"
        fill="currentColor"
      >
        {WORDMARK_BRAND}
        <tspan fill="var(--dsw-alias-brand-primary)">{` ${WORDMARK_PRODUCT}`}</tspan>
      </text>
    </svg>
  )
}
