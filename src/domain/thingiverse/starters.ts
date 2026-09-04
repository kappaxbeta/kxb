import {
  freshSpec,
  freshUse,
  type BlueprintSpec,
} from '@/domain/thingiverse/blueprint'
import { freshHold, type HoldSpec } from '@/domain/thingiverse/hold'

/**
 * Things that are already something, in sets.
 *
 * ---------------------------------------------------------------------------
 * Why the shelf needs a shelf
 * ---------------------------------------------------------------------------
 * The workbench can express a burger that cooks, a turret that fires and a
 * door that opens when a button is pressed, and until now the only way to find
 * that out was to read `./states`, `./fight` and `./craft` and then fill in
 * eleven panels in the right order. Every one of those objects is four
 * decisions somebody has to make *before* they can see whether they wanted it -
 * which socket the muzzle is, what a broken crate goes to, which word the
 * recipe eats - and getting any of them wrong looks exactly like nothing
 * happening.
 *
 * So this is the same argument `@/domain/builder/starters` makes about a bare
 * 25x25 slab, applied one level down: a handful of things that are already a
 * thing, ordinary enough to be worth changing. Drawn onto the space's own
 * shelf as ordinary blueprints - not a second kind of object, not read-only,
 * not linked back here - so the moment one lands it is simply a blueprint that
 * space owns, with the composer one click away.
 *
 * ---------------------------------------------------------------------------
 * Sets, because half of these mean nothing alone
 * ---------------------------------------------------------------------------
 * A cutting board with a recipe for a burger is furniture until there is a bun
 * and a patty to put on it; a door that opens on `open` is a door that never
 * opens until something shouts the word. Both halves are separate blueprints
 * and always will be - an item is a *word* here (see `./craft`) and a word is
 * resolved against the shelf - so a starter that arrived alone would be a
 * starter that appears broken.
 *
 * A set is therefore the unit somebody adds: the kitchen is nine things that
 * know about each other, and the button knows the door's word because they
 * were written on the same afternoon.
 *
 * ---------------------------------------------------------------------------
 * Everything here is tagged `kxb`
 * ---------------------------------------------------------------------------
 * One tag, on every starter, so the space can tell what it made from what we
 * handed it - and so a shelf that has collected four sets can be filtered back
 * down to "the ones I drew myself". It is a tag rather than a column because
 * that is what a tag is for, and because the moment somebody edits one of these
 * into their own thing the flag stops being true in any useful sense: they can
 * take the tag off, which is the honest way for a claim like this to end.
 *
 * ---------------------------------------------------------------------------
 * What the numbers are, and how they were arrived at
 * ---------------------------------------------------------------------------
 * Every offset in this file is in **cells of the drawn thing** - the model's
 * own bounding box times its pack's scale, which is the frame `seatOf` and
 * `socketsOf` resolve in. They were measured off the glTFs rather than guessed,
 * so a bun lands on the board and not inside it, and the two places a guess
 * survives are named where they are made.
 *
 * Clips are `null` throughout, including the seats. Which clips exist is a fact
 * about the *body* (see `BlueprintSpec.clip` on why nothing here checks a clip
 * name), and a starter that shipped `sit` would be a couch that plays nothing
 * on every space that has not posed one. A space that authors a sit at
 * /t/[slug]/thingiverse/clips fills the three fields in the composer, once.
 */

/** The tag every starter carries. See the note above. */
export const KXB_TAG = 'kxb'

/** One thing we already made. */
export interface Starter {
  /** Stable, ours, and never seen by anybody: it names the button. */
  id: string
  /**
   * What it is called on the shelf.
   *
   * Load-bearing for the items: a slot that takes `bun` finds the blueprint by
   * that name, so renaming "Bun" breaks the board that eats it. The things that
   * are *ingredients* say so in their hint.
   */
  name: string
  /** One line: what it does, not what it is. */
  hint: string
  spec: BlueprintSpec
}

/** Some things that know about each other. */
export interface StarterSet {
  id: string
  title: string
  /** One line under the title. What the set is for. */
  hint: string
  things: readonly Starter[]
}

/**
 * A spec, with the set's tags already on it.
 *
 * `freshSpec` first, so a starter is only ever the ordinary default plus what
 * it says - which means a change to what a fresh blueprint *is* (the body,
 * famously, used to be null) reaches these too rather than leaving forty
 * hand-written copies of a decision behind.
 */
function spec(set: string, model: string, over: Partial<BlueprintSpec> = {}): BlueprintSpec {
  return { ...freshSpec(model), ...over, tags: [KXB_TAG, set, ...(over.tags ?? [])] }
}

