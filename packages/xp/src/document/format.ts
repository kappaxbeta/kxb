/**
 * An XP, as a document.
 *
 * One file holds everything an experience is, and the runtime does not know
 * what it is running until it reads one - the same way a console does not know
 * what game it is running until you push a cartridge in.
 *
 * ---------------------------------------------------------------------------
 * Why the parser is this strict
 * ---------------------------------------------------------------------------
 * A document arrives from a file somebody wrote by hand, and every model id in
 * it ends up in a `fetch`. So `parseXp` is not a type assertion with a happy
 * path - it is the boundary, and everything past it is trusted. Three things it
 * refuses outright:
 *
 *  - a model that is not in the shipped catalogue, because the alternative is
 *    a hand-written path reaching wherever it likes;
 *  - a placement outside the lattice, because a world that is mostly empty
 *    space at coordinate 90,000 is a world that costs a browser everything to
 *    draw and shows nothing;
 *  - a format version it does not understand, because guessing at a document
 *    from a newer writer is how you silently drop half of somebody's level.
 *
 * It collects problems rather than throwing on the first, because a document
 * with six typos in it should report six typos. `parseXp` returns either the
 * document or the list - never a half-valid object, which is the shape that
 * makes a caller forget to check.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately not here yet
 * ---------------------------------------------------------------------------
 * Blueprints, entities, rules, input maps, cameras, scripts. They are in the
 * plan (docs/xp/creator.md §3) and every one of them is a field this parser
 * will grow. What exists now is exactly what M1 needs: enough of a document to
 * describe a world you can walk around in, so that the *shape* of the thing -
 * a version, a pack list that carries its own provenance, a world of
 * placements - is settled before anything is written against it.
 *
 * Unknown top-level keys are kept rather than rejected, so a document written
 * against a later version still loads here with its extra sections ignored.
 * Unknown keys *inside* a placement are dropped, because that is where a typo
 * costs you a wall in the wrong place and silence is the wrong answer.
 */

import {
  type Capability,
  capabilityProblems,
  isCapability,
  type MarkKind,
  type XpCapabilities,
} from './capabilities'
import { readFrame, type XpFrame } from './frame'
import { readSketch, type XpSketch } from './sketch'
import { type Finish, readFinish, readHue } from './finish'
import {
  BODY_FIELDS,
  BODY_LIMITS,
  isMaterial,
  MATERIALS,
  MAX_COLLIDER_BOXES,
  type Blueprint,
  type BodySpec,
  type ColliderSpec,
  type Light,
  type Part,
  type XpMaterial,
  type PlacementBox,
  type PlacementCollider,
  type Stretch,
} from './blueprints'
import {
  CAMERA_AXES,
  CAMERA_KINDS,
  cameraProblems,
  DEFAULT_CAMERA,
  isCameraKind,
  isDefaultCamera,
  type CameraAxis,
  type XpCamera,
} from '../world/camera'
import {
  ASSIGNS,
  DEFAULT_RULES,
  isAssign,
  isMode,
  isDefaultRules,
  isPreset,
  isRoleView,
  isSides,
  MAX_DECLARED_PLAYERS,
  MODES,
  PRESETS,
  ROLE_VIEWS,
  rulesProblems,
  SIDES,
  type RoleRule,
  type Mode,
  type XpRules,
} from './rules'
import { readData, undeclared, type XpData } from './data'
import {
  flowProblems,
  MAX_SAYS,
  winsProblems,
  type FlowPhase,
  type FlowStep,
  type XpFlow,
} from './flow'
import { isDefaultTalk, type XpTalk } from './talk'
import {
  isEmptyWords,
  isLocaleCode,
  MAX_LOCALES,
  MAX_PHRASE_KEY,
  MAX_PHRASE_TEXT,
  MAX_PHRASES,
  type XpPhrases,
  type XpWords,
} from './words'
import {
  ANIMATION_NAME,
  isLayer,
  MAX_ANIMATION_NAME,
  MAX_STATES,
  MAX_TRANSITIONS,
  type AnimationGraph,
  type AnimationState,
  type AnimationTransition,
} from './animation'
import {
  COMPARISONS,
  HELD_PROP,
  isDataRef,
  refField,
  TRIGGER_EVENTS,
  type Comparison,
  type Condition,
  type DataRef,
  type Trigger,
  type TriggerEvent,
} from '../rules/triggers'
import { HOST_CAPABILITIES, type HostCapability } from '../net/host'
import { isXpId, type Verb, type VerbTarget } from '../rules/verbs'
import { isSound } from '../assets/sounds'
import { isKnownModel } from '../assets/catalogue'
import { PACKS, SKELETON_IDS, skeletonOf, type SkeletonId } from '../assets/packs'
import {
  clipIsSquare,
  MAX_CLIP_SAMPLES,
  MAX_CLIP_TRACKS,
  MAX_XP_CLIPS,
  type XpClip,
} from './clips'
import {
  animatable,
  BACKDROP_KINDS,
  CAMERA_NAME,
  DEFAULT_BACKDROP,
  DEFAULT_CAMERA as DEFAULT_MOVIE_CAMERA,
  DEFAULT_DURATION,
  DEFAULT_FOV as DEFAULT_MOVIE_FOV,
  DEFAULT_FPS,
  EASES,
  MAX_CAMERAS,
  MAX_CUES,
  MAX_CUTS,
  MAX_DURATION,
  MAX_FPS,
  MAX_FRAMINGS,
  MAX_KEYS,
  MAX_TRACKED,
  MIN_FPS,
  propOfProperty,
  type Backdrop,
  type BackdropKind,
  type Cut,
  type Ease,
  type Framing,
  type Key,
  type MovieCamera,
  type Tracks,
  ACTION_KINDS,
  MAX_ACTION_SECONDS,
  MAX_ACTIONS,
  MAX_LINE,
  MAX_SEQUENCE_NAME,
  MAX_SEQUENCES,
  MAX_SPEED,
  MAX_TAKES,
  MIN_SPEED,
  type ActionKind,
  type Take,
  type Vec3,
  type XpAction,
  type XpSequence,
  type XpTimeline,
} from './movie'
import {
  MAX_MOTION_NAME,
  MAX_MOTION_RATE,
  MAX_MOTION_SECONDS,
  MAX_MOTION_STEPS,
  MAX_MOTIONS,
  MOTION_KINDS,
  MOTION_NAME,
  type Motion,
  type MotionAxis,
  type MotionKind,
  type MotionStep,
} from './motions'

/** The mark kinds a document may place. See ./capabilities. */
const MARK_KINDS: readonly MarkKind[] = ['red', 'blue', 'start', 'finish', 'spawn', 'point']

/** The only format version this parser understands. */
export const XP_FORMAT = 'xp/1'

/**
 * The name of the scene a document's own `world` and `spawn` are.
 *
 * Deliberately *not* a version bump. docs/xp/scenes.md calls this `xp/2` and
 * docs/xp/backend.md's B0 claimed the same string for an assets block; the
 * second is deferred and the first does not need it. `scenes` and `enter` are
 * optional and additive, absence means one scene called this, and every
 * document on disk keeps parsing without being touched - which is exactly what
 * `backend`, `pose` and `Mark.name` each did. A version whose only job is to
 * announce a field that is legible by being present is a second thing to keep
 * true.
 */
export const MAIN_SCENE = 'main'

/**
 * How far from the origin anything may be placed, in cells.
 *
 * Cells run -128..127, so a world is 256 across. The limit is not really about
 * space - placements are a list, so an untouched cell costs nothing - it is
 * about a document that claims a wall at 90,000 and a floor at the origin,
 * which is 90,000 cells of nothing for a renderer to frame a camera around.
 */
export const WORLD_RADIUS = 128

/** Height limit, in cells. Generous for a room, cheap to check. */
export const WORLD_HEIGHT = 64

/**
 * How many placements one document may carry.
 *
 * Measured rather than picked. `bun run xp:bench` rasterises a world of floor
 * tiles and reports (median of nine, after a warm-up):
 *
 *     placements    cells     buildSolids
 *          1 000   16 000          7.8ms
 *          2 000   32 000         19.6ms
 *          5 000   80 000         75.4ms
 *         10 000  160 000        198.6ms
 *
 * Superlinear, because it is cells and not pieces that cost - a floor tile is
 * sixteen of them. This is a *load* cost, paid once when a document opens, so
 * the budget is a person's patience rather than a frame: a fifth of a second is
 * a level that opens, and a second and a half is a level that hangs.
 *
 * 8 000 keeps the worst case around 150ms on this machine, which is a
 * developer's laptop - so call it a third of a second on something ordinary.
 * The previous 20 000 was a guess and would have been about a second and a
 * half of a white screen.
 */
export const MAX_PLACEMENTS = 8_000

/** A goal you can run through, roughly the size the lounge already uses. */
export const DEFAULT_MARK_WIDTH = 5
export const DEFAULT_MARK_HEIGHT = 4

/** Wide enough for any pitch, narrow enough that a goal can still be missed. */
export const MAX_MARK_SIZE = 24

/** One model, somewhere in the world, turned and sized. */
export interface Placement {
  model: string
  /**
   * World units, and fractional.
   *
   * These were whole cells until the editor learned to place against surfaces
   * rather than paint on a lattice. The grid is still what *collision* is made
   * of - every placement is rasterised into cells once at load, which is what
   * makes it free - but where a thing stands is no longer rounded on the way
   * in. See the note in `readPlacement`.
   */
  x: number
  y: number
  z: number
  /** Turn about Y, in degrees - the editor's unit, not three.js's. */
  rotation: number
  /**
   * The other two angles, in degrees. Absent is zero, which is level.
   *
   * ---------------------------------------------------------------------------
   * Why not a triple called `rotation`
   * ---------------------------------------------------------------------------
   * The same argument `player.weapon` makes at the grip block below, met a
   * second time and answered the same way: `rotation` is one number in every
   * document on disk, because a crate on a floor turns one way, and reusing the
   * word for a triple would make one word two shapes. So the extra angles are
   * named for the axes they are, with the names anybody who has held a
   * controller already knows - and `rotation` stays yaw.
   *
   * They exist because a ramp cannot be tilted and a level built out of pieces
   * that are all upright is a level with no slopes in it. What they cost is
   * collision: see `placementCells` in ./solids and §4 of docs/xp/manual.md.
   *
   * Optional and dropped when zero, so a document that never tilts anything
   * round-trips through the editor as the document it was.
   */
  pitch?: number
  roll?: number
  /**
   * Multiplied on top of the pack's own scale.
   *
   * One means "whatever this pack says a cell is", which is right for almost
   * everything. It exists for the times a crate wants to be a landmark.
   */
  scale: number
  /**
   * Per-axis multipliers on top of `scale`, so a crate can become a plank.
   *
   * A separate field rather than `scale` growing a union - the argument is at
   * `Stretch` in ./blueprints, where the type lives because `Box` does and
   * because this file already depends on that one.
   */
  stretch?: Stretch
  /**
   * How high landing on this throws you, in cells. Absent is not bouncy.
   *
   * The first behaviour a placement has ever carried, and worth being uneasy
   * about: a placement has been pure scenery - model, where, how big - and
   * everything that *does* something has been an entity or a mark. The case for
   * putting it here anyway is that a bouncy floor is a property of the floor,
   * and making somebody promote a tile to an entity to give it give would be a
   * tax on the commonest use of the feature.
   *
   * Cells rather than a springiness, for the reason `player.jump` is in cells:
   * an author counts blocks. See `Blocker.bounce` in physics for what a fixed
   * launch costs - briefly, it is perpetual, which is what a spring is.
   */
  bounce?: number
  /**
   * What this collides as, when the measured shape is not what you want.
   *
   * Absent is the measured shape and is what every document already means -
   * see `PlacementCollider` in ./blueprints for the two things it can say
   * instead and why one of them is a list.
   *
   * The second behaviour a placement carries, after `bounce`, and an easier
   * case to argue than that one was: `bounce` is a placement doing something,
   * which is what an entity is for, while this is a placement being *more
   * accurately itself*. A collider is not a rule about a wall. It is the wall's
   * own shape, corrected where a metre lattice could not measure it.
   */
  collider?: PlacementCollider
}

/** Where a pack came from, carried in the document rather than looked up. */
export interface PackRef {
  id: string
  author: string
  licence: string
  /** The publisher's own address. This is why there is no asset registry. */
  source: string
}

/**
 * A frame or a point standing in the world, that the rules can see.
 *
 * Not a model: a mark is a *fact* about the level - this is where red scores,
 * this is where a run ends, this is where the away side arrives - and whatever
 * is drawn at it is decoration. Keeping the two apart is what lets
 * `capabilityProblems` check that a level claiming `football` has two goals,
 * which it could not do by looking at placements. A goal built out of three
 * walls is three walls.
 *
 * The vocabulary is the lounge's, unchanged, because it is the same idea and
 * has already been through contact with players: `@/domain/lounge/goal-events`
 * has had red/blue/start/finish since football and races existed.
 */
export interface Mark {
  kind: MarkKind
  /**
   * What a verb calls this, when it wants to send somebody here.
   *
   * Optional, and absent on every mark written before it existed. Until now a
   * `teleport` could only address an *entity*, so "send them back to the start"
   * meant placing an empty node on top of the spawn and naming that — a second
   * thing to keep in the same place as the first.
   *
   * A kind that appears exactly once needs no name: `to: "start"` resolves to
   * the only start there is. That falls out of the same rule rather than being
   * a special case, and it stops resolving the moment an author adds a second
   * one, which is right — with two starts, "the start" is a question rather
   * than an address.
   */
  name?: string
  /** Cell coordinates. */
  x: number
  y: number
  z: number
  /** Which way it faces, in degrees. A goal scorable from both sides is not a goal. */
  facing: number
  /** How wide and how tall the frame is, in cells. Ignored for a spawn. */
  width: number
  height: number
  /**
   * Which side this belongs to, for a spawn. Free-form because teams are named
   * by the rules block, not by this file.
   */
  team?: string
}

/** Where a body arrives, and which way it is looking when it does. */
export interface XpSpawn {
  x: number
  y: number
  z: number
  facing: number
}

/**
 * A place you can be in, other than the one at the root.
 *
 * docs/xp/scenes.md §1.1. A scene is not a prefab and not a group: it is
 * somewhere you are, and you are in exactly one at a time. Two things visible
 * at once are one scene; a repeated unit is a blueprint, which already has
 * parts, sockets and parenting and is the right tool for that job.
 *
 * ---------------------------------------------------------------------------
 * A place, and its contents
 * ---------------------------------------------------------------------------
 * Geometry, marks, a spawn and `entities` - the same four things the root has,
 * which is the whole claim of §1.1: a document *is* a scene and simply never
 * said so. S0 shipped the first three and refused the fourth in words, because
 * every entity check was written against a document that had one of everything
 * - blueprint names resolve, two entities may not share a name, a parent is
 * somebody who exists - and a second set of actors would either escape all of
 * them or need each one taught which room it was asking about.
 *
 * S1 taught them, and the shape of the answer is worth keeping: **a name is
 * resolved where you are standing.** Two rooms may each hold a `door` and each
 * have a mark called `gate`, because you are in exactly one of them (§1.2), so
 * the checks run *per place* rather than across the document. What stays
 * document-wide is what a document is billed for - the placement and entity
 * budgets, and the packs an export reads a licence out of - because those are
 * facts about a file rather than about a room.
 *
 * The one thing a scene still does not own is `blueprints`. A blueprint is a
 * kind of thing rather than a thing, the root's table is where every room's
 * actors are drawn from, and per-room kinds would be a second namespace for no
 * gain anybody has asked for.
 */
export interface XpScene {
  /** What the editor's scene panel calls it. The key is what a verb names. */
  name?: string
  world: XpWorld
  spawn: XpSpawn
  /**
   * Who is in this room, drawn from the document's own `blueprints`.
   *
   * Always present, and empty for a room that is furniture only - the same
   * shape the root has, so `placeOf` hands back one kind of place and nothing
   * downstream has a `?? []` in it.
   *
   * Which means a scene written before this existed comes back from the parser
   * with an empty list it never had, and that is deliberately *not* the trap
   * `enter` was. The "do not grow a field by being opened" rule is about whole
   * optional blocks - `enter`, `scenes`, `scripts`, `rules` - and a scene has
   * never obeyed it: one written as `{ world }` alone already comes back with a
   * `spawn` at the origin, because a place is normalised on the way out exactly
   * as the root is. A required member of a place is part of that normalising.
   */
  entities: EntitySpec[]
  /**
   * And what happens here over time, when this place is a shot.
   *
   * docs/xp/scenes.md §2.1: *a scene with a timeline and no player input is a
   * shot; a sequence of shots is a movie*. So this is the whole of the movie
   * feature in the format - not a second document, not a second runtime, and
   * not a mode a document declares. Every in-between case falls out of it: a
   * cutscene is a shot between two playable scenes, an intro is the shot a
   * sequence starts with, a looping backdrop is a shot a hub sits inside.
   *
   * Absent for every place written before it and for every place that is
   * somewhere to *stand* rather than something to *watch*, which is almost all
   * of them. See `@kxb/xp/movie`.
   */
  timeline?: XpTimeline
}

export interface XpWorld {
  /** Cells above which nothing is drawn and below which you cannot fall. */
  floorY: number
  /**
   * Solid ground at `floorY`, everywhere, forever.
   *
   * Off by default, which is the honest default for a level made of pieces: a
   * floor you laid is a floor you can see, and an invisible one under the whole
   * world hides the hole you left.
   *
   * On, it is the thing every other engine gives you for nothing - somewhere to
   * stand while you are still building. Without it a half-built level drops you
   * out of the bottom on the first frame, and the runtime's answer to that was a
   * catch plane forty cells down, which is not standing anywhere, it is falling
   * more slowly.
   */
  ground: boolean
  /**
   * Falling past `floorY` puts you back at the spawn.
   *
   * The third answer to "what is under the world", and the one that makes a
   * platformer possible. The other two are already here and neither is one:
   * `ground` on is a solid plane, so you cannot fall at all, and `ground` off is
   * a catch forty cells down, so a fall is a walk back. A platformer is a game
   * about *missing*, and a miss that costs nothing is not a miss.
   *
   * Meaningless with `ground` on - a solid plane means the fall never gets
   * there - so the parser says so rather than letting an author set a rule that
   * can never fire and wonder why their level is forgiving.
   */
  restart: boolean
  /**
   * Falling past `floorY` is a *death*, not a walk back.
   *
   * The fourth answer to "what is under the world", and the one that makes a
   * fall cost what every other mistake in the level costs. The three already
   * here are a solid plane (`ground`), a catch forty cells down, and a quiet
   * return to the spawn (`restart`) - and the third is the one this exists
   * beside, because a return that costs nothing but the walk is a different
   * game from one that costs a life.
   *
   * **The point is that a hole and a spike teach one rule.** A course where
   * falling into a pit sends you back with your health untouched, while the
   * spikes beside the pit kill you and hold you down for `rules.respawn`, is a
   * course teaching two rules for the same mistake - and a player learns the
   * inconsistency rather than the level.
   *
   * Refused beside `ground`, exactly as `restart` is and for the same reason: a
   * solid plane means the fall never reaches the height that would kill you, so
   * an author setting it would be setting a rule that can never fire.
   *
   * Refused beside `restart` too, which is the rule this field brings. They are
   * two answers to one question - what happens when you fall - and a document
   * carrying both has not said which it means. The parser names the pair rather
   * than picking one, because picking would be inventing an intention.
   *
   * Absent is false, which is every level written before this: a fall still ends
   * wherever `ground` and `restart` say it does.
   */
  fatal: boolean
  /**
   * What is behind the world, or nothing at all.
   *
   * Absent means **transparent**: the canvas is not painted, and what shows
   * through is the page the level is sitting in. That is the default because it
   * is what the lounge already does and because it is the honest one - a level
   * is a thing on a page here, not a window cut into one, and a rectangle of
   * near-black inside a near-black page is a rectangle you can see the edges of.
   *
   * A CSS colour when a document wants its own sky. The *fog* follows it either
   * way, which is the part that is easy to get wrong: fog in a different colour
   * from the background draws a visible ring where the far plane ends, and the
   * whole job of fog here is that there is no such ring.
   *
   * Colour only, for now. An image or a skybox is a fetch, and a fetch is a
   * loading state, a failure state and a second thing a document can point at
   * that might not be there - none of which a colour needs.
   */
  background?: string
  placements: Placement[]
  marks: Mark[]
}

/**
 * One entity, placed.
 *
 * `at` is in world units and not cells, which is the whole difference from a
 * `Placement`. A crate is 0.46 across; a lattice that a four-metre wall sits on
 * cannot say "just left of the door", and a barrel snapped to the nearest metre
 * is a barrel you bump into a third of a metre before you touch it.
 */
export interface EntitySpec {
  blueprint: string
  /**
   * What to call it, so a rule or a script can find it.
   *
   * Optional, because most things in a level are scenery and naming four
   * hundred crates is worse than naming none. Unique when present - two
   * entities answering to one name makes `getEntityByName` a coin toss, and a
   * coin toss inside a rule is the hardest kind of bug to see.
   */
  name?: string
  /**
   * The name of the entity this hangs from, if any.
   *
   * Position, rotation and scale are then *relative to the parent*, which is
   * what makes a rider move with a kart without either of them knowing the
   * other exists.
   */
  parent?: string
  /** Which of the parent's sockets. Its origin when absent. */
  socket?: string
  x: number
  y: number
  z: number
  rotation: number
  /** Pitch and roll, in degrees. Absent is level - see `Placement.pitch`. */
  pitch?: number
  roll?: number
  scale: number
  /** Per-axis multipliers on top of `scale` - see `Placement.stretch`. */
  stretch?: Stretch
  /** Overrides the blueprint's own starting values, per entity. */
  props: Readonly<Record<string, number>>
  /**
   * What a sign says, when it is one.
   *
   * Per instance rather than on the blueprint, for the same reason a save
   * point's `order` is: a "sign" blueprint is one kind of thing and every one
   * placed from it says something different. Absent on nearly everything, the
   * way `name` is - a level of scenery does not carry a paragraph nobody wrote.
   *
   * Not a prop, because `props` is numbers by construction (`readProps`) - see
   * the note there. A separate field rather than widening `props` to allow
   * strings keeps every verb that does arithmetic on a prop safe from ever
   * being handed one.
   */
  text?: string
  /**
   * What colour a sign's own text is. `0xRRGGBB`. Absent reads as white, the
   * same way an absent `Light.colour` would if it had a default of its own.
   */
  colour?: number
  /**
   * A plate behind a sign's text, in the same `0xRRGGBB` shape as `colour`.
   *
   * Absent draws none - the text floats on its own, which is the plainer
   * default and the one that costs nothing to look at when nobody asked for a
   * plate.
   */
  background?: number
}

/**
 * How long a sign can be, in characters.
 *
 * Short enough to read at a glance from a few steps away, which is the only
 * distance this is ever read from (`READ_DISTANCE` in the runtime's
 * `./signs`) - a level's rules in prose, not a paragraph. Long enough for a
 * sentence or two rather than a single word.
 */
export const MAX_SIGN_TEXT_LENGTH = 240

/**
 * How many entities one document may carry.
 *
 * The tighter of the two limits, and for a reason worth writing down: an entity
 * costs per *frame*, not once. Measured (`bun run xp:bench`), one simulation
 * step against N entity boxes, and one trigger pass with a single player:
 *
 *     entities      step    triggers   (per frame, 16.7ms budget)
 *          200    0.04ms      0.04ms
 *          500    0.06ms      0.06ms
 *        1 000    0.13ms      0.43ms
 *        2 000    0.24ms      0.81ms
 *
 * Both are linear, which is what a linear scan should be, and both are cheap
 * enough at two thousand that the scan was the right call - a hash grid would
 * have been optimising 0.24ms of a 16.7ms budget.
 *
 * The number that actually bounds this is not in the table: the trigger pass is
 * per *prober*, so it is entities times players. At 1 000 entities and sixteen
 * players that is 6.9ms a frame, which is nearly half the budget before
 * anything has been drawn. So 1 000, and the note for the day it is not enough
 * is that the fix is spatial - only test entities near a player - rather than a
 * bigger number here.
 */
export const MAX_ENTITIES = 1_000

/**
 * What an XP asks of its host, split by what happens when it is not there.
 *
 * Both lists are optional and both default to empty, so the block only ever
 * says something. See `./host` for the four capabilities and for
 * `missingCapabilities`, which is the half that reads this.
 */
export { markByName, nearestMark } from './capabilities'

export interface XpBackend {
  /** Absent means the level does not load. */
  needs?: readonly HostCapability[]
  /** Absent means the level loads with less. */
  wants?: readonly HostCapability[]
}

/**
 * What somebody may take out of a world that is not theirs.
 *
 * docs/xp/server-authority.md §4.3, and it is the level's half of a rule the
 * **database** keeps: `xp_visit` reads this block off the published version and
 * enforces it, because the owner of the world being visited is usually not
 * online and a client that could name the amount could name any amount. That is
 * the whole reason this is a block in a document rather than an argument to a
 * call.
 *
 * Absent is every level ever written, and absent means nobody may take anything.
 */
export interface XpVisit {
  /**
   * The declared field that moves, which is a `player` or a `shared` one.
   *
   * Both are one row per person - `xp_store` is unique on
   * `(xp_id, scope, account_id)` - so both have the two rows a steal needs: one
   * going down while another goes up. **`space` is the one that cannot**, and
   * not because of a policy: it is a single row for the whole space, so there is
   * nobody to take it *from*.
   *
   * The two that are allowed are allowed for different games, and the split is
   * worth knowing before choosing:
   *
   * - **`shared`** is yours to write and the space's to read, which is the only
   *   way a visitor can *see* that there is something to take. A shelf, a
   *   garden, a stack of plants somebody is proud of.
   * - **`player`** is private, so nothing about it is visible until you are
   *   inside that person's world - which is the shape state.md §7.6 describes
   *   and the harder game to build, because entering somebody else's world is
   *   its own feature.
   *
   * The parser checks the scope rather than trusting the name, so a level cannot
   * ask for a steal with no second row to credit.
   */
  take: string
  /** How much moves, per visit. */
  amount: number
  /**
   * Seconds before the same visitor may take from the same owner again.
   *
   * **Required, and that is a decision rather than an omission.** state.md §7.6
   * is blunt about it: every game with this mechanic has cooldowns, caps and
   * protection windows for one reason, which is that without them the strongest
   * player farms the weakest until they leave. A block with no cooldown is not a
   * simpler version of this feature, it is the version that ends the game - so
   * writing the field is how a level says it thought about it.
   */
  cooldown: number
}

/** The most anybody may take in one visit. A cap, not a design. */
export const MAX_VISIT_AMOUNT = 1_000_000

/** A week, past which a cooldown is a way of saying "never" less clearly. */
export const MAX_VISIT_COOLDOWN = 604_800

