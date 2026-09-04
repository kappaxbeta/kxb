import type { AvatarClip } from '@/domain/lounge/avatars'
import { jumpArc } from '@/domain/lounge/jump'
import { type AnimationDoc, parseAnyDoc, samplePose } from '@/domain/animator/clip'
import {
  type Action,
  type ActionKind,
  jumpLength,
  ordered,
  parseAction,
  SHAKE_CYCLE,
} from '@/domain/studio/action'
import { parseTracks, sampleTracks, type Tracks } from '@/domain/studio/keys'
import {
  type BallSpec,
  type BlockSpec,
  DEFAULT_LIGHT,
  DEFAULT_SCENE,
  type GlowSpec,
  type GoalSpec,
  type GroundSpec,
  hush,
  isStudioLook,
  type LightSpec,
  parseScene,
  type PeepSpec,
  type RainbowSpec,
  type SetSpec,
  type StudioScene,
  type Vec3,
} from '@/domain/studio/scene'
import { EMOTE_COUNT } from '@/domain/world/emotes'

/**
 * A moving shot, as a document.
 *
 * The still studio composes a `StudioScene`: one arrangement, one frame. This
 * is the same arrangement with a time axis through it - actors do things,
 * properties are keyed, the camera travels between framings - and the whole of
 * it reduces back to a `StudioScene` at any instant through `sceneAt` below.
 *
 * ---------------------------------------------------------------------------
 * Why a function of time and not a frame loop
 * ---------------------------------------------------------------------------
 * `@/app/world/shots/pieces` deliberately contains no `useFrame`: clips are
 * posed by calling `mixer.setTime` once, so the same scene always gives the
 * same pixels, and a canvas that never gets `requestAnimationFrame` - a hidden
 * tab, a headless driver - still renders something.
 *
 * Video does not have to give that up. What moves is not the renderer but the
 * argument: `sceneAt(shot, t)` is pure, so playback is a loop that increments
 * `t`, and a capture is the same loop with a different clock. Nothing below
 * knows which one is calling it, and the pieces stay posed by hand either way.
 *
 * The practical payoff is that everything about a shot except "does it look
 * good" is testable without a GPU, which is the only kind of verification
 * available here - the studio is behind an admin check and the preview pane
 * that could otherwise watch it does not run an animation loop.
 *
 * ---------------------------------------------------------------------------
 * The two ways a thing moves
 * ---------------------------------------------------------------------------
 * An actor has *actions* - move, jump, kick, talk - which are verbs with their
 * own implications: a walk picks its clip from its own speed and turns the body
 * to face where it is going. See `@/domain/studio/action`.
 *
 * Every node also has *tracks* - plain keyframes on named numeric properties,
 * including an actor's own position. See `@/domain/studio/keys`.
 *
 * Where both have an opinion, the key wins. The only reason to key a property
 * an action already drives is to say "no, exactly here", and an override that
 * loses to a verb is not an override.
 *
 * ---------------------------------------------------------------------------
 * Why it is a separate document from `StudioScene`
 * ---------------------------------------------------------------------------
 * A scene is a still, and stills are still what the landing page wants - the
 * transparent cut-outs come from there and nothing about them needs a duration.
 * Threading optional motion through every field of `StudioScene` would make the
 * simple case carry the complicated one's weight forever.
 *
 * So a shot is its own document with its own query key, and `shotFromScene`
 * lifts a still into a one-frame shot to start from. The two meet at
 * `sceneAt`, which is the only thing that has to agree.
 */

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

/**
 * How an actor lights the room, before time is applied.
 *
 * A *mode*, unlike `GlowSpec` - which is what a mode resolves to at an instant.
 * The difference is the rainbow: it cycles, and `sceneAt` is pure, so the
 * cycling has to happen as a function of `t` rather than off a wall clock. A
 * shot recorded twice is then the same file twice, which is the property the
 * whole module is built around.
 */
export interface GlowTrack {
  mode: 'off' | 'colour' | 'rainbow'
  /** The hue when the mode is `colour`. Ignored by a rainbow. */
  colour: string
  sparkle: boolean
  strength: number
}

export const DEFAULT_GLOW: GlowTrack = {
  mode: 'off',
  colour: '#ff3ec8',
  sparkle: true,
  strength: 1,
}

/**
 * Degrees a rainbow turns through in a second.
 *
 * The lounge's own rate, so a party recorded in the studio moves at the speed
 * people have already seen it move at. Copied rather than imported: the party
 * glow is a client component full of drei, and the sampler must stay importable
 * by a test with no browser in it.
 */
export const RAINBOW_RATE = 60

/**
 * HSL to a CSS hex.
 *
 * Written out rather than reached for, because the one place that already does
 * this is a `THREE.Color`, and three.js has no business being imported by a
 * pure document module - the tests would then need a GPU-shaped dependency to
 * ask what colour something is.
 */
