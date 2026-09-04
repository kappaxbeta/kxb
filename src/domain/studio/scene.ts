import {
  AVATAR_CLIPS,
  type AvatarClip,
  AVATARS,
  avatarShotUrl,
} from '@/domain/lounge/avatars'
import { isBuildable } from '@/domain/builder/catalogue'
import { isKnownModel } from '@/domain/lounge/palette'
import { EMOTE_COUNT } from '@/domain/world/emotes'
import { parsePose, type Pose } from '@/domain/animator/clip'

/**
 * A composed still, as a document.
 *
 * The backoffice studio arranges one of these and exports it as a transparent
 * PNG; `/world/shots` renders the same pieces from code. This is the format in
 * between, and the only place that knows what a scene *is*.
 *
 * ---------------------------------------------------------------------------
 * Why it lives in the URL
 * ---------------------------------------------------------------------------
 * A composition is worth keeping - the shot you want is usually the tenth
 * arrangement, and finding it again from memory is the whole job twice. But
 * these are marketing renders, not user data: nothing downstream reads them,
 * the exported PNG is the artefact, and the person composing is an admin on
 * their own machine. A table for that would be a migration, a set of actions
 * and a permission story, all in service of a bookmark.
 *
 * So the document is encoded into the query string. A scene is then a link:
 * bookmarkable, pasteable into a message, re-openable to re-export at a
 * different size, and diffable by eye. The cost is honest - lose the link and
 * you have lost the arrangement - and it is the reason `decode` below is
 * written to never throw. A URL is a thing people edit by hand and truncate by
 * accident, and a studio that shows a blank page because a base64 tail got cut
 * off is worse than one that quietly falls back to a default scene.
 */

export type Vec3 = [number, number, number]

/**
 * A body that lights the room, as party mode does it.
 *
 * The lounge's party mode makes a room of grey blocks look like a night by
 * putting a coloured lamp *inside each person* - the hue lands on the floor,
 * the walls and whoever walks past, which is what a club actually looks like.
 * Tinting the models instead recolours the animals and leaves the room grey.
 *
 * The same idea here, with one difference that matters: this is a resolved
 * colour rather than a mode. A rainbow cycles, and `sceneAt` is a pure function
 * of time - so the cycling happens there and what reaches the renderer is the
 * hue for *this instant*. That is what keeps a recording reproducible, and it
 * is why a shot's rainbow looks the same in the export as it did in playback.
 */
export interface GlowSpec {
  /** CSS hex. Already resolved - see the note above about rainbows. */
  colour: string
  /** Dust catching the light. Cheap, and what sells it as a room rather than a lamp. */
  sparkle: boolean
  /** Multiplies the lamp. One is what the lounge uses. */
  strength: number
}