export interface XpDocument {
  format: typeof XP_FORMAT
  id: string
  name: string
  blurb?: string
  /**
   * What this level's cartridge is made of, on a shelf.
   *
   * Absent is `plastic` and stays absent, the way `rules` and `backend` do -
   * see ./finish for what the set is and why it is a set rather than a colour.
   */
  finish?: Finish
  /**
   * The shell's colour, as a hue from 0 to 359.
   *
   * Absent means the shelf picks one from the level's reference, which is a
   * real answer rather than a missing one - see ./finish.
   */
  hue?: number
  packs: PackRef[]
  /**
   * What the product may do with this XP - schedule it as a match, rank two
   * runs of it, or just let somebody wander around it.
   *
   * Checked against the world at parse time rather than taken on trust, so a
   * level claiming `football` with no goals is refused here instead of failing
   * at kickoff in front of everybody. See ./capabilities.
   */
  capabilities: XpCapabilities
  /**
   * What this XP asks of whatever it is plugged into.
   *
   * The other direction from `capabilities`, and the pair has been described
   * that way since `./capabilities` was written: capabilities point **up** —
   * what the product may do with this XP — and this points **down** — an
   * identity, a channel, somewhere to write a score. `./host` has named the
   * field `backend.needs` in its comments since it was written, and until now
   * no document could say it, so `missingCapabilities` was a refusal nothing
   * ever reached.
   *
   * **`needs` refuses and `wants` degrades**, which is the split `./host`
   * already spends a paragraph on: a level with an optional leaderboard has to
   * run on a host with no database, or an exported XP is useless. So a missing
   * `need` stops the level loading with a sentence naming what is absent, and a
   * missing `want` is the level running with less.
   *
   * **Absent asks for nothing**, and that is the common case rather than an
   * oversight — docs/xp/state.md §7.3: a room that stores nothing must cost
   * nothing. Every document written before this block existed is one of those,
   * and the parser leaves the block off rather than materialising an empty one,
   * the way `rules` and `camera` are left off.
   */
  backend?: XpBackend
  /**
   * What a visitor may take, in a world that is not theirs.
   *
   * Absent everywhere, and absent means nobody may take anything — see
   * `XpVisit` and docs/xp/server-authority.md §4.3. Left off rather than
   * materialised empty, the way `rules`, `camera` and `backend` are.
   */
  visit?: XpVisit
  /**
   * What this level keeps, declared by name.
   *
   * docs/xp/backlog.md §7c and ./data. Absent is the common case and stays
   * absent - a level that stores nothing does not grow a block by being opened
   * and saved, the same rule `rules`, `camera` and `backend` follow.
   *
   * A rule reaches it with `target: 'world'` and reads it with `of: 'world'`,
   * and the parser refuses a rule naming a field this block never declared -
   * which is the reason to declare a model at all rather than let rules invent
   * keys as they go. See `undeclared` below.
   */
  data?: XpData
  /**
   * The mode, and what ends it.
   *
   * Absent is `freestyle` - a world with no score and no end, which is what
   * every level written before this block existed *was*. Omitted rather than
   * filled in, the way `scripts` below is, because the editor writes this
   * document straight back out: a parser that materialised the default would
   * grow a `rules` block into every file anybody opened and put one in every
   * future diff.
   *
   * Read it through `rulesOf` rather than testing it. See ./rules.
   */
  rules?: XpRules
  /**
   * Where the world is watched from, and which way is left.
   *
   * Absent is `follow` - a camera behind the body, which is what every document
   * has today. Omitted rather than filled in, like `rules`, because the editor
   * writes this document straight back out.
   *
   * Read it through `cameraOf`. And read `./camera` before changing anything
   * about it: the block is an input mode that happens to also move the camera,
   * and the bug it prevents is about `W` rather than about the view.
   */
  camera?: XpCamera
  /**
   * The rounds and phases this level plays, when it describes its own.
   *
   * Absent for every document written before it and for every level that is a
   * *place* rather than a *run* - see docs/xp/xp-flow.md §5, which is emphatic
   * that a space with no flow has to stay possible. `steal-a-plant` is the one
   * that proves it: plants persist, anybody walking in sees them, and there are
   * no rounds and nothing to win.
   */
  flow?: XpFlow
  /**
   * And a round of its own for any mode that wants one.
   *
   * ---------------------------------------------------------------------------
   * A flow per mode, not a second flow
   * ---------------------------------------------------------------------------
   * The same level is a place people are in and a match that gets played in it.
   * A foyer with a kickabout in the corner has a round of its own - a whistle, a
   * kick off, a score that resets - and it is not the round the foyer runs the
   * rest of the evening. Said with one `flow`, that is a state machine with a
   * second state machine written along its edges: every transition carrying an
   * *if we are in a battle*.
   *
   * **Keyed by mode rather than a pair.** This began as one extra block called
   * `battle`, which was the case in front of us rather than the shape of the
   * problem: there are already three modes, `lobby` wants a round as much as
   * `battle` does, and a fourth would arrive with nowhere to put one. A table
   * keyed by `MODES` costs the same to read and grows on its own.
   *
   * **`flow` is what a mode with no entry here plays.** Not nothing: a level
   * with one round that happens to be scheduled as a match is the ordinary
   * case, and making it write the same phases under every mode would be a
   * format that punishes the common document for the sake of the rare one. So
   * `flow` is the fallback and this is the exception, which is also why every
   * document on disk is untouched - they all have a `flow` and no `flows`.
   *
   * `flowFor` in ./flow is the one place that chooses, and it is a projection
   * rather than a branch - the runtime and the editor go on reading a single
   * flow, the way `standingIn` lets them go on reading a single world.
   */
  flows?: Readonly<Partial<Record<Mode, XpFlow>>>
  /**
   * Whether the people in this level may say anything, in words or in faces.
   *
   * Absent is **both on**, which is the opposite default from `backend` beside
   * it and is the whole argument in ./talk: a `need` is something the level
   * cannot do without, so absent asks for nothing; this is something the level
   * would have to take *away*, so absent takes nothing away.
   *
   * Read it through `talkOf`. Omitted when it says nothing, like `rules` and
   * `camera`, so a document that has never had an opinion about chat does not
   * grow the block by being opened and saved.
   */
  talk?: XpTalk
  /**
   * What this level says, in languages other than the one it was written in.
   *
   * A map of locale code to a map of *sentence* to sentence: the key a script
   * passes `t()` is the English the level would otherwise have printed, so a
   * document with no block, or a reader with no entry, sees exactly what the
   * author typed. See ./words - the fallback being the key is the whole design
   * and is what makes this cost nothing until it is used.
   *
   * Absent is the common case and stays absent, the same rule `rules`, `camera`
   * and `talk` follow: opening and saving a level in the editor does not grow
   * it an empty block.
   */
  words?: XpWords
  /**
   * The kinds of thing this XP contains, by name.
   *
   * A record rather than a list because an entity refers to one by name, and a
   * name that does not resolve is the mistake worth catching at parse time
   * rather than at the moment somebody shoots it.
   */
  /**
   * A game the host already has, instead of a world this document describes.
   *
   * Absent for every level ever written and for every level anybody will draw
   * in the editor. Present only on a *cartridge*: a document whose whole
   * content is the name of a game the host is expected to know - see ./frame,
   * which has the argument for why such a thing is an XP at all rather than a
   * route of its own.
   *
   * When it is present the parser stops requiring a world, and materialises an
   * empty one so that every reader downstream keeps working against the shape
   * it already knows.
   */
  frame?: XpFrame
  /**
   * Code that draws its own game, instead of a world this document describes.
   *
   * The other kind of cartridge: where `frame` names a game the host already
   * ships, this *carries* one, as source, run in a container the host builds.
   * Same excusals as `frame` — no world required, an empty one materialised —
   * and see ./sketch for why the sources living in the document keeps
   * backend.md §1.2's refusal of `.js` files intact.
   */
  sketch?: XpSketch
  /**
   * Doors out of this level, by a name the level invents.
   *
   * `{ cellar: "deep-dark", roof: "https://someone.example/roof.xp.json" }`, and
   * a `load` verb names the key. The point is that a link is written **once**:
   * a level with four doors to the same place has one entry to change when it
   * moves, which is the whole reason the web has anchors and not only URLs.
   *
   * It also keeps the *verb* free of the local/remote distinction. Every door
   * reads `load cellar`; whether that is a document on this origin or somebody
   * else's is settled here, in one place, where it can be looked at.
   *
   * ---------------------------------------------------------------------------
   * Two kinds of target, and they are not equally trusted
   * ---------------------------------------------------------------------------
   * A bare id is a document on this origin - `public/xp/xps/<id>.xp.json` - and
   * opens immediately. It is ours, it went through the same parser, and asking
   * permission to walk through a door inside the level you are already in would
   * be a prompt nobody reads.
   *
   * An `https:` target is somebody else's writing. The host **asks before
   * loading one**, and that is not ceremony: `load` broadcasts to everybody in
   * the room, so an external link is one player making everybody else fetch a
   * stranger's document. The prompt is also the only place that can say *whose*
   * it is, which is the thing a person actually needs to decide.
   *
   * `http:` is refused outright rather than prompted for. There is no version of
   * "are you sure" that makes a cleartext fetch on somebody else's network into
   * a reasonable thing to offer.
   *
   * ---------------------------------------------------------------------------
   * One table, two kinds of destination - decided, not drifted into
   * ---------------------------------------------------------------------------
   * A value is a **string** (somewhere else - one of ours, or an https URL) or
   * an **object** (a place in this document, docs/xp/scenes.md §1.1). The two
   * arrived from opposite directions - this table was doors *out*, scenes.md
   * describes places *within* - and they collided on the word `scenes` with
   * nothing on disk using it yet, which made it cheap to settle and expensive
   * to leave.
   *
   * One table, because the argument this block was written for gets stronger
   * rather than weaker: a door is written once, and a verb reads `load cellar`
   * without knowing or caring which kind of thing the cellar is. An author
   * moving a room out into its own document changes one entry here and no
   * triggers.
   *
   * What that costs, said here because a union always costs something: the two
   * have different *lifecycles* - a scene switch keeps the session, the roomId
   * and the people, while a load replaces the document and may ask permission -
   * and one table makes them look identical in the file. The place that
   * difference has to be visible is the editor, which knows what it is offering,
   * rather than the syntax.
   *
   * `enter` may only name an object. Starting a game inside somebody else's
   * document is a redirect wearing a level's clothes, and this document would
   * have no content of its own.
   */
  scenes?: Readonly<Record<string, XpScene | string>>
  blueprints: Readonly<Record<string, Blueprint>>
  /**
   * Who the player is.
   *
   * The one entity a document does *not* place: the host spawns it, at a
   * `spawn` mark, one per person who joins. What the document says is what they
   * arrive as - which blueprint, and where their avatar goes if they have one.
   *
   * That split is the point. A racing XP says "you are a kart, and your avatar
   * sits in the seat"; a shooter says "you are the dummy". The *model* is not
   * the document's business at runtime, because the person choosing it is the
   * person playing - the host reads their avatar and fills the socket. In
   * development there is nobody to ask, so it falls back to the dummy.
   */
  player: PlayerRole
  entities: EntitySpec[]
  world: XpWorld
  /** Where a player arrives. Cell coordinates; the eye is above this. */
  spawn: XpSpawn
  /**
   * Which scene a player arrives in.
   *
   * Always filled in, and `main` for every document that does not say - which
   * is every document written before this field existed. docs/xp/scenes.md
   * §1.4: an `xp/1` document *is* a one-scene game, it simply never had a word
   * for the scene it was, and giving it one costs nothing because the name is
   * derived rather than stored.
   *
   * **`main` is always the root.** A document's own `world`, `spawn` and marks
   * are the scene called `main`, so `scenes.main` is refused rather than
   * allowed to redefine it. That is what keeps this additive: nothing moves out
   * of the root to make room for scenes, and a one-place level stays a file a
   * person can read top to bottom.
   *
   * Absent means `main`, and absent is what the parser leaves when nobody said
   * otherwise - like `rules` and `camera`, and for the reason those two spell
   * out: the editor writes this document straight back out, so a field
   * materialised here is a field that appears in every file somebody opens and
   * saves. Read it through `enterOf` rather than testing it.
   */
  enter?: string
  /**
   * JavaScript, by name, for the blueprints that point at it.
   *
   * The source and not a path: an XP is one file, and a level whose behaviour
   * lives in four other files is a level that arrives half missing. It is also
   * what makes a script diffable in the same review as the world it belongs to.
   *
   * Nothing here is executed by the parser. `parseXp` checks that the names
   * resolve and that the sources are not absurd; whether the code *compiles* is
   * a question for `@kxb/xp/script`, which is where the interpreter is - see
   * the note on `MAX_SCRIPT_LENGTH`.
   */
  scripts?: Readonly<Record<string, string>>
  /**
   * The animation graphs this document holds, by name.
   *
   * Beside `scripts` and shaped exactly like it, because they are the same kind
   * of thing: a named thing several blueprints can point at, whose source lives
   * once. `blueprint.animator` is `blueprint.script`'s sibling. See
   * `@kxb/xp/animation` for why a graph is its own document rather than states
   * inlined on a blueprint.
   *
   * Nothing reads it yet - docs/xp/backlog.md §2b is emphatic that the data
   * comes first and the runtime second, and this is the data.
   */
  animations?: Readonly<Record<string, AnimationGraph>>
  /**
   * The clips this level carries itself, by name.
   *
   * ---------------------------------------------------------------------------
   * The one list of clip names this package can actually check
   * ---------------------------------------------------------------------------
   * `blueprint.pose`, the `animate` verb and an `AnimationGraph`'s states all
   * name a clip, and all three are deliberately unchecked - which glTFs a host
   * has loaded is the host's business, and a document is not wrong because this
   * renderer is currently incurious. That argument is exactly right for the
   * pack's 139 clips and does not apply to these at all: a clip in the document
   * is in the *document*, so a name that is not in here and not in a pack is
   * still not refused, but a clip that *is* in here can be offered by a picker
   * with no guessing.
   *
   * See `@kxb/xp/clips` for why it is baked samples rather than the animator's
   * keys, and for the size that costs.
   */
  clips?: Readonly<Record<string, XpClip>>
  /**
   * The root's own timeline, because the root is a scene.
   *
   * §1.4 of docs/xp/scenes.md: *an `xp/1` document is a one-scene game*, and
   * every field a scene has the root has for the same reason `world`, `spawn`
   * and `entities` are up here rather than under `scenes.main`. A one-shot
   * movie is then a document with a timeline and nothing else, which is the
   * shape somebody reaches for first.
   *
   * Absent is the common case and stays absent - the rule `rules`, `camera`,
   * `backend` and `data` all follow, and for the reason that matters more here
   * than anywhere: the editor writes this document straight back out, so a
   * parser that materialised an empty timeline would put one in every file
   * anybody opened and in every future diff.
   */
  timeline?: XpTimeline
  /**
   * The shots, cut together.
   *
   * A document-level block rather than a member of a place, because a sequence
   * is *about* places: it names shots and each shot is a scene. Putting it on
   * one of them would make that scene the owner of an order the others are in,
   * which is the wrong shape the moment somebody deletes it.
   *
   * Absent for every document that is a game rather than a film, which is
   * almost all of them - the same rule `rules`, `camera`, `data` and `timeline`
   * follow, and for the reason that matters most in an editor that writes a
   * parsed document straight back out.
   */
  sequences?: Readonly<Record<string, XpSequence>>
  /**
   * One of `scripts`, run for the level itself rather than for a thing in it.
   *
   * The hub a level's own rules had nowhere to live in. A script is attached to
   * a *blueprint* today, so "when three things have happened, open the door" got
   * hung on whichever entity happened to be nearby — which is where a level's
   * logic goes to be lost, because nothing about that entity says it is the
   * place to look.
   *
   * Document-level rather than inside `world`, and that is a decision rather
   * than a convenience: a document can have several scenes and they share one
   * `scripts` table, so a hub that lived in a world would be four hubs the day
   * somebody added a room. This one runs for the document, whichever scene is
   * on screen.
   *
   * It has no `self`, which is the whole difference. `onTick` and `onSpawn` are
   * the two hooks that mean anything without one — `onTrigger` is an event that
   * happened *to something*, and a level is not a thing that can be walked into.
   */
  script?: string
}

/** What a person arrives as. */
/**
 * One key, and what pressing it means.
 *
 * ---------------------------------------------------------------------------
 * `does` is a name, not a vocabulary
 * ---------------------------------------------------------------------------
 * Every action **emits its own name**, and the level's rules decide what that
 * means. `grab`, `use`, `attack`, `shoot` and anything else an author invents
 * are the same mechanism, which is the whole reason this can exist now.
 *
 * The alternative was a closed list, and it fails the test this codebase keeps
 * applying: a knob is only real if something reads it. `grab` has a reader
 * (`carry`/`drop`) and `shoot` has one (the weapon), but `use` and `attack` do
 * not - so a closed list would ship two names that silently do nothing and one
 * "custom" escape hatch that is more capable than either. Emitting a name needs
 * no new engine vocabulary, makes the named actions and the invented ones the
 * same thing, and gives a document that binds `dance` a trigger it can hang
 * anything off.
 *
 * The editor offers the familiar names as suggestions. That is a picker being
 * helpful, not a rule.
 */
/**
 * What a level dresses its players in when it has not named a body.
 *
 * Nearly a closed list: every name here is a select over a constant in the
 * editor, so there is nothing an author can *type* that fails at runtime. The
 * one open value is a catalogue model id, and it is open because the catalogue
 * is - see `PlayerLook`.
 */
export const PLAYER_LOOKS = [
  'dummy',
  'profile',
  'random',
  'peep',
  'xp',
  'choose',
] as const

export type PlayerLookName = (typeof PLAYER_LOOKS)[number]

/**
 * A name from the list above, or a model id the level hands everybody.
 *
 * The model id is spelled the way every other body in this format is -
 * `family/Model`, one slash - which is also what tells the two apart with no
 * separate field to keep in step. A template literal rather than plain
 * `string`, so the union does not collapse and the editor's select keeps its
 * types: `"peep"` and `"adventurers/Knight"` both check, `"pep"` does not.
 */
export type PlayerLook = PlayerLookName | `${string}/${string}`

/** Whether a `wears` value is a model id rather than one of the names. */
export function isModelLook(wears: PlayerLook): boolean {
  return !(PLAYER_LOOKS as readonly string[]).includes(wears)
}

export interface PlayerKey {
  /**
   * A `KeyboardEvent.code`: `KeyE`, `Digit1`, `KeyF`.
   *
   * Always more than one character and always capitalised, which is what makes
   * `"e"` refusable: a code names a key (`KeyE`, `Digit1`, `ArrowUp`, `F1`),
   * never the letter printed on it.
   *
   * The code rather than the character, because a code is the physical key -
   * `KeyZ` is where Z sits on the board the author had, and on an AZERTY
   * keyboard the character under that finger is different. A game that moves
   * its buttons when you change language is worse than one that does not.
   */
  key: string
  /** The name it emits. */
  does: string
  /**
   * Seconds before this key may be pressed again. Absent is no wait at all.
   *
   * -------------------------------------------------------------------------
   * A wait on the *key*, not on the verb
   * -------------------------------------------------------------------------
   * Asked for as "a dash has a cooldown phase from 3 seconds", and then for the
   * same thing on any binding rather than on the one the engine happens to have
   * a shove in. So it lives here, next to the key it is about, and it is worth
   * being clear about what that choice buys: `dash` the *verb* stays free, so a
   * rule that shoves a crate down a slope every second and a script that dashes
   * a fish across a pond are unaffected. What has a wait is a person pressing a
   * button, which is the only place a cooldown means anything - it is a rule
   * about pacing a player, and pacing is what a key is.
   *
   * **Absent is the default and means nothing changed**, which is what makes
   * this safe to add to a format with levels already in the world: every
   * document written before today binds keys with no `cooldown` and plays
   * exactly as it did.
   *
   * It composes with `flow.allow` rather than replacing it, and the order is
   * worth stating because both are refusals on one press: the phase decides
   * whether a key is live at all, the role narrows that, and the wait is asked
   * last of whatever survived. A key the phase has taken away is not cooling -
   * it is not there - so a countdown drawn on it would be answering a question
   * nobody asked. See `allowedFor` and `coolingLeft`.
   */
  cooldown?: number
}

/**
 * How many a document may bind.
 *
 * Five, at the user's request, and a limit rather than a suggestion because
 * these become on-screen buttons on a phone. A dozen is a control pad nobody
 * can reach the middle of.
 */
export const MAX_PLAYER_KEYS = 5

/**
 * The longest wait a key may have on it, in seconds.
 *
 * A minute, which is far longer than any cooldown anybody would design and
 * exactly the point of a ceiling: it is here to catch the slipped decimal and
 * the author who typed milliseconds - `3000` on a dash is a key that comes back
 * in fifty minutes, and the level would look broken rather than strict.
 *
 * Zero is refused rather than treated as no wait, on the same terms as a
 * placement's `bounce`: absent already says *no cooldown*, so a written zero is
 * somebody expressing something the field cannot mean.
 */
export const MAX_KEY_COOLDOWN = 60

/**
 * How long a clip name may be, and how many body parts one rule may aim at.
 *
 * Both are bounds rather than vocabularies, deliberately. The *names* belong to
 * whichever animation pack a host has loaded and to whichever rig the body is,
 * and a closed list here would be this package claiming to know both - the same
 * mistake `blueprint.pose` avoids by naming a clip and letting the editor offer
 * the ones that exist.
 *
 * What a bound buys is a refusal for the shapes that are obviously not a name:
 * a paragraph pasted into the field, or a parts list longer than the rig has
 * bones. Sixty-four is comfortably longer than the longest clip in the pack
 * (`Ranged_Magic_Spellcasting_Long`, thirty) and thirty-two is more parts than
 * `Rig_Medium` has joints.
 */
export const MAX_CLIP_NAME = 64
export const MAX_PARTS = 32

/**
 * The longest arm a `swing` may have, in cells.
 *
 * Four is a generous two paces and a bit - a pike rather than a fist, which is
 * the far end of what anybody has asked for. The bound is here rather than left
 * open because the failure is invisible in the file: `reach: 40` is not a
 * longer swing, it is a silent hitscan weapon that needs no gun, works through
 * the whole room, and reads in the document as a punch.
 */
export const MAX_REACH = 4

/**
 * How many secret values a document may deal, and how long each may be.
 *
 * The count is the transport's own ceiling on a room: one value per player, and
 * a level cannot have more players than the room admits, so a deck longer than
 * that is a deck with entries nobody can be dealt. The length is a *label* -
 * "impostor", "detective", the ace of spades - read on somebody's own screen
 * while they play, and anything needing a sentence is a rule rather than a role.
 */
export const MAX_ROLES = 25
export const MAX_ROLE_LENGTH = 32

/**
 * The keys a document may not take, because the runtime already answers to them.
 *
 * Jump and dance are always available and are deliberately not slots: they are
 * what a body can do rather than what a level decided it can do, so every XP
 * has them and no author spends one of their five on standing still or moving
 * up. Movement is here for the same reason - a level that rebound `KeyW` to
 * `shoot` would be a level you cannot walk in.
 *
 * Dance is `G` because that is where it already is: the lounge has bound G to
 * dance since it had a dance, and its controls panel lists it. Somebody who has
 * played one world of this product and then opens an XP should not have to
 * learn a second answer to the same question.
 */
const BODY_KEYS: readonly string[] = [
  'Space',
  'KeyG',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
]

/**
 * And the keys the *chrome* already answers to.
 *
 * The second half of the list, and it was missing for as long as the first half
 * existed. `RESERVED_KEYS` held what a body does, which is a coherent rule and
 * is not the rule the runtime actually enforces: `V` switches the view, `H`
 * opens the controls, `B` calls a vote, `Z` opens the faces and `Enter` opens
 * chat, and every one of them was free for a document to bind. Binding one did
 * not *replace* the chrome - both handlers fire - so the level's action and a
 * panel opening over it would happen on the same press, which reads as the
 * level being broken rather than as a key being taken twice.
 *
 * docs/xp/backlog.md §7b noticed four of these while arguing about the emote
 * picker and said they belonged with whoever was next in this file. `Enter` is
 * the fifth and is new: chat did not have a key when that was written.
 *
 * `NumpadEnter` because it is a *different code* for the same key, and a level
 * that bound it would shadow chat for whoever has a numeric keypad and nobody
 * else - which is the worst version of this bug, because it cannot be
 * reproduced by the person who reported it.
 *
 * What this deliberately does not reserve is `Escape`. It is not a binding
 * anybody could take: the browser hands it to pointer lock before the page sees
 * it, so a document naming it would be describing a key it never receives.
 */
const CHROME_KEYS: readonly string[] = [
  'KeyZ',
  'KeyV',
  'KeyH',
  'KeyB',
  'Enter',
  'NumpadEnter',
]

export const RESERVED_KEYS: readonly string[] = [...BODY_KEYS, ...CHROME_KEYS]

/**
 * Why a key is refused, in the words that tell the author what to do about it.
 *
 * Two sentences rather than one, because the two halves are refused for
 * genuinely different reasons and the fix differs with them: a body key is
 * never coming back, and a chrome key is a panel the player can open, which is
 * a thing an author may reasonably not have known was there.
 */
export function whyReserved(code: string): string | null {
  if (BODY_KEYS.includes(code)) return 'is how a body already moves, jumps or dances'
  if (CHROME_KEYS.includes(code)) return 'is how a player already reaches the game\'s own panels'
  return null
}

export interface PlayerRole {
  /**
   * Up to five keys the level binds, beyond the ones every body has.
   *
   * Absent is none, which is every document written before this and most of
   * them after: a level about walking around needs no buttons.
   */
  /**
   * How many cells a single jump clears. Absent is the built-in 1.56.
   *
   * **Cells, not speed.** "How many blocks can I get over" is the question a
   * level is built around, and it is the one an author can check by counting
   * their own course. `jumpSpeedFor` does the conversion once, where this is
   * read.
   *
   * The warning is written into this repo's history: raising the jump made
   * `sidestep` unrunnable while every geometry check stayed green, because a
   * *longer* jump sails over a four-cell platform and into the hole behind it.
   * A jump budget can only prove a gap is crossable, never that it is still the
   * thing you land on - so a document that changes this wants its course
   * driven, not measured.
   */
  jump?: number
  /**
   * How high *every* landing throws you, in cells. Absent is a world that does
   * not give.
   *
   * The rubber world, and a floor under whatever the level is made of rather
   * than a replacement for it: standing on a four-cell pad in a one-cell world
   * gives four, because the pad is the more specific statement.
   *
   * **This is a foot-gun with a friendly name and the editor must say so.** A
   * fixed launch is perpetual, so an author who sets this can never stand still
   * again - every landing relaunches them. That may be the whole level, a moon
   * or a jelly, and it is a fine thing to want. It is not a fine thing to
   * discover from a slider, which is why the panel is asked to describe the
   * behaviour rather than offer a number and let somebody find out.
   */
  bounce?: number
  /**
   * How fast walking is, in cells a second. Absent is the built-in 7.
   *
   * The same unit `jump` argues for: an author can pace their own corridor
   * against it. The paces live here rather than on a mode or a phase because
   * they are what the *level* feels like underfoot, which is one fact however
   * many rounds are played on it.
   */
  speed?: number
  /**
   * And how fast sprinting is. Absent is the built-in 13.
   *
   * Its own number rather than a multiplier on `speed`, because the two answer
   * different questions - a slow, deliberate level may still want a real
   * sprint, and a kart may want no gap at all. A sprint below the walk is
   * accepted for that last reason: equal paces are how a level says Shift does
   * nothing here.
   */
  sprint?: number
  /**
   * How hard the world pulls down, in cells a second squared. Absent is the
   * built-in 26.
   *
   * `jump` and `bounce` stay in cells whatever this says - the conversion runs
   * through this number, so a moon level's two-cell jump still clears two
   * cells. What changes is the *arc*: lower is floatier, higher is snappier,
   * and the course should be driven after either, for `jump`'s own reason.
   */
  gravity?: number
  /**
   * How quickly a body reaches its pace, in cells a second squared.
   *
   * Absent is instantly, which is every level written before this and the
   * right feel for most of them. Set it and movement ramps: ice is this plus
   * `drag`, a heavy truck is this alone. The useful range starts around twice
   * the pace - below that a walk takes whole seconds to arrive and reads as
   * lag rather than weight.
   */
  acceleration?: number
  /**
   * How quickly a body stops when the stick is let go, in cells a second
   * squared. Absent is instantly, the partner of `acceleration` above.
   *
   * Separate from it because sliding is a property of the *floor*, not of the
   * engine: ice wants a small drag and a large acceleration is still wrong on
   * it, and the two being one number was the first draft of this and made
   * every slippery level feel underpowered instead.
   */
  drag?: number
  keys?: readonly PlayerKey[]
  /**
   * A blueprint - the body. A dummy, a kart, a bird.
   *
   * Absent means the built-in one: the prototype dummy at play scale. That is
   * the development default and it is deliberately not something a document has
   * to declare, because most of them do not care - a level about a room wants a
   * person in it, not a paragraph about what a person is. A racing XP says
   * `{ "blueprint": "kart", "avatarSocket": "seat" }` and gets a kart.
   */
  blueprint?: string
  /**
   * What everybody looks like when the level has not named a body.
   *
   * The creator's choice, made in the editor, and it is only ever asked when
   * `blueprint` is absent - a document that names its own body has *decided*
   * what its players are, and a personal preference overriding that would be
   * the profile editing somebody's level.
   *
   * Everybody who plays has **two** bodies at once and neither is spent by the
   * other: a peep (their animal) and an XP body (the skin they take into the
   * games). Three of the values below are a level saying which of the two it
   * wants; the rest predate the split and are kept working exactly as they were.
   *
   *   `peep`    their animal, whatever else they own. A level about a room full
   *             of animals stays one when somebody buys a Knight.
   *   `xp`      their XP body. The dummy for anybody who has not got one, which
   *             is what a player already is before they are anybody.
   *   `choose`  neither - whichever of the two they picked for themselves. The
   *             right answer for most levels, and the one that makes the
   *             wardrobe mean something.
   *
   *   `dummy`   the prototype dummy. The default, and every document written
   *             before this existed: a level about a room wants a person in
   *             it, not a paragraph about what a person is.
   *   `profile` whichever animal each player chose for themselves - the same
   *             one the lounge draws them as. Somebody with none gets a random
   *             one rather than a mannequin, because the point of choosing this
   *             is that the room is full of animals.
   *   `random`  an animal per player whatever their profile says, picked from
   *             their own id so it is the same one on every screen and the same
   *             one tomorrow.
   *
   * Anything else is a catalogue model id - `adventurers/Knight` - and means
   * the level *hands* everybody the same body. Not the same thing as naming a
   * `blueprint`: that decides triggers, props and tags as well, and this only
   * swaps the face. A level with a story to tell can cast it.
   *
   * Absent is `dummy`, and it is stored as absent rather than written out for
   * `draw`'s reason: a document that says the default and one that stays quiet
   * have to round-trip identically.
   */
  wears?: PlayerLook
  /**
   * Where their chosen avatar hangs on that body, if it should.
   *
   * Absent means the blueprint *is* the whole player - a dummy needs no
   * passenger. Present means the body carries somebody: a kart with a seat.
   */
  avatarSocket?: string
  /**
   * Which side of the body the level opens on. Absent lets the host decide.
   *
   * The host's own default is third person, except when `weapon` is set - a
   * held gun with nothing to aim it at is a level that looks broken before
   * anybody has done anything, so an armed player opens in first person
   * instead. That guess is wrong for a melee game: a bat is not aimed, and
   * first person hides the one thing worth seeing, which is the swing landing.
   * This is the document overruling the guess, not a third camera mode - `V`
   * still swaps between the two at any time, in any document, with or without
   * this field.
   */
  view?: 'first' | 'third'
  /**
   * What they arrive holding.
   *
   * A blueprint hung off one of the body's sockets, which is the same mechanism
   * a rider gets and deliberately not a new one: a gun in a hand and a driver in
   * a seat are the same relationship, and giving weapons their own kind of
   * attachment would be a second composition system that has to be kept in step
   * with the first.
   *
   * It is on the *player* rather than in `entities` because the player is the
   * one entity a document does not place - so there is nothing in the entity
   * list to parent a gun to. The host spawns the body and this comes with it.
   *
   * What makes it a weapon rather than a decoration is its properties, not this
   * field: `damage` and `range` are read when a shot is fired (docs/xp/manual.md
   * §5.5). A blueprint with neither is something you are carrying.
   */
  weapon?: {
    blueprint: string
    socket?: string
    /**
     * Where it sits in the hand, and how it is turned there.
     *
     * ---------------------------------------------------------------------------
     * Why this had to exist
     * ---------------------------------------------------------------------------
     * A held thing is parented to the hand bone, and until this block the
     * *model's own origin* decided everything. That works for a gun authored
     * around its grip and produces nonsense for one authored around its centre -
     * reported, correctly, as "the weapon is holding wrong", with a pistol
     * through the body's chest. Nothing in the document could correct it, and
     * re-exporting somebody else's art to move its origin is not a fix anybody
     * should have to reach for.
     *
     * All seven default to nothing, so a document that never says any of it is
     * exactly the document it was before this existed.
     *
     * ---------------------------------------------------------------------------
     * Three angles, and why not `rotation`
     * ---------------------------------------------------------------------------
     * Everywhere else in this format `rotation` is one number, degrees about Y,
     * because a crate on a floor turns one way. A gun in a hand does not: it
     * pitches to point, rolls to sit in the palm, and yaws to line up with the
     * arm. Reusing `rotation` for a triple would make one word mean two shapes,
     * so these are named for the axes they are - and the names are the ones
     * anybody who has held a controller already knows.
     *
     * This block is the precedent `Placement.pitch` and `Placement.roll` follow.
     * The one difference is that a placement keeps `rotation` for its yaw rather
     * than gaining a third name for it, because every document on disk already
     * says `rotation` and renaming it would be a format change for the sake of
     * symmetry. A weapon had no such history when this was written.
     */
    x?: number
    y?: number
    z?: number
    /** Degrees, applied in this order: yaw, then pitch, then roll. */
    pitch?: number
    yaw?: number
    roll?: number
    /** Multiplied onto the model's own size. Absent is 1. */
    scale?: number
  }
}

/** A problem with a document, addressed so somebody can find it in the file. */
export interface XpProblem {
  /** Dotted path, e.g. `world.placements[12].model`. */
  at: string
  message: string
}

export type XpParse =
  | { ok: true; document: XpDocument }
  | { ok: false; problems: XpProblem[] }

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * The two extra angles and the three multipliers, for whatever carries them.
 *
 * One reader for a placement and an entity, because they are the same four
 * fields meaning the same thing and two copies is two things to forget.
 *
 * **A zero angle and a multiplier of one come back as absence.** Absent already
 * means level and already means unstretched, so keeping the explicit spelling
 * would make a document that says `"pitch": 0` round-trip differently from the
 * identical one that stays quiet - which is the trap `enter` fell into and the
 * one `bounce` was written to avoid. A whole `stretch` of ones disappears with
 * its axes, so a crate that was stretched and put back is the crate it was.
 *
 * Angles are otherwise left exactly as written, including 400 and -15. The
 * editor wraps them into 0..360 on the way in; the parser is not the place to
 * start rewriting numbers a person typed, and `rotation` has never done it.
 */
function readShape(
  raw: Record<string, unknown>,
  at: string,
  problems: XpProblem[],
): { pitch?: number; roll?: number; stretch?: Stretch } {
  const shape: { pitch?: number; roll?: number; stretch?: Stretch } = {}

  for (const angle of ['pitch', 'roll'] as const) {
    const value = raw[angle]
    if (value === undefined) continue
    if (!isFiniteNumber(value)) {
      problems.push({ at: `${at}.${angle}`, message: 'not a number' })
      continue
    }
    if (value !== 0) shape[angle] = value
  }

  const stretch = raw.stretch
  if (stretch !== undefined) {
    if (!isObject(stretch)) {
      problems.push({ at: `${at}.stretch`, message: 'not an object' })
    } else {
      const kept: Stretch = {}
      for (const axis of ['x', 'y', 'z'] as const) {
        const value = stretch[axis]
        if (value === undefined) continue
        // The same rule `scale` follows, for the same reason: a zero is a thing
        // with no size that still stops you at its corner, and a negative one
        // is a model turned inside out.
        if (!isFiniteNumber(value) || value <= 0) {
          problems.push({ at: `${at}.stretch.${axis}`, message: 'must be a positive number' })
          continue
        }
        if (value !== 1) kept[axis] = value
      }
      if (Object.keys(kept).length > 0) shape.stretch = kept
    }
  }

  return shape
}

/**
 * Read one placement, or say what is wrong with it.
 *
 * `rotation` and `scale` default rather than fail: a hand-written document
 * should be able to say `{ "model": "proto/Floor", "x": 0, "y": 0, "z": 0 }`
 * and mean the obvious thing. Position does not default, because a placement
 * with no coordinates is a mistake and putting it at the origin would bury it
 * under whatever is already there.
 */