function hsl(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const sector = (((hue % 360) + 360) % 360) / 60
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const base = lightness - chroma / 2

  const [r, g, b] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second]

  const byte = (value: number) =>
    Math.round((value + base) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${byte(r)}${byte(g)}${byte(b)}`
}

/**
 * The world as rainbow glass, before time is applied.
 *
 * A *rate* where `RainbowSpec` is a moment, the same relationship `GlowTrack`
 * has with `GlowSpec` and for the same reason: the sweep has to be a function
 * of the playhead so a shot recorded twice is the same file twice.
 *
 * Speed is a multiplier on the lounge's own sweep rather than a unit anybody
 * has to think in - one is what the room looks like when somebody throws the
 * switch, and zero is a frozen rainbow, which is a legitimate video.
 */
export interface RainbowTrack {
  world: boolean
  props: boolean
  /**
   * Where the sweep already is at nought seconds.
   *
   * Exists so a still can be lifted into a shot without the picture changing:
   * a composed still is a chosen instant of the sweep, and a shot that always
   * began at zero would open on different colours than the frame somebody
   * arranged. `shotFromScene` sets this and stops the sweep; the panel shows it,
   * because state a document carries and an editor hides is state nobody can
   * get back out of.
   */
  start: number
  speed: number
}

export const DEFAULT_RAINBOW: RainbowTrack = {
  world: false,
  props: false,
  start: 0,
  speed: 1,
}

/** Where the sweep is at an instant, or null when the world is ordinary. */
export function rainbowAt(track: RainbowTrack, t: number): RainbowSpec | null {
  if (!track.world && !track.props) return null
  return {
    world: track.world,
    props: track.props,
    // The playhead is clamped at zero rather than allowed negative, so the
    // run-up a camera ease can take before the shot starts does not run the
    // sweep backwards through the opening frames.
    phase: track.start + Math.max(0, t) * track.speed,
  }
}

/** The glow at an instant, or null when there is not one. */
export function glowAt(track: GlowTrack, t: number): GlowSpec | null {
  if (track.mode === 'off') return null
  const colour =
    track.mode === 'rainbow'
      ? hsl(Math.max(0, t) * RAINBOW_RATE, 0.9, 0.6)
      : track.colour
  return { colour, sparkle: track.sparkle, strength: track.strength }
}

/** Any node, plus its keyframes. */
export type Animated<T> = T & { tracks: Tracks }

/**
 * One animal, over the length of the shot.
 *
 * The position and facing here are where they *start* - home, before anything
 * happens. Actions carry them away from it and each one leaves them where it
 * finished, which is what makes a list of moves read like a set of directions
 * rather than a set of coordinates.
 *
 * The clip is not stored, at all. It is read off how fast the actions say they
 * are moving at that instant, because the alternative - a clip track the author
 * keeps in sync with the movement by hand - is a way of authoring a peep
 * moonwalking across the grass, and nobody catches it until the export.
 */
export interface Actor {
  /** What the timeline calls this row. Empty falls back to the animal's name. */
  name: string
  avatar: string
  /** Where they stand before the first move. */
  x: number
  /**
   * How high they start, in blocks. Zero is on the floor.
   *
   * A jump is added to this rather than replacing it, so somebody standing on a
   * crate can still hop off it. Keying `y` overrides both from the first key
   * onwards, which is how a peep flies - and why this is still what they stand
   * at until that key.
   */
  y: number
  z: number
  /** Which way they face before the first turn, in degrees. */
  rotation: number
  /** Multiplies the model. One is the size the animal is in the lounge. */
  scale: number
  actions: Action[]
  tracks: Tracks
  /** Whether they light the room, and how. See `GlowTrack`. */
  glow: GlowTrack
  emoteHeight: number
  emoteSize: number
  /** Where a `talk` beat's bubble sits, and how big it is. See `PeepSpec`. */
  sayHeight: number
  saySize: number
  /**
   * How far the animal covers in one second of clip, in blocks.
   *
   * The knob that stops the feet sliding. Clip time advances with distance
   * travelled rather than with the wall clock, so a peep dragged along at
   * double speed takes double the steps instead of gliding; this is the
   * constant relating the two, and it is per-actor because a crab and a giraffe
   * do not cover ground at the same rate on the same clip.
   */
  stride: number
  /**
   * A performance keyed in the animator, or null for a body the clips drive.
   *
   * The exception to "the clip is not stored" above, and a different thing
   * from the clip that is not: that one is the *gait*, derived from speed so
   * feet cannot moonwalk, and this one is authored - a wave, a bow, a sword
   * swing - which is precisely what a gait cannot say. It plays during a
   * `pose` action, sampled by `actorAt` and laid over whatever the gait is
   * doing: bones the keys drive follow the keys, bones they never mention stay
   * with the walk.
   *
   * The document keyed in the editor rather than a baked track, because a shot
   * lives in a URL: a bake is one dense sample per frame and `samplePose` is
   * happy to blend the keys directly. It is also what lets "edit this clip"
   * reopen the animator on the real thing.
   */
  pose: AnimationDoc | null
}

/**
 * What is behind everything.
 *
 * ---------------------------------------------------------------------------
 * Why the picture is in the scene and not in CSS
 * ---------------------------------------------------------------------------
 * The obvious way to put an image behind the stage is a CSS background on the
 * element under the canvas, and it would look right in the editor and record as
 * black. `captureStream` samples the drawing buffer, which is WebGL and knows
 * nothing about the page - so anything that is going to be in the file has to
 * be in the scene graph. It is drawn as `scene.background`.
 *
 * ---------------------------------------------------------------------------
 * Why the image must be ours
 * ---------------------------------------------------------------------------
 * `image` is a same-origin path and the parser enforces it. A cross-origin
 * texture taints the canvas, and a tainted canvas cannot be read back at all:
 * the still studio's `toBlob` throws a SecurityError and `captureStream` hands
 * `MediaRecorder` nothing. The failure arrives at the export, long after the
 * choice, and says nothing about the picture that caused it - so the rule is
 * enforced where the URL comes in rather than discovered where it breaks.
 */
export interface Backdrop {
  /** Behind the picture, and the whole backdrop when there is none. */
  colour: string
  /** An absolute path on this origin, or null for the flat colour. */
  image: string | null
}

/**
 * The picture that ships with the app.
 *
 * One, deliberately. `public/bg.png` is the app's own backdrop and the only
 * image anybody has asked to shoot against; a list would be a picker to design,
 * a set of thumbnails to keep in step with the folder, and a way to reference a
 * file somebody later deletes. When there is a second, this becomes an array.
 */
export const BACKDROP_IMAGE = '/bg.png'

/** A framing, at a moment. The camera passes through these. */
export interface CameraKey {
  t: number
  position: Vec3
  target: Vec3
  fov: number
}

export interface ShotSpec {
  /** Delivered pixel size of the export. */
  width: number
  height: number
  fps: number
  /** Seconds. */
  duration: number
  /**
   * What the video is composited over.
   *
   * The still export is a transparent PNG, because a cut-out on the landing
   * page reads as a place. Video has no such option - the codecs behind
   * `MediaRecorder` have no alpha channel, and a transparent canvas captures as
   * black - so a shot names its own backdrop rather than discovering one.
   */
  background: Backdrop
  ground: GroundSpec | null
  /** A whole built world as the backdrop, or nothing. See `SetSpec`. */
  set: SetSpec | null
  /** The world as glass, and how fast the sweep runs. See `RainbowTrack`. */
  rainbow: RainbowTrack
  cast: Actor[]
  blocks: Animated<BlockSpec>[]
  goals: Animated<GoalSpec>[]
  balls: Animated<BallSpec>[]
  light: Animated<LightSpec>
  /**
   * Where the camera is, in order. One key is a locked-off shot.
   *
   * Kept as its own list rather than folded into the generic key system,
   * despite being the same idea, because the seven numbers of a framing are
   * only meaningful together: they are authored by orbiting to a view and
   * pressing a button, and a camera whose fov was keyed a second away from its
   * position is a shot nobody meant to write.
   */
  camera: CameraKey[]
  /**
   * Ease the camera into and out of every key, rather than passing through at
   * speed.
   *
   * Right for the two-or-three-key shots this is for, where each key is a
   * framing worth arriving at and settling on. Wrong for a long flythrough with
   * a key every second, which under this flag stutters at each one - if that is
   * ever the shot, the fix is fewer keys rather than a per-key setting nobody
   * would tune.
   */
  ease: boolean
  /**
   * Whether the cast is audible.
   *
   * Off means the bubbles are still there and the file is silent, which is what
   * you want when the video is going over a music bed. See
   * `@/domain/studio/voice` for what "on" sounds like.
   */
  voice: boolean
  /**
   * Whether the lines are drawn over the cast.
   *
   * Off is a *clean plate*: the same performance with no writing burned into
   * it, for a video that is going to be subtitled, dubbed, or shown in a
   * language the shot was not written in. The words are not lost - `dialogue`
   * still lists them, the voice still speaks them, and
   * `@/domain/studio/transcript` hands them over as a file with the timecodes
   * on them, which is what a subtitle track is made from.
   *
   * On the document rather than on the player, so every renderer agrees: the
   * studio's preview, a pinned scene on a board and the render worker all draw
   * `sceneAt`, and a flag any of them could set for itself is a flag that would
   * eventually mean three different things.
   */
  bubbles: boolean
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Blocks per second of clip, for the walk cycle.
 *
 * Eyeballed against the pack's walk animation rather than measured: the clips
 * carry no metadata about how far a step covers, so the honest options were a
 * number arrived at by watching feet or a number arrived at by watching feet
 * and writing a paragraph claiming otherwise.
 */
export const DEFAULT_STRIDE = 1.6

/** Below this, in blocks per second, a peep is standing rather than walking. */
const STANDING = 0.08

/** And above this they are running rather than walking. */
const RUNNING = 2.4

export const DEFAULT_ACTOR: Actor = {
  name: '',
  avatar: 'penguin',
  x: 0,
  y: 0,
  z: 0,
  /**
   * Facing the default camera, which sits front-right at `[10.4, 5.2, 11.6]`.
   *
   * It was 160 for a long time, and 160 faces almost exactly away from that
   * camera: zero faces +z and positive turns toward +x, so a new actor dropped
   * onto the stage showed the studio its back until somebody turned it round
   * by hand - every time, for every actor. 42 is `atan2(10.4, 11.6)` in
   * degrees, the heading from the origin to where the camera starts. Somebody
   * who moves the camera moves it; the point is that the first thing on the
   * stage looks at the lens rather than the wall.
   */
  rotation: 42,
  scale: 1,
  actions: [],
  tracks: {},
  glow: DEFAULT_GLOW,
  emoteHeight: 2.9,
  emoteSize: 0.9,
  // Where a sentence used to land: the emote's height, and half its size.
  sayHeight: 2.9,
  saySize: 0.45,
  stride: DEFAULT_STRIDE,
  pose: null,
}

/** A still node lifted into a shot: itself, with nothing keyed on it yet. */
const still = <T,>(node: T): Animated<T> => ({ ...node, tracks: {} })

/**
 * What the motion tab opens on: the still studio's default scene, in motion.
 *
 * Same reasoning as `DEFAULT_SCENE` - an editor that starts empty makes you
 * build a shot before you can tell whether playback works at all - with the
 * addition that a shot now has a vocabulary to demonstrate, so the default
 * spends its eight seconds using one of each of the interesting verbs.
 */
export const DEFAULT_SHOT: ShotSpec = {
  width: 1280,
  height: 720,
  fps: 30,
  duration: 8,
  background: { colour: '#120a24', image: null },
  ground: DEFAULT_SCENE.ground,
  set: null,
  rainbow: DEFAULT_RAINBOW,
  cast: [
    {
      ...DEFAULT_ACTOR,
      name: 'Penguin',
      avatar: 'penguin',
      x: -3.2,
      z: 2.4,
      rotation: 143,
      actions: [
        { kind: 'move', t: 0, duration: 3.5, x: 0.4, z: 1.6 },
        { kind: 'talk', t: 3.8, duration: 2.4, text: 'We built the whole place ourselves.' },
        { kind: 'emote', t: 6.4, duration: 3, emote: 2 },
      ],
    },
    {
      ...DEFAULT_ACTOR,
      name: 'Fox',
      avatar: 'fox',
      x: -2.2,
      z: 0.2,
      rotation: 63,
      actions: [
        { kind: 'talk', t: 0.6, duration: 2.2, text: 'No way. Prove it!' },
        { kind: 'dance', t: 3, duration: 3.4 },
      ],
    },
    {
      ...DEFAULT_ACTOR,
      name: 'Panda',
      avatar: 'panda',
      x: 4.6,
      z: -2.2,
      rotation: -126,
      actions: [
        { kind: 'move', t: 0, duration: 2.2, x: 2.4, z: -0.6 },
        { kind: 'jump', t: 1.4, duration: jumpLength(true), air: true },
        { kind: 'kick', t: 3.4, duration: 0.5 },
        { kind: 'shake', t: 5, duration: 0.96 },
      ],
    },
  ],
  blocks: DEFAULT_SCENE.blocks.map(still),
  goals: [],
  balls: [],
  light: still(DEFAULT_LIGHT),
  camera: [
    { t: 0, position: [10.4, 5.2, 11.6], target: [0, 1.1, 0], fov: 34 },
    { t: 8, position: [6.2, 3.1, 6.8], target: [0, 1.1, 0], fov: 34 },
  ],
  ease: true,
  voice: true,
  bubbles: true,
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

const rad = Math.PI / 180

/** Ease in and out. The camera's only concession to not being a robot arm. */
const smoothstep = (u: number) => u * u * (3 - 2 * u)

const lerp = (a: number, b: number, u: number) => a + (b - a) * u

/**
 * Which segment of an ordered track `t` falls in, and how far through it.
 *
 * Before the first entry and after the last, the track holds rather than
 * extrapolating - a camera whose last key is at six seconds in an eight second
 * shot stays where it was left, which is what an author means by leaving it out.
 */
function segment<T extends { t: number }>(
  points: T[],
  t: number,
): { from: T; to: T; u: number; index: number } {
  const last = points.length - 1
  if (t <= points[0].t) return { from: points[0], to: points[0], u: 0, index: 0 }
  if (t >= points[last].t) {
    return { from: points[last], to: points[last], u: 0, index: last }
  }

  let index = 0
  while (index < last - 1 && points[index + 1].t <= t) index += 1

  const from = points[index]
  const to = points[index + 1]
  const span = to.t - from.t
  // Two keys at the same instant is a cut, and dividing by the span would make
  // it a NaN instead. Snap to the later one.
  return { from, to, u: span <= 0 ? 1 : (t - from.t) / span, index }
}

/**
 * Catmull-Rom through four control points.
 *
 * Used for the camera and nothing else. A straight line between framings is
 * fine for two keys and visibly wrong for three, where the camera arrives at
 * the middle one, pivots, and leaves - this rounds that corner off by letting
 * each key's neighbours bend the curve through it.
 */
function spline(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u
  const u3 = u2 * u
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
  )
}

/** The camera's framing at `t`. */
function cameraAt(shot: ShotSpec, t: number): StudioScene['camera'] {
  const keys = shot.camera
  if (keys.length === 1) {
    const only = keys[0]
    return { position: only.position, target: only.target, fov: only.fov }
  }

  const { from, to, u: raw, index } = segment(keys, t)
  const u = shot.ease ? smoothstep(raw) : raw

  // The neighbours either side, clamped at the ends - which is the standard way
  // of giving the first and last segments the two extra points the spline wants
  // without inventing framings outside the shot.
  const before = keys[Math.max(0, index - 1)]
  const after = keys[Math.min(keys.length - 1, index + 2)]

  const axis = (pick: (key: CameraKey) => Vec3, i: number) =>
    spline(pick(before)[i], pick(from)[i], pick(to)[i], pick(after)[i], u)

  const position = (key: CameraKey) => key.position
  const target = (key: CameraKey) => key.target

  return {
    position: [axis(position, 0), axis(position, 1), axis(position, 2)],
    target: [axis(target, 0), axis(target, 1), axis(target, 2)],
    // Linear, because focal length has no corner to round off and a spline
    // through three fovs overshoots into a lens nobody asked for.
    fov: lerp(from.fov, to.fov, u),
  }
}

/** Whether an action is running at `t`. Half-open, so butted clips do not overlap. */
const live = (action: Action, t: number) => t >= action.t && t < action.t + action.duration

/** How far through it we are, from zero to one. */
const through = (action: Action, t: number) =>
  action.duration <= 0 ? 1 : Math.min(1, Math.max(0, (t - action.t) / action.duration))

/** The last action of a kind that has started, whether or not it has finished. */
function latest<K extends ActionKind>(
  actions: Action[],
  kind: K,
  t: number,
): Extract<Action, { kind: K }> | null {
  let found: Extract<Action, { kind: K }> | null = null
  for (const action of actions) {
    if (action.t > t) break
    if (action.kind === kind) found = action as Extract<Action, { kind: K }>
  }
  return found
}

/** And the one actually running now, if any. */
function running<K extends ActionKind>(
  actions: Action[],
  kind: K,
  t: number,
): Extract<Action, { kind: K }> | null {
  const found = latest(actions, kind, t)
  return found && live(found, t) ? found : null
}

interface Travel {
  x: number
  z: number
  /** Blocks covered since the top of the shot, for the walk cycle. */
  distance: number
  /** Blocks per second right now. Zero unless a move is running. */
  speed: number
  /** Which way the current move points, in degrees, or null when standing. */
  heading: number | null
}

/**
 * Where the actions have carried somebody by `t`.
 *
 * Walked from the start rather than sampled at the current move, because clip
 * time has to be continuous: restarting the distance at every move would replant
 * the feet each time they passed a corner, which is the exact thing the stride
 * is here to avoid.
 *
 * Moves are taken in order and each starts from wherever the last one finished,
 * so overlapping moves are resolved by the later one taking over from where the
 * earlier had got to. That is not a blend, and does not pretend to be - it is
 * the reading that keeps a list of directions from ever teleporting.
 */
function travel(actor: Actor, actions: Action[], t: number): Travel {
  let x = actor.x
  let z = actor.z
  let distance = 0
  let speed = 0
  let heading: number | null = null

  for (const action of actions) {
    if (action.kind !== 'move') continue
    if (action.t >= t) break

    const leg = Math.hypot(action.x - x, action.z - z)

    if (t >= action.t + action.duration) {
      distance += leg
      x = action.x
      z = action.z
      continue
    }

    const u = through(action, t)
    distance += leg * u
    const rate = action.duration <= 0 ? 0 : leg / action.duration
    if (rate > STANDING) heading = Math.atan2(action.x - x, action.z - z) / rad
    speed = rate
    x = lerp(x, action.x, u)
    z = lerp(z, action.z, u)
    break
  }

  return { x, z, distance, speed, heading }
}

/**
 * Which way somebody faces at `t`, before travel gets a say.
 *
 * Turns fold exactly as moves do, each beginning from the angle the last one
 * left. Taken the short way round, so turning from 170° to -170° is a twenty
 * degree nod rather than a three-hundred-and-forty degree spin - which is
 * always what an author dragging an angle slider past the edge means.
 */
function facing(actor: Actor, actions: Action[], t: number): number {
  let angle = actor.rotation

  for (const action of actions) {
    if (action.kind !== 'turn') continue
    if (action.t >= t) break

    const delta = ((action.rotation - angle + 540) % 360) - 180

    if (t >= action.t + action.duration) {
      angle += delta
      continue
    }
    angle += delta * smoothstep(through(action, t))
    break
  }

  return angle
}

/**
 * How far off the floor an actor is at `t`, in blocks.
 *
 * Zero unless a jump is in progress. Overlapping jumps are not a case worth
 * blending: the last one to have started wins, which is also what the
 * controller does, because pressing jump again mid-air is the air jump rather
 * than a second arc alongside the first.
 */
function heightAt(actions: Action[], t: number): number {
  const jump = latest(actions, 'jump', t)
  if (!jump) return 0
  const elapsed = t - jump.t
  return elapsed < jumpLength(jump.air) ? jumpArc(elapsed, jump.air) : 0
}

/** How far a kick or a hit is into its swing, as a nought-to-one bump. */
const swing = (u: number) => Math.sin(Math.PI * u ** 0.7)

/** How far a kick leans, in degrees. A hit is a shoulder rather than a leg. */
const KICK_LEAN = 34
const HIT_LEAN = 26

/** And how far forward the body carries, in blocks. */
const KICK_LUNGE = 0.32
const HIT_LUNGE = 0.42

/** How far a shake swings the head, in degrees. */
const SHAKE_SWING = 22

function clipFor(speed: number): AvatarClip {
  if (speed < STANDING) return 'idle'
  return speed < RUNNING ? 'walk' : 'run'
}

/**
 * Motion that is happening *now*, standing in for what the actions describe.
 *
 * The one thing the puppet needs from this module. While somebody is driving an
 * animal around, their position is coming off a keyboard rather than out of a
 * move clip - but everything else about them still has to work: the jump they
 * pressed a moment ago, the line in their bubble, the walk cycle keeping up
 * with the ground.
 *
 * Passing the live position in here, rather than reimplementing a peep in the
 * driver, is what makes the preview and the saved take the same picture. If the
 * driver drew its own animal, "what I performed" and "what got written down"
 * would be two code paths, and the first bug in either would be invisible until
 * the export.
 */
export interface LiveMotion {
  x: number
  z: number
  /** Blocks per second right now, which is what picks the clip. */
  speed: number
  /** Blocks covered since the take began, which is what advances the clip. */
  distance: number
  /** Where they are pointing, in degrees. */
  heading: number
}

/** One actor, as the still renderer already understands a peep. */
export function actorAt(actor: Actor, t: number, live?: LiveMotion): PeepSpec {
  /**
   * Sorted here rather than trusted.
   *
   * Everything below reads the list in order and stops early once it is past
   * `t`, and the editor can hand over an unordered one legitimately: dragging a
   * clip along its row moves one action past another, and re-sorting mid-drag
   * would renumber the thing under the pointer. One sort of at most sixty-four
   * beats, per actor, per frame, buys a sampler that cannot be given an input
   * it silently misreads.
   */
  const actions = ordered(actor.actions)
  // The keyboard wins over the clips while somebody is driving, and nothing
  // else about the actor changes - see `LiveMotion`.
  const moved: Travel = live
    ? { x: live.x, z: live.z, distance: live.distance, speed: live.speed, heading: live.heading }
    : travel(actor, actions, t)

  const dance = running(actions, 'dance', t)
  const clip = dance ? 'dance' : clipFor(moved.speed)
  const walking = clip === 'walk' || clip === 'run'

  const kick = running(actions, 'kick', t)
  const hit = running(actions, 'hit', t)
  const shake = running(actions, 'shake', t)

  const swung = kick ? swing(through(kick, t)) : hit ? swing(through(hit, t)) : 0
  const tilt = swung * (kick ? KICK_LEAN : HIT_LEAN)
  const lunge = swung * (kick ? KICK_LUNGE : HIT_LUNGE)

  // Facing follows travel while there is travel to follow, and holds the turned
  // angle otherwise. A shake is added on top rather than replacing it, so
  // somebody can shake their head while walking.
  const wobble = shake ? Math.sin(((t - shake.t) / SHAKE_CYCLE) * 2 * Math.PI) * SHAKE_SWING : 0
  const heading =
    (walking && moved.heading !== null ? moved.heading : facing(actor, actions, t)) + wobble

  // The lunge is along the body's own axis, so a kick always goes forwards
  // rather than towards +x.
  const x = moved.x + Math.sin(heading * rad) * lunge
  const z = moved.z + Math.cos(heading * rad) * lunge

  const emote = running(actions, 'emote', t)
  const talk = running(actions, 'talk', t)
  const gone = running(actions, 'hide', t)

  /**
   * The authored clip, sampled at how far into the beat we are.
   *
   * Looping when the document says to, so a two-second wave fills a six-second
   * beat with three waves rather than one wave and four seconds of the last
   * key held. A beat with no clip behind it plays nothing at all - the actor
   * simply keeps doing what the gait says, which is also what the editor shows
   * the moment the clip is authored.
   */
  const posing = running(actions, 'pose', t)
  const pose =
    posing && actor.pose
      ? samplePose(
          actor.pose,
          actor.pose.loop && actor.pose.duration > 0
            ? (t - posing.t) % actor.pose.duration
            : Math.min(t - posing.t, actor.pose.duration),
        )
      : undefined

  const base: PeepSpec = {
    avatar: actor.avatar,
    clip,
    // Distance for the moving clips, wall clock for the rest - an idle animal
    // is breathing and a dancing one is dancing, both of which happen per
    // second and not per block. The stride guard keeps a zeroed slider from
    // dividing by zero.
    time: walking
      ? moved.distance / Math.max(actor.stride, 0.05)
      : dance
        ? t - dance.t
        : Math.max(0, t),
    x,
    // The pack has no jump clip - idle, walk, run and dance is the whole set -
    // so an airborne peep keeps whatever the ground movement implies. Which
    // reads correctly anyway: a walk cycle carried through a hop is roughly
    // what a leap looks like, and it beats freezing them mid-stride.
    y: actor.y + heightAt(actions, t),
    z,
    rotation: heading,
    tilt,
    scale: actor.scale,
    emote: emote ? emote.emote : null,
    emoteHeight: actor.emoteHeight,
    emoteSize: actor.emoteSize,
    sayHeight: actor.sayHeight,
    saySize: actor.saySize,
    glow: glowAt(actor.glow, t),
    say: talk ? talk.text : null,
    // Spread rather than set, so an actor who is never hidden carries no key
    // and a shot composed before this existed re-encodes byte for byte.
    ...(gone ? { hidden: true } : {}),
    ...(pose ? { pose } : {}),
  }

  // Keys last, and unconditionally - see the note at the top about why an
  // override that loses to a verb is not an override.
  return {
    ...base,
    x: sampleTracks(actor.tracks, 'x', t, base.x),
    y: sampleTracks(actor.tracks, 'y', t, base.y),
    z: sampleTracks(actor.tracks, 'z', t, base.z),
    rotation: sampleTracks(actor.tracks, 'rotation', t, base.rotation),
    tilt: sampleTracks(actor.tracks, 'tilt', t, base.tilt),
    scale: sampleTracks(actor.tracks, 'scale', t, base.scale),
    emoteHeight: sampleTracks(actor.tracks, 'emoteHeight', t, base.emoteHeight),
    emoteSize: sampleTracks(actor.tracks, 'emoteSize', t, base.emoteSize),
    // Keyable for the same reason the emote's pair is: a bubble that has to
    // clear a peep who climbs onto a crate mid-shot is a bubble that moves.
    sayHeight: sampleTracks(actor.tracks, 'sayHeight', t, base.sayHeight),
    saySize: sampleTracks(actor.tracks, 'saySize', t, base.saySize),
  }
}

/**
 * A keyed node, as the plain node the renderer wants.
 *
 * Generic over the property list rather than written out per kind, so the four
 * node types that can be keyed cost one line each and adding a fifth costs
 * nothing. `tracks` is dropped on the way out - a `StudioScene` is one frame,
 * and a frame has no keyframes in it.
 */
function resolve<T extends object>(node: Animated<T>, t: number): T {
  const { tracks, ...rest } = node
  const out = { ...rest } as Record<string, unknown>
  for (const property of Object.keys(tracks)) {
    const current = out[property]
    // Only numbers, and only ones the node already has. `parseTracks` has
    // already dropped everything not in `ANIMATABLE`, so this is the second
    // guard rather than the only one - but it is the one that keeps a keyed
    // `model` from replacing a block's glTF path with a float.
    if (typeof current === 'number') {
      out[property] = sampleTracks(tracks, property, t, current)
    }
  }
  return out as T
}

/**
 * The shot, as the still renderer already understands it.
 *
 * The whole point of the module. Everything above is in service of this being
 * pure and total: any `t`, including negative ones and ones past the end,
 * gives a complete scene.
 */
export function sceneAt(shot: ShotSpec, t: number): StudioScene {
  const scene: StudioScene = {
    width: shot.width,
    height: shot.height,
    camera: cameraAt(shot, t),
    ground: shot.ground,
    // Carried across rather than resolved: a set is a reference, and `sceneAt`
    // is pure. Whoever draws the scene is the one that can fetch a world.
    set: shot.set,
    // Resolved here rather than carried across, unlike the set: the sweep moves
    // and this function is where moving happens.
    rainbow: rainbowAt(shot.rainbow, t),
    // `+ t` rather than `= t`: the block's own `time` is a phase, so a galaxy
    // set a second ahead stays a second ahead for the whole shot.
    blocks: shot.blocks.map((block) => {
      const at = resolve(block, t)
      return { ...at, time: at.time + t }
    }),
    goals: shot.goals.map((goal) => resolve(goal, t)),
    balls: shot.balls.map((ball) => resolve(ball, t)),
    light: resolve(shot.light, t),
    peeps: shot.cast.map((actor) => actorAt(actor, t)),
  }

  // The one place the flag is read. See `ShotSpec.bubbles` for why it is here
  // and not in each of the three things that draw a scene.
  return shot.bubbles ? scene : hush(scene)
}

/**
 * Every line anybody says, in order, with who says it.
 *
 * Pulled out of the cast rather than kept as a list of its own, so there is one
 * place a line exists. The voice - preview and capture both - reads this.
 */
export function dialogue(shot: ShotSpec): { at: number; length: number; text: string; avatar: string }[] {
  return shot.cast
    .flatMap((actor) =>
      actor.actions
        .filter((action): action is Extract<Action, { kind: 'talk' }> => action.kind === 'talk')
        .map((action) => ({
          at: action.t,
          length: action.duration,
          text: action.text,
          avatar: actor.avatar,
        })),
    )
    .sort((a, b) => a.at - b.at)
}

// ---------------------------------------------------------------------------
// Reading one back
// ---------------------------------------------------------------------------

/**
 * The same clamping discipline as `@/domain/studio/scene`, and for the same
 * reason: this document also lives in a query string, which is to say a thing
 * people truncate. Nothing here throws and nothing returns a partial shot.
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

/** Longest shot the studio will hold, in seconds. */
const MAX_DURATION = 120

/**
 * The actions an old link's tracks describe.
 *
 * Links written before the vocabulary existed carry a `path`, a `jumps` and an
 * `emotes` instead. They are converted rather than rejected: a shot is a
 * bookmark, the arrangement in it is the only copy, and dropping it because the
 * document grew a better shape would be losing somebody's work to a refactor.
 *
 * The conversion is exact. A path's legs become moves that finish where the
 * next one starts, which is what the old sampler did between waypoints; the
 * events become their one-for-one clips.
 */
function legacyActions(raw: Record<string, unknown>): Action[] {
  const actions: Action[] = []

  if (Array.isArray(raw.path)) {
    const points = raw.path
      .slice(0, 32)
      .map((value) => {
        const point = (value ?? {}) as Record<string, unknown>
        return {
          t: number(point.t, 0, 0, MAX_DURATION),
          x: number(point.x, 0, -40, 40),
          z: number(point.z, 0, -40, 40),
        }
      })
      .sort((a, b) => a.t - b.t)

    for (let i = 0; i < points.length - 1; i += 1) {
      const from = points[i]
      const to = points[i + 1]
      const duration = Math.max(0.05, to.t - from.t)
      // A leg to the spot you are already on was a pause in the old document,
      // and a move clip of no distance in the new one. Same picture, and it
      // keeps the timeline honest about where the pauses were.
      actions.push({ kind: 'move', t: from.t, duration, x: to.x, z: to.z })
    }
  }

  if (Array.isArray(raw.jumps)) {
    for (const value of raw.jumps.slice(0, 32)) {
      const jump = (value ?? {}) as Record<string, unknown>
      const air = jump.air === true
      actions.push({
        kind: 'jump',
        t: number(jump.t, 0, 0, MAX_DURATION),
        duration: jumpLength(air),
        air,
      })
    }
  }

  if (Array.isArray(raw.emotes)) {
    for (const value of raw.emotes.slice(0, 32)) {
      const event = (value ?? {}) as Record<string, unknown>
      if (typeof event.emote !== 'number' || event.emote < 0 || event.emote >= EMOTE_COUNT) {
        continue
      }
      actions.push({
        kind: 'emote',
        t: number(event.t, 0, 0, MAX_DURATION),
        duration: 3,
        emote: Math.floor(event.emote),
      })
    }
  }

  return actions
}

function actor(value: unknown): Actor {
  const raw = (value ?? {}) as Record<string, unknown>

  const parsed = Array.isArray(raw.actions)
    ? raw.actions
        .slice(0, 64)
        .map(parseAction)
        .filter((action): action is Action => action !== null)
    : legacyActions(raw)

  // An old document's home is the first waypoint; a new one says so outright.
  const legacyStart = Array.isArray(raw.path) && raw.path.length > 0
    ? ((raw.path[0] ?? {}) as Record<string, unknown>)
    : null

  return {
    name: typeof raw.name === 'string' ? raw.name.slice(0, 24) : '',
    avatar:
      typeof raw.avatar === 'string' && isStudioLook(raw.avatar)
        ? raw.avatar
        : DEFAULT_ACTOR.avatar,
    x: number(raw.x, legacyStart ? number(legacyStart.x, 0, -40, 40) : 0, -40, 40),
    y: number(raw.y, 0, -8, 24),
    z: number(raw.z, legacyStart ? number(legacyStart.z, 0, -40, 40) : 0, -40, 40),
    rotation: number(raw.rotation, 0, -360, 360),
    scale: number(raw.scale, 1, 0.2, 4),
    actions: ordered(parsed),
    tracks: parseTracks(raw.tracks, 'peep'),
    glow: glowTrack(raw.glow),
    emoteHeight: number(raw.emoteHeight, DEFAULT_ACTOR.emoteHeight, 0, 12),
    emoteSize: number(raw.emoteSize, DEFAULT_ACTOR.emoteSize, 0.2, 3),
    // Off this actor's own emote pair when absent, not off the defaults - the
    // same reasoning `parsePeep` gives, and the reason a shot saved before this
    // existed re-renders frame for frame.
    sayHeight: number(raw.sayHeight, number(raw.emoteHeight, DEFAULT_ACTOR.emoteHeight, 0, 12), 0, 12),
    saySize: number(
      raw.saySize,
      number(raw.emoteSize, DEFAULT_ACTOR.emoteSize, 0.2, 3) * 0.5,
      0.1,
      3,
    ),
    stride: number(raw.stride, DEFAULT_STRIDE, 0.2, 8),
    pose: parseAnyDoc(raw.pose),
  }
}

/** A glow mode from a link. Off unless it plainly says otherwise. */
function glowTrack(value: unknown): GlowTrack {
  const raw = (value ?? {}) as Record<string, unknown>
  const mode =
    raw.mode === 'colour' || raw.mode === 'rainbow' ? raw.mode : DEFAULT_GLOW.mode
  return {
    mode,
    colour:
      typeof raw.colour === 'string' && HEX.test(raw.colour)
        ? raw.colour
        : DEFAULT_GLOW.colour,
    sparkle: raw.sparkle !== false,
    strength: number(raw.strength, 1, 0, 4),
  }
}

function cameraKey(value: unknown): CameraKey {
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    t: number(raw.t, 0, 0, MAX_DURATION),
    position: vec3(raw.position, DEFAULT_SHOT.camera[0].position, 200),
    target: vec3(raw.target, DEFAULT_SHOT.camera[0].target, 200),
    fov: number(raw.fov, DEFAULT_SHOT.camera[0].fov, 5, 120),
  }
}

const HEX = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i

/**
 * Ours, and a path rather than a URL.
 *
 * `/bg.png` yes; `//evil.example/x.png` no, because a protocol-relative URL is
 * a different origin wearing a leading slash. Anything else - an `http://`, a
 * `data:`, a bare filename - is refused rather than corrected, for the reason
 * the interface note gives: the cost of being wrong here is an export that
 * fails with a SecurityError nobody can trace back to a picture.
 */
function sameOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  return value.slice(0, 300)
}

