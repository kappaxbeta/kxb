/**
 * Build the boxing game's own art into `public/boxing/`.
 *
 * ---------------------------------------------------------------------------
 * Why this game brings its own art instead of using the catalogue
 * ---------------------------------------------------------------------------
 * `@kxb/xp/catalogue` is 4,451 models across 38 packs, and it is the allow-list
 * for what an *XP* may place - a set lookup that answers "is this a thing we
 * ship" before a model id becomes a `fetch`. Boxing is not an XP. It is a
 * separate package that integrates the SDK's ports, and it draws two sprite
 * sheets and a voxel ring that nothing else in the app has any use for.
 *
 * Putting them in the catalogue would mean every XP author scrolling past a
 * knocked-down boxer, and it would put this game's art behind that catalogue's
 * regeneration. Shipping them here keeps the whole game - rules, wire and
 * pixels - in one place that could be lifted out.
 *
 * ---------------------------------------------------------------------------
 * The atlas row order is ours, deliberately
 * ---------------------------------------------------------------------------
 * Both packs ship a combined sheet already, and neither is used: nothing states
 * which row is which animation, so reading one means guessing an order and
 * discovering the mistake as a boxer who throws a hook when you press block.
 *
 * `packages/boxing/src/art/characters.ts` is the order. This script writes it,
 * and the renderer reads the same list, so a row index is derived in both
 * places rather than counted by hand in either.
 *
 * ---------------------------------------------------------------------------
 * `--measure` is how the numbers in that file were found
 * ---------------------------------------------------------------------------
 * A sprite is mostly empty space, and where the figure sits inside its cell is
 * what decides whether a fighter stands on the canvas or floats above it. Two
 * packs put it in two different places and neither says so anywhere, so this
 * walks the alpha channel and prints what it finds. Re-run it when a pack is
 * updated; paste what it says into `characters.ts`.
 *
 *   bun run boxing:assets              # rebuild the atlases, then publish
 *   bun run boxing:publish             # publish only - no source packs needed
 *   bun run scripts/boxing-assets.ts --measure
 *
 * ---------------------------------------------------------------------------
 * `--publish` runs as part of `bun run build`, and has to
 * ---------------------------------------------------------------------------
 * `public/boxing/` is a build output and is git-ignored - the package's own
 * `assets/` is the source, so that lifting the package out takes the pixels
 * with it. Which means a fresh checkout, and every Docker image, has no art at
 * all until something copies it.
 *
 * So `build` publishes first. Without that the game ships with a working ring
 * that draws nothing: three 404s, no error, and two boxers stood in the dark.
 */

