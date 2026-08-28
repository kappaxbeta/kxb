/**
 * `@kxb/xp/movie` - a scene with a time axis through it.
 *
 * ---------------------------------------------------------------------------
 * A movie is not a second document
 * ---------------------------------------------------------------------------
 * docs/xp/scenes.md §2.1 decided this before there was any code, and the
 * decision is the whole of the design: *"A scene with a timeline and no player
 * input is a shot. A `sequence` of shots is a movie. Nothing else is needed - no
 * separate movie document, no second runtime, no export mode."*
 *
 * The alternative on offer was a story format, a cutscene format and a movie
 * format, each 80% of the other two. What the unification buys is that the
 * in-between cases exist without being designed: a cutscene is a shot between
 * two playable scenes, an intro is a shot the sequence starts with, and a
 * looping backdrop is a shot a hub sits inside. None of those is a feature here;
 * they are all "a scene that happens to carry a timeline".
 *
 * So this block hangs off a *place* - the root document and every `XpScene` -
 * and everything that already knows how to draw a place draws a movie.
 *
 * ---------------------------------------------------------------------------
 * The keys are copied from the studio, not imported
 * ---------------------------------------------------------------------------
 * `src/domain/studio/keys.ts` is already generic keyframing of any numeric
 * property of any node, and it has been in production shooting the landing
 * page's videos for months. The engine may not import the app (creator.md §1.2,
 * and the lint rule that enforces it), so `Key`, `Ease`, `sampleKeys` and the
 * editing helpers below are a copy with the seams left visible.
 *
 * Two of that file's decisions are load-bearing and scenes.md §2.2 asks by name
 * that they survive the copy rather than being rediscovered:
 *
 *   - **A key holds after the last one and does not extrapolate.** Past the
 *     final key the value is where it was left. There is nothing else it could
 *     be: the keys have taken the property over by then.
 *   - **Before the first key the value is the node's own.** A key at 0.3 means
 *     "be different from 0.3 onwards", not "be different for the whole shot".
 *     Holding the first key backwards is a key placed at one moment that
 *     silently rewrites every moment before it, and the only way out of it is a
 *     second key nobody was told they needed.
 *
 * ---------------------------------------------------------------------------
 * Pure, and that is the only way any of this gets checked
 * ---------------------------------------------------------------------------
 * `stageAt(place, timeline, t)` is a function from a document and a number of
 * seconds to a bag of overrides. No renderer, no clock, no state - the same
 * split `./motions` and `_runtime/motion.ts` are built around, and for the same
 * reason: the Browser pane never fires a frame, so "does the camera arrive at
 * the second framing" is a question a screenshot cannot answer and a test can.
 *
 * The practical payoff is that everything about a movie except *does it look
 * good* is testable without a GPU. Playback is a loop that increments `t`, an
 * export is the same loop off a different clock, and neither one knows the
 * other exists.
 *
 * ---------------------------------------------------------------------------
 * What a timeline may address
 * ---------------------------------------------------------------------------
 * Entities in the place, **by name** - the names `getEntityByName` already
 * resolves, which is why naming came before scripting. Plus the camera, because
 * a shot that cannot move the camera is not a shot.
 *
 * Not: anything outside the place, anything in another document, or a property
 * the `ANIMATABLE` table does not list. A key on a name that resolves to
 * nothing is a parse problem rather than a silent no-op - the failure mode this
 * editor is worst at showing is a refused edit, because it looks identical to
 * nothing happening.
 */

import type { EntitySpec } from './format'

// ---------------------------------------------------------------------------
// Keys - the copy from src/domain/studio/keys.ts
// ---------------------------------------------------------------------------

/** How a value gets from this key to the next. */
export type Ease = 'hold' | 'linear' | 'smooth'

export const EASES: readonly Ease[] = ['hold', 'linear', 'smooth']

export interface Key {
  /** Seconds from the start of the timeline. */
  t: number
  value: number
  /**
   * Applies to the segment *leaving* this key, not arriving at it.
   *
   * The author's mental model is "hold this value until the next one" or "glide
   * from here to there", both of which are statements about what happens after
   * the key they are looking at.
   */
  ease: Ease
}

/** One node's keyed properties, by property name. */
export type Tracks = Readonly<Record<string, Key[]>>

const smoothstep = (u: number) => u * u * (3 - 2 * u)

const lerp = (a: number, b: number, u: number) => a + (b - a) * u

/**
 * One property at one moment.
 *
 * Holds after the last key, and before the first key hands back the node's own
 * value. See the header for why that asymmetry is deliberate rather than an
 * oversight.
 */
export function sampleKeys(keys: readonly Key[] | undefined, t: number, fallback: number): number {
  if (!keys || keys.length === 0) return fallback
  if (t < keys[0]!.t) return fallback
  if (keys.length === 1) return keys[0]!.value

  const last = keys[keys.length - 1]!
  if (t >= last.t) return last.value

  let index = 0
  while (index < keys.length - 2 && keys[index + 1]!.t <= t) index += 1

  const from = keys[index]!
  const to = keys[index + 1]!
  if (from.ease === 'hold') return from.value

  const span = to.t - from.t
  // Two keys at the same instant is a step, and dividing by the span would make
  // it a NaN instead.
  const raw = span <= 0 ? 1 : (t - from.t) / span
  const u = from.ease === 'smooth' ? smoothstep(raw) : raw
  return lerp(from.value, to.value, u)
}

/** The same, reached through a node's whole bag. */
export function sampleTracks(
  tracks: Tracks | undefined,
  property: string,
  t: number,
  fallback: number,
): number {
  return sampleKeys(tracks?.[property], t, fallback)
}

/** Whether anything at all is keyed on a node - what the timeline draws a row for. */
export function keyedProperties(tracks: Tracks | undefined): string[] {
  if (!tracks) return []
  return Object.keys(tracks).filter((property) => (tracks[property]?.length ?? 0) > 0)
}

/** Two decimals is a hundredth of a second, finer than a frame at 60. */
export const at = (t: number) => Math.round(t * 100) / 100

/** Keys landing within this of each other are the same key. */
const SAME = 0.02

/**
 * A key written at `t`, replacing any key already there.
 *
 * Replacing rather than stacking is the gesture the panel is built around:
 * scrub back to a key, change the value, press again. Two keys a hundredth of a
 * second apart is never what somebody meant, and is invisible in the timeline
 * afterwards.
 */
export function putKey(keys: readonly Key[] | undefined, key: Key): Key[] {
  const others = (keys ?? []).filter((existing) => Math.abs(existing.t - key.t) > SAME)
  return [...others, key].sort((a, b) => a.t - b.t)
}

export function putTrackKey(tracks: Tracks, property: string, key: Key): Tracks {
  return { ...tracks, [property]: putKey(tracks[property], key) }
}

