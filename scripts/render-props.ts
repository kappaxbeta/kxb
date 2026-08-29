/**
 * Shoots every palette entry to a WebP thumbnail.
 *
 *     bun run scripts/render-props.ts             # everything
 *     bun run scripts/render-props.ts home        # one catalog
 *     bun run scripts/render-props.ts cafe couch  # a few entries
 *     bun run scripts/render-props.ts blocks      # the lounge palette
 *
 * Writes `public/thumbs/<catalog>/<id>.webp`, keyed by catalog entry rather
 * than by model, because an entry is what the palette offers: the desk is a
 * desk *with the computer on it*, and a picture of the bare desk would be a
 * picture of something you cannot buy. Composing the `extras` here is the whole
 * reason this does not just render the pack folder.
 *
 * ---------------------------------------------------------------------------
 * Why files in the repo rather than rendering in the browser
 * ---------------------------------------------------------------------------
 * The lounge used to draw its 58 blocks at run time, through a hidden WebGL
 * canvas, on first open of the picker. It worked, and everything about it was
 * expensive in the wrong place: a second of main-thread CPU and a second WebGL
 * context, spent while a 3D scene is starting, to produce pictures that are
 * identical for every visitor and every session. It was also fragile in a way
 * a file is not - the loop yielded on `requestAnimationFrame`, which a browser
 * does not run for a document it is not painting, so a picker opened in a
 * backgrounded tab showed one block and fifty-seven placeholders forever.
 *
 * These are a couple of kB each, cached by the browser across sessions, and
 * the palette shows them instantly.
 *
 * Re-run after changing a catalog entry's model, extras, or scale - or, for
 * `blocks`, after adding to PALETTE in domain/lounge/palette.ts.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { PROPS, propUrl } from '@kxb/dream-restaurant/catalog'
import { HOME_PROPS, modelUrl } from '@kxb/peepz-world/catalog'
import { PALETTE, modelUrl as blockUrl } from '@/domain/lounge/palette'
import { loadTriangles, render, type Placement, type Vec3 } from './gltf-raster'

const ROOT = path.join(import.meta.dir, '..')
const PUBLIC = path.join(ROOT, 'public')

/** Delivered size. Palette tiles are ~72px, so this survives a retina screen. */
const SIZE = 192

/** The same three-quarter camera the block picker uses, so the packs match. */
const EYE: Vec3 = [4.2, 3.4, 4.2]
const FOV_DEG = 30

/**
 * How much of the frame a thumbnail fills.
 *
 * Everything is fitted to this rather than drawn at true scale: the catalogs
 * run from a teddy bear to a double bed, and at true scale the teddy is a
 * smudge in the corner of its tile. A palette is a list of *what* things are,
 * and each tile gets the whole frame to say it.
 */
const FRAME_EXTENT = 2.6

/**
 * How the lounge's blocks are framed, which is not how the props are.
 *
 * `fit` above scales every entry up to fill its tile. That is right for a
 * catalog running from a teddy bear to a double bed, and wrong for the block
 * palette: those are all 2-unit cubes, and the handful of props among them
 * (the tree, the lamp) are *meant* to look taller than a block. Fitting each
 * one to the frame would render a palette in which everything is the same size,
 * which is the one fact about it that is false.
 *
 * So: capped, not fitted. Nothing is enlarged, and only the few models bigger
 * than a cell shrink enough to keep their tops inside the picture.
 */
const BLOCK_EXTENT = 2.4

/** One thing the palette offers, flattened to models and where they sit. */
interface Entry {
  id: string
  parts: { file: string; placement: Placement }[]
}

/** A catalog, as this script needs it: a name, an out dir, and its entries. */
interface Catalog {
  name: string
  entries: Entry[]
  /** Defaults to fitting each entry to the tile - see `FRAME_EXTENT`. */
  frame?: { mode: 'fit' | 'cap'; extent: number }
}

