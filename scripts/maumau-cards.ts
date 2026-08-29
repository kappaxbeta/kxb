#!/usr/bin/env bun
/**
 * Draw the third deck - the one this project owns.
 *
 * ---------------------------------------------------------------------------
 * Why draw a deck instead of atlasing one
 * ---------------------------------------------------------------------------
 * `scripts/maumau-assets.ts` builds the other two, and both start from a
 * download: KayKit's board game bits and Kenney's playing cards. That is the
 * right way round for art somebody drew - see the note there about measuring
 * rather than guessing a layout.
 *
 * A deck of cards is the one thing on the table that does not need drawing by
 * hand. It is fifty-two arrangements of four symbols and thirteen labels, it
 * has been in the public domain for six centuries, and it is a layout problem
 * rather than an illustration problem. So this one is generated, which means it
 * costs no download, it is ours to change, and it is the finish a deployment
 * with no packs on disk can still deal a hand with.
 *
 * ---------------------------------------------------------------------------
 * Rendered from HTML, which is the point
 * ---------------------------------------------------------------------------
 * The pips sit in the classical arrangement - two in a column, three with one
 * between, seven with the odd one high, ten with four a side and two at the
 * quarters. Writing that as coordinates means solving a layout problem by hand
 * in a language that has no layout; writing it as a grid means CSS does it, and
 * the source then says what the reader already knows a card looks like.
 *
 * The trade is a browser at build time. That is fine here for the same reason
 * it is fine for the thumbnails: the output is committed, so it runs when the
 * deck changes rather than when the app does.
 *
 * ---------------------------------------------------------------------------
 * The grid is not ours to choose
 * ---------------------------------------------------------------------------
 * `packages/maumau/src/art/deck.ts` insists on one arrangement across every
 * finish: rows are the four suits in `SUITS` order, columns are A, then 2 to
 * 10, then J, Q, K - and a fourteenth column holds the back. Match it exactly
 * or `cellOf` addresses the wrong card, which shows up as a hand that plays
 * correctly and reads as nonsense. The constants below are duplicated from that
 * file deliberately: it is the specification, and a generator that imported it
 * could not be run against a different one to compare.
 *
 *   bun run maumau:cards
 *   bun run maumau:cards -- --html   # write the page and stop, to look at it
 */

import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { $ } from 'bun'

// Must match the KXB finish in packages/maumau/src/art/deck.ts.
const CELL = { width: 184, height: 251 }
const GRID = { columns: 14, rows: 4 }
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const

const GLYPH = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' } as const
const RED = new Set(['hearts', 'diamonds'])

/**
 * Where the pips go, as `[row, column]` on a 13-row, 3-column grid.
 *
 * A finer grid than it looks like it needs, and that is the whole trick. The
 * classical arrangements do not share a row count: a seven puts its odd pip
 * halfway between the top pair and the middle pair, a nine wants four evenly
 * spaced rows a side, and a ten wants those four plus two pips at the
 * quarters. Thirteen rows is the smallest lattice all four land on, so one
 * table describes every card instead of four special cases.
 *
 * Row 6 is the centre. Anything below it is drawn upside down, which is the
 * detail that makes a fanned hand look like cards rather than clip art.
 */
const CENTRE = 6
const LAST = 12

const PIPS: Record<string, [number, number][]> = {
  '2': [[0, 1], [LAST, 1]],
  '3': [[0, 1], [CENTRE, 1], [LAST, 1]],
  '4': [[0, 0], [0, 2], [LAST, 0], [LAST, 2]],
  '5': [[0, 0], [0, 2], [CENTRE, 1], [LAST, 0], [LAST, 2]],
  '6': [[0, 0], [0, 2], [CENTRE, 0], [CENTRE, 2], [LAST, 0], [LAST, 2]],
  // Six down the sides, and the odd one above centre - never below it.
  '7': [[0, 0], [0, 2], [3, 1], [CENTRE, 0], [CENTRE, 2], [LAST, 0], [LAST, 2]],
  '8': [[0, 0], [0, 2], [3, 1], [CENTRE, 0], [CENTRE, 2], [9, 1], [LAST, 0], [LAST, 2]],
  // Four a side rather than three, which is what separates a nine from a seven
  // at a glance, plus one in the middle.
  '9': [[0, 0], [0, 2], [4, 0], [4, 2], [CENTRE, 1], [8, 0], [8, 2], [LAST, 0], [LAST, 2]],
  // The same four a side, and the two odd pips at the quarters rather than one
  // at the centre. This is the arrangement a ten actually has, and the reason
  // it cannot be written as "a nine plus one".
  '10': [[0, 0], [0, 2], [2, 1], [4, 0], [4, 2], [8, 0], [8, 2], [10, 1], [LAST, 0], [LAST, 2]],
}

/**
 * A generator that draws the wrong number of pips is a bug you find by counting
 * hearts in a screenshot, so it is checked here instead. The first version of
 * this file shipped a ten with eight pips on it.
 */
for (const [rank, spots] of Object.entries(PIPS)) {
  if (spots.length !== Number(rank)) {
    throw new Error(`the ${rank} has ${spots.length} pips`)
  }
  const seen = new Set(spots.map(([r, c]) => `${r},${c}`))
  if (seen.size !== spots.length) throw new Error(`the ${rank} stacks two pips on one spot`)
}