function readPlacement(raw: unknown, at: string, problems: XpProblem[]): Placement | null {
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return null
  }

  const before = problems.length

  const model = raw.model
  if (typeof model !== 'string') {
    problems.push({ at: `${at}.model`, message: 'missing' })
  } else if (!isKnownModel(model)) {
    problems.push({ at: `${at}.model`, message: `not a model we ship: ${model}` })
  }

  for (const axis of ['x', 'y', 'z'] as const) {
    const value = raw[axis]
    if (!isFiniteNumber(value)) {
      problems.push({ at: `${at}.${axis}`, message: 'missing or not a number' })
      continue
    }
    /**
     * Fractional, since `xp/1.1`.
     *
     * This used to insist on whole cells and the reasoning was sound for what
     * the editor then was: a brush that lays four-metre pieces on a lattice,
     * where a wall really is four cells wide and nothing is ever half a wall.
     *
     * What it could not express is a level built by *placing* things rather
     * than painting them - a crate against a wall rather than a third of a
     * metre off it, a ramp meeting a floor, anything at an angle. And the
     * constraint was never load-bearing: `placementCells` already rounds
     * arbitrary floats (a model's own bounds are fractional, so it always had
     * to), and the mask lookup walks world cells back into the model's frame
     * for any origin at all. So the grid was an authoring rule wearing a
     * collision rule's clothes.
     *
     * What it costs is stated in docs/xp/manual.md §4 and has not changed: the
     * rasteriser rounds, so a wall at 2.5 fills the cells it mostly covers, and
     * a level built off the lattice has collision that is a cell-sized
     * approximation of what is drawn rather than exactly it.
     */
    const limit = axis === 'y' ? WORLD_HEIGHT : WORLD_RADIUS
    const low = axis === 'y' ? 0 : -WORLD_RADIUS
    if (value < low || value >= limit) {
      problems.push({ at: `${at}.${axis}`, message: `outside the world (${low}..${limit - 1})` })
    }
  }

  const rotation = raw.rotation === undefined ? 0 : raw.rotation
  if (!isFiniteNumber(rotation)) {
    problems.push({ at: `${at}.rotation`, message: 'not a number' })
  }

  const scale = raw.scale === undefined ? 1 : raw.scale
  if (!isFiniteNumber(scale) || scale <= 0) {
    problems.push({ at: `${at}.scale`, message: 'must be a positive number' })
  }

  /**
   * Bounded the same way `player.jump` is, and for the same reason.
   *
   * Zero is refused rather than accepted as "not bouncy", because absent
   * already means that and two spellings of one state is how a round trip grows
   * a field nobody wrote. Negative is a pad that sucks you into the floor. The
   * ceiling is generous - twenty cells is a launcher across a level, and a real
   * thing to build - and catches the slipped decimal.
   */
  const bounce = raw.bounce
  if (bounce !== undefined) {
    if (!isFiniteNumber(bounce) || (bounce as number) <= 0) {
      problems.push({ at: `${at}.bounce`, message: 'must be a positive number of cells' })
    } else if ((bounce as number) > 20) {
      problems.push({ at: `${at}.bounce`, message: 'at most 20 cells' })
    }
  }

  const shape = readShape(raw, at, problems)
  const collider = readPlacementCollider(raw.collider, `${at}.collider`, problems)

  if (problems.length !== before) return null

  return {
    model: model as string,
    x: raw.x as number,
    y: raw.y as number,
    z: raw.z as number,
    rotation: rotation as number,
    // Spread rather than assigned, for the reason `bounce` is: every one of
    // these is absent on almost every placement ever written, and a field that
    // appears on save is a format change everybody notices.
    ...shape,
    scale: scale as number,
    // Omitted when absent, so every document written before springs existed
    // round-trips through the editor unchanged.
    ...(bounce === undefined ? {} : { bounce: bounce as number }),
    ...(collider === undefined ? {} : { collider }),
  }
}

/**
 * Read a placement's collider override, or say what is wrong with it.
 *
 * Absence is not a default that gets written back - it stays absent, because
 * "the measured shape" is what the field not being there already says and
 * spelling it out would make every document that has ever been saved grow a
 * key. The same rule the angles and `bounce` follow.
 *
 * The sizes must be positive for the reason `stretch`'s must: a box with a zero
 * side is a thing with no volume that still rounds to a cell and stops you at
 * it, which is a wall you cannot see and cannot explain. The offsets may be
 * anything finite, including negative - a model's own bounds usually start
 * negative, and a collider is a piece of them.
 */
function readPlacementCollider(
  raw: unknown,
  at: string,
  problems: XpProblem[],
): PlacementCollider | undefined {
  if (raw === undefined) return undefined
  if (raw === 'none') return 'none'

  if (!Array.isArray(raw)) {
    problems.push({ at, message: 'must be "none" or a list of boxes' })
    return undefined
  }
  // Refused rather than read as `none`, so one state has one spelling. See
  // `PlacementCollider` in ./blueprints.
  if (raw.length === 0) {
    problems.push({ at, message: 'no boxes - write "none" to walk through it' })
    return undefined
  }
  if (raw.length > MAX_COLLIDER_BOXES) {
    problems.push({ at, message: `${raw.length} boxes, over the ${MAX_COLLIDER_BOXES} limit` })
    return undefined
  }

  const boxes: PlacementBox[] = []
  raw.forEach((entry, i) => {
    if (!isObject(entry)) {
      problems.push({ at: `${at}[${i}]`, message: 'not an object' })
      return
    }
    const sides = ['w', 'h', 'd'] as const
    if (!sides.every((k) => isFiniteNumber(entry[k]) && (entry[k] as number) > 0)) {
      problems.push({ at: `${at}[${i}]`, message: 'needs positive w, h and d' })
      return
    }
    const box: PlacementBox = {
      w: entry.w as number,
      h: entry.h as number,
      d: entry.d as number,
    }
    for (const axis of ['x', 'y', 'z'] as const) {
      const value = entry[axis]
      if (value === undefined) continue
      if (!isFiniteNumber(value)) {
        problems.push({ at: `${at}[${i}].${axis}`, message: 'not a number' })
        continue
      }
      // Zero is the default, and dropped for the reason a `pitch` of zero is.
      if (value !== 0) box[axis] = value
    }
    boxes.push(box)
  })

  // Handed back whole or short, and a short one is always accompanied by a
  // problem - `readPlacement` refuses the placement either way, so there is no
  // path where a half-read collider reaches the grid.
  return boxes
}

/**
 * Read the camera block, or fall back to the one a document without one has.
 *
 * Same shape as `readRules`: a default on every failure as well as on absence,
 * because `parseXp` refuses a document with any problem in it, so the value
 * returned beside a problem is never seen.
 */
function readCamera(raw: unknown, problems: XpProblem[]): XpCamera {
  if (raw === undefined) return DEFAULT_CAMERA
  if (!isObject(raw)) {
    problems.push({ at: 'camera', message: 'not an object' })
    return DEFAULT_CAMERA
  }

  if (typeof raw.kind !== 'string' || !isCameraKind(raw.kind)) {
    problems.push({ at: 'camera.kind', message: `must be one of ${CAMERA_KINDS.join(', ')}` })
    return DEFAULT_CAMERA
  }

  const camera: XpCamera = { kind: raw.kind }

  if (raw.axis !== undefined) {
    if (typeof raw.axis === 'string' && (CAMERA_AXES as readonly string[]).includes(raw.axis)) {
      camera.axis = raw.axis as CameraAxis
    } else {
      problems.push({ at: 'camera.axis', message: `must be one of ${CAMERA_AXES.join(', ')}` })
    }
  }
  /*
   * Every numeric field in one list rather than three, which is the shape
   * `readRules` was rewritten into after `respawn` was silently dropped for a
   * day: a field written into the type, validated, offered by the editor, and
   * thrown away here without a word. `cameraProblems` below then refuses any
   * that do not belong to the kind, so this list does not have to know which is
   * which - one place decides that, and it is the table in ./camera.
   */
  for (const field of [
    'distance',
    'span',
    'x',
    'y',
    'z',
    'yaw',
    'pitch',
    'behind',
    'above',
    'beside',
    'fov',
    'far',
  ] as const) {
    const value = raw[field]
    if (value === undefined) continue
    if (isFiniteNumber(value)) camera[field] = value
    else problems.push({ at: `camera.${field}`, message: 'not a number' })
  }

  /**
   * Where it looks, when a document names a spot rather than an angle.
   *
   * All three or the point is refused, exactly as a seat is - `at.y` is what the
   * camera is level with, so a missing one is a shot half composed rather than a
   * shot at height zero.
   */
  if (raw.at !== undefined) {
    const spot = raw.at
    if (!isObject(spot)) {
      problems.push({ at: 'camera.at', message: 'not an object' })
    } else {
      const missing = (['x', 'y', 'z'] as const).filter((axis) => !isFiniteNumber(spot[axis]))
      if (missing.length > 0) {
        problems.push({
          at: 'camera.at',
          message: `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not a number`,
        })
      } else {
        camera.at = { x: spot.x as number, y: spot.y as number, z: spot.z as number }
      }
    }
  }

  /**
   * The seats, which are the one field in this block that is not a number.
   *
   * Read here rather than folded into the loop above for the obvious reason and
   * one less obvious one: a seat is three numbers under a name the *document*
   * invents, so there is no field list it could be on, and every one of those
   * three has to be present. A chair missing its height is not a chair at a
   * default height, it is a chair somebody meant to finish.
   */
  if (raw.seats !== undefined) {
    if (!isObject(raw.seats)) {
      problems.push({ at: 'camera.seats', message: 'not an object' })
    } else {
      const seats: Record<string, { x: number; y: number; z: number }> = {}
      for (const [team, spot] of Object.entries(raw.seats)) {
        if (!isObject(spot)) {
          problems.push({ at: `camera.seats.${team}`, message: 'not an object' })
          continue
        }
        const missing = (['x', 'y', 'z'] as const).filter((axis) => !isFiniteNumber(spot[axis]))
        if (missing.length > 0) {
          problems.push({
            at: `camera.seats.${team}`,
            message: `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not a number`,
          })
          continue
        }
        seats[team] = { x: spot.x as number, y: spot.y as number, z: spot.z as number }
      }
      camera.seats = seats
    }
  }

  const before = problems.length
  for (const reason of cameraProblems(camera)) problems.push({ at: 'camera', message: reason })
  if (problems.length !== before) return DEFAULT_CAMERA

  return camera
}

/**
 * Read the talk block, or the empty one a document without it has.
 *
 * Returns `{}` rather than `DEFAULT_TALK` on absence, and the difference
 * matters here in a way it does not for the camera: this block's default is
 * *filled in by the reader* (`talkOf`), not by the parser, so that a document
 * which said nothing keeps saying nothing all the way back out to the file.
 * Materialising `{ chat: true, emotes: true }` here would put the block in
 * every document the editor ever saved.
 *
 * Both fields are refused rather than coerced. `"chat": "no"` is a string an
 * author expected to mean something, and truthiness would read it as *yes* -
 * which is the one failure mode this block cannot have, because the person who
 * writes it is the person who wanted quiet.
 */
function readTalk(raw: unknown, problems: XpProblem[]): XpTalk {
  if (raw === undefined) return {}
  if (!isObject(raw)) {
    problems.push({ at: 'talk', message: 'not an object' })
    return {}
  }

  const talk: XpTalk = {}
  for (const field of ['chat', 'emotes'] as const) {
    const value = raw[field]
    if (value === undefined) continue
    if (typeof value === 'boolean') talk[field] = value
    else problems.push({ at: `talk.${field}`, message: 'must be true or false' })
  }

  return talk
}

/**
 * Read the words block.
 *
 * Refused rather than repaired, every field of it. A translation is a promise
 * to somebody who cannot check it - the author reads English and the reader
 * reads German - so a phrase silently dropped here is a sentence that shows up
 * in the wrong language in front of the one person who cannot tell it was
 * meant to be different. A refusal names the locale and the key.
 *
 * The empty case returns `{}` rather than undefined so `isEmptyWords` decides
 * whether the block is written back, exactly as `readTalk` leaves that to
 * `isDefaultTalk`.
 */
function readWords(raw: unknown, problems: XpProblem[]): XpWords {
  if (raw === undefined) return {}
  if (!isObject(raw)) {
    problems.push({ at: 'words', message: 'not an object' })
    return {}
  }

  const codes = Object.keys(raw)
  if (codes.length > MAX_LOCALES) {
    problems.push({ at: 'words', message: `${codes.length} languages, over the ${MAX_LOCALES} limit` })
    return {}
  }

  const words: Record<string, XpPhrases> = {}
  for (const code of codes) {
    if (!isLocaleCode(code)) {
      problems.push({ at: `words.${code}`, message: 'not a language code, like "de" or "pt-BR"' })
      continue
    }

    const table = raw[code]
    if (!isObject(table)) {
      problems.push({ at: `words.${code}`, message: 'not an object' })
      continue
    }

    const keys = Object.keys(table)
    if (keys.length > MAX_PHRASES) {
      problems.push({
        at: `words.${code}`,
        message: `${keys.length} phrases, over the ${MAX_PHRASES} limit`,
      })
      continue
    }

    const phrases: Record<string, string> = {}
    for (const key of keys) {
      if (key.length === 0 || key.length > MAX_PHRASE_KEY) {
        problems.push({
          at: `words.${code}`,
          message: `a phrase to translate must be 1 to ${MAX_PHRASE_KEY} characters`,
        })
        continue
      }
      const text = table[key]
      if (typeof text !== 'string') {
        problems.push({ at: `words.${code}["${key}"]`, message: 'not a string' })
        continue
      }
      if (text.length > MAX_PHRASE_TEXT) {
        problems.push({
          at: `words.${code}["${key}"]`,
          message: `over the ${MAX_PHRASE_TEXT} character limit`,
        })
        continue
      }
      /*
       * An empty translation is refused rather than read as "no translation".
       * The two are different intentions and only one of them is ever meant:
       * a row left blank in the editor is a row the editor does not save, and
       * a blank that reached the file would draw nothing where a sentence was.
       */
      if (text.length === 0) {
        problems.push({ at: `words.${code}["${key}"]`, message: 'empty - remove it instead' })
        continue
      }
      phrases[key] = text
    }
    words[code] = phrases
  }

  return words
}

/**
 * Read the rules block, or fall back to the mode a document without one is.
 *
 * Returns `DEFAULT_RULES` on every failure as well as on absence, and the
 * duplication is deliberate: `parseXp` refuses a document with any problem in
 * it, so the value returned alongside a problem is never seen by anybody. What
 * it buys is that this function has no null case for the caller to forget, and
 * `xp.rules` is a field the runtime can read without asking whether it is there.
 *
 * An unknown preset is refused rather than ignored. A document naming a mode
 * this build has never heard of loads, looks finished, and quietly has no rules
 * at all - which is the same silence as an unfinished level, and the one thing
 * ./capabilities is written to prevent.
 */
function readRules(raw: unknown, problems: XpProblem[]): XpRules {
  if (raw === undefined) return DEFAULT_RULES
  if (!isObject(raw)) {
    problems.push({ at: 'rules', message: 'not an object' })
    return DEFAULT_RULES
  }

  if (typeof raw.preset !== 'string' || !isPreset(raw.preset)) {
    problems.push({ at: 'rules.preset', message: `must be one of ${PRESETS.join(', ')}` })
    return DEFAULT_RULES
  }

  const rules: XpRules = { preset: raw.preset }

  /*
   * Absent is `space`, and left absent rather than filled in: every document on
   * disk predates this field and none of them is a round, so materialising the
   * default would put a `mode` into every level anybody opened in the editor.
   * See `MODES` in ./rules for what the second axis is for.
   */
  if (raw.mode !== undefined) {
    if (typeof raw.mode === 'string' && isMode(raw.mode)) rules.mode = raw.mode
    else problems.push({ at: 'rules.mode', message: `must be one of ${MODES.join(', ')}` })
  }

  /*
   * Absent is read off the world rather than filled in here, which is why this
   * writes nothing when the field is missing - see `sidesOf`. Materialising the
   * derived answer would put a `sides` into every document anybody opened in the
   * editor, and put it there *wrong* for the level that later gains a second
   * team spawn.
   */
  if (raw.sides !== undefined) {
    if (typeof raw.sides === 'string' && isSides(raw.sides)) rules.sides = raw.sides
    else problems.push({ at: 'rules.sides', message: `must be one of ${SIDES.join(', ')}` })
  }

  // Absent is `spread`, so a document that never thought about sides still
  // splits a room rather than leaving everybody on none. See ./rules.
  if (raw.assign !== undefined) {
    if (typeof raw.assign === 'string' && isAssign(raw.assign)) rules.assign = raw.assign
    else problems.push({ at: 'rules.assign', message: `must be one of ${ASSIGNS.join(', ')}` })
  }

  // Both optional, and absent is a meaning rather than a default - see ./rules.
  /**
   * The numeric knobs, as a list rather than three copies of four lines.
   *
   * It was three copies, and `respawn` was silently dropped for exactly as long
   * as that lasted - written into the type, validated by `rulesProblems`,
   * accepted by the editor, and thrown away here without a word. Which is the
   * worst kind of bug this parser can have: an author sets a field, everything
   * says yes, and the level behaves as though they had not.
   */
  for (const field of ['scoreLimit', 'timeLimit', 'respawn'] as const) {
    const value = raw[field]
    if (value === undefined) continue
    if (isFiniteNumber(value)) rules[field] = value
    else problems.push({ at: `rules.${field}`, message: 'not a number' })
  }

  const players = readPlayers(raw.players, problems)
  if (players) rules.players = players

  const roles = readRoles(raw.roles, problems)
  if (roles) rules.roles = roles

  /**
   * Which dealt value is the one whose shots count.
   *
   * Only its *shape* is checked here. Whether it is actually in the deck is
   * `rulesProblems`' question, because that is a rule about two fields agreeing
   * rather than about one field being well formed - and `parseXp` runs that
   * check over the block it just read, so an author still hears about it from
   * the same load.
   */
  if (raw.lethal !== undefined) {
    if (typeof raw.lethal === 'string' && raw.lethal.length > 0) rules.lethal = raw.lethal
    else problems.push({ at: 'rules.lethal', message: 'not a name' })
  }

  const perRole = readPerRole(raw.perRole, problems)
  if (perRole) rules.perRole = perRole

  return rules
}

/**
 * What each dealt value means: what it may do, and how it may be looked at.
 *
 * Shape only, like `lethal` above - whether a key is actually in the deck is
 * `rulesProblems`' question, because it is a rule about two fields agreeing.
 *
 * **An unknown `seen` is refused rather than dropped**, which is the whole
 * reason this is not four lines of `typeof`. `"seen": "hidden"` is somebody
 * meaning `nobody`, and a parser that ignored it would hand back a document
 * where that player is drawn to the whole room - the exact opposite of what was
 * written, from a level that said it loaded fine.
 *
 * An **empty `allow` is kept**, for the reason a phase's is: it is the only way
 * to say *watch, do not touch*, and treating it as absent would turn the one
 * role that is meant to be helpless into the one role with every button live.
 */
function readPerRole(
  raw: unknown,
  problems: XpProblem[],
): Record<string, RoleRule> | null {
  if (raw === undefined) return null
  if (!isObject(raw)) {
    problems.push({ at: 'rules.perRole', message: 'not an object' })
    return null
  }

  const names = Object.keys(raw)
  if (names.length === 0) {
    problems.push({ at: 'rules.perRole', message: 'empty — leave it out to say nothing' })
    return null
  }
  // The deck's own ceiling, because there is nothing to say about a role that is
  // not in it and a deck cannot be longer than this.
  if (names.length > MAX_ROLES) {
    problems.push({ at: 'rules.perRole', message: `more than ${MAX_ROLES}` })
    return null
  }

  const perRole: Record<string, RoleRule> = {}
  let held = 0

  for (const name of names) {
    const at = `rules.perRole.${name}`
    const entry = raw[name]
    if (!isObject(entry)) {
      problems.push({ at, message: 'not an object' })
      continue
    }

    const rule: RoleRule = {}

    if (entry.allow !== undefined) {
      if (
        !Array.isArray(entry.allow) ||
        entry.allow.some((one) => typeof one !== 'string' || one.length === 0)
      ) {
        problems.push({ at: `${at}.allow`, message: 'not a list of key names' })
        continue
      }
      rule.allow = entry.allow as string[]
    }

    if (entry.seen !== undefined) {
      if (typeof entry.seen !== 'string' || !isRoleView(entry.seen)) {
        problems.push({ at: `${at}.seen`, message: `must be one of ${ROLE_VIEWS.join(', ')}` })
        continue
      }
      rule.seen = entry.seen
    }

    /*
     * `{}` is refused, and it is not pedantry: an entry that says neither thing
     * is an author who opened a block for a role and did not finish it, and the
     * level plays exactly as if the role had no entry. Saying so is the only
     * chance they get to notice.
     */
    if (rule.allow === undefined && rule.seen === undefined) {
      problems.push({ at, message: 'says nothing — give it "allow", "seen", or neither entry' })
      continue
    }

    perRole[name] = rule
    held += 1
  }

  return held === names.length ? perRole : null
}

/**
 * What each player is secretly dealt.
 *
 * Strings, and short ones: they are read by a person on their own screen, and
 * anything long enough to need a paragraph is a rule rather than a role. Every
 * problem is reported with its index, because "roles: bad" in a list of eight
 * is an author counting on their fingers.
 *
 * **Duplicates are the point**, not a mistake to refuse: three of four players
 * being `crew` *is* three entries. The one thing refused is an empty list,
 * which is a document that meant to say something and said nothing - absent is
 * how a level says it deals nothing.
 */
function readRoles(raw: unknown, problems: XpProblem[]): string[] | null {
  if (raw === undefined) return null
  if (!Array.isArray(raw)) {
    problems.push({ at: 'rules.roles', message: 'not a list' })
    return null
  }
  if (raw.length === 0) {
    problems.push({ at: 'rules.roles', message: 'empty — leave it out to deal nothing' })
    return null
  }
  if (raw.length > MAX_ROLES) {
    problems.push({ at: 'rules.roles', message: `more than ${MAX_ROLES}` })
    return null
  }

  const roles: string[] = []
  for (const [at, value] of raw.entries()) {
    if (typeof value !== 'string' || value.length === 0) {
      problems.push({ at: `rules.roles[${at}]`, message: 'not a name' })
      continue
    }
    if (value.length > MAX_ROLE_LENGTH) {
      problems.push({ at: `rules.roles[${at}]`, message: `longer than ${MAX_ROLE_LENGTH}` })
      continue
    }
    roles.push(value)
  }
  return roles.length === raw.length ? roles : null
}

/**
 * How many people the level is for.
 *
 * Whole numbers, at least one, and no wider than the transport carries - each
 * refused rather than clamped, because every one of them is an author saying
 * something specific that this build cannot honour, and a silently corrected
 * `max: 40` is a level that admits fifteen and never says why.
 *
 * A crossed pair is its own problem with its own message. `min` above `max` is
 * a level that can never be started, and "must be at least 1" would not be the
 * thing to fix.
 */
function readPlayers(
  raw: unknown,
  problems: XpProblem[],
): { min?: number; max?: number } | null {
  if (raw === undefined) return null
  if (!isObject(raw)) {
    problems.push({ at: 'rules.players', message: 'not an object' })
    return null
  }

  const out: { min?: number; max?: number } = {}

  for (const field of ['min', 'max'] as const) {
    const value = raw[field]
    if (value === undefined) continue

    if (!isFiniteNumber(value) || !Number.isInteger(value)) {
      problems.push({ at: `rules.players.${field}`, message: 'not a whole number' })
      continue
    }
    if (value < 1) {
      problems.push({ at: `rules.players.${field}`, message: 'must be at least 1' })
      continue
    }
    if (value > MAX_DECLARED_PLAYERS) {
      problems.push({
        at: `rules.players.${field}`,
        message: `must be ${MAX_DECLARED_PLAYERS} or fewer`,
      })
      continue
    }

    out[field] = value
  }

  if (out.min !== undefined && out.max !== undefined && out.min > out.max) {
    problems.push({
      at: 'rules.players',
      message: 'min is more than max, so nobody could ever start it',
    })
    return null
  }

  return Object.keys(out).length > 0 ? out : null
}

/**
 * Read a mark, or say what is wrong with it.
 *
 * `facing` defaults and the size defaults, for the same reason a placement's
 * rotation does: a spawn is three numbers and a kind, and making an author
 * write a width for one would be asking a question with no answer.
 */
function readMark(raw: unknown, at: string, problems: XpProblem[]): Mark | null {
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return null
  }

  const before = problems.length

  const kind = raw.kind
  if (typeof kind !== 'string' || !MARK_KINDS.includes(kind as MarkKind)) {
    problems.push({
      at: `${at}.kind`,
      message: `must be one of ${MARK_KINDS.join(', ')}`,
    })
  }

  for (const axis of ['x', 'y', 'z'] as const) {
    if (!isFiniteNumber(raw[axis])) {
      problems.push({ at: `${at}.${axis}`, message: 'missing or not a number' })
    }
  }

  const facing = raw.facing === undefined ? 0 : raw.facing
  if (!isFiniteNumber(facing)) problems.push({ at: `${at}.facing`, message: 'not a number' })

  // A frame you cannot walk through is a wall, and one the size of the world is
  // a goal nobody can miss. Both are worth refusing.
  const width = raw.width === undefined ? DEFAULT_MARK_WIDTH : raw.width
  const height = raw.height === undefined ? DEFAULT_MARK_HEIGHT : raw.height
  for (const [name, value] of [['width', width], ['height', height]] as const) {
    if (!isFiniteNumber(value) || value < 1 || value > MAX_MARK_SIZE) {
      problems.push({ at: `${at}.${name}`, message: `must be between 1 and ${MAX_MARK_SIZE}` })
    }
  }

  if (raw.team !== undefined && typeof raw.team !== 'string') {
    problems.push({ at: `${at}.team`, message: 'not a string' })
  }

  if (raw.name !== undefined && (typeof raw.name !== 'string' || raw.name.length === 0)) {
    problems.push({ at: `${at}.name`, message: 'not a name' })
  }

  if (problems.length !== before) return null

  return {
    kind: kind as MarkKind,
    ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
    x: raw.x as number,
    y: raw.y as number,
    z: raw.z as number,
    facing: facing as number,
    width: width as number,
    height: height as number,
    ...(typeof raw.team === 'string' ? { team: raw.team } : {}),
  }
}

/** A bag of numbers, or nothing, with everything non-numeric reported. */
function readProps(
  raw: unknown,
  at: string,
  problems: XpProblem[],
): Record<string, number> {
  if (raw === undefined) return {}
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return {}
  }
  const props: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw)) {
    /**
     * The one name the world answers for itself.
     *
     * Refused rather than shadowed, because a shadowed one is the failure this
     * codebase keeps meeting: the field would parse, the editor would set it,
     * `setProp` would write it - and every condition asking about it would read
     * the world's answer instead, so an author would watch a number they can
     * see be ignored. See `HELD_PROP`.
     */
    if (key === HELD_PROP) {
      problems.push({
        at: `${at}.${key}`,
        message: `"${key}" is the world's own answer - a rule can read it, nothing may set it`,
      })
      continue
    }
    if (!isFiniteNumber(value)) {
      // Numbers only, because every verb that touches a property does
      // arithmetic on it - a property that is sometimes a string is one every
      // rule has to check before using.
      problems.push({ at: `${at}.${key}`, message: 'must be a number' })
      continue
    }
    props[key] = value
  }
  return props
}

/**
 * Read one verb, or say what is wrong with it.
 *
 * A closed vocabulary, so an unknown `op` is refused by name rather than
 * ignored - a rule with a typo in it that silently does nothing is the single
 * worst failure mode a rules system can have, because the level looks finished.
 */
