/**
 * `@kxb/maumau/art` - which cell of which sheet draws which card.
 *
 * ---------------------------------------------------------------------------
 * Two packs, and the rules cannot tell them apart
 * ---------------------------------------------------------------------------
 * The same arrangement `@kxb/boxing/art` arrives at with its two fighters, from
 * the opposite direction. There, two packs that *"agree about nothing"* forced a
 * `Character` type; here the two packs agree about almost everything, and the
 * type exists to stop that being an accident nobody wrote down.
 *
 * | | KayKit | Kenney |
 * |---|---|---|
 * | a card is | 552x752 of drawn card face | 64x64 with the card inside it |
 * | margin | none - the art fills the frame | 11px each side, 2px top |
 * | looks like | a playing card | a playing card in a game from 1993 |
 * | drawn with | smoothing | `pixelated`, or it is a smudge |
 *
 * What they do share is the grid, and that is not luck - it is the one thing
 * this module insists on when it builds an atlas. **Rows are the four suits in
 * `SUITS` order and columns are `A`, then `2`…`10`, then `J`, `Q`, `K`.** So
 * `cellOf` is written once and neither finish appears in it.
 *
 * ---------------------------------------------------------------------------
 * A finish is not a rule, and is deliberately not in `House`
 * ---------------------------------------------------------------------------
 * `../rules/house.ts` is pinned by the authority and refused if a second player
 * disagrees, because a table has to be playing one game. A finish is the
 * opposite: it changes nothing anybody can be refused for, and two players
 * looking at two different card backs are still playing the same hand. It
 * arrives as a prop, from the document, and the arbiter never hears about it.
 *
 * ---------------------------------------------------------------------------
 * Every number below was measured, not chosen
 * ---------------------------------------------------------------------------
 * `scripts/maumau-assets.ts --measure` derives them from the source packs and
 * checks them against this file. Kenney's layout was found by hashing every
 * cell of its shipped tilesheet against its own separately-named PNGs; the
 * KayKit sheet is one this project builds, so its layout is true by
 * construction and the margin is zero because the art fills its frame.
 *
 * This file holds no pixels and imports no image. `cellOf` returns *which
 * cell*; the host turns that into a background position against a URL it
 * decided - the same line the boxing art draws.
 */

import { LONG_RANKS, SUITS, rankOf, suitOf, type Card } from '../rules/cards'

export interface Cell {
  column: number
  row: number
}

/** Which deck art. See the header for why this is not a house rule. */
export const FINISHES = ['kaykit', 'pixel'] as const
export type FinishId = (typeof FINISHES)[number]

export interface Finish {
  id: FinishId
  label: string
  /** The file this package ships. Joined with the host's asset base. */
  sheet: string
  /** One cell of the sheet, in pixels. */
  cell: { width: number; height: number }
  /** How many cells across and down. */
  grid: { columns: number; rows: number }
  /**
   * The drawn card inside its cell.
   *
   * Zero-offset and full-size for a pack whose art fills the frame; a real
   * inset for one that centres a small card in a square. The renderer never
   * knows which - it asks for a card at a width and gets a style.
   */
  ink: { x: number; y: number; width: number; height: number }
  /** The face-down card. */
  back: Cell
  /** Whether to draw it with smoothing off. True only for the pixel pack. */
  pixelated: boolean
}

/**
 * KayKit's *Board Game Bits*, atlased by `scripts/maumau-assets.ts`.
 *
 * The default, and it should be: these are drawn playing cards at 552x752, and
 * a card game is a game where the cards are the entire picture. The atlas is
 * built at a third of that - large enough that a card drawn at 88 CSS pixels is
 * still sharp on a 2x screen, and small enough that the sheet is one download
 * rather than fifty-two.
 *
 * The back is column 13 of row 0, which is a place this project put it: the
 * pack ships seven backs as separate files and no sheet at all.
 */
export const KAYKIT: Finish = {
  id: 'kaykit',
  label: 'KayKit',
  sheet: 'cards-kaykit.png',
  cell: { width: 184, height: 251 },
  grid: { columns: 14, rows: 4 },
  ink: { x: 0, y: 0, width: 184, height: 251 },
  back: { column: 13, row: 0 },
  pixelated: false,
}