/**
 * Something small you carry: it falls, and you walk through it.
 *
 * Both halves matter. A pistol that blocks is a pistol you cannot walk over
 * once it is on the floor, and an item with no body is an item that hangs where
 * it was let go.
 */
function item(set: string, model: string, over: Partial<BlueprintSpec> = {}): BlueprintSpec {
  return spec(set, model, { blocking: false, body: {}, ...over })
}

/**
 * Something that stands where it was put: it does not fall, and it is solid.
 *
 * `body: null` rather than `{}` for everything with a socket on it, and the
 * reason is what a socket is: a coordinate in the thing's own frame. A bench
 * that settles half a cell into the floor takes the burger on it down too.
 */
function fixture(set: string, model: string, over: Partial<BlueprintSpec> = {}): BlueprintSpec {
  return spec(set, model, { body: null, ...over })
}

/**
 * How a thing sits in a fist, as a nudge off the default.
 *
 * Every grip in this file is `freshHold()` plus two or three numbers, because
 * that is what a grip is: the hand is already in the right place and the model
 * is already the right way up, and what is left is which way it points and how
 * far out of the fist it sits. Written as a helper so a set of six weapons is
 * six lines rather than six blocks that differ in one field.
 *
 * Angles are radians here, as they are in the spec. The composer's panel shows
 * degrees, which is the one place a person meets them.
 */
function grip(over: Partial<HoldSpec> = {}): HoldSpec {
  return { ...freshHold(), ...over }
}

// ---------------------------------------------------------------------------
// The shooting range
// ---------------------------------------------------------------------------

/**
 * Why every model here is `xp:proto/...` rather than `proto/...`
 *
 * They are the same files under two registries, and only one of them stands up:
 * the guns, the barrel and the target are authored around their own centre, and
 * the level catalogue records how far each has to be lifted to stand on the
 * floor (`floorOffset`) while the world catalogue does not. Summoned from the
 * unprefixed pack, a pistol is a pistol buried to the trigger guard.
 */
const RANGE = 'range'