/** One animal on the ground, and optionally a face over it. */
export interface PeepSpec {
  avatar: string
  clip: AvatarClip
  /** Seconds into the clip. The clip is posed here and never advances. */
  time: number
  x: number
  /**
   * Height above the ground, in blocks. Zero is standing on it.
   *
   * Here rather than only in a shot because a peep caught mid-jump is a still
   * worth composing, and because the alternative - a shot document that can
   * express a position a scene cannot - would mean `sceneAt` has somewhere to
   * put a jump only if it also owns the renderer.
   */
  y: number
  z: number
  /** Turn about Y, in degrees - the editor's unit, not three.js's. */
  rotation: number
  /**
   * Lean forward, in degrees, about the body's own side-to-side axis.
   *
   * Here rather than only in a shot for the reason `y` is: a peep caught
   * mid-kick is a still worth composing, and a shot that could express a pose a
   * scene cannot would mean `sceneAt` had nowhere to put one.
   *
   * The pack has no clip for a swing - idle, walk, run and dance is the whole
   * set - so contact is mimed with the body: everything that lands a blow in
   * this studio is a lean, a lunge and a recovery.
   */
  tilt: number
  /** Multiplies the model. One is the size the animal is in the lounge. */
  scale: number
  /** Index into the emote sheet, or null for no bubble. */
  emote: number | null
  /** How high the bubble floats above the ground. */
  emoteHeight: number
  emoteSize: number
  /**
   * And the same two, for the bubble a `talk` beat puts up.
   *
   * -------------------------------------------------------------------------
   * Why the sentence stopped borrowing the face's numbers
   * -------------------------------------------------------------------------
   * It was drawn at `emoteHeight` and at half `emoteSize`, which is to say it
   * had no numbers of its own at all. Two things follow from that and both are
   * wrong. Moving a line of dialogue up off a tall animal's head moved the
   * emote with it, so the two could never be arranged; and the sentence could
   * only ever be exactly half the size of a face, which is a ratio nobody
   * chose - it is what the value happened to be when the bubble was written.
   *
   * They are also not the same object. A face is one tile at one size and a
   * sentence is a box that grows with the words in it, so the height that suits
   * one is not the height that suits the other, and a shot with a long line in
   * it wants the box further up than a shot with "Oi." does.
   *
   * Defaulted off the emote's pair when a document does not carry them (see
   * `parsePeep`), so every scene and every shot composed before this draws
   * exactly what it drew.
   */
  sayHeight: number
  /**
   * Height of one line of the bubble's text, in blocks.
   *
   * The bubble is drawn around it - the padding, the tail and the corner all
   * scale with this - so it is the one number that changes how big a sentence
   * is, and the box growing taller for a second line is not this number
   * changing.
   */
  saySize: number
  /** A coloured lamp at their chest, or null for an animal that does not glow. */
  glow: GlowSpec | null
  /**
   * What they are saying, or null for nothing.
   *
   * A line rather than a reference to one: by the time a scene exists the
   * dialogue has been resolved to whatever is up at this instant, and the
   * renderer's whole job is to draw the words it is handed.
   */
  say: string | null
  /**
   * Not drawn at all, or absent for a body that is.
   *
   * Optional, and read by the renderer rather than by anything numeric: this
   * is not a keyable property but the resolved answer to a `hide` beat, the
   * same way `say` is the resolved answer to a `talk` one. A hidden peep keeps
   * its place in the cast - the array index is what the editor selects and
   * poses by - so it is skipped at the point of drawing rather than filtered
   * out of the scene.
   */
  hidden?: boolean
  /**
   * The skeleton, posed - laid over whatever the clip is doing.
   *
   * Resolved, like `say` and `glow`: a shot's authored clip is sampled by
   * `actorAt` and what reaches the renderer is where every bone stands at this
   * instant. Bones the pose does not name stay with the clip, which is what
   * lets a wave ride on top of a walk.
   *
   * A still keeps one of these directly - it *is* one instant, so where the
   * bones ended up is the whole of what there is to keep. A shot keeps the
   * keyed document instead and resolves it to one of these per frame, because
   * it has a clock to play the keys against.
   */
  pose?: Pose
}

/**
 * The world as rainbow glass, at an instant.
 *
 * A *resolved* moment of the sweep, for the reason `GlowSpec` above is a
 * resolved colour: the effect moves, `sceneAt` is a pure function of time, so
 * the moving happens there and what reaches the renderer is where the sweep has
 * got to on this frame. That is what makes a recording of it reproducible.
 *
 * Two switches rather than one because they are two different pictures. Blocks
 * and the ground turned to glass still read as the place somebody built; the
 * furniture turned to glass reads as a shelf of coloured smudges, which is
 * sometimes exactly the shot and never the obvious default. Animals are in
 * neither: a scene where you cannot tell a fox from a panda is not a scene.
 */
export interface RainbowSpec {
  /** Terrain, colour blocks and the ground. */
  world: boolean
  /** The furniture. See above for why it is asked separately. */
  props: boolean
  /** Seconds into the sweep. Zero is a valid, and perfectly good, still. */
  phase: number
}

