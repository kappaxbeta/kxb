/**
 * A blueprint: a model that knows what it is made of.
 *
 * The difference between a *placement* and an *entity*, and why both exist.
 *
 * A placement is bulk data. You drag out four hundred of them to make a room,
 * they never move, they never have state, and the only question anyone asks is
 * "can I walk here" - which is why they are rasterised into a cell grid once
 * and then forgotten. A wall is a placement.
 *
 * An entity is a thing. It has a name, it has properties, something can happen
 * to it, and it may not be there tomorrow. A crate you can break is an entity,
 * and so is a pickup, a door that opens, a target that scores.
 *
 * ---------------------------------------------------------------------------
 * Why entities are not on the grid
 * ---------------------------------------------------------------------------
 * The cell grid is exact and free for the prototype kit's architecture, which
 * is drawn on whole metres - a wall really is four cells wide and one thick. It
 * is not exact for anything else. A crate is 0.46 across and a barrel is 1.0
 * with a round footprint; putting either on a metre lattice means a box you
 * bump into a third of a metre before you touch it, and a position that cannot
 * express "just left of the door".
 *
 * So entities carry a position in world units and a box of their own, and the
 * character controller tests both: cells for the structure, boxes for the
 * things. That is the hybrid rather than a choice between the two, and it is
 * chosen because each half is doing what it is actually good at.
 *
 * What it costs is a second collision path, which is a real cost and a small
 * one at this size: a level holds hundreds of placements and tens of entities,
 * so the boxes are a linear scan and stay one until somebody proves otherwise.
 */

import { findModel } from '../assets/catalogue'
import type { Motion } from './motions'
import type { Trigger } from '../rules/triggers'

/**
 * What an entity made from this blueprint collides with the world as.
 *
 * `auto` is the default and is a box from the model's measured geometry, which
 * is right for nearly everything: a crate is a crate-shaped box, a barrel is a
 * barrel-shaped box, and the error is under a hand's width on both.
 *
 * `none` is not laziness - it is the whole class of thing you are *meant* to
 * walk through. A coin, a pickup, a trigger volume, a decal on the floor. An
 * ammo box you have to walk around to collect is an ammo box nobody collects.
 */
export type ColliderSpec = 'auto' | 'none' | { w: number; h: number; d: number }

/**
 * What makes a blueprint a body rather than scenery.
 *
 * On the **blueprint**, beside `collider` and for its reason: it is a fact
 * about the kind of thing. Every ball falls the same way, and an entity that
 * needs its own is a second blueprint, which is cheap.
 *
 * Every field is optional and every default is "the least surprising thing a
 * document that only said `body: {}` could mean" - it falls, it stops when it
 * lands, and it does not bounce. An author who writes nothing else gets a
 * dropped crate.
 */
export interface BodySpec {
  /**
   * How hard gravity pulls, as a multiple of the world's.
   *
   * A multiplier rather than an acceleration, so a level that one day sets its
   * own gravity moves everything in it at once and a balloon written against
   * the old number stays a balloon. 1 is a rock, 0 floats, and a *negative* one
   * rises - which is the balloon, and is allowed on purpose.
   */
  gravity?: number
  /**
   * How much of its speed comes back off a surface. 0 stops dead, 1 never tires.
   *
   * A coefficient here, and note that `Blocker.bounce` next door is deliberately
   * *not* one - a spring pad throws a **player** a fixed number of cells so a
   * course built on it can be proved. Nothing here is a course. A ball that
   * returns the same height off a two-cell drop and a ten-cell drop is the bug,
   * not the feature, which is why the two fields with the same name mean
   * different things and each is right where it is.
   *
   * Clamped to 1 by the parser: over 1 is a ball that climbs its own bounce
   * until it leaves the level, and it arrives as a typo far more often than as
   * a moon.
   */
  bounce?: number
  /**
   * Fraction of speed lost per second in the air.
   *
   * A fraction rather than a subtraction, so a hard shot goes much further than
   * a tap rather than a little further - the difference between a kick that
   * feels like a kick and one that feels like a nudge. Inherited straight from
   * the park template's own script, which had this argument in a comment.
   */
  drag?: number
  /**
   * The same, while it is touching the ground. Usually much larger than `drag`.
   *
   * Separate because they are separate in the hand: a ball in the air keeps
   * going and a ball on grass slows down, and one number cannot say both. This
   * is what decides how far a rolled thing travels, and it is the field an
   * author will actually reach for.
   */
  friction?: number
  /**
   * How much it takes to move it. 1 is a football; 10 barely notices you.
   *
   * Divides every push - the player's shoulder, a script's `push()` - rather
   * than entering the fall, because gravity does not care about mass and a
   * level where a heavy crate fell faster would be a level that is wrong about
   * the one physical fact everybody knows.
   */
  mass?: number
  /**
   * Degrees it turns per cell travelled, so a ball looks like it is rolling.
   *
   * Cosmetic, and deliberately so: nothing in the simulation turns for this and
   * nothing reads it back. It is applied by the renderer, about the axis
   * perpendicular to travel and from the *drawn* position - see `Rolling` in
   * `@kxb/xp/drawing`, which is also where the two ways the old version of this
   * was wrong are written down.
   *
   * Rolling without slipping is `180 / (pi * radius)`, so about **115** for a
   * ball half a cell across and 57 for one a full cell. Bigger than that is a
   * beach ball spinning faster than it travels, which is allowed on purpose -
   * this is drawing, and an author who wants it can have it.
   *
   * 0 - the default - is a crate, which slides and should not spin.
   */
  roll?: number
}

/**
 * What each field of a `body` may be, stated once.
 *
 * Read by the parser, by `setBlueprint` and by the editor's own number fields,
 * so a bound is one number in three places rather than three that agree until
 * somebody changes one. Every one of them is here because the failure is
 * *invisible in the file*: `bounce: 1.4` is not a bouncier ball, it is a ball
 * that climbs its own bounce until it leaves the level, and `mass: 0` divides
 * by zero and sends a crate to infinity on the first shove. Both arrive as
 * typos far more often than as designs.
 *
 * **Beside the type rather than in `@kxb/xp/bodies`**, where it is used. The
 * parser needs it, and `./bodies` imports `./entities`, which reaches
 * `./blueprints` and `./triggers` and back to `./format` - so declaring it
 * there would close a runtime import cycle for the sake of tidiness.
 *
 * `gravity` goes negative on purpose - see `BodySpec.gravity`, where a balloon
 * is the case that wanted it.
 */