function readVerb(raw: unknown, at: string, problems: XpProblem[]): Verb | null {
  if (!isObject(raw) || typeof raw.op !== 'string') {
    problems.push({ at, message: 'needs an op' })
    return null
  }

  const target: VerbTarget =
    raw.target === 'other' ? 'other' : raw.target === 'world' ? 'world' : 'self'
  if (
    raw.target !== undefined &&
    raw.target !== 'self' &&
    raw.target !== 'other' &&
    raw.target !== 'world'
  ) {
    problems.push({ at: `${at}.target`, message: 'must be "self", "other" or "world"' })
    return null
  }

  /**
   * The world is a place to keep numbers, and nothing else can be done to it.
   *
   * `pick` in ./verbs answers null for it, so a `damage target: 'world'` would
   * be a rule that quietly does nothing - the exact failure this whole function
   * exists to refuse, and the reason an unknown `op` is named rather than
   * ignored. Said here, where the author can still see it.
   */
  if (target === 'world' && raw.op !== 'setProp' && raw.op !== 'addProp') {
    problems.push({
      at: `${at}.target`,
      message: `"world" is the level's own data, so only setProp and addProp may name it`,
    })
    return null
  }

  const num = (key: string, fallback?: number): number | null => {
    if (raw[key] === undefined && fallback !== undefined) return fallback
    if (!isFiniteNumber(raw[key])) {
      problems.push({ at: `${at}.${key}`, message: 'missing or not a number' })
      return null
    }
    return raw[key] as number
  }

  switch (raw.op) {
    /**
     * A number, or anything between two numbers.
     *
     * `upTo` is checked here rather than shrugged at in ./verbs because both
     * ways of getting it wrong are silent at runtime and obvious on the page:
     * a ceiling below the floor is a range that can never be drawn from, and a
     * fractional end is a swing that takes 13.4 off somebody. Both would leave
     * an author looking at a rule that reads correctly and behaves as though
     * they had not written the field at all.
     *
     * Integers on both ends for the same reason a dice has faces: this is what
     * a player is told they took.
     */
    case 'damage':
    case 'heal': {
      const amount = num('amount')
      if (amount === null) return null
      if (raw.upTo === undefined) return { op: raw.op, amount, target }
      const upTo = num('upTo')
      if (upTo === null) return null
      if (!Number.isInteger(amount) || !Number.isInteger(upTo)) {
        problems.push({ at: `${at}.upTo`, message: 'a range is whole numbers at both ends' })
        return null
      }
      if (upTo < amount) {
        problems.push({ at: `${at}.upTo`, message: `must be at least ${amount}, the low end` })
        return null
      }
      // A range of one is the number it is, written back without the field. Not
      // an error: `10 upTo 10` is a reasonable thing to type on the way to
      // `10 upTo 20`, and it means exactly what a plain ten means.
      return upTo === amount
        ? { op: raw.op, amount, target }
        : { op: raw.op, amount, upTo, target }
    }
    case 'setProp':
    case 'addProp': {
      const value = num('value')
      if (typeof raw.key !== 'string' || raw.key.length === 0) {
        problems.push({ at: `${at}.key`, message: 'missing' })
        return null
      }
      return value === null ? null : { op: raw.op, key: raw.key, value, target }
    }
    /**
     * A dice, into one of the level's own fields.
     *
     * No `target`: it writes to `data` and nothing else, so `self` and `other`
     * would each be a word that means nothing here. The key is checked against
     * the declared block by the same walk that checks `setProp target: 'world'`
     * — a roll into a field nobody declared is the same mistake and gets the
     * same sentence.
     */
    case 'roll': {
      const sides = num('sides', 6)
      if (typeof raw.key !== 'string' || raw.key.length === 0) {
        problems.push({ at: `${at}.key`, message: 'missing — a roll names the field it lands in' })
        return null
      }
      if (sides === null) return null
      if (!Number.isInteger(sides) || sides < 2 || sides > 100) {
        problems.push({ at: `${at}.sides`, message: 'a dice has between 2 and 100 faces' })
        return null
      }
      return { op: 'roll', key: raw.key, sides }
    }
    /**
     * A seat, asked for by name.
     *
     * The name is the document's own vocabulary - a side out of the spawn marks
     * - so it is bounded and not otherwise checked here, the same latitude
     * `advance`'s `along` had: a level under construction may name a colour
     * before it has drawn the mark for it, and `sideOf` already answers
     * sensibly for a side with no mark.
     */
    case 'sit': {
      if (typeof raw.team !== 'string' || raw.team.length === 0) {
        problems.push({ at: `${at}.team`, message: 'missing — a seat is asked for by name' })
        return null
      }
      // The same 48 `advance`'s `along` takes, and for the same reason: these
      // are names out of the document, not prose.
      if (raw.team.length > 48) {
        problems.push({ at: `${at}.team`, message: 'too long — 48 characters at most' })
        return null
      }
      return { op: 'sit', team: raw.team }
    }
    /**
     * A piece walking a track of marks, by a number the level rolled.
     *
     * Both names are the document's own vocabulary rather than ours, so both are
     * bounded and neither is otherwise validated here: `along` names marks that
     * may not exist yet — a level under construction has a track with holes in
     * it — and `by` names a data field, which the declared-model walk checks
     * with the same sentence it uses for `setProp target: 'world'`.
     */
    case 'advance': {
      const along = raw.along
      const by = raw.by
      if (typeof along !== 'string' || along.length === 0 || along.length > 48) {
        problems.push({ at: `${at}.along`, message: 'names the marks a piece walks, like "track"' })
        return null
      }
      if (typeof by !== 'string' || by.length === 0) {
        problems.push({ at: `${at}.by`, message: 'names the field holding how many steps to take' })
        return null
      }
      /**
       * What to mark whatever is already standing on the destination.
       *
       * Optional, and a level that does not care about landing on things says
       * nothing - which is every document written before it. Refused empty for
       * the reason `Trigger.by` is: a property with no name is a mark nothing
       * can ever read back.
       */
      let bump: string | undefined
      if (raw.bump !== undefined) {
        if (typeof raw.bump !== 'string' || raw.bump.length === 0) {
          problems.push({
            at: `${at}.bump`,
            message: 'names the property to set on whatever is already there',
          })
          return null
        }
        bump = raw.bump
      }
      return { op: 'advance', target, by, along, ...(bump ? { bump } : {}) }
    }
    /**
     * A meeting. `seconds` is optional and the arbiter clamps it anyway.
     *
     * No target: a meeting happens to the room rather than to an entity, and
     * `self` or `other` here would be a word that means nothing — the same
     * reason `roll` has none.
     */
    case 'meet': {
      if (raw.seconds === undefined) return { op: 'meet' }
      const seconds = num('seconds')
      if (seconds === null) return null
      if (!Number.isFinite(seconds) || seconds <= 0) {
        problems.push({ at: `${at}.seconds`, message: 'is how long the room has to decide' })
        return null
      }
      return { op: 'meet', seconds }
    }
    // No fields at all: whose turn it is, and who is next, are both the
    // arbiter's. A `target` here would be a client naming somebody else's turn.
    case 'pass':
      return { op: 'pass' }
    // Carries nothing, including who: `visit` says what moves and the arbiter
    // says whose. See ./verbs and docs/xp/server-authority.md §4.3.
    case 'raid':
      return { op: 'raid' }
    case 'despawn':
      return { op: 'despawn', target }
    /**
     * A clip, and optionally the parts of the body it applies to.
     *
     * The name is bounded and otherwise unchecked, for the reason
     * `blueprint.pose` is: this package does not know which glTFs a host has
     * loaded, so a name it does not hold leaves the body doing what it was
     * doing. What *is* checked is that there is one - an empty name is a row
     * somebody has half filled in, and saving it would be saving a rule that
     * cannot do anything.
     *
     * `parts` is refused when it is present and empty rather than treated as
     * "the whole body", which is what dropping it would mean: `"parts": []`
     * reads as "no parts" to whoever wrote it, and silently turning that into
     * "every part" is the widest possible disagreement between a document and
     * its author.
     */
    case 'animate': {
      if (typeof raw.clip !== 'string' || raw.clip.length === 0) {
        problems.push({ at: `${at}.clip`, message: 'missing - name a clip to play' })
        return null
      }
      if (raw.clip.length > MAX_CLIP_NAME) {
        problems.push({ at: `${at}.clip`, message: `longer than ${MAX_CLIP_NAME} characters` })
        return null
      }
      if (raw.loop !== undefined && typeof raw.loop !== 'boolean') {
        problems.push({ at: `${at}.loop`, message: 'must be true or false' })
        return null
      }
      const loop = raw.loop === true

      if (raw.parts === undefined) {
        return loop ? { op: 'animate', clip: raw.clip, loop, target } : { op: 'animate', clip: raw.clip, target }
      }
      if (!Array.isArray(raw.parts) || raw.parts.length === 0 || raw.parts.length > MAX_PARTS) {
        problems.push({
          at: `${at}.parts`,
          message: `a list of 1 to ${MAX_PARTS} body parts, or leave it out for the whole body`,
        })
        return null
      }
      const parts: string[] = []
      for (const part of raw.parts) {
        if (typeof part !== 'string' || part.length === 0 || part.length > MAX_CLIP_NAME) {
          problems.push({ at: `${at}.parts`, message: 'every part is a name' })
          return null
        }
        parts.push(part)
      }
      return loop
        ? { op: 'animate', clip: raw.clip, loop, parts, target }
        : { op: 'animate', clip: raw.clip, parts, target }
    }
    /**
     * A motion of the thing's own model, by name.
     *
     * Only the *shape* here - that it is a name at all. Whether any blueprint in
     * this level has one called that is a cross-document question and is asked
     * where the other one like it is asked, beside `spawn`'s check that the
     * blueprint it names exists. Doing it here would mean this function needing
     * the whole blueprint table to read one verb.
     */
    case 'play': {
      if (typeof raw.motion !== 'string' || raw.motion.length === 0) {
        problems.push({ at: `${at}.motion`, message: 'missing - name a motion to play' })
        return null
      }
      if (!MOTION_NAME.test(raw.motion)) {
        problems.push({
          at: `${at}.motion`,
          message: `letters, digits, dash and underscore, up to ${MAX_MOTION_NAME}`,
        })
        return null
      }
      return { op: 'play', motion: raw.motion, target }
    }
    case 'rest':
      return { op: 'rest', target }
    case 'activate':
      return { op: 'activate', target }
    case 'drop':
      return { op: 'drop', target }
    case 'unhand':
      // No fields of its own: it is "let go of everything", and which things
      // those are is a fact about the world rather than about the rule.
      return { op: 'unhand', target }
    case 'checkpoint':
      // No fields of its own: the number lives in the pad's properties, so that
      // each save point placed in a level can carry a different one.
      return { op: 'checkpoint', target }
    case 'disarm':
    case 'arm':
      // No fields either, and deliberately no `seconds` where `deactivate` has
      // one: a disarm ends when whatever caused it ends, and those are events
      // with rules on them. See the verb.
      return { op: raw.op, target }
    case 'stun': {
      const seconds = num('seconds')
      if (seconds === null) return null
      if (seconds <= 0) {
        // Required and positive, where `deactivate`'s is optional: nothing can
        // turn a player back on, so "off until told" is not a meaning this one
        // has, and zero is a stun that ended before it started.
        problems.push({ at: `${at}.seconds`, message: 'must be a positive number of seconds' })
        return null
      }
      return { op: 'stun', target, seconds }
    }
    /**
     * A look, by name.
     *
     * Named rather than free-form for `blueprint.material`'s reason: a typo has
     * to be an error and not a rule that silently does nothing. `own` is kept
     * rather than dropped here, unlike on the blueprint - on a *rule* it is the
     * whole point, because it is how a level says "stop glowing".
     */
    case 'material': {
      if (!isMaterial(raw.material)) {
        problems.push({ at: `${at}.material`, message: `must be one of ${MATERIALS.join(', ')}` })
        return null
      }
      return { op: 'material', target, material: raw.material }
    }
    /**
     * A shove forward, in cells.
     *
     * Signed, unlike `stun`'s seconds: backwards is a hop out of trouble and is
     * the same move measured the other way. Zero is refused, though, for the
     * reason zero seconds is - a rule that reads as an action and does nothing
     * is a rule somebody has half written.
     */
    case 'dash': {
      const cells = num('cells')
      if (cells === null) return null
      if (cells === 0) {
        problems.push({ at: `${at}.cells`, message: 'must be a distance, forwards or back' })
        return null
      }
      return { op: 'dash', target, cells }
    }
    /**
     * A swing at whatever is in front, at arm's length.
     *
     * `reach` is the one field and it is optional, unlike `dash`'s `cells`: an
     * arm has a length whether or not a document says so, and every level that
     * has ever wanted one has wanted about two paces. A distance of zero or
     * less is refused for `cells`'s reason - it reads as an action and does
     * nothing - and an arm longer than a room is refused because a melee that
     * crosses the level is a gun with the wrong name on it.
     */
    case 'swing': {
      if (raw.reach === undefined) return { op: 'swing', target }
      const reach = num('reach')
      if (reach === null) return null
      if (reach <= 0 || reach > MAX_REACH) {
        problems.push({
          at: `${at}.reach`,
          message: `must be an arm's length, up to ${MAX_REACH} cells`,
        })
        return null
      }
      return { op: 'swing', target, reach }
    }
    case 'carry': {
      if (raw.socket === undefined) return { op: 'carry', target }
      if (typeof raw.socket !== 'string' || raw.socket.length === 0) {
        problems.push({ at: `${at}.socket`, message: 'must be a socket name' })
        return null
      }
      return { op: 'carry', target, socket: raw.socket }
    }
    case 'deactivate': {
      // Absent is a meaning - "off until something turns it back on" - so a
      // missing `seconds` is not an error and not a default of zero.
      if (raw.seconds === undefined) return { op: 'deactivate', target }
      if (!isFiniteNumber(raw.seconds) || (raw.seconds as number) <= 0) {
        problems.push({
          at: `${at}.seconds`,
          message: 'must be a positive number of seconds, or absent to stay off',
        })
        return null
      }
      return { op: 'deactivate', target, seconds: raw.seconds as number }
    }
    case 'spawn': {
      if (typeof raw.blueprint !== 'string') {
        problems.push({ at: `${at}.blueprint`, message: 'missing' })
        return null
      }
      const dx = num('dx', 0)
      const dy = num('dy', 0)
      const dz = num('dz', 0)
      if (dx === null || dy === null || dz === null) return null
      return { op: 'spawn', blueprint: raw.blueprint, dx, dy, dz }
    }
    case 'teleport': {
      // Not checked against the entities in the document, unlike `spawn` just
      // above: an author may name the exit before placing it, and a missing
      // destination fails softly at play (nobody moves) rather than making a
      // file that will not reopen. See `verbIsSane` in ./edit for the argument.
      if (typeof raw.to !== 'string' || raw.to.length === 0) {
        problems.push({ at: `${at}.to`, message: 'needs the name of somewhere to go' })
        return null
      }
      return { op: 'teleport', target, to: raw.to }
    }
    case 'load': {
      /**
       * A room here, or a document out there - one of the two and not both.
       *
       * `scene` is read first because it is the narrower claim, and refusing
       * the pair is worth the line: `{ xp, scene }` is a door somebody edited
       * from one kind to the other and half-finished, and picking a winner
       * would be this parser deciding which half of a contradiction the author
       * meant. The name is *not* checked against the `scenes` table, for the
       * reason `resolveScene` gives about a door that does not open yet: an
       * author may name a room before writing it, and `enter` is checked only
       * because a game that begins nowhere is broken on frame zero.
       */
      if (raw.scene !== undefined) {
        if (raw.xp !== undefined) {
          problems.push({
            at,
            message: 'a load names a scene in this document or an xp to fetch, not both',
          })
          return null
        }
        // The same alphabet an id uses, for a different reason: a scene name is
        // half of a Realtime topic, and a topic is a string every client works
        // out for itself and the policy has to match.
        if (typeof raw.scene !== 'string' || !isXpId(raw.scene)) {
          problems.push({
            at: `${at}.scene`,
            message: 'needs the name of a scene - lowercase letters, digits and dashes',
          })
          return null
        }
        /**
         * And who comes along, which today is everybody and now says so.
         *
         * Absent means `room`, and an explicit `room` is **kept** rather than
         * normalised away - which is the opposite of what `enter` does with an
         * explicit `main`, so the difference is worth naming. `enter` is filled
         * in for every document ever written, so a parser that emitted it would
         * grow a field in files whose authors never heard of scenes. Nothing
         * grows this one: it appears only on a verb somebody wrote after this
         * shipped, so a `who` in a file is a note its author left on a door
         * they thought about, and dropping it would be deleting the note.
         *
         * The two §1.5 names this does not have yet are refused *by name*, so
         * an author who read the design is told the word is real and the
         * behaviour is S6 rather than being told their file is malformed. What
         * that buys is in `SceneWho`: silence here is a door meant for one
         * person taking the whole room through it.
         */
        if (raw.who !== undefined && raw.who !== 'room') {
          problems.push({
            at: `${at}.who`,
            message:
              raw.who === 'self' || (typeof raw.who === 'string' && raw.who.startsWith('@'))
                ? `"${raw.who}" is not built yet - a load takes the whole room with it`
                : 'must be "room" - the only one there is so far',
          })
          return null
        }
        return { op: 'load', scene: raw.scene, ...(raw.who === 'room' ? { who: 'room' } : {}) }
      }
      // Refused by *shape*, not merely as missing: an id ends up in the path of
      // a fetch, so one with a slash or a dot-dot in it is an id that walks out
      // of the directory it names. Said here so an author is told in the editor
      // rather than at the moment somebody walks through the door.
      if (typeof raw.xp !== 'string' || !isXpId(raw.xp)) {
        problems.push({
          at: `${at}.xp`,
          message: 'needs the id of an XP - lowercase letters, digits and dashes',
        })
        return null
      }
      return { op: 'load', xp: raw.xp }
    }
    case 'score': {
      const amount = num('amount')
      return amount === null ? null : { op: 'score', amount }
    }
    case 'emit': {
      if (typeof raw.event !== 'string' || raw.event.length === 0) {
        problems.push({ at: `${at}.event`, message: 'missing' })
        return null
      }
      return { op: 'emit', event: raw.event }
    }
    case 'movie': {
      /**
       * Shape here; the *name* is checked further down, where the cuts are.
       *
       * `readVerb` runs while the blueprints are being read and `sequences` is
       * parsed after them, so this cannot ask whether the cut exists - the
       * same ordering `enter` lives with, and the same answer: a sweep after
       * both are known. See the `movie` walk beside the `data` one.
       */
      if (typeof raw.sequence !== 'string' || !isXpId(raw.sequence)) {
        problems.push({
          at: `${at}.sequence`,
          message: 'needs the name of a cut - lowercase letters, digits and dashes',
        })
        return null
      }
      return { op: 'movie', sequence: raw.sequence }
    }
    case 'sound': {
      /**
       * Refused by *name*, against the pack's own alphabet.
       *
       * Stricter than `pose`, which is checked for shape only because which
       * clips a host loads is the host's business. The asymmetry is deliberate
       * and the failure mode is why: a clip that will not load leaves a body in
       * its last pose, which somebody can see, and a sound that will not load
       * is silence — indistinguishable from a rule that never fired. So a
       * mistyped name is caught in the editor, where it is cheap.
       *
       * It is also the `isXpId` argument: this string reaches a path.
       */
      if (!isSound(raw.sound)) {
        problems.push({
          at: `${at}.sound`,
          message: `not a sound: ${String(raw.sound)}`,
        })
        return null
      }
      return { op: 'sound', sound: raw.sound }
    }
    default:
      problems.push({ at: `${at}.op`, message: `not a verb: ${String(raw.op)}` })
      return null
  }
}

/**
 * One condition, or nothing.
 *
 * Extracted when the animation graph needed the same three fields for a
 * transition. It was inlined in `readTrigger`, which was fine while there was
 * one caller and is exactly how two parsers of one shape end up disagreeing
 * about `of` - the field most recently added to it, and therefore the one a
 * copy would most likely be missing.
 *
 * Absent is `undefined` and so is malformed, with the problem pushed: a rule
 * whose condition did not parse is a rule that has already failed, and the
 * caller's job is to say so once rather than to decide again.
 */
function readCondition(
  raw: unknown,
  at: string,
  problems: XpProblem[],
): Condition | undefined {
  if (raw === undefined) return undefined
  if (!isObject(raw)) {
    problems.push({ at, message: 'not a condition' })
    return undefined
  }

  const w = raw
  /**
   * A number, or a field the level is keeping - see `Condition.value`.
   *
   * Checked by shape rather than accepted as any string, which is the whole of
   * keeping the indirection one level deep: `@world.a.b` and `@self.hp` are
   * refused here, so nothing downstream has to decide what they would have
   * meant. A bare string that is *not* a reference falls through to the message
   * below, which now names both forms.
   */
  const wants = isFiniteNumber(w.value) || isDataRef(w.value)
  const ok =
    typeof w.prop === 'string' &&
    w.prop.length > 0 &&
    typeof w.is === 'string' &&
    COMPARISONS.includes(w.is as Comparison) &&
    wants
  /**
   * Whose property, when the condition is not about the rule's own entity.
   *
   * Checked separately from the three required fields so the message names the
   * one that is wrong: a document that says `of: 'whoever'` should hear about
   * `of` rather than be told the whole condition needs a prop it plainly has.
   */
  const of =
    w.of === undefined || w.of === 'self' || w.of === 'other' || w.of === 'world' ? w.of : null
  if (!ok) {
    problems.push({
      at,
      message: `needs prop, is (${COMPARISONS.join(' ')}) and a value that is a number or "@world.<field>"`,
    })
    return undefined
  }
  if (of === null) {
    problems.push({ at: `${at}.of`, message: 'must be self, other or world' })
    return undefined
  }

  return {
    // Dropped when it is the default, so a condition that never asked about
    // anybody else round-trips as the three fields it always was.
    ...(of === 'other' || of === 'world' ? { of } : {}),
    prop: w.prop as string,
    is: w.is as Comparison,
    value: w.value as number | DataRef,
  }
}

/**
 * One animation graph: its states, its arrows and where a body starts.
 *
 * Every refusal here is a shape somebody would otherwise find by watching a
 * body stand still, which is the failure this whole parser exists to move
 * earlier. The clip *names* are the deliberate exception - see `AnimationState`
 * for why a document is not wrong because this renderer is currently incurious.
 */
function readAnimationGraph(
  raw: unknown,
  at: string,
  problems: XpProblem[],
): AnimationGraph | null {
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return null
  }

  if (!isObject(raw.states)) {
    problems.push({ at: `${at}.states`, message: 'missing - a graph is its states' })
    return null
  }

  const states: Record<string, AnimationState> = {}
  for (const [name, entry] of Object.entries(raw.states)) {
    if (!ANIMATION_NAME.test(name)) {
      problems.push({
        at: `${at}.states.${name}`,
        message: `letters, digits, dash and underscore, up to ${MAX_ANIMATION_NAME}`,
      })
      continue
    }
    if (!isObject(entry)) {
      problems.push({ at: `${at}.states.${name}`, message: 'not an object' })
      continue
    }
    if (typeof entry.clip !== 'string' || entry.clip.length === 0) {
      problems.push({ at: `${at}.states.${name}.clip`, message: 'missing - a state is a clip' })
      continue
    }
    if (entry.clip.length > MAX_CLIP_NAME) {
      problems.push({
        at: `${at}.states.${name}.clip`,
        message: `longer than ${MAX_CLIP_NAME} characters`,
      })
      continue
    }
    if (entry.loop !== undefined && typeof entry.loop !== 'boolean') {
      problems.push({ at: `${at}.states.${name}.loop`, message: 'must be true or false' })
      continue
    }

    let parts: string[] | undefined
    if (entry.parts !== undefined) {
      /**
       * Empty is refused rather than read as "the whole body".
       *
       * `"parts": []` reads as *no parts* to whoever wrote it, and silently
       * turning that into *every part* is the widest possible disagreement
       * between a document and its author. The `animate` verb refuses it for
       * the same reason and with the same words.
       */
      if (!Array.isArray(entry.parts) || entry.parts.length === 0 || entry.parts.length > MAX_PARTS) {
        problems.push({
          at: `${at}.states.${name}.parts`,
          message: `a list of 1 to ${MAX_PARTS} body parts, or leave it out for the whole body`,
        })
        continue
      }
      parts = []
      let bad = false
      for (const part of entry.parts) {
        if (typeof part !== 'string' || part.length === 0 || part.length > MAX_CLIP_NAME) {
          problems.push({ at: `${at}.states.${name}.parts`, message: 'every part is a name' })
          bad = true
          break
        }
        parts.push(part)
      }
      if (bad) continue
    }

    states[name] = {
      clip: entry.clip,
      ...(entry.loop === true ? { loop: true } : {}),
      ...(parts ? { parts } : {}),
    }
  }

  const names = Object.keys(states)
  if (names.length === 0) {
    problems.push({ at: `${at}.states`, message: 'a graph with no states is not a graph' })
    return null
  }
  if (names.length > MAX_STATES) {
    problems.push({ at: `${at}.states`, message: `${names.length} states, over the ${MAX_STATES} limit` })
    return null
  }

  /**
   * Where a body is before anything has happened, and it has to be a stance.
   *
   * A body that started life as an arms-only overlay would be a body with
   * nothing driving its legs, which is the bind pose with extra steps - and
   * the bind pose is the failure this format keeps arranging to make loud.
   */
  if (typeof raw.entry !== 'string' || !(raw.entry in states)) {
    problems.push({
      at: `${at}.entry`,
      message: `must name one of this graph's states: ${names.join(', ')}`,
    })
    return null
  }
  if (isLayer(states[raw.entry]!)) {
    problems.push({
      at: `${at}.entry`,
      message: `"${raw.entry}" is a layer, so it cannot be where a body starts - name a state with no parts`,
    })
    return null
  }

  const transitions: AnimationTransition[] = []
  if (raw.transitions !== undefined) {
    if (!Array.isArray(raw.transitions) || raw.transitions.length > MAX_TRANSITIONS) {
      problems.push({
        at: `${at}.transitions`,
        message: `a list of up to ${MAX_TRANSITIONS} arrows`,
      })
      return null
    }
    raw.transitions.forEach((row, index) => {
      const where = `${at}.transitions[${index}]`
      if (!isObject(row)) {
        problems.push({ at: where, message: 'not an object' })
        return
      }
      for (const end of ['from', 'to'] as const) {
        if (typeof row[end] !== 'string' || !(row[end] in states)) {
          problems.push({ at: `${where}.${end}`, message: `no state called "${String(row[end])}"` })
          return
        }
      }
      const from = states[row.from as string]!
      const to = states[row.to as string]!
      /**
       * An arrow connects two states of the same kind, and that is the rule
       * that keeps one owner of what is playing.
       *
       * A stance moving to a layer would be a body handing its legs to an
       * arms-only overlay; a layer moving to a stance would be a wave that
       * decided to take over walking. Both are the fold that produced the
       * walking-punch bug, arriving through the back door as data.
       */
      if (isLayer(from) !== isLayer(to)) {
        problems.push({
          at: where,
          message: 'a stance and a layer cannot be joined by an arrow - one owns the body, the other lies over it',
        })
        return
      }
      const when = readCondition(row.when, `${where}.when`, problems)
      transitions.push({
        from: row.from as string,
        to: row.to as string,
        ...(when ? { when } : {}),
      })
    })
  }

  /**
   * Which rig, refused rather than coerced.
   *
   * The one field in this function that could sensibly have been read
   * forgivingly - `rigFor` in the editor does exactly that, falling back to the
   * dummy for a name it does not know. The difference is what happens next.
   * There, an unreadable name means a body on screen somebody can switch; here
   * it means a saved level in which every clip binds to nothing, and quietly
   * calling that "the dummy" is the format inventing an answer to a question the
   * author got wrong.
   */
  let rig: SkeletonId | undefined
  if (raw.rig !== undefined) {
    if (typeof raw.rig !== 'string' || !SKELETON_IDS.includes(raw.rig as SkeletonId)) {
      problems.push({ at: `${at}.rig`, message: `must be one of ${SKELETON_IDS.join(', ')}` })
      return null
    }
    rig = raw.rig as SkeletonId
  }

  return { entry: raw.entry, states, transitions, ...(rig ? { rig } : {}) }
}

/**
 * One clip the document carries: its samples, and every track the same length.
 *
 * Stricter than anything else that names a clip, and the asymmetry is the same
 * one `play` has against `animate`: a *name* belongs to whichever glTFs a host
 * loaded and cannot be checked here, but the samples of a clip that is in this
 * file are in this file. Nothing about them is somebody else's business.
 *
 * The squareness check is the one that earns its keep. A bone track one sample
 * short binds without complaint and then plays the whole animation a frame out
 * against every other bone, which reads as a body coming apart rather than as a
 * file being wrong - and it is the exact shape a hand-edit or a bad merge
 * produces.
 */
/**
 * A timeline, checked against the place it is a timeline *of*.
 *
 * ---------------------------------------------------------------------------
 * Why this is not a shape check
 * ---------------------------------------------------------------------------
 * docs/xp/scenes.md §2.3 is explicit and it is the reason this reader takes the
 * entity list as an argument: *"a key on a name that resolves to nothing is a
 * parse problem rather than a silent no-op"*. A timeline is a set of overrides
 * on things that exist, and the failure it is guarding against is the one this
 * whole editor is worst at showing - an author renames a crate, the key that
 * drove it quietly stops applying, and the movie plays with one thing missing
 * and nothing anywhere saying why.
 *
 * The same argument covers the two others: a cut naming a camera that was
 * deleted, and a cue naming a body that is not in this place. `stageAt` falls
 * back rather than throwing on both, because a runtime that crashes on a stale
 * document is worse than one that plays it - but a *saved* document should not
 * contain either, and this is where that is decided.
 *
 * Clip names are the deliberate exception, the same asymmetry `blueprint.pose`
 * and the `animate` verb already have: which glTFs a host has loaded is the
 * host's business, so a cue may name a clip this parser has never heard of.
 */
function readTimeline(
  raw: unknown,
  at: string,
  entities: readonly EntitySpec[],
  blueprints: Readonly<Record<string, Blueprint>>,
  problems: XpProblem[],
): XpTimeline | null {
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return null
  }

  const before = problems.length

  const duration = bounded(raw.duration, `${at}.duration`, 0.01, MAX_DURATION, problems, DEFAULT_DURATION)
  const fps = Math.round(bounded(raw.fps, `${at}.fps`, MIN_FPS, MAX_FPS, problems, DEFAULT_FPS))

  // --- who is in this place, by name ----------------------------------------
  // Only named entities can be addressed, which is not a limitation so much as
  // what a name *is* for here - the same one `getEntityByName` resolves, which
  // is why naming came before scripting.
  const named = new Set(entities.map((one) => one.name).filter((one): one is string => !!one))
  /**
   * What each body holds, by name - its blueprint's declarations *and* its own.
   *
   * The blueprint half is the one that matters and is easy to leave out.
   * `EntitySpec.props` is overrides: a placed crate carries only the numbers it
   * differs on, so checking a key against that bag alone would make every
   * property an author had not already typed in by hand unkeyable, with the
   * refusal reading "this has no property called angle" about a blueprint whose
   * whole job is holding one.
   */
  const propsOf = new Map(
    entities
      .filter((one): one is EntitySpec & { name: string } => !!one.name)
      .map(
        (one) =>
          [
            one.name,
            new Set([
              ...Object.keys(blueprints[one.blueprint]?.props ?? {}),
              ...Object.keys(one.props),
            ]),
          ] as const,
      ),
  )

  // --- tracks ---------------------------------------------------------------
  const tracks: Record<string, Tracks> = {}
  if (raw.tracks !== undefined) {
    if (!isObject(raw.tracks)) {
      problems.push({ at: `${at}.tracks`, message: 'not an object' })
    } else if (Object.keys(raw.tracks).length > MAX_TRACKED) {
      problems.push({ at: `${at}.tracks`, message: `over the ${MAX_TRACKED} node limit` })
    } else {
      for (const [name, bag] of Object.entries(raw.tracks)) {
        const where = `${at}.tracks.${name}`
        if (!named.has(name)) {
          problems.push({ at: where, message: `nothing here is called "${name}"` })
          continue
        }
        if (!isObject(bag)) {
          problems.push({ at: where, message: 'not an object' })
          continue
        }
        const one: Record<string, Key[]> = {}
        for (const [property, list] of Object.entries(bag)) {
          const spot = `${where}.${property}`
          const prop = propOfProperty(property)
          const limits = prop === null ? animatable(property) : undefined
          if (prop === null && !limits) {
            problems.push({ at: spot, message: `nothing can be keyed called "${property}"` })
            continue
          }
          if (prop !== null && !propsOf.get(name)?.has(prop)) {
            problems.push({ at: spot, message: `"${name}" has no property called "${prop}"` })
            continue
          }
          if (!Array.isArray(list)) {
            problems.push({ at: spot, message: 'a list of keys' })
            continue
          }
          if (list.length > MAX_KEYS) {
            problems.push({ at: spot, message: `over the ${MAX_KEYS} key limit` })
            continue
          }
          const keys: Key[] = []
          for (const [index, entry] of list.entries()) {
            const key = readKey(entry, `${spot}[${index}]`, limits, problems)
            if (key) keys.push(key)
          }
          // Sorted here rather than trusted, because every sampler below walks
          // them in order and an out-of-order pair is a property that jumps
          // backwards mid-shot with nothing to say why.
          if (keys.length > 0) one[property] = keys.sort((a, b) => a.t - b.t)
        }
        if (Object.keys(one).length > 0) tracks[name] = one
      }
    }
  }

  // --- cameras --------------------------------------------------------------
  const cameras: MovieCamera[] = []
  if (raw.cameras !== undefined) {
    if (!Array.isArray(raw.cameras)) {
      problems.push({ at: `${at}.cameras`, message: 'a list of cameras' })
    } else if (raw.cameras.length > MAX_CAMERAS) {
      problems.push({ at: `${at}.cameras`, message: `over the ${MAX_CAMERAS} camera limit` })
    } else {
      for (const [index, entry] of raw.cameras.entries()) {
        const camera = readMovieCamera(entry, `${at}.cameras[${index}]`, problems)
        if (!camera) continue
        // Two cameras with one name is a cut list that means two things, and
        // the one that loses is whichever the lookup happens to find first.
        if (cameras.some((one) => one.name === camera.name)) {
          problems.push({
            at: `${at}.cameras[${index}].name`,
            message: `there is already a camera called "${camera.name}"`,
          })
          continue
        }
        cameras.push(camera)
      }
    }
  }
  // A movie without a camera is not a movie, and the fix is never a refusal -
  // an author who has not placed one yet is at the start rather than in error.
  if (cameras.length === 0) cameras.push(DEFAULT_MOVIE_CAMERA)

  // --- cuts -----------------------------------------------------------------
  const cuts: Cut[] = []
  if (raw.cuts !== undefined) {
    if (!Array.isArray(raw.cuts)) {
      problems.push({ at: `${at}.cuts`, message: 'a list of cuts' })
    } else if (raw.cuts.length > MAX_CUTS) {
      problems.push({ at: `${at}.cuts`, message: `over the ${MAX_CUTS} cut limit` })
    } else {
      for (const [index, entry] of raw.cuts.entries()) {
        const where = `${at}.cuts[${index}]`
        if (!isObject(entry)) {
          problems.push({ at: where, message: 'not an object' })
          continue
        }
        const t = bounded(entry.t, `${where}.t`, 0, MAX_DURATION, problems, 0)
        if (typeof entry.camera !== 'string' || !cameras.some((one) => one.name === entry.camera)) {
          problems.push({ at: `${where}.camera`, message: 'must name a camera in this timeline' })
          continue
        }
        cuts.push({ t, camera: entry.camera })
      }
    }
  }
  cuts.sort((a, b) => a.t - b.t)

  // --- actions --------------------------------------------------------------
  /**
   * Everything the cast does, in one list.
   *
   * Clips lived in `cues` and lines in `lines`, each with a reader of its own,
   * and folding them in removed more code than it added: one shape check, one
   * entity check, one sort. What each *kind* adds is its own two or three
   * fields, which is the only thing that was ever different about them.
   */
  const actions: XpAction[] = []
  if (raw.actions !== undefined) {
    if (!Array.isArray(raw.actions)) {
      problems.push({ at: `${at}.actions`, message: 'a list of actions' })
    } else if (raw.actions.length > MAX_ACTIONS) {
      problems.push({ at: `${at}.actions`, message: `over the ${MAX_ACTIONS} action limit` })
    } else {
      for (const [index, entry] of raw.actions.entries()) {
        const action = readAction(entry, `${at}.actions[${index}]`, named, problems)
        if (action) actions.push(action)
      }
    }
  }
  /*
   * Ordered, because `actedAt` **folds** them: a move starts where the last one
   * finished, so an out-of-order pair is a body that walks somewhere it has not
   * been yet. Every other sort in this reader is a convenience; this one is the
   * difference between a correct shot and a wrong one.
   */
  actions.sort((a, b) => a.t - b.t)

  // --- backdrop -------------------------------------------------------------
  let backdrop: Backdrop = DEFAULT_BACKDROP
  if (raw.backdrop !== undefined) {
    if (!isObject(raw.backdrop)) {
      problems.push({ at: `${at}.backdrop`, message: 'not an object' })
    } else if (
      typeof raw.backdrop.kind !== 'string' ||
      !BACKDROP_KINDS.includes(raw.backdrop.kind as BackdropKind)
    ) {
      problems.push({
        at: `${at}.backdrop.kind`,
        message: `one of ${BACKDROP_KINDS.join(', ')}`,
      })
    } else {
      const kind = raw.backdrop.kind as BackdropKind
      const colour = typeof raw.backdrop.colour === 'string' ? raw.backdrop.colour : undefined
      const image = typeof raw.backdrop.image === 'string' ? raw.backdrop.image : undefined
      /**
       * A path, never a URL.
       *
       * A document that can name `https://` anywhere is a document that can
       * make a viewer's browser fetch from a host the viewer never chose, which
       * is a tracking pixel with extra steps. Levels get shared; this is the
       * same rule `packs` follows, and it is a refusal rather than a strip so
       * that an author who pasted one is told rather than left wondering where
       * their backdrop went.
       */
      if (image !== undefined && !image.startsWith('/')) {
        problems.push({
          at: `${at}.backdrop.image`,
          message: 'a path under this host, starting with /',
        })
      } else if ((kind === 'image' || kind === 'sky') && image === undefined) {
        problems.push({ at: `${at}.backdrop.image`, message: `a ${kind} backdrop needs a picture` })
      } else {
        backdrop = {
          kind,
          ...(colour !== undefined ? { colour } : {}),
          ...(image !== undefined ? { image } : {}),
        }
      }
    }
  }

  if (problems.length !== before) return null
  return { duration, fps, tracks, cameras, cuts, actions, backdrop }
}