/** A key dropped. The property goes with it when it was the last one. */
export function dropKey(tracks: Tracks, property: string, index: number): Tracks {
  const kept = (tracks[property] ?? []).filter((_, i) => i !== index)
  const next: Record<string, Key[]> = { ...tracks }
  if (kept.length === 0) delete next[property]
  else next[property] = kept
  return next
}

// ---------------------------------------------------------------------------
// What can be keyed
// ---------------------------------------------------------------------------

export interface Animatable {
  property: string
  /** The English label. The Words block translates it; this is the key. */
  label: string
  min: number
  max: number
  step: number
  unit?: string
}

/**
 * Every property of an entity a timeline may drive.
 *
 * One table, read by three things that would otherwise drift: the parser clamps
 * against it, the inspector renders a row per entry, and the timeline names the
 * key rows from it. The bounds are `EntitySpec`'s own, because a value that is
 * illegal in a placed entity does not become legal by being reached gradually.
 *
 * `visible` is in the list and is a number, which looks wrong and is not. Every
 * other key system here interpolates, and a boolean does not - so it is 0 or 1
 * with a `hold` ease, which is exactly what an author means by "gone until the
 * door opens". A separate visibility track would be a second key model with its
 * own sampler and its own row, which is the mistake `keys.ts` was written to
 * stop being made a fourth time.
 */
export const ANIMATABLE: readonly Animatable[] = [
  { property: 'x', label: 'X', min: -200, max: 200, step: 0.05 },
  { property: 'y', label: 'Height', min: -200, max: 200, step: 0.05 },
  { property: 'z', label: 'Z', min: -200, max: 200, step: 0.05 },
  { property: 'rotation', label: 'Facing', min: -1440, max: 1440, step: 1, unit: '°' },
  { property: 'pitch', label: 'Pitch', min: -360, max: 360, step: 1, unit: '°' },
  { property: 'roll', label: 'Roll', min: -360, max: 360, step: 1, unit: '°' },
  { property: 'scale', label: 'Size', min: 0.01, max: 40, step: 0.01 },
  { property: 'visible', label: 'Shown', min: 0, max: 1, step: 1 },
]

export function animatable(property: string): Animatable | undefined {
  return ANIMATABLE.find((entry) => entry.property === property)
}

/**
 * A blueprint's own numbers, reached through the same track bag.
 *
 * `props` is an open vocabulary - a blueprint declares what it holds - so it
 * cannot be a row in the table above. The prefix is what keeps the two apart in
 * one flat `Tracks`, and it is a prefix rather than a second bag because
 * `sampleTracks` then needs no second code path and the timeline draws one list
 * of rows.
 *
 * This is the seam that makes `./motions` reachable from a movie: a door's
 * angle is a property, so a timeline that keys `prop:angle` opens the door
 * without a script, a rule or a verb.
 */
export const PROP_PREFIX = 'prop:'

export const propertyOfProp = (name: string) => `${PROP_PREFIX}${name}`

export const propOfProperty = (property: string): string | null =>
  property.startsWith(PROP_PREFIX) ? property.slice(PROP_PREFIX.length) : null

// ---------------------------------------------------------------------------
// Cameras
// ---------------------------------------------------------------------------

export type Vec3 = readonly [number, number, number]

/** A framing, at a moment. A camera passes through these. */
export interface Framing {
  t: number
  position: Vec3
  target: Vec3
  fov: number
}

/**
 * A camera, by name, with its own path through the shot.
 *
 * ---------------------------------------------------------------------------
 * Why several rather than one track
 * ---------------------------------------------------------------------------
 * The studio's `ShotSpec` has exactly one `camera: CameraKey[]`, which is right
 * for a locked-off product shot and wrong for anything with a conversation in
 * it. Two people talking is a wide, a close on one, a close on the other and
 * back to the wide - and said with one track that is eight framings, four of
 * which are duplicates of earlier ones, re-authored by hand and re-authored
 * again every time the blocking moves.
 *
 * Named cameras are how every editor that has ever cut a scene says it: you
 * place the cameras, then you say which one is live. `cuts` below is that
 * second half. A movie with one camera and no cuts is exactly the studio's
 * model, so nothing is paid for by the simple case.
 *
 * ---------------------------------------------------------------------------
 * The framings are kept whole, deliberately
 * ---------------------------------------------------------------------------
 * Seven numbers that are only meaningful together, in the studio's words: they
 * are authored by orbiting to a view and pressing a button, and a camera whose
 * fov was keyed a second away from its position is a shot nobody meant to
 * write. So this is not a `Tracks` bag even though it is the same idea.
 */
export interface MovieCamera {
  /** What the cut list names, and what the viewport picker shows. */
  name: string
  /**
   * Where it is, in order. One framing is a camera that does not move, which is
   * the common case and the reason a camera is not required to carry a path.
   */
  keys: Framing[]
  /**
   * Ease into and out of every framing rather than passing through at speed.
   *
   * Right for the two-or-three-framing moves this is for, where each one is
   * worth arriving at and settling on. Wrong for a long flythrough with a
   * framing every second, which under this stutters at each one - if that is
   * ever the shot, the fix is fewer framings rather than a per-framing setting
   * nobody would tune.
   */
  ease: boolean
}

/**
 * Which camera is live, from when.
 *
 * A **cut**, not a blend: at `t` the picture is on another camera, on that
 * frame, with no travel between the two. That is what the word means everywhere
 * else and it is also the only thing that can be said honestly - a blend
 * between two cameras is a third camera, and if that is the shot then it is one
 * camera with two framings, which this format already has.
 *
 * An empty list means the first camera is live for the whole run. A movie with
 * one camera therefore needs no cut list at all.
 */
export interface Cut {
  t: number
  /** A name in `cameras`. The parser refuses one that is not. */
  camera: string
}

export const DEFAULT_FOV = 40

export const DEFAULT_CAMERA: MovieCamera = {
  name: 'main',
  keys: [{ t: 0, position: [8, 5, 8], target: [0, 1, 0], fov: DEFAULT_FOV }],
  ease: true,
}

// ---------------------------------------------------------------------------
// Cues - a body doing something, rather than a number moving
// ---------------------------------------------------------------------------

/**
 * A clip, played by a body, from a moment.
 *
 * The other half of "what moves", and the one keys cannot express. Keys
 * interpolate a number between two moments, which is the right model for a
 * light dimming and the wrong one for a walk: that needs a skeleton, a clip
 * chosen by an author, and a mixer told when to start it.
 *
 * scenes.md §2.2 wrote this half off - *"the XP runtime has no skinning yet, so
 * there is nothing for it to drive"* - and that stopped being true when
 * `_runtime/body/skinned.tsx` landed. The split it drew is still the right one,
 * so this is that second half rather than a new idea.
 *
 * **The clip name is not checked against a pack**, the same asymmetry
 * `blueprint.pose` and the `animate` verb already have: which glTFs a host has
 * loaded is the host's business. A clip the *document* carries is the one case
 * that is not, and `./clips` is what makes that checkable.
 */