export const BODY_LIMITS = {
  gravity: { min: -4, max: 4 },
  bounce: { min: 0, max: 1 },
  drag: { min: 0, max: 20 },
  friction: { min: 0, max: 20 },
  // Above zero rather than at or above it: mass divides every push.
  mass: { min: 0.01, max: 1000 },
  roll: { min: -3600, max: 3600 },
} as const satisfies Record<keyof BodySpec, { min: number; max: number }>

/** The fields of a body, in the order a panel should offer them. */
export const BODY_FIELDS = ['gravity', 'bounce', 'drag', 'friction', 'mass', 'roll'] as const

/** Whichever fields of a body are outside their own bound, said in words. */
export function bodyProblems(spec: BodySpec): string[] {
  const problems: string[] = []
  for (const field of BODY_FIELDS) {
    const value = spec[field]
    if (value === undefined) continue
    if (!Number.isFinite(value)) {
      problems.push(`${field} must be a number`)
      continue
    }
    const { min, max } = BODY_LIMITS[field]
    if (value < min || value > max) problems.push(`${field} must be between ${min} and ${max}`)
  }
  return problems
}

/**
 * What a thing is made of, when it is not made of its own model.
 *
 * `own` is the glTF's materials, and is what a blueprint with no `material` on
 * it means. It exists as a *word* rather than only as absence because a rule
 * and a script both have to be able to say "put it back" - and `material:
 * undefined` is a sentence neither of them can write.
 *
 * `rainbow` is the Fresnel glass this app already wears in three other places.
 * One look, named once, so a level saying `rainbow` and the lounge saying
 * `rainbow` mean the same substance.
 */
export const MATERIALS = ['own', 'rainbow'] as const
export type XpMaterial = (typeof MATERIALS)[number]

export function isMaterial(value: unknown): value is XpMaterial {
  return typeof value === 'string' && (MATERIALS as readonly string[]).includes(value)
}

/**
 * One hand-drawn box of a placement's collision, in the model's own frame.
 *
 * ---------------------------------------------------------------------------
 * A corner and a size, not a centre and a size
 * ---------------------------------------------------------------------------
 * `ColliderSpec`'s box a few lines up is centred on the entity, and this one is
 * not, which looks like an inconsistency and is the opposite. An entity's
 * origin *is* its middle - it is a crate standing somewhere - so centred is the
 * only description that does not make you do arithmetic. A placement's box is
 * authored against the model's own bounds, and those are printed in
 * `catalogue.generated.ts` as exactly `x0, y0, z0, w, h, d`. Somebody drawing a
 * collider for `arch` opens the catalogue, reads
 * `x0: -2.109, y0: 0, z0: -0.385, w: 4.218, h: 4.414, d: 0.77`, and writes down
 * the part of it they want. Making them halve it first would be a second
 * convention for one idea, in the one place the first convention is on screen.
 *
 * So the offsets are the box's minimum corner and default to zero, which is the
 * model's own origin - and a piece of a model's box is a piece of a model's box
 * in both files.
 *
 * The frame is the model's, before the turn and before the scale. That is what
 * makes a hand-drawn collider survive being rotated: the box goes through the
 * same quarter turn the model does, so an arch turned to face the other way has
 * its legs turned with it rather than left across the doorway.
 */
export interface PlacementBox {
  /** Minimum corner, in the model's own units. Absent is the model's origin. */
  x?: number
  y?: number
  z?: number
  w: number
  h: number
  d: number
}

/**
 * What a placement collides as, when the measured shape is not what you want.
 *
 * Absent is the default and means what every document written before this field
 * existed already meant: the model's voxel mask if it has one, its bounding box
 * if it does not. That path is not going anywhere - it is right for the whole
 * construction kit, which is what the grid was built for.
 *
 * ---------------------------------------------------------------------------
 * Why a *list* of boxes, when an entity gets one
 * ---------------------------------------------------------------------------
 * Because the thing this exists for has two legs. An arch, a gateway, a pair of
 * pillars carrying a lintel - the model whose mask came out solid is nearly
 * always one whose opening is narrower than the metre the grid rounds to, and
 * one box cannot say "solid here and here, air in between". A second box can,
 * and costs nothing: a placement rasterises into cells once at load, so N boxes
 * are N range loops in a pass that already runs, rather than N more things to
 * test every frame. That is the whole reason an entity's collider stopped at
 * one and this one does not - an entity's body is a linear scan sixty times a
 * second, and a placement's is a `Set.has`.
 *
 * `none` is the other half and is the commoner of the two: a banner, a sign, a
 * hanging cable, foliage, anything drawn across a doorway. It fills no cells at
 * all.
 *
 * An empty list is refused rather than read as `none`. Two spellings of one
 * state is how a round trip grows a field nobody wrote, which is the trap the
 * angles and `bounce` were both written to avoid.
 */
export type PlacementCollider = 'none' | PlacementBox[]

/**
 * How many boxes one placement may be drawn out of.
 *
 * A guard on the idea, not on the arithmetic. Two is an arch, four is a gateway
 * with a threshold, and eight is somebody rebuilding a mesh a box at a time -
 * at which point the answer is a different model, or a mask, not a longer list.
 */
export const MAX_COLLIDER_BOXES = 8

/**
 * One model inside a blueprint, hung where the author put it.
 *
 * A blueprint used to be one model, which is right for a crate and wrong for
 * most of what a level is *about*: a turret is a base and a barrel, a lamp is a
 * post and a light, and the alternative was two entities parented together -
 * two names to invent, two rows in the Scene tree, and a rule that has to know
 * which of them is "the turret".
 *
 * ---------------------------------------------------------------------------
 * Why this is not just a list of offsets
 * ---------------------------------------------------------------------------
 * `parent` and `socket` are here because a barrel that elevates has to take the
 * muzzle flash with it, and a list of offsets from the blueprint's origin
 * cannot say that. It is the same composition entities already have - and
 * deliberately the same words, because an author who has parented one entity to
 * another should not have to learn a second idea to parent two halves of one
 * thing.
 *
 * What it is *not* is a way to compose blueprints out of blueprints. A part is
 * a model and nothing else - no properties, no triggers, no script. The moment
 * a piece needs behaviour it is an entity, and entities already parent.
 */