/**
 * One action: a beat, an actor, and whatever its kind adds.
 *
 * The clip name is deliberately unchecked, the same asymmetry `blueprint.pose`
 * and the `animate` verb have - which glTFs a host has loaded is the host's
 * business. The *entity* is checked, because a body that is not in this place
 * is a name nothing can ever resolve.
 */
function readAction(
  raw: unknown,
  at: string,
  named: ReadonlySet<string>,
  problems: XpProblem[],
): XpAction | null {
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return null
  }
  if (typeof raw.entity !== 'string' || !named.has(raw.entity)) {
    problems.push({ at: `${at}.entity`, message: 'must name a body in this place' })
    return null
  }
  if (typeof raw.kind !== 'string' || !ACTION_KINDS.includes(raw.kind as ActionKind)) {
    problems.push({ at: `${at}.kind`, message: `one of ${ACTION_KINDS.join(', ')}` })
    return null
  }

  const beat = {
    entity: raw.entity,
    t: bounded(raw.t, `${at}.t`, 0, MAX_DURATION, problems, 0),
    // Floored rather than allowed to be zero: a zero-length action is one the
    // sampler divides by and the timeline draws as an invisible sliver. A verb
    // that happens instantly is a key, and the format already has those.
    duration: bounded(raw.duration, `${at}.duration`, 0.05, MAX_ACTION_SECONDS, problems, 1),
  }

  switch (raw.kind as ActionKind) {
    case 'move':
      return {
        ...beat,
        kind: 'move',
        x: bounded(raw.x, `${at}.x`, -200, 200, problems, 0),
        z: bounded(raw.z, `${at}.z`, -200, 200, problems, 0),
      }
    case 'turn':
      return {
        ...beat,
        kind: 'turn',
        rotation: bounded(raw.rotation, `${at}.rotation`, -1440, 1440, problems, 0),
      }
    case 'jump':
      return {
        ...beat,
        kind: 'jump',
        height: bounded(raw.height, `${at}.height`, 0.1, 40, problems, 1.6),
      }
    case 'play': {
      if (typeof raw.clip !== 'string' || raw.clip.length === 0) {
        problems.push({ at: `${at}.clip`, message: 'a clip name' })
        return null
      }
      const parts = raw.parts
      if (parts !== undefined && !(Array.isArray(parts) && parts.every((one) => typeof one === 'string'))) {
        problems.push({ at: `${at}.parts`, message: 'a list of bone names' })
        return null
      }
      return {
        ...beat,
        kind: 'play',
        clip: raw.clip,
        loop: raw.loop === true,
        ...(parts && parts.length > 0 ? { parts: parts as string[] } : {}),
      }
    }
    case 'say': {
      if (typeof raw.text !== 'string' || raw.text.length === 0) {
        problems.push({ at: `${at}.text`, message: 'something to say' })
        return null
      }
      if (raw.text.length > MAX_LINE) {
        problems.push({ at: `${at}.text`, message: `up to ${MAX_LINE} characters` })
        return null
      }
      return { ...beat, kind: 'say', text: raw.text }
    }
  }
}

/**
 * A sequence, checked against the shots it names.
 *
 * The same argument `readTimeline` runs on, one level up: a take naming a place
 * that has no timeline is a block of film with nothing in it, and the symptom
 * without this is an export that plays black for four seconds with nothing
 * anywhere saying why. So a take must name a place, and that place must be a
 * shot.
 *
 * Read after the scenes for that reason, and handed both - the root counts,
 * because the root is a scene and a one-shot movie is a document with a
 * timeline and nothing else.
 */
function readSequence(
  raw: unknown,
  at: string,
  shots: ReadonlySet<string>,
  problems: XpProblem[],
): XpSequence | null {
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return null
  }

  const before = problems.length

  let name: string | undefined
  if (raw.name !== undefined) {
    if (typeof raw.name !== 'string' || raw.name.length > MAX_SEQUENCE_NAME) {
      problems.push({ at: `${at}.name`, message: `up to ${MAX_SEQUENCE_NAME} characters` })
    } else if (raw.name.length > 0) {
      name = raw.name
    }
  }

  if (!Array.isArray(raw.takes)) {
    problems.push({ at: `${at}.takes`, message: 'a list of takes' })
    return null
  }
  if (raw.takes.length > MAX_TAKES) {
    problems.push({ at: `${at}.takes`, message: `over the ${MAX_TAKES} take limit` })
    return null
  }

  const takes: Take[] = []
  for (const [index, entry] of raw.takes.entries()) {
    const where = `${at}.takes[${index}]`
    if (!isObject(entry)) {
      problems.push({ at: where, message: 'not an object' })
      continue
    }
    if (typeof entry.scene !== 'string' || !shots.has(entry.scene)) {
      problems.push({ at: `${where}.scene`, message: 'must name a place with a timeline' })
      continue
    }
    const from = bounded(entry.from, `${where}.from`, 0, MAX_DURATION, problems, 0)
    const to = bounded(entry.to, `${where}.to`, 0, MAX_DURATION, problems, MAX_DURATION)
    /**
     * A take that ends before it starts is refused rather than swapped.
     *
     * Swapping would be friendlier and it would be a guess: the two handles are
     * dragged separately, so a crossed pair is either "I meant the other way
     * round" or "I dragged the wrong one", and only the author knows which.
     * Refusing it keeps this out of the file, and the panel is where a drag is
     * clamped so it never gets here in the first place.
     */
    if (to <= from) {
      problems.push({ at: where, message: 'a take ends after it starts' })
      continue
    }
    takes.push({
      scene: entry.scene,
      from,
      to,
      speed: bounded(entry.speed, `${where}.speed`, MIN_SPEED, MAX_SPEED, problems, 1),
    })
  }

  if (problems.length !== before) return null
  return { ...(name ? { name } : {}), takes }
}

/** One key. The bounds come from whichever row of `ANIMATABLE` this property is. */
function readKey(
  raw: unknown,
  at: string,
  limits: { min: number; max: number } | undefined,
  problems: XpProblem[],
): Key | null {
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return null
  }
  const t = bounded(raw.t, `${at}.t`, 0, MAX_DURATION, problems, 0)
  if (typeof raw.value !== 'number' || !Number.isFinite(raw.value)) {
    problems.push({ at: `${at}.value`, message: 'a number' })
    return null
  }
  const value = limits
    ? Math.min(limits.max, Math.max(limits.min, raw.value))
    : raw.value
  const ease =
    typeof raw.ease === 'string' && EASES.includes(raw.ease as Ease) ? (raw.ease as Ease) : 'smooth'
  return { t, value, ease }
}

/** One camera, and the framings it passes through. */
function readMovieCamera(raw: unknown, at: string, problems: XpProblem[]): MovieCamera | null {
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return null
  }
  if (typeof raw.name !== 'string' || !CAMERA_NAME.test(raw.name)) {
    problems.push({ at: `${at}.name`, message: 'letters, digits, dash and underscore' })
    return null
  }
  if (!Array.isArray(raw.keys) || raw.keys.length === 0) {
    problems.push({ at: `${at}.keys`, message: 'a camera is at least one framing' })
    return null
  }
  if (raw.keys.length > MAX_FRAMINGS) {
    problems.push({ at: `${at}.keys`, message: `over the ${MAX_FRAMINGS} framing limit` })
    return null
  }

  const keys: Framing[] = []
  for (const [index, entry] of raw.keys.entries()) {
    const where = `${at}.keys[${index}]`
    if (!isObject(entry)) {
      problems.push({ at: where, message: 'not an object' })
      return null
    }
    const position = readVec3(entry.position, `${where}.position`, problems)
    const target = readVec3(entry.target, `${where}.target`, problems)
    if (!position || !target) return null
    keys.push({
      t: bounded(entry.t, `${where}.t`, 0, MAX_DURATION, problems, 0),
      position,
      target,
      fov: bounded(entry.fov, `${where}.fov`, 5, 120, problems, DEFAULT_MOVIE_FOV),
    })
  }

  return {
    name: raw.name,
    keys: keys.sort((a, b) => a.t - b.t),
    // Eased unless it says otherwise: two or three framings is what this is for,
    // and each one is worth arriving at and settling on.
    ease: raw.ease !== false,
  }
}

function readVec3(raw: unknown, at: string, problems: XpProblem[]): Vec3 | null {
  const values = numbers(raw)
  if (!values || values.length !== 3) {
    problems.push({ at, message: 'three numbers' })
    return null
  }
  const [x, y, z] = values as [number, number, number]
  if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > 500) {
    problems.push({ at, message: 'further than 500 from the middle of the world' })
    return null
  }
  return [x, y, z]
}

function readClip(raw: unknown, at: string, problems: XpProblem[]): XpClip | null {
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return null
  }

  if (typeof raw.rig !== 'string' || !SKELETON_IDS.includes(raw.rig as SkeletonId)) {
    problems.push({ at: `${at}.rig`, message: `must be one of ${SKELETON_IDS.join(', ')}` })
    return null
  }

  const times = numbers(raw.times)
  if (!times || times.length === 0 || times.length > MAX_CLIP_SAMPLES) {
    problems.push({
      at: `${at}.times`,
      message: `1 to ${MAX_CLIP_SAMPLES} sample times, in seconds`,
    })
    return null
  }
  // Ascending, because a player walks them in order and an out-of-order pair is
  // a clip that jumps backwards mid-play with nothing to say why.
  for (let index = 1; index < times.length; index += 1) {
    if (times[index]! <= times[index - 1]!) {
      problems.push({ at: `${at}.times`, message: 'sample times have to climb' })
      return null
    }
  }

  if (typeof raw.duration !== 'number' || !Number.isFinite(raw.duration) || raw.duration <= 0) {
    problems.push({ at: `${at}.duration`, message: 'how long the clip runs, in seconds' })
    return null
  }
  if (raw.loop !== undefined && typeof raw.loop !== 'boolean') {
    problems.push({ at: `${at}.loop`, message: 'must be true or false' })
    return null
  }

  if (!isObject(raw.bones)) {
    problems.push({ at: `${at}.bones`, message: 'missing - a clip is its tracks' })
    return null
  }
  const names = Object.keys(raw.bones)
  if (names.length === 0 || names.length > MAX_CLIP_TRACKS) {
    problems.push({ at: `${at}.bones`, message: `1 to ${MAX_CLIP_TRACKS} tracks` })
    return null
  }

  const bones: Record<string, number[]> = {}
  for (const [bone, track] of Object.entries(raw.bones)) {
    const values = numbers(track)
    if (bone.length === 0 || bone.length > MAX_CLIP_NAME || !values) {
      problems.push({ at: `${at}.bones.${bone}`, message: 'a bone name and a run of numbers' })
      return null
    }
    bones[bone] = values
  }

  let root: number[] | undefined
  if (raw.root !== undefined) {
    const values = numbers(raw.root)
    if (!values) {
      problems.push({ at: `${at}.root`, message: 'a run of numbers, three a sample' })
      return null
    }
    root = values
  }

  /**
   * How each sample leaves, if the clip says.
   *
   * Refused rather than repaired when the count is wrong: the whole file's rule
   * is that a clip's parallel lists agree, and an `eases` one entry short means
   * every segment after the gap is shaped by the wrong instruction - which is
   * silent, and looks like the animation being authored badly.
   */
  let eases: Ease[] | undefined
  if (raw.eases !== undefined) {
    if (
      !Array.isArray(raw.eases) ||
      raw.eases.length !== times.length ||
      !raw.eases.every((one) => EASES.includes(one as Ease))
    ) {
      problems.push({
        at: `${at}.eases`,
        message: `one of ${EASES.join(', ')} per sample - ${times.length} of them`,
      })
      return null
    }
    eases = raw.eases as Ease[]
  }

  const clip: XpClip = {
    rig: raw.rig as SkeletonId,
    duration: raw.duration,
    times,
    bones,
    ...(raw.loop === true ? { loop: true } : {}),
    ...(eases ? { eases } : {}),
    ...(root ? { root } : {}),
  }

  if (!clipIsSquare(clip)) {
    problems.push({
      at,
      message: `every track has to be as long as its ${times.length} samples - four numbers a sample for a bone, three for the root`,
    })
    return null
  }

  return clip
}

/** A list that is all finite numbers, or null for anything else. */
/**
 * A number inside a range, or the fallback with a problem recorded.
 *
 * Clamping rather than refusing, for the fields that have one honest answer
 * either side: a duration of -1 is a typo and a duration of a million is a
 * document nobody can load, and neither is worth stopping an author over when
 * the nearest legal value is obvious. The refusals are kept for the cases where
 * there is no such value - a name nothing declares, a camera that is not there.
 */
function bounded(
  value: unknown,
  at: string,
  min: number,
  max: number,
  problems: XpProblem[],
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    if (value !== undefined) problems.push({ at, message: 'a number' })
    return fallback
  }
  return Math.min(max, Math.max(min, value))
}

function numbers(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const out: number[] = []
  for (const entry of value) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) return null
    out.push(entry)
  }
  return out
}

/** Read one trigger, or say what is wrong with it. */
function readTrigger(raw: unknown, at: string, problems: XpProblem[]): Trigger | null {
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return null
  }

  const before = problems.length

  const on = raw.on
  if (typeof on !== 'string' || !TRIGGER_EVENTS.includes(on as TriggerEvent)) {
    problems.push({ at: `${at}.on`, message: `must be one of ${TRIGGER_EVENTS.join(', ')}` })
  }

  const when = readCondition(raw.when, `${at}.when`, problems)

  /**
   * Whose rule this is. A property name, and nothing checks that anything
   * carries it.
   *
   * Unchecked on purpose, and the same argument `tags` makes: the property is
   * written by whoever grants membership - `spawnPlayer` writes `team:blue`,
   * a rule writes `has-key` - and a parser that demanded to see it first would
   * refuse a document whose groups are handed out at runtime, which is all of
   * them. What it does refuse is an empty one, because `by: ''` is a rule
   * nobody can ever set off and is always a mistake rather than a lock.
   */
  let by: string | undefined
  if (raw.by !== undefined) {
    if (typeof raw.by !== 'string' || raw.by.length === 0) {
      problems.push({ at: `${at}.by`, message: 'names a property whoever sets this off must carry' })
    } else {
      by = raw.by
    }
  }

  /**
   * The binding a `pressed` trigger listens for.
   *
   * Required there and refused everywhere else, rather than merely ignored. A
   * `pressed` with no key would fire on nothing at all, and an `enter` carrying
   * one would read as if it did something - both are the silent-no-op this
   * format keeps having to be talked out of, and `cameraProblems` refusing
   * side-only fields on a follow camera is the precedent for saying so instead.
   */
  let key: string | undefined
  // `released` is the same field for the same reason: letting go of *a* key is
  // not an event, letting go of the one this rule is about is.
  if (on === 'pressed' || on === 'released') {
    if (typeof raw.key !== 'string' || raw.key.length === 0) {
      problems.push({ at: `${at}.key`, message: `a ${on} trigger needs the key it listens for` })
    } else {
      key = raw.key
    }
  } else if (raw.key !== undefined) {
    problems.push({
      at: `${at}.key`,
      message: `only a pressed or released trigger has a key, not ${String(on)}`,
    })
  }

  /**
   * The name an `emitted` trigger listens for.
   *
   * Required there and refused everywhere else, exactly as `key` is above and
   * for the same reason: an `emitted` with no name would listen for nothing at
   * all, and an `enter` carrying one would read as if it were filtering.
   *
   * Any non-empty string is allowed, deliberately - it is matched against what
   * an `emit` verb says, and that is a free string too. Constraining the shape
   * here without constraining it there would be a rule that can only be broken
   * from one end.
   */
  let event: string | undefined
  if (on === 'emitted') {
    if (typeof raw.event !== 'string' || raw.event.length === 0) {
      problems.push({
        at: `${at}.event`,
        message: 'an emitted trigger needs the name it listens for',
      })
    } else {
      event = raw.event
    }
  } else if (raw.event !== undefined) {
    problems.push({
      at: `${at}.event`,
      message: `only an emitted trigger has an event name, not ${String(on)}`,
    })
  }

  /**
   * How near the presser has to be, in cells.
   *
   * Optional where `key` is required - absent is the press-from-anywhere every
   * `pressed` rule had before this field, and that has to keep parsing. Refused
   * on every other event for the reason `key` is: `enter` already has a reach
   * and it is the box, so a rule carrying both would be two answers to one
   * question with only one of them doing anything.
   *
   * No ceiling, deliberately, unlike `player.jump`: a reach larger than the
   * level is the same rule as no reach at all, where a jump that large is a
   * player in orbit. Zero and below are refused - that rule can never fire, and
   * a trigger that never fires is the silent no-op again.
   */
  let reach: number | undefined
  if (raw.within !== undefined) {
    if (on !== 'pressed') {
      problems.push({
        at: `${at}.within`,
        message: `only a pressed trigger has a reach, not ${String(on)}`,
      })
    } else if (!isFiniteNumber(raw.within) || (raw.within as number) <= 0) {
      problems.push({ at: `${at}.within`, message: 'must be a positive number of cells' })
    } else {
      reach = raw.within as number
    }
  }

  const verbs: Verb[] = []
  if (!Array.isArray(raw.do) || raw.do.length === 0) {
    // A trigger with nothing to do is a trigger somebody meant to finish.
    problems.push({ at: `${at}.do`, message: 'needs at least one verb' })
  } else {
    raw.do.forEach((entry, i) => {
      const verb = readVerb(entry, `${at}.do[${i}]`, problems)
      if (verb) verbs.push(verb)
    })
  }

  if (problems.length !== before) return null
  return {
    on: on as TriggerEvent,
    ...(by ? { by } : {}),
    ...(when ? { when } : {}),
    ...(key ? { key } : {}),
    ...(event ? { event } : {}),
    ...(reach !== undefined ? { within: reach } : {}),
    do: verbs,
  }
}

/**
 * Read the flow block, or nothing for a document that describes no run.
 *
 * Undefined rather than a default on failure, unlike `readCamera`: there is no
 * flow a level without one is secretly playing, so the honest fallback for a
 * broken block is *no rounds at all* - and `parseXp` refuses a document with any
 * problem in it, so the value beside a problem is never seen either way.
 */
function readFlow(
  raw: unknown,
  problems: XpProblem[],
  /**
   * Where this block is, so a refusal names the one the author typed.
   *
   * A document with a round per mode and a problem reported against `flow` when
   * it is the battle's is a problem somebody looks for in the wrong half of
   * their file. One parameter, threaded into every message this function
   * produces, rather than a reader per block.
   */
  at = 'flow',
): XpFlow | undefined {
  if (raw === undefined) return undefined
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return undefined
  }

  if (typeof raw.start !== 'string' || raw.start.length === 0) {
    problems.push({ at: `${at}.start`, message: 'names the phase a run opens in' })
  }
  /*
   * Where the round is played, checked for *shape* here and for existence once
   * the whole document is read - the scenes table is parsed after this and a
   * reader that reached forward for it would be a reader whose answer depends
   * on the order of two blocks in a file.
   */
  if (raw.scene !== undefined && (typeof raw.scene !== 'string' || raw.scene.length === 0)) {
    problems.push({ at: `${at}.scene`, message: 'names a scene, by its key in "scenes"' })
  }
  if (!isObject(raw.phases)) {
    problems.push({ at: `${at}.phases`, message: 'not an object' })
    return undefined
  }

  const before = problems.length
  const phases: Record<string, FlowPhase> = {}

  for (const [name, entry] of Object.entries(raw.phases)) {
    const at = `flow.phases.${name}`
    if (!isObject(entry)) {
      problems.push({ at, message: 'not an object' })
      continue
    }

    const phase: FlowPhase = {}

    if (entry.does !== undefined) {
      if (!Array.isArray(entry.does)) {
        problems.push({ at: `${at}.does`, message: 'not a list of verbs' })
      } else {
        const verbs: Verb[] = []
        entry.does.forEach((one, i) => {
          const verb = readVerb(one, `${at}.does[${i}]`, problems)
          if (verb) verbs.push(verb)
        })
        phase.does = verbs
      }
    }

    /**
     * `allow` is read even when empty, and that is the whole of it.
     *
     * An empty list is a phase saying *nobody acts here*, which is a real and
     * useful thing to say - so it cannot be normalised to absent, which means
     * the opposite. The same distinction `readData` keeps between a block that
     * is missing and one that is `{}`.
     */
    if (entry.allow !== undefined) {
      if (!Array.isArray(entry.allow) || entry.allow.some((one) => typeof one !== 'string')) {
        problems.push({ at: `${at}.allow`, message: 'names bindings from player.keys' })
      } else {
        phase.allow = entry.allow as string[]
      }
    }

    /**
     * The line this phase draws over the game, in the author's own words.
     *
     * Trimmed and dropped when empty, because a phase carrying `""` and a phase
     * carrying nothing are the same phase and should be the same document -
     * unlike `allow`, where empty says something absent does not.
     */
    if (entry.says !== undefined) {
      if (typeof entry.says !== 'string') {
        problems.push({ at: `${at}.says`, message: 'a phase says one line, as text' })
      } else if (entry.says.trim().length > MAX_SAYS) {
        problems.push({
          at: `${at}.says`,
          message: `too long — ${MAX_SAYS} characters at most, and it is drawn over a running game`,
        })
      } else if (entry.says.trim().length > 0) {
        phase.says = entry.says.trim()
      }
    }

    /**
     * `'turn'` is the whole vocabulary, and anything else is refused rather
     * than dropped: a phase that meant to be turn-scoped and silently was not
     * is four live buttons and one working one, which is the failure the
     * field exists to end.
     */
    if (entry.who !== undefined) {
      if (entry.who !== 'turn') {
        problems.push({ at: `${at}.who`, message: `only "turn" - a phase belongs to the player who is up, or to everybody` })
      } else {
        phase.who = 'turn'
      }
    }

    if (entry.next !== undefined) {
      if (!Array.isArray(entry.next)) {
        problems.push({ at: `${at}.next`, message: 'not a list of steps' })
      } else {
        const steps: FlowStep[] = []
        entry.next.forEach((one, i) => {
          const where = `${at}.next[${i}]`
          if (!isObject(one)) {
            problems.push({ at: where, message: 'not an object' })
            return
          }
          if (typeof one.go !== 'string' || one.go.length === 0) {
            problems.push({ at: `${where}.go`, message: 'names the phase this goes to' })
            return
          }
          const step: FlowStep = { go: one.go }
          const when = readCondition(one.when, `${where}.when`, problems)
          if (when) step.when = when
          if (one.on !== undefined) {
            if (typeof one.on !== 'string' || one.on.length === 0) {
              problems.push({ at: `${where}.on`, message: 'names an event a rule emits' })
            } else {
              step.on = one.on
            }
          }
          if (one.after !== undefined) {
            if (!isFiniteNumber(one.after)) {
              problems.push({ at: `${where}.after`, message: 'not a number' })
            } else {
              step.after = one.after
            }
          }
          steps.push(step)
        })
        phase.next = steps
      }
    }

    phases[name] = phase
  }

  if (problems.length !== before) return undefined

  /**
   * When this run is won, read with the same function a step's `when` is.
   *
   * One reader, so an author who can write a transition can write an ending -
   * and so `@world.` and `of: 'world'` mean here exactly what they mean four
   * lines up. A second condition parser would be a second place for the two to
   * drift.
   */
  const wins = readCondition(raw.wins, `${at}.wins`, problems)

  /**
   * How many times the round is played. Read as a number and left to
   * `flowProblems` to judge, which is where the "two or more" and the cap
   * live - one place that says what a round count may be, rather than a rule
   * here and the same rule again there.
   */
  let rounds: number | undefined
  if (raw.rounds !== undefined) {
    if (!isFiniteNumber(raw.rounds)) {
      problems.push({ at: `${at}.rounds`, message: 'not a number' })
    } else {
      rounds = raw.rounds
    }
  }

  const flow: XpFlow = {
    start: typeof raw.start === 'string' ? raw.start : '',
    phases,
    ...(typeof raw.scene === 'string' && raw.scene.length > 0 ? { scene: raw.scene } : {}),
    ...(rounds !== undefined ? { rounds } : {}),
    // Omitted when absent, like every other optional block: a flow that never
    // ends round-trips through the editor without growing a field.
    ...(wins ? { wins } : {}),
  }
  for (const reason of flowProblems(flow)) problems.push({ at, message: reason })
  return problems.length === before ? flow : undefined
}

