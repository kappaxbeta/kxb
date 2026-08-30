/**
 * Every asset pack the XP creator can draw from, and what each one's units
 * mean.
 *
 * ---------------------------------------------------------------------------
 * Copied from `@/domain/builder/packs`, deliberately, and not imported
 * ---------------------------------------------------------------------------
 * Provenance: a copy of src/domain/builder/packs.ts as it stood when the XP
 * creator was started. It has a sibling. If you fix a genuine bug here - a
 * wrong scale, a path that escapes its directory - fix it there too. If you
 * change *behaviour*, do not: the whole reason there are two files is that the
 * two are allowed to disagree.
 *
 * The builder is a live tool that lays out worlds. This is the front half of a
 * game engine, and it needs things the builder has no use for: a collider
 * convention per pack, a skeleton flag on the packs that hold characters, a
 * pivot rule for the models that hang off a socket rather than stand on the
 * floor. Every one of those would be dead weight in the builder's table and a
 * negotiation to add. Here they are just fields.
 *
 * The divergence is already visible in two places, and both are the point:
 *
 *   - `proto` is first here and second there. In the builder the rule is
 *     "blocks first, they are what you build with"; here the rule is "the
 *     prototype kit first, it is what an XP is made of". Neither is wrong for
 *     its own tool, and one shared array cannot say both.
 *   - The paths point at `/xp/packs/`, not at `/xo/`. Same bytes today, and a
 *     separate address space on purpose - the XP creator's art is its own, so
 *     re-exporting a pack at a different scale, or dropping one, cannot reach
 *     over and change what the builder or the lounge is drawing.
 *
 * ---------------------------------------------------------------------------
 * Why the grid is one unit
 * ---------------------------------------------------------------------------
 * Unchanged from the builder's reasoning, and worth restating because it is
 * what makes `scale` mean anything: the cell is one unit, a bb10 block is one
 * cell, and every other pack is scaled onto the same lattice. A wall you drag
 * out is a run of cells, and its thickness, its height and the step between two
 * adjacent bricks are all one cell.
 *
 * The prototype kit is the pack that made this easy: it is authored at a metre
 * a unit, and the cell is a metre, so it needs no scaling at all.
 */

/**
 * The skeletons an XP body can be, as a closed list.
 *
 * ---------------------------------------------------------------------------
 * Two rigs, and why the second one is not just a third character pack
 * ---------------------------------------------------------------------------
 * A rig is not a model. It is the vocabulary everything downstream speaks:
 *
 *   - the clips that can play on it - `Walking_A` means something on the dummy
 *     and nothing at all on a fox;
 *   - the handles the animator draws, and which way each joint folds;
 *   - the part names a masked layer may aim at - `arms` on one, `wings` on the
 *     other;
 *   - where the clips even come from. The dummy's are a shared pack of eight
 *     glTFs the runtime fetches by path; a peep carries its own eight *inside
 *     its own file*, so there is nothing to fetch and nothing shared.
 *
 * Every one of those was written against the dummy and, until this list existed,
 * written as though there could only ever be one. So the id is the thing that
 * travels - into `AnimationGraph.rig`, into the animator's saved document, into
 * the runtime's choice of clip table - and a pack declares which of the two it
 * is rather than merely declaring that it has bones.
 *
 * Closed rather than a string, and deliberately: a document naming a rig nothing
 * ships is a body that silently does not move, which is the one failure mode
 * this whole area keeps producing. The compiler is the cheapest place to catch
 * it.
 */
export const SKELETON_IDS = ['dummy', 'peepz'] as const

export type SkeletonId = (typeof SKELETON_IDS)[number]

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
   * Which skeleton these models are, for the packs that are bodies rather than
   * scenery. See the note on the two packs that set it.
   *
   * This was a `rigged: true` flag, and one flag stopped being enough the day
   * there were two skeletons: everything downstream - which clips can play on
   * it, which handles the animator draws, which parts a masked layer may name -
   * is a question about *which* rig, and a boolean can only answer whether
   * there is one. `isRigged` is still the question most callers ask and still
   * reads this.
   */
  skeleton?: SkeletonId
  /**
   * Cells to raise the model's origin above its cell floor, at scale 1.
   *
   * Everything in the prototype kit that you *build* with stands on y=0, which
   * is already the cell floor, so this is zero. It exists for a pack modelled
   * around its own centre, which is what bb10 is in the builder.
   *
   * Multiplied by the placement's own scale, not by the pack's: the pack scale
   * is what makes one authored cube one cell in the first place, so counting it
   * twice would sink every block half a cell into the floor.
   */
  lift: number
  /** Who drew it. Shown in credits; none of them require it. */
  author: string
  /**
   * Every pack we ship is CC0 - a waiver rather than a licence with
   * conditions, so commercial use, modification and redistribution of the
   * files themselves are all permitted, by us and by anyone we hand an XP to,
   * with no attribution due.
   *
   * Typed as the literal so a pack with actual terms cannot be added without
   * the compiler asking what that means. It matters more here than in the
   * builder: an XP is meant to be handed over one day, and the moment art with
   * conditions gets in, that stops being free.
   */
  licence: 'CC0'
  /**
   * Where it came from, as the publisher's own address.
   *
   * A link rather than a copy of the licence file: CC0 is irrevocable, so
   * there is no future in which the original text is evidence of anything, and
   * the fact that matters is the word above.
   *
   * This travels. It is copied into a saved XP's `packs[]` entry, and an
   * export writes it into the folders it ships, so a recipient can always see
   * where the art came from and fetch the pack themselves. It is also why
   * there is no asset registry to build - itch.io and kenney.nl already host
   * these, version them, and are the address the authors want people sent to.
   */
  source: string
}