/** One palette block, in a world cell. */
export interface BlockSpec {
  model: string
  x: number
  /** Height of the block's top face, in blocks above the ground plane. */
  top: number
  z: number
  rotation: number
  /**
   * A thing off the space's shelf, drawn instead of the model, or absent.
   *
   * A *reference*, for the reason `SetSpec` is one: the document lives in the
   * address bar and a blueprint is a root model, a list of parts, a body, a
   * state machine and everything else a thing can be. The renderer is handed
   * the specs the space already loaded, so a link stays a link.
   *
   * A prop whose blueprint the reader cannot resolve - another space's, a
   * retired one - falls back to drawing `model`, which is why that field stays
   * required. A picture of the wrong crate is a better answer than a hole.
   */
  blueprint?: string
  /**
   * Whether to run the deeds that need somebody, on a blueprint that has them.
   *
   * A thing says *when* it acts: `always`, or on touch, near and use. A shot
   * has nobody standing in it, so the last three can never happen on their own
   * and a prop that only honoured `always` would stand still for most of the
   * blueprints anybody has written.
   *
   * This is the author saying "shoot it as though somebody had", and it is off
   * by default because the commonest thing to do on touch is `vanish` - which
   * on by default would make a placed prop disappear.
   */
  triggered?: boolean
  /**
   * Seconds into whatever clip the model carries, before the shot's own clock
   * is added to it.
   *
   * Zero for a palette block, which carries none, and the reason this is stored
   * rather than derived is the case where two of the same thing stand next to
   * each other: two galaxies both starting their turn at zero are one galaxy
   * drawn twice. A phase somebody can set is what makes them two things.
   *
   * The same field `PeepSpec.time` is, for the same reason and read the same
   * way - see `sceneAt`, which adds `t` to it rather than replacing it.
   */
  time: number
  /**
   * How big it is drawn, as a multiplier on the pack's own scale.
   *
   * One is whatever the pack calls a cell, exactly as a thingiverse blueprint's
   * `scale` means it - so the two spellings of "make it bigger" in this product
   * agree, and the bounds below are that type's bounds. Blocks did without this
   * for as long as a block was only ever a bb10 cube, where the answer is
   * always one cell and a half-size crate is a mistake. A galaxy is the case
   * where the size is the whole point.
   */
  scale: number
  /**
   * A colour multiplied over it, or null for the model's own.
   *
   * ---------------------------------------------------------------------------
   * Why this exists when the pack already ships tinted models
   * ---------------------------------------------------------------------------
   * Because there are two places a thing gets put and only one of them has a
   * panel. In a *world* - summoned into a room, placed by the builder - there
   * is nowhere to hang a colour picker: a placement is an id, a cell and a
   * scale, and that shape is shared by all 1,401 models. So the id carries the
   * colour there, which is what `cosmos/galaxy_jade` is.
   *
   * A still is not a world. It is a document with an inspector over it, so here
   * the honest answer is a control - and a control beats four presets the
   * moment somebody wants the fifth colour.
   *
   * Null rather than white, and they are not the same: white multiplies a
   * model's own colours by one, which is *nearly* a no-op and stops being one
   * for anything the renderer treats differently when tinted. Null means "do
   * not touch it", which is what every block written before this meant.
   */
  tint: string | null
  /**
   * The other two axes, in degrees. `rotation` is the third.
   *
   * ---------------------------------------------------------------------------
   * Why one angle stopped being enough
   * ---------------------------------------------------------------------------
   * A block only ever needed a turn, because a cube on a lattice has nothing to
   * gain from being tipped: it is a cube, and a tilted one no longer fits the
   * grid it was placed on. Every model in the catalogue that stands on a floor
   * is in the same position.
   *
   * A galaxy is not. It is authored tipped 22 degrees towards the viewer - see
   * `TILT` in scripts/build-galaxy.ts, which argues for that angle because a
   * flat disc vanishes when you walk up to its edge - and that is the right
   * default in a *room*, where somebody walks around it. In a shot the camera
   * is placed rather than walked, and the composition that wants the spiral
   * face-on cannot get it: yaw turns it about the axis it is already tipped
   * around, so the disc stays tipped however far it is turned.
   *
   * So all three, in the order they are applied: pitch about X, then the
   * existing turn about Y, then roll about Z. Zero for everything drawn before
   * this existed, which is what it always meant.
   */
  pitch: number
  roll: number
}

/**
 * A built world, standing in for the set.
 *
 * A *reference*, and that is the whole point of it. The obvious way to use
 * somebody's world as a backdrop is to copy its blocks into the document, and
 * that is what this used to do - the trouble being that the document lives in
 * the address bar. A world is thousands of blocks, a scene carrying them
 * encodes to tens of kilobytes, and a URL that long is one no server will
 * accept: the request line and the cookies share a 16KB header budget, so the
 * link to the still, the copy-link button and every bookmark stopped working
 * at once, several thousand blocks before anybody would call the world big.
 *
 * So the document names the world and the renderer fetches it. The link goes
 * back to a few hundred bytes whatever is standing in the shot, and the cap
 * that used to keep the URL down - 120 blocks, taken from the middle, which is
 * why an imported world arrived as a patch of somebody's floor - is gone with
 * the reason for it.
 *
 * What is lost is per-block editing: a set is a place, not a pile of props you
 * can drag. That is the right trade. `blocks` below is still there for the
 * handful of things you actually do want to place by hand, and the two draw
 * side by side.
 */
export interface SetSpec {
  /** The published world to stand in. Resolved by the renderer, not stored. */
  worldId: string
}