const face = (rank: string, suit: string) => {
  const red = RED.has(suit)
  const g = GLYPH[suit as keyof typeof GLYPH]
  const corner = (extra = '') =>
    `<div class="corner ${extra}"><span class="r">${rank}</span><span class="s">${g}</span></div>`

  let middle: string
  if (rank === 'A') {
    middle = `<div class="ace">${g}</div>`
  } else if (['J', 'Q', 'K'].includes(rank)) {
    // No court figures: drawing a passable king is not something this file can
    // do, and a bad one is worse than none. A letter over a watermark reads as
    // deliberate, and stays legible at the size a card is actually seen.
    middle = `<div class="court"><span class="ghost">${g}</span><span class="letter">${rank}</span></div>`
  } else {
    middle = `<div class="pips">${PIPS[rank]
      .map(
        ([row, column]) =>
          `<span class="pip${row > CENTRE ? ' flip' : ''}" ` +
          `style="grid-row:${row + 1};grid-column:${column + 1}">${g}</span>`,
      )
      .join('')}</div>`
  }

  return `<div class="card ${red ? 'red' : 'black'}">${corner()}${middle}${corner('bl')}</div>`
}

const back = () => `<div class="card back"><div class="weave"></div><div class="badge">kxb</div></div>`

const cells: string[] = []
for (const suit of SUITS) {
  for (const rank of RANKS) cells.push(face(rank, suit))
  cells.push(back())
}

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${CELL.width * GRID.columns}px;
    height: ${CELL.height * GRID.rows}px;
    display: grid;
    grid-template-columns: repeat(${GRID.columns}, ${CELL.width}px);
    grid-auto-rows: ${CELL.height}px;
    background: transparent;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: ${CELL.width}px; height: ${CELL.height}px;
    /* Inset so neighbouring cells cannot bleed into one another when the
       renderer samples a cell with smoothing on. */
    padding: 6px;
    position: relative;
  }
  .card::before {
    content: ""; position: absolute; inset: 6px;
    background: #fbfaf7;
    border-radius: 12px;
    border: 1.5px solid #d9d5cc;
    box-shadow: inset 0 0 0 3px #fff;
  }
  .red  { color: #c8323c; }
  .black { color: #23252f; }

  .corner {
    position: absolute; top: 14px; left: 14px;
    display: flex; flex-direction: column; align-items: center; line-height: 1;
    z-index: 1;
  }
  .corner.bl { top: auto; left: auto; bottom: 14px; right: 14px; transform: rotate(180deg); }
  .corner .r { font-size: 26px; font-weight: 700; letter-spacing: -0.04em; }
  .corner .s { font-size: 18px; margin-top: 2px; }

  /* Inset to clear the corner indices on all four sides. The index is the
     widest at a ten, and the bottom-right one is rotated into the same corner
     the last pip row wants, so both axes are set by that card rather than by
     what looks roomy on a three. */
  .pips {
    position: absolute; inset: 72px 52px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(13, 1fr);
    justify-items: center; align-items: center;
    z-index: 1;
  }
  .pip { font-size: 26px; line-height: 1; }
  .pip.flip { transform: rotate(180deg); }

  .ace { position: absolute; inset: 0; display: grid; place-items: center; font-size: 96px; z-index: 1; }

  .court { position: absolute; inset: 40px 26px; display: grid; place-items: center; z-index: 1; }
  .court .ghost { position: absolute; font-size: 118px; opacity: 0.13; }
  .court .letter { font-size: 62px; font-weight: 700; letter-spacing: -0.05em; }

  /* The back. Indigo and pink are the app's own two, so a face-down card looks
     like it belongs to this product rather than to a stock deck. */
  .back::before { background: #2b2f52; border-color: #1b1e38; box-shadow: inset 0 0 0 3px #3b4070; }
  .weave {
    position: absolute; inset: 16px; border-radius: 7px; z-index: 1;
    background:
      repeating-linear-gradient(45deg,  #ec6fb8 0 3px, transparent 3px 13px),
      repeating-linear-gradient(-45deg, #6f78d8 0 3px, transparent 3px 13px),
      #232746;
    opacity: 0.85;
  }
  .badge {
    position: absolute; inset: 0; z-index: 2; display: grid; place-items: center;
    font-size: 27px; font-weight: 700; letter-spacing: 0.06em; color: #fbfaf7;
    text-shadow: 0 2px 0 rgba(0,0,0,0.45);
  }
</style>
${cells.join('\n')}
`

const OUT_DIR = path.join(process.cwd(), 'packages', 'maumau', 'assets')
const PAGE = path.join(process.cwd(), '.cards.html')
writeFileSync(PAGE, html)

if (process.argv.includes('--html')) {
  console.log(`wrote ${PAGE} — open it to look at the deck`)
  process.exit(0)
}

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(CHROME)) {
  console.error(`No Chrome at ${CHROME}.`)
  console.error('Run with --html and screenshot the page yourself, or edit CHROME above.')
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })
const png = path.join(OUT_DIR, 'cards-kxb.png')

// --hide-scrollbars matters: a scrollbar is fourteen pixels of the last column.
// --default-background-color=00000000 keeps the sheet transparent outside the
// rounded corners, which is what lets a card sit on a table rather than in a
// white box.
await $`${CHROME} --headless --disable-gpu --hide-scrollbars \
  --default-background-color=00000000 \
  --window-size=${CELL.width * GRID.columns},${CELL.height * GRID.rows} \
  --screenshot=${png} ${`file://${PAGE}`}`.quiet()

rmSync(PAGE, { force: true })

const size = Bun.file(png).size
console.log(
  `${GRID.columns}x${GRID.rows} cells of ${CELL.width}x${CELL.height} ` +
    `= ${CELL.width * GRID.columns}x${CELL.height * GRID.rows}`,
)
console.log(`  wrote ${path.relative(process.cwd(), png)}  (${(size / 1024).toFixed(0)} kB)`)
