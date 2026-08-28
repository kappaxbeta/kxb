#!/usr/bin/env bun
/**
 * Put the starter worlds in the catalogue, as the kxb.team team's own.
 *
 * A catalogue that opens empty is a catalogue nobody comes back to: the first
 * space to look for a stage finds nothing, concludes the feature is unfinished,
 * and never checks again. These are the same worlds the builder offers as
 * starting points (src/domain/builder/starters.ts) - an arena, a pitch, a
 * square, a keep and the rest - which makes them exactly the right
 * seed. They are ordinary, they are obviously meant to be changed, and every
 * one of them is built from blocks alone, so what a space copies in is the
 * whole world and not the shell of one.
 *
 * ---------------------------------------------------------------------------
 * Why a script and not a migration
 * ---------------------------------------------------------------------------
 * The rows are *content*, not schema. Seeding them in SQL would mean the maze's
 * eight hundred coordinates pasted into a migration, frozen at the moment it
 * was written, and re-pasted every time a generator improves. Running the
 * generators here means the seed is always what the builder would produce
 * today, and re-running it updates the documents in place.
 *
 * Idempotent by `seed_key`, which is the starter's id - so renaming a world
 * updates the row it renamed rather than leaving the old one in the catalogue,
 * which is exactly what matching on the *name* did until it was caught.
 * Anything published by a person has no seed key and is never touched, in
 * either direction: not updated, and not swept.
 *
 * Usage:
 *   bun run worlds:seed                # every world
 *   bun run worlds:seed parkour race   # only those two
 *   bun run worlds:seed --dry          # say what it would write
 *   bun run worlds:seed --reshoot      # ignore the baked pictures and redraw them
 *   bun run worlds:seed --dry --reshoot # redraw the pictures and write nothing else
 *
 * ---------------------------------------------------------------------------
 * Why the pictures are files in the repo
 * ---------------------------------------------------------------------------
 * The worlds themselves are code - `STARTERS` builds every block of them - so
 * seeding a fresh database needs nothing but this script, and two installs
 * seeded a year apart get identical worlds. That is the whole reason they are
 * generated rather than dumped.
 *
 * The posters are the exception, and they earn it. Each one is a few thousand
 * triangles through the software rasterizer in ./gltf-raster.ts, which is about
 * forty seconds a world - eight minutes to seed the catalogue, every time,
 * anywhere. And the output is deterministic: the same world, camera and lens
 * produce the same bytes on every machine. So they are shot once, written to
 * `supabase/seed/world-posters/`, committed, and reused - which turns seeding
 * production into seconds rather than a coffee break.
 *
 * `--reshoot` is what to run after changing a world's geometry or its camera:
 * it redraws and rewrites the file, which then wants committing alongside the
 * change that caused it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { builderUrl, splitModel } from '../src/domain/builder/packs'
import { STARTERS } from '../src/domain/builder/starters'
import {
  type BuilderWorld,
  groundPlacements,
  serialiseWorld,
} from '../src/domain/builder/world'
import { countBlockable } from '../src/domain/worlds/blocks'
import { loadTriangles, render, type Triangle } from './gltf-raster'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const dry = process.argv.includes('--dry')
const reshoot = process.argv.includes('--reshoot')

// A dry run writes no rows, so it needs no database - which is what lets the
// posters be reshot on a machine with nothing running on it (see below).
if (!dry && (!url || !serviceKey)) {
  console.error('\n  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set\n')
  process.exit(1)
}

/** Where the baked pictures live. Committed, and rewritten by `--reshoot`. */
const POSTER_DIR = 'supabase/seed/world-posters'
const wanted = new Set(process.argv.slice(2).filter((arg) => !arg.startsWith('--')))

/**
 * Service role, because there is nobody to act as.
 *
 * The insert policy on `published_worlds` wants `author_id = auth.uid()` and a
 * backoffice admin behind it - which is the right rule for the button in the
 * builder and the wrong one for a seed, where the author is the project rather
 * than a person. The column is nullable for exactly this, and `origin` is what
 * the discovery page actually credits.
 */