export interface Cue {
  t: number
  /** An entity name in the place. The parser refuses one that is not there. */
  entity: string
  /** A clip in the document's own `clips`, or one the host's packs carry. */
  clip: string
  loop: boolean
  /**
   * Bones this is masked to, or the whole body.
   *
   * The same word `animate`, `runAnimation` and an `AnimationGraph` state
   * already use, deliberately: a document where `parts` means one thing in a
   * verb and another in a cue is a document nobody can read. A wave over a walk
   * is the case, and it is the case often enough that a movie without it makes
   * every gesture stop the body.
   */
  parts?: readonly string[]
}

// ---------------------------------------------------------------------------
// Lines - what somebody says, and for how long
// ---------------------------------------------------------------------------

/** How long a line may be, and how many a shot may hold. */
export const MAX_LINE = 160
export const MAX_LINES = 256
export const MAX_LINE_SECONDS = 30

/**
 * A line, said by a body, from a moment.
 *
 * ---------------------------------------------------------------------------
 * Why this is not a cue, and not the `talk` block either
 * ---------------------------------------------------------------------------
 * It looks exactly like a `Cue` - a time, an entity, a payload - and folding
 * the two would be the mistake `keys.ts` warns about from the other direction.
 * A cue names a **clip**, which is a thing the host may or may not have loaded
 * and which this parser deliberately does not check. A line is **text the
 * document owns**: it is translatable, it is bounded, it is the one thing here
 * a reader can be wrong about in a language they do not speak. Those want
 * different limits and a different panel.
 *
 * It is also not `XpTalk`, which is the level's *chat* - whether people in a
 * running level may type at each other. Nothing about a shot is typed.
 *
 * ---------------------------------------------------------------------------
 * A duration rather than an end
 * ---------------------------------------------------------------------------
 * "Say this for three seconds" is what somebody means, and it survives the line
 * being dragged along the timeline. An end time would have to be dragged twice
 * and would silently invert when the start passed it.
 *
 * Overlapping lines from one body are a shot where two bubbles fight over one
 * head, so `sayingAt` answers with the **last one that has started** - the same
 * rule a whole-body cue follows, and for the same reason.
 */
export interface Say {
  t: number
  /** An entity name in the place. The parser refuses one that is not there. */
  entity: string
  /**
   * What they say.
   *
   * Keyed through the document's `words` block by the sentence itself, the way
   * every other authored phrase in a level is - so a shot translates without a
   * second mechanism. See `./words`.
   */
  text: string
  /** Seconds the bubble stays up. */
  seconds: number
}

export const DEFAULT_LINE_SECONDS = 2.5

/**
 * What one body is saying at `t`, or nothing.
 *
 * The last line that has started and has not run out. Two bubbles over one head
 * is not a richer answer, it is two bubbles over one head.
 */
export function sayingAt(timeline: XpTimeline, entity: string, t: number): Say | null {
  let live: Say | null = null
  for (const one of timeline.actions) {
    if (one.kind !== 'say' || one.entity !== entity) continue
    if (one.t > t) break
    if (t < one.t + one.duration) live = { t: one.t, entity, text: one.text, seconds: one.duration }
  }
  return live
}

/** Every line in force at `t`, by who is saying it. What the stage draws from. */
export function linesAt(timeline: XpTimeline, t: number): Map<string, Say> {
  const live = new Map<string, Say>()
  for (const one of timeline.actions) {
    if (one.kind !== 'say') continue
    if (one.t > t) break
    const said = { t: one.t, entity: one.entity, text: one.text, seconds: one.duration }
    if (t < one.t + one.duration) live.set(one.entity, said)
    else if (live.get(one.entity)?.t === one.t) live.delete(one.entity)
  }
  return live
}

// ---------------------------------------------------------------------------
// The backdrop
// ---------------------------------------------------------------------------

/**
 * What the picture is composited over.
 *
 * ---------------------------------------------------------------------------
 * Why a movie has one and `world.background` is not enough
 * ---------------------------------------------------------------------------
 * `XpWorld.background` is a CSS colour or nothing, and its comment says why it
 * stops there: *"An image or a skybox is a fetch, and a fetch is a loading
 * state, a failure state and a second thing a document can point at that might
 * not be there - none of which a colour needs."* Every word of that is still
 * true **of a level**, where the background is behind somebody who is playing
 * and a missing file is a game that looks broken while it is being played.
 *
 * A movie inverts every term. It is composed rather than played, the author is
 * looking straight at the frame when the fetch fails, and the export is a
 * *file* - so a backdrop that did not load is a video that gets re-shot rather
 * than a level that shipped wrong. The studio reached the same conclusion from
 * the other end and has had a backdrop image since it existed.
 *
 * ---------------------------------------------------------------------------
 * `none` is not the same as black, and that is the whole point of it
 * ---------------------------------------------------------------------------
 * A transparent canvas is what a still export needs: a cut-out on a page reads
 * as a place, and it is what `capturePng` has always produced. Video cannot
 * have it - the codecs behind `MediaRecorder` have no alpha channel and a
 * transparent canvas captures as **black**, silently - so the two exports want
 * different answers and the format lets a movie hold both: `none` for the
 * frames somebody is cutting out, a colour or an image for the video.
 *
 * The panel is where that gets said out loud rather than discovered.
 */
export type BackdropKind = 'none' | 'colour' | 'image' | 'sky'

export const BACKDROP_KINDS: readonly BackdropKind[] = ['none', 'colour', 'image', 'sky']

export interface Backdrop {
  kind: BackdropKind
  /** A CSS colour, when the kind is `colour`. Also the fog, as everywhere else. */
  colour?: string
  /**
   * A path under the host's own public root, when the kind is `image` or `sky`.
   *
   * A path rather than a URL, and the parser says so: a document that can name
   * `https://` anywhere is a document that can make a viewer's browser fetch
   * from a host the viewer never chose, which is a tracking pixel with extra
   * steps. Levels are shared; this is the same rule `packs` follows.
   */
  image?: string
}

export const DEFAULT_BACKDROP: Backdrop = { kind: 'none' }

// ---------------------------------------------------------------------------
// The timeline
// ---------------------------------------------------------------------------

/** How long a movie may run, how many cameras it may hold, and so on. */
export const MAX_DURATION = 600
export const MAX_FPS = 60
export const MIN_FPS = 1
export const MAX_CAMERAS = 24
export const MAX_FRAMINGS = 64
export const MAX_CUTS = 128
export const MAX_CUES = 256
export const MAX_KEYS = 128
export const MAX_TRACKED = 128
export const MAX_CAMERA_NAME = 40

/** The same alphabet a script, a scene and an animation state already use. */
export const CAMERA_NAME = /^[A-Za-z0-9_-]{1,40}$/