const range: StarterSet = {
  id: RANGE,
  title: 'Shooting range',
  hint: 'A rack you take a gun off, a turret that fires back, and things to knock over.',
  things: [
    {
      id: 'pistol',
      name: 'Pistol',
      hint: 'Take it off the rack with G, and click to fire it. Drop it where you like.',
      spec: item(RANGE, 'xp:proto/Gun_Pistol', {
        // Both models point down +Z, and so does a body: the peep and the XP rig
        // are both drawn facing the way their yaw says. So a gun needs no turn
        // at all - it is already pointing where its owner is looking - and the
        // nudge is only out of the middle of the fist.
        hold: grip({ at: { x: 0, y: 0.05, z: 0.14 }, scale: 0.9 }),
        fight: {
          weapon: {
            damage: 12,
            reach: 24,
            every: 0.5,
            at: 'people',
            shot: { model: 'xp:proto/Bullet', speed: 40, scale: 1 },
          },
        },
      }),
    },
    {
      id: 'rifle',
      name: 'Rifle',
      hint: 'The other one on the rack. Slower, harder, and reaches further.',
      spec: item(RANGE, 'xp:proto/Gun_Rifle', {
        hold: grip({ at: { x: 0, y: 0.05, z: 0.3 }, scale: 0.8 }),
        fight: {
          weapon: {
            damage: 22,
            reach: 32,
            every: 0.95,
            at: 'people',
            shot: { model: 'xp:proto/Bullet', speed: 55, scale: 1 },
          },
        },
      }),
    },
    {
      id: 'rack',
      name: 'Weapon rack',
      hint: 'Holds two guns. G takes one, G puts one back.',
      spec: fixture(RANGE, 'xp:proto/Weaponrack', {
        // The rack is 1.4 wide, 1.5 tall and 0.8 deep, and its two bars sit at
        // roughly two thirds and one third of that. Guns hang slightly proud of
        // the back panel, which is what the z is.
        sockets: [
          { name: 'upper', at: { x: 0, y: 1.05, z: 0.15 }, turn: 0 },
          { name: 'lower', at: { x: 0, y: 0.6, z: 0.15 }, turn: 0 },
        ],
        craft: {
          slots: [
            { socket: 'upper', takes: ['rifle', 'pistol'], gives: 'rifle' },
            { socket: 'lower', takes: ['pistol', 'rifle'], gives: 'pistol' },
          ],
          recipes: [],
        },
      }),
    },
    {
      id: 'turret',
      name: 'Turret',
      hint: 'Lay it down and stand back: it shoots whoever walks in front of it.',
      spec: fixture(RANGE, 'xp:adventure/turret_base', {
        parts: [
          {
            model: 'xp:proto/Gun_Rifle',
            at: { x: 0, y: 0.85, z: 0.2 },
            turn: 0,
            scale: 0.9,
            // The rifle is 1.65 long about its own origin, so its nose is a
            // little over a cell forward. The muzzle is the one number here
            // that is eyeballed rather than measured: a bullet leaving the
            // wrong end of the barrel is visible, which is the failure this
            // whole file prefers to a refusal.
            sockets: [{ name: 'muzzle', at: { x: 0, y: 0, z: 1 }, turn: 0 }],
          },
        ],
        fight: {
          health: { max: 120, hurtBy: ['dash', 'kick', 'shot'] },
          weapon: {
            damage: 8,
            reach: 10,
            every: 1.5,
            at: 'people',
            shot: { model: 'xp:proto/Bullet', speed: 26, scale: 1, from: 'muzzle' },
          },
        },
        states: {
          start: 'up',
          states: [
            // `restore` on the state it comes *back* to, which is the one thing
            // `freshRespawn` exists to stop everybody getting backwards: a
            // turret that healed on the way out spends its dead minute at full
            // health. See the note over `freshRespawn`.
            { name: 'up', restore: true, changes: [{ when: 'broken', to: 'down' }] },
            {
              name: 'down',
              hidden: true,
              blocking: false,
              emit: 'turret down',
              changes: [{ when: 'after', to: 'up', seconds: 20 }],
            },
          ],
        },
      }),
    },
    {
      id: 'target',
      name: 'Target',
      hint: 'Shoot it, kick it or dash it. It shouts "hit" and comes back in six seconds.',
      spec: fixture(RANGE, 'xp:proto/target_small', {
        fight: {
          // No bar: the whole point of a target is that you can tell how it is
          // doing by looking at it. See `HealthSpec.bar`.
          health: { max: 30, bar: false, hurtBy: ['shot', 'dash', 'kick'] },
        },
        states: {
          start: 'up',
          states: [
            { name: 'up', restore: true, changes: [{ when: 'broken', to: 'down' }] },
            {
              name: 'down',
              hidden: true,
              blocking: false,
              emit: 'hit',
              changes: [{ when: 'after', to: 'up', seconds: 6 }],
            },
          ],
        },
      }),
    },
    {
      id: 'barrel',
      name: 'Barrel',
      hint: 'Falls where you drop it, breaks when you run into it hard enough.',
      spec: spec(RANGE, 'xp:proto/Barrel_A', {
        fight: { health: { max: 40, hurtBy: ['shot', 'dash', 'kick', 'bump'] } },
        states: {
          start: 'whole',
          states: [
            { name: 'whole', restore: true, changes: [{ when: 'broken', to: 'gone' }] },
            {
              name: 'gone',
              hidden: true,
              blocking: false,
              changes: [{ when: 'after', to: 'whole', seconds: 20 }],
            },
          ],
        },
      }),
    },
  ],
}

// ---------------------------------------------------------------------------
// The kitchen
// ---------------------------------------------------------------------------

/**
 * A chain rather than a table with a recipe on it.
 *
 * Crate -> stove -> board -> burger, because that is the only version of this
 * that shows what the machine is for: one recipe on one table is a vending
 * machine, and the interesting object is the *middle* one - a patty that has to
 * be cooked before the board will take it. Every word in the chain is a
 * blueprint in this set, which is what makes it work at all: an item is a word
 * resolved against the shelf (see `./craft`), so a recipe naming something
 * nobody has drawn is a recipe that silently never fires.
 */
const KITCHEN = 'kitchen'