/**
 * A backdrop from whatever was in the URL.
 *
 * Links written before there was a picture carry a bare hex string, and are
 * read as the colour they always meant.
 */
function backdrop(value: unknown): Backdrop {
  if (typeof value === 'string') {
    return {
      colour: HEX.test(value) ? value : DEFAULT_SHOT.background.colour,
      image: null,
    }
  }
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    colour:
      typeof raw.colour === 'string' && HEX.test(raw.colour)
        ? raw.colour
        : DEFAULT_SHOT.background.colour,
    image: sameOrigin(raw.image),
  }
}

/**
 * The rainbow off a raw shot.
 *
 * Missing means off, so every shot written before this existed opens as its
 * author left it. Both switches default to false rather than to the speed's
 * presence: `{speed: 2}` on its own is a rate for a mode nobody turned on.
 */
function rainbowTrack(value: unknown): RainbowTrack {
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    world: raw.world === true,
    props: raw.props === true,
    start: number(raw.start, DEFAULT_RAINBOW.start, 0, 600),
    // Zero is a frozen rainbow, which is a shot somebody may well want; the
    // ceiling is where the sweep stops reading as a sweep and starts strobing.
    speed: number(raw.speed, DEFAULT_RAINBOW.speed, 0, 8),
  }
}

/**
 * The keyframe bag off a raw node.
 *
 * A node in the document is its own properties *plus* a `tracks` field, and
 * `parseTracks` reads a bag of properties - so handing it the whole node finds
 * nothing and silently drops every key on it, which is exactly what it did
 * until a round-trip test noticed.
 */