/** The floor: a rounded island of grass over dirt, or nothing at all. */
export interface GroundSpec {
  cols: number
  rows: number
  /** Which block the top layer is made of. */
  top: string
  /** Nibble the corners into an ellipse, rather than leaving a rectangle. */
  rounded: boolean
}

export interface GoalSpec {
  x: number
  z: number
  rotation: number
  width: number
  height: number
  /** CSS hex, because that is what the in-app goals are written in. */
  colour: string
}

export interface BallSpec {
  x: number
  y: number
  z: number
  radius: number
}

/** The rig, as angles and intensities rather than positions. */
/**
 * Which rig a scene is lit by.
 *
 * `daylight` is the one every baked shot has always used - sun, sky, warm
 * ambient - and it is right for the shots that are *places*, because a place
 * wants a sun.
 *
 * `neon` is the opposite and exists for shots that are *objects*: no ambient at
 * all, and three saturated coloured sources arriving from three sides. The gaps
 * between those colours are the whole effect, which is why it cannot be
 * expressed as `daylight` with the ambient turned down - a scene lit this way
 * needs the sun and the hemisphere gone rather than dimmed, or every face the
 * coloured lights miss gets lifted back out of black.
 */
export type LightPreset = 'daylight' | 'neon'

export const LIGHT_PRESETS: { id: LightPreset; label: string; hint: string }[] = [
  { id: 'daylight', label: 'Daylight', hint: 'Sun, sky and warm ambient. For rooms and places.' },
  { id: 'neon', label: 'Neon', hint: 'No ambient. Violet key, green underlight, yellow rim.' },
]

export interface LightSpec {
  /**
   * Which rig. Absent is `daylight`, so every scene saved before this existed
   * still reads as the rig it was composed under.
   */
  preset?: LightPreset
  /** Where the sun comes from, in degrees around the scene. */
  azimuth: number
  /** How high it sits, in degrees above the horizon. */
  elevation: number
  sun: number
  ambient: number
  hemisphere: number
  /** Scales both coloured rim lights together. */
  rim: number
}

