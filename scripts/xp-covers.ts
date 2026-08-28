/**
 * Draws the cover for a cartridge that has no world to photograph.
 *
 *     bun run xp:covers                     # both
 *     bun run xp:covers peepz-world         # just one
 *
 * Writes `public/xp/shots/<id>.png` at 1280x720, which is where
 * `builtinCovers()` looks and the size the other cartridge covers are.
 *
 * ---------------------------------------------------------------------------
 * Why these two cannot use `xp:shot`
 * ---------------------------------------------------------------------------
 * `scripts/xp-shot.ts` draws a *document*: it reads the placements, looks up
 * the models and rasterises the level. A framed XP has no placements - it names
 * a game the host runs and the world is inside code - so there is nothing for it
 * to read. Boxing and Mau-Mau solved this by photographing the running game,
 * which needs a browser, a signed-in account and a room to open it in.
 *
 * The café and the house need none of that, because what they are made of is
 * *models we ship*. So this composes a still life out of the same files the
 * game places when you buy them - the same argument `render-pile.ts` makes for
 * the marketing piles, and PRODUCT.md's rule that a picture of the product is
 * made of the product. A cover drawn this way cannot go stale differently from
 * the game: change the pack and re-run the script.
 *
 * ---------------------------------------------------------------------------
 * Software rendering, and a painted sky behind it
 * ---------------------------------------------------------------------------
 * `gltf-raster.ts` draws on transparency and only square - see its own header
 * for why a browser was not worth the manual step. So the heap is rendered
 * large and transparent, and `sharp` puts it on a 16:9 gradient afterwards.
 * Two steps rather than one because the gradient is a *picture* decision and
 * the rasteriser is a geometry tool; teaching it about backgrounds would be
 * teaching it about art direction.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { loadTriangles, render, type Triangle, type Vec3 } from './gltf-raster'

const ROOT = path.join(import.meta.dir, '..')
const PUBLIC = path.join(ROOT, 'public')
const OUT_DIR = path.join(PUBLIC, 'xp', 'shots')

/** The size every other cartridge cover is. */
const WIDTH = 1280
const HEIGHT = 720

/**
 * Three-quarter and above, the angle `render-pile.ts` settled on.
 *
 * The same reasoning applies and is worth repeating: the eye has to be above
 * the top of the heap or the far side of the base is hidden and the whole thing
 * reads as a sticker rather than as objects standing on ground.
 */
const EYE: Vec3 = [5.4, 4.6, 7.2]
const FOV_DEG = 30

/** One model in a still life. Positions are in pack units; a square is 2. */
interface Piece {
  /** `<folder>/<name>`, under `public/`. */
  model: string
  x: number
  y: number
  z: number
  rotY?: number
  scale?: number
}

/** Where a pack's files are, by the prefix a piece names. */
const PACKS: Record<string, string> = {
  restaurant: 'xo/restaunt',
  peeps: 'xo/peeps',
  cafe: 'tinyXO/cafe',
  kitchen: 'tinyXO/kitchen',
  bakery: 'tinyXO/bakerygoods',
  house: 'tinyXO/house',
  living: 'tinyXO/livingroom',
  bedroom: 'tinyXO/bedroom',
  park: 'tinyXO/park',
  plants: 'tinyXO/plants',
}

function fileFor(model: string): string {
  const cut = model.indexOf('/')
  const dir = PACKS[model.slice(0, cut)]
  if (!dir) throw new Error(`no pack in "${model}"`)
  const name = model.slice(cut + 1)
  // The peeps ship as one binary each and every file carries the prefix the
  // catalogue strips. Everything else is a `.gltf` beside its `.bin`.
  return dir === 'xo/peeps'
    ? path.join(PUBLIC, dir, `animal-${name}.glb`)
    : path.join(PUBLIC, dir, `${name}.gltf`)
}

/**
 * The peeps are drawn at one unit a cell and everything else at two.
 *
 * Measured rather than guessed: `@kxb/xp/packs` gives the peeps `scale: 1` and
 * calls them "already drawn at play scale", and both of these kits are authored
 * two units to a grid square. So a peep standing beside a counter has to be
 * twice its own size or it is a mouse in a kitchen.
 */
const PEEP = 2

interface Cover {
  /** The heading a background is painted for. */
  sky: [string, string]
  pieces: Piece[]
}

/** A run of floor tiles, because a still life on nothing reads as a heap. */
function floor(model: string, xs: number[], zs: number[], y = 0): Piece[] {
  return xs.flatMap((x) => zs.map((z) => ({ model, x, y, z })))
}

