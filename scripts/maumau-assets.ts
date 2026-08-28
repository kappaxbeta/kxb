/**
 * Build the card game's art into `packages/maumau/assets/`, then `public/maumau/`.
 *
 * ---------------------------------------------------------------------------
 * Two packs, one grid
 * ---------------------------------------------------------------------------
 * `scripts/boxing-assets.ts` builds two sprite atlases out of dozens of loose
 * animation strips, and has to, because those packs ship combined sheets with
 * no statement anywhere of which row is which move - so reading one means
 * guessing an order and finding out as a boxer who hooks when you press block.
 *
 * This script has one of each problem:
 *
 * **KayKit** ships fifty-two card faces and seven backs as separate 552x752
 * PNGs and no sheet at all, so the sheet is built here - which means the layout
 * is true by construction rather than by inspection.
 *
 * **Kenney** ships a tilesheet already, and it is used verbatim, because its
 * grid turned out to be exactly the one this project wants. That was *found*
 * and not assumed: `--measure` hashes every cell of it against the pack's own
 * separately-named PNGs and reports any card that is not where
 * `packages/maumau/src/art/deck.ts` says it is.
 *
 * The two sheets are built to the same grid on purpose - rows are the four
 * suits, columns are `A`, `2`…`10`, `J`, `Q`, `K` - which is what lets `cellOf`
 * take no finish argument at all.
 *
 *   bun run maumau:assets              # build both, then publish
 *   bun run maumau:publish             # publish only - no source packs needed
 *   bun run scripts/maumau-assets.ts --measure
 *
 * ---------------------------------------------------------------------------
 * `--publish` runs as part of `bun run build`, and has to
 * ---------------------------------------------------------------------------
 * The same argument the boxing script makes and the same consequence:
 * `public/maumau/` is a build output and is git-ignored, the package's
 * `assets/` is the source, and a fresh checkout or a Docker image has no art at
 * all until something copies it. Without the publish step the game ships as a
 * working table that draws fifty-two blank rectangles.
 */

