/**
 * Every asset pack in `public/`, and what each one's units mean.
 *
 * The builder's whole premise is that a world may contain anything we ship, not
 * just the 58 blocks the lounge allows. That means one address space over four
 * vendors who agree on nothing: bb10 draws a cube two units on a side, Tiny
 * Treats draws a floor tile two units square, the restaurant set draws a
 * worktop two units wide, and the peeps are the only pack authored at the scale
 * the game actually runs at.
 *
 * A model is written `pack/name`, the same shape the café catalog already uses
 * (see `@/domain/cafe/catalog`) - so `bb10/lava`, `park/fountain`,
 * `restaurant/chair_A`, `peeps/fox`. Tiny Treats gets one pack per folder
 * rather than a `tinyXO/<folder>/<name>` triple, because the folders are
 * genuinely different sets - you look for a bath in `bathroom`, not in a
 * thousand-item pile - and because two of them both contain a `floor_wood`.
 *
 * ---------------------------------------------------------------------------
 * Why the grid is one unit and every pack is scaled to it
 * ---------------------------------------------------------------------------
 * The alternative is a grid of two, which is what the café and the house use,
 * and it is wrong here for one reason: the drawing tools. A wall you drag out
 * is a run of cells, and its thickness, its height and the step between two
 * adjacent bricks are all one cell. On a two-unit grid every one of those is
 * two units and nothing lines up with a bb10 block, which is the one pack you
 * actually build *structures* out of. So the cell is a bb10 block, everything
 * else is scaled to sit on the same lattice, and the per-placement `scale` in
 * the document is there for when a bench wants to be a little bigger than its
 * square.
 */

export interface Pack {
  /** What the picker calls it. */
  label: string
  /** Directory under `public/`, no trailing slash. */
  path: string
  /** `.gltf` for everything but the peeps, who ship as a single binary each. */
  ext: '.gltf' | '.glb'
  /**
   * Filename prefix stripped from the id and put back in the URL.
   *
   * Only the peeps have one - every file in that folder is `animal-<name>.glb`,
   * and `peeps/animal-fox` reads like a stutter next to `peeps/fox`.
   */
  prefix?: string
  /** Multiplier that puts one authored unit onto the one-unit cell. */
  scale: number
  /**
   * Cells to raise the model's origin above its cell floor, at scale 1.
   *
   * bb10 cubes are modelled around their own centre, so a block filling the
   * cell from y to y+1 has its origin at y+0.5. Everything in every other pack
   * is modelled standing on y=0, which is already the cell floor - so this is
   * 0.5 for bb10 and zero everywhere else.
   *
   * Multiplied by the placement's own scale, not by the pack's: the pack scale
   * is what makes one authored cube one cell in the first place, so counting it
   * twice would sink every block half a cell into the floor.
   */
  lift: number
  /** Who drew it. Shown in credits; `cosmos` is the one that requires it. */
  author: string
  /**
   * What we are allowed to do with the files, and what we owe for them.
   *
   * Every pack we downloaded is CC0, which is a waiver rather than a licence
   * with conditions - commercial use, modification and redistribution of the
   * files themselves, by us and by anyone we hand them to, with no attribution
   * due. That was the whole list until `cosmos`, and it was typed as the single
   * literal precisely so that the day it stopped being the whole list, the
   * compiler would ask what the new thing meant rather than let it in quietly.
   *
   * This is that day, and the answer is `CC-BY-4.0`: the same freedoms with one
   * condition attached, which is that the author is credited wherever the work
   * goes. The condition is real and it travels - a world published with a
   * `cosmos` model in it owes that credit, and so does anyone we hand the world
   * to - so it is recorded here, per pack, next to the `author` and `source`
   * that are what discharging it actually looks like.
   *
   * ---------------------------------------------------------------------------
   * What this union is not permission to do
   * ---------------------------------------------------------------------------
   * Widening a type is not the same as clearing a pack, and the next entry
   * should be harder to add than this one was rather than easier. Anything with
   * a non-commercial or no-derivatives clause cannot go in this table at all:
   * a space's world is commercial the moment somebody pays for the space, and
   * `xo` copies and rescales what it holds, which is a derivative. Those are
   * facts about the product rather than about the picker, so the honest place
   * to refuse them is here, before a model id reaches an immutable log.
   */
  licence: 'CC0' | 'CC-BY-4.0'
  /**
   * Where it came from, as the publisher's own address.
   *
   * A link rather than a copy of the licence file. CC0 is irrevocable, so
   * there is no future in which we need the original text as evidence of
   * anything, and the fact that matters - the word above - is recorded here
   * either way. A dead link next to `licence: 'CC0'` still answers the
   * question.
   *
   * This travels: it is what a published world, and later an exported XP,
   * carries so a recipient can see where every model came from and fetch the
   * pack themselves. It is also the reason there is no asset registry to
   * build - the publishers already host these better than we would.
   */
  source: string
}