const supabase = createClient(url ?? 'http://127.0.0.1:54321', serviceKey ?? 'dry-run', {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * What each starter is published as.
 *
 * The tags are here rather than on the `Starter` itself, because they are a
 * fact about the catalogue - the vocabulary in domain/worlds/tags.ts - and the
 * starters are a fact about the editor. A starter that stops being seeded
 * should not leave a dangling tag list behind it.
 */
const PUBLISHED: Record<string, { tags: string[]; blurb: string }> = {
  yard: {
    tags: ['small', 'hangout'],
    blurb: 'A lawn and nothing else. The place to start when you have your own idea.',
  },
  arena: {
    tags: ['arena'],
    blurb: 'A stone island in a ring of lava inside a round wall — four bridges in, cover on top, and a chest in the middle to hold.',
  },
  pitch: {
    tags: ['pitch', 'event'],
    blurb: 'A walled pitch with a goal at each end, a stand along one side and floodlights. Kick off the moment it lands.',
  },
  square: {
    tags: ['hangout', 'city', 'nature'],
    blurb: 'A fountain, four market stalls, a café under parasols and a clock tower — somewhere to meet and talk.',
  },
  keep: {
    tags: ['arena', 'showcase'],
    blurb: 'A moat, a gate, a hall with a gallery round it and stairs up to it, four towers and a throne at the far end.',
  },
  island: {
    tags: ['hangout', 'nature', 'showcase'],
    blurb: 'Grass over the void, a paved plaza and a pool, a pier off one side and a footbridge to a campfire off the other.',
  },
  parkour: {
    tags: ['parkour'],
    blurb: 'Twenty-six pads spiralling up over lava to a lookout. Every gap is one jump.',
  },
  race: {
    tags: ['parkour', 'event'],
    blurb: 'A long run over the water, GO to END, with a podium at the end of it.',
  },
  village: {
    tags: ['hangout', 'city', 'nature'],
    blurb: 'Four cottages round a green, a well, a pond, an orchard and a windmill with its sails over the path.',
  },
  bank: {
    tags: ['city', 'showcase', 'event'],
    blurb: 'Columns, a marble hall, teller windows with two registers — and the vault standing open with the gold in it.',
  },
  restaurant: {
    tags: ['hangout', 'city'],
    blurb: 'Six laid tables, a kitchen with the oven lit, and a terrace under striped parasols.',
  },
  school: {
    tags: ['office', 'city', 'event', 'pitch'],
    blurb: 'A classroom with a green board and three rows of desks, a yard with goals painted on it, and a pyramid to be king of.',
  },
  office: {
    tags: ['office'],
    blurb: 'Six desks with machines on, a glass meeting room, a server rack, a couch nobody sits on and plants nobody waters.',
  },
}

/**
 * A picture of a world, without a browser.
 *
 * The builder shoots its own poster off the WebGL canvas at publish time, and
 * that is not available here - so this goes through the software rasterizer the
 * block and prop thumbnails already use (scripts/gltf-raster.ts). Same models,
 * same files, no GPU.
 *
 * The saving that makes it practical is the cache: a world is a thousand cells
 * drawn from a dozen models, so the triangles are loaded once per
 * model-and-pose and then *translated* per cell. Loading the glTF a thousand
 * times would be a minute a world; this is a second.
 */
const triangleCache = new Map<string, Triangle[]>()

function posterFor(world: BuilderWorld): ReturnType<typeof render> | null {
  const triangles: Triangle[] = []

  for (const placement of [...groundPlacements(world.ground), ...world.placements]) {
    const url = builderUrl(placement.model)
    if (!url) continue

    /*
     * The pack's own scale, times the placement's - the same product the
     * browser renderer multiplies (see `Placements` in the builder).
     *
     * The first version of this forgot the pack and drew every bb10 cube two
     * units wide on a one-unit lattice, so every block overlapped its
     * neighbours by half. Same-coloured blocks hid it; a white line painted
     * into a green floor z-fought along its whole length and came out as a
     * zigzag. A world on a card has to be the world, at the world's scale.
     */
    const pack = splitModel(placement.model)?.pack
    const scale = (pack?.scale ?? 1) * placement.scale

    // Pose in the key, position out of it: rotation and scale change the
    // geometry, position only moves it.
    const key = `${placement.model}|${placement.rotation}|${scale}`
    let base = triangleCache.get(key)
    if (!base) {
      base = loadTriangles(path.join('public', url.replace(/^\//, '')), {
        rotY: (placement.rotation * Math.PI) / 180,
        scale,
      })
      triangleCache.set(key, base)
    }

    // bb10 cubes are modelled around their own centre, so a block filling the
    // cell from y to y+1 sits half a cell up - the same `lift` the renderer
    // applies in the browser, kept in step by hand because the rasterizer has
    // no scene graph to hang it on. It scales with the placement and not with
    // the pack, for the reason the renderer gives.
    const lift = (pack?.lift ?? 0) * placement.scale
    const dx = placement.x
    const dy = placement.y + lift
    const dz = placement.z

    for (const triangle of base) {
      triangles.push({
        ...triangle,
        p: triangle.p.map((point) => [point[0] + dx, point[1] + dy, point[2] + dz]) as
          Triangle['p'],
      })
    }
  }

  if (triangles.length === 0) return null

  /**
   * The angle the world chose, and how much of the frame it fills.
   *
   * The camera comes from the document rather than from a constant here, which
   * matters the moment a world is not roughly square: the long race set its own
   * view down the length of the run, and shooting it from the default
   * three-quarter angle produced a sliver in the middle of a black card.
   *
   * The rasterizer always looks at the origin, so the document's `target` is
   * ignored - every starter is built around the origin, so this costs nothing
   * today and is the reason `compose` centres them.
   *
   * The framing is derived rather than guessed: how much the camera can see at
   * that distance and lens, then a fraction of it. Two fractions, because the
   * poster is cropped to 16:9 afterwards - a tall world loses a quarter of its
   * height to the crop, which is how the parkour tower's lookout ended up
   * outside the picture.
   */
  const eye = world.camera.position
  const fov = world.camera.fov
  const distance = Math.hypot(eye[0], eye[1], eye[2]) || 1
  const visible = 2 * distance * Math.tan(((fov * Math.PI) / 180) / 2)

  const reach = world.placements.reduce(
    (out, placement) => ({
      wide: Math.max(out.wide, Math.abs(placement.x), Math.abs(placement.z)),
      high: Math.max(out.high, placement.y),
    }),
    { wide: 1, high: 1 },
  )
  const extent = visible * (reach.high > reach.wide ? 0.5 : 0.8)

  const image = render(triangles, {
    size: POSTER_SIZE,
    eye,
    fov,
    // `fit`, because these are whole worlds of wildly different sizes and each
    // should fill its card - a maze and a 1x1 yard cannot share a scale.
    frame: { mode: 'fit', extent },
  })

  return image
}

const POSTER_SIZE = Number(process.env.POSTER_SIZE ?? 480)

/**
 * The rendered image as the data URL the column holds.
 *
 * Cropped to 16:9 here rather than left square for the card's `object-cover` to
 * do: the crop is the same either way, and doing it now means the bytes that
 * travel to every visitor are the bytes that get drawn.
 */
async function encode(image: ReturnType<typeof render>): Promise<string> {
  const height = Math.round((POSTER_SIZE * 9) / 16)

  const jpeg = await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .extract({
      left: 0,
      top: Math.round((image.height - height) / 2),
      width: image.width,
      height,
    })
    // Flattened onto the same dark the viewer uses, because JPEG has no alpha
    // and the default composite would be white - a bright square in a dark grid.
    .flatten({ background: { r: 17, g: 17, b: 24 } })
    // The same quality the builder's own poster uses, for the same reason: this
    // is a card picture in a database row, not an artefact.
    .jpeg({ quality: 72 })
    .toBuffer()

  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

let written = 0

for (const starter of STARTERS) {
  if (wanted.size > 0 && !wanted.has(starter.id)) continue

  const published = PUBLISHED[starter.id]
  if (!published) {
    console.log(`  skipping ${starter.id} — no catalogue entry for it`)
    continue
  }

  const world = starter.build()

  /*
   * The picture: from the repo if it is there, otherwise drawn and kept.
   *
   * Written back on a miss as well as on `--reshoot`, so adding a world is one
   * seed run and the file it produced is part of the commit - the next person
   * to seed a database does not pay for it again.
   *
   * `--dry --reshoot` is the one dry combination that writes anything: the
   * pictures, and only the pictures. It is how a world is looked at while it
   * is being drawn, on a machine with no database up - the file is the same
   * one a real seed would read, so what you check in is what ships.
   */
  const posterPath = path.join(POSTER_DIR, `${starter.id}.jpg`)
  let poster: string | null = null

  if (!reshoot && existsSync(posterPath)) {
    poster = `data:image/jpeg;base64,${readFileSync(posterPath).toString('base64')}`
  } else if (!dry || reshoot) {
    const image = posterFor(world)
    if (image) {
      poster = await encode(image)
      mkdirSync(POSTER_DIR, { recursive: true })
      writeFileSync(posterPath, Buffer.from(poster.split(',')[1], 'base64'))
      console.log(`  ${starter.name} — shot a new poster into ${posterPath}`)
    }
  }
  const row = {
    name: starter.name,
    blurb: published.blurb,
    document: JSON.parse(serialiseWorld(world)),
    tags: published.tags,
    visibility: 'public',
    origin: 'platform',
    tenant_id: null,
    author_id: null,
    placements: world.placements.length,
    blocks: countBlockable(world),
    poster,
    seed_key: starter.id,
    updated_at: new Date().toISOString(),
  }

  console.log(
    `  ${starter.name} — ${row.placements} placed, ${row.blocks} blocks, [${row.tags.join(', ')}]` +
      (row.poster ? ` · poster ${(row.poster.length / 1024).toFixed(0)} kB` : ' · no poster'),
  )

  if (dry) continue

  // Matched on the starter's id, not its name - see the header. A world a
  // person published has a null key and can never be found by this.
  const { data: existing, error: findError } = await supabase
    .from('published_worlds')
    .select('id')
    .eq('seed_key', starter.id)
    .maybeSingle()

  if (findError) {
    console.error(`    failed to look for it: ${findError.message}`)
    process.exit(1)
  }

  const { error } = existing
    ? await supabase.from('published_worlds').update(row).eq('id', existing.id)
    : await supabase.from('published_worlds').insert(row)

  if (error) {
    console.error(`    failed to write it: ${error.message}`)
    process.exit(1)
  }

  written += 1
}

/**
 * Worlds this seed used to publish and no longer does.
 *
 * Swept only when the whole catalogue was seeded - a run naming two ids is not
 * evidence that the other twelve are gone - and only rows carrying a seed key,
 * so nothing anybody published by hand is in scope. A world some space has
 * already copied is left alone as well: the copy is theirs and complete, but
 * the row is what its "forked from" and its approval point at.
 */
if (!dry && wanted.size === 0) {
  const keys = STARTERS.map((starter) => starter.id)

  const { data: stale, error } = await supabase
    .from('published_worlds')
    .select('id, name, seed_key')
    .not('seed_key', 'is', null)
    .not('seed_key', 'in', `(${keys.join(',')})`)

  if (error) {
    console.error(`  could not check for retired worlds: ${error.message}`)
  } else {
    for (const world of stale ?? []) {
      const { count } = await supabase
        .from('world_copies')
        .select('*', { count: 'exact', head: true })
        .eq('source_world_id', world.id)

      if (count && count > 0) {
        console.log(`  leaving “${world.name}” — ${count} space(s) took a copy of it`)
        continue
      }

      await supabase.from('published_worlds').delete().eq('id', world.id)
      console.log(`  retired “${world.name}” — no starter called ${world.seed_key} any more`)
    }
  }
}

console.log(
  dry
    ? `\n  --dry: nothing written. ${STARTERS.length} worlds would be published.\n`
    : `\n  ${written} worlds published to the catalogue.\n`,
)