export interface StudioScene {
  /** Delivered pixel size of the export. */
  width: number
  height: number
  camera: { position: Vec3; target: Vec3; fov: number }
  ground: GroundSpec | null
  /** A whole built world as the backdrop, or nothing. See `SetSpec`. */
  set: SetSpec | null
  peeps: PeepSpec[]
  /** Blocks placed by hand, over and above whatever the set brings. */
  blocks: BlockSpec[]
  goals: GoalSpec[]
  balls: BallSpec[]
  light: LightSpec
  /** The world as glass, or null for the ordinary one. */
  rainbow: RainbowSpec | null
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_LIGHT: LightSpec = {
  // The angles that reproduce the marketing shots' fixed rig, which sat at
  // [9, 15, 7]. Written as the angles rather than the position so there is one
  // knob for "where is it coming from" and not three that must agree.
  azimuth: 52,
  elevation: 53,
  sun: 2.4,
  ambient: 0.75,
  hemisphere: 1,
  rim: 1,
}

/**
 * The neon rig, as a `LightSpec`.
 *
 * The angles still drive the caster, so "where is it coming from" remains one
 * knob in the studio. `sun` scales the violet key, `rim` scales the green and
 * yellow together, and `ambient`/`hemisphere` are ignored by this preset - see
 * `Rig`. They are kept at zero rather than removed so a scene switched from
 * daylight to neon and back does not lose its daylight settings on the way.
 *
 * These are the values the /play, /create and /share heaps are shot at, so the
 * studio and the baked shots cannot drift into two different neons.
 */
export const NEON_LIGHT: LightSpec = {
  preset: 'neon',
  azimuth: -38,
  elevation: 52,
  sun: 1,
  ambient: 0,
  hemisphere: 0,
  rim: 1,
}

export const DEFAULT_PEEP: PeepSpec = {
  avatar: 'penguin',
  clip: 'idle',
  time: 0.4,
  x: 0,
  y: 0,
  z: 0,
  rotation: 160,
  tilt: 0,
  scale: 1,
  emote: 2,
  emoteHeight: 2.9,
  emoteSize: 0.9,
  // Where a sentence used to land: the emote's height, and half its size.
  sayHeight: 2.9,
  saySize: 0.45,
  glow: null,
  say: null,
}

/**
 * What the studio opens on.
 *
 * Deliberately a whole little scene rather than an empty stage: an editor that
 * starts blank makes you build a floor before you can tell whether anything
 * works, and the first question anybody has is what the pieces look like.
 */
export const DEFAULT_SCENE: StudioScene = {
  width: 1500,
  height: 1000,
  camera: { position: [7.4, 3.6, 8.2], target: [0, 1.1, 0], fov: 34 },
  ground: { cols: 13, rows: 11, top: 'dirt_with_grass', rounded: true },
  set: null,
  peeps: [
    { ...DEFAULT_PEEP, avatar: 'penguin', x: 0.4, z: 1.6, rotation: 143, time: 1.1, emote: 2 },
    {
      ...DEFAULT_PEEP,
      avatar: 'fox',
      clip: 'dance',
      x: -2.2,
      z: 0.2,
      rotation: 63,
      time: 0.7,
      emote: 27,
    },
    { ...DEFAULT_PEEP, avatar: 'panda', x: 2.4, z: -0.6, rotation: -126, time: 2.4, emote: 14 },
  ],
  blocks: [
    { model: 'hay_bale', x: -3.5, top: 1, z: -2.5, rotation: 0, time: 0, scale: 1, tint: null, pitch: 0, roll: 0 },
    { model: 'crate', x: 3.5, top: 1, z: -3.5, rotation: 0, time: 0, scale: 1, tint: null, pitch: 0, roll: 0 },
  ],
  goals: [],
  balls: [],
  light: DEFAULT_LIGHT,
  rainbow: null,
}

/**
 * The same scene with nobody's words drawn over them.
 *
 * A bubble is the only part of a composition that is *writing*, and writing is
 * the one thing a picture is bad at carrying: it is baked into the pixels at
 * whatever size the camera happened to be, it cannot be translated afterwards,
 * and a burned-in line and a subtitle track on top of each other is the same
 * sentence twice. So the words come out of the frame here and arrive as a file
 * instead - see `transcribe` in `@/domain/studio/transcript`, which is the
 * other half of this decision and the reason it is worth having.
 *
 * Only `say` goes. An emote stays, because a face over a head is a picture and
 * survives being one; and the line is not deleted from the document, only from
 * this reading of it, so the voice still speaks it and the transcript still
 * lists it. Off is a choice about the render, not about the shot.
 */
export function hush(scene: StudioScene): StudioScene {
  return { ...scene, peeps: scene.peeps.map((peep) => (peep.say === null ? peep : { ...peep, say: null })) }
}

// ---------------------------------------------------------------------------
// Reading one back
// ---------------------------------------------------------------------------

/**
 * A number, or the fallback.
 *
 * Clamped rather than rejected: the values here are all continuous, and a
 * slider dragged to something silly should give a silly picture rather than
 * silently snap back to the default. The bounds only exist to keep a hand-typed
 * URL from asking for a 90-metre grass patch of 8100 blocks.
 */
function number(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function vec3(value: unknown, fallback: Vec3, limit: number): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) return fallback
  return [
    number(value[0], fallback[0], -limit, limit),
    number(value[1], fallback[1], -limit, limit),
    number(value[2], fallback[2], -limit, limit),
  ]
}

const CLIPS = new Set<string>(Object.values(AVATAR_CLIPS))

/** CSS hex, three or six digits. Goal colours go straight into a material. */
const HEX = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i