export interface Part {
  /** A model id the catalogue knows. */
  model: string
  /**
   * What to call it, so another part can hang from it.
   *
   * Optional, because most parts are hung and nothing hangs from them. Unique
   * within the blueprint when present, for the same reason an entity name is:
   * two answers to one name is a coin toss inside a resolution nobody can see.
   */
  name?: string
  /** The part this hangs from, by name. The blueprint's own origin when absent. */
  parent?: string
  /** Which of the parent's sockets. The parent's origin when absent. */
  socket?: string
  x: number
  y: number
  z: number
  /** Degrees about Y, added to the parent's. */
  rotation: number
  /** Multiplied by the parent's. */
  scale: number
  /**
   * Named places on *this* part that a further part can hang from.
   *
   * A part carries its own rather than borrowing the blueprint's, and that is
   * the difference between "the muzzle is somewhere on the turret" and "the
   * muzzle is on the end of the barrel". Only the second one moves when the
   * barrel elevates, and the whole reason parts have parents is that things
   * move.
   */
  sockets?: Readonly<Record<string, { x: number; y: number; z: number }>>
}

export interface Blueprint {
  /**
   * A model id the catalogue knows.
   *
   * The root of the thing, and still required when there are `parts`: it is
   * what a picker draws a thumbnail of and what `auto` collision measures from
   * when there is nothing else. Parts hang off it.
   */
  model: string
  /**
   * Whether a bar is drawn over this when it has been hurt. Absent is yes.
   *
   * Only ever asked about a blueprint that declares `hp` — a thing with no
   * health has nothing to draw — so a level of scenery says nothing and gets
   * nothing.
   *
   * `false` is for the two cases where the feedback is the problem: a thing
   * whose damage is meant to be secret (a door with a hidden lock, a boss whose
   * health the fight is about *guessing*), and a thing hit so often that a bar
   * over it is noise rather than information. It does not change what happens to
   * the thing, only whether anybody is shown it.
   */
  bar?: boolean
  /**
   * Whether this is drawn at all. Absent is yes.
   *
   * `false` makes an **empty node**: a thing that has a position, a name, a
   * parent and sockets, and no appearance. A teleport destination, a patrol
   * waypoint, the point a turret aims at - the places a level needs to talk
   * about but nobody should see.
   *
   * ---------------------------------------------------------------------------
   * Why this, rather than a sixth mark kind or a `world.nodes` list
   * ---------------------------------------------------------------------------
   * Both of those were the obvious shapes, and both duplicate work already done.
   *
   * A mark is a *closed* vocabulary - `red`, `blue`, `start`, `finish`, `spawn`
   * - and it is closed on purpose, because `capabilityProblems` reads it to
   * decide whether a football claim holds. A node's name is one the level
   * invents, so putting it in that list either opens the vocabulary or means
   * every node is called `node`.
   *
   * A `world.nodes` list would need its own naming, its own uniqueness check,
   * its own parenting, its own selection and gizmo in the editor, and its own
   * spelling in every verb that takes a target. All of that exists for entities
   * and none of it is about being visible.
   *
   * So a node is an entity, and the only thing that makes it a node is that it
   * draws nothing. `model` stays required, because the editor still has to draw
   * *something* to let you grab it - it becomes the icon for the node rather
   * than its appearance.
   */
  draw?: boolean
  collider: ColliderSpec
  /**
   * Whether it moves on its own, and how. See `BodySpec` and `@kxb/xp/bodies`.
   *
   * Absent is scenery, which is every blueprint written before this existed: it
   * is exactly where the document put it until a rule, a script or a hand moves
   * it. Present - even as `{}` - hands it to `stepBodies`, and from then on
   * gravity, the floor and anybody's shoulder have an opinion about where it is.
   *
   * **Beside `collider` rather than inside it**, because they answer different
   * questions and a level wants all four combinations. `collider` is *does this
   * stop other things*; this is *does this get stopped*. A coin you walk through
   * that still falls to the floor is `collider: 'none'` with a body; a wall is a
   * collider with none.
   */
  body?: BodySpec
  /**
   * Free-form labels a rule can match on: `breakable`, `pickup`, `enemy`.
   *
   * Deliberately not an enum. The engine never reads a tag - only the rules do,
   * and the rules are in the document. An enum here would mean every new kind
   * of thing an XP wants to describe is a change to this package.
   */
  tags: readonly string[]
  /**
   * @see SUGGESTED_TAGS - the words the things we ship already use, offered by
   * the editor as a starting point and enforced by nothing.
   */
  /**
   * Starting values for whatever this thing tracks - health, ammo, a score.
   *
   * Numbers only, on purpose. Every verb that reads or writes a property does
   * arithmetic on it (`damage`, `give`, `score`), and a property that is
   * sometimes a string is a property every one of them has to check first.
   */
  props: Readonly<Record<string, number>>
  /**
   * Named places on this thing that something else can hang from.
   *
   * Offsets in the model's own units, relative to its origin. `seat`, `hand`,
   * `roof`, `muzzle` - the vocabulary is the level's, not ours, because the
   * engine never looks a socket up by meaning. It only composes transforms.
   *
   * This is what makes a kart a kart rather than a model of one: the kart
   * blueprint has a `seat`, an avatar is parented into it, and the two move as
   * one thing without either knowing about the other. The same mechanism hangs
   * a gun off a hand and a light off a post.
   *
   * The prototype dummy already ships with two of these in its rig -
   * `handslot.l` and `handslot.r` - which is where the idea comes from.
   */
  sockets: Readonly<Record<string, { x: number; y: number; z: number }>>
  /**
   * What happens to it, and when.
   *
   * On the blueprint rather than on the entity because it is a fact about the
   * *kind* of thing: every crate breaks the same way. An entity that needs its
   * own behaviour is a second blueprint, which is cheap - they are four fields.
   */
  /**
   * Extra models, composed onto this one. See `Part`.
   *
   * Absent rather than empty on a blueprint that is one model, so the common
   * case round-trips without growing a field - the same rule `scripts` follows
   * on the document.
   */
  parts?: readonly Part[]
  triggers: readonly Trigger[]
  /**
   * The name of a script in the document's `scripts` block, if this thing has
   * one.
   *
   * A name rather than the source, so ten kinds of turret share one file and
   * the editor has a list to show. On the blueprint for the same reason the
   * triggers are: behaviour is a fact about the kind of thing. Each *entity*
   * still gets its own run of it - its own cooldown, its own counter - because
   * the alternative is two turrets sharing one variable, which is a bug nobody
   * finds until there are two turrets.
   */
  script?: string
  /**
   * What this thing is made of, when it is not made of its own model.
   *
   * Absent is the glTF's own materials, which is nearly everything: a crate
   * looks like a crate. `'rainbow'` is the Fresnel glass this app already
   * wears elsewhere - a block whose model has not arrived, a piece being held
   * over the editor's grid, the lounge in rainbow mode - and putting it on a
   * blueprint is that same substance offered to a level.
   *
   * ---------------------------------------------------------------------------
   * A named look and not a colour
   * ---------------------------------------------------------------------------
   * The obvious alternative is a `colour` field, and it is a worse one for the
   * reason `pose` is not a bone list: a colour is a thing a document has to get
   * *right*, and every level that wanted a thing to stand out would arrive at a
   * different wrong red. A named look is one decision made once, so a glowing
   * thing in one level is the same substance as a glowing thing in the next -
   * which is the whole of what makes it read as a rule of the world rather than
   * as decoration somebody chose.
   *
   * The starting look only. A rule's `material` verb and a script's
   * `self.material` both write it afterwards, and neither has to know what it
   * began as - which is what lets a ball go rainbow when it is kicked and go
   * back when it stops.
   */
  material?: XpMaterial
  /**
   * The animation graph this thing moves by, from the document's `animations`.
   *
   * `script`'s sibling in every way: a name, several blueprints may share one,
   * and the source lives once in its own block. Four kinds of guard are four
   * blueprints with four sets of properties and *one* way of moving, and
   * inlining the states here would be four copies of the graph and four places
   * to fix a transition.
   *
   * Absent is the built-in machine, which is what every document has today -
   * see `@kxb/xp/animation`. Nothing reads this yet: docs/xp/backlog.md §2b
   * puts the data first and the runtime second, deliberately.
   */
  animator?: string
  /**
   * The animation this thing holds when it is doing nothing else.
   *
   * A clip name from the animation pack - `Idle_B`, `Sit_Floor_Idle`,
   * `Ranged_1H_Aiming`. Only a *skinned* body has anything to play it on, so
   * this says nothing on a crate and costs nothing there either.
   *
   * ---------------------------------------------------------------------------
   * A pose, not a state machine
   * ---------------------------------------------------------------------------
   * It is what a body does at rest, and the motion the host derives from
   * movement still wins: a guard posted with `pose: 'Ranged_1H_Aiming'` walks
   * with a walk and aims again when it stops. Anything else would mean a
   * document could freeze a running body mid-stride, and the thing that decides
   * whether feet are moving is the controller rather than the document.
   *
   * ---------------------------------------------------------------------------
   * The parser checks the shape and not the list
   * ---------------------------------------------------------------------------
   * A name that is not in the pack plays nothing and leaves the body in its
   * last pose, which is a real failure - and it is still not the parser's to
   * catch. **Which clips exist is a fact about the host**: `skinned.tsx` loads
   * three of the pack's eight files today, and a host that loaded all eight
   * would make a document this parser had refused suddenly correct. So the
   * format takes any well-formed name and the *editor* offers only the ones
   * that can actually play, which is where the knowledge lives.
   */
  pose?: string
  /**
   * A node inside this thing's own model that a live prop turns.
   *
   * `node` names a node in `model`'s own glTF - not a `Part`, which is a
   * whole separate model bolted on. `prop` is an ordinary entry in `props`: a
   * script's `self.set`/`self.add` or a rule's Set/Add on target self writes
   * degrees into it, exactly the way `self.intensity` already drives a lamp
   * (see `pose`'s note above on the same idea). The renderer only ever reads
   * the current value.
   *
   * There is no speed, no duration, no easing here, because there is nowhere
   * in the format for those to mean anything - the thing writing the prop
   * decides the rate, one tick at a time. That is also why this is `spin` and
   * not `play`: a played clip has a length and an end, and this has neither.
   */
  spin?: { node: string; axis: 'x' | 'y' | 'z'; prop: string }
  /**
   * Named things this kind of thing can be told to do to its own parts.
   *
   * The feature `spin` was the mechanism underneath - see the note at the top of
   * `@kxb/xp/motions`. `spin` gives one node an angle and leaves somebody to
   * write a script that changes it; this is a **sequence** with a **name**, and
   * `play` starts it.
   *
   * Its own block on the blueprint rather than beside `scripts` and
   * `animations`, which is the opposite call §2b made for the animation graph,
   * and deliberately. A graph is authored *against a rig* and shared between
   * four kinds of guard who move the same way; a motion is authored against
   * **this model's own node names** - `blade`, `lid`, `barrel` - and a second
   * blueprint with a different model could not play it at all. Sharing needs
   * something to share, and there is nothing here two models have in common.
   */
  motions?: Readonly<Record<string, Motion>>
  /**
   * A lamp this kind of thing carries. Absent is the overwhelmingly common no.
   *
   * On the blueprint rather than on the placement, so "a torch" is a kind of
   * thing you can put forty of in a level and change the colour of once — the
   * same reasoning `props` and `triggers` are here rather than on each entity.
   *
   * The entity gets its own copy at spawn (`world.light`), so a script dimming
   * one torch does not dim the other thirty-nine.
   *
   * **Bounded at the parser**, both ends, because both ends are typos rather
   * than designs: a negative intensity is a light that subtracts, and a
   * four-digit one is a white screen — and the person who typed it will be
   * looking at a white screen rather than at the field they typed it into.
   */
  light?: Light
}

