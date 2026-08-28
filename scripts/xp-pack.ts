#!/usr/bin/env bun
/**
 * Adding an asset pack, in one command.
 *
 *     bun run xp:pack            # check, then catalogue and thumbnail
 *     bun run xp:pack --check    # just tell me what is unregistered
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * Adding the platformer kit was four steps that had to happen in one order -
 * register it in `packs.ts`, run `xp:measure` to find out what scale it is
 * authored at, run `xp:catalogue`, run `xp:thumbs` - and getting the order wrong
 * produces an error about the *wrong thing*. Run the catalogue before
 * registering and it reports nothing missing, because it only walks the packs
 * the table names; run it before measuring and you have catalogued 611 models
 * at a scale you guessed.
 *
 * ---------------------------------------------------------------------------
 * What it will not do
 * ---------------------------------------------------------------------------
 * Register the pack. That step stays a person's, and not because it is hard:
 * `label`, `author`, `licence` and `scale` are judgements, and a script that
 * guessed the licence would be the worst kind of automation in this repo -
 * every pack we ship is CC0 and the type says so, precisely so that art with
 * conditions cannot arrive without somebody noticing.
 *
 * What it *can* do is the part that is a reading rather than a judgement: for a
 * folder nothing has registered, it measures the geometry and says what scale
 * the numbers imply, so `scale` is copied off a report instead of guessed and
 * corrected later. That is exactly how the platformer kit's `scale: 1` was
 * arrived at, and the first guess at it was wrong by half.
 */

import { readdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PACKS, PACK_ORDER } from '@kxb/xp/packs'
import { loadTriangles } from './gltf-raster'

const ROOT = path.join(import.meta.dir, '..')
const PACKS_DIR = path.join(ROOT, 'public', 'xp', 'packs')

const checkOnly = process.argv.includes('--check')

/**
 * Every directory of models under `public/xp/packs`, one level of nesting deep.
 *
 * Nested because a kit may ship its colourways as folders - the platformer kit
 * has five - and each of those is a pack of its own here, since `splitModel`
 * refuses an id containing a slash. A folder holding only folders is not a pack;
 * a folder holding models is.
 */
function folders(): string[] {
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    const entries = readdirSync(dir, { withFileTypes: true })
    const hasModels = entries.some(
      (entry) => entry.isFile() && (entry.name.endsWith('.gltf') || entry.name.endsWith('.glb')),
    )
    if (hasModels) {
      found.push(path.relative(PACKS_DIR, dir))
      return
    }
    if (depth === 0) return
    for (const entry of entries) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), depth - 1)
    }
  }
  for (const entry of readdirSync(PACKS_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(path.join(PACKS_DIR, entry.name), 1)
  }
  return found.sort()
}

/**
 * Which extension a folder's models use.
 *
 * Read rather than assumed, because the two we ship are not interchangeable: a
 * `.gltf` carries its geometry in a sibling `.bin` and a `.glb` is one file, so
 * a pack registered with the wrong one finds nothing and reports an empty pack
 * rather than a wrong path. The animation clips are `.glb`; everything
 * structural so far is `.gltf`.
 */
function extOf(dir: string): '.gltf' | '.glb' {
  const files = readdirSync(dir)
  return files.some((f) => f.endsWith('.glb')) ? '.glb' : '.gltf'
}

/**
 * How many animation clips a glTF carries.
 *
 * Read out of the JSON rather than inferred, because the two kinds of pack are
 * not distinguishable any other way: a clip pack ships the rig's mesh alongside
 * its animations, so "has geometry" says yes to both - `Rig_Medium_Tools.glb` is
 * 6,916 triangles, which is more than the dummy.
 *
 * What separates them is what the file is *for*. Every model we ship carries
 * zero animations; every file in the animation pack carries between eleven and
 * twenty-nine. That is not a threshold to tune, it is two different kinds of
 * thing.
 */
function clipCount(file: string): number {
  try {
    const buf = readFileSync(file)
    // A `.glb` is a binary container: twelve bytes of header, then a length and
    // a type, then the JSON chunk. A `.gltf` is the JSON itself.
    if (buf.subarray(0, 4).toString() === 'glTF') {
      const length = buf.readUInt32LE(12)
      return JSON.parse(buf.subarray(20, 20 + length).toString('utf8')).animations?.length ?? 0
    }
    return JSON.parse(buf.toString('utf8')).animations?.length ?? 0
  } catch (error) {
    // Only a file this cannot parse counts as zero clips - that is a problem for
    // the catalogue to report, where the message will be about the file.
    //
    // Anything else is rethrown, because a blanket catch here already cost an
    // afternoon: `readFileSync` was missing from the imports, every call threw a
    // ReferenceError, and the catch quietly answered "no clips" for all of them.
    // The check kept reporting the animation pack as unregistered and looked to
    // be working as designed.
    if (error instanceof SyntaxError) return 0
    throw error
  }
}

/**
 * A folder of animation clips rather than placeable art.
 *
 * Reported separately rather than as something to register, because registering
 * it would put eight rigged glTFs in the model picker as things to drag into a
 * level - and they are not that. They are what a body *does*, which the runtime
 * loads by path (see `_runtime/body/skinned.tsx`).
 *
 * Every file, not any: a pack with one animated prop in it is a model pack with
 * an animated prop, and should still be registered.
 */