function peep(value: unknown): PeepSpec {
  const raw = (value ?? {}) as Record<string, unknown>
  const avatar =
    typeof raw.avatar === 'string' && isStudioLook(raw.avatar)
      ? raw.avatar
      : DEFAULT_PEEP.avatar
  const clip =
    typeof raw.clip === 'string' && CLIPS.has(raw.clip)
      ? (raw.clip as AvatarClip)
      : DEFAULT_PEEP.clip
  // `null` is a real answer here - it means no bubble - so an out-of-range
  // index becomes "no bubble" rather than falling back to face number two.
  const emote =
    typeof raw.emote === 'number' && raw.emote >= 0 && raw.emote < EMOTE_COUNT
      ? Math.floor(raw.emote)
      : null
  const pose = parsePose(raw.pose)

  return {
    avatar,
    clip,
    time: number(raw.time, DEFAULT_PEEP.time, 0, 20),
    x: number(raw.x, 0, -40, 40),
    // Defaults to standing on the floor, which is what every link written
    // before there was a height means.
    y: number(raw.y, 0, -8, 24),
    z: number(raw.z, 0, -40, 40),
    rotation: number(raw.rotation, 0, -360, 360),
    tilt: number(raw.tilt, 0, -80, 80),
    scale: number(raw.scale, 1, 0.2, 4),
    emote,
    emoteHeight: number(raw.emoteHeight, DEFAULT_PEEP.emoteHeight, 0, 12),
    emoteSize: number(raw.emoteSize, DEFAULT_PEEP.emoteSize, 0.2, 3),
    // Fallen back to what the sentence was drawn at before it had numbers of
    // its own - this peep's emote height, and half its emote size - rather than
    // to the constants above. A scene that moved its bubble up to clear a tall
    // animal moved the sentence with it, and defaulting to 2.9 here would drop
    // that sentence back onto the animal's forehead on the next load.
    sayHeight: number(raw.sayHeight, number(raw.emoteHeight, DEFAULT_PEEP.emoteHeight, 0, 12), 0, 12),
    saySize: number(
      raw.saySize,
      number(raw.emoteSize, DEFAULT_PEEP.emoteSize, 0.2, 3) * 0.5,
      0.1,
      3,
    ),
    glow: glow(raw.glow),
    // Trimmed rather than rejected on length: a line that arrives too long came
    // from a hand-edited link, and a truncated bubble is a better answer than a
    // silent peep.
    say:
      typeof raw.say === 'string' && raw.say.trim().length > 0 ? raw.say.slice(0, 120) : null,
    // Spread rather than set, so an unposed peep carries no key at all and a
    // link written before posing existed re-encodes byte for byte.
    ...(pose ? { pose } : {}),
  }
}

/**
 * A glow, or nothing.
 *
 * Null is the ordinary case and the default, so a scene composed before this
 * existed opens with the lights the author actually set rather than with
 * everybody suddenly luminous.
 */
function glow(value: unknown): GlowSpec | null {
  if (value === null || value === undefined) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.colour !== 'string' || !HEX.test(raw.colour)) return null
  return {
    colour: raw.colour,
    sparkle: raw.sparkle !== false,
    strength: number(raw.strength, 1, 0, 4),
  }
}

function block(value: unknown): BlockSpec | null {
  const raw = (value ?? {}) as Record<string, unknown>
  // Unlike a peep's avatar, an unknown block has no sensible substitute: the
  // renderer would fetch a glTF that is not there and suspend forever. Dropped.
  if (typeof raw.model !== 'string') return null
  // A palette block, or anything in the world catalogue. Two lists rather than
  // one because they guard different things: `isKnownModel` is the lounge's
  // event-log allow-list and stays exactly as small as it was, while a still is
  // a picture in a URL - nothing it names is permanent, so it may reach the
  // whole shelf the builder already builds worlds out of. Without this the
  // studio could draw 58 of the 1,394 models we ship, and the 59th - a galaxy -
  // was silently dropped on parse rather than refused with a reason.
  if (!isKnownModel(raw.model) && !isBuildable(raw.model)) return null
  return {
    model: raw.model,
    x: number(raw.x, 0, -40, 40),
    top: number(raw.top, 1, -8, 24),
    z: number(raw.z, 0, -40, 40),
    rotation: number(raw.rotation, 0, -360, 360),
    // Absent in every scene written before the catalogue was reachable here,
    // which is why it defaults rather than refusing: those are all palette
    // blocks and zero is the only answer that was ever true for them.
    time: number(raw.time, 0, 0, 120),
    // The bounds a summoned thing gets, so "twice the size" means the same in a
    // shot as it does in a room. See MIN/MAX_THING_SCALE.
    scale: number(raw.scale, 1, 0.1, 12),
    tint: typeof raw.tint === 'string' && HEX.test(raw.tint) ? raw.tint : null,
    pitch: number(raw.pitch, 0, -360, 360),
    roll: number(raw.roll, 0, -360, 360),
    /*
      Shape rather than membership, and spread rather than set.

      Which blueprints exist is the *space's* question and this parser answers
      to a link that any reader may open - one that names a thing this reader
      cannot see falls back to `model`, which is the same degrading a retired
      one gets. What is checked here is that the id could be an id at all, so
      nothing hand-written in a URL reaches a query.
    */
    ...(typeof raw.blueprint === 'string' && UUID.test(raw.blueprint)
      ? { blueprint: raw.blueprint }
      : {}),
    ...(raw.triggered === true ? { triggered: true } : {}),
  }
}