/**
 * A point light, as the engine holds it — or a spot, aimed by the entity's own
 * rotation.
 *
 * Omnidirectional was the one kind worth having first: it is what a lamp, a
 * fire, a torch, a portal and a glowing pickup all are, and it needs no
 * aiming. A spot was refused for a while on the grounds that it is "a cone
 * plus a direction plus a target" — three decisions before anything appears —
 * but two of those three are not new decisions at all. The direction is
 * `rotation`/`pitch`, the same pair `player.weapon` already aims with, so a
 * spot points wherever the placement is already facing rather than inventing
 * a second way to say which way something looks. The target is derived from
 * that direction and the range, not stored. So the only genuinely new
 * decision an author makes is the cone.
 *
 * The numbers are the *live* ones. A blueprint seeds them and a script writes
 * them, which is the whole of "animatable": `self.intensity = 0` is a lamp
 * going out, and doing it over a few frames is a lamp fading.
 */
export interface Light {
  /**
   * Packed `0xRRGGBB`, because every number in this engine is a number.
   *
   * A string would have been friendlier to read in the document and would have
   * cost the thing that matters: a script can compute this one. `0xff0000` to
   * `0xffffff` is a lamp warming up, and a hex triple in a text field is a lamp
   * a script cannot touch.
   */
  colour: number
  /** How bright. Zero is off without being absent — see the note on the map. */
  intensity: number
  /** How far the light reaches, in cells. Zero means "no limit". */
  range: number
  /**
   * Omnidirectional, or a cone aimed by the entity's own facing.
   *
   * Absent in a document means `'point'`, so every lamp already on disk keeps
   * meaning exactly what it meant before this field existed - the same rule
   * `isFlat` follows for `pitch`/`roll`. Not script-writable, unlike the four
   * numbers above: a script may turn a lamp brighter, dimmer, wider-reaching
   * or a different colour, but shape is the blueprint's decision, not a curve
   * a trigger draws over time.
   */
  kind: 'point' | 'spot'
  /**
   * The cone's half-angle in degrees, `'spot'` only. Meaningless, and ignored,
   * on a `'point'` lamp - so an author switching a torch back to `'point'`
   * does not lose the number they had it aimed at.
   */
  angle: number
}