const KAY = { author: 'Kay Lousberg', licence: 'CC0', source: 'https://kaylousberg.itch.io/' } as const

/**
 * The other publisher this table draws from.
 *
 * Six kits arrived at once - the peeps, a prototype kit, a space station, a
 * minigolf course, a blaster set and a garage full of cars - and they are the
 * first packs here not drawn by a Lousberg. Same waiver, different hand: CC0,
 * and the same argument as the constant above about why that word is typed
 * rather than assumed.
 *
 * Worth knowing before reading the six `scale` notes: Kenney's kits are **not**
 * drawn to one shared unit the way Kay's are. A blaster is a hand prop at a
 * metre a unit and a space-station wall is one unit tall for a doorway you are
 * meant to walk through, in the same download. So each of the six is measured
 * on its own and two of them are not 1.
 */
const KENNEY = { author: 'Kenney', licence: 'CC0', source: 'https://kenney.nl/' } as const

/**
 * The third, and the one whose kits this app was decorating rooms with long
 * before there were cartridges.
 */
const ISA = { author: 'Isa Lousberg', licence: 'CC0', source: 'https://tinytreats.itch.io/' } as const

/**
 * The homestead's kits: declared, credited, and deliberately not offered.
 *
 * ---------------------------------------------------------------------------
 * Why these are in the table but not in `PACK_ORDER`
 * ---------------------------------------------------------------------------
 * `PACK_ORDER` is what the model picker lists, what `CATALOGUE` is built from
 * and what `/xp` counts. These belong to none of that: no XP level places a
 * `tiny-kitchen/sink` on a lattice, there are no measured extents for them and
 * no thumbnails rendered, and putting them in the picker would offer a builder
 * nine hundred models drawn to a different grid than everything beside them.
 *
 * What they *are* is the art two cartridges draw - the café and the house, see
 * `public/xp/xps/dream-restaurant.xp.json` - and a cartridge is where the two halves of
 * this table finally come apart. Boxing and Mau-Mau ship their own art inside
 * their packages and declare no packs at all, which is why `parseXp` stopped
 * requiring the field for a framed document. The café is the other kind: it is
 * a room of this product, drawn with kits we serve from `public/` and have
 * always served, and a document that named none of them would be a document
 * claiming to draw nothing.
 *
 * So the ten entries below exist for exactly one job: `document.packs` is
 * validated against this table and its provenance is filled in *from* it - see
 * the note in `parseXp` about a hand-written file that must not be able to
 * claim a different author. `/browse/xp/<id>` and the operator catalogue read
 * that, so the café credits Isa Lousberg and Kay Lousberg on its own page
 * without any of it having to be typed into a JSON file where it could be
 * typed wrongly.
 *
 * `scale` and `lift` are measured numbers rather than placeholders - the same
 * ones `src/domain/builder/packs.ts` uses, which is the table the *app* places
 * these with - so that the day one of them does become buildable, nothing here
 * has to be discovered again. They are unread today.
 *
 * The `tiny-` prefix is not decoration. These directories are called `cafe`,
 * `house`, `kitchen` and `park`, which are the four most likely names for a
 * pack somebody adds next, and a collision here silently redirects a document's
 * credit line to the wrong author.
 */
const TINY = (label: string, folder: string) =>
  ({
    label,
    path: `/tinyXO/${folder}`,
    ext: '.gltf' as const,
    // Authored at two units per grid square, where this grid is a unit a cell.
    scale: 0.5,
    lift: 0,
    ...ISA,
  })

/**
 * The platformer kit, as five packs rather than one.
 *
 * It ships as five directories - four colourways of the same 118 pieces, and a
 * neutral folder of the 53 that have no colour to have: the spikes, the chains,
 * the bomb, the cannon. One pack per directory is not how anybody would draw
 * this on a whiteboard, and it is the right shape anyway, because of a guard in
 * `splitModel`:
 *
 *     if (!pack || name.length === 0 || name.includes('/')) return null
 *
 * A model id becomes a URL. A name with a slash in it is the one thing an id
 * must not be able to contain, so `platformer/blue/barrier_1x1x1_blue` cannot
 * exist without loosening the rule that stops an id escaping its own directory -
 * and loosening a path guard to save four lines of table is a bad trade in
 * exactly the way that only shows up once.
 *
 * The cost is five groups in the picker instead of one. That is what the search
 * box is for, and the colours are a real distinction anyway: a level built out
 * of `blue` and a level built out of `red` are different-looking levels, which
 * is the whole reason the kit ships them apart.
 */