/**
 * A place, over time.
 *
 * Everything here is optional-shaped rather than optional: a timeline that
 * exists at all has a duration and a camera, because a movie with neither is
 * not a thing an author can be shown. The *block* is what is optional, and a
 * place with no `timeline` is every document that has ever been written.
 */
export interface XpTimeline {
  /** Seconds. What the scrubber's right-hand end is. */
  duration: number
  /**
   * Frames a second, for playback and for the export.
   *
   * In the document rather than in the export dialog because it changes what
   * the movie *is*: a cue landing on 0.04 is a different frame at 24 than at
   * 60, and an author who cut to a beat at one rate has not cut to it at the
   * other. It is also what a still export steps by.
   */
  fps: number
  /** Keyed properties, by entity name. See `ANIMATABLE` and `PROP_PREFIX`. */
  tracks: Readonly<Record<string, Tracks>>
  /** Every camera in the place. At least one. See `MovieCamera`. */
  cameras: readonly MovieCamera[]
  /** Which one is live, from when. Empty means the first one, throughout. */
  cuts: readonly Cut[]
  /**
   * Everything the cast *does*: moves, turns, jumps, clips and lines.
   *
   * One list rather than three, and the merge is the point. Clips lived in
   * `cues` and lines in `lines`, each with its own parser, its own writers and
   * its own row on the timeline - which drew one performance as three. They are
   * all a body doing something, at a moment, for a while. See `XpAction`.
   */
  actions: readonly XpAction[]
  backdrop: Backdrop
}

export const DEFAULT_DURATION = 8
export const DEFAULT_FPS = 30

export function emptyTimeline(): XpTimeline {
  return {
    duration: DEFAULT_DURATION,
    fps: DEFAULT_FPS,
    tracks: {},
    cameras: [DEFAULT_CAMERA],
    cuts: [],
    actions: [],
    backdrop: DEFAULT_BACKDROP,
  }
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

/**
 * Which segment of an ordered track `t` falls in, and how far through it.
 *
 * Before the first entry and after the last the track holds rather than
 * extrapolating - a camera whose last framing is at six seconds in an eight
 * second movie stays where it was left, which is what an author means by
 * leaving it out.
 */
function segment<T extends { t: number }>(
  points: readonly T[],
  t: number,
): { from: T; to: T; u: number; index: number } {
  const last = points.length - 1
  if (t <= points[0]!.t) return { from: points[0]!, to: points[0]!, u: 0, index: 0 }
  if (t >= points[last]!.t) return { from: points[last]!, to: points[last]!, u: 0, index: last }

  let index = 0
  while (index < last - 1 && points[index + 1]!.t <= t) index += 1

  const from = points[index]!
  const to = points[index + 1]!
  const span = to.t - from.t
  // Two framings at the same instant is a cut, and dividing by the span would
  // make it a NaN instead. Snap to the later one.
  return { from, to, u: span <= 0 ? 1 : (t - from.t) / span, index }
}

/**
 * Catmull-Rom through four control points.
 *
 * Used for the camera and nothing else. A straight line between framings is
 * fine for two and visibly wrong for three, where the camera arrives at the
 * middle one, pivots, and leaves - this rounds that corner off by letting each
 * framing's neighbours bend the curve through it.
 */
function spline(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u
  const u3 = u2 * u
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
  )
}

/** Which camera is live at `t`, by name. */
export function liveCamera(timeline: XpTimeline, t: number): string {
  const first = timeline.cameras[0]?.name ?? DEFAULT_CAMERA.name
  if (timeline.cuts.length === 0) return first

  // Before the first cut the first camera is live, not the first cut's - a cut
  // written at two seconds says "and now this one", which is a statement about
  // two seconds onwards and says nothing about what came before it.
  let live = first
  for (const cut of timeline.cuts) {
    if (cut.t > t) break
    live = cut.camera
  }
  return live
}

/** One camera's framing at `t`. */
export function framingAt(camera: MovieCamera, t: number): Omit<Framing, 't'> {
  const keys = camera.keys
  if (keys.length === 0) {
    const only = DEFAULT_CAMERA.keys[0]!
    return { position: only.position, target: only.target, fov: only.fov }
  }
  if (keys.length === 1) {
    const only = keys[0]!
    return { position: only.position, target: only.target, fov: only.fov }
  }

  const { from, to, u: raw, index } = segment(keys, t)
  const u = camera.ease ? smoothstep(raw) : raw

  // The neighbours either side, clamped at the ends - the standard way of giving
  // the first and last segments the two extra points the spline wants without
  // inventing framings outside the movie.
  const before = keys[Math.max(0, index - 1)]!
  const after = keys[Math.min(keys.length - 1, index + 2)]!

  const axis = (pick: (key: Framing) => Vec3, i: 0 | 1 | 2) =>
    spline(pick(before)[i], pick(from)[i], pick(to)[i], pick(after)[i], u)

  const position = (key: Framing) => key.position
  const target = (key: Framing) => key.target

  return {
    position: [axis(position, 0), axis(position, 1), axis(position, 2)],
    target: [axis(target, 0), axis(target, 1), axis(target, 2)],
    fov: lerp(from.fov, to.fov, u),
  }
}

/** What a body is playing at `t`, and how far into it. */
export interface Playing {
  clip: string
  loop: boolean
  parts?: readonly string[]
  /** Seconds since the cue started. What a mixer is told to seek to. */
  since: number
}

/**
 * The cue in force for one body at `t`.
 *
 * The **last cue that has started**, rather than every cue overlapping. One
 * body is doing one thing, and two clips playing over each other on the same
 * skeleton is not a richer answer, it is the two of them fighting over every
 * bone - which is the bug `parts` exists to avoid and would be a strange thing
 * to reintroduce by accident.
 *
 * A masked cue is the exception and is handled by the caller, not here: `parts`
 * makes a cue a *layer*, so a wave laid over a walk is two cues in force at
 * once and the runtime binds them to different bones. See `cuesAt`.
 */
export function cuesAt(timeline: XpTimeline, entity: string, t: number): Playing[] {
  const mine = timeline.actions.filter(
    (one): one is Extract<XpAction, { kind: 'play' }> =>
      one.kind === 'play' && one.entity === entity && one.t <= t,
  )
  if (mine.length === 0) return []

  // The whole-body clip in force is the last unmasked one. Every masked clip
  // that has started stays, because each owns its own bones and they do not
  // collide.
  const full = [...mine].reverse().find((one) => !one.parts || one.parts.length === 0)
  const layers = mine.filter((one) => one.parts && one.parts.length > 0)

  const playing = (one: Extract<XpAction, { kind: 'play' }>): Playing => ({
    clip: one.clip,
    loop: one.loop,
    ...(one.parts && one.parts.length > 0 ? { parts: one.parts } : {}),
    since: t - one.t,
  })

  return [...(full ? [playing(full)] : []), ...layers.map(playing)]
}