const kitchen: StarterSet = {
  id: KITCHEN,
  title: 'The kitchen',
  hint: 'Crates of ingredients, a stove that cooks and a board that builds a burger.',
  things: [
    {
      id: 'bun',
      name: 'Bun',
      hint: 'An ingredient. The board wants one.',
      spec: item(KITCHEN, 'restaurant/food_ingredient_bun'),
    },
    {
      id: 'patty',
      name: 'Patty',
      hint: 'An ingredient, raw. The stove turns it into a grilled patty.',
      spec: item(KITCHEN, 'restaurant/food_ingredient_burger_uncooked'),
    },
    {
      id: 'grilled-patty',
      name: 'Grilled patty',
      hint: 'What the stove makes. The board wants one of these, not a raw one.',
      spec: item(KITCHEN, 'restaurant/food_ingredient_burger_cooked'),
    },
    {
      id: 'salad',
      name: 'Salad',
      hint: 'An ingredient. Straight out of the crate.',
      spec: item(KITCHEN, 'restaurant/food_ingredient_lettuce'),
    },
    {
      id: 'burger',
      name: 'Burger',
      hint: 'What the board makes out of the other three.',
      spec: item(KITCHEN, 'restaurant/food_burger'),
    },
    {
      id: 'crate-buns',
      name: 'Crate of buns',
      hint: 'G takes the bun off the top.',
      spec: fixture(KITCHEN, 'restaurant/crate_buns', {
        sockets: [{ name: 'top', at: { x: 0, y: 0.4, z: 0 }, turn: 0 }],
        craft: { slots: [{ socket: 'top', takes: ['bun'], gives: 'bun' }], recipes: [] },
      }),
    },
    {
      id: 'crate-patties',
      name: 'Crate of patties',
      hint: 'G takes a raw patty. It wants the stove next.',
      spec: fixture(KITCHEN, 'restaurant/crate_steak', {
        sockets: [{ name: 'top', at: { x: 0, y: 0.4, z: 0 }, turn: 0 }],
        craft: { slots: [{ socket: 'top', takes: ['patty'], gives: 'patty' }], recipes: [] },
      }),
    },
    {
      id: 'crate-salad',
      name: 'Crate of salad',
      hint: 'G takes a salad.',
      spec: fixture(KITCHEN, 'restaurant/crate_lettuce', {
        sockets: [{ name: 'top', at: { x: 0, y: 0.4, z: 0 }, turn: 0 }],
        craft: { slots: [{ socket: 'top', takes: ['salad'], gives: 'salad' }], recipes: [] },
      }),
    },
    {
      id: 'stove',
      name: 'Stove',
      hint: 'Put a raw patty on the hob. Four seconds later it is grilled.',
      spec: fixture(KITCHEN, 'restaurant/stove_single', {
        // The stove is a metre wide and 0.6 high once its pack scale is applied,
        // so the hob is its own top surface.
        sockets: [{ name: 'hob', at: { x: 0, y: 0.6, z: 0 }, turn: 0 }],
        craft: {
          slots: [{ socket: 'hob', takes: ['patty', 'grilled patty'] }],
          recipes: [
            {
              needs: ['patty'],
              makes: 'grilled patty',
              seconds: 4,
              emit: 'cooked',
            },
          ],
        },
        // The bar the wait is drawn as. A state with `fill` is the only thing
        // in the vocabulary that shows a wait somebody can see - the recipe's
        // own `seconds` runs silently, which is right for a board that
        // assembles instantly and wrong for four seconds of grilling.
        states: {
          start: 'cold',
          states: [
            { name: 'cold', changes: [{ when: 'filled', to: 'hot', value: 'hob' }] },
            {
              name: 'hot',
              changes: [
                { when: 'after', to: 'cold', seconds: 4, fill: true },
                { when: 'emptied', to: 'cold', value: 'hob' },
              ],
            },
          ],
        },
      }),
    },
    {
      id: 'board',
      name: 'Cutting board',
      hint: 'Bun, grilled patty and salad on the three places: a burger.',
      spec: fixture(KITCHEN, 'restaurant/cuttingboard', {
        // 0.75 across, 0.5 deep and 0.07 proud of the floor. Three places along
        // it, which is `MAX_RECIPE_ITEMS` minus the one a table wants free.
        sockets: [
          { name: 'left', at: { x: -0.22, y: 0.07, z: 0 }, turn: 0 },
          { name: 'middle', at: { x: 0, y: 0.07, z: 0 }, turn: 0 },
          { name: 'right', at: { x: 0.22, y: 0.07, z: 0 }, turn: 0 },
        ],
        craft: {
          slots: [
            { socket: 'left', takes: [] },
            { socket: 'middle', takes: [] },
            { socket: 'right', takes: [] },
          ],
          recipes: [
            {
              needs: ['bun', 'grilled patty', 'salad'],
              makes: 'burger',
              into: 'middle',
              emit: 'served',
            },
          ],
        },
      }),
    },
  ],
}

// ---------------------------------------------------------------------------
// A room, ready
// ---------------------------------------------------------------------------

const LOUNGE = 'lounge'