const PLATFORMER_COLOURS = ['neutral', 'blue', 'green', 'red', 'yellow'] as const

const PLATFORMER = Object.fromEntries(
  PLATFORMER_COLOURS.map((colour) => [
    `platformer-${colour}`,
    {
      label: `Platformer · ${colour[0].toUpperCase()}${colour.slice(1)}`,
      path: `/xp/packs/platformer/${colour}`,
      ext: '.gltf',
      /**
       * Measured rather than assumed - `bun run xp:measure platformer-neutral`.
       *
       * The kit names its own pieces in cells and then authors them at a unit a
       * cell, so the two already agree: `floor_wood_1x1` is 1.000 across,
       * `barrier_4x1x4` is 4 by 4 by 1, `pillar_1x1x8` is 8 tall. Same grid the
       * prototype kit is on, and nothing to convert.
       *
       * The half-height floors are the one thing to know: `floor_wood_*` is
       * 0.500 tall, so a platform is half a cell thick and a stack of two makes
       * a full one.
       */
      scale: 1,
      /**
       * Zero, even though twelve of the neutral pieces are pivoted at their
       * middle rather than stood on the floor - the ball, the bomb, the sawblade,
       * the chains, the spikeballs.
       *
       * `lift` is a fact about a *pack* whose models are all centred, which is
       * what bb10 is in the builder. This pack is mixed, so lifting all of it
       * would sink the 41 that already stand correctly. The per-model answer is
       * `floorOffset`, which reads the measured `min` out of the catalogue and is
       * already what the renderer uses.
       */
      lift: 0,
      ...KAY,
    } satisfies Pack,
  ]),
) as Record<string, Pack>

/**
 * The forest kit, as eight packs - one per colourway.
 *
 * Same argument as the platformer's five: `splitModel` refuses an id with a
 * slash in it, so `forest/color1/Tree_1_A_Color1` cannot be an id without
 * loosening the guard that stops an id escaping its directory.
 *
 * Unlike the platformer's, these eight are *not* five named colours - they are
 * `Color1`..`Color8`, a palette rather than a paint - so they do not collapse
 * into one tile the way `arch_blue` and `arch_red` do. Eight groups of 198 is
 * a lot of picker, which is what the pack toggles in the picker's settings are
 * for: turn seven of them off and the forest is one colourway again.
 *
 * All eight share one texture atlas, byte for byte - the colour is which
 * corner of it the UVs point at - so the eight folders cost 198 meshes each
 * and one image.
 */
const FOREST_COLOURS = [1, 2, 3, 4, 5, 6, 7, 8] as const

const FOREST = Object.fromEntries(
  FOREST_COLOURS.map((n) => [
    `forest-color${n}`,
    {
      label: `Forest · Color ${n}`,
      path: `/xp/packs/forest/color${n}`,
      ext: '.gltf',
      /**
       * One. The kit names its hills in cells - `Hill_4x2x4` - and measures
       * 4.47 x 4 x 2.5 against that, which is the usual bevelled-silhouette
       * overshoot rather than a different unit, and its trees stand 4.2 units
       * against a 4-unit dungeon pillar and a 2.4-unit dummy.
       */
      scale: 1,
      lift: 0,
      ...KAY,
    } satisfies Pack,
  ]),
) as Record<string, Pack>

/**
 * The medieval hexagon kit, as four packs rather than eighteen.
 *
 * It ships nested three deep - `tiles/coast/waterless`, `buildings/blue` - and
 * a folder per leaf would be eighteen groups in the picker for one kit. The
 * colourways merge instead of splitting, because unlike the platformer's this
 * kit already puts the colour in the *filename*: `building_barracks_blue`
 * sits next to `building_barracks_red`, nothing collides, and the five
 * `hexagons_medieval.png` atlases are one file five times over.
 */
const MEDIEVAL = Object.fromEntries(
  (
    [
      ['tiles', 'Tiles'],
      ['buildings', 'Buildings'],
      ['units', 'Units'],
      ['decoration', 'Decoration'],
    ] as const
  ).map(([dir, name]) => [
    `medieval-${dir}`,
    {
      label: `Medieval · ${name}`,
      path: `/xp/packs/medieval/${dir}`,
      ext: '.gltf',
      /**
       * A half, so one hex is one cell.
       *
       * This is the one pack in the table that is a *board* rather than a
       * place: every tile measures 2 units flat-to-flat, its soldiers are 0.34
       * tall and its castle 3.98, which is a tabletop army and not a building
       * you walk into. Halving it puts a hex on the cell the grid already
       * draws, and keeps the kit's own internal scale - a castle two cells
       * tall over a one-cell hex - which is what matters when the pieces are
       * only ever seen next to each other.
       */
      scale: 0.5,
      lift: 0,
      ...KAY,
    } satisfies Pack,
  ]),
) as Record<string, Pack>