/** The three people whose work this is built out of. */
const KAY = { author: 'Kay Lousberg', licence: 'CC0', source: 'https://kaylousberg.itch.io/' } as const
const ISA = { author: 'Isa Lousberg', licence: 'CC0', source: 'https://tinytreats.itch.io/' } as const
const KENNEY = { author: 'Kenney', licence: 'CC0', source: 'https://kenney.nl/' } as const

/**
 * The one pack that is ours, and the one that owes somebody a credit.
 *
 * The geometry is written by `scripts/build-galaxy.ts` and belongs to us. The
 * texture on it does not: it is the galaxy plate out of "Money makes the WORLD
 * go round", with its black background cut to alpha, and that model is CC-BY.
 * A derivative of a CC-BY work is CC-BY, so the whole pack is - which is why
 * the author named here is the texture's author rather than us. Crediting
 * ourselves for the half we wrote and nobody for the half we did not is the one
 * way to get this wrong that also looks tidy.
 */
const ROSARIO = {
  author: 'Miguelangelo Rosario',
  licence: 'CC-BY-4.0',
  source:
    'https://sketchfab.com/3d-models/money-makes-the-world-go-round-095ba2f03768457b8cec0da88ce25196',
} as const

export const PACKS: Record<string, Pack> = {
  bb10: { label: 'Blocks', path: '/xo/bb10/gltf', ext: '.gltf', scale: 0.5, lift: 0.5, ...KAY },
  peeps: {
    label: 'Peeps',
    path: '/xo/peeps',
    ext: '.glb',
    prefix: 'animal-',
    // The one pack already drawn at play scale: an avatar in the lounge stands
    // a shade under two cells tall with no scaling at all.
    scale: 1,
    lift: 0,
    ...KENNEY,
  },
  /**
   * The prototype kit, and the only pack authored in metres.
   *
   * `scale: 1` is measured, not assumed: a table is 0.8 units tall, a door
   * 2.8, a wall 4 by 4 by 1, and the dummy 2.2 - which is a room drawn at one
   * unit per metre, and this grid is one metre a cell. So the structural
   * pieces land on integer cell counts with nothing to convert, and a wall
   * four cells wide is four blocks wide.
   *
   * `lift: 0` is right for the 65 models that stand on y=0, which is every
   * piece you build with. The other 20 are centred on their own pivot -
   * the guns, the ammo, the coins, the barrels, the wall targets - and that is
   * correct for them: they are things that hang off a socket or a wall, not
   * things that sit on the floor. Placed on the lattice they sink by half
   * their height, which is a per-blueprint offset to fix rather than a pack
   * one, because moving the pack would lift the other 65 off the ground.
   */
  proto: { label: 'Prototype', path: '/xo/proto', ext: '.gltf', scale: 1, lift: 0, ...KAY },
  restaurant: { label: 'Restaurant', path: '/xo/restaunt', ext: '.gltf', scale: 0.5, lift: 0, ...KAY },
  bakerygoods: { label: 'Bakery', path: '/tinyXO/bakerygoods', ext: '.gltf', scale: 0.5, lift: 0, ...ISA },
  bathroom: { label: 'Bathroom', path: '/tinyXO/bathroom', ext: '.gltf', scale: 0.5, lift: 0, ...ISA },
  bedroom: { label: 'Bedroom', path: '/tinyXO/bedroom', ext: '.gltf', scale: 0.5, lift: 0, ...ISA },
  cafe: { label: 'Café', path: '/tinyXO/cafe', ext: '.gltf', scale: 0.5, lift: 0, ...ISA },
  house: { label: 'House', path: '/tinyXO/house', ext: '.gltf', scale: 0.5, lift: 0, ...ISA },
  kitchen: { label: 'Kitchen', path: '/tinyXO/kitchen', ext: '.gltf', scale: 0.5, lift: 0, ...ISA },
  livingroom: { label: 'Living room', path: '/tinyXO/livingroom', ext: '.gltf', scale: 0.5, lift: 0, ...ISA },
  park: { label: 'Park', path: '/tinyXO/park', ext: '.gltf', scale: 0.5, lift: 0, ...ISA },
  plants: { label: 'Plants', path: '/tinyXO/plants', ext: '.gltf', scale: 0.5, lift: 0, ...ISA },
  /**
   * Written rather than downloaded, and the only pack here that glows.
   *
   * `scale: 1` and `lift: 0` because the model is authored in cells and puts
   * itself where it wants to be: the galaxy hangs half a cell up in its own
   * geometry rather than through the pack's `lift`, which is multiplied by the
   * placement's scale and would send a galaxy scaled to 4 two cells into the
   * air. See `HOVER` in scripts/build-galaxy.ts.
   */
  cosmos: { label: 'Cosmos', path: '/xo/cosmos', ext: '.glb', scale: 1, lift: 0, ...ROSARIO },
}