/** Read one blueprint, or say what is wrong with it. */
function readBlueprint(raw: unknown, at: string, problems: XpProblem[]): Blueprint | null {
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return null
  }

  const before = problems.length

  const model = raw.model
  if (typeof model !== 'string') {
    problems.push({ at: `${at}.model`, message: 'missing' })
  } else if (!isKnownModel(model)) {
    problems.push({ at: `${at}.model`, message: `not a model we ship: ${model}` })
  }

  let draw: boolean | undefined
  if (raw.draw !== undefined) {
    if (typeof raw.draw !== 'boolean') {
      problems.push({ at: `${at}.draw`, message: 'must be true or false' })
    } else if (raw.draw === false) {
      draw = false
    }
    // `true` is deliberately dropped rather than stored. It is the default, and
    // keeping it would mean a document that says so round-trips differently
    // from the identical one that stays quiet - the same trade `isDefaultRules`
    // makes for a freestyle rules block.
  }

  /**
   * Whether a hurt one shows a bar. Same shape as `draw` above, and the `true`
   * is dropped for the same reason: it is the default, and storing it would make
   * a document that says so round-trip differently from the identical one that
   * stays quiet.
   */
  let bar: boolean | undefined
  if (raw.bar !== undefined) {
    if (typeof raw.bar !== 'boolean') {
      problems.push({ at: `${at}.bar`, message: 'must be true or false' })
    } else if (raw.bar === false) {
      bar = false
    }
  }

  let collider: ColliderSpec = 'auto'
  if (raw.collider !== undefined) {
    if (raw.collider === 'auto' || raw.collider === 'none') {
      collider = raw.collider
    } else if (isObject(raw.collider)) {
      const box = raw.collider
      const sides = ['w', 'h', 'd'] as const
      if (sides.every((k) => isFiniteNumber(box[k]) && (box[k] as number) > 0)) {
        collider = { w: box.w as number, h: box.h as number, d: box.d as number }
      } else {
        problems.push({ at: `${at}.collider`, message: 'needs positive w, h and d' })
      }
    } else {
      problems.push({ at: `${at}.collider`, message: 'must be "auto", "none", or a box' })
    }
  }

  const tags: string[] = []
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags)) {
      problems.push({ at: `${at}.tags`, message: 'not a list' })
    } else {
      raw.tags.forEach((tag, i) => {
        if (typeof tag !== 'string' || tag.length === 0) {
          problems.push({ at: `${at}.tags[${i}]`, message: 'not a name' })
          return
        }
        tags.push(tag)
      })
    }
  }

  const props = readProps(raw.props, `${at}.props`, problems)

  const sockets: Record<string, { x: number; y: number; z: number }> = {}
  if (raw.sockets !== undefined) {
    if (!isObject(raw.sockets)) {
      problems.push({ at: `${at}.sockets`, message: 'not an object' })
    } else {
      for (const [name, offset] of Object.entries(raw.sockets)) {
        if (!isObject(offset)) {
          problems.push({ at: `${at}.sockets.${name}`, message: 'not an offset' })
          continue
        }
        const read = (axis: 'x' | 'y' | 'z') => (offset[axis] === undefined ? 0 : offset[axis])
        if (!(['x', 'y', 'z'] as const).every((axis) => isFiniteNumber(read(axis)))) {
          problems.push({ at: `${at}.sockets.${name}`, message: 'x, y and z must be numbers' })
          continue
        }
        sockets[name] = {
          x: read('x') as number,
          y: read('y') as number,
          z: read('z') as number,
        }
      }
    }
  }

  const triggers: Trigger[] = []
  if (raw.triggers !== undefined) {
    if (!Array.isArray(raw.triggers)) {
      problems.push({ at: `${at}.triggers`, message: 'not a list' })
    } else {
      raw.triggers.forEach((entry, i) => {
        const trigger = readTrigger(entry, `${at}.triggers[${i}]`, problems)
        if (trigger) triggers.push(trigger)
      })
    }
  }

  /**
   * The extra models this thing is made of, and the tree they hang in.
   *
   * Checked here rather than trusted, on the same terms as everything else: a
   * part's model ends up in a `fetch`, a parent that does not resolve is a part
   * silently left at the origin, and a cycle is a resolution that only stops
   * because of a depth guard. All three are documents somebody hand-wrote, so
   * all three get a sentence rather than a surprise.
   */
  const parts: Part[] = []
  if (raw.parts !== undefined) {
    if (!Array.isArray(raw.parts)) {
      problems.push({ at: `${at}.parts`, message: 'not a list' })
    } else {
      const named = new Set<string>()
      raw.parts.forEach((entry, i) => {
        const where = `${at}.parts[${i}]`
        if (!isObject(entry)) {
          problems.push({ at: where, message: 'not an object' })
          return
        }

        if (typeof entry.model !== 'string') {
          problems.push({ at: `${where}.model`, message: 'missing' })
          return
        }
        if (!isKnownModel(entry.model)) {
          problems.push({ at: `${where}.model`, message: `not a model we ship: ${entry.model}` })
          return
        }

        let name: string | undefined
        if (entry.name !== undefined) {
          if (typeof entry.name !== 'string' || !PART_NAME.test(entry.name)) {
            problems.push({ at: `${where}.name`, message: 'letters, digits, dash and underscore only' })
          } else if (named.has(entry.name)) {
            // Two answers to one name is a coin toss inside a resolution
            // nobody can see happening.
            problems.push({ at: `${where}.name`, message: `already a part called "${entry.name}"` })
          } else {
            named.add(entry.name)
            name = entry.name
          }
        }

        const numbers = ['x', 'y', 'z'] as const
        for (const axis of numbers) {
          if (entry[axis] !== undefined && !isFiniteNumber(entry[axis])) {
            problems.push({ at: `${where}.${axis}`, message: 'not a number' })
          }
        }
        const rotation = entry.rotation === undefined ? 0 : entry.rotation
        const scale = entry.scale === undefined ? 1 : entry.scale
        if (!isFiniteNumber(rotation)) {
          problems.push({ at: `${where}.rotation`, message: 'not a number' })
        }
        if (!isFiniteNumber(scale) || (scale as number) <= 0) {
          problems.push({ at: `${where}.scale`, message: 'must be a positive number' })
        }

        let parent: string | undefined
        if (entry.parent !== undefined) {
          if (typeof entry.parent !== 'string') {
            problems.push({ at: `${where}.parent`, message: 'must be the name of a part' })
          } else {
            parent = entry.parent
          }
        }

        let socket: string | undefined
        if (entry.socket !== undefined) {
          if (typeof entry.socket !== 'string') {
            problems.push({ at: `${where}.socket`, message: 'must be a socket name' })
          } else if (parent === undefined) {
            problems.push({ at: `${where}.socket`, message: 'needs a parent to hang from' })
          } else {
            socket = entry.socket
          }
        }

        const sockets: Record<string, { x: number; y: number; z: number }> = {}
        if (entry.sockets !== undefined) {
          if (!isObject(entry.sockets)) {
            problems.push({ at: `${where}.sockets`, message: 'not an object' })
          } else {
            for (const [socketName, offset] of Object.entries(entry.sockets)) {
              if (!isObject(offset)) {
                problems.push({ at: `${where}.sockets.${socketName}`, message: 'not an offset' })
                continue
              }
              const read = (axis: 'x' | 'y' | 'z') => (offset[axis] === undefined ? 0 : offset[axis])
              if (!(['x', 'y', 'z'] as const).every((axis) => isFiniteNumber(read(axis)))) {
                problems.push({
                  at: `${where}.sockets.${socketName}`,
                  message: 'x, y and z must be numbers',
                })
                continue
              }
              sockets[socketName] = {
                x: read('x') as number,
                y: read('y') as number,
                z: read('z') as number,
              }
            }
          }
        }

        parts.push({
          model: entry.model,
          ...(name ? { name } : {}),
          ...(parent ? { parent } : {}),
          ...(socket ? { socket } : {}),
          x: isFiniteNumber(entry.x) ? (entry.x as number) : 0,
          y: isFiniteNumber(entry.y) ? (entry.y as number) : 0,
          z: isFiniteNumber(entry.z) ? (entry.z as number) : 0,
          rotation: isFiniteNumber(rotation) ? (rotation as number) : 0,
          scale: isFiniteNumber(scale) && (scale as number) > 0 ? (scale as number) : 1,
          ...(Object.keys(sockets).length > 0 ? { sockets } : {}),
        })
      })

      /**
       * A parent that resolves, and a tree that ends.
       *
       * Checked after the list is built rather than per entry, because a part
       * may name one written below it - insisting on document order would make
       * the order of a JSON array meaningful, which is the rule everybody trips
       * over. Same reason `spawnEntities` does names first.
       */
      const byName = new Map(parts.filter((part) => part.name).map((part) => [part.name!, part]))
      parts.forEach((part, i) => {
        if (!part.parent) return
        if (!byName.has(part.parent)) {
          problems.push({
            at: `${at}.parts[${i}].parent`,
            message: `no part called "${part.parent}"`,
          })
          return
        }
        let link: Part | undefined = byName.get(part.parent)
        let depth = 0
        while (link && depth++ < 16) {
          if (link === part) {
            problems.push({ at: `${at}.parts[${i}].parent`, message: 'hangs from itself' })
            return
          }
          link = link.parent ? byName.get(link.parent) : undefined
        }
        if (depth >= 16) {
          problems.push({ at: `${at}.parts[${i}].parent`, message: 'nested too deeply' })
        }
      })
    }
  }

  let script: string | undefined
  if (raw.script !== undefined) {
    if (typeof raw.script !== 'string' || !SCRIPT_NAME.test(raw.script)) {
      problems.push({ at: `${at}.script`, message: 'must be the name of a script' })
    } else {
      script = raw.script
    }
  }

  let animator: string | undefined
  if (raw.animator !== undefined) {
    // The name only. Whether a graph by that name exists is checked once the
    // whole document has been read, beside the same check for `script` - a
    // blueprint cannot see the block it points into.
    if (typeof raw.animator !== 'string' || !ANIMATION_NAME.test(raw.animator)) {
      problems.push({ at: `${at}.animator`, message: 'must be the name of an animation' })
    } else {
      animator = raw.animator
    }
  }

  let pose: string | undefined
  if (raw.pose !== undefined) {
    // Shape only - which clips a host can actually play is the host's fact.
    // See the field's own note in ./blueprints.
    if (typeof raw.pose !== 'string' || !CLIP_NAME.test(raw.pose)) {
      problems.push({ at: `${at}.pose`, message: 'must be the name of an animation clip' })
    } else {
      pose = raw.pose
    }
  }

  /**
   * What it is made of, when it is not made of its own model.
   *
   * Named rather than free-form, so a typo is an error rather than a blueprint
   * that quietly wears its own glTF - the same reason an unknown verb op is
   * named. `own` is accepted and dropped: it is what absence already means, and
   * refusing it would make "put it back" unsayable in a document.
   */
  let material: XpMaterial | undefined
  if (raw.material !== undefined) {
    if (!isMaterial(raw.material)) {
      problems.push({ at: `${at}.material`, message: `must be one of ${MATERIALS.join(', ')}` })
    } else if (raw.material !== 'own') {
      material = raw.material
    }
  }

  const light = readLight(raw.light, `${at}.light`, problems)
  const body = readBody(raw.body, `${at}.body`, problems)
  const spin = readSpin(raw.spin, `${at}.spin`, problems)
  const motions = readMotions(raw.motions, `${at}.motions`, problems)

  if (problems.length !== before) return null
  return {
    model: model as string,
    ...(draw === false ? { draw } : {}),
    ...(bar === false ? { bar } : {}),
    collider,
    ...(body ? { body } : {}),
    tags,
    props,
    sockets,
    triggers,
    ...(parts.length > 0 ? { parts } : {}),
    ...(script ? { script } : {}),
    ...(animator ? { animator } : {}),
    ...(pose ? { pose } : {}),
    ...(spin ? { spin } : {}),
    ...(motions ? { motions } : {}),
    ...(light ? { light } : {}),
    ...(material ? { material } : {}),
  }
}

/**
 * The named things this blueprint can be told to do to its own parts.
 *
 * Node names are checked for *shape* and not against the model, for `readSpin`'s
 * reason word for word: which nodes a model has is a fact about its `.glb` and
 * the editor's picker is what only ever offers one that exists. Everything else
 * here is refused, because everything else here is a number or one of a fixed
 * list, and a motion that silently does nothing is the failure this whole area
 * keeps producing.
 */
function readMotions(
  raw: unknown,
  at: string,
  problems: XpProblem[],
): Blueprint['motions'] | undefined {
  if (raw === undefined) return undefined
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return undefined
  }

  const names = Object.keys(raw)
  if (names.length > MAX_MOTIONS) {
    problems.push({ at, message: `${names.length} motions, over the ${MAX_MOTIONS} limit` })
    return undefined
  }

  const motions: Record<string, Motion> = {}
  for (const [name, entry] of Object.entries(raw)) {
    if (!MOTION_NAME.test(name)) {
      problems.push({
        at: `${at}.${name}`,
        message: `letters, digits, dash and underscore, up to ${MAX_MOTION_NAME}`,
      })
      continue
    }
    if (!isObject(entry)) {
      problems.push({ at: `${at}.${name}`, message: 'not an object' })
      continue
    }
    if (entry.loop !== undefined && typeof entry.loop !== 'boolean') {
      problems.push({ at: `${at}.${name}.loop`, message: 'must be true or false' })
      continue
    }
    /**
     * A motion with no steps is refused rather than read as "does nothing".
     *
     * The same rule `states` has in an animation graph: a graph with no states
     * is not a graph. `play` on an empty motion would be a button that reports
     * success and moves nothing, which is exactly the silent no-op the closed
     * `kind` list above exists to make impossible.
     */
    if (!Array.isArray(entry.steps) || entry.steps.length === 0) {
      problems.push({ at: `${at}.${name}.steps`, message: 'a motion is its steps - at least one' })
      continue
    }
    if (entry.steps.length > MAX_MOTION_STEPS) {
      problems.push({
        at: `${at}.${name}.steps`,
        message: `${entry.steps.length} steps, over the ${MAX_MOTION_STEPS} limit`,
      })
      continue
    }

    const steps: MotionStep[] = []
    let bad = false
    entry.steps.forEach((row, index) => {
      const step = readMotionStep(row, `${at}.${name}.steps[${index}]`, problems)
      if (step) steps.push(step)
      else bad = true
    })
    if (bad) continue

    motions[name] = { steps, ...(entry.loop === true ? { loop: true } : {}) }
  }

  return Object.keys(motions).length > 0 ? motions : undefined
}

/** One step of one motion. */
function readMotionStep(raw: unknown, at: string, problems: XpProblem[]): MotionStep | null {
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return null
  }

  const before = problems.length

  if (!MOTION_KINDS.includes(raw.kind as MotionKind)) {
    problems.push({ at: `${at}.kind`, message: `must be one of ${MOTION_KINDS.join(', ')}` })
  }
  if (raw.axis !== 'x' && raw.axis !== 'y' && raw.axis !== 'z') {
    problems.push({ at: `${at}.axis`, message: 'must be "x", "y" or "z"' })
  }
  if (typeof raw.amount !== 'number' || !Number.isFinite(raw.amount) || Math.abs(raw.amount) > MAX_MOTION_RATE) {
    problems.push({
      at: `${at}.amount`,
      message: `degrees a second for a spin, degrees of travel otherwise - up to ${MAX_MOTION_RATE}`,
    })
  }
  /**
   * Zero seconds is refused, and not because it divides by anything - it does
   * not, `angleAt` guards that. A step with no length is a step nobody can see
   * and a place in a sequence that swallows whatever comes after it in the
   * editor's timeline. If the intent is "instantly", that is a very short step.
   */
  if (
    typeof raw.seconds !== 'number' ||
    !Number.isFinite(raw.seconds) ||
    raw.seconds <= 0 ||
    raw.seconds > MAX_MOTION_SECONDS
  ) {
    problems.push({
      at: `${at}.seconds`,
      message: `how long this step takes, over 0 and up to ${MAX_MOTION_SECONDS}`,
    })
  }
  if (raw.node !== undefined && (typeof raw.node !== 'string' || raw.node.length === 0)) {
    problems.push({ at: `${at}.node`, message: 'must be the name of a node, or left out for a pause' })
  }
  if (raw.times !== undefined) {
    /**
     * Refused on the two kinds that have no there-and-back to count, rather
     * than ignored.
     *
     * A number that does nothing is a number somebody will tune for an hour -
     * the same argument `readTrigger` makes about a `key` on an `enter`, and
     * the same one `cameraProblems` makes about side-only fields on a follow
     * camera.
     */
    if (raw.kind === 'spin' || raw.kind === 'turn') {
      problems.push({
        at: `${at}.times`,
        message: `a ${String(raw.kind)} has no there-and-back to count - only a swing or a shake does`,
      })
    } else if (typeof raw.times !== 'number' || !Number.isInteger(raw.times) || raw.times < 1 || raw.times > 60) {
      problems.push({ at: `${at}.times`, message: 'a whole number of trips, 1 to 60' })
    }
  }

  if (problems.length > before) return null

  return {
    kind: raw.kind as MotionKind,
    axis: raw.axis as MotionAxis,
    amount: raw.amount as number,
    seconds: raw.seconds as number,
    ...(typeof raw.node === 'string' ? { node: raw.node } : {}),
    ...(typeof raw.times === 'number' ? { times: raw.times } : {}),
  }
}

/**
 * A node inside the blueprint's own model, or nothing.
 *
 * Shape only, same reason `pose` is: which nodes a model actually has is a
 * fact about its `.glb`, checked in as `catalogue.generated.ts`'s `nodes`
 * list, not something this parser reads a file to confirm. A name that names
 * nothing turns nothing, silently, the same way a `pose` naming a clip the
 * host never loaded leaves a body in its last one - and the editor's picker
 * is what only ever offers a name that exists.
 */
/**
 * The physics block, or what is wrong with it.
 *
 * Bounded on every field, and the bounds are the argument for the parser doing
 * this at all: a body is a number that gets multiplied by itself sixty times a
 * second, so `bounce: 1.4` is not a bouncier ball, it is a ball that climbs its
 * own bounce until it leaves the level, and `mass: 0` is a divide by zero that
 * sends a crate to infinity on the first shove. Both arrive as typos far more
 * often than as designs, and both are invisible in the file - the failure is
 * something flying away in play, which is the exact class of bug the rest of
 * this parser exists to turn into a line with a path on it.
 *
 * `{}` is legal and is the point: it means "this falls", with every default
 * from `BODY_DEFAULTS`. Nothing is written back that was not said, so a
 * blueprint that only asked to fall round-trips as `body: {}` rather than
 * growing six numbers it never mentioned.
 */
function readBody(raw: unknown, at: string, problems: XpProblem[]): BodySpec | undefined {
  if (raw === undefined) return undefined
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return undefined
  }

  const before = problems.length
  const body: {
    gravity?: number
    bounce?: number
    drag?: number
    friction?: number
    mass?: number
    roll?: number
  } = {}

  /**
   * The bounds come from `BODY_LIMITS` rather than being written again here.
   *
   * The editor's number fields and `setBlueprint` read the same table, so a
   * bound is one number in three places rather than three numbers that agree
   * until somebody changes one.
   */
  for (const field of BODY_FIELDS) {
    const value = raw[field]
    if (value === undefined) continue
    if (!isFiniteNumber(value)) {
      problems.push({ at: `${at}.${field}`, message: 'must be a number' })
      continue
    }
    const { min, max } = BODY_LIMITS[field]
    if (value < min || value > max) {
      problems.push({ at: `${at}.${field}`, message: `must be between ${min} and ${max}` })
      continue
    }
    body[field] = value
  }

  if (problems.length !== before) return undefined
  return body
}

function readSpin(
  raw: unknown,
  at: string,
  problems: XpProblem[],
): Blueprint['spin'] | undefined {
  if (raw === undefined) return undefined
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return undefined
  }

  const before = problems.length

  if (typeof raw.node !== 'string' || raw.node.length === 0) {
    problems.push({ at: `${at}.node`, message: 'must be the name of a node' })
  }
  if (raw.axis !== 'x' && raw.axis !== 'y' && raw.axis !== 'z') {
    problems.push({ at: `${at}.axis`, message: 'must be "x", "y" or "z"' })
  }
  if (typeof raw.prop !== 'string' || raw.prop.length === 0) {
    problems.push({ at: `${at}.prop`, message: 'must be the name of a property' })
  }

  if (problems.length !== before) return undefined
  return { node: raw.node as string, axis: raw.axis as 'x' | 'y' | 'z', prop: raw.prop as string }
}

/**
 * The brightest a lamp may be, and the furthest it may reach.
 *
 * Bounded because both ends are typos rather than designs, and because the
 * person who made one will be looking at the *result* rather than at the field
 * they typed into: a four-digit intensity is a white screen, and a range of a
 * thousand cells is every light in the level reaching every corner of it, which
 * costs a shader that grows with the number of lamps.
 *
 * `MAX_LIGHTS` is the count rather than the size, and it is the one that
 * actually bites: three.js compiles a shader per light count and the fragment
 * cost is linear in it, so forty torches is a level that runs at nine frames a
 * second on the machine that authored it and not at all on a phone.
 */
/**
 * A working white lamp, which is what `"light": {}` means.
 *
 * Exported because the editor's *on* switch writes exactly this: the defaults
 * would otherwise live here and in a checkbox handler, and the two would drift
 * the first time somebody decided a torch was too bright.
 */
export const DEFAULT_LIGHT: Light = {
  colour: 0xffffff,
  intensity: 12,
  range: 14,
  kind: 'point',
  angle: 30,
}

export const MAX_LIGHT_INTENSITY = 200
export const MAX_LIGHT_RANGE = 200
export const MAX_LIGHTS = 8
/**
 * A cone's widest legal half-angle, short of 90.
 *
 * 90 is a hemisphere rather than a cone - the tangent the renderer projects it
 * with runs away at exactly that angle - so the ceiling sits one short of it
 * for the same reason `player.jump`'s does: the number that breaks something
 * should be refused rather than handed to the thing it breaks.
 */
export const MAX_LIGHT_ANGLE = 89

/**
 * A lamp on a blueprint, or nothing.
 *
 * Every field optional with a working default, because the useful thing to type
 * is `"light": {}` — "this glows" — and then to adjust it. A block that
 * demanded three numbers before it did anything would be three numbers guessed
 * before anybody had seen the first version.
 */
function readLight(raw: unknown, at: string, problems: XpProblem[]): Light | undefined {
  if (raw === undefined) return undefined
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return undefined
  }

  const number = (key: string, fallback: number, max: number): number => {
    const value = raw[key]
    if (value === undefined) return fallback
    if (!isFiniteNumber(value) || value < 0 || value > max) {
      problems.push({ at: `${at}.${key}`, message: `must be a number between 0 and ${max}` })
      return fallback
    }
    return value
  }

  /**
   * `0xRRGGBB`, checked as an integer in range rather than as a shape.
   *
   * A float here is a colour three.js reads by truncating, which is a different
   * colour than the one written - and a negative or oversized one is a wrap
   * rather than a refusal. Both are the kind of wrong that looks like a
   * rendering fault.
   */
  let colour = DEFAULT_LIGHT.colour
  if (raw.colour !== undefined) {
    if (
      !isFiniteNumber(raw.colour) ||
      !Number.isInteger(raw.colour) ||
      (raw.colour as number) < 0 ||
      (raw.colour as number) > 0xffffff
    ) {
      problems.push({ at: `${at}.colour`, message: 'must be a whole colour from 0 to 0xffffff' })
    } else {
      colour = raw.colour as number
    }
  }

  /**
   * `'point'` or `'spot'`. No third value and no metaphor - the reader either
   * knows both words or is about to, from the one line above it in the panel.
   */
  let kind = DEFAULT_LIGHT.kind
  if (raw.kind !== undefined) {
    if (raw.kind !== 'point' && raw.kind !== 'spot') {
      problems.push({ at: `${at}.kind`, message: 'must be "point" or "spot"' })
    } else {
      kind = raw.kind
    }
  }

  return {
    colour,
    intensity: number('intensity', DEFAULT_LIGHT.intensity, MAX_LIGHT_INTENSITY),
    // Zero is "no limit", which is three.js's own meaning for it and the reason
    // the default is a real distance instead: an unbounded lamp in a level made
    // of rooms lights the rooms either side of the one it is in.
    range: number('range', DEFAULT_LIGHT.range, MAX_LIGHT_RANGE),
    kind,
    angle: number('angle', DEFAULT_LIGHT.angle, MAX_LIGHT_ANGLE),
  }
}

/**
 * What an animation clip may be called.
 *
 * The pack's own convention - `Idle_A`, `Ranged_1H_Aiming`, `Sit_Floor_Idle`,
 * and `T-Pose`, which is why the hyphen is in here: the alphabet is the one the
 * shipped clips actually use, checked by a test that reads their names out of
 * the glTFs rather than by a guess at a convention.
 *
 * Narrow enough that a name cannot be a path, which matters for the same reason
 * a model id cannot: these are strings a host looks things up by.
 */
const CLIP_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/

/**
 * What a script may be called.
 *
 * The same alphabet an entity name uses, and for a related reason: a script's
 * name becomes the filename in a stack trace, so anything that needs quoting
 * there is a name that makes an error message harder to read than the error.
 */
const SCRIPT_NAME = /^[a-z0-9][a-z0-9_-]*$/i

/** What a part may be called. The alphabet every other name here uses. */
const PART_NAME = /^[a-z0-9][a-z0-9_-]*$/i

/**
 * Is this something a script may be called?
 *
 * Exported so the editor can refuse a name *while it is being typed* rather
 * than letting somebody finish a script and then discover on save that the
 * parser will not have it.
 */
export const isScriptName = (name: string) => SCRIPT_NAME.test(name)

/**
 * How long one script's source may be.
 *
 * Not about what a person would write - it is about what a generated or pasted
 * document could contain, since every byte is compiled before anything is
 * drawn. It lives here rather than next to the sandbox because the parser must
 * not import the sandbox: `parseXp` is what the editor, the shot script and the
 * document tests all run, and none of them should be loading a wasm
 * interpreter to find out whether a file is well formed.
 */
export const MAX_SCRIPT_LENGTH = 64 * 1024

/**
 * Read a document, or report everything wrong with it.
 *
 * Takes already-parsed JSON rather than a string, so a caller that got it from
 * a fetch, a file or a text area all reach the same function - and so a JSON
 * syntax error is reported by whoever has the line numbers.
 */