export const PACKS: Record<string, Pack> = {
  /**
   * The homestead's ten, first because they are the odd ones out: every other
   * entry in this table is a pack you build levels with, and these are the ten
   * a cartridge draws. See the note above `TINY`.
   */
  restaurant: {
    label: 'Restaurant',
    path: '/xo/restaunt',
    ext: '.gltf',
    // Two units per square, like the kits it is mixed with - the café's
    // counters run x from -1 to +1 and its floor tiles are exactly 2 x 2.
    scale: 0.5,
    lift: 0,
    ...KAY,
  },
  'tiny-cafe': TINY('Tiny Treats · Café', 'cafe'),
  'tiny-kitchen': TINY('Tiny Treats · Kitchen', 'kitchen'),
  'tiny-bakery': TINY('Tiny Treats · Bakery', 'bakerygoods'),
  'tiny-house': TINY('Tiny Treats · House', 'house'),
  'tiny-living': TINY('Tiny Treats · Living room', 'livingroom'),
  'tiny-bedroom': TINY('Tiny Treats · Bedroom', 'bedroom'),
  'tiny-bathroom': TINY('Tiny Treats · Bathroom', 'bathroom'),
  'tiny-park': TINY('Tiny Treats · Park', 'park'),
  'tiny-plants': TINY('Tiny Treats · Plants', 'plants'),
  /**
   * The prototype kit, and the only pack authored in metres.
   *
   * `scale: 1` is measured rather than assumed: a table is 0.8 units tall, a
   * door 2.8, a locker 3, the dummy 2.197, and every structural piece is an
   * integer - walls 4 by 4 by 1, floors 4 by 4, the big cube 4 a side and the
   * small one 2. That is a set drawn at a metre a unit, and this grid is a
   * metre a cell, so a wall spans exactly four blocks with nothing to convert.
   */
  proto: {
    label: 'Prototype',
    path: '/xp/packs/proto',
    ext: '.gltf',
    scale: 1,
    lift: 0,
    ...KAY,
  },
  /**
   * The dummy, on its own, because it is a skeleton rather than a prop.
   *
   * The same figure as `proto/Dummy_Base`, exported as a rigged GLB: 23 bones,
   * no clips, which is what makes it the thing to animate against. It is the
   * default player blueprint's model and the first of the two skeletons an XP
   * can use.
   *
   * Its own pack rather than a file inside `proto` because the picker should
   * not offer a rigged character in the middle of the barrels, and because the
   * second skeleton (the peeps) will want the same treatment.
   */
  dummy: {
    label: 'Characters',
    path: '/xp/packs/dummy',
    ext: '.glb',
    /**
     * These models have bones, and that changes how they are drawn.
     *
     * A field on the *pack* rather than on each model, because that is already
     * how this one is organised - see the note above: the dummy has its own pack
     * so the picker does not offer a rigged character in the middle of the
     * barrels. The second skeleton is `peepz`, and the sentence that used to end
     * "will be a second pack and will set this too" can now be read as a fact.
     *
     * What reads it is the runtime's choice of path. Everything else is drawn
     * with one `InstancedMesh` per model, which is what makes a level of a
     * thousand placements one draw call each - and an instanced skeleton is a
     * bind pose, because instancing shares one geometry and a skinned pose is a
     * different geometry per body. So a rigged model drawn the ordinary way is a
     * T-pose, silently.
     */
    skeleton: 'dummy',
    // Measured at 2.396 cells in the GLB. Left at true scale here; the player
    // blueprint carries its own ~0.82 so the model's eyes land where the
    // camera is. Sizing a character to a camera is a blueprint decision, not
    // a pack one - the architecture around it is metric and already correct.
    scale: 1,
    lift: 0,
    ...KAY,
  },
  /**
   * The peeps, and the second skeleton an XP can use.
   *
   * The same twenty-four animals the lounge has always drawn, re-exported under
   * `/xp/packs/` for the reason at the top of this file: the creator's art is
   * its own address space, and a level made out of foxes should not change
   * because the lounge re-scaled its avatars.
   *
   * ---------------------------------------------------------------------------
   * A skeleton that is not a skeleton
   * ---------------------------------------------------------------------------
   * `skeleton: 'peepz'` is doing something slightly different from the dummy's.
   * A peep has no skin and no joints at all - `skins` is empty in every one of
   * the twenty-four files. It is a **node hierarchy**: `root`, a `body` with a
   * `tail` and a pair of `wing`s hung off it, and up to four `leg`s beside it,
   * each a rigid mesh the clips move whole.
   *
   * That distinction matters exactly twice and nowhere else. `SkeletonUtils.clone`
   * is unnecessary here (a plain clone would do, since there is no skin to rebind)
   * and harmless, so the runtime uses one path for both. And an instanced draw is
   * just as wrong: instancing shares one geometry, and six parts turning
   * independently is six transforms per body. So it takes the rigged path for the
   * same reason with a different proof.
   *
   * ---------------------------------------------------------------------------
   * Its own clips, in its own file
   * ---------------------------------------------------------------------------
   * The other real difference, and the one the runtime has to know about: a peep
   * carries `static`, `idle`, `walk`, `run`, `eat`, `dance`, `gesture-positive`
   * and `gesture-negative` **inside its own glb**. There is no `Rig_Medium` to
   * fetch, nothing shared between the twenty-four, and no clip a level can add
   * without re-exporting the animal. Eight is what a peep can do.
   *
   * Scale 1, measured: they run 1.43 to 2.01 units tall against a metre a cell,
   * which is the pack the lounge has always described as "already drawn at play
   * scale". The player blueprint's `PLAYER_SCALE` exists to shrink the *dummy*
   * onto this; a peep needs none of it.
   */
  peepz: {
    label: 'Peeps',
    path: '/xp/packs/peepz',
    ext: '.glb',
    // Every file is `animal-<name>.glb`, and `peepz/animal-fox` reads like a
    // stutter next to `peepz/fox`. The same prefix the builder's copy strips.
    prefix: 'animal-',
    scale: 1,
    lift: 0,
    skeleton: 'peepz',
    ...KENNEY,
  },
  /**
   * The adventurers - nine dressed characters, and *not* a third skeleton.
   *
   * Their joint list is the dummy's, name for name: the same 23 bones
   * (`root, hips, spine, chest … handslot.l/r … toes.l/r`) in a different
   * export order, which the mixer does not care about. So `skeleton: 'dummy'`
   * is a fact rather than a shortcut - a Knight binds the same `Rig_Medium`
   * clips, offers the same grip sockets, and takes the same `SkinnedBody`
   * path the dummy always has. Only the mesh hanging off those bones changes.
   *
   * Unlike a peep, an adventurer carries no clips of its own - like the
   * dummy, it is nothing until the rig's clip pack animates it. That is the
   * right shape for a character that is *sold* as a skin: the look is the
   * product, the moves stay the platform's.
   */
  adventurers: {
    label: 'Adventurers',
    path: '/xp/packs/adventurers',
    ext: '.glb',
    // The dummy's grid: the same author drawing the same figure at a metre a
    // unit, so the player blueprint's scale needs no third opinion.
    scale: 1,
    lift: 0,
    skeleton: 'dummy',
    ...KAY,
  },
  /**
   * The monsters - two more characters on the dummy's rig, same argument as
   * the adventurers': the joint list is the dummy's 23 bones name for name,
   * textures embedded, no clips of their own.
   *
   * `.glb` is doing quiet work here: the folder also holds a stray `.gltf`
   * prop that rode along with the drop, and the extension filter is what
   * keeps the picker offering two monsters rather than two monsters and a
   * broken building.
   */
  kappa: {
    label: 'Monsters',
    path: '/xp/packs/kappa',
    ext: '.glb',
    scale: 1,
    lift: 0,
    skeleton: 'dummy',
    ...KAY,
  },
  ...PLATFORMER,
  /**
   * The eleven flat kits, all at scale 1.
   *
   * Measured, not assumed, and the number is the same for all of them for one
   * reason: they are the same author's kits drawn against the same figure. A
   * dungeon pillar is 4 units and so is a proto wall; a furniture table is
   * 1 x 1 x 1 and so is a proto one; the adventurer's two-handed sword is 2.37
   * and the rigged dummy is 2.40, which is what "authored to fit the character
   * we already ship" looks like in numbers. Nothing here needs converting.
   *
   * `boardgame` is the exception and has its own note.
   */
  adventure: {
    label: 'Adventure',
    path: '/xp/packs/adventure',
    ext: '.gltf',
    // Weapons, shields and potions drawn to the dummy's hand: the two-handed
    // sword is 2.366 against a 2.396 figure.
    scale: 1,
    lift: 0,
    ...KAY,
  },
  /**
   * The board game kit, at a twentieth - and the only pack in the table that
   * is not authored at a metre a unit.
   *
   * Its own numbers say so plainly: a playing card is 4.3 x 6 units and a
   * board is 10 across, which at scale 1 is a six-metre card lying on a
   * ten-metre board. That is not a kit drawn small, it is a kit drawn *large
   * on purpose* so the pips read - and the honest correction is at the pack,
   * where every piece moves together, rather than per placement.
   *
   * 0.05 puts the board at half a cell, a card at 30cm, a chip at 15 and a d6
   * at under four - a game laid out on a table, which is the only place these
   * make sense. It is also the only number here you might reasonably argue
   * with: doubling it makes a board you could stand on.
   */
  boardgame: {
    label: 'Board Game',
    path: '/xp/packs/boardgame',
    ext: '.gltf',
    scale: 0.05,
    lift: 0,
    ...KAY,
  },
  city: {
    label: 'City',
    path: '/xp/packs/city',
    ext: '.gltf',
    // A toy city on the same lattice: road tiles are exactly 2 x 2 and the
    // buildings 3 units tall, so two cells to a road and a house you can see
    // over. Left true rather than blown up to walking scale - the kit's
    // windows and doors are painted on.
    scale: 1,
    lift: 0,
    ...KAY,
  },
  dungeon: {
    label: 'Dungeon',
    path: '/xp/packs/dungeon',
    ext: '.gltf',
    // The clearest measurement of the lot: floor tiles are 4 x 4, pillars 4
    // tall, small tables 1 x 1 x 1. Same grid as the prototype kit's walls.
    scale: 1,
    lift: 0,
    ...KAY,
  },
  furniture: {
    label: 'Furniture',
    path: '/xp/packs/furniture',
    ext: '.gltf',
    // Tables and cabinets on integer units - `table_small` is 1 x 1 x 1.
    scale: 1,
    lift: 0,
    ...KAY,
  },
  halloween: {
    label: 'Halloween',
    path: '/xp/packs/halloween',
    ext: '.gltf',
    // Floors 2 x 2, pillars 4.4 tall, and a jack-o-lantern at 1.5 - the same
    // set of dimensions as the dungeon kit, which it is meant to dress.
    scale: 1,
    lift: 0,
    ...KAY,
  },
  holiday: {
    label: 'Holiday',
    path: '/xp/packs/holiday',
    ext: '.gltf',
    // Gingerbread walls 4 tall with a 4.28 footprint - the overshoot is the
    // icing, which sticks out past the wall it is piped onto.
    scale: 1,
    lift: 0,
    ...KAY,
  },
  resources: {
    label: 'Resources',
    path: '/xp/packs/resources',
    ext: '.gltf',
    // Barrels, sacks and ore at around a metre, sat on y=0.
    scale: 1,
    lift: 0,
    ...KAY,
  },
  space: {
    label: 'Space',
    path: '/xp/packs/space',
    ext: '.gltf',
    // A miniature base rather than a walkable one: the dropship is 3 units
    // long and a landing pad 2.5 across. True scale, same reasoning as `city`.
    scale: 1,
    lift: 0,
    ...KAY,
  },
  tools: {
    label: 'Tools',
    path: '/xp/packs/tools',
    ext: '.gltf',
    // Hand props at hand size - an axe 1.05 tall, a lockpick 0.94, an anvil
    // 1.6 across. Most of these are centred rather than stood on a floor,
    // which is `floorOffset`'s problem and not a pack `lift`.
    scale: 1,
    lift: 0,
    ...KAY,
  },
  weapons: {
    label: 'Weapons',
    path: '/xp/packs/weapons',
    ext: '.gltf',
    // Drawn to the same figure as `adventure`: a one-handed sword is 1.79
    // against a 2.40 dummy.
    scale: 1,
    lift: 0,
    ...KAY,
  },
  /**
   * Kenney's prototype kit, at three - and the reason the id is not `proto`.
   *
   * Two prototype kits in one table looks like a mistake and is not: they are
   * different *shapes* of the same idea. Kay's is a set of finished-looking grey
   * rooms drawn in metres; this one is a blockout kit - numbers, arrows, floor
   * buttons, target boards, indicator decals - drawn on a unit tile. You reach
   * for the first to make a place and the second to mark one out.
   *
   * ---------------------------------------------------------------------------
   * Three, and the doorway is what decides it
   * ---------------------------------------------------------------------------
   * The kit is authored on a one-unit tile: `wall` is 1.0 tall, `floor-square`
   * 1.0 across, `shape-cube` 1.0 a side. Left at 1 that is a wall a player steps
   * over and a doorway - 0.7 in the door pieces - that a 1.70-cell body cannot
   * fit through. There is no reading of "scale 1" under which this kit is
   * walkable, which is the only thing it is for.
   *
   * Three clears the doorway (2.10 cells against a 1.70 body), puts the wall at
   * three cells and lands the tile on an integer number of them, so a floor
   * dragged out still snaps. An integer matters more here than the exact number:
   * a 2.4 that made the figurines exactly peep-height would put every tile on a
   * 2.4-cell pitch and nothing would ever line up with anything else in the table.
   *
   * What it costs, stated rather than discovered: the furniture-shaped pieces
   * come out chunky - a crate is 1.5 cells, `shape-cube` is a three-metre cube -
   * because the kit draws its props oversized against its own doors. That is
   * Kenney's house style and not a number this can fix; a placement's own `scale`
   * is where an author argues with it.
   */
  'proto-kenny': {
    label: 'Prototype · Kenney',
    path: '/xp/packs/proto-kenny',
    ext: '.glb',
    scale: 3,
    lift: 0,
    ...KENNEY,
  },
  /**
   * The space station, at three for exactly the prototype kit's reasons.
   *
   * Same publisher, same one-unit tile, same 0.7 doors, and the two are meant to
   * be built with together - so a different number here would mean a station you
   * cannot join to a blockout without doing arithmetic per placement.
   *
   * Measured: `wall` 1.0 x 1.0 x 0.3, `floor` 1.0 square, `door-single` 0.7 tall,
   * `chair` 0.55, `table` 0.4. At three that is a three-cell room module, a
   * 2.10-cell doorway, and a chair you sit rather high in.
   */
  'space-station': {
    label: 'Space Station',
    path: '/xp/packs/space-station',
    ext: '.glb',
    scale: 3,
    lift: 0,
    ...KENNEY,
  },
  /**
   * The blaster set, at one, and the pack that proves Kenney's kits are not on
   * one grid.
   *
   * Hand props measured against the figure that holds them, the same test
   * `adventure` and `weapons` pass: the longest rifle is 1.39 units against a
   * 2.40-unit dummy, which is the ratio a real rifle has to a real person. The
   * pistols run 0.42 to 0.91 and the ammo crates 0.8 to 1.2, all of which is a
   * metre a unit with nothing to convert - in the same download as a space
   * station that needs tripling.
   *
   * Twenty-eight of the forty are pivoted at their middle, which is right for
   * things that hang in a hand rather than stand on a floor, and is
   * `floorOffset`'s problem rather than a pack `lift`.
   */
  blaster: {
    label: 'Blasters',
    path: '/xp/packs/blaster',
    ext: '.glb',
    scale: 1,
    lift: 0,
    ...KENNEY,
  },
  /**
   * The cars, at one, and knowingly toy-sized.
   *
   * A sedan measures 1.50 x 2.55 x 1.30, which at a metre a cell is a car about
   * two-thirds the length of a real one and shorter than the person standing
   * next to it. That is not a scale error to correct: blowing it up to 4.5 cells
   * long would make it 2.3 cells tall and 2.7 wide, which is a bus wearing a
   * sedan's shape. Kenney's cars are drawn stubby on purpose and the whole kit -
   * karts at 1.43, wheels at 0.6, cones at 0.48 - is internally consistent.
   *
   * The same call `city` and `space` already made, and this one sits next to
   * `city` deliberately: a 2-unit road tile and a 2.55-unit car are a toy street
   * that reads correctly, where a life-size car on a toy road would not.
   */
  cars: {
    label: 'Cars',
    path: '/xp/packs/cars',
    ext: '.glb',
    scale: 1,
    lift: 0,
    ...KENNEY,
  },
  /**
   * The minigolf course, at one, which is the one Kenney kit that needs no
   * argument.
   *
   * A course tile is 1.0 across and 0.147 thick, a ball is 0.07 - a metre a tile
   * and a seven-centimetre ball, which is a real minigolf hole with a slightly
   * generous ball. The splines run up to 4 units, so a loop is four cells.
   *
   * Forty-four of the 126 are centred, which is what a kit of ramps, tubes and
   * flippers should be.
   */
  minigolf: {
    label: 'Minigolf',
    path: '/xp/packs/minigolf',
    ext: '.glb',
    scale: 1,
    lift: 0,
    ...KENNEY,
  },
  /**
   * The only pack in the table we drew ourselves: flat marks for the floor.
   *
   * Every other entry here is somebody's kit of *objects* - a chair, a wall, a
   * meeple, a die - and none of them is a ring you put round a piece or an
   * arrow that says which way a track runs. A board game is made of those, and
   * there was nothing to make one out of. See scripts/xp-shapes.ts, which draws
   * them, for what a flat model costs and why colour is seventy-seven files.
   *
   * Authored at a unit a cell like the rest of the flat kits, so a shape is one
   * cell across and a placement's own scale is the only thing that resizes it.
   *
   * **`lift` is not zero, and it is the only one in the table that is not.** A
   * face at exactly the height of the tile under it fights that tile for the
   * same pixels, which flickers as the camera moves - the same two-centimetre
   * answer `rings.tsx` gives on the floor of a room, for the same reason. It is
   * on the pack rather than baked into the geometry because `lift` multiplies
   * by the placement's scale and a baked offset would not: a mark scaled to a
   * tenth would sink back into the floor it was drawn a hair above.
   */
  shapes: {
    label: 'Shapes',
    path: '/xp/packs/shapes',
    ext: '.gltf',
    scale: 1,
    lift: 0.02,
    author: 'kxb',
    licence: 'CC0',
    source: 'https://kxb.team',
  },
  ...FOREST,
  /**
   * The four grass tufts the forest kit ships outside its colourways.
   *
   * A pack of four rather than four files dropped into `forest/color1`,
   * because they are not a colourway of anything - they carry no `_Color`
   * suffix and would have been the only four models in that folder with no
   * seven twins elsewhere. Their own folder is also what keeps the eight
   * colourway folders walkable: a folder holding both models and directories
   * is one pack to `xp:pack`, and its subfolders are never looked at.
   */
  'forest-grass': {
    label: 'Forest · Grass',
    path: '/xp/packs/forest/grass',
    ext: '.gltf',
    scale: 1,
    lift: 0,
    ...KAY,
  },
  ...MEDIEVAL,
}