/** An axis-aligned box in world units - the shape an entity blocks. */
export interface Box {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

/**
 * How much bigger along each of its own axes, on top of the uniform `scale`.
 *
 * Absent is 1, and so is an absent axis - which is the whole point: a crate
 * that never asked to be a plank round-trips as the document it was.
 *
 * ---------------------------------------------------------------------------
 * A separate field rather than `scale` becoming a union
 * ---------------------------------------------------------------------------
 * `scale` means "how big, in this pack's cells" in every reader in this
 * package, in the editor, and in two renderers. Letting it be either a number
 * or a triple would make one word two shapes, and every one of those readers
 * would grow a branch for a thing almost no document says. So `scale` keeps
 * meaning what it means and this multiplies it - which also reads the way the
 * feature was asked for: "just to increase scale on one or 2 axes".
 *
 * ---------------------------------------------------------------------------
 * The axes are the model's own, not the world's
 * ---------------------------------------------------------------------------
 * Applied before the turn, so `stretch: { x: 3 }` on a wall makes a longer wall
 * whichever way the wall is facing. Stretching in world axes would mean the
 * same three numbers describe a different shape depending on `rotation`, which
 * is a field that changes what another field means.
 */
export interface Stretch {
  x?: number
  y?: number
  z?: number
}

/** The three multipliers, with the absent ones filled in. Never null. */
export function stretchOf(stretch?: Stretch): { x: number; y: number; z: number } {
  return { x: stretch?.x ?? 1, y: stretch?.y ?? 1, z: stretch?.z ?? 1 }
}

/**
 * Yaw, pitch and roll, in degrees - the whole orientation of something.
 *
 * `rotation` keeps its name and its meaning (degrees about Y) because that is
 * what it is called in every document on disk. The other two are named for the
 * axes they are, which is the precedent `player.weapon` set when a gun in a
 * hand needed three angles: see the "Three angles, and why not `rotation`"
 * block in ./format.
 */
export interface Turn {
  rotation: number
  pitch: number
  roll: number
}

/** The angles something carries, with the absent ones read as zero. */
export function turnOf(of: { rotation?: number; pitch?: number; roll?: number }): Turn {
  return { rotation: of.rotation ?? 0, pitch: of.pitch ?? 0, roll: of.roll ?? 0 }
}

/**
 * Is this thing level?
 *
 * Asked all over the collision and drawing code, and always to take the *old*
 * path: a placement that never says `pitch` or `roll` must rasterise, compose
 * and draw through exactly the arithmetic it did before either field existed.
 * That is not an optimisation, it is the promise that nothing already built
 * moves by a floating-point hair because a field was added to the format.
 */
export function isFlat(of: { pitch?: number; roll?: number }): boolean {
  return !of.pitch && !of.roll
}

/**
 * The nine numbers of a yaw-pitch-roll rotation, in the engine's convention.
 *
 * Lifted from three's `Matrix4.makeRotationFromEuler` for order `YXZ`, which is
 * what `skinned.tsx` sets on the weapon and what `instances.tsx` builds for a
 * placement. The order matters and a second convention here would put a tilted
 * ramp's collision at an angle its own picture never had - so this is *the same
 * matrix*, transcribed, and there is a test that pins a quarter turn against the
 * yaw-only `turnAboutY` below.
 *
 * Rows, not columns: `m[0]` is the row that produces x.
 */
function rotationMatrix({ rotation, pitch, roll }: Turn): readonly [number[], number[], number[]] {
  const rad = Math.PI / 180
  const a = Math.cos(pitch * rad)
  const b = Math.sin(pitch * rad)
  const c = Math.cos(rotation * rad)
  const d = Math.sin(rotation * rad)
  const e = Math.cos(roll * rad)
  const f = Math.sin(roll * rad)

  const ce = c * e
  const cf = c * f
  const de = d * e
  const df = d * f

  return [
    [ce + df * b, de * b - cf, a * d],
    [a * f, a * e, -b],
    [cf * b - de, df + ce * b, a * c],
  ]
}

/** A point carried through a rotation. The yaw-only case is exactly `turnAboutY`. */
export function turnPoint(
  point: { x: number; y: number; z: number },
  of: Turn,
): { x: number; y: number; z: number } {
  if (isFlat(of)) {
    const flat = turnAboutY(point.x, point.z, of.rotation)
    return { x: flat.x, y: point.y, z: flat.z }
  }
  const m = rotationMatrix(of)
  return {
    x: m[0][0] * point.x + m[0][1] * point.y + m[0][2] * point.z,
    y: m[1][0] * point.x + m[1][1] * point.y + m[1][2] * point.z,
    z: m[2][0] * point.x + m[2][1] * point.y + m[2][2] * point.z,
  }
}

/**
 * A child's angles seen from the world, given its parent's.
 *
 * Yaw alone composes by addition, which is exact and is what this did before
 * there was anything else to compose - so that path is kept verbatim rather
 * than routed through a matrix that would agree to fifteen decimal places and
 * not to sixteen.
 *
 * Anything tilted goes the long way: multiply the two rotations and read the
 * angles back off the product. Adding the axes separately is *wrong* the moment
 * two of them are non-zero - a parent pitched a quarter turn with a child yawed
 * a quarter turn is not a thing at 90/90/0 - and wrong in the way that costs
 * most, because it looks plausible in the panel and lands the child somewhere
 * else in the world.
 */
export function composeTurn(parent: Turn, child: Turn): Turn {
  if (isFlat(parent) && isFlat(child)) {
    return { rotation: ((parent.rotation + child.rotation) % 360 + 360) % 360, pitch: 0, roll: 0 }
  }

  const p = rotationMatrix(parent)
  const c = rotationMatrix(child)
  const m = [0, 1, 2].map((row) =>
    [0, 1, 2].map((col) => p[row][0] * c[0][col] + p[row][1] * c[1][col] + p[row][2] * c[2][col]),
  )

  // The inverse of `rotationMatrix`, transcribed from three's
  // `Euler.setFromRotationMatrix` for `YXZ`. The guard is the gimbal case:
  // pitched to straight up, yaw and roll are the same turn, so roll is given up.
  const deg = 180 / Math.PI
  const m23 = Math.min(1, Math.max(-1, m[1][2]))
  const pitch = Math.asin(-m23) * deg
  const settled =
    Math.abs(m23) < 0.9999999
      ? { rotation: Math.atan2(m[0][2], m[2][2]) * deg, roll: Math.atan2(m[1][0], m[1][1]) * deg }
      : { rotation: Math.atan2(-m[2][0], m[0][0]) * deg, roll: 0 }

  const wrap = (v: number) => ((v % 360) + 360) % 360
  return { rotation: wrap(settled.rotation), pitch: wrap(pitch), roll: wrap(settled.roll) }
}

/**
 * The axis-aligned box a tilted, stretched thing needs.
 *
 * Every corner carried through the rotation, and the extremes kept. For
 * anything not on a quarter turn that is *bigger* than what is drawn - a crate
 * at 45 degrees gets a box about 1.4 times as wide - and bigger is the only
 * direction that is safe: you can bump into air beside a ramp and swear at it,
 * where a box smaller than its picture is a ramp you fall through, which reads
 * as the level being broken rather than as collision being approximate.
 *
 * `stand` is added afterwards and in world Y, because that is where the two
 * renderers add it: the lift that puts a centre-pivoted barrel on the floor is
 * applied to the instance's *position*, outside the rotation. Rotating it here
 * would put the collision box somewhere the model is not.
 */
export function tiltedBox(
  local: Box,
  at: { x: number; y: number; z: number },
  of: Turn,
  size: { x: number; y: number; z: number },
  stand = 0,
): Box {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity

  for (const cx of [local.minX, local.maxX]) {
    for (const cy of [local.minY, local.maxY]) {
      for (const cz of [local.minZ, local.maxZ]) {
        const corner = turnPoint({ x: cx * size.x, y: cy * size.y, z: cz * size.z }, of)
        minX = Math.min(minX, corner.x)
        minY = Math.min(minY, corner.y)
        minZ = Math.min(minZ, corner.z)
        maxX = Math.max(maxX, corner.x)
        maxY = Math.max(maxY, corner.y)
        maxZ = Math.max(maxZ, corner.z)
      }
    }
  }

  return {
    minX: at.x + minX,
    minY: at.y + minY + stand,
    minZ: at.z + minZ,
    maxX: at.x + maxX,
    maxY: at.y + maxY + stand,
    maxZ: at.z + maxZ,
  }
}

/**
 * The box an entity of this blueprint occupies, standing at a position.
 *
 * Rotation is snapped to a quarter turn for the same reason the grid's boxes
 * are: the box is axis-aligned by construction, so anything else would be the
 * bounding box of a rotated box - noticeably bigger than the thing it stands
 * for, and biggest exactly at 45 degrees where somebody put it deliberately.
 *
 * **A tilt has no snap available** and takes the bounding box instead. See the
 * branch below, and §4 of docs/xp/manual.md for what it costs.
 *
 * Null for a blueprint you walk through, so a caller can skip it entirely
 * rather than testing an empty box.
 */
export function entityBox(
  blueprint: Blueprint,
  at: { x: number; y: number; z: number },
  rotation: number,
  scale = 1,
  /**
   * The rest of the transform, all of it optional.
   *
   * A fifth argument rather than four more, because every existing caller
   * passes these positionally and a thing with no tilt and no stretch should
   * not have to say so three times.
   */
  shape?: { pitch?: number; roll?: number; stretch?: Stretch },
): Box | null {
  if (blueprint.collider === 'none') return null

  const of = turnOf({ rotation, pitch: shape?.pitch, roll: shape?.roll })
  const stretch = stretchOf(shape?.stretch)

  /**
   * Every part, not just the root.
   *
   * A measured box that only knew about `model` would be a turret you can walk
   * through the barrel of - and worse, a barrel that *looks* solid, which is
   * the failure mode this whole file opens by arguing against.
   *
   * The union is taken in the blueprint's own local space, before the entity's
   * placement and turn, so the result goes through exactly the same rotation
   * and scale below as a single-model blueprint does. A box unioned after
   * rotation would be the bounding box of a rotated box, noticeably bigger than
   * the thing it stands for and biggest at forty-five degrees.
   */
  const measured = blueprint.collider === 'auto' ? localBox(blueprint) : null

  let w: number
  let h: number
  let d: number
  let ox: number
  let oz: number

  if (blueprint.collider === 'auto') {
    if (!measured) return null
    w = measured.maxX - measured.minX
    h = measured.maxY - measured.minY
    d = measured.maxZ - measured.minZ
    ox = measured.minX
    oz = measured.minZ
  } else {
    w = blueprint.collider.w
    h = blueprint.collider.h
    d = blueprint.collider.d
    // An explicit box is centred on the entity, which is what somebody typing
    // three numbers means. The measured one keeps the model's own offset,
    // because that is where the geometry actually is.
    ox = -w / 2
    oz = -d / 2
  }

  /**
   * Lifted so a model drawn round its own middle stands on the ground.
   *
   * The same twenty pieces the grid raises - the guns, the coins, the barrels -
   * and the same number, because it is the same fact about the same models.
   *
   * Measured from the union when the box is measured, and from the root model
   * when the box was typed by hand: an explicit collider is three numbers
   * centred on the entity, and lifting it by where some part happens to sit
   * would move a box its author had already placed.
   */
  const entry = findModel(blueprint.model)
  // Zero for a measured box: `localBox` has already lifted each part it added.
  const stand = measured ? 0 : entry?.centred ? entry.size.h / 2 : 0
  const baseY = measured ? measured.minY : (entry ? entry.min.y : 0)

  /**
   * A tilt has no quarter turn to snap to, so it takes the bounding box.
   *
   * The snap below works because a quarter turn of an axis-aligned box is still
   * an axis-aligned box - swap width and depth and it is exact. Pitch and roll
   * are not that, and there is no cheap shape that stands for a tilted box, so
   * the honest answer is the box that contains it. Bigger than what is drawn,
   * never smaller: bumping into air beside a ramp is an annoyance, falling
   * through one is a broken level. Stated in docs/xp/manual.md §4.
   *
   * `stretch` does not need this. It changes the numbers a quarter turn swaps
   * and nothing about the argument, so it folds into the path below.
   */
  if (!isFlat(of)) {
    const size = { x: scale * stretch.x, y: scale * stretch.y, z: scale * stretch.z }
    const local: Box = measured ?? {
      minX: ox,
      minY: baseY,
      minZ: oz,
      maxX: ox + w,
      maxY: baseY + h,
      maxZ: oz + d,
    }
    return tiltedBox(local, at, of, size, stand * size.y)
  }

  // The model's own axes, before the turn - which is what makes a stretched
  // wall a longer wall whichever way it faces.
  w *= stretch.x
  h *= stretch.y
  d *= stretch.z
  ox *= stretch.x
  oz *= stretch.z

  const quarter = ((Math.round(rotation / 90) % 4) + 4) % 4
  const swapped = quarter === 1 || quarter === 3

  const sw = (swapped ? d : w) * scale
  const sd = (swapped ? w : d) * scale
  const sh = h * scale

  // The offset turns with the box, the same derivation as the grid's version:
  // three.js sends +x to -z on a quarter turn.
  const sox = ox * scale
  const soz = oz * scale
  let x0: number
  let z0: number
  switch (quarter) {
    case 1:
      x0 = soz
      z0 = -(sox + w * scale)
      break
    case 2:
      x0 = -(sox + w * scale)
      z0 = -(soz + d * scale)
      break
    case 3:
      x0 = -(soz + d * scale)
      z0 = sox
      break
    default:
      x0 = sox
      z0 = soz
  }

  // `stand` goes through the stretch with everything else: it is half the
  // model's own height, and a model stretched twice as tall is pivoted twice as
  // far above its feet. The two renderers apply exactly this.
  const y0 = (baseY + stand) * stretch.y * scale

  return {
    minX: at.x + x0,
    minY: at.y + y0,
    minZ: at.z + z0,
    maxX: at.x + x0 + sw,
    maxY: at.y + y0 + sh,
    maxZ: at.z + z0 + sd,
  }
}

/** Do two boxes overlap? Touching does not count, the same as the cell grid. */
/**
 * The box a thing *occupies*, whether or not it stops anybody.
 *
 * `entityBox` answers null for `collider: "none"`, which is exactly right for
 * the collision grid - that is what "walk through me" means - and exactly wrong
 * for a **body**, which still has to land on the floor rather than through it.
 *
 * The bug this exists for: a ball with no collider was given a plain half-metre
 * cube *centred* on its position, and every drawn model is placed by its
 * **bottom** - `floorOffset` lifts the twenty-odd kit pieces that are pivoted
 * through their middle so that dropping one on a floor stands it on the floor.
 * So the physics rested the ball with its position half a cell up, the renderer
 * then lifted the mesh another half cell to stand it on that, and the ball
 * floated its own radius above the pitch with its shadow underneath it.
 *
 * Measuring it the way `auto` would keeps the promise `instances.tsx` already
 * makes about placements: the barrel you can see and the barrel you bump into
 * are in one place.
 */
export function shapeBox(
  blueprint: Blueprint,
  at: { x: number; y: number; z: number },
  rotation: number,
  scale = 1,
  shape?: { pitch?: number; roll?: number; stretch?: Stretch },
): Box | null {
  if (blueprint.collider !== 'none') return entityBox(blueprint, at, rotation, scale, shape)
  // Everything else about the blueprint is kept, including `parts` - a thing
  // made of three models occupies all three whether or not it stops you.
  return entityBox({ ...blueprint, collider: 'auto' }, at, rotation, scale, shape)
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  )
}