/** One entity, as the timeline has it at `t`. */
export interface Posed {
  entity: EntitySpec
  /** Keyed off by a `visible` track. The runtime draws nothing rather than hiding it. */
  visible: boolean
  playing: Playing[]
}

/** A place at one instant: everything a renderer needs and nothing about time. */
export interface Stage {
  entities: Posed[]
  camera: Omit<Framing, 't'> & { name: string }
  backdrop: Backdrop
}

/**
 * A place, at `t`.
 *
 * The one function everything else goes through: playback is a loop that
 * increments `t`, a video export is the same loop off a fixed step, and a still
 * is one call. None of the three knows the others exist, which is what makes a
 * recording reproducible - the same `t` is the same pixels, always.
 *
 * Entities the timeline says nothing about come back untouched. That is not an
 * optimisation, it is the meaning of a timeline: it is a set of *overrides* on a
 * place that already exists, so a movie is authored by arranging the scene the
 * ordinary way and then keying the handful of things that move.
 */
export function stageAt(entities: readonly EntitySpec[], timeline: XpTimeline, t: number): Stage {
  const name = liveCamera(timeline, t)
  const camera =
    timeline.cameras.find((one) => one.name === name) ?? timeline.cameras[0] ?? DEFAULT_CAMERA

  return {
    entities: entities.map((entity) => posedAt(entity, timeline, t)),
    camera: { name: camera.name, ...framingAt(camera, t) },
    backdrop: timeline.backdrop,
  }
}

/** One entity, with its tracks applied. Exported because the inspector wants one. */
export function posedAt(entity: EntitySpec, timeline: XpTimeline, t: number): Posed {
  const tracks = entity.name ? timeline.tracks[entity.name] : undefined
  if (!tracks) {
    return {
      entity,
      visible: true,
      playing: entity.name ? cuesAt(timeline, entity.name, t) : [],
    }
  }

  const props: Record<string, number> = { ...entity.props }
  for (const property of Object.keys(tracks)) {
    const prop = propOfProperty(property)
    if (prop === null) continue
    /**
     * Written whether or not the entity already carried the property.
     *
     * `EntitySpec.props` is *overrides* - a blueprint declares what it holds and
     * a placed entity says where it differs - so a key on a declared property
     * that this entity never overrode has to land here, not be skipped. It was
     * skipped once, and the symptom was the worst kind: a door keyed open in the
     * panel that stayed shut in the movie, silently, because nobody had typed
     * its angle in by hand first.
     *
     * Whether the blueprint declares it at all is the parser's question, and
     * `readTimeline` refuses a key on a property nothing holds. This is the half
     * that runs after that check has passed.
     */
    props[prop] = sampleTracks(tracks, property, t, props[prop] ?? 0)
  }

  const posed: EntitySpec = {
    ...entity,
    x: sampleTracks(tracks, 'x', t, entity.x),
    y: sampleTracks(tracks, 'y', t, entity.y),
    z: sampleTracks(tracks, 'z', t, entity.z),
    rotation: sampleTracks(tracks, 'rotation', t, entity.rotation),
    scale: sampleTracks(tracks, 'scale', t, entity.scale),
    ...(entity.pitch !== undefined || tracks.pitch
      ? { pitch: sampleTracks(tracks, 'pitch', t, entity.pitch ?? 0) }
      : {}),
    ...(entity.roll !== undefined || tracks.roll
      ? { roll: sampleTracks(tracks, 'roll', t, entity.roll ?? 0) }
      : {}),
    props,
  }

  return {
    entity: posed,
    // Half a key is shown, because the only way to be under it is to have been
    // keyed off deliberately and a `hold` ease is what the panel writes.
    visible: sampleTracks(tracks, 'visible', t, 1) >= 0.5,
    playing: entity.name ? cuesAt(timeline, entity.name, t) : [],
  }
}

/**
 * Every instant a still export would land on.
 *
 * `fps` and `duration` are two numbers somebody types, and the frame count they
 * imply is the thing that actually gets rendered - so it is computed in one
 * place rather than in the exporter, the progress bar and the warning about how
 * long this is going to take.
 */
export function frameTimes(timeline: XpTimeline): number[] {
  const count = Math.max(1, Math.round(timeline.duration * timeline.fps))
  return Array.from({ length: count + 1 }, (_, index) => index / timeline.fps)
}

// ---------------------------------------------------------------------------
// Sequences - the shots, cut together
// ---------------------------------------------------------------------------

/**
 * One shot in a sequence: which one, which part of it, and how fast.
 *
 * ---------------------------------------------------------------------------
 * Why this is not a chain of "and then that one"
 * ---------------------------------------------------------------------------
 * The first design here was a `next` on the timeline itself - shot A names B,
 * B names C, and the movie is what you get by following the arrows. It is
 * cheaper and it is one place a name appears rather than two, and it cannot say
 * either of the two things a cut actually needs: **trim** and **speed**. A shot
 * used twice at different lengths is a chain that has to fork, and a chain that
 * forks is a list with extra steps.
 *
 * So a sequence is an ordered list of *uses* of shots. The same shot may appear
 * three times, trimmed differently each time, which is what an edit is.
 *
 * ---------------------------------------------------------------------------
 * The trim is in the shot's own seconds, before speed
 * ---------------------------------------------------------------------------
 * `from` and `to` are read on the shot's clock, not the sequence's: they are
 * "start two seconds in and stop at six", which is a statement about the shot
 * and stays true when the entry is moved, retimed or duplicated. `speed` then
 * decides how long that four seconds occupies on the sequence.
 *
 * The alternative - trims measured on the sequence - makes every entry's
 * meaning depend on where it happens to sit, so inserting a shot in front of it
 * silently retrims everything after.
 */
export interface Take {
  /** The place whose timeline this is - `main`, or a name in `scenes`. */
  scene: string
  /** Seconds into that shot where this take starts. */
  from: number
  /** And where it ends. Never below `from`; the parser refuses the pair. */
  to: number
  /**
   * How fast it runs. 1 is as authored, 2 is twice as fast, 0.5 is slow motion.
   *
   * A multiplier rather than a target duration, because the thing an author is
   * doing is *"make this bit quicker"* and a duration would make the same
   * gesture a different number for every take. `sequenceLength` turns it back
   * into seconds for the ruler.
   */
  speed: number
}

export const MAX_TAKES = 128
export const MAX_SPEED = 8
export const MIN_SPEED = 0.05

/** A cut of shots, in order. */
export interface XpSequence {
  /** What the panel calls it. The key is what an export names. */
  name?: string
  takes: readonly Take[]
}

export const MAX_SEQUENCES = 16
export const MAX_SEQUENCE_NAME = 60

