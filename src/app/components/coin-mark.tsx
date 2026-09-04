/**
 * The coin itself, eight pixels across.
 *
 * ---------------------------------------------------------------------------
 * Why a mark and not a glyph on a price
 * ---------------------------------------------------------------------------
 * `CoinPrice` owns "a number that is a price". This owns the *shape*, because
 * two other places draw a coin without drawing a price: the purse in the rail
 * and the money card on the board both show a balance, which is not something
 * being charged and must not be typeset as if it were. They were bare integers
 * beside a small caps label - a figure with nothing on it saying what it counts
 * - and this is what puts the unit back on them.
 *
 * One file, so there is one coin. The whole argument in `coin-price.tsx` about
 * a reader having to work out what a number means applies at least as hard to a
 * balance, and it only holds if every coin in the product is the same coin.
 *
 * ---------------------------------------------------------------------------
 * Drawn on a grid, on purpose
 * ---------------------------------------------------------------------------
 * The face this app sets numbers in is a pixel face, and the coin next to those
 * numbers used to be a smooth circle with a dot in it - correct at any size and
 * from a different product. So: an octagon on an 8x8 grid, which is how a coin
 * has been drawn in two colours since before anti-aliasing, with `crispEdges`
 * so the rim lands on whole device pixels rather than being softened into a
 * grey ring.
 *
 * `currentColor` throughout, so it dims with whatever it is sitting in - a
 * muted wallet figure, a disabled button - without anybody passing a colour.
 * The hole is a real hole (`evenodd`), not a square of background painted over
 * the middle, because these sit on glass panels and a painted middle would be
 * a lighter square on every one of them.
 */
export function CoinMark({
  /** Edge length in CSS pixels. 8 and 16 are exact; everything else snaps. */
  size = 12,
  /** For a coin that is decoration beside a labelled number - most of them. */
  className = '',
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 8 8"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      {/* The body: an octagon with a two-pixel square punched out of it. One
          path rather than a stack of rects, so the hole is transparent. */}
      <path
        fill="currentColor"
        fillOpacity="0.9"
        fillRule="evenodd"
        d="M2 0 H6 V1 H7 V2 H8 V6 H7 V7 H6 V8 H2 V7 H1 V6 H0 V2 H1 V1 H2 Z
           M3 3 H5 V5 H3 Z"
      />
      {/* And the shine, which is what makes it read as struck metal rather than
          as a ring. Top left because every light in this app comes from there. */}
      <rect x="2" y="1" width="1" height="1" fill="currentColor" />
    </svg>
  )
}