const lounge: StarterSet = {
  id: LOUNGE,
  title: 'A room, ready',
  hint: 'A couch you can sit on, a table to put things on, a lamp and a rug.',
  things: [
    {
      id: 'couch',
      name: 'Couch',
      hint: 'Seats three. G to sit, G to get up.',
      spec: fixture(LOUNGE, 'livingroom/couch_A_blue', {
        use: {
          ...freshUse(),
          // Three places along a 1.5-cell couch, at cushion height. A seat is
          // where somebody's *feet* go, so this is the cushion rather than the
          // floor - which is what a sit clip, once a space has posed one, is
          // authored against.
          seats: [
            { x: -0.45, y: 0.3, z: 0.05 },
            { x: 0, y: 0.3, z: 0.05 },
            { x: 0.45, y: 0.3, z: 0.05 },
          ],
        },
      }),
    },
    {
      id: 'armchair',
      name: 'Armchair',
      hint: 'Seats one.',
      spec: fixture(LOUNGE, 'livingroom/chair_A_white', {
        use: { ...freshUse(), seats: [{ x: 0, y: 0.3, z: 0.05 }] },
      }),
    },
    {
      id: 'coffee-table',
      name: 'Coffee table',
      hint: 'Put anything down on it. G to take it back.',
      spec: fixture(LOUNGE, 'livingroom/table_B_brown', {
        sockets: [{ name: 'top', at: { x: 0, y: 0.4, z: 0 }, turn: 0 }],
        // `takes: []` is "anything", which is what a table is. A slot that must
        // be picky says so; see `SlotSpec.takes`.
        craft: { slots: [{ socket: 'top', takes: [] }], recipes: [] },
      }),
    },
    {
      id: 'rug',
      name: 'Rug',
      hint: 'Flat, and you walk over it rather than into it.',
      // The one thing in this file that must not block: a rug rasterises into
      // the cell it covers and becomes an invisible wall otherwise.
      spec: fixture(LOUNGE, 'livingroom/rug_A_large', { blocking: false }),
    },
    {
      id: 'lamp',
      name: 'Lamp',
      hint: 'G turns it on. It also listens for "lights on" and "lights off".',
      spec: fixture(LOUNGE, 'livingroom/lamp_standing_B_white', {
        // On and off are two models rather than a light, because a room has no
        // authored lighting to switch: the orange shade is what "lit" looks
        // like in this pack, and it reads across a room.
        states: {
          start: 'off',
          states: [
            {
              name: 'off',
              changes: [
                { when: 'use', to: 'on' },
                { when: 'signal', to: 'on', value: 'lights on' },
              ],
            },
            {
              name: 'on',
              model: 'livingroom/lamp_standing_B_orange',
              changes: [
                { when: 'use', to: 'off' },
                { when: 'signal', to: 'off', value: 'lights off' },
              ],
            },
          ],
        },
      }),
    },
    {
      id: 'tv',
      name: 'Television',
      hint: 'Stands there. Somewhere to point the couch.',
      spec: fixture(LOUNGE, 'livingroom/tv_A_standing'),
    },
    {
      id: 'shelf',
      name: 'Bookshelf',
      hint: 'A wall of books, and a wall.',
      spec: fixture(LOUNGE, 'livingroom/closet_B'),
    },
  ],
}

// ---------------------------------------------------------------------------
// Buttons and knobs
// ---------------------------------------------------------------------------

/**
 * The set that is about the wire rather than the thing.
 *
 * Everything here either shouts a word or waits for one, and the words are
 * ordinary English on purpose: `open`, `lights on`. A signal is heard by
 * everything in the room (see `ThingState.emit`), so the names have to read
 * like what they mean rather than like `sig_3` - two people furnishing one
 * space will otherwise wire two doors to the same number.
 */
const CONTROLS = 'controls'