/**
 * Kenney's *Playing Cards Pack*, exactly as it ships.
 *
 * Kept, rather than replaced, and for a reason beyond having built it first:
 * this project's other framed game is pixel art, and a table that can be drawn
 * in the same register as the boxing ring is worth the twenty lines it costs.
 *
 * Its tilesheet is used verbatim - it is already a grid in the order this
 * module wants, which is a nice result and not one that could be assumed. The
 * ink box is the measured one: the drawn card is 42x60 inside a 64x64 cell,
 * identically on all fifty-six, and a renderer that drew the whole cell would
 * fan a hand with eleven pixels of nothing between every card.
 */
export const PIXEL: Finish = {
  id: 'pixel',
  label: 'Kenney',
  sheet: 'cards-pixel.png',
  cell: { width: 64, height: 64 },
  grid: { columns: 14, rows: 4 },
  ink: { x: 11, y: 2, width: 42, height: 60 },
  back: { column: 13, row: 1 },
  pixelated: true,
}

export const FINISH: Record<FinishId, Finish> = { kaykit: KAYKIT, pixel: PIXEL }

/** The default, and what an unrecognised name falls back to. */
export const finishOf = (id: unknown): Finish =>
  typeof id === 'string' && (FINISHES as readonly string[]).includes(id)
    ? FINISH[id as FinishId]
    : KAYKIT

/** A card's aspect, width over height, in this finish. */
export const shapeOf = (finish: Finish) => finish.ink.width / finish.ink.height

/**
 * Where a rank sits along a row.
 *
 * Aces first, which is the order Kenney's sheet happened to be in and which
 * this project's own atlas builder then adopted, so that one table serves both.
 * Derived from `LONG_RANKS` rather than written out, so the short pack and the
 * full one index the same sheet without a second list.
 */
const COLUMN_OF: Record<string, number> = { A: 0, J: 10, Q: 11, K: 12 }
for (const rank of LONG_RANKS) {
  if (!(rank in COLUMN_OF)) COLUMN_OF[rank] = Number(rank) - 1
}

/** The column order, for the atlas builder. Aces first; see `COLUMN_OF`. */
export const COLUMNS: readonly string[] = [
  'A',
  ...LONG_RANKS.filter((rank) => rank !== 'A' && !'JQK'.includes(rank)),
  'J',
  'Q',
  'K',
]

/**
 * Which cell draws this card, or `null` if it is not one.
 *
 * No finish argument, and that is the payoff of insisting both sheets share a
 * grid: a card is at the same place in both, so a table that switches packs
 * mid-hand would draw the same cards.
 */
export function cellOf(card: Card): Cell | null {
  const suit = suitOf(card)
  const rank = rankOf(card)
  if (!suit || !rank) return null
  const column = COLUMN_OF[rank]
  if (column === undefined) return null
  return { column, row: SUITS.indexOf(suit) }
}

/**
 * A whole `background` for one card, at a width in CSS pixels.
 *
 * A style object rather than a class, because the size is a *layout* decision -
 * a fanned hand on a phone and the pile in the middle of the table are the same
 * sheet at two scales - and a package cannot know either of them.
 *
 * The margin is subtracted here rather than by the caller, which is the one
 * arithmetic mistake this module exists to prevent: a background position of
 * `-column * cell` puts the whole cell in the box, so a Kenney card is drawn
 * eleven pixels right of where it should be and cropped down the left.
 */
export function faceOf(card: Card | null | undefined, finish: Finish, url: string, width: number) {
  const cell = (card ? cellOf(card) : null) ?? finish.back
  const scale = width / finish.ink.width

  return {
    width: `${width}px`,
    height: `${width / shapeOf(finish)}px`,
    backgroundImage: `url(${url}/${finish.sheet})`,
    backgroundSize: `${finish.grid.columns * finish.cell.width * scale}px ${
      finish.grid.rows * finish.cell.height * scale
    }px`,
    backgroundPosition: `${-(cell.column * finish.cell.width + finish.ink.x) * scale}px ${
      -(cell.row * finish.cell.height + finish.ink.y) * scale
    }px`,
    backgroundRepeat: 'no-repeat',
    /**
     * Smoothing off for the pixel pack and on for the other.
     *
     * Not a preference either way. A 64px sprite scaled up with smoothing is a
     * smudge, and a 184px card face scaled *down* without it is a set of jagged
     * pips - the two packs need opposite treatment, which is why this is a
     * field on the finish rather than a constant in this function.
     */
    imageRendering: (finish.pixelated ? 'pixelated' : 'auto') as 'pixelated' | 'auto',
  }
}

/** The back of a card, for a hand nobody may see and for the draw pile. */
export const backOf = (finish: Finish, url: string, width: number) =>
  faceOf(undefined, finish, url, width)