/**
 * Where every part of a blueprint sits, relative to the blueprint's own origin.
 *
 * The tree flattened once, so the renderer and the collision box read the same
 * answer rather than each composing it themselves - which is how a gun ends up
 * drawn in one place and shot from another.
 *
 * ---------------------------------------------------------------------------
 * Resolved by walking up, not by sorting
 * ---------------------------------------------------------------------------
 * A part may be written above its parent, because a JSON array's order is not
 * something anybody should have to think about. So each part walks up its own
 * chain to the root, exactly the way `worldTransform` does for entities - same
 * derivation, same quarter-turn convention, and deliberately not a second one.
 *
 * A cycle is dropped rather than thrown on: a document is checked by `parseXp`,
 * and this runs sixty times a second behind it. The guard is a depth limit
 * rather than a visited-set because the depth that matters here is about four -
 * anything past the limit is malformed, and the honest answer for a malformed
 * part is to leave it at the origin where somebody will see it.
 */
export function partTransforms(
  blueprint: Blueprint,
): { part: Part; x: number; y: number; z: number; rotation: number; scale: number }[] {
  const parts = blueprint.parts ?? []
  if (parts.length === 0) return []

  const byName = new Map<string, Part>()
  for (const part of parts) {
    if (part.name && !byName.has(part.name)) byName.set(part.name, part)
  }

  return parts.map((part) => {
    let x = part.x
    let y = part.y
    let z = part.z
    let rotation = part.rotation
    let scale = part.scale

    let link: Part | undefined = part.parent ? byName.get(part.parent) : undefined
    let socket = part.socket
    let guard = 0

    while (link && guard++ < 8) {
      const offset = (socket ? link.sockets?.[socket] : undefined) ?? { x: 0, y: 0, z: 0 }

      const turned = turnAboutY(x + offset.x, z + offset.z, link.rotation)
      x = link.x + turned.x * link.scale
      y = link.y + (y + offset.y) * link.scale
      z = link.z + turned.z * link.scale
      rotation += link.rotation
      scale *= link.scale

      socket = link.socket
      link = link.parent ? byName.get(link.parent) : undefined
    }

    return { part, x, y, z, rotation: ((rotation % 360) + 360) % 360, scale }
  })
}