import { mkdir, copyFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import sharp from 'sharp'

import { COLUMNS, KAYKIT, PIXEL, cellOf, type Finish } from '../packages/maumau/src/art/deck'
import { SUITS, deckOf } from '../packages/maumau/src/rules/cards'

/** Where the art lives: in the package, beside the code that describes it. */
const PACKAGE = join(process.cwd(), 'packages', 'maumau', 'assets')

/** ...and where this app serves it from. A build output; see the header. */
const OUT = join(process.cwd(), 'public', 'maumau')

const argOf = (flag: string) => {
  const at = process.argv.indexOf(flag)
  return at === -1 ? null : (process.argv[at + 1] ?? null)
}

/**
 * The two source packs.
 *
 * Both overridable, because both folder names carry a version number: pinning
 * those here would make this script stop working on the next update rather than
 * on a re-download.
 */
const KAYKIT_PACK =
  argOf('--kaykit') ??
  join(
    homedir(),
    'Downloads',
    'The Complete KayKit Collection v5 2',
    'KayKit Board Game Bits 1.0',
    'Textures',
    'PlayingCards',
  )

const KENNEY_PACK =
  argOf('--kenney') ??
  join(
    homedir(),
    'Downloads',
    'Kenney Game Assets All-in-1 3.5.0',
    '2D assets',
    'Playing Cards Pack',
  )

/**
 * Kenney's sheet, packed.
 *
 * `_packed` and not the plain one: the unpacked sheet has a pixel of gutter
 * between cells (909x259 rather than 896x256), and a gutter is a fractional
 * offset in every `background-position` this game computes.
 */
const KENNEY_SHEET = join(KENNEY_PACK, 'Tilesheet', 'cardsLarge_tilemap_packed.png')

/** How KayKit spells a rank in a filename. */
const KAYKIT_RANK: Record<string, string> = {
  A: 'ace',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
  '10': 'ten',
  J: 'jack',
  Q: 'queen',
  K: 'king',
}

/**
 * Which back, out of the seven the pack ships.
 *
 * `D` because it is the one that reads as a back at 88 pixels rather than as a
 * pattern - the others are finer, and a face-down card is a shape somebody has
 * to recognise across a table without looking at it.
 */
const KAYKIT_BACK = 'cardback_D'

/**
 * Build KayKit's fifty-two faces and one back into one sheet.
 *
 * Composited at `Finish.cell` rather than at the source's 552x752, which is the
 * only real decision in here. A card is drawn at 76-88 CSS pixels, so a third
 * of the source covers a 2x screen exactly and the sheet is a fifth of the size
 * it would otherwise be. Going smaller is visible; going larger is a megabyte
 * nobody can see.
 */
async function buildKayKit(finish: Finish): Promise<void> {
  const faces = join(KAYKIT_PACK, 'Standard52')
  if (!existsSync(faces)) {
    console.error(`no KayKit pack at ${faces}\n  pass --kaykit <folder> if it lives somewhere else`)
    process.exit(1)
  }

  const { cell, grid } = finish
  const tiles: { input: Buffer; left: number; top: number }[] = []

  for (const [row, suit] of SUITS.entries()) {
    for (const [column, rank] of COLUMNS.entries()) {
      const file = join(faces, `${suit}_${KAYKIT_RANK[rank]}.png`)
      if (!existsSync(file)) {
        console.error(`missing ${file}`)
        process.exit(1)
      }
      tiles.push({
        input: await sharp(file).resize(cell.width, cell.height, { fit: 'fill' }).png().toBuffer(),
        left: column * cell.width,
        top: row * cell.height,
      })
    }
  }

  const back = join(KAYKIT_PACK, 'Extras', `${KAYKIT_BACK}.png`)
  tiles.push({
    input: await sharp(back).resize(cell.width, cell.height, { fit: 'fill' }).png().toBuffer(),
    left: finish.back.column * cell.width,
    top: finish.back.row * cell.height,
  })

  await sharp({
    create: {
      width: grid.columns * cell.width,
      height: grid.rows * cell.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(tiles)
    /**
     * Palette-quantised, and it is the difference between a sheet somebody
     * downloads and one they wait for.
     *
     * These are flat vector-drawn cards with a few dozen colours in them, so
     * 256 is not a compromise - a truecolour PNG of the same image is four
     * times the bytes and identical on screen.
     */
    .png({ palette: true, quality: 90, effort: 9 })
    .toFile(join(PACKAGE, finish.sheet))

  const size = (await sharp(join(PACKAGE, finish.sheet)).metadata()).size ?? 0
  console.log(
    `${finish.sheet}  ${grid.columns * cell.width}x${grid.rows * cell.height}  ${Math.round(size / 1024)}KB`,
  )
}
/**
 * Copy Kenney's sheet across as it comes, refusing one that is not our grid.
 *
 * No compositing: its tilesheet is already fourteen by four in the order
 * `deck.ts` wants. What this does instead is *check* - the same guard the
 * boxing script puts on frame counts, because a pack that changed shape
 * produces a game that deals the wrong cards, silently, and it looks like a
 * rules bug rather than a pack update.
 */
async function buildKenney(finish: Finish): Promise<void> {
  if (!existsSync(KENNEY_SHEET)) {
    console.error(`no Kenney pack at ${KENNEY_SHEET}\n  pass --kenney <folder> if it is elsewhere`)
    process.exit(1)
  }

  const meta = await sharp(KENNEY_SHEET).metadata()
  const columns = (meta.width ?? 0) / finish.cell.width
  const rows = (meta.height ?? 0) / finish.cell.height

  if (columns !== finish.grid.columns || rows !== finish.grid.rows) {
    console.error(
      `that sheet is ${columns}x${rows} cells; deck.ts says ${finish.grid.columns}x${finish.grid.rows}.\n` +
        '  re-run with --measure and update packages/maumau/src/art/deck.ts',
    )
    process.exit(1)
  }

  await copyFile(KENNEY_SHEET, join(PACKAGE, finish.sheet))
  console.log(`${finish.sheet}  ${meta.width}x${meta.height}  (${columns}x${rows} cells)`)
}

/** Both licences travel with the pixels. Both packs are CC0, and both still ship. */
async function licences(): Promise<void> {
  for (const [from, to] of [
    [join(KAYKIT_PACK, '..', '..', '..', 'License.txt'), 'LICENSE-kaykit.txt'],
    [join(KENNEY_PACK, 'License.txt'), 'LICENSE-kenney.txt'],
  ] as const) {
    if (existsSync(from)) {
      await copyFile(from, join(PACKAGE, to))
      console.log(to)
    }
  }
}

/**
 * Prove - or disprove - the layout in `deck.ts`, from the packs themselves.
 *
 * For Kenney this is the real check, and it is how the layout was found in the
 * first place: hash every cell of the shipped tilesheet, hash every named card
 * PNG, and report any card that is not where `cellOf` says it is. It is not a
 * listing - it is an assertion with output.
 *
 * For KayKit it reports the source size and the margin instead, which is how
 * the atlas cell was chosen and how we know `ink` is the whole frame.
 */
async function measure(): Promise<void> {
  const hashOf = (bytes: Uint8Array | Buffer) => {
    let hash = 0
    for (let at = 0; at < bytes.length; at++) hash = (hash * 31 + bytes[at]!) >>> 0
    return hash
  }

  const sheet = await sharp(KENNEY_SHEET).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width } = sheet.info
  const cells = new Map<number, { column: number; row: number }>()
  for (let row = 0; row < PIXEL.grid.rows; row++) {
    for (let column = 0; column < PIXEL.grid.columns; column++) {
      const bytes = Buffer.alloc(PIXEL.cell.width * PIXEL.cell.height * 4)
      for (let y = 0; y < PIXEL.cell.height; y++) {
        const from = ((row * PIXEL.cell.height + y) * width + column * PIXEL.cell.width) * 4
        sheet.data.copy(bytes, y * PIXEL.cell.width * 4, from, from + PIXEL.cell.width * 4)
      }
      cells.set(hashOf(bytes), { column, row })
    }
  }

  const singles = join(KENNEY_PACK, 'PNG', 'Cards (large)')
  const named = new Map<string, { column: number; row: number }>()
  for (const file of (await readdir(singles)).filter((name) => name.endsWith('.png'))) {
    const bytes = await sharp(join(singles, file)).ensureAlpha().raw().toBuffer()
    const at = cells.get(hashOf(bytes))
    if (at) named.set(basename(file, '.png'), at)
  }

  console.log(
    `\nKenney  ${PIXEL.grid.columns}x${PIXEL.grid.rows} cells of ${PIXEL.cell.width}x${PIXEL.cell.height}`,
  )
  console.log(
    `        ink ${await inkOf(join(singles, 'card_hearts_A.png'))}   ` +
      `(deck.ts says ${PIXEL.ink.x},${PIXEL.ink.y},${PIXEL.ink.width},${PIXEL.ink.height})`,
  )

  let wrong = 0
  for (const card of deckOf('full')) {
    const suit = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }[card[0]!]!
    // The pack zero-pads the numbers - `card_hearts_02` - and leaves the court
    // cards and the ace as single letters.
    const rank = card.slice(1)
    const file = `card_${suit}_${/^\d+$/.test(rank) ? rank.padStart(2, '0') : rank}`
    const found = named.get(file)
    const claimed = cellOf(card)
    if (!found || !claimed || found.column !== claimed.column || found.row !== claimed.row) {
      console.log(
        `  ${card} (${file}) sheet says ${found ? `${found.column},${found.row}` : '?'}, ` +
          `deck.ts says ${claimed ? `${claimed.column},${claimed.row}` : '?'}`,
      )
      wrong += 1
    }
  }
  console.log(wrong === 0 ? '        layout agrees with deck.ts' : `        ${wrong} cards disagree`)
  for (const extra of ['card_back', 'card_empty', 'card_joker_red', 'card_joker_black']) {
    const at = named.get(extra)
    if (at) console.log(`        ${extra} -> ${at.column},${at.row}`)
  }

  const faces = join(KAYKIT_PACK, 'Standard52')
  if (existsSync(faces)) {
    const source = await sharp(join(faces, 'hearts_ace.png')).metadata()
    console.log(
      `\nKayKit  source ${source.width}x${source.height}, atlassed at ${KAYKIT.cell.width}x${KAYKIT.cell.height}`,
    )
    const inks = new Set<string>()
    for (const file of (await readdir(faces)).filter((name) => name.endsWith('.png'))) {
      inks.add(await inkOf(join(faces, file)))
    }
    console.log(`        ink ${[...inks].join(' | ')}  (source frame; the atlas cell is filled)`)
    if (inks.size !== 1) console.log('        ^ more than one - the art does not fill its frame')
    const missing = SUITS.flatMap((suit) =>
      COLUMNS.filter((rank) => !existsSync(join(faces, `${suit}_${KAYKIT_RANK[rank]}.png`))).map(
        (rank) => `${suit}_${rank}`,
      ),
    )
    console.log(missing.length === 0 ? '        all 52 faces present' : `        missing ${missing.join(', ')}`)
  }
}

/** The rectangle the drawn pixels occupy inside a file, by walking the alpha. */
async function inkOf(file: string): Promise<string> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let left = info.width
  let top = info.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3]! <= 8) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  return `${left},${top},${right - left + 1},${bottom - top + 1}`
}

/**
 * Copy the package's `assets/` into `public/` so this app can serve them.
 *
 * The same recursive copy the boxing script has, for the same reason: the
 * package decides what it ships and a hand-kept list here is a file that goes
 * missing in production the first time somebody adds one.
 */
async function publish(from: string, to: string): Promise<number> {
  await mkdir(to, { recursive: true })
  let count = 0
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const source = join(from, entry.name)
    const target = join(to, entry.name)
    if (entry.isDirectory()) count += await publish(source, target)
    else {
      await copyFile(source, target)
      count += 1
    }
  }
  return count
}

await mkdir(PACKAGE, { recursive: true })

if (process.argv.includes('--measure')) {
  await measure()
} else if (process.argv.includes('--publish')) {
  // The half that runs without the source pack, so a checkout that has never
  // seen `~/Downloads` can still serve the game.
  console.log(`${await publish(PACKAGE, OUT)} files -> ${OUT}`)
} else {
  await buildKayKit(KAYKIT)
  await buildKenney(PIXEL)
  await licences()
  console.log(`${await publish(PACKAGE, OUT)} files -> ${OUT}`)
}