const controls: StarterSet = {
  id: CONTROLS,
  title: 'Buttons and knobs',
  hint: 'Things that shout a word, and things that wait for one.',
  things: [
    {
      id: 'button',
      name: 'Button',
      hint: 'G it, or stand on it: it shouts "open" and pops back up.',
      spec: fixture(CONTROLS, 'xp:proto-kenny/button-floor-square', {
        // Three cells square as authored, which is a dance floor. A third of
        // that is a button somebody steps on.
        scale: 0.4,
        blocking: false,
        states: {
          start: 'up',
          states: [
            {
              name: 'up',
              changes: [
                { when: 'use', to: 'down' },
                { when: 'touch', to: 'down' },
              ],
            },
            {
              name: 'down',
              emit: 'open',
              // Down for long enough to see, which is what stops the touch
              // change re-firing every frame somebody stands on it.
              changes: [{ when: 'after', to: 'up', seconds: 1.5 }],
            },
          ],
        },
      }),
    },
    {
      id: 'plate',
      name: 'Pressure plate',
      hint: 'Walk onto it and it shouts "open". Nothing to press.',
      spec: fixture(CONTROLS, 'xp:proto-kenny/button-floor-round', {
        scale: 0.7,
        blocking: false,
        states: {
          start: 'up',
          states: [
            { name: 'up', changes: [{ when: 'touch', to: 'down' }] },
            {
              name: 'down',
              emit: 'open',
              changes: [{ when: 'after', to: 'up', seconds: 2 }],
            },
          ],
        },
      }),
    },
    {
      id: 'lever',
      name: 'Lever',
      hint: 'G flips it. Up shouts "lights on", down shouts "lights off".',
      spec: fixture(CONTROLS, 'xp:proto-kenny/lever-single', {
        scale: 0.8,
        states: {
          start: 'down',
          states: [
            { name: 'down', emit: 'lights off', changes: [{ when: 'use', to: 'up' }] },
            { name: 'up', emit: 'lights on', changes: [{ when: 'use', to: 'down' }] },
          ],
        },
      }),
    },
    {
      id: 'door',
      name: 'Door',
      hint: 'Shut until something shouts "open". Shuts itself again after five seconds.',
      spec: fixture(CONTROLS, 'xp:proto/Door_A', {
        states: {
          start: 'shut',
          states: [
            {
              name: 'shut',
              changes: [
                { when: 'signal', to: 'open', value: 'open' },
                // And by hand, because a door you cannot open by walking up to
                // it is a door that is broken whenever the button is.
                { when: 'use', to: 'open' },
              ],
            },
            {
              name: 'open',
              // Out of the way rather than swung: nothing in the pack animates
              // a hinge, and a door drawn open at the wrong angle is worse than
              // a doorway. See `ThingState.hidden`, which keeps the clock
              // running so the way back exists.
              hidden: true,
              blocking: false,
              changes: [{ when: 'after', to: 'shut', seconds: 5 }],
            },
          ],
        },
      }),
    },
    {
      id: 'bell',
      name: 'Bell',
      hint: 'Waits for "open" and shouts "ding" back. Somewhere to hang a second rule.',
      spec: fixture(CONTROLS, 'xp:proto/Ammo_Box', {
        states: {
          start: 'quiet',
          states: [
            { name: 'quiet', changes: [{ when: 'signal', to: 'ringing', value: 'open' }] },
            {
              name: 'ringing',
              emit: 'ding',
              changes: [{ when: 'after', to: 'quiet', seconds: 2 }],
            },
          ],
        },
      }),
    },
  ],
}


// ---------------------------------------------------------------------------
// Baseball
// ---------------------------------------------------------------------------

/**
 * The set that is about the *hand* rather than about the room.
 *
 * A bat is the first object in this catalogue whose whole behaviour is a grip:
 * where it sits in a fist decides whether it reads as a bat or as a plank
 * somebody is carrying by the middle, and nothing else about the blueprint says
 * anything at all. It is here as the worked example of `./hold` for the same
 * reason the example car is a worked example of a vehicle - the shape is not
 * one anybody would guess at, and the failure of guessing wrong looks like the
 * feature being broken.
 *
 * The machine pitches with the same block a turret shoots with, loaded with a
 * ball instead of a bullet and turned down to something you would stand in
 * front of on purpose. That reuse is the point: a pitching machine is a turret
 * somebody was kind to.
 */
const BASEBALL = 'baseball'

