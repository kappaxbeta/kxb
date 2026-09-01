/**
 * Keyframes, for any numeric property of anything.
 *
 * The motion studio started with three hand-written tracks - a path, a jump
 * list, an emote list - each with its own sampler and its own row in the panel.
 * That is the right shape for the first three things that move and the wrong
 * one for the fourth: every new animatable property was a field on a document,
 * a clause in `sceneAt`, a control in the panel and a test, and the four never
 * quite agreed.
 *
 * This is the generic half. A node carries a bag of keyed properties, the
 * sampler below turns one into a number at a time, and `ANIMATABLE` says which
 * properties a given kind of node has. Adding "a ball's radius can pulse" is
 * then a row in a table rather than a feature.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately *not* keyframed
 * ---------------------------------------------------------------------------
 * A peep's walk. Keys interpolate a number between two moments, which is the
 * right model for a light dimming and the wrong one for an animal crossing a
 * field - that needs a clip chosen from the speed, feet that keep up with the
 * ground, and a body that turns to face where it is going. Those live in
 * `@/domain/studio/action`, which is the other half.
 *
 * The two meet in `sceneAt`: actions describe what somebody does, keys override
 * any property outright. A key always wins, because the only reason to reach
 * for one on a property an action already drives is to say "no, exactly here" -
 * and it wins from its own moment onwards, never before it. See `sampleKeys`.
 */

/** How a value gets from this key to the next. */
export type Ease = 'hold' | 'linear' | 'smooth'

export const EASES: readonly Ease[] = ['hold', 'linear', 'smooth']