export function parseXp(raw: unknown): XpParse {
  const problems: XpProblem[] = []

  if (!isObject(raw)) {
    return { ok: false, problems: [{ at: '', message: 'not an object' }] }
  }

  if (raw.format !== XP_FORMAT) {
    // Fatal on its own: every check below is written against this version's
    // shape, so running them on a document from a different writer produces a
    // page of confident nonsense about fields that were never meant to be here.
    return {
      ok: false,
      problems: [
        {
          at: 'format',
          message: `expected ${JSON.stringify(XP_FORMAT)}, got ${JSON.stringify(raw.format)}`,
        },
      ],
    }
  }

  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : null
  if (!id) problems.push({ at: 'id', message: 'missing' })

  const name = typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : null
  if (!name) problems.push({ at: 'name', message: 'missing' })

  if (raw.blurb !== undefined && typeof raw.blurb !== 'string') {
    problems.push({ at: 'blurb', message: 'not a string' })
  }

  /**
   * Read before anything else that it excuses.
   *
   * A framed document has no world, no packs and no blueprints, so every check
   * that would demand one has to know first. Reporting "missing packs" about a
   * cartridge would be four confident complaints about a file that is exactly
   * right.
   */
  const frame = readFrame(raw.frame, 'frame', problems)
  const framed = frame !== undefined

  /**
   * And its sibling, for the same reason. A sketch document has no world
   * either, so every check below that a framed document is excused from, a
   * sketch document is excused from too - `worldless` is the flag they share.
   */
  const sketch = readSketch(raw.sketch, 'sketch', problems)
  if (framed && sketch !== undefined) {
    // One document, one kind of content. The runtime forks on `frame` first,
    // so a document carrying both would have its sketch silently ignored -
    // refusing it here turns that silence into a sentence.
    problems.push({ at: 'sketch', message: 'a document cannot be both a cartridge and a sketch' })
  }
  const worldless = framed || sketch !== undefined

  // --- packs ----------------------------------------------------------------
  const packs: PackRef[] = []
  if (!Array.isArray(raw.packs)) {
    // A cartridge draws none of our art. Absent is correct rather than tolerated.
    if (!worldless) problems.push({ at: 'packs', message: 'missing' })
  } else {
    raw.packs.forEach((entry, i) => {
      const at = `packs[${i}]`
      if (!isObject(entry) || typeof entry.id !== 'string') {
        problems.push({ at, message: 'needs an id' })
        return
      }
      const pack = PACKS[entry.id]
      if (!pack) {
        problems.push({ at: `${at}.id`, message: `not a pack we ship: ${entry.id}` })
        return
      }
      /**
       * The provenance is filled in from the pack table rather than trusted
       * from the document. A hand-written file should not be able to claim a
       * different author or a different licence for our art - and since these
       * are the fields an export writes into a CREDITS.txt, a document that
       * could lie about them is a document that could ship a false licence.
       */
      packs.push({
        id: entry.id,
        author: pack.author,
        licence: pack.licence,
        source: pack.source,
      })
    })
  }

  // --- world ----------------------------------------------------------------
  /**
   * An empty world for a cartridge, rather than an optional one everywhere.
   *
   * `world` is read by the battle's mode, the store's counts, the editor and a
   * dozen scripts, and making it `XpWorld | undefined` would put a branch in
   * every one of them for a case none of them can do anything about. An empty
   * world is a true statement about a framed document - there is nothing in it -
   * and it is a shape all of them already handle.
   */
  const world =
    worldless && raw.world === undefined
      ? /**
         * Through `readWorld` rather than as a hand-written literal.
         *
         * Only the two lists a world cannot default are supplied; everything
         * else - the floor, the ground, what happens when you fall - comes back
         * as `readWorld`'s own defaults. A full literal here would be a second
         * copy of them, and the way that copy goes stale is a cartridge with a
         * different floor from every other document in the repo.
         */
        readWorld({ placements: [], marks: [] }, 'world', problems)
      : readWorld(raw.world, 'world', problems)

  // --- spawn ----------------------------------------------------------------
  const spawn = readSpawn(raw.spawn, 'spawn', problems)

  // --- scripts --------------------------------------------------------------
  const scripts: Record<string, string> = {}
  if (raw.scripts !== undefined) {
    if (!isObject(raw.scripts)) {
      problems.push({ at: 'scripts', message: 'not an object' })
    } else {
      for (const [name, source] of Object.entries(raw.scripts)) {
        if (!SCRIPT_NAME.test(name)) {
          problems.push({ at: `scripts.${name}`, message: 'letters, digits, dash and underscore only' })
          continue
        }
        if (typeof source !== 'string') {
          problems.push({ at: `scripts.${name}`, message: 'must be the source, as a string' })
          continue
        }
        if (source.length > MAX_SCRIPT_LENGTH) {
          problems.push({
            at: `scripts.${name}`,
            message: `${source.length} characters, over the ${MAX_SCRIPT_LENGTH} limit`,
          })
          continue
        }
        scripts[name] = source
      }
    }
  }

  // --- animation graphs -----------------------------------------------------
  const animations: Record<string, AnimationGraph> = {}
  if (raw.animations !== undefined) {
    if (!isObject(raw.animations)) {
      problems.push({ at: 'animations', message: 'not an object' })
    } else {
      for (const [name, entry] of Object.entries(raw.animations)) {
        if (!ANIMATION_NAME.test(name)) {
          problems.push({
            at: `animations.${name}`,
            message: `letters, digits, dash and underscore, up to ${MAX_ANIMATION_NAME}`,
          })
          continue
        }
        const graph = readAnimationGraph(entry, `animations.${name}`, problems)
        if (graph) animations[name] = graph
      }
    }
  }

  // --- the clips the level carries itself -----------------------------------
  const clips: Record<string, XpClip> = {}
  if (raw.clips !== undefined) {
    if (!isObject(raw.clips)) {
      problems.push({ at: 'clips', message: 'not an object' })
    } else if (Object.keys(raw.clips).length > MAX_XP_CLIPS) {
      problems.push({
        at: 'clips',
        message: `${Object.keys(raw.clips).length} clips, over the ${MAX_XP_CLIPS} limit`,
      })
    } else {
      for (const [name, entry] of Object.entries(raw.clips)) {
        if (name.length === 0 || name.length > MAX_CLIP_NAME) {
          problems.push({ at: `clips.${name}`, message: `a name, up to ${MAX_CLIP_NAME} characters` })
          continue
        }
        const clip = readClip(entry, `clips.${name}`, problems)
        if (clip) clips[name] = clip
      }
    }
  }

  // --- blueprints and entities ----------------------------------------------
  const blueprints: Record<string, Blueprint> = {}
  if (raw.blueprints !== undefined) {
    if (!isObject(raw.blueprints)) {
      problems.push({ at: 'blueprints', message: 'not an object' })
    } else {
      for (const [name, entry] of Object.entries(raw.blueprints)) {
        const blueprint = readBlueprint(entry, `blueprints.${name}`, problems)
        if (blueprint) blueprints[name] = blueprint
      }
    }
  }

  for (const [name, blueprint] of Object.entries(blueprints)) {
    /**
     * A blueprint pointing at a script nobody wrote.
     *
     * Named here rather than shrugged at, because the symptom otherwise is a
     * turret that stands there: everything renders, nothing errors, and the
     * only evidence is that the level is boring. That is the same failure mode
     * a mistyped verb has, and it is refused for the same reason.
     */
    if (blueprint.script !== undefined && !(blueprint.script in scripts)) {
      problems.push({
        at: `blueprints.${name}.script`,
        message: `no script called "${blueprint.script}"`,
      })
    }

    // The same refusal for the same reason: a body pointed at a graph nobody
    // wrote is a body that stands there, and standing there is what a level
    // looks like when it is merely boring.
    if (blueprint.animator !== undefined && !(blueprint.animator in animations)) {
      problems.push({
        at: `blueprints.${name}.animator`,
        message: `no animation called "${blueprint.animator}"`,
      })
    }

    /**
     * The graph and the body have to be the same kind of thing.
     *
     * The refusal `AnimationGraph.rig` exists for, and the one this parser could
     * not make before it did. A graph is a list of clip names and part names,
     * and the two rigs share not one of either: point a fox at a graph written
     * for the dummy and every state names a clip the fox does not have, so the
     * body plays nothing, holds its bind pose, and reports no error anywhere.
     *
     * Both halves are read rather than assumed. `skeletonOf` takes the rig off
     * the *pack* the model came from, and the graph declares its own - so this
     * is a comparison between two facts rather than a guess about either.
     *
     * Silent when either side has nothing to say: a graph with no `rig` is a
     * graph written before the field existed, and a `model` from a pack we do
     * not ship is a remote pack rather than a mistake. Neither is evidence of a
     * mismatch, and refusing on an absence would break documents that are fine.
     */
    const graph = blueprint.animator ? animations[blueprint.animator] : undefined
    const worn = skeletonOf(blueprint.model)
    if (graph?.rig !== undefined && worn !== null && graph.rig !== worn) {
      problems.push({
        at: `blueprints.${name}.animator`,
        message: `"${blueprint.animator}" is written for the ${graph.rig} rig and this body is a ${worn} - none of its clips would play`,
      })
    }

    blueprint.triggers.forEach((trigger, t) => {
      trigger.do.forEach((verb, v) => {
        if (verb.op === 'spawn' && !(verb.blueprint in blueprints)) {
          problems.push({
            at: `blueprints.${name}.triggers[${t}].do[${v}].blueprint`,
            message: `no blueprint called "${verb.blueprint}"`,
          })
        }
        /**
         * The same refusal, and it is available here for the same reason.
         *
         * A motion name belongs to a blueprint in *this document*, unlike a clip
         * name, which belongs to whichever glTFs a host happened to load. So a
         * `play` naming one nobody wrote is exactly as catchable as a `spawn` of
         * a blueprint nobody wrote - and the alternative is a rule that fires,
         * reports nothing, and moves nothing.
         *
         * Any blueprint's motion, not this one's. A rule fires with a `self` and
         * an `other`, and `target` may name either - so which blueprint will be
         * playing it is not knowable here, and insisting it be the rule's own
         * would refuse a working level.
         */
        if (verb.op === 'play' && !Object.values(blueprints).some((one) => verb.motion in (one.motions ?? {}))) {
          problems.push({
            at: `blueprints.${name}.triggers[${t}].do[${v}].motion`,
            message: `nothing in this level has a motion called "${verb.motion}"`,
          })
        }
      })
    })
  }

  // --- scenes ---------------------------------------------------------------
  /**
   * Checked hard, because every value here becomes a `fetch`.
   *
   * A key is a name a `load` verb will carry, so it uses the alphabet ids
   * already use. A value is either one of ours or a URL, and the third case -
   * `http:` - is refused rather than prompted for: no confirmation makes a
   * cleartext fetch on somebody else's network reasonable.
   */
  const scenes: Record<string, XpScene | string> = {}
  if (raw.scenes !== undefined) {
    if (!isObject(raw.scenes)) {
      problems.push({ at: 'scenes', message: 'not an object' })
    } else {
      for (const [name, target] of Object.entries(raw.scenes)) {
        const at = `scenes.${name}`
        if (!isXpId(name)) {
          problems.push({ at, message: 'a scene name is lowercase letters, digits and dashes' })
          continue
        }
        /**
         * The root is `main` and cannot be redefined.
         *
         * A document's own `world` and `spawn` *are* a scene, and this is the
         * name it has had since before it had one. Letting a `scenes.main`
         * shadow it would make the same word mean two places in one file, and
         * the losing one would be the one the author can actually see.
         */
        if (name === MAIN_SCENE) {
          problems.push({
            at,
            message: `"${MAIN_SCENE}" is this document's own world - name the other one`,
          })
          continue
        }
        // A place in this document, rather than a door out of it.
        if (isObject(target)) {
          const before = problems.length
          let sceneName: string | undefined
          if (target.name !== undefined) {
            if (typeof target.name !== 'string') {
              problems.push({ at: `${at}.name`, message: 'must be a string' })
            } else {
              sceneName = target.name
            }
          }
          const sceneWorld = readWorld(target.world, `${at}.world`, problems)
          const sceneSpawn = readSpawn(target.spawn, `${at}.spawn`, problems)
          /**
           * And who is in it, read by the parser the root's are read by.
           *
           * S0 refused this field in words, which was the honest thing to do
           * with a format that could not say it - and the message it printed is
           * the specification of what had to be built: the actors are checked
           * against the *place* now, so a scene has them and a room you walk
           * into has something in it to walk back out through.
           */
          const sceneEntities = readEntities(target.entities, `${at}.entities`, blueprints, problems)
          // A scene is where a movie usually lives: the root is the place people
          // walk around in, and a cutscene is the room next door.
          const sceneTimeline =
            target.timeline === undefined
              ? null
              : readTimeline(target.timeline, `${at}.timeline`, sceneEntities, blueprints, problems)
          if (problems.length !== before) continue
          scenes[name] = {
            ...(sceneName ? { name: sceneName } : {}),
            world: sceneWorld,
            spawn: sceneSpawn,
            entities: sceneEntities,
            ...(sceneTimeline ? { timeline: sceneTimeline } : {}),
          }
          continue
        }
        if (typeof target !== 'string' || target.length === 0) {
          problems.push({ at, message: 'needs a scene, an xp id, or an https:// address' })
          continue
        }
        if (isXpId(target)) {
          scenes[name] = target
          continue
        }
        let url: URL
        try {
          url = new URL(target)
        } catch {
          problems.push({ at, message: `not an xp id or a URL: ${target}` })
          continue
        }
        if (url.protocol !== 'https:') {
          problems.push({
            at,
            message: `must be https:// to be somewhere else, not ${url.protocol}//`,
          })
          continue
        }
        scenes[name] = url.toString()
      }
    }
  }

  // --- enter ----------------------------------------------------------------
  /**
   * Where a player arrives, which is `main` unless the document says otherwise.
   *
   * Checked against what was just parsed rather than trusted, and the two
   * refusals are different mistakes. A name nothing declares is a typo, and the
   * symptom without this is a level that opens somewhere the author did not
   * choose with nothing said about why. A name that resolves to a *link* is a
   * misunderstanding worth correcting in words: `load` may leave for somebody
   * else's document, but a game cannot begin in one - there would be nothing of
   * this document left to be playing.
   */
  let enter = MAIN_SCENE
  if (raw.enter !== undefined) {
    if (typeof raw.enter !== 'string') {
      problems.push({ at: 'enter', message: 'must be the name of a scene' })
    } else if (raw.enter === MAIN_SCENE) {
      enter = MAIN_SCENE
    } else if (!(raw.enter in scenes)) {
      /**
       * Silent when the scene was *written* and failed to parse.
       *
       * A scene with a problem is skipped, so it is missing from `scenes` for
       * two very different reasons - the author never wrote it, or they wrote
       * it and it is broken. Saying "no scene called cellar" underneath the
       * real complaint about `scenes.cellar` sends them looking for a typo in
       * the one name on the page that is spelled correctly.
       */
      if (!isObject(raw.scenes) || !(raw.enter in raw.scenes)) {
        problems.push({ at: 'enter', message: `no scene called "${raw.enter}"` })
      }
    } else if (typeof scenes[raw.enter] === 'string') {
      problems.push({
        at: 'enter',
        message: `"${raw.enter}" is a door to somewhere else; a game starts in a scene of its own`,
      })
    } else {
      enter = raw.enter
    }
  }

  const entities = readEntities(raw.entities, 'entities', blueprints, problems)

  /**
   * And what happens here over time, when the root is a shot.
   *
   * Read after the entities and handed them, because a timeline is a set of
   * overrides on things that exist and this is the only moment both are in the
   * same scope. See `readTimeline`.
   */
  const timeline =
    raw.timeline === undefined ? null : readTimeline(raw.timeline, 'timeline', entities, blueprints, problems)

  // --- the sequences --------------------------------------------------------
  /**
   * Read last of the movie blocks, because it is the only one that needs every
   * other place to have been read first: a take names a shot, and whether a
   * name is a shot is not knowable until `scenes` is done.
   */
  const shots = new Set<string>()
  if (timeline) shots.add(MAIN_SCENE)
  for (const [name, scene] of Object.entries(scenes)) {
    if (typeof scene !== 'string' && scene.timeline) shots.add(name)
  }

  const sequences: Record<string, XpSequence> = {}
  if (raw.sequences !== undefined) {
    if (!isObject(raw.sequences)) {
      problems.push({ at: 'sequences', message: 'not an object' })
    } else if (Object.keys(raw.sequences).length > MAX_SEQUENCES) {
      problems.push({ at: 'sequences', message: `over the ${MAX_SEQUENCES} sequence limit` })
    } else {
      for (const [name, entry] of Object.entries(raw.sequences)) {
        if (!isXpId(name)) {
          problems.push({
            at: `sequences.${name}`,
            message: 'a sequence name is lowercase letters, digits and dashes',
          })
          continue
        }
        const sequence = readSequence(entry, `sequences.${name}`, shots, problems)
        if (sequence) sequences[name] = sequence
      }
    }
  }



  /**
   * Names, parents and sockets, checked against each other - once per place.
   *
   * Per place rather than per document, and that is the decision S1 made rather
   * than a convenience. **A name is resolved where you are standing**: two rooms
   * may each hold a `door` and each have a mark called `gate`, because you are
   * in exactly one of them (docs/xp/scenes.md §1.2), and folding them into one
   * namespace would make a level harder to write the more places it had. The
   * cost is that a `parent` may not reach across rooms, which is the same
   * sentence read from the other side: a thing hanging off something in another
   * room is not hanging off anything you can see.
   */
  checkPlace(entities, world.marks, '', blueprints, problems)
  for (const [name, scene] of Object.entries(scenes)) {
    if (typeof scene === 'string') continue
    checkPlace(scene.entities, scene.world.marks, `scenes.${name}.`, blueprints, problems)
  }

  // --- the player -----------------------------------------------------------
  /**
   * Absent is the common case and it means the built-in dummy.
   *
   * Refusing instead would make every hand-written level open with a paragraph
   * about what a person is, and most of them do not care. What the field is
   * *for* is the level that does: a kart with a seat, a bird, a tank.
   */
  let player: PlayerRole = {}
  if (raw.player === undefined) {
    player = {}
  } else if (!isObject(raw.player)) {
    problems.push({ at: 'player', message: 'not an object' })
  } else {
    const blueprint = raw.player.blueprint
    if (blueprint !== undefined && typeof blueprint !== 'string') {
      problems.push({ at: 'player.blueprint', message: 'must be a blueprint name' })
    } else if (typeof blueprint === 'string' && !(blueprint in blueprints)) {
      problems.push({
        at: 'player.blueprint',
        message: `no blueprint called "${blueprint}"`,
      })
    }

    /**
     * The bound keys, refused for the three things that make one useless.
     *
     * A reserved key is the sharp one: rebinding `KeyW` produces a level you
     * cannot walk in, and the author finds out by playing rather than by
     * reading. A duplicate is the same failure quieter - two actions on one
     * key, one of which silently never happens.
     */
    /**
     * Bounded at both ends, because both ends are typos rather than designs.
     *
     * Zero or less is a player who cannot jump, which no author means and which
     * reads as the key being broken. The ceiling is generous - a twenty-cell
     * leap is a real low-gravity feel and not a mistake - and exists only to
     * catch the slipped decimal that would otherwise put somebody in orbit.
     */
    let jump: number | undefined
    if (raw.player.jump !== undefined) {
      if (!isFiniteNumber(raw.player.jump) || (raw.player.jump as number) <= 0) {
        problems.push({ at: 'player.jump', message: 'must be a positive number of cells' })
      } else if ((raw.player.jump as number) > 20) {
        problems.push({ at: 'player.jump', message: 'at most 20 cells' })
      } else {
        jump = raw.player.jump as number
      }
    }

    /**
     * The rubber world, bounded like the jump above and refused at zero for the
     * same reason a placement's is: absent already says "does not bounce".
     */
    let bounce: number | undefined
    if (raw.player.bounce !== undefined) {
      if (!isFiniteNumber(raw.player.bounce) || (raw.player.bounce as number) <= 0) {
        problems.push({ at: 'player.bounce', message: 'must be a positive number of cells' })
      } else if ((raw.player.bounce as number) > 20) {
        problems.push({ at: 'player.bounce', message: 'at most 20 cells' })
      } else {
        bounce = raw.player.bounce as number
      }
    }

    /**
     * The movement numbers, all read the same way jump is: refused at zero
     * because absent already says "the built-in", and bounded above only to
     * catch the slipped decimal. The ceilings are deliberately generous -
     * a 40-cell sprint is a racing game and a gravity of 100 is a brutal
     * little planet, and neither is a typo this parser should overrule.
     */
    const paces: {
      speed?: number
      sprint?: number
      gravity?: number
      acceleration?: number
      drag?: number
    } = {}
    for (const [field, most, unit] of [
      ['speed', 40, 'cells a second'],
      ['sprint', 40, 'cells a second'],
      ['gravity', 100, 'cells a second squared'],
      ['acceleration', 400, 'cells a second squared'],
      ['drag', 400, 'cells a second squared'],
    ] as const) {
      const value = raw.player[field]
      if (value === undefined) continue
      if (!isFiniteNumber(value) || (value as number) <= 0) {
        problems.push({ at: `player.${field}`, message: `must be a positive number of ${unit}` })
      } else if ((value as number) > most) {
        problems.push({ at: `player.${field}`, message: `at most ${most}` })
      } else {
        paces[field] = value as number
      }
    }

    let keys: PlayerKey[] | undefined
    if (raw.player.keys !== undefined) {
      if (!Array.isArray(raw.player.keys)) {
        problems.push({ at: 'player.keys', message: 'not a list' })
      } else if (raw.player.keys.length > MAX_PLAYER_KEYS) {
        problems.push({
          at: 'player.keys',
          message: `at most ${MAX_PLAYER_KEYS}, and this has ${raw.player.keys.length}`,
        })
      } else {
        const bound: PlayerKey[] = []
        const taken = new Set<string>()
        raw.player.keys.forEach((entry, i) => {
          const at = `player.keys[${i}]`
          if (!isObject(entry)) {
            problems.push({ at, message: 'not an object' })
            return
          }
          if (typeof entry.key !== 'string' || !/^[A-Z][A-Za-z0-9]+$/.test(entry.key)) {
            problems.push({ at: `${at}.key`, message: 'must be a key code, like "KeyE"' })
            return
          }
          const reserved = whyReserved(entry.key)
          if (reserved !== null) {
            problems.push({ at: `${at}.key`, message: `"${entry.key}" ${reserved}` })
            return
          }
          if (taken.has(entry.key)) {
            problems.push({ at: `${at}.key`, message: `"${entry.key}" is bound twice` })
            return
          }
          if (typeof entry.does !== 'string' || entry.does.length === 0) {
            problems.push({ at: `${at}.does`, message: 'needs a name to emit' })
            return
          }
          /**
           * And the wait, which is the one part of a binding that is a number.
           *
           * Refused rather than clamped, like every other bound in this file:
           * a level that asks for a wait this parser will not give should hear
           * about it in the editor rather than play with a number nobody wrote.
           */
          let cooldown: number | undefined
          if (entry.cooldown !== undefined) {
            if (!isFiniteNumber(entry.cooldown) || (entry.cooldown as number) <= 0) {
              problems.push({
                at: `${at}.cooldown`,
                message: 'must be a positive number of seconds',
              })
              return
            }
            if ((entry.cooldown as number) > MAX_KEY_COOLDOWN) {
              problems.push({
                at: `${at}.cooldown`,
                message: `at most ${MAX_KEY_COOLDOWN} seconds`,
              })
              return
            }
            cooldown = entry.cooldown as number
          }
          taken.add(entry.key)
          bound.push({
            key: entry.key,
            does: entry.does,
            // Omitted when absent rather than written as a zero, so a binding
            // with no wait round-trips as the two fields it has always been.
            ...(cooldown !== undefined ? { cooldown } : {}),
          })
        })
        // Omitted when empty, so `"keys": []` round-trips as the absence it is -
        // the trade `scripts` and `parts` already make.
        if (bound.length > 0) keys = bound
      }
    }

    let avatarSocket: string | undefined
    if (raw.player.avatarSocket !== undefined) {
      if (typeof raw.player.avatarSocket !== 'string') {
        problems.push({ at: 'player.avatarSocket', message: 'must be a socket name' })
      } else if (typeof blueprint !== 'string') {
        // The built-in body has no sockets to name, so this is a line that
        // means something and does nothing.
        problems.push({
          at: 'player.avatarSocket',
          message: 'needs a player.blueprint with that socket on it',
        })
      } else if (blueprints[blueprint] && !(raw.player.avatarSocket in blueprints[blueprint].sockets)) {
        problems.push({
          at: 'player.avatarSocket',
          message: `"${blueprint}" has no socket called "${raw.player.avatarSocket}"`,
        })
      } else {
        avatarSocket = raw.player.avatarSocket
      }
    }

    /**
     * What everybody wears when the level has not named a body.
     *
     * Allowed **alongside** `player.blueprint`, and the first version of this
     * refused the pair - wrongly. A blueprint is a model *and* its triggers,
     * its props and its tags, and those are different questions: Peepz Park
     * names a `peep` so that F is a dash and a full strength bar makes it a
     * mega one, and none of that has an opinion about which animal you are. So
     * `wears` replaces the **model** and leaves the behaviour alone.
     *
     * A level that genuinely means "everybody is a kart" simply does not set
     * this, which is the default.
     *
     * `dummy` is accepted and stored as absence, the way `material: "own"` is:
     * it is what nothing already means, and refusing it would make "put it
     * back" unsayable in a document.
     */
    let wears: PlayerLook | undefined
    if (raw.player.wears !== undefined) {
      const said = raw.player.wears
      /**
       * A name, or a model id - and a model id is checked for *shape* rather
       * than against the catalogue.
       *
       * The parser has never known what models exist and must not start: an XP
       * that names a body from a pack this build has not shipped should refuse
       * to draw it, not refuse to open. One slash with something either side is
       * the whole rule, and it is the same rule `blueprint.model` is read by.
       */
      const named =
        typeof said === 'string' && (PLAYER_LOOKS as readonly string[]).includes(said)
      const model =
        typeof said === 'string' && /^[^/\s]+\/[^/\s]+$/.test(said)

      if (!named && !model) {
        problems.push({
          at: 'player.wears',
          message: `must be one of ${PLAYER_LOOKS.join(', ')}, or a model id like "adventurers/Knight"`,
        })
      } else if (said !== 'dummy') {
        wears = said as PlayerLook
      }
    }

    let view: PlayerRole['view']
    if (raw.player.view !== undefined) {
      if (raw.player.view !== 'first' && raw.player.view !== 'third') {
        problems.push({ at: 'player.view', message: 'must be "first" or "third"' })
      } else {
        view = raw.player.view
      }
    }

    /**
     * What the player is holding, checked the same way the avatar's socket is.
     *
     * A weapon naming a blueprint nobody wrote is the mistake worth catching
     * here rather than at the moment somebody pulls the trigger: the symptom
     * otherwise is a gun that is not drawn and does not fire, which reads as a
     * broken runtime rather than as a typo.
     */
    let weapon: PlayerRole['weapon']
    if (raw.player.weapon !== undefined) {
      const held = raw.player.weapon
      if (!isObject(held)) {
        problems.push({ at: 'player.weapon', message: 'not an object' })
      } else if (typeof held.blueprint !== 'string') {
        problems.push({ at: 'player.weapon.blueprint', message: 'missing' })
      } else if (!(held.blueprint in blueprints)) {
        problems.push({
          at: 'player.weapon.blueprint',
          message: `no blueprint called "${held.blueprint}"`,
        })
      } else if (held.socket !== undefined && typeof held.socket !== 'string') {
        problems.push({ at: 'player.weapon.socket', message: 'must be a socket name' })
      } else if (held.socket !== undefined && typeof blueprint !== 'string') {
        // The built-in body has no sockets to name, so this is a line that
        // means something and does nothing.
        problems.push({
          at: 'player.weapon.socket',
          message: 'needs a player.blueprint with that socket on it',
        })
      } else if (
        typeof held.socket === 'string' &&
        typeof blueprint === 'string' &&
        blueprints[blueprint] &&
        !(held.socket in blueprints[blueprint].sockets)
      ) {
        problems.push({
          at: 'player.weapon.socket',
          message: `"${blueprint}" has no socket called "${held.socket}"`,
        })
      } else {
        /**
         * The grip, read one field at a time.
         *
         * Each is optional and each is dropped when it is its default, so a
         * weapon that never needed adjusting round-trips as the two fields it
         * always was. A field that is present and not a finite number is a
         * problem rather than a silent zero: `NaN` in a transform is a model
         * that vanishes, which is the least debuggable failure three.js has.
         */
        const grip: Record<string, number> = {}
        for (const axis of ['x', 'y', 'z', 'pitch', 'yaw', 'roll'] as const) {
          const value = (held as Record<string, unknown>)[axis]
          if (value === undefined) continue
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            problems.push({ at: `player.weapon.${axis}`, message: 'must be a number' })
          } else if (value !== 0) {
            grip[axis] = value
          }
        }
        if (held.scale !== undefined) {
          if (typeof held.scale !== 'number' || !Number.isFinite(held.scale) || held.scale <= 0) {
            problems.push({ at: 'player.weapon.scale', message: 'must be a positive number' })
          } else if (held.scale !== 1) {
            grip.scale = held.scale
          }
        }

        weapon = {
          blueprint: held.blueprint,
          ...(typeof held.socket === 'string' ? { socket: held.socket } : {}),
          ...grip,
        }
      }
    }

    player = {
      ...(jump !== undefined ? { jump } : {}),
      ...(bounce !== undefined ? { bounce } : {}),
      ...paces,
      ...(keys ? { keys } : {}),
      ...(typeof blueprint === 'string' ? { blueprint } : {}),
      ...(avatarSocket ? { avatarSocket } : {}),
      ...(wears ? { wears } : {}),
      ...(view ? { view } : {}),
      ...(weapon ? { weapon } : {}),
    }
  }

  // --- capabilities ---------------------------------------------------------
  /**
   * What the product may do with this XP, and whether the world backs it up.
   *
   * Defaults to `['freeplay']` rather than to nothing: an XP with no
   * capabilities at all is one no flow can ever schedule, which is a level
   * nobody can open. Freeplay is the claim that is never a lie - a world you
   * can be in is a world.
   */
  const capabilities: Capability[] = []
  if (raw.capabilities === undefined) {
    capabilities.push('freeplay')
  } else if (!Array.isArray(raw.capabilities)) {
    problems.push({ at: 'capabilities', message: 'not a list' })
  } else {
    raw.capabilities.forEach((entry, i) => {
      if (typeof entry !== 'string' || !isCapability(entry)) {
        problems.push({
          at: `capabilities[${i}]`,
          message: `not a capability: ${JSON.stringify(entry)}`,
        })
        return
      }
      if (capabilities.includes(entry)) {
        problems.push({ at: `capabilities[${i}]`, message: `listed twice: ${entry}` })
        return
      }
      capabilities.push(entry)
    })
  }

  // --- backend --------------------------------------------------------------
  // What the level asks of its host, as opposed to what the product may do with
  // the level. Absent asks for nothing, which is every document written before
  // this block existed.
  const backend = readBackend(raw.backend, problems)
  const visit = readVisit((raw as { visit?: unknown }).visit, problems)

  // What the level looks like as an object, which is a fact about the document
  // rather than about the world inside it. Absent is plastic.
  const finish = readFinish((raw as { finish?: unknown }).finish, problems)
  const hue = readHue((raw as { hue?: unknown }).hue, problems)

  /**
   * The level's own script, which has to be one of the ones it declares.
   *
   * Checked here rather than left to the engine for the reason every `@name` in
   * this file is: a hub that names a script nobody wrote is a level whose logic
   * silently does not run, and the only evidence is that the game is boring.
   */
  let worldScript: string | undefined
  if (raw.script !== undefined) {
    if (typeof raw.script !== 'string' || !Object.hasOwn(scripts, raw.script)) {
      problems.push({ at: 'script', message: 'must be the name of one of this document\'s scripts' })
    } else {
      worldScript = raw.script
    }
  }

  // --- data -----------------------------------------------------------------
  // What this level keeps. Absent asks for nothing, which is every document
  // written before this block existed. See ./data.
  const data = readData(raw.data, 'data', problems)

  // --- rules ----------------------------------------------------------------
  // Read here rather than with the rest of the document because what it is
  // allowed to say depends on what was just declared above. See ./rules.
  const rules = readRules(raw.rules, problems)
  const camera = readCamera(raw.camera, problems)
  const flow = readFlow(raw.flow, problems)
  /*
   * The per-mode ones, read by the same function and checked by the same rules:
   * a flow is a flow, and two readers would be two chances for one to accept a
   * phase list the other refuses. `at` is the only thing that differs, so a
   * problem names the mode whose round it is about.
   *
   * A key that is not a mode is refused rather than ignored. `flows.lobbies` is
   * a round somebody wrote and nothing will ever play, which is the failure
   * this parser exists to turn into a sentence.
   */
  const flows: Partial<Record<Mode, XpFlow>> = {}
  if (raw.flows !== undefined) {
    if (!isObject(raw.flows)) {
      problems.push({ at: 'flows', message: 'not an object' })
    } else {
      for (const [key, value] of Object.entries(raw.flows)) {
        if (!isMode(key)) {
          problems.push({ at: `flows.${key}`, message: `must be one of ${MODES.join(', ')}` })
          continue
        }
        const one = readFlow(value, problems, `flows.${key}`)
        if (one) flows[key] = one
      }
    }
  }
  // Whether anybody in here may say anything. Absent is both on - see ./talk,
  // where that default is the decision rather than the fallback.

  /**
   * And a round that names a place has to name one this document has.
   *
   * Checked here rather than in `readFlow`, because the scenes table is read
   * after the flows are and a reader that reached forward for it would be a
   * reader whose answer depends on which order two blocks happen to sit in.
   *
   * Silent when the scene was written and failed to parse, for the reason the
   * `enter` check above is: a broken scene is missing from `scenes` for a
   * completely different reason from a misspelt one, and saying both sends
   * somebody looking for a typo in the only name on the page that is right.
   */
  for (const [where, one] of [
    ['flow', flow] as const,
    ...Object.entries(flows).map(([mode, value]) => [`flows.${mode}`, value] as const),
  ]) {
    const wanted = one?.scene
    if (wanted === undefined) continue
    if (isObject(raw.scenes) && !(wanted in raw.scenes)) {
      problems.push({ at: `${where}.scene`, message: `no scene called "${wanted}"` })
    } else if (typeof scenes[wanted] === 'string') {
      problems.push({
        at: `${where}.scene`,
        message: `"${wanted}" is a door to somewhere else; a round is played in a scene of its own`,
      })
    } else if (!isObject(raw.scenes)) {
      problems.push({ at: `${where}.scene`, message: `no scene called "${wanted}"` })
    }
  }

  const talk = readTalk(raw.talk, problems)
  // And what it says in other languages. Absent everywhere - see ./words.
  const words = readWords(raw.words, problems)

  /**
   * Every declared capability, checked against what is actually in the world.
   *
   * The point of the whole idea. A tag nobody verifies is a level that gets
   * picked by the match lobby, loads, starts, and then cannot be scored - and
   * the failure lands at kickoff, in front of everybody, looking like a broken
   * game rather than an unfinished level.
   *
   * Skipped when the world failed to parse: reporting "no red goal" about a
   * world whose placements were all rejected is a second, misleading complaint
   * about the same mistake.
   */
  if (problems.length === 0 && !worldless) {
    /**
     * Not checked for a cartridge, and that is a real gap rather than a
     * shortcut.
     *
     * These checks exist so a level claiming `match` with one spawn is refused
     * before anybody plays it. A framed game's spawns are inside code this
     * package cannot see, so there is nothing here to check against - and a
     * check that cannot be performed is better skipped than faked.
     *
     * What that costs: a cartridge claiming `football` is believed. The claim
     * becomes the framed game's to keep, which is the same bargain
     * `backend.needs` strikes and is why `./frame` says so out loud.
     */
    for (const capability of capabilities) {
      for (const reason of capabilityProblems(capability, world)) {
        problems.push({ at: 'capabilities', message: `claims "${capability}" but ${reason}` })
      }
    }
    /**
     * And the mode, against what the document said it can be used for.
     *
     * Inside the same guard, and after the loop above, so a `football` preset in
     * a world with no goals is reported once - as the missing capability it
     * actually is - rather than twice in two vocabularies.
     */
    for (const reason of rulesProblems(rules, capabilities, world.marks)) {
      problems.push({ at: 'rules', message: reason })
    }

    /**
     * Every field a rule reaches for, against the ones the level declared.
     *
     * The check that makes declaring a model worth doing, and it is possible
     * only because a rule names its key **statically**: `addProp key: 'coin',
     * target: 'world'` is a typo this can see, where the same typo against an
     * entity's own props is a property that springs into existence at zero and
     * a rule that silently never fires.
     *
     * Inside the same guard as the two checks above, and for the same reason: a
     * document whose blueprints did not parse has no rules worth cross-checking,
     * and a second complaint about the same mistake is worse than none.
     */
    const wanted = new Set<string>()
    /**
     * One walk for a condition, because there are now three places one appears
     * and each of them can read the block from either side.
     *
     * `of: 'world'` names the field on the left; a `@world.` value names one on
     * the right. Both are a rule reaching for something the level may not have
     * declared, and the typo they catch is the same typo - so counting only the
     * first would leave `value: "@world.wnated"` as a comparison against a
     * silent zero, which is exactly the shape of failure this check exists for.
     */
    const reads = (when: Condition | undefined) => {
      if (!when) return
      if (when.of === 'world') wanted.add(when.prop)
      if (isDataRef(when.value)) wanted.add(refField(when.value))
    }
    /**
     * A flow reads and writes the same block, and until this it was not counted.
     *
     * Three places in one: a step's `when`, the `wins` condition, and a phase's
     * `does` - which is a verb list, so a `roll` or an `addProp target: 'world'`
     * in it names a field exactly as one in a rule does. A flow left out of this
     * walk would be the one part of a document allowed to misspell a field
     * quietly, which is the opposite of why the walk exists.
     */
    if (flow) {
      reads(flow.wins)
      for (const phase of Object.values(flow.phases)) {
        for (const step of phase.next ?? []) reads(step.when)
        for (const verb of phase.does ?? []) {
          if ((verb.op === 'setProp' || verb.op === 'addProp') && verb.target === 'world') {
            wanted.add(verb.key)
          }
          if (verb.op === 'roll') wanted.add(verb.key)
          if (verb.op === 'advance') wanted.add(verb.by)
        }
      }
    }
    for (const blueprint of Object.values(blueprints)) {
      for (const trigger of blueprint.triggers ?? []) {
        reads(trigger.when)
        for (const verb of trigger.do) {
          if ((verb.op === 'setProp' || verb.op === 'addProp') && verb.target === 'world') {
            wanted.add(verb.key)
          }
          // A roll writes into `data` and names no target, so it is the same
          // question asked without the word `world` in it.
          if (verb.op === 'roll') wanted.add(verb.key)
          // `advance` reads its step count out of the same block.
          if (verb.op === 'advance') wanted.add(verb.by)
        }
      }
    }
    for (const name of undeclared(wanted, data ?? {})) {
      problems.push({
        at: 'data',
        message: `a rule reads or writes "${name}", which this level does not declare`,
      })
    }

    /**
     * And whether every cut a rule plays is one this file has.
     *
     * The asymmetry worth naming, because three other names in a verb are
     * deliberately *not* checked: a clip may be one the host's packs carry, a
     * scene may be written after the door that leads to it, and an xp id is
     * somebody else's file. A **cut is a thing in this document** - there is
     * nowhere else it could come from - so a verb naming one that is not there
     * is a typo, and the symptom without this is a trigger that fires and does
     * nothing, with no error anywhere. That is the failure this editor is worst
     * at showing, which is why it is worth a second walk.
     */
    const cuts = new Set(Object.keys(sequences))
    const playsMissing = (verb: Verb, at: string) => {
      if (verb.op === 'movie' && !cuts.has(verb.sequence)) {
        problems.push({
          at,
          message: `there is no cut called "${verb.sequence}" in this level`,
        })
      }
    }
    if (flow) {
      for (const [name, phase] of Object.entries(flow.phases)) {
        for (const verb of phase.does ?? []) playsMissing(verb, `flow.phases.${name}.does`)
      }
    }
    for (const [name, blueprint] of Object.entries(blueprints)) {
      for (const [index, trigger] of (blueprint.triggers ?? []).entries()) {
        for (const verb of trigger.do) {
          playsMissing(verb, `blueprints.${name}.triggers[${index}].do`)
        }
      }
    }

    /**
     * And whether this run's ending is one that can happen more than once.
     *
     * After the walk above rather than beside it, so a `wins` naming a field
     * nobody declared is reported as the typo it is and not also as a scope
     * mistake - two messages about one mistake is worse than one. See
     * `winsProblems`, where the argument is.
     */
    if (flow) {
      for (const reason of winsProblems(flow, data ?? {})) {
        problems.push({ at: 'flow.wins', message: reason })
      }
    }

    /**
     * A secret or a vote means this level cannot run without an arbiter.
     *
     * docs/xp/server-authority.md §4.2. `missingCapabilities` refuses to start
     * an XP whose `needs` are not met, and that door only works if a document
     * walks through it - both games built against the arbiter had it in `wants`
     * instead, which *degrades*. What `proto-bug` degraded to was a room where
     * nobody is dealt a role and no shot lands on anybody, which is not a
     * lesser game.
     *
     * **Only the three that cannot be faked locally.** A deal is one value per
     * player that no client may compute, `lethal` is a question about somebody
     * else's secret, and a vote is a majority measured on the server against a
     * deadline the server keeps. None has a degraded form; each is either
     * decided somewhere no client can reach or it is not happening.
     *
     * **`roll`, `pass` and `visit` are deliberately not here**, which is the line
     * worth remembering. A dice from this tab's own random is honest for
     * somebody playing alone and dishonest at a table, and `wants` cannot say
     * *fine alone, not fine with company*. Refusing every solo level that rolls
     * would be a worse rule than the one it replaced.
     *
     * `visit` was on this list for an hour, and the level that wants the feature
     * is what took it off: a greenhouse where nobody can raid your shelf is a
     * *lesser* game, and `steal-a-plant` is playable alone today. That is the
     * `roll` case and not the `roles` one - with no arbiter, a deal leaves a
     * hidden-role game where nothing at all can happen, and a visit leaves a
     * level with one button that says no.
     *
     * A refusal rather than a quiet fixup, and it belongs here rather than in
     * `rulesProblems` because it is a fact about two blocks: the editor writes
     * through this parser on every keystroke, so anything accepted there and
     * refused here is a save that silently does nothing. Nothing in the editor
     * sets `rules.roles` today; whatever panel does will need the same rule at
     * the moment it is written.
     */
    /**
     * And the visiting block, against the field it names.
     *
     * Two checks, both because `xp_visit` acts on this with nobody in the room:
     * the field has to be one this level declares, or the function is moving a
     * key that exists nowhere; and it has to be **one row per person**, because
     * taking means one row going down while another goes up.
     *
     * `player` and `shared` are both that. **`space` is not** - it is a single
     * row for the whole space, so there is nobody to take it from - and that is
     * the whole of this check. An earlier version of it refused `shared` as
     * well, on the grounds that it is "a scoreboard", and meeting the level that
     * wants this feature is what corrected it: `steal-a-plant` keeps each
     * player's shelf in `shared` precisely so everybody can see whose shelf has
     * plants on it, which is the only way a visitor knows there is anything to
     * take.
     */
    if (visit) {
      const field = (data ?? {})[visit.take]
      if (!field) {
        problems.push({
          at: 'visit.take',
          message: `a visitor takes "${visit.take}", which this level does not declare`,
        })
      } else if (field.scope === 'space') {
        problems.push({
          at: 'visit.take',
          message: `"${visit.take}" is a space field — one row for everybody, so there is nobody to take it from`,
        })
      }
    }

    const secretive = arbiterReasons(rules, blueprints)
    if (secretive.length > 0 && !(backend?.needs ?? []).includes('arbiter')) {
      problems.push({
        at: 'backend.needs',
        message: `this level ${secretive.join(' and ')}, which no client can decide — it needs "arbiter"`,
      })
    }
  }

  /**
   * The placement budget is the document's, not each room's.
   *
   * `readWorld` caps every world it reads, which is right and is not enough:
   * with scenes, a document's total became that cap times however many rooms
   * somebody writes, and the number's job is to bound *a document* - it is
   * parsed in one go, stored in one row and downloaded as one file, none of
   * which cares that only one room is on screen.
   *
   * Both checks stay. The per-world one fires first and names the room, which
   * is the more useful message when a single place is the problem; this one is
   * the ceiling, and it says which numbers add up to it because "too many
   * placements" in a document with nine rooms is not an actionable sentence.
   */
  {
    const perScene = Object.entries(scenes).flatMap(([name, scene]) =>
      typeof scene === 'string' ? [] : [[name, scene.world.placements.length] as const],
    )
    const total = world.placements.length + perScene.reduce((sum, [, n]) => sum + n, 0)
    if (total > MAX_PLACEMENTS && perScene.length > 0) {
      const rooms = [`main ${world.placements.length}` as string]
        .concat(perScene.map(([name, n]) => `${name} ${n}`))
        .join(', ')
      problems.push({
        at: 'scenes',
        message: `${total} placements across the whole document, over the ${MAX_PLACEMENTS} limit (${rooms})`,
      })
    }
  }

  /**
   * And the actor budget the same way, for a different reason.
   *
   * The placement cap above is about the size of a file. This one is about the
   * size of a *frame*: `MAX_ENTITIES`' own note prices the step and the trigger
   * pass at sixteen players, and that budget is spent by whoever is on screen -
   * so per room is genuinely the right unit for it, and `readEntities` charges
   * it per room.
   *
   * The document-wide one is here anyway, because the other half of what an
   * entity costs is paid before anybody is standing anywhere: it is parsed,
   * stored in one row and downloaded as one file, and nine rooms of a thousand
   * actors is a nine-megabyte document however few of them are drawn at once.
   * Both checks stay, and the per-room one fires first because it names a room.
   */
  {
    const perScene = Object.entries(scenes).flatMap(([name, scene]) =>
      typeof scene === 'string' ? [] : [[name, scene.entities.length] as const],
    )
    const total = entities.length + perScene.reduce((sum, [, n]) => sum + n, 0)
    if (total > MAX_ENTITIES && perScene.length > 0) {
      const rooms = [`main ${entities.length}` as string]
        .concat(perScene.map(([name, n]) => `${name} ${n}`))
        .join(', ')
      problems.push({
        at: 'scenes',
        message: `${total} entities across the whole document, over the ${MAX_ENTITIES} limit (${rooms})`,
      })
    }
  }

  // A model used but never declared is the one problem worth naming precisely,
  // because the symptom otherwise is art that simply does not appear.
  const declared = new Set(packs.map((p) => p.id))
  const used = new Set(
    [
      ...world.placements.map((p) => p.model),
      /**
       * A scene's art counts, and leaving it out was not only a missing check.
       *
       * `packs` is where an export reads the author and the licence from - the
       * provenance is filled in from the pack table precisely so a document
       * cannot lie about it - so a pack used by a scene and declared by nobody
       * is art shipped with no line in the CREDITS.txt. That is a licence
       * claim being wrong, not a lint.
       */
      ...Object.values(scenes).flatMap((scene) =>
        typeof scene === 'string' ? [] : scene.world.placements.map((p) => p.model),
      ),
      ...Object.values(blueprints).map((b) => b.model),
    ].map((model) => model.slice(0, model.indexOf('/'))),
  )
  for (const packId of used) {
    if (!declared.has(packId)) {
      problems.push({
        at: 'packs',
        message: `world uses "${packId}" but the document does not list it`,
      })
    }
  }

  if (problems.length > 0) return { ok: false, problems }

  return {
    ok: true,
    document: {
      format: XP_FORMAT,
      id: id as string,
      name: name as string,
      ...(typeof raw.blurb === 'string' ? { blurb: raw.blurb } : {}),
      // Omitted when the level never said, so a document that has no opinion
      // about its shell does not grow one by being opened and saved.
      ...(finish ? { finish } : {}),
      // Zero is a hue - it is red - so this is a presence check and not a
      // truthiness one. `readHue` already answers undefined for anything the
      // document did not say.
      ...(hue === undefined ? {} : { hue }),
      packs,
      capabilities,
      // Omitted when it asks for nothing, so a level that needs no host of its
      // own does not grow an empty block by being opened and saved.
      ...(backend ? { backend } : {}),
      // And the same again: a level nobody may take anything out of - which is
      // every level - carries no block saying so.
      ...(visit ? { visit } : {}),
      // Same omission, same reason. `readData` already answers undefined for an
      // empty block, so a level that keeps nothing round-trips without one.
      ...(data ? { data } : {}),
      // Absent when the level has no hub, like every other optional block here.
      ...(worldScript ? { script: worldScript } : {}),
      // Omitted when it says nothing its absence does not, so a document that
      // has never declared a mode round-trips through the editor unchanged.
      ...(isDefaultRules(rules) ? {} : { rules }),
      // Same omission, same reason: a document that never asked for a camera
      // does not grow the block when somebody opens and saves it.
      ...(isDefaultCamera(camera) ? {} : { camera }),
      // No default to compare against, unlike the camera: a document either
      // describes a run or it does not, and there is no flow that says the same
      // thing as having none.
      ...(flow ? { flow } : {}),
      ...(Object.keys(flows).length > 0 ? { flows } : {}),
      // And again. A block saying only what absence already says is a block
      // that would appear in every file anybody opened - see `isDefaultTalk`,
      // which names what that costs an author who wrote `true` on purpose.
      ...(isDefaultTalk(talk) ? {} : { talk }),
      // A block with no phrases in it says exactly what having none says, so it
      // is left off rather than written back. Same rule as `talk` above.
      ...(isEmptyWords(words) ? {} : { words }),
      // Present only on a cartridge, which is a handful of documents and no
      // level anybody draws. See ./frame.
      ...(frame ? { frame } : {}),
      // Its sibling, present only on a sketch. See ./sketch.
      ...(sketch ? { sketch } : {}),
      blueprints,
      player,
      entities,
      /**
       * The root, exactly as it was written, and *not* the entry scene.
       *
       * Projecting `scenes[enter]` onto these two would make every existing
       * consumer show the right place for free, and it would be a data loss
       * bug: the editor parses a document and writes it straight back out, so a
       * save would put the entry scene's world where the root's had been and
       * the root's would be gone. `enter` is a name; turning a name into a
       * place is `placeOf`, at the point somebody actually needs one.
       */
      world,
      spawn,
      // Omitted when it is the root, so a document that has never heard of
      // scenes does not grow the field by being opened and saved. Checked
      // against a real file: first-room.xp.json came back with an `enter` its
      // author never wrote, before this line said `main` was silence.
      ...(enter === MAIN_SCENE ? {} : { enter }),
      // Omitted when empty, so a document that has never had a script in it
      // round-trips through the editor without growing an empty block.
      ...(Object.keys(scenes).length > 0 ? { scenes } : {}),
      ...(Object.keys(scripts).length > 0 ? { scripts } : {}),
      ...(Object.keys(animations).length > 0 ? { animations } : {}),
      ...(Object.keys(clips).length > 0 ? { clips } : {}),
      // Omitted when absent, so a level that is somewhere to stand rather than
      // something to watch does not grow a timeline by being opened and saved.
      ...(timeline ? { timeline } : {}),
      ...(Object.keys(sequences).length > 0 ? { sequences } : {}),
    },
  }
}