/**
 * A point turned about the Y axis, in the engine's degrees.
 *
 * Three.js sends +x to -z on a quarter turn and every transform in this package
 * agrees with it; a second convention here would put a socket on the wrong side
 * of everything that uses one.
 */
function turnAboutY(x: number, z: number, degrees: number): { x: number; z: number } {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { x: x * cos + z * sin, z: -x * sin + z * cos }
}

/**
 * The blueprint's whole geometry, in its own units, before anything is placed.
 *
 * Null when nothing in it is a model we ship - which `entityBox` turns into "no
 * collision" rather than a box of zeroes, because a box with no size still
 * stops you at its corner.
 */
function localBox(blueprint: Blueprint): Box | null {
  /**
   * A thing you cannot see has nothing to measure.
   *
   * `auto` means "as big as what you draw", so on a blueprint that draws
   * nothing it is not a small box, it is an incoherent question - and the
   * answer it would otherwise give is the worst one available: a collider the
   * size of a model that is never rendered. That is an invisible wall in the
   * middle of a level, reported as "something is blocking me and I can't see
   * what", which is exactly the bug that got filed against this creator once
   * already.
   *
   * An explicit box still collides. A node that is *deliberately* an invisible
   * wall is a real thing to want, and saying `{ w, h, d }` is how you ask for
   * it on purpose rather than by leaving a default alone.
   */
  if (blueprint.draw === false) return null

  const root = findModel(blueprint.model)

  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity

  const add = (
    entry: { size: { w: number; h: number; d: number }; min: { x: number; y: number; z: number }; centred: boolean },
    at: { x: number; y: number; z: number; rotation: number; scale: number },
  ) => {
    const s = at.scale
    const quarter = ((Math.round(at.rotation / 90) % 4) + 4) % 4
    const swapped = quarter === 1 || quarter === 3
    const w = (swapped ? entry.size.d : entry.size.w) * s
    const d = (swapped ? entry.size.w : entry.size.d) * s
    const h = entry.size.h * s

    // The part's own offset, turned with it - the same derivation the entity
    // box uses below, kept here so a part and a whole agree about quarter turns.
    const ox = entry.min.x * s
    const oz = entry.min.z * s
    let x0: number
    let z0: number
    switch (quarter) {
      case 1:
        x0 = oz
        z0 = -(ox + entry.size.w * s)
        break
      case 2:
        x0 = -(ox + entry.size.w * s)
        z0 = -(oz + entry.size.d * s)
        break
      case 3:
        x0 = -(oz + entry.size.d * s)
        z0 = ox
        break
      default:
        x0 = ox
        z0 = oz
    }

    const stand = entry.centred ? (entry.size.h / 2) * s : 0
    const y0 = entry.min.y * s + stand

    minX = Math.min(minX, at.x + x0)
    minY = Math.min(minY, at.y + y0)
    minZ = Math.min(minZ, at.z + z0)
    maxX = Math.max(maxX, at.x + x0 + w)
    maxY = Math.max(maxY, at.y + y0 + h)
    maxZ = Math.max(maxZ, at.z + z0 + d)
  }

  if (root) add(root, { x: 0, y: 0, z: 0, rotation: 0, scale: 1 })

  for (const placed of partTransforms(blueprint)) {
    const entry = findModel(placed.part.model)
    // A part naming a model we do not ship is skipped rather than fatal. The
    // parser refuses that document; this runs behind it and should not take the
    // rest of the thing's collision down with it.
    if (entry) add(entry, placed)
  }

  if (minX === Infinity) return null
  return { minX, minY, minZ, maxX, maxY, maxZ }
}