/** How long one take occupies on the sequence, after its speed. */
export function takeLength(take: Take): number {
  return Math.max(0, (take.to - take.from) / Math.max(MIN_SPEED, take.speed))
}

/** And the whole cut. */
export function sequenceLength(sequence: XpSequence): number {
  return sequence.takes.reduce((total, take) => total + takeLength(take), 0)
}

/** Where each take starts on the sequence, in order. What the ruler draws from. */
export function takeStarts(sequence: XpSequence): number[] {
  const starts: number[] = []
  let running = 0
  for (const take of sequence.takes) {
    starts.push(running)
    running += takeLength(take)
  }
  return starts
}

/** A moment on the sequence, resolved to a shot and a moment inside it. */
export interface Cued {
  /** Which take, by index. Useful for drawing the playhead over the right block. */
  index: number
  take: Take
  /** The instant to ask `stageAt` for, on the shot's own clock. */
  local: number
}

/**
 * What is on screen at `t` seconds into the cut.
 *
 * The one function the composing timeline, its playback and its export all go
 * through, exactly as `stageAt` is for a single shot - so a scrub, a play and a
 * render cannot disagree about which frame belongs where.
 *
 * Null past the end and before the start rather than clamping. A cut has a
 * length, and asking for a frame outside it is a question with no answer; the
 * caller draws black, which is what the end of a film is.
 *
 * A zero-length take is skipped rather than dividing: two trims dragged onto
 * each other is a take an author is in the middle of making, not an error.
 */
export function cuedAt(sequence: XpSequence, t: number): Cued | null {
  if (t < 0) return null
  let running = 0
  for (const [index, take] of sequence.takes.entries()) {
    const length = takeLength(take)
    if (length <= 0) continue
    if (t < running + length) {
      return { index, take, local: take.from + (t - running) * Math.max(MIN_SPEED, take.speed) }
    }
    running += length
  }
  return null
}

/**
 * The same, for a playhead that has been parked rather than asked a question.
 *
 * ---------------------------------------------------------------------------
 * Why `cuedAt` is not enough on its own
 * ---------------------------------------------------------------------------
 * `cuedAt` answers null past the end, and that is right: a cut has a length, and
 * the runtime *needs* the null - it is the signal that ends the film and hands
 * control back. Nothing about that should change.
 *
 * But an editor is not a projector. When playback stops, the clock is left at
 * exactly `sequenceLength`, `cuedAt` says null, and the composer has to draw
 * something. It drew the last take at `local: 0` - so the moment a cut finished
 * playing, the picture jumped back to the **first** frame of the final shot.
 * Watch a cut to the end and the last thing you see is its beginning, which
 * reads as playback having looped rather than stopped.
 *
 * So this is the parked answer: inside the cut it is `cuedAt` exactly, and past
 * the end it is the last frame there is. Null only for a cut with nothing in it,
 * where there is genuinely no frame to show.
 *
 * Separate from `cuedAt` rather than a flag on it, because the two callers want
 * opposite things from the same instant and a boolean parameter would put the
 * decision at every call site instead of in its name.
 */
export function restingAt(sequence: XpSequence, t: number): Cued | null {
  const cued = cuedAt(sequence, t)
  if (cued) return cued

  // Before the start is the other end of the same question, and it has the
  // same answer: the nearest frame there is. A composer whose playhead has
  // been dragged to the left of zero is one somebody is still dragging.
  if (t < 0) {
    const index = sequence.takes.findIndex((take) => takeLength(take) > 0)
    const take = sequence.takes[index]
    return take ? { index, take, local: take.from } : null
  }

  for (let index = sequence.takes.length - 1; index >= 0; index -= 1) {
    const take = sequence.takes[index]!
    if (takeLength(take) <= 0) continue
    // `to` and not `to` minus a frame: the trim is inclusive of the moment it
    // names, and a shot's last frame is the one an author trimmed *to*.
    return { index, take, local: take.to }
  }
  return null
}

// ---------------------------------------------------------------------------
// Actions - what somebody does, as opposed to what a number is
// ---------------------------------------------------------------------------

/**
 * The other half of "what moves", and the half keys cannot express.
 *
 * ---------------------------------------------------------------------------
 * Why this is not more keys
 * ---------------------------------------------------------------------------
 * `keys.ts` opens with the argument and docs/xp/scenes.md §2.2 repeats it: keys
 * interpolate a number between two moments, which is the right model for a
 * light dimming and the wrong one for **an animal crossing a field**. That needs
 * a clip chosen from the speed, feet that keep up with the ground, and a body
 * that turns to face where it is going. Two position keys give you a body
 * sliding across the floor in its idle pose.
 *
 * scenes.md wrote this half off at the time - *"the XP runtime has no skinning
 * yet, so there is nothing for it to drive"* - and said the split was already
 * drawn for when it landed. It has landed. This is that half.
 *
 * ---------------------------------------------------------------------------
 * Actions chain; keys override
 * ---------------------------------------------------------------------------
 * A move starts from wherever the body already *was* - the end of the last
 * action, or its own position if there has not been one. That is what makes
 * "walk to the door, turn, walk back" three things somebody can type rather
 * than six coordinates they have to keep in agreement.
 *
 * And where an action and a key both have an opinion, **the key wins**, from its
 * own moment onwards. The only reason to key a property an action already drives
 * is to say "no, exactly here", and an override that loses to a verb is not an
 * override. See `posedAt`, where the acted transform is passed in as the keys'
 * fallback - which is the whole of the interaction, in one argument.
 *
 * ---------------------------------------------------------------------------
 * Three verbs, not nine
 * ---------------------------------------------------------------------------
 * The studio has nine and most of them are already sayable here: a line is a
 * `Say`, and anything with a clip behind it - dance, kick, hit - is a `Cue`,
 * which can name any clip the packs carry rather than the four the studio
 * hard-coded. What is left is the three a *cue cannot say*, because they move
 * the body through the world rather than posing it: going somewhere, turning,
 * and leaving the floor.
 */

/** How long an action may run, and how many a shot may hold. */
export const MAX_ACTIONS = 256
export const MAX_ACTION_SECONDS = 120

export interface Beat {
  /** Seconds from the start of the shot. */
  t: number
  /**
   * How long it takes. Never zero.
   *
   * A zero-length action is one the sampler would divide by and the timeline
   * would draw as an invisible sliver, so the parser floors it. A verb that
   * happens instantly is a key, and the format already has those.
   */
  duration: number
  /** Whose action it is. The parser refuses a body that is not there. */
  entity: string
}