/** Resolves a public URL like `/tinyXO/cafe/mug.gltf` to a file on disk. */
function fileFor(url: string): string {
  return path.join(PUBLIC, url.replace(/^\//, ''))
}

const CATALOGS: Catalog[] = [
  {
    name: 'cafe',
    entries: PROPS.map((prop) => ({
      id: prop.id,
      parts: [
        { file: fileFor(propUrl(prop.model)), placement: { scale: prop.scale } },
        ...(prop.extras ?? []).map((extra) => ({
          file: fileFor(propUrl(extra.model)),
          // An extra's offsets are in the *placed* prop's space, so a scaled
          // prop scales the things standing on it too.
          placement: {
            x: (extra.x ?? 0) * (prop.scale ?? 1),
            y: (extra.y ?? 0) * (prop.scale ?? 1),
            z: (extra.z ?? 0) * (prop.scale ?? 1),
            rotY: extra.rotY,
            scale: (extra.scale ?? 1) * (prop.scale ?? 1),
          },
        })),
      ],
    })),
  },
  {
    name: 'home',
    entries: HOME_PROPS.map((prop) => ({
      id: prop.id,
      parts: [
        { file: fileFor(modelUrl(prop.model)), placement: {} },
        ...(prop.extras ?? []).map((extra) => ({
          file: fileFor(modelUrl(extra.model)),
          placement: { x: extra.x, y: extra.y, z: extra.z, rotY: extra.rotY },
        })),
      ],
    })),
  },
  {
    /**
     * The lounge's block palette.
     *
     * A block has no extras and no scale - it is one model, one file, one tile -
     * so this is the whole of it. It sits here rather than in a script of its
     * own because "render a palette to WebP thumbnails" is one job, and the
     * alternative was a second copy of the sharp encoding, the argument parsing
     * and the camera.
     *
     * Not to be confused with `render-blocks.ts`, which shoots a few of the same
     * models at 512px for the landing page's hero. Same camera, different
     * customer: that one is art on a marketing page, this one is icons in a
     * grid.
     */
    name: 'blocks',
    frame: { mode: 'cap', extent: BLOCK_EXTENT },
    entries: PALETTE.map((model) => ({
      id: model,
      parts: [{ file: fileFor(blockUrl(model)), placement: {} }],
    })),
  },
]

const args = process.argv.slice(2)
const wanted = new Set(args.filter((a) => !CATALOGS.some((c) => c.name === a)))
const catalogs = args.some((a) => CATALOGS.some((c) => c.name === a))
  ? CATALOGS.filter((c) => args.includes(c.name))
  : CATALOGS

for (const catalog of catalogs) {
  const dir = path.join(PUBLIC, 'thumbs', catalog.name)
  mkdirSync(dir, { recursive: true })

  let written = 0
  for (const entry of catalog.entries) {
    if (wanted.size > 0 && !wanted.has(entry.id)) continue

    const triangles = entry.parts.flatMap((part) => loadTriangles(part.file, part.placement))
    const image = render(triangles, {
      size: SIZE,
      eye: EYE,
      fov: FOV_DEG,
      frame: catalog.frame ?? { mode: 'fit', extent: FRAME_EXTENT },
    })

    const webp = await sharp(Buffer.from(image.data), {
      raw: { width: image.width, height: image.height, channels: 4 },
    })
      // Lossless: these are flat-shaded blocks of colour on transparency, which
      // is the one thing lossy WebP is bad at and lossless WebP is good at.
      // The files come out smaller this way as well.
      .webp({ lossless: true, effort: 6 })
      .toBuffer()

    writeFileSync(path.join(dir, `${entry.id}.webp`), webp)
    written++
    console.log(
      `${catalog.name}/${entry.id}: ${triangles.length} tris → ${(webp.length / 1024).toFixed(1)} kB`,
    )
  }
  console.log(`${catalog.name}: ${written} thumbnails → public/thumbs/${catalog.name}/`)
}