/**
 * Pack ids in the order the picker lists them.
 *
 * The prototype kit first: it is what an XP is made of. This is where the copy
 * earns itself - the builder lists blocks first for its own good reasons, and
 * one shared array could not hold both answers.
 */
export const PACK_ORDER = [
  'proto',
  // Kay's kit first and Kenney's second, in the order you would reach for them:
  // one is a place, the other is the marks you put on it.
  'proto-kenny',
  // Then the skeletons, together, because "what do the people look like" is
  // one question with three answers rather than three unrelated packs. The
  // adventurers ride the dummy's rig; see their entry in `PACKS`.
  'dummy',
  'peepz',
  'adventurers',
  'kappa',
  // Neutral first of the five: it holds the pieces a platformer is *about* -
  // the spikes, the chains, the cannon, the bomb - where the four colourways
  // are the same 118 blocks in different paint.
  'platformer-neutral',
  'platformer-blue',
  'platformer-green',
  'platformer-red',
  'platformer-yellow',
  /**
   * Then the kits, by what you would reach for building a place: the rooms
   * first, then what stands in them, then what a character carries, then the
   * two board-shaped kits last.
   *
   * Order is the only thing organising 3,283 models into a scrollable panel,
   * and it stopped being enough on its own the moment this list went from
   * seven packs to thirty-one - which is why the picker also lets you switch a
   * pack off. The order still decides what you see when they are all on.
   */
  'dungeon',
  'city',
  // Beside `city`, because it is the traffic on those roads.
  'cars',
  'furniture',
  'halloween',
  'holiday',
  'space',
  // Beside `space`, and the pair is the same distinction as the two prototype
  // kits: `space` is a miniature you look at, this is a corridor you walk down.
  'space-station',
  'resources',
  'adventure',
  'weapons',
  // With the weapons, because that is what it is - the same shelf, drawn by
  // somebody else and pointed at a different kind of level.
  'blaster',
  'tools',
  'forest-color1',
  'forest-color2',
  'forest-color3',
  'forest-color4',
  'forest-color5',
  'forest-color6',
  'forest-color7',
  'forest-color8',
  'forest-grass',
  'medieval-tiles',
  'medieval-buildings',
  'medieval-units',
  'medieval-decoration',
  'boardgame',
  // Last with the board game, and for the same reason: it is not a place, it is
  // a game laid out on one.
  'minigolf',
  // Genuinely last, because it is not a kit at all - it is the marks you put on
  // top of whichever of the others a level is built from.
  'shapes',
] as const