export type XpAction =
  /** Walk to a spot on the ground. The facing follows the direction of travel. */
  | (Beat & { kind: 'move'; x: number; z: number })
  /** Turn on the spot to face an angle. */
  | (Beat & { kind: 'turn'; rotation: number })
  /**
   * Leave the floor and come back, on an arc.
   *
   * `height` rather than a fixed jump, because a movie is not bound by what a
   * player's legs can do - a body vaulting eight metres is a shot somebody may
   * want, and refusing it here would send them to keying `y` by hand, which is
   * the thing this exists to avoid.
   */
  | (Beat & { kind: 'jump'; height: number })
  /**
   * Play a clip.
   *
   * **This was its own block**, `cues`, with its own parser, its own writers and
   * its own lane on the timeline - and it should not have been. *"Animations are
   * actions"*, and they are: a clip has a moment, a duration and an actor,
   * which is a `Beat`, and drawing it in a separate row from the walk it happens
   * during is drawing one performance as two.
   *
   * The clip name is **not** checked against a pack, the same asymmetry
   * `blueprint.pose` and the `animate` verb have: which glTFs a host has loaded
   * is the host's business.
   */
  | (Beat & { kind: 'play'; clip: string; loop: boolean; parts?: readonly string[] })
  /**
   * Say something, in a bubble over the head.
   *
   * Was `lines`, and folded in for the same reason `play` was. A line has a
   * moment, a length and somebody saying it; the only thing that made it a
   * separate block was that it arrived first.
   *
   * The text is keyed through the document's `words` block by the sentence
   * itself, the way every other authored phrase in a level is - so a shot
   * translates without a second mechanism. See `./words`.
   */
  | (Beat & { kind: 'say'; text: string })

export type ActionKind = XpAction['kind']

export const ACTION_KINDS: readonly ActionKind[] = ['move', 'turn', 'jump', 'play', 'say']

/** What the timeline draws and the panel offers, by kind. */
export interface ActionMeta {
  kind: ActionKind
  label: string
  /** Whether the author sets the length, or the verb owns it. */
  resizable: boolean
  /**
   * The lucide icon's **name**, not the component.
   *
   * This module is the document's vocabulary and is imported by the sampler and
   * by tests, neither of which should pull a React icon set into a bun run. The
   * panel maps the name to a component.
   */
  icon: string
}

export const ACTION_META: Record<ActionKind, ActionMeta> = {
  move: { kind: 'move', label: 'Move', resizable: true, icon: 'Footprints' },
  turn: { kind: 'turn', label: 'Turn', resizable: true, icon: 'RotateCw' },
  jump: { kind: 'jump', label: 'Jump', resizable: true, icon: 'ArrowBigUp' },
  play: { kind: 'play', label: 'Play', resizable: true, icon: 'Clapperboard' },
  say: { kind: 'say', label: 'Say', resizable: true, icon: 'MessageCircle' },
}

/** What a body is doing at `t`, having done everything before it. */
export interface Acted {
  x: number
  y: number
  z: number
  rotation: number
  /**
   * How fast it is travelling, in cells a second.
   *
   * Not a clip name, deliberately. Which animation a walking body plays is the
   * *host's* business - it has the packs, it knows what a peep can do, and
   * `_runtime/body/motion.ts` already turns a speed into a clip with hysteresis
   * on the walk/run boundary. Naming a clip here would be this module deciding
   * something it cannot check and the runtime already decides better.
   */
  speed: number
  /** Whether it is off the floor, so the runtime can pick its air pose. */
  airborne: boolean
}

const smooth = (u: number) => u * u * (3 - 2 * u)

/**
 * Where the shortest turn from `from` to `to` goes, in degrees.
 *
 * Turning 350° to get from 355 to 345 is the bug this exists for: the numbers
 * are absolute and the *rotation* is the short way round, always.
 */
function turnedTo(from: number, to: number, u: number): number {
  let gap = (to - from) % 360
  if (gap > 180) gap -= 360
  if (gap < -180) gap += 360
  return from + gap * u
}

/**
 * One body, having done its actions up to `t`.
 *
 * A fold rather than a lookup, because actions chain: a move starts where the
 * last one finished, so the answer at four seconds depends on everything before
 * it. Actions on other bodies are skipped, and the list is walked in order -
 * which the parser guarantees by sorting.
 *
 * Overlapping actions on one body are applied in order and the later one simply
 * starts from wherever the earlier had got to. That is not a considered
 * blend - it is the honest result of a fold - and it is why the panel places a
 * new action after the last one rather than on top of it.
 */
export function actedAt(
  timeline: XpTimeline,
  entity: string,
  t: number,
  from: { x: number; y: number; z: number; rotation: number },
): Acted {
  let x = from.x
  let y = from.y
  let z = from.z
  let rotation = from.rotation
  let speed = 0
  let airborne = false

  for (const action of timeline.actions) {
    if (action.entity !== entity) continue
    if (t < action.t) break

    const span = Math.max(0.001, action.duration)
    const through = Math.min(1, (t - action.t) / span)
    const running = t < action.t + span

    switch (action.kind) {
      case 'move': {
        const wasX = x
        const wasZ = z
        const far = Math.hypot(action.x - wasX, action.z - wasZ)

        if (running) {
          /**
           * Linear, and that is the whole of what makes this a walk.
           *
           * ---------------------------------------------------------------
           * The easing was the bug
           * ---------------------------------------------------------------
           * This was `smooth(through)` - a smoothstep across the move - on the
           * reasonable-sounding grounds that a body which starts and stops
           * abruptly looks mechanical. It is the wrong curve here, and wrong in
           * a way nothing about the numbers shows: **the stance is measured**.
           *
           * `PosedEntity` is drawn with `measured`, so `SkinnedBody`
           * differentiates the position it actually draws and hands the speed to
           * `motionFor`. Under a smoothstep that speed is not the move's speed -
           * it is a bump, zero at both ends and half again the average in the
           * middle. So one `move` was drawn as *idle, walk, sometimes run, walk,
           * idle*: the figure slid out of a standing pose, flickered up a clip
           * and slid back into standing, every single time, and `rateFor`'s
           * 0.55-1.6 clamp cannot absorb a ramp that starts at nothing.
           *
           * A constant rate is what `src/domain/studio/shot.ts` has always used
           * for the same verb - `travel()` lerps and nothing there eases - and it
           * is why the studio's walks read as walking. Its own test says the part
           * that matters out loud: a move must not cross the walk/run boundary
           * *within itself*, and only a constant rate guarantees that.
           *
           * What is given up is the soft start, and it is not missed: the legs
           * ease in anyway. `easeSpeed` runs the measured speed through a 0.07s
           * time constant before the stance machine ever sees it, so the clip
           * still arrives over about four frames rather than on one.
           */
          x = wasX + (action.x - wasX) * through
          z = wasZ + (action.z - wasZ) * through
          speed = far / span
        } else {
          x = action.x
          z = action.z
        }

        /**
         * Faces where it is going, and **keeps facing that way once it arrives**.
         *
         * The second half is new and is a deliberate departure from the studio,
         * which drops back to the authored angle the instant a walk ends. It can
         * afford to: over there the facing is a separate fold of `turn` actions
         * that travel only borrows while it is moving.
         *
         * Here rotation is one folded value, so leaving it alone while the move
         * ran meant the body span back to whatever it faced before it set off,
         * on the frame it arrived - a walk east that ends looking north, with
         * nothing in the document saying so. A later `turn` still wins, because
         * it is later in the fold, which is the whole point of a fold.
         *
         * Only while there is somewhere to go: a move to where you already are
         * has no direction and would snap the facing to zero.
         */
        if (far > 0.01) {
          rotation = (Math.atan2(action.x - wasX, action.z - wasZ) * 180) / Math.PI
        }
        break
      }

      case 'turn':
        rotation = turnedTo(rotation, action.rotation, smooth(through))
        break

      case 'jump': {
        if (running) {
          // A parabola through the arc: up at the start, down at the end, back
          // on the floor exactly when the action ends.
          y = from.y + action.height * 4 * through * (1 - through)
          airborne = true
        } else {
          y = from.y
        }
        break
      }

      // `play` and `say` move nothing. They are in the same list because they
      // are the same *kind of thing to an author* - something a body does, at a
      // moment, for a while - and `cuesAt` and `sayingAt` read them from here.
      default:
        break
    }
  }

  return { x, y, z, rotation, speed, airborne }
}