/**
 * Every model this kind of thing draws - its root, and each part.
 *
 * Deduplicated, because a renderer groups by model and a turret whose base and
 * barrel are the same box wants one group, not two. The *count* of occurrences
 * is a different question and belongs to whoever is sizing a buffer.
 */
export function drawnModels(blueprint: Blueprint): string[] {
  // Nothing to load for a node - and this is the call that decides which glTFs
  // a document pulls over the network, so a level full of waypoints should not
  // be fetching the model its author picked to see them by in the editor.
  if (blueprint.draw === false) return []

  const models = new Set<string>([blueprint.model])
  for (const part of blueprint.parts ?? []) models.add(part.model)
  return [...models]
}

/**
 * The tag words the things we ship already use.
 *
 * ---------------------------------------------------------------------------
 * A suggestion, and never a rule
 * ---------------------------------------------------------------------------
 * `tags` is deliberately not an enum, and this does not make it one. The note
 * on the field stands: the engine never reads a tag, only the rules in the
 * document do, and an enum would mean every new kind of thing an XP wants to
 * describe is a change to this package. Nothing here is checked by the parser
 * and nothing is refused for being absent from it.
 *
 * What this is for is the editor, and the problem it solves is narrower than a
 * vocabulary: tags were one text field with a comma in it, so the way to find
 * out that the shipped presets say `pickup` rather than `pickups` was to open a
 * template and read it. A rule matching `pickups` against a blueprint tagged
 * `pickup` is not an error anywhere - it matches nothing, forever, silently -
 * and that is the whole failure mode of a free-text field that two places have
 * to agree on.
 *
 * So the editor offers these and still takes anything typed. The list is short
 * on purpose: it is *what we ship*, not what somebody might want. Adding a word
 * here should mean a preset, a template or a starter started using it.
 *
 *   player   the body you arrive as - `spawnPlayer` puts it on the built-in one
 *   enemy    the `+ enemy` starter
 *   pickup   coins, ammo, health, in `presets`
 *   hazard   spikes and the sawblade, in `presets`
 *   weapon   what a hand can hold, in `templates`
 *   sign     something with words on it, in `presets`
 */
export const SUGGESTED_TAGS = [
  'player',
  'enemy',
  'pickup',
  'hazard',
  'weapon',
  'sign',
] as const

/**
 * Every tag this document actually uses, in the order the editor should list
 * them: the ones we ship first, then whatever the level invented.
 *
 * The level's own words matter more than ours here and still come second, which
 * is deliberate - a suggestion list whose order changes as you type in it is a
 * list you cannot learn. What the level added is appended, sorted, so it is at
 * least in one place.
 */
export function tagsInUse(
  blueprints: Readonly<Record<string, { tags: readonly string[] }>>,
): string[] {
  const theirs = new Set<string>()
  for (const blueprint of Object.values(blueprints)) {
    for (const tag of blueprint.tags) theirs.add(tag)
  }
  for (const tag of SUGGESTED_TAGS) theirs.delete(tag)
  return [...SUGGESTED_TAGS, ...[...theirs].sort()]
}