/** Split `pack/name` into its two halves, or null if it is not one. */
/**
 * Does this model have bones?
 *
 * One question asked in three places already, each spelling it out by hand:
 * `blueprint.model.startsWith('dummy/')` in the editor's pose control, the
 * runtime's choice of which path draws it, and the check that a body model is a
 * body. A string test is right until there are two skeleton packs, at which
 * point every copy of it is wrong in a different place - and there are two now.
 *
 * False for a model the catalogue has never heard of, which is a remote pack
 * rather than a mistake - and drawing an unknown model instanced is what has
 * always happened to it.
 */
export function isRigged(model: string): boolean {
  return skeletonOf(model) !== null
}

/**
 * *Which* skeleton this model is, or null for a prop.
 *
 * The question `isRigged` was a lossy version of, and the one every caller
 * downstream of "yes it has bones" actually has: which clips can play on it,
 * which handles to draw, which parts a layer may name. `isRigged` is kept
 * because most callers genuinely only want the yes or no, and a call site
 * reading `skeletonOf(m) !== null` to decide how to *draw* something would be
 * saying less than it means.
 */
export function skeletonOf(model: string): SkeletonId | null {
  return splitModel(model)?.pack.skeleton ?? null
}

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
export function modelUrl(model: string): string {
  const parts = splitModel(model)
  if (!parts) return ''
  return `${parts.pack.path}/${parts.pack.prefix ?? ''}${parts.name}${parts.pack.ext}`
}

/**
 * The model's picture, for a picker tile.
 *
 * A file in the repo, shot by `scripts/xp-thumbs.ts`. The alternative is
 * downloading and parsing a glTF per tile while the editor's own WebGL context
 * runs next to it, which is what the builder used to do and why its picker
 * scrolled like it was waiting.
 */
export function thumbnailUrl(model: string): string {
  const parts = splitModel(model)
  if (!parts) return ''
  return `/xp/thumbs/${parts.packId}/${parts.name}.webp`
}

/** One line of credit per pack, for an export's CREDITS.txt and the About panel. */
export function credits(): { label: string; author: string; licence: string; source: string }[] {
  return PACK_ORDER.map((id) => ({
    label: PACKS[id].label,
    author: PACKS[id].author,
    licence: PACKS[id].licence,
    source: PACKS[id].source,
  }))
}