const COVERS: Record<string, Cover> = {
  /**
   * The restaurant: the counter you stand behind, and everything on it.
   *
   * Built as a *room* rather than as a pile, and the difference is the floor.
   * The first version of this file arranged the same models in mid-air on a
   * gradient - the shape `render-pile.ts` uses, which works there because a
   * pile is deliberately a pile. These are furniture, and furniture with
   * nothing under it does not read as a kitchen; it reads as a mistake. Two
   * rows of tiles and a back wall cost nine models and turn the same objects
   * into a place.
   */
  'dream-restaurant': {
    // Warm, and the same family as the café's own lighting.
    sky: ['#3a1d2e', '#12060f'],
    pieces: [
      ...floor('cafe/floor_wood', [-4, -2, 0, 2, 4], [-2, 0, 2, 4]),
      { model: 'restaurant/wall_tiles_A', x: -2, y: 0, z: -3 },
      { model: 'restaurant/wall_tiles_A', x: 0, y: 0, z: -3 },
      { model: 'restaurant/wall_tiles_A', x: 2, y: 0, z: -3 },

      // The back line: what does the cooking.
      { model: 'cafe/bread_oven', x: -2.6, y: 0, z: -2.2, rotY: 0.12 },
      { model: 'restaurant/kitchencounter_straight_A', x: -0.6, y: 0, z: -2.4 },
      { model: 'cafe/coffee_machine', x: -0.6, y: 1.05, z: -2.4, rotY: -0.08 },
      { model: 'restaurant/stove_multi', x: 1.6, y: 0, z: -2.4 },

      // The counter itself, across the middle.
      { model: 'cafe/counter_table', x: -0.4, y: 0, z: 0.6, rotY: 0.04 },
      { model: 'cafe/cash_register', x: -1.4, y: 1.05, z: 0.55, rotY: 0.5 },
      { model: 'restaurant/food_burger', x: 0.15, y: 1.05, z: 0.45, rotY: 0.3, scale: 1.2 },
      { model: 'restaurant/food_pizza_pepperoni_plated', x: 0.95, y: 1.05, z: 0.85, rotY: -0.4, scale: 1.1 },
      { model: 'cafe/coffee_cup_takeaway', x: -0.85, y: 1.05, z: 1.05, rotY: 0.2, scale: 1.3 },
      { model: 'bakery/cake_strawberry', x: 1.9, y: 1.05, z: 0.4, rotY: 0.6, scale: 1.1 },

      // The floor: what it is all made of, and where you pick it up.
      { model: 'restaurant/crate_tomatoes', x: 3.0, y: 0, z: -1.4, rotY: 0.34 },
      { model: 'restaurant/crate_buns', x: 3.2, y: 0, z: 0.4, rotY: -0.2 },
      { model: 'cafe/basket_bread', x: -3.2, y: 0, z: 0.6, rotY: 0.45, scale: 1.2 },

      /*
        The other side of the counter, which is a third of the picture.

        Two stools alone left the front of the frame as bare floor - a room
        with a kitchen in the back half and nothing in the front reads as an
        unfinished room rather than as a café. A laid table is what the far side
        of a counter is for.
      */
      { model: 'restaurant/table_round_B_tablecloth_red', x: 0.6, y: 0, z: 3.0, rotY: 0.2 },
      { model: 'restaurant/chair_A', x: 2.3, y: 0, z: 3.2, rotY: -1.5 },
      { model: 'restaurant/chair_A', x: 0.4, y: 0, z: 4.5, rotY: 3.1 },
      { model: 'cafe/coffee_cup_takeaway', x: 0.7, y: 1.0, z: 2.8, rotY: -0.3, scale: 1.2 },
      { model: 'restaurant/chair_stool', x: -2.0, y: 0, z: 2.2, rotY: 0.4 },
      { model: 'restaurant/chair_stool', x: -3.2, y: 0, z: 1.2, rotY: -0.2 },

      /*
        Whoever is on shift, behind the counter and looking out at whoever is
        looking in. `rotY` is `atan2(eye.x, eye.z)` - the camera - and the step
        back off the counter is what keeps a burger from covering its face.
      */
      { model: 'peeps/bee', x: -0.4, y: 0, z: -1.4, rotY: 0.64, scale: PEEP },
    ],
  },

  /**
   * Peepz World: the house from the garden, which is the one view with both
   * halves of the cartridge in it.
   *
   * The house is a landmark rather than a room - see `gardenPlan` - so this is
   * the picture the game opens on when you step outside, with the furniture you
   * spend the café's money on brought out onto the grass. That last part is a
   * liberty and a deliberate one: a cover has to say what a game is *about*,
   * and what this one is about is buying the sofa.
   */
  'peepz-world': {
    // The garden's own daylight, warmed towards the sky the app sits in.
    sky: ['#1b3f56', '#08131c'],
    pieces: [
      ...floor('park/floor_grass_sliced_A', [-4, -2, 0, 2, 4], [-2, 0, 2, 4]),

      { model: 'house/house', x: -0.6, y: 0, z: -2.8, rotY: 0.1 },
      { model: 'house/tree_large', x: 3.4, y: 0, z: -2.0, rotY: 0.4 },
      { model: 'park/bush_large', x: -3.4, y: 0, z: -1.0, rotY: -0.3 },
      { model: 'house/doormat', x: -0.6, y: 0.02, z: -0.7 },

      /*
        The furniture, out on the grass - a chair, a plant, a bench, and a gap
        where a couch was.

        The couch, the bench and the potted monstera all went, and for one
        reason between them: each stood in front of the house. A cover has one
        subject, this one's is somebody at their own front door, and every piece
        of furniture parked between the camera and that door was competing with
        it. What is left sits to the sides, where it dresses the garden instead
        of blocking it.
      */
      { model: 'living/chair_A_blue', x: -3.2, y: 0, z: 1.4, rotY: 1.4 },
      { model: 'park/flower_A', x: -3.4, y: 0, z: 0.2, rotY: 0.1, scale: 1.4 },
      { model: 'park/flower_B', x: 3.6, y: 0, z: 3.2, rotY: -0.4, scale: 1.4 },

      /*
        On the path, in front of the door, facing out.

        A shade under `PEEP` because a peep at true scale beside this house is
        as tall as its porch - right in the game, where you are behind your own
        shoulder and never see the two together, and wrong in a picture, where
        it turns a home into a doll's house somebody is looming over.
      */
      /*
        Turned to `atan2(eye.x, eye.z)`, which is the camera, so it looks at
        whoever is looking at it rather than off past their shoulder.
      */
      { model: 'peeps/fox', x: -0.9, y: 0, z: 2.1, rotY: 0.64, scale: 1.5 },
    ],
  },
}