export interface Key {
  /** Seconds from the start of the shot. */
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
export type Tracks = Record<string, Key[]>

const smoothstep = (u: number) => u * u * (3 - 2 * u)

/**
 * One property at one moment.
 *
 * Holds after the last key rather than extrapolating: keys placed between one
 * and three seconds describe a two-second change, and past three the value is
 * the one they were left at. There is nothing else it could be - the keys have
 * taken the property over by then.
 *
 * *Before* the first key it is the node's own value, the one the sliders set.
 * That asymmetry is the whole point. Keying `y` at 0.3 to put somebody on a
 * platform means "be up there from 0.3", and holding the first key backwards
 * makes it mean "be up there for the entire shot" instead - a key that is
 * placed at one moment and silently rewrites every moment before it. Nothing in
 * the panel says that, and the only way out of it is a second key nobody was
 * told they needed.
 *
 * A first key written by the panel's button pins the value the node already
 * has, so this changes nothing until the value is edited - which is exactly the
 * moment somebody meant to say "from here on, different".
 */
export function sampleKeys(keys: Key[] | undefined, t: number, fallback: number): number {
  if (!keys || keys.length === 0) return fallback
  if (t < keys[0].t) return fallback
  if (keys.length === 1) return keys[0].value

  const last = keys[keys.length - 1]
  if (t >= last.t) return last.value

  let index = 0
  while (index < keys.length - 2 && keys[index + 1].t <= t) index += 1

  const from = keys[index]
  const to = keys[index + 1]
  if (from.ease === 'hold') return from.value

  const span = to.t - from.t
  // Two keys at the same instant is a step, and dividing by the span would make
  // it a NaN instead.
  const raw = span <= 0 ? 1 : (t - from.t) / span
  const u = from.ease === 'smooth' ? smoothstep(raw) : raw
  return from.value + (to.value - from.value) * u
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

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

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
export function putKey(keys: Key[] | undefined, key: Key): Key[] {
  const others = (keys ?? []).filter((existing) => Math.abs(existing.t - key.t) > SAME)
  return [...others, key].sort((a, b) => a.t - b.t)
}

export function putTrackKey(tracks: Tracks, property: string, key: Key): Tracks {
  return { ...tracks, [property]: putKey(tracks[property], key) }
}

/** A key dropped. The property goes with it when it was the last one. */
export function dropKey(tracks: Tracks, property: string, index: number): Tracks {
  const kept = (tracks[property] ?? []).filter((_, i) => i !== index)
  const next = { ...tracks }
  if (kept.length === 0) delete next[property]
  else next[property] = kept
  return next
}

// ---------------------------------------------------------------------------
// What can be keyed
// ---------------------------------------------------------------------------

export type NodeKind = 'peep' | 'block' | 'ball' | 'goal' | 'light'

export interface Animatable {
  property: string
  label: string
  min: number
  max: number
  step: number
  unit?: string
}

/**
 * Every property the studio will animate, by what it hangs off.
 *
 * One table, read by three things that would otherwise drift: the parser clamps
 * against it, the inspector renders a slider per row, and the timeline names
 * the key rows from it. The bounds are the same ones the still studio's parser
 * uses, because a value that is illegal in a frame does not become legal by
 * being reached gradually.
 */
export const ANIMATABLE: Record<NodeKind, readonly Animatable[]> = {
  peep: [
    { property: 'x', label: 'X', min: -40, max: 40, step: 0.1 },
    { property: 'y', label: 'Height', min: -8, max: 24, step: 0.1 },
    { property: 'z', label: 'Z', min: -40, max: 40, step: 0.1 },
    { property: 'rotation', label: 'Facing', min: -360, max: 360, step: 1, unit: '°' },
    { property: 'tilt', label: 'Lean', min: -80, max: 80, step: 1, unit: '°' },
    { property: 'scale', label: 'Size', min: 0.2, max: 4, step: 0.05 },
    { property: 'emoteHeight', label: 'Bubble up', min: 0, max: 12, step: 0.05 },
    { property: 'emoteSize', label: 'Bubble size', min: 0.2, max: 3, step: 0.05 },
  ],
  block: [
    { property: 'x', label: 'X', min: -40, max: 40, step: 0.1 },
    { property: 'top', label: 'Height', min: -8, max: 24, step: 0.1 },
    { property: 'z', label: 'Z', min: -40, max: 40, step: 0.1 },
    { property: 'rotation', label: 'Turn', min: -360, max: 360, step: 1, unit: '°' },
    // The other two axes. Keyable like the turn, so a galaxy can roll over
    // during a shot rather than only being placed rolled.
    { property: 'pitch', label: 'Pitch', min: -360, max: 360, step: 1, unit: '°' },
    { property: 'roll', label: 'Roll', min: -360, max: 360, step: 1, unit: '°' },
    // Keyable, like a peep's, which is what makes a prop able to arrive: a
    // galaxy keyed from 0 to 1 over a third of a second plops into the shot,
    // and the same two keys the other way take it out again. The bounds are
    // `MIN`/`MAX_THING_SCALE`, so a size means the same here as in a room.
    { property: 'scale', label: 'Size', min: 0.1, max: 12, step: 0.05 },
  ],
  ball: [
    { property: 'x', label: 'X', min: -40, max: 40, step: 0.1 },
    { property: 'y', label: 'Height', min: 0, max: 20, step: 0.1 },
    { property: 'z', label: 'Z', min: -40, max: 40, step: 0.1 },
    { property: 'radius', label: 'Size', min: 0.1, max: 3, step: 0.02 },
  ],
  goal: [
    { property: 'x', label: 'X', min: -40, max: 40, step: 0.1 },
    { property: 'z', label: 'Z', min: -40, max: 40, step: 0.1 },
    { property: 'rotation', label: 'Turn', min: -360, max: 360, step: 1, unit: '°' },
    { property: 'width', label: 'Width', min: 1, max: 20, step: 0.1 },
    { property: 'height', label: 'Height', min: 1, max: 12, step: 0.1 },
  ],
  light: [
    { property: 'azimuth', label: 'Sun from', min: -180, max: 180, step: 1, unit: '°' },
    { property: 'elevation', label: 'Sun height', min: 2, max: 89, step: 1, unit: '°' },
    { property: 'sun', label: 'Sun', min: 0, max: 8, step: 0.05 },
    { property: 'ambient', label: 'Ambient', min: 0, max: 4, step: 0.05 },
    { property: 'hemisphere', label: 'Sky bounce', min: 0, max: 4, step: 0.05 },
    { property: 'rim', label: 'Neon rim', min: 0, max: 4, step: 0.05 },
  ],
}

export function animatable(kind: NodeKind, property: string): Animatable | undefined {
  return ANIMATABLE[kind].find((entry) => entry.property === property)
}

/**
 * A node's keys, validated.
 *
 * Unknown property names are dropped rather than kept: they come out of a query
 * string, nothing downstream would ever read them, and keeping them would mean
 * the timeline drawing a row for a property no inspector can edit.
 */
export function parseTracks(value: unknown, kind: NodeKind): Tracks {
  const raw = (value ?? {}) as Record<string, unknown>
  const tracks: Tracks = {}

  for (const entry of ANIMATABLE[kind]) {
    const keys = raw[entry.property]
    if (!Array.isArray(keys)) continue

    const parsed = keys
      .slice(0, 64)
      .map((key) => {
        const one = (key ?? {}) as Record<string, unknown>
        const time = typeof one.t === 'number' && Number.isFinite(one.t) ? one.t : 0
        const number = typeof one.value === 'number' && Number.isFinite(one.value)
          ? one.value
          : entry.min
        const ease = typeof one.ease === 'string' && EASES.includes(one.ease as Ease)
          ? (one.ease as Ease)
          : 'smooth'
        return {
          t: Math.max(0, time),
          value: Math.min(entry.max, Math.max(entry.min, number)),
          ease,
        }
      })
      .sort((a, b) => a.t - b.t)

    if (parsed.length > 0) tracks[entry.property] = parsed
  }

  return tracks
}