function goal(value: unknown): GoalSpec {
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    x: number(raw.x, 0, -40, 40),
    z: number(raw.z, -6, -40, 40),
    rotation: number(raw.rotation, 0, -360, 360),
    width: number(raw.width, 5, 1, 20),
    height: number(raw.height, 3, 1, 12),
    colour: typeof raw.colour === 'string' && HEX.test(raw.colour) ? raw.colour : '#3b82f6',
  }
}

function ball(value: unknown): BallSpec {
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    x: number(raw.x, 0, -40, 40),
    y: number(raw.y, 0.42, 0, 20),
    z: number(raw.z, 0, -40, 40),
    radius: number(raw.radius, 0.42, 0.1, 3),
  }
}

function ground(value: unknown): GroundSpec | null {
  if (value === null) return null
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    cols: Math.round(number(raw.cols, 13, 1, 41)),
    rows: Math.round(number(raw.rows, 11, 1, 41)),
    top: typeof raw.top === 'string' && isKnownModel(raw.top) ? raw.top : 'dirt_with_grass',
    rounded: raw.rounded !== false,
  }
}

/** A world id, or nothing. Anything that is not one is nothing. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function set(value: unknown): SetSpec | null {
  if (value === null || value === undefined) return null
  const raw = value as Record<string, unknown>
  // Shape-checked only. Whether the world exists, and whether this reader may
  // see it, is the row-level policy's answer at the moment it is fetched - not
  // something a parser can know, and not something it should pretend to.
  if (typeof raw.worldId !== 'string' || !UUID.test(raw.worldId)) return null
  return { worldId: raw.worldId }
}

/**
 * A rainbow, or none.
 *
 * Null is the ordinary case and the default, so every scene composed before
 * this existed opens as its author left it rather than suddenly made of glass -
 * the same rule `glow` above follows. A rainbow with both switches off is null
 * too: a mode that changes nothing is not a mode, and letting it round-trip
 * would put a live "Rainbow" section on scenes that have none.
 */
function rainbow(value: unknown): RainbowSpec | null {
  if (value === null || value === undefined) return null
  const raw = value as Record<string, unknown>
  const world = raw.world === true
  const props = raw.props === true
  if (!world && !props) return null
  return { world, props, phase: number(raw.phase, 0, 0, 600) }
}

function light(value: unknown): LightSpec {
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    azimuth: number(raw.azimuth, DEFAULT_LIGHT.azimuth, -180, 180),
    elevation: number(raw.elevation, DEFAULT_LIGHT.elevation, 2, 89),
    sun: number(raw.sun, DEFAULT_LIGHT.sun, 0, 8),
    ambient: number(raw.ambient, DEFAULT_LIGHT.ambient, 0, 4),
    hemisphere: number(raw.hemisphere, DEFAULT_LIGHT.hemisphere, 0, 4),
    rim: number(raw.rim, DEFAULT_LIGHT.rim, 0, 4),
  }
}

/**
 * A scene document from whatever was in the URL.
 *
 * Never throws and never returns a partial scene: every field either survives
 * validation or is replaced. See the note at the top about why - the input is a
 * query string, which is to say a thing people truncate.
 */
export function parseScene(value: unknown): StudioScene {
  const raw = (value ?? {}) as Record<string, unknown>
  const camera = (raw.camera ?? {}) as Record<string, unknown>

  return {
    width: Math.round(number(raw.width, DEFAULT_SCENE.width, 64, 4096)),
    height: Math.round(number(raw.height, DEFAULT_SCENE.height, 64, 4096)),
    camera: {
      position: vec3(camera.position, DEFAULT_SCENE.camera.position, 200),
      target: vec3(camera.target, DEFAULT_SCENE.camera.target, 200),
      fov: number(camera.fov, DEFAULT_SCENE.camera.fov, 5, 120),
    },
    ground: ground(raw.ground),
    set: set(raw.set),
    // Capped at a size a browser can still draw: each peep is a glTF with its
    // own mixer, and the point of the cap is that a pasted URL cannot hang the
    // tab before anybody sees the editor.
    peeps: Array.isArray(raw.peeps) ? raw.peeps.slice(0, 24).map(peep) : DEFAULT_SCENE.peeps,
    blocks: Array.isArray(raw.blocks)
      ? raw.blocks.slice(0, 120).map(block).filter((b): b is BlockSpec => b !== null)
      : [],
    goals: Array.isArray(raw.goals) ? raw.goals.slice(0, 8).map(goal) : [],
    balls: Array.isArray(raw.balls) ? raw.balls.slice(0, 8).map(ball) : [],
    light: light(raw.light),
    rainbow: rainbow(raw.rainbow),
  }
}