const baseball: StarterSet = {
  id: BASEBALL,
  title: 'Baseball',
  hint: 'A bat you actually hold, a machine that pitches at you, and a plate to stand on.',
  things: [
    {
      id: 'bat',
      name: 'Bat',
      hint: 'Take it, hold it, click to swing. Catches anything within three cells.',
      spec: item(BASEBALL, 'xp:proto/Bat', {
        /*
          Tilted back over the shoulder rather than held out level: the model
          runs up its own +Y from the handle, so a quarter-turn back about X is
          the difference between carrying it and being ready to swing it.
        */
        hold: grip({ at: { x: 0, y: 0.02, z: 0.06 }, turn: { x: -0.5, y: 0, z: 0 }, scale: 0.8 }),
        fight: {
          // No `shot`, which is what makes it a swing: everything in the arc is
          // caught rather than the first thing in a line. See `WeaponSpec`.
          weapon: { damage: 18, reach: 3, every: 0.8, at: 'all', push: 6 },
        },
      }),
    },
    {
      id: 'baseball',
      name: 'Baseball',
      hint: 'Falls, rolls and can be kicked. Carry one and put it down where you like.',
      spec: item(BASEBALL, 'xp:platformer-neutral/ball', {
        // Two metres across as authored, which is a space hopper.
        scale: 0.2,
        hold: grip({ at: { x: 0, y: 0.05, z: 0.05 }, scale: 1 }),
      }),
    },
    {
      id: 'pitcher',
      name: 'Pitching machine',
      hint: 'Lobs a ball at whoever stands in front of it, every three seconds.',
      spec: fixture(BASEBALL, 'xp:adventure/turret_base', {
        parts: [
          {
            model: 'xp:proto/Ammo_Box',
            at: { x: 0, y: 0.8, z: 0 },
            turn: 0,
            scale: 1,
            sockets: [{ name: 'muzzle', at: { x: 0, y: 0.2, z: 0.4 }, turn: 0 }],
          },
        ],
        fight: {
          health: { max: 80, hurtBy: ['dash', 'kick', 'shot'] },
          weapon: {
            // Gentle on purpose: this is a thing you stand in front of.
            damage: 4,
            reach: 14,
            every: 3,
            at: 'people',
            shot: { model: 'xp:platformer-neutral/ball', speed: 20, scale: 0.2, from: 'muzzle' },
          },
        },
      }),
    },
    {
      id: 'home-plate',
      name: 'Home plate',
      hint: 'Somewhere to stand. Flat, and you walk over it.',
      spec: fixture(BASEBALL, 'xp:platformer-neutral/platform_wood_1x1x1', {
        scale: 1,
        // Flat things must not block: a decal that rasterises into the cell it
        // covers is an invisible wall somebody walks into.
        blocking: false,
      }),
    },
    {
      id: 'backstop',
      name: 'Backstop',
      hint: 'A fence for what the bat misses.',
      spec: fixture(BASEBALL, 'house/fence_straight_long'),
    },
  ],
}

// ---------------------------------------------------------------------------
// Platformer
// ---------------------------------------------------------------------------

/**
 * Hazards, and the one verb that had been missing.
 *
 * ---------------------------------------------------------------------------
 * What a weapon on a fixed thing turns out to be
 * ---------------------------------------------------------------------------
 * None of these fires anything, and until `WeaponSpec.push` existed none of
 * them could do the thing a platformer hazard is *for*: a spike plate that took
 * ten points off you and left you standing on it is a hazard you can walk over
 * at your leisure. A shove is what makes it a hazard - you are thrown off it,
 * you fall, and the fall is the interesting part.
 *
 * So a spring is damage 1 and a big shove, a sawblade is all damage and a
 * nudge, and a bumper is mostly shove. One block, three objects, and every one
 * of them is `weapon` with no `shot` - which is also why they cost nothing to
 * run: no bullet, no model, no packet beyond the one that says who it caught.
 *
 * ---------------------------------------------------------------------------
 * And the three that move
 * ---------------------------------------------------------------------------
 * The crusher, the lift and the sliding platform were missing until motion
 * belonged to the driver: `bob` and `spin` are drawn per client off a local
 * clock, which is fine for a coin and wrong for anything you stand on, because
 * two people would see the platform in two places. `./motion` is the phase the
 * driver publishes and everybody runs forward locally - so where a lift is, is
 * a fact rather than a drawing, and its footprint follows it a cell at a time.
 *
 * The crusher is the pair working together: it *moves* (three cells up, dropped
 * in a fifth of a second) and it *hits* (a weapon with no shot, all damage and
 * a shove), and the weapon reaches from wherever the trip has got to rather
 * than from the cell it was placed in. That is what "it fell on you" means.
 */
const PLATFORMER = 'platformer'