import { mkdir, copyFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import sharp from 'sharp'

import { CHARACTERS } from '../packages/boxing/src/art/characters'
import { columnsOf, type Character } from '../packages/boxing/src/art/sprites'

/**
 * Where the art lives: in the package, beside the code that describes it.
 *
 * It used to be written straight into `public/boxing/`, which made the package
 * a description of files it did not contain - lift the folder into another
 * project and you get a game with no pixels. The atlases are as much a part of
 * `@kxb/boxing` as `moves.ts` is.
 */
const PACKAGE = join(process.cwd(), 'packages', 'boxing', 'assets')

/**
 * ...and where this app serves them from.
 *
 * A copy rather than a symlink or a rewrite of the public path: Next serves
 * `public/` and nothing else, and a game that had to be `import`ed to be seen
 * would be a game that cannot be a plain `<img src>`. The package is the source
 * and this is a build output - which is why it is in `.gitignore`.
 */
const OUT = join(process.cwd(), 'public', 'boxing')
const DOWNLOADS = join(homedir(), 'Downloads')

const argOf = (flag: string) => {
  const at = process.argv.indexOf(flag)
  return at === -1 ? null : (process.argv[at + 1] ?? null)
}

/**
 * Where each pack's strips live.
 *
 * Two entries because the packs do not agree on the folder either - one spells
 * it `charater`, which is the vendor's typo and not one to correct on disk: the
 * path is what was downloaded, and quietly renaming it means the next person to
 * re-download gets a script that cannot find anything.
 */
const SOURCES: Record<string, string> = {
  hitman: join(
    DOWNLOADS,
    'Pixel Art Hitman Stance Boxer Character - v1.1',
    'charater',
    'Separate Animations',
  ),
  boxer: join(
    DOWNLOADS,
    'Pixel Art Boxer Character and Template Pack',
    'character',
    'Separate Animations',
  ),
}

/**
 * The pieces of the stadium this game actually stands in.
 *
 * A deliberately short list out of a 689MB pack. The ring is the game; the rest
 * is what you can see past it, and every extra piece is a download for a player
 * who is looking at two sprites in the middle of it.
 */
const SCENERY = [
  ['RING', 'SCENARIO/ASSETS/RING/OBJ/RING/RING'],
  ['FLOOR', 'SCENARIO/ASSETS/FLOOR/OBJ/FLOOR_1/FLOOR_1'],
  ['LIGHT', 'SCENARIO/ASSETS/LIGHTS/LIGHT_REFLECTOR/OBJ/LIGHT_REFLECTOR'],
  ['SEAT', 'SCENARIO/ASSETS/SEATS/SEAT_RED/OBJ/SEAT_RED'],
  ['SEAT_BLUE', 'SCENARIO/ASSETS/SEATS/SEAT_ BLUE/OBJ/SEAT_ BLUE'],
] as const

const VOXEL = argOf('--voxel') ?? join(DOWNLOADS, 'PACKAGE_BOXING_VOXEL')

function sourceFor(character: Character): string {
  const dir = argOf(`--${character.id}`) ?? SOURCES[character.id]
  if (!dir || !existsSync(dir)) {
    throw new Error(`no art for "${character.id}" at ${dir} - pass --${character.id} <dir>`)
  }
  return dir
}

async function stripsOf(character: Character): Promise<Map<string, string>> {
  const dir = sourceFor(character)
  return new Map(
    (await readdir(dir))
      .filter((name) => name.toLowerCase().endsWith('.png'))
      .map((name) => [basename(name, '.png'), join(dir, name)] as const),
  )
}

async function buildAtlas(character: Character): Promise<void> {
  const strips = await stripsOf(character)
  const { width: cell, height: row } = character.frame

  const layers: sharp.OverlayOptions[] = []
  for (const [index, clip] of character.clips.entries()) {
    const file = strips.get(clip.file)
    if (!file) throw new Error(`${character.id}: no art for "${clip.name}" (${clip.file}.png)`)

    // The frame count in `characters.ts` is load-bearing - it is what the
    // renderer steps through - so a strip that is not as long as it claims is a
    // boxer who animates into the next clip's pixels. Checked here rather than
    // trusted, because this is the only place both numbers are in scope.
    const meta = await sharp(file).metadata()
    const expected = clip.frames * cell
    if (meta.width !== expected || meta.height !== row) {
      throw new Error(
        `${character.id}/${clip.file}.png is ${meta.width}x${meta.height}, ` +
          `expected ${expected}x${row} for ${clip.frames} frames`,
      )
    }

    layers.push({ input: file, left: 0, top: index * row })
  }

  const width = columnsOf(character) * cell
  const height = character.clips.length * row
  const png = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .png()
    .toBuffer()

  await writeFile(join(PACKAGE, `${character.id}.png`), png)
  console.log(
    `${character.id}.png`.padEnd(14),
    `${width}x${height}`.padEnd(11),
    `${character.clips.length} clips`.padEnd(10),
    `${(png.length / 1024) | 0}KB`,
  )
}

/**
 * Where the figure really is inside its cell, for `characters.ts`.
 *
 * Reads the idle frame only. Every other clip is drawn on the same baseline -
 * that is what a sprite sheet is - and a knockdown's bounds would report the
 * height of somebody lying down.
 */
async function measure(character: Character): Promise<void> {
  const strips = await stripsOf(character)
  const idle = character.clips.find((clip) => clip.name === 'idle')!
  const { width: cell, height: row } = character.frame
  const { data, info } = await sharp(strips.get(idle.file)!)
    .raw()
    .toBuffer({ resolveWithObject: true })

  let minX = Infinity
  let maxX = -1
  let minY = Infinity
  let maxY = -1
  for (let y = 0; y < row; y++) {
    for (let x = 0; x < cell; x++) {
      // 16 rather than 0: pixel art is exported with a fringe of nearly
      // transparent pixels around the figure, and counting those measures the
      // anti-aliasing rather than the boxer.
      if (data[(y * info.width + x) * info.channels + 3]! > 16) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  console.log(
    `${character.id}`.padEnd(10),
    `cell ${cell}x${row}`.padEnd(14),
    `figure: { height: ${maxY - minY + 1}, feet: ${row - 1 - maxY} }`.padEnd(38),
    `centre x ${((minX + maxX) / 2).toFixed(1)}`,
  )
}

async function copyScenery(): Promise<void> {
  await mkdir(join(PACKAGE, 'stadium'), { recursive: true })
  for (const [name, path] of SCENERY) {
    for (const extension of ['obj', 'mtl', 'png']) {
      const from = join(VOXEL, `${path}.${extension}`)
      if (!existsSync(from)) throw new Error(`missing ${from} - pass --voxel <dir>`)
      await copyFile(from, join(PACKAGE, 'stadium', `${name}.${extension}`))
    }

    // MagicaVoxel writes the material library and texture next to the OBJ under
    // the *source* name. Renaming the files without rewriting the references is
    // a model that loads untextured, with no error anywhere - the loader treats
    // a missing map as "no map".
    const source = basename(path)
    for (const [file, from, to] of [
      [`${name}.mtl`, `${source}.png`, `${name}.png`],
      [`${name}.obj`, `${source}.mtl`, `${name}.mtl`],
    ] as const) {
      const at = join(PACKAGE, 'stadium', file)
      await writeFile(at, (await Bun.file(at).text()).replaceAll(from, to))
    }
    console.log(`stadium/${name}.obj`)
  }
}

/**
 * Copy the package's `assets/` into `public/` so this app can serve them.
 *
 * Everything, rather than a list: the package decides what it ships and a
 * hand-kept list here is a file that goes missing in production the first time
 * somebody adds one. `cp -r` semantics, in a handful of lines, because pulling
 * in a dependency for a recursive copy is not worth it.
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
  for (const character of CHARACTERS) await measure(character)
} else if (process.argv.includes('--publish')) {
  // The half that runs without the source packs, so a checkout that has never
  // seen `~/Downloads` can still serve the game.
  console.log(`${await publish(PACKAGE, OUT)} files -> ${OUT}`)
} else {
  for (const character of CHARACTERS) await buildAtlas(character)
  await copyScenery()
  console.log(`\n${await publish(PACKAGE, OUT)} files -> ${OUT}`)
}