// ---------------------------------------------------------------------------
// The query string
// ---------------------------------------------------------------------------

/**
 * base64url, so a scene survives being pasted into anything.
 *
 * Plain `encodeURIComponent(JSON)` would work and would even be readable, but
 * a scene is mostly punctuation - braces, quotes, colons, minus signs - and
 * percent-encoding triples the length of every one of them. base64url has no
 * characters a URL, a chat client or a shell will touch.
 */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeScene(scene: StudioScene): string {
  return toBase64Url(JSON.stringify(scene))
}

/** The inverse, for a string that may be anything at all. */
export function decodeScene(encoded: string | undefined): StudioScene {
  if (!encoded) return DEFAULT_SCENE
  try {
    return parseScene(JSON.parse(fromBase64Url(encoded)))
  } catch {
    // A mangled link opens the default scene rather than an error page. The
    // arrangement is lost either way; at least the studio still works.
    return DEFAULT_SCENE
  }
}

/** Everything the editor's avatar picker offers. Re-exported so it imports one module. */
export const STUDIO_AVATARS = AVATARS
export const STUDIO_CLIPS = Object.values(AVATAR_CLIPS)

/**
 * The rigged half of the cast: every skeleton body the level packs ship.
 *
 * An allow-list written out by hand, deliberately, the way the XP registry
 * itself was forked from the builder's rather than imported. The catalogue
 * that knows these models is half a megabyte of generated bounds; this module
 * is decoded on every surface that opens a scene link, including the public
 * ones, and twelve ids is not what half a megabyte is for. The cost is the
 * cost every fork here pays: a new skeleton pack means adding its bodies to
 * this list before the studio can cast them.
 *
 * Qualified `pack/Name` ids, the same shape the lounge's skins wear
 * (`isSkinLook`), so a look means one thing across the product.
 */
export const STUDIO_RIGGED = [
  'dummy/Dummy',
  'adventurers/Barbarian',
  'adventurers/Barbarian_Large',
  'adventurers/Druid',
  'adventurers/Engineer',
  'adventurers/Knight',
  'adventurers/Mage',
  'adventurers/Ranger',
  'adventurers/Rogue',
  'adventurers/Rogue_Hooded',
  'kappa/Monster',
  'kappa/MonsterCostume',
] as const

/**
 * The whole cast, grouped the way the picker draws it.
 *
 * A flat list of thirty-six where twelve wear slashes and twenty-four do not
 * is a select nobody can scan; the groups are the packs, named what the packs
 * call themselves.
 */
export const STUDIO_CAST_GROUPS: readonly { name: string; models: readonly string[] }[] = [
  { name: 'Peeps', models: AVATARS },
  { name: 'Characters', models: ['dummy/Dummy'] },
  { name: 'Adventurers', models: STUDIO_RIGGED.filter((look) => look.startsWith('adventurers/')) },
  { name: 'Monsters', models: STUDIO_RIGGED.filter((look) => look.startsWith('kappa/')) },
]

const STUDIO_LOOKS: ReadonlySet<string> = new Set<string>([...AVATARS, ...STUDIO_RIGGED])

/**
 * Is this a body the studio can cast - roster animal or rigged look?
 *
 * Membership rather than the lounge's shape test, because a scene link is a
 * thing people edit by hand and the renderer meets an unknown file as a fetch
 * that never resolves. An id off this list falls back to the default peep,
 * exactly as a retired animal always has.
 */
export function isStudioLook(look: string): boolean {
  return STUDIO_LOOKS.has(look)
}

/** Whether a look is one of the rigged bodies rather than a peep. */
export function isRiggedLook(look: string): boolean {
  return look.includes('/')
}

/** What a row calls a look: the name without its pack, spaces for underscores. */
export function lookLabel(look: string): string {
  const name = isRiggedLook(look) ? look.slice(look.indexOf('/') + 1) : look
  return name.replace(/_/g, ' ')
}

/**
 * The look as a picture, wherever a thumbnail is wanted.
 *
 * Peeps have pre-rendered stills in `/xo/shots`; the rigged bodies ship the
 * same thing under `/xp/thumbs`, one per model, because the skins shop already
 * needed them. Both exist ahead of time, so a tile can never advertise a body
 * the product does not have.
 */
export function lookShotUrl(look: string): string {
  return isRiggedLook(look) ? `/xp/thumbs/${look}.webp` : avatarShotUrl(look)
}