const platformer: StarterSet = {
  id: PLATFORMER,
  title: 'Platformer',
  hint: 'Spikes, a sawblade and a spring — things that hurt you, and things that throw you.',
  things: [
    {
      id: 'spikes',
      name: 'Spikes',
      hint: 'Stand on them and find out. Hurts, and shoves you off.',
      spec: fixture(PLATFORMER, 'xp:platformer-neutral/floor_spikes_2x2x1', {
        // Two cells square as authored; half of that is a tile somebody steps on.
        scale: 0.5,
        blocking: false,
        fight: { weapon: { damage: 12, reach: 1.4, every: 1, at: 'people', push: 6 } },
      }),
    },
    {
      id: 'sawblade',
      name: 'Sawblade',
      hint: 'Turns on the spot, all day, and takes a fifth of you with it.',
      spec: fixture(PLATFORMER, 'xp:platformer-neutral/sawblade', {
        // Nearly seven metres across as authored - a third of that is a blade
        // rather than a fairground ride.
        scale: 0.3,
        blocking: false,
        actions: [{ when: 'always', deed: 'spin' }],
        fight: { weapon: { damage: 20, reach: 1.6, every: 0.9, at: 'people', push: 8 } },
      }),
    },
    {
      id: 'spikeball',
      name: 'Spikeball',
      hint: 'Hangs there bobbing. Do not walk into it.',
      spec: fixture(PLATFORMER, 'xp:platformer-neutral/spikeball', {
        scale: 0.5,
        blocking: false,
        actions: [{ when: 'always', deed: 'bob' }],
        fight: { weapon: { damage: 16, reach: 1.5, every: 1.2, at: 'people', push: 10 } },
      }),
    },
    {
      id: 'spring',
      name: 'Spring',
      hint: 'Throws you. Takes a point off so you know it happened.',
      spec: fixture(PLATFORMER, 'xp:platformer-neutral/spring', {
        scale: 0.6,
        blocking: false,
        // Damage one rather than none, and it is not an accident: a shove with
        // no damage is a shove the victim's own combat code has no reason to
        // register, and one point is the smallest thing that says "that was
        // the spring" on a bar somebody is watching.
        fight: { weapon: { damage: 1, reach: 1.3, every: 0.8, at: 'people', push: 26 } },
      }),
    },
    {
      id: 'crate-block',
      name: 'Breakable block',
      hint: 'Two dashes and it is gone. Back in ten seconds.',
      spec: fixture(PLATFORMER, 'xp:platformer-neutral/barrier_1x1x1', {
        fight: { health: { max: 50, hurtBy: ['dash', 'kick', 'shot'] } },
        states: {
          start: 'whole',
          states: [
            { name: 'whole', restore: true, changes: [{ when: 'broken', to: 'gone' }] },
            {
              name: 'gone',
              hidden: true,
              blocking: false,
              changes: [{ when: 'after', to: 'whole', seconds: 10 }],
            },
          ],
        },
      }),
    },
    {
      id: 'crusher',
      name: 'Crusher',
      hint: 'Sits three cells up, drops on whoever is underneath, grinds back up.',
      spec: fixture(PLATFORMER, 'xp:platformer-neutral/hammerblock_spikes', {
        scale: 0.5,
        motion: {
          // Up three cells is where it *starts*, so the trip is downwards and
          // the wait at the far end is the beat it spends on the floor.
          by: { x: 0, y: -3, z: 0 },
          out: 0.2,
          back: 1.6,
          waitOut: 0.5,
          waitHome: 1.4,
        },
        fight: { weapon: { damage: 30, reach: 2, every: 1.5, at: 'people', push: 8 } },
      }),
    },
    {
      id: 'lift',
      name: 'Lift',
      hint: 'Four cells up and back, with a beat at each end to step on.',
      spec: fixture(PLATFORMER, 'xp:platformer-neutral/platform_wood_1x1x1', {
        scale: 2,
        motion: {
          by: { x: 0, y: 4, z: 0 },
          out: 3,
          back: 3,
          waitOut: 1.5,
          waitHome: 1.5,
          // A machine with a motor, so it arrives without a bounce.
          ease: true,
        },
      }),
    },
    {
      id: 'platform',
      name: 'Sliding platform',
      hint: 'Six cells across and back, forever.',
      spec: fixture(PLATFORMER, 'xp:platformer-neutral/floor_wood_2x2', {
        motion: { by: { x: 6, y: 0, z: 0 }, out: 4, back: 4, waitOut: 1, waitHome: 1, ease: true },
      }),
    },
    {
      id: 'finish',
      name: 'Finish sign',
      hint: 'Shouts "finished" when somebody touches it. Wire it to whatever should care.',
      spec: fixture(PLATFORMER, 'xp:platformer-neutral/signage_finish', {
        scale: 0.4,
        blocking: false,
        states: {
          start: 'waiting',
          states: [
            { name: 'waiting', changes: [{ when: 'touch', to: 'reached' }] },
            {
              name: 'reached',
              emit: 'finished',
              changes: [{ when: 'after', to: 'waiting', seconds: 5 }],
            },
          ],
        },
      }),
    },
  ],
}

/** Every set we ship, in the order the panel draws them. */
export const STARTER_SETS: readonly StarterSet[] = [
  range,
  baseball,
  platformer,
  kitchen,
  lounge,
  controls,
]

/** One set by id, or nothing. */
export function starterSet(id: string): StarterSet | undefined {
  return STARTER_SETS.find((set) => set.id === id)
}

/** Every starter in every set, flattened. For tests and for a search. */
export function allStarters(): Starter[] {
  return STARTER_SETS.flatMap((set) => set.things)
}