function tracksOf(value: unknown): unknown {
  return ((value ?? {}) as Record<string, unknown>).tracks
}

/** The raw entry at an index, for pulling a node's tracks back out beside it. */
function entry(value: unknown, index: number): unknown {
  return Array.isArray(value) ? value[index] : undefined
}

/**
 * A shot document from whatever was in the URL.
 *
 * The pieces a shot shares with a still - ground, blocks, goals, balls, light -
 * are validated by handing them to `parseScene` and taking them back off the
 * result, rather than by a second copy of the same clamps here. Two copies is
 * how the studio and the video studio end up disagreeing about what a legal
 * block is. Their keyframes are then zipped back on, since a still has no
 * concept of one.
 */
export function parseShot(value: unknown): ShotSpec {
  const raw = (value ?? {}) as Record<string, unknown>
  const shared = parseScene({
    ground: raw.ground,
    set: raw.set,
    blocks: raw.blocks ?? [],
    goals: raw.goals ?? [],
    balls: raw.balls ?? [],
    light: raw.light,
    // `parseScene` falls back to its own default cast when `peeps` is missing,
    // and a shot has none to give it. An empty array is the honest input.
    peeps: [],
  })

  const camera = Array.isArray(raw.camera) ? ordered(raw.camera.slice(0, 24).map(cameraKey)) : []

  return {
    width: Math.round(number(raw.width, DEFAULT_SHOT.width, 64, 4096)),
    height: Math.round(number(raw.height, DEFAULT_SHOT.height, 64, 4096)),
    // Whole frames only, and capped where a browser stops being able to hand
    // `MediaRecorder` one per interval anyway.
    fps: Math.round(number(raw.fps, DEFAULT_SHOT.fps, 5, 60)),
    duration: number(raw.duration, DEFAULT_SHOT.duration, 0.5, MAX_DURATION),
    background: backdrop(raw.background),
    ground: shared.ground,
    set: shared.set,
    // Not taken from `shared`: a scene carries a resolved moment of the sweep
    // and a shot carries the rate that produces one, so the two documents spell
    // it differently and this is the only place that knows the shot's spelling.
    rainbow: rainbowTrack(raw.rainbow),
    // Capped where `parseScene` caps its cast, and for the same reason: each
    // one is a glTF with a mixer, and a pasted link must not hang the tab.
    cast: Array.isArray(raw.cast) ? raw.cast.slice(0, 24).map(actor) : DEFAULT_SHOT.cast,
    // `parseScene` drops blocks it cannot resolve, so the surviving list is not
    // index-aligned with the raw one. Blocks are matched back up by model and
    // position instead, which is the only identity a block has.
    blocks: shared.blocks.map((block) => ({
      ...block,
      tracks: parseTracks(
        tracksOf(
          (Array.isArray(raw.blocks) ? raw.blocks : []).find((candidate) => {
            const one = (candidate ?? {}) as Record<string, unknown>
            return one.model === block.model && one.x === block.x && one.z === block.z
          }),
        ),
        'block',
      ),
    })),
    goals: shared.goals.map((goal, i) => ({
      ...goal,
      tracks: parseTracks(tracksOf(entry(raw.goals, i)), 'goal'),
    })),
    balls: shared.balls.map((ball, i) => ({
      ...ball,
      tracks: parseTracks(tracksOf(entry(raw.balls, i)), 'ball'),
    })),
    light: { ...shared.light, tracks: parseTracks(tracksOf(raw.light), 'light') },
    camera: camera.length > 0 ? camera : DEFAULT_SHOT.camera,
    ease: raw.ease !== false,
    voice: raw.voice !== false,
    bubbles: raw.bubbles !== false,
  }
}