/** Every action on one body, for the timeline's row. */
export function actionsOf(timeline: XpTimeline, entity: string): XpAction[] {
  return timeline.actions.filter((one) => one.entity === entity)
}

/**
 * How long an action of a kind runs when it is first placed.
 *
 * A starting point rather than a rule - every kind is resizable - but the right
 * starting point matters more here than it looks: a move placed at half a
 * second is one the author has to drag before they can see whether the walk
 * reads, and a jump placed at four is one that hangs in the air.
 */
export function defaultDuration(kind: ActionKind): number {
  switch (kind) {
    case 'move':
      return 2
    case 'turn':
      return 0.6
    case 'jump':
      return 0.9
    case 'play':
      return 1.5
    case 'say':
      return DEFAULT_LINE_SECONDS
  }
}

// ---------------------------------------------------------------------------
// Between the two halves
// ---------------------------------------------------------------------------

/**
 * An action, as keys.
 *
 * ---------------------------------------------------------------------------
 * Why a movie needs this at all
 * ---------------------------------------------------------------------------
 * An action is a *verb* - "walk over there" - and its virtue is that it is one
 * thing to type and it re-times when you drag its edge. Its cost is that you
 * cannot bend it: a walk that should curve round a table, or pause in the
 * middle, is not a move any more. Keys can say anything and are laborious.
 *
 * So this is the door between them, and it only goes one way cheaply: sample
 * the action at the movie's own frame rate and write what it produced. What
 * comes out is exactly what was on screen a moment ago, which is the property
 * that makes it safe to press - nothing moves when you convert.
 *
 * **At `fps`, not at some resolution of its own.** The samples have to land on
 * frames the movie is actually made of, or a converted walk is subtly different
 * from the walk it replaced, at a rate nobody can see and everybody can feel.
 *
 * `y` comes across only for a jump, and that is deliberate rather than tidy: a
 * move and a turn never touch it, and writing a flat height track for them
 * would pin the body to the floor it happened to be on - so a converted walk
 * could never afterwards be lifted onto a platform.
 */
export function actionAsKeys(
  action: XpAction,
  timeline: XpTimeline,
  from: { x: number; y: number; z: number; rotation: number },
): Tracks {
  if (action.kind === 'play' || action.kind === 'say') return {}

  const step = 1 / Math.max(1, timeline.fps)
  const x: Key[] = []
  const y: Key[] = []
  const z: Key[] = []
  const rotation: Key[] = []

  for (let t = action.t; t <= action.t + action.duration + 0.0001; t += step) {
    const moment = Math.min(t, action.t + action.duration)
    const acted = actedAt(timeline, action.entity, moment, from)
    const at = Math.round(moment * 100) / 100

    // `linear`, because the easing is already *in* the samples - a dense track
    // with `smooth` between every pair would ease each frame gap as well, which
    // is the same mistake `./clips` records about baking a keyed clip.
    if (action.kind === 'move') {
      x.push({ t: at, value: acted.x, ease: 'linear' })
      z.push({ t: at, value: acted.z, ease: 'linear' })
      rotation.push({ t: at, value: acted.rotation, ease: 'linear' })
    }
    if (action.kind === 'turn') rotation.push({ t: at, value: acted.rotation, ease: 'linear' })
    if (action.kind === 'jump') y.push({ t: at, value: acted.y, ease: 'linear' })
  }

  return {
    ...(x.length > 0 ? { x } : {}),
    ...(y.length > 0 ? { y } : {}),
    ...(z.length > 0 ? { z } : {}),
    ...(rotation.length > 0 ? { rotation } : {}),
  }
}

/**
 * And keys back to an action, when they are simple enough to be one.
 *
 * ---------------------------------------------------------------------------
 * "When possible" is the whole of it
 * ---------------------------------------------------------------------------
 * Asked for as *"keyframe to action when possible, when you have two keys that
 * are just x y z"*, and the qualifier is the design. A move is a **straight
 * walk from A to B over a span**; keys can describe far more than that, and a
 * conversion that flattened a curve into a straight line would silently throw
 * away the thing the author had bothered to key.
 *
 * So it refuses unless the keys really are that shape:
 *
 * - **Exactly two moments.** Three is a path, not a walk.
 * - **They agree.** `x` and `z` keyed at different times are two edits, not one
 *   move.
 * - **Nothing else is keyed across them** except `rotation`, which a move
 *   drives itself and can therefore absorb.
 *
 * Null when any of those fails, and the panel offers no button - which is
 * better than a button that refuses, because "when possible" is a fact about
 * the keys and an author can see it in the row.
 */
export function keysAsAction(
  tracks: Tracks | undefined,
  entity: string,
): Extract<XpAction, { kind: 'move' }> | null {
  if (!tracks) return null

  const x = tracks.x
  const z = tracks.z
  if (!x || !z || x.length !== 2 || z.length !== 2) return null
  if (Math.abs(x[0]!.t - z[0]!.t) > 0.02) return null
  if (Math.abs(x[1]!.t - z[1]!.t) > 0.02) return null

  // Anything else keyed makes this more than a walk. `rotation` is the one
  // exception, because a move sets the facing itself.
  const others = Object.keys(tracks).filter(
    (property) => !['x', 'z', 'rotation'].includes(property) && (tracks[property]?.length ?? 0) > 0,
  )
  if (others.length > 0) return null

  const duration = Math.round((x[1]!.t - x[0]!.t) * 100) / 100
  if (duration <= 0) return null

  return { kind: 'move', entity, t: x[0]!.t, duration, x: x[1]!.value, z: z[1]!.value }
}