/**
 * What is in this level that no client may decide, in words.
 *
 * docs/xp/server-authority.md §4.2's list, as a function, because two places ask
 * it and the answer has to be the same in both. `parseXp` asks it to refuse a
 * document that keeps a secret without saying it needs somewhere to keep one;
 * `repairXp` asks it to know whether promoting `arbiter` is a repair or an
 * invention. Two copies of this list is a parser that refuses documents the
 * repair pass would not have fixed, which is the worst of both.
 *
 * Loosely typed on purpose. The parser hands it values it has already read and
 * the repair pass hands it raw JSON it has walked itself, and neither should
 * have to pretend to be the other - what both can honestly promise is the three
 * fields this looks at.
 *
 * Returns phrases rather than flags because the refusal reads them out. An
 * author told "needs arbiter" has to go and find out why; one told *this level
 * deals roles and calls a vote* has already been told.
 */
export function arbiterReasons(
  rules: { roles?: unknown; lethal?: unknown } | null | undefined,
  blueprints: Record<string, { triggers?: readonly { do?: readonly { op?: unknown }[] }[] }>,
): string[] {
  const reasons: string[] = []
  if (rules?.roles) reasons.push('deals roles')
  if (rules?.lethal) reasons.push('gives one role the working gun')
  for (const blueprint of Object.values(blueprints)) {
    const votes = (blueprint.triggers ?? []).some((trigger) =>
      (trigger.do ?? []).some((verb) => verb.op === 'meet'),
    )
    if (votes) {
      reasons.push('calls a vote')
      break
    }
  }
  return reasons
}

/**
 * Which scene a player arrives in, filled in for the documents that say nothing.
 *
 * The same shape as `rulesOf` and `cameraOf`, and there for the same reason:
 * the field is absent in every document written before it existed, and a reader
 * that tested it directly would be a reader with a `?? 'main'` in it, which is
 * the default living in two places.
 */
export function enterOf(xp: XpDocument): string {
  return xp.enter ?? MAIN_SCENE
}

/**
 * The place a scene name refers to, or null if it does not refer to one.
 *
 * The one function that knows `main` is the root, so that nothing else has to.
 * Null covers both ways a name can fail to be a place - it names nothing, or it
 * names a door to another document - because a caller wanting to *stand*
 * somewhere has the same problem either way. A caller that needs to tell them
 * apart is a caller following a `load`, and that reads `scenes` directly.
 */
export function placeOf(
  xp: XpDocument,
  name: string,
): {
  world: XpWorld
  spawn: XpSpawn
  entities: EntitySpec[]
  /** What happens here over time, when this place is a shot. See `@kxb/xp/movie`. */
  timeline?: XpTimeline
} | null {
  if (name === MAIN_SCENE) {
    /*
     * The root's timeline comes with it, and it did not.
     *
     * The four members of a place are `world`, `spawn`, `entities` and - since
     * movies - `timeline`, and this function assembled the first three by hand
     * for `main` while handing a named scene back whole. So `placeOf(xp, 'main')`
     * answered "this place is not a shot" about a document whose root *was* one,
     * and every caller that trusted it drew a still level where a film should
     * have played. A named scene never had the bug, which is the worst version:
     * it worked everywhere somebody tested it except the default.
     */
    return {
      world: xp.world,
      spawn: xp.spawn,
      entities: xp.entities,
      ...(xp.timeline ? { timeline: xp.timeline } : {}),
    }
  }
  const scene = xp.scenes?.[name]
  return scene === undefined || typeof scene === 'string' ? null : scene
}

/** One problem per line, for a console or an error panel. */
export function describeProblems(problems: readonly XpProblem[]): string {
  return problems.map((p) => (p.at ? `${p.at}: ${p.message}` : p.message)).join('\n')
}

/**
 * The names inside one place, checked against each other.
 *
 * Everything here was written when a document had one of everything, and every
 * line of it asked a question about "the document" that turns out to have been
 * a question about *a room*: whether two things answer to one name, whether the
 * thing something hangs from exists, whether the hanging goes round in a circle.
 * S1 handed it a place instead, and the checks did not otherwise change - which
 * is the evidence that the scope line was the only thing wrong with them.
 *
 * `prefix` is empty for the root and `scenes.<name>.` for a room, so a problem
 * names the place it is in. After the reading loop rather than inside it,
 * because a child may be written above its parent in the file - insisting
 * otherwise would make the order of a JSON array meaningful, which is the sort
 * of rule nobody remembers and everybody trips over.
 */
function checkPlace(
  entities: readonly EntitySpec[],
  marks: readonly Mark[],
  prefix: string,
  blueprints: Readonly<Record<string, Blueprint>>,
  problems: XpProblem[],
): void {
  const byName = new Map<string, number>()
  entities.forEach((entity, i) => {
    if (!entity.name) return
    const first = byName.get(entity.name)
    if (first !== undefined) {
      // Two entities answering to one name makes `getEntityByName` a coin
      // toss, and a coin toss inside a rule is the hardest bug to see.
      problems.push({
        at: `${prefix}entities[${i}].name`,
        message: `"${entity.name}" is already the name of ${prefix}entities[${first}]`,
      })
      return
    }
    byName.set(entity.name, i)
  })

  /**
   * And a mark may not answer to a name an entity already has.
   *
   * `teleport` resolves entities first and marks second, so a collision would
   * not be *ambiguous* - it would be a mark that silently never wins. That is
   * worse than a coin toss: the author sees a name they wrote, in a document
   * that parsed, addressing something else entirely.
   *
   * The implicit kind names are deliberately not checked here. An entity
   * called `start` in a level with one start mark is a real collision, but it
   * is one the author can only have made on purpose, and refusing it would
   * make `start` a reserved word in a namespace that has never had one.
   */
  marks.forEach((mark, i) => {
    if (!mark.name) return
    const clash = byName.get(mark.name)
    if (clash !== undefined) {
      problems.push({
        at: `${prefix}world.marks[${i}].name`,
        message: `"${mark.name}" is already the name of ${prefix}entities[${clash}]`,
      })
    }
  })

  /**
   * Two marks with one name, for the same reason two entities cannot.
   *
   * `markByName` answers null when a name is ambiguous rather than picking
   * the first, so this is refused at the parser instead of failing silently
   * at the moment somebody walks onto the pad.
   */
  const markNames = new Map<string, number>()
  marks.forEach((mark, i) => {
    if (!mark.name) return
    const first = markNames.get(mark.name)
    if (first !== undefined) {
      problems.push({
        at: `${prefix}world.marks[${i}].name`,
        message: `"${mark.name}" is already the name of ${prefix}world.marks[${first}]`,
      })
      return
    }
    markNames.set(mark.name, i)
  })

  entities.forEach((entity, i) => {
    if (!entity.parent) return

    const parentIndex = byName.get(entity.parent)
    if (parentIndex === undefined) {
      /**
       * And a room away is as absent as never written.
       *
       * The message says "no entity called", not "not in this room", because
       * the two are the same fact from where the engine stands: `spawnEntities`
       * is handed one place, so a parent in another room is a parent that is
       * not there when the child is built. Naming the room in the complaint
       * would be describing a lookup that was never attempted.
       */
      problems.push({
        at: `${prefix}entities[${i}].parent`,
        message: `no entity called "${entity.parent}"`,
      })
      return
    }

    if (entity.socket) {
      const parentBlueprint = blueprints[entities[parentIndex]!.blueprint]
      if (parentBlueprint && !(entity.socket in parentBlueprint.sockets)) {
        problems.push({
          at: `${prefix}entities[${i}].socket`,
          message: `"${entities[parentIndex]!.blueprint}" has no socket called "${entity.socket}"`,
        })
      }
    }

    /**
     * Walk up to the root, refusing a loop.
     *
     * Without this, a pair of entities parented to each other is an infinite
     * recursion the first time anything asks where either of them is - which
     * happens on the frame the level loads, in a renderer, with no message.
     */
    const seen = new Set<number>([i])
    let walker = parentIndex
    while (walker !== undefined) {
      if (seen.has(walker)) {
        problems.push({
          at: `${prefix}entities[${i}].parent`,
          message: 'this hangs from itself, in a loop',
        })
        break
      }
      seen.add(walker)
      const next = entities[walker]?.parent
      walker = next === undefined ? (undefined as unknown as number) : (byName.get(next) as number)
      if (walker === undefined) break
    }
  })
}

/**
 * The actors in one place, read the way `readWorld` reads its scenery.
 *
 * Lifted out of `parseXp` when a scene gained `entities`, and for the reason
 * that function's own note gives: the root's list and a scene's are the same
 * shape read twice, and the way two of those drift apart is each having its own
 * copy of a hundred and fifty lines. The parser being one parser is the whole
 * of what "a document is a scene that never said so" buys.
 *
 * `where` is a parameter rather than a prefix stuck on afterwards, so a problem
 * in the back room says `scenes.cellar.entities[2].blueprint` and not
 * `entities[2].blueprint` - an author sent to look at the wrong room is the
 * failure this shares with `readWorld`.
 *
 * The cap is per place *and* per document: this one names the room, and the
 * total is checked once at the end for the same reason the placement budget is
 * - a number whose job is to bound a file cannot be spent again per room.
 *
 * Blueprints come from the root, because a blueprint is a kind of thing rather
 * than a thing and every room draws its actors from one table.
 */
function readEntities(
  raw: unknown,
  where: string,
  blueprints: Readonly<Record<string, Blueprint>>,
  problems: XpProblem[],
): EntitySpec[] {
  const entities: EntitySpec[] = []
  if (raw === undefined) return entities
  if (!Array.isArray(raw)) {
    problems.push({ at: where, message: 'not a list' })
    return entities
  }
  if (raw.length > MAX_ENTITIES) {
    problems.push({
      at: where,
      message: `${raw.length} entities, over the ${MAX_ENTITIES} limit`,
    })
    return entities
  }
  raw.forEach((entry, i) => {
    const at = `${where}[${i}]`
    if (!isObject(entry)) {
      problems.push({ at, message: 'not an object' })
      return
    }
    const before = problems.length

    const blueprint = entry.blueprint
    if (typeof blueprint !== 'string') {
      problems.push({ at: `${at}.blueprint`, message: 'missing' })
    } else if (!(blueprint in blueprints)) {
      // Named at parse time rather than at the moment somebody shoots it.
      problems.push({
        at: `${at}.blueprint`,
        message: `no blueprint called "${blueprint}"`,
      })
    }

    for (const axis of ['x', 'y', 'z'] as const) {
      const value = entry[axis]
      if (!isFiniteNumber(value)) {
        problems.push({ at: `${at}.${axis}`, message: 'missing or not a number' })
        continue
      }
      // Fractional on purpose - an entity is not on the lattice - but still
      // inside the world, for the same reason a placement is.
      const limit = axis === 'y' ? WORLD_HEIGHT : WORLD_RADIUS
      const low = axis === 'y' ? -WORLD_HEIGHT : -WORLD_RADIUS
      if (value < low || value > limit) {
        problems.push({ at: `${at}.${axis}`, message: 'outside the world' })
      }
    }

    let name: string | undefined
    if (entry.name !== undefined) {
      if (typeof entry.name !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/i.test(entry.name)) {
        problems.push({
          at: `${at}.name`,
          message: 'letters, digits, dash and underscore only',
        })
      } else {
        name = entry.name
      }
    }

    let parent: string | undefined
    if (entry.parent !== undefined) {
      if (typeof entry.parent !== 'string') {
        problems.push({ at: `${at}.parent`, message: 'must be an entity name' })
      } else {
        parent = entry.parent
      }
    }

    let socket: string | undefined
    if (entry.socket !== undefined) {
      if (typeof entry.socket !== 'string') {
        problems.push({ at: `${at}.socket`, message: 'must be a socket name' })
      } else if (parent === undefined) {
        // A socket with nothing to hang from is a line somebody wrote
        // meaning something, and the something did not happen.
        problems.push({ at: `${at}.socket`, message: 'needs a parent to hang from' })
      } else {
        socket = entry.socket
      }
    }

    let text: string | undefined
    if (entry.text !== undefined) {
      if (typeof entry.text !== 'string') {
        problems.push({ at: `${at}.text`, message: 'must be a string' })
      } else if (entry.text.length > MAX_SIGN_TEXT_LENGTH) {
        problems.push({
          at: `${at}.text`,
          message: `${entry.text.length} characters, over the ${MAX_SIGN_TEXT_LENGTH} limit`,
        })
      } else if (entry.text.length > 0) {
        // Empty is the same as absent - a sign nobody wrote anything on is
        // scenery, not a document field worth carrying.
        text = entry.text
      }
    }

    /**
     * `0xRRGGBB`, checked the same way `Light.colour` is - see the note
     * there. Shared between `colour` and `background` since both are the
     * same shape and the same mistake (a float, or one out of range) looks
     * the same on screen.
     */
    const readColour = (key: 'colour' | 'background'): number | undefined => {
      const value = entry[key]
      if (value === undefined) return undefined
      if (
        !isFiniteNumber(value) ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 0xffffff
      ) {
        problems.push({ at: `${at}.${key}`, message: 'must be a whole colour from 0 to 0xffffff' })
        return undefined
      }
      return value
    }
    const colour = readColour('colour')
    const background = readColour('background')

    const rotation = entry.rotation === undefined ? 0 : entry.rotation
    if (!isFiniteNumber(rotation)) {
      problems.push({ at: `${at}.rotation`, message: 'not a number' })
    }
    const scale = entry.scale === undefined ? 1 : entry.scale
    if (!isFiniteNumber(scale) || scale <= 0) {
      problems.push({ at: `${at}.scale`, message: 'must be a positive number' })
    }

    const shape = readShape(entry, at, problems)
    const props = readProps(entry.props, `${at}.props`, problems)

    if (problems.length !== before) return
    entities.push({
      blueprint: blueprint as string,
      ...(name ? { name } : {}),
      ...(parent ? { parent } : {}),
      ...(socket ? { socket } : {}),
      ...(text ? { text } : {}),
      ...(colour !== undefined ? { colour } : {}),
      ...(background !== undefined ? { background } : {}),
      x: entry.x as number,
      y: entry.y as number,
      z: entry.z as number,
      rotation: rotation as number,
      // Absent on every entity that is upright and unstretched, which is
      // nearly all of them - see `readShape`.
      ...shape,
      scale: scale as number,
      props,
    })
  })
  return entities
}

/**
 * A world, from wherever it is written.
 *
 * Lifted out of `parseXp` unchanged when scenes arrived, because a scene is a
 * place and a place is exactly this block - the root's `world` and a scene's
 * are the same shape read twice, and the way those drift apart is each being
 * read by its own copy of a hundred lines.
 *
 * `at` is the only thing that differs, and it is a parameter rather than a
 * prefix stuck on afterwards so that a problem in the third scene says
 * `scenes.cellar.world.placements[2]` and not `world.placements[2]` - which
 * would be an author sent to look at the wrong room.
 */
function readWorld(raw: unknown, at: string, problems: XpProblem[]): XpWorld {
  if (!isObject(raw)) {
    problems.push({ at, message: 'missing' })
    return { floorY: 0, ground: false, restart: false, fatal: false, placements: [], marks: [] }
  }

  const floorY = raw.floorY === undefined ? 0 : raw.floorY
  if (!isFiniteNumber(floorY)) {
    problems.push({ at: `${at}.floorY`, message: 'not a number' })
  }

  const placements: Placement[] = []
  if (!Array.isArray(raw.placements)) {
    problems.push({ at: `${at}.placements`, message: 'missing' })
  } else if (raw.placements.length > MAX_PLACEMENTS) {
    problems.push({
      at: `${at}.placements`,
      message: `${raw.placements.length} placements, over the ${MAX_PLACEMENTS} limit`,
    })
  } else {
    raw.placements.forEach((entry, i) => {
      const placement = readPlacement(entry, `${at}.placements[${i}]`, problems)
      if (placement) placements.push(placement)
    })
  }

  const marks: Mark[] = []
  if (raw.marks !== undefined) {
    if (!Array.isArray(raw.marks)) {
      problems.push({ at: `${at}.marks`, message: 'not a list' })
    } else {
      raw.marks.forEach((entry, i) => {
        const mark = readMark(entry, `${at}.marks[${i}]`, problems)
        if (mark) marks.push(mark)
      })
    }
  }

  const ground = raw.ground === undefined ? false : raw.ground
  if (typeof ground !== 'boolean') {
    problems.push({ at: `${at}.ground`, message: 'must be true or false' })
  }

  const restart = raw.restart === undefined ? false : raw.restart
  if (typeof restart !== 'boolean') {
    problems.push({ at: `${at}.restart`, message: 'must be true or false' })
  } else if (restart && ground === true) {
    /**
     * Refused rather than quietly ignored.
     *
     * A solid plane everywhere means the fall never reaches the height that
     * would send you back, so this pair is an author who has asked for a
     * platformer and been given a trampoline - and the evidence is that their
     * level is oddly forgiving, which is not evidence anybody traces back to
     * a flag they set once.
     */
    problems.push({
      at: `${at}.restart`,
      // The path rather than the word `world`: inside a scene this used to tell
      // an author to turn off `world.ground`, which is a field in a different
      // room from the one that is wrong.
      message: `nothing can fall past solid ground - turn ${at}.ground off, or restart off`,
    })
  }

  const fatal = raw.fatal === undefined ? false : raw.fatal
  if (typeof fatal !== 'boolean') {
    problems.push({ at: `${at}.fatal`, message: 'must be true or false' })
  } else if (fatal && ground === true) {
    // The same refusal `restart` gets one field up, for the same reason: a
    // solid plane means the fall never reaches the height that would kill you.
    problems.push({
      at: `${at}.fatal`,
      message: `nothing can fall past solid ground - turn ${at}.ground off, or fatal off`,
    })
  } else if (fatal && restart === true) {
    /**
     * Two answers to one question, named rather than resolved.
     *
     * Both describe what happens when somebody falls past the floor, and a
     * document carrying both has not said which it means. Picking one here -
     * "fatal wins" - would be inventing an intention, and the author would find
     * out which was ignored by watching somebody die or not die.
     */
    problems.push({
      at: `${at}.fatal`,
      message: `a fall is one thing or the other - turn ${at}.restart off to make it a death`,
    })
  }

  /**
   * A colour, or nothing.
   *
   * Not validated as a colour beyond being a string: three.js parses far more
   * than a hex - named colours, `rgb()`, `hsl()` - and a regex here would
   * refuse things that work while still admitting `#gggggg`. What it must not
   * be is a non-string, because that reaches `new THREE.Color()` and throws
   * inside a render.
   */
  const background = raw.background
  if (background !== undefined && typeof background !== 'string') {
    problems.push({ at: `${at}.background`, message: 'must be a colour, as a string' })
  }

  return {
    floorY: isFiniteNumber(floorY) ? floorY : 0,
    ground: ground === true,
    restart: restart === true,
    fatal: fatal === true,
    // Omitted when absent, so a document with no sky of its own round-trips
    // through the editor without growing a field nobody wrote.
    ...(typeof background === 'string' ? { background } : {}),
    placements,
    marks,
  }
}

/** Where a body arrives, from wherever it is written. Lifted with `readWorld`. */
function readSpawn(raw: unknown, at: string, problems: XpProblem[]): XpSpawn {
  if (raw === undefined) return { x: 0, y: 0, z: 0, facing: 0 }
  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return { x: 0, y: 0, z: 0, facing: 0 }
  }
  const read = (key: 'x' | 'y' | 'z' | 'facing') => {
    if (raw[key] === undefined) return 0
    if (!isFiniteNumber(raw[key])) {
      problems.push({ at: `${at}.${key}`, message: 'not a number' })
      return 0
    }
    return raw[key] as number
  }
  return { x: read('x'), y: read('y'), z: read('z'), facing: read('facing') }
}

/**
 * `backend`, and the two lists in it.
 *
 * Collects every problem rather than stopping at the first, like the rest of
 * this parser: an author who has misspelled two capabilities should be told
 * about two.
 *
 * A capability in both lists is a problem rather than a precedence rule. It
 * reads as "refuse without this, and also carry on without it", and picking one
 * of those on the author's behalf is guessing at exactly the question the split
 * exists to make them answer.
 */
function readBackend(
  raw: unknown,
  problems: XpProblem[],
): XpBackend | undefined {
  if (raw === undefined) return undefined
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    problems.push({ at: 'backend', message: 'not a block' })
    return undefined
  }

  const block = raw as { needs?: unknown; wants?: unknown }
  const needs = readHostCapabilities(block.needs, 'backend.needs', problems)
  const wants = readHostCapabilities(block.wants, 'backend.wants', problems)

  for (const both of needs.filter((entry) => wants.includes(entry))) {
    problems.push({
      at: 'backend',
      message: `"${both}" is both needed and wanted; it is one or the other`,
    })
  }

  if (needs.length === 0 && wants.length === 0) return undefined
  return {
    ...(needs.length > 0 ? { needs } : {}),
    ...(wants.length > 0 ? { wants } : {}),
  }
}

/**
 * The visiting rules, read strictly because a database will act on them.
 *
 * Every other block here is read by this package and by the runtime. This one is
 * also read by `xp_visit` straight out of `xp_versions.document`, with nobody in
 * the room and the owner of the world offline — so a field that is missing or
 * nonsense is not a level that behaves oddly, it is a function deciding what to
 * move between two people's saves. Nothing is defaulted and nothing is coerced.
 */
function readVisit(raw: unknown, problems: XpProblem[]): XpVisit | undefined {
  if (raw === undefined) return undefined
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    problems.push({ at: 'visit', message: 'not a block' })
    return undefined
  }

  const block = raw as { take?: unknown; amount?: unknown; cooldown?: unknown }
  let ok = true

  if (typeof block.take !== 'string' || block.take.length === 0) {
    problems.push({ at: 'visit.take', message: 'needs the name of a field a visitor takes' })
    ok = false
  }
  if (
    typeof block.amount !== 'number' ||
    !Number.isInteger(block.amount) ||
    block.amount < 1 ||
    block.amount > MAX_VISIT_AMOUNT
  ) {
    problems.push({
      at: 'visit.amount',
      message: `a whole number between 1 and ${MAX_VISIT_AMOUNT}`,
    })
    ok = false
  }
  /**
   * Refused rather than defaulted to nothing, which is the one judgement in
   * this reader: a level whose author never thought about how often the same
   * person may be robbed is a level that stops being played, and the field is
   * how they say they did.
   */
  if (
    typeof block.cooldown !== 'number' ||
    !Number.isInteger(block.cooldown) ||
    block.cooldown < 1 ||
    block.cooldown > MAX_VISIT_COOLDOWN
  ) {
    problems.push({
      at: 'visit.cooldown',
      message: `seconds before the same visitor may take again — 1 to ${MAX_VISIT_COOLDOWN}`,
    })
    ok = false
  }

  if (!ok) return undefined
  return {
    take: block.take as string,
    amount: block.amount as number,
    cooldown: block.cooldown as number,
  }
}

function readHostCapabilities(
  raw: unknown,
  at: string,
  problems: XpProblem[],
): HostCapability[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    problems.push({ at, message: 'not a list' })
    return []
  }

  const out: HostCapability[] = []
  raw.forEach((entry, i) => {
    if (typeof entry !== 'string' || !HOST_CAPABILITIES.includes(entry as HostCapability)) {
      problems.push({
        at: `${at}[${i}]`,
        message: `not something a host provides: ${JSON.stringify(entry)} (${HOST_CAPABILITIES.join(', ')})`,
      })
      return
    }
    if (out.includes(entry as HostCapability)) {
      problems.push({ at: `${at}[${i}]`, message: `listed twice: ${entry}` })
      return
    }
    out.push(entry as HostCapability)
  })
  return out
}