/** A vertical wash, as an SVG sharp can rasterise. */
function sky([top, bottom]: [string, string]): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
           <stop offset="0%" stop-color="${top}"/>
           <stop offset="100%" stop-color="${bottom}"/>
         </linearGradient>
         <radialGradient id="glow" cx="0.5" cy="0.62" r="0.6">
           <stop offset="0%" stop-color="#ffffff" stop-opacity="0.16"/>
           <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
         </radialGradient>
       </defs>
       <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>
       <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
     </svg>`,
  )
}

const requested = process.argv.slice(2)
const names = requested.length > 0 ? requested : Object.keys(COVERS)

mkdirSync(OUT_DIR, { recursive: true })

for (const name of names) {
  const cover = COVERS[name]
  if (!cover) {
    console.error(`no cover called "${name}" - try: ${Object.keys(COVERS).join(', ')}`)
    process.exit(1)
  }

  const triangles: Triangle[] = []
  for (const piece of cover.pieces) {
    triangles.push(
      ...loadTriangles(fileFor(piece.model), {
        x: piece.x,
        y: piece.y,
        z: piece.z,
        rotY: piece.rotY,
        scale: piece.scale,
      }),
    )
  }

  /**
   * Rendered square and tall enough to survive the crop.
   *
   * The rasteriser only draws squares, and the cover is 16:9 - so the still
   * life is drawn at the *height* it needs and the width comes from the
   * background it is placed on. `fit` rather than `cap`, like the piles: this
   * is one composition and it wants to fill its picture.
   */
  const image = render(triangles, {
    size: 900,
    supersample: 3,
    eye: EYE,
    fov: FOV_DEG,
    frame: { mode: 'fit', extent: 4.9 },
  })

  const raw = Buffer.from(image.data.buffer.slice(0) as ArrayBuffer)
  const heap = await sharp(raw, {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    /*
      Trimmed to what was actually drawn, then down to the frame's height.

      The rasteriser centres on the *bounding box*, which includes a back wall
      four units tall and a floor wider than anything standing on it - so the
      furniture came out high and left of centre with a quarter of the picture
      empty. Trimming the transparent margin makes the composition its own
      subject, which is what a cover wants: the picture is centred on the thing
      rather than on the volume it happens to occupy.

      Drawn at 900 and shown at 700 on purpose: the rasteriser box-filters its
      own supersampling, and one more halving on the way down is what takes the
      last stair off a low-poly silhouette. Square, because the rasteriser only
      draws squares - the 16:9 comes from the sky it is placed on.
    */
    .trim()
    .resize({ height: 660, fit: 'inside' })
    .png()
    .toBuffer()

  const png = await sharp(sky(cover.sky))
    .composite([{ input: heap, gravity: 'centre' }])
    .png()
    .toBuffer()

  const out = path.join(OUT_DIR, `${name}.png`)
  writeFileSync(out, png)
  console.log(`${name}: ${cover.pieces.length} pieces, ${triangles.length} tris → ${out}`)
}