// ---------------------------------------------------------------------------
// The query string
// ---------------------------------------------------------------------------

/** base64url, exactly as a still is encoded. See the note in `scene.ts`. */
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

export function encodeShot(shot: ShotSpec): string {
  return toBase64Url(JSON.stringify(shot))
}

export function decodeShot(encoded: string | undefined): ShotSpec {
  if (!encoded) return DEFAULT_SHOT
  try {
    return parseShot(JSON.parse(fromBase64Url(encoded)))
  } catch {
    return DEFAULT_SHOT
  }
}

// ---------------------------------------------------------------------------
// Between the two documents
// ---------------------------------------------------------------------------

/**
 * A still, as a shot that does not move yet.
 *
 * The way into the motion tab: compose the arrangement with the tools that
 * already exist, then give it a duration. Every peep becomes an actor standing
 * where they stood, and the camera becomes the single key it already was, so
 * `sceneAt(shotFromScene(scene), 0)` is the scene back again apart from the
 * clip times - which a shot derives rather than stores.
 */
export function shotFromScene(scene: StudioScene, duration = DEFAULT_SHOT.duration): ShotSpec {
  return {
    width: scene.width,
    height: scene.height,
    fps: DEFAULT_SHOT.fps,
    duration,
    background: DEFAULT_SHOT.background,
    ground: scene.ground,
    set: scene.set,
    // A still's rainbow is a resolved moment; a shot's is a rate. A lifted
    // scene keeps the moment it was composed at and stays there, exactly as a
    // lifted glow keeps its hue rather than starting to cycle - turning the
    // speed up is then a decision somebody makes, not one the lift made.
    rainbow: scene.rainbow
      ? { world: scene.rainbow.world, props: scene.rainbow.props, start: scene.rainbow.phase, speed: 0 }
      : DEFAULT_RAINBOW,
    cast: scene.peeps.map((peep) => ({
      name: '',
      avatar: peep.avatar,
      x: peep.x,
      y: peep.y,
      z: peep.z,
      rotation: peep.rotation,
      scale: peep.scale,
      // A still's emote is up for the whole frame, so the shot's version of it
      // is one fired at the top and held for the length of the shot. Dropping it
      // would lose the arrangement's point.
      actions:
        peep.emote === null
          ? []
          : [{ kind: 'emote' as const, t: 0, duration, emote: peep.emote }],
      tracks: {},
      emoteHeight: peep.emoteHeight,
      emoteSize: peep.emoteSize,
      sayHeight: peep.sayHeight,
      saySize: peep.saySize,
      // A still's glow is a resolved colour; a shot's is a mode. A lifted peep
      // keeps the hue it was composed with rather than starting to cycle.
      glow: peep.glow
        ? { mode: 'colour', colour: peep.glow.colour, sparkle: peep.glow.sparkle, strength: peep.glow.strength }
        : DEFAULT_GLOW,
      stride: DEFAULT_STRIDE,
      pose: null,
    })),
    blocks: scene.blocks.map(still),
    goals: scene.goals.map(still),
    balls: scene.balls.map(still),
    light: still(scene.light),
    camera: [{ t: 0, ...scene.camera }],
    ease: true,
    voice: true,
    // A lifted still keeps its bubbles: the peep it came from was composed with
    // the line showing, and an export that silently dropped it would read as a
    // bug rather than as a setting.
    bubbles: true,
  }
}