/**
 * Pack ids in the order the picker lists them. Blocks first: it is what you
 * build with, and the prototype kit second for the same reason - it is the
 * other pack you make *structures* out of rather than decorate with.
 */
export const PACK_ORDER = [
  'bb10',
  'proto',
  'peeps',
  'park',
  'plants',
  'house',
  'livingroom',
  'kitchen',
  'bedroom',
  'bathroom',
  'cafe',
  'bakerygoods',
  'restaurant',
  'cosmos',
] as const

/** Split `pack/name` into its two halves, or null if it is not one. */
export function splitModel(model: string): { pack: Pack; packId: string; name: string } | null {
  const cut = model.indexOf('/')
  if (cut < 1) return null
  const packId = model.slice(0, cut)
  const name = model.slice(cut + 1)
  const pack = PACKS[packId]
  // A name with another slash in it would escape the pack's directory, which is
  // the one thing an id must not be able to do - these end up in a fetch.
  if (!pack || name.length === 0 || name.includes('/')) return null
  return { pack, packId, name }
}

/** Where a model's file is. Empty string for an id that is not one. */
export function builderUrl(model: string): string {
  const parts = splitModel(model)
  if (!parts) return ''
  return `${parts.pack.path}/${parts.pack.prefix ?? ''}${parts.name}${parts.pack.ext}`
}

/**
 * The model's picture, for a picker tile.
 *
 * A file in the repo, shot by `scripts/render-models.ts`. The same trade the
 * lounge's palette makes for its 58 blocks (see `thumbnailUrl` there), and the
 * argument is much stronger here: the alternative is downloading and parsing a
 * glTF per tile out of 1,308, in the browser, while the editor's own WebGL
 * context is running next to it.
 *
 * A model with no file yet is not a hole - the picker falls back to drawing
 * that one itself.
 */
export function modelThumbnailUrl(model: string): string {
  const parts = splitModel(model)
  if (!parts) return ''
  return `/thumbs/builder/${parts.packId}/${parts.name}.webp`
}