function isClipPack(dir: string): boolean {
  const files = readdirSync(dir).filter((f) => f.endsWith('.gltf') || f.endsWith('.glb'))
  return files.length > 0 && files.every((f) => clipCount(path.join(dir, f)) > 0)
}

/** The folders `packs.ts` already knows about, as paths relative to the packs dir. */
function registered(): Set<string> {
  const known = new Set<string>()
  for (const id of PACK_ORDER) {
    // `pack.path` is a public URL path - `/xp/packs/proto` - and this compares
    // directories, so the prefix comes off.
    known.add(PACKS[id].path.replace(/^\/xp\/packs\//, ''))
  }
  return known
}

/**
 * What scale the geometry implies, from the models that name their own size.
 *
 * A kit whose files are called `barrier_2x1x4` is telling you how many cells it
 * thinks it is, and comparing that against what it measures is the whole
 * question `scale` answers. Nothing else in a glTF says it.
 *
 * Null when no filename carries dimensions, which is most character packs - and
 * then the honest report is "measure it yourself", not a number.
 */
function impliedScale(dir: string): { scale: number; from: string } | null {
  const files = readdirSync(dir).filter((f) => f.endsWith('.gltf') || f.endsWith('.glb'))
  for (const file of files) {
    const named = /(\d+)x(\d+)x(\d+)/.exec(file)
    if (!named) continue
    const [, w, , h] = named.map(Number)
    const triangles = loadTriangles(path.join(dir, file))
    if (triangles.length === 0) continue

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const tri of triangles) {
      for (const p of tri.p) {
        minX = Math.min(minX, p[0])
        maxX = Math.max(maxX, p[0])
        minY = Math.min(minY, p[1])
        maxY = Math.max(maxY, p[1])
      }
    }
    // Width against the first number in the name, height against the third -
    // the kit's own W x D x H convention.
    const byWidth = w > 0 ? w / (maxX - minX) : 0
    const byHeight = h > 0 ? h / (maxY - minY) : 0
    const scale = byWidth || byHeight
    if (!Number.isFinite(scale) || scale <= 0) continue
    return { scale: Math.round(scale * 1000) / 1000, from: file }
  }
  return null
}

const known = registered()
const found = folders().filter((dir) => !known.has(dir))

/**
 * Split before reporting, because only one of these is a thing to do.
 *
 * A clip pack sitting unregistered is the correct state, not a task - and a
 * check that reports a correct state as a problem is a check people learn to
 * ignore, which is worse than not having it.
 */
const clips = found.filter((dir) => isClipPack(path.join(PACKS_DIR, dir)))
const unregistered = found.filter((dir) => !clips.includes(dir))

for (const dir of clips) {
  const count = readdirSync(path.join(PACKS_DIR, dir)).filter(
    (f) => f.endsWith('.gltf') || f.endsWith('.glb'),
  ).length
  console.log(
    `\n  ${dir}  -  ${count} files, all of them animation clips.\n` +
      '      Not registered, and should not be: registering it would offer rigged\n' +
      '      clips in the model picker as things to drag into a level. The runtime\n' +
      '      loads these by path - see src/app/xp/_runtime/body/skinned.tsx.',
  )
}

if (unregistered.length === 0) {
  console.log(`\nEvery model pack under public/xp/packs is registered (${known.size}).`)
} else {
  console.log(`\n${unregistered.length} folder(s) nothing has registered:\n`)
  for (const dir of unregistered) {
    const full = path.join(PACKS_DIR, dir)
    const count = readdirSync(full).filter(
      (f) => f.endsWith('.gltf') || f.endsWith('.glb'),
    ).length
    const implied = impliedScale(full)
    console.log(`  ${dir}  -  ${count} ${extOf(full)} models`)
    if (implied) {
      console.log(
        `      the names imply scale ${implied.scale}  (from ${implied.from})`,
      )
    } else {
      console.log('      no filename carries dimensions - measure it by hand')
    }
  }

  console.log(`
Add each to PACKS in packages/xp/src/assets/packs.ts and to PACK_ORDER, then run this
again. label, author, licence and scale are yours to decide - the licence in
particular, because the type only accepts CC0 and that is deliberate.

    <id>: {
      label: '...',
      path: '/xp/packs/${unregistered[0]}',
      ext: '${extOf(path.join(PACKS_DIR, unregistered[0]))}',
      scale: ${unregistered.map((d) => impliedScale(path.join(PACKS_DIR, d))?.scale).find(Boolean) ?? 1},
      lift: 0,
      author: '...',
      licence: 'CC0',
      source: '...',
    },
`)
}

if (checkOnly) process.exit(unregistered.length === 0 ? 0 : 1)

/**
 * Then the two generated things, in the order they depend on each other.
 *
 * The catalogue first: the thumbnailer reads it to know what to draw, so
 * running them the other way round photographs the models the *last* catalogue
 * knew about and silently misses a new pack entirely.
 */
console.log('\n==> Cataloguing')
Bun.spawnSync(['bun', 'run', 'scripts/xp-catalogue.ts'], { cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'] })

console.log('\n==> Thumbnailing')
Bun.spawnSync(['bun', 'run', 'scripts/xp-thumbs.ts'], { cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'] })

if (existsSync(path.join(ROOT, 'packages', 'xp', 'src', 'assets', 'catalogue.generated.ts'))) {
  console.log('\nDone. `bun test packages` will tell you if the catalogue and the disk disagree.')
}
