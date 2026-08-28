import { DOUBLE_JUMP_AIRTIME, JUMP_AIRTIME } from '@/domain/lounge/jump'
import { EMOTE_COUNT, EMOTE_DURATION_MS } from '@/domain/world/emotes'

/**
 * What an actor *does*, as a list of beats on a timeline.
 *
 * The other half of the motion document - see the note in
 * `@/domain/studio/keys` about why there are two. Keys interpolate a number and
 * know nothing about what the number is for; an action is a verb, and carries
 * with it everything that verb implies: a walk picks its own clip and turns the
 * body to face the way it is going, a jump uses the arc the game's controller
 * uses, a line of dialogue holds for as long as it takes to read.
 *
 * ---------------------------------------------------------------------------
 * Why one flat list per actor rather than a track per kind
 * ---------------------------------------------------------------------------
 * The first version had a `path`, a `jumps` and an `emotes` on every peep, and
 * adding a fourth verb meant a fourth array in the document, a fourth block in
 * the panel and a fourth clause in the sampler. It also made the interesting
 * question - what is the fox doing at 4.2 seconds - something you answered by
 * reading three lists side by side.
 *
 * One ordered list of actions answers it directly, is what the timeline draws
 * without translation, and makes a new verb a case in one switch.
 *
 * ---------------------------------------------------------------------------
 * Why every action has a duration, including the instant ones
 * ---------------------------------------------------------------------------
 * A jump takes as long as the arc takes and an emote holds for as long as the
 * live bubble holds - neither is a choice - but both still *occupy* time, and a
 * timeline that draws them as zero-width ticks is one you cannot grab. So the
 * duration is on every action and the ones that do not own theirs are given the
 * length they actually last, with `resizable` saying which is which.
 */

export type ActionKind =
  | 'move'
  | 'turn'
  | 'jump'
  | 'kick'
  | 'hit'
  | 'shake'
  | 'dance'
  | 'talk'
  | 'emote'

interface Beat {
  /** Seconds from the start of the shot. */
  t: number
  /** How long it takes. Never zero - see the note above. */
  duration: number
}

export type Action =
  /** Walk or run to a spot. The clip and the facing come out of the speed. */
  | (Beat & { kind: 'move'; x: number; z: number })
  /** Turn on the spot to face an angle. */
  | (Beat & { kind: 'turn'; rotation: number })
  /** Leave the floor, on the game's own arc. `air` is the second jump. */
  | (Beat & { kind: 'jump'; air: boolean })
  /** A leg out, forward. */
  | (Beat & { kind: 'kick' })
  /** A shoulder in, forward. */
  | (Beat & { kind: 'hit' })
  /** Wobble on the spot, for a no or a shiver. */
  | (Beat & { kind: 'shake' })
  | (Beat & { kind: 'dance' })
  /** A line, in a bubble over the head - and out loud, if the voice is on. */
  | (Beat & { kind: 'talk'; text: string })
  | (Beat & { kind: 'emote'; emote: number })

// ---------------------------------------------------------------------------
// What each verb is
// ---------------------------------------------------------------------------

/** How long the live bubble holds a face, in seconds. Shared with the world. */
export const EMOTE_HOLD = EMOTE_DURATION_MS / 1000

/** How long a jump of each kind keeps somebody off the floor. */
export const jumpLength = (air: boolean) => (air ? DOUBLE_JUMP_AIRTIME : JUMP_AIRTIME)

/** A swing - kick or hit - from wind-up to back on the feet. */
export const SWING = 0.5

/** One wobble of a shake. The action's duration is however many of these fit. */
export const SHAKE_CYCLE = 0.32

/**
 * How long a line stays up, from its length.
 *
 * Roughly the reading speed everybody uses for subtitles - a little over three
 * words a second - with a floor so that "hey!" does not flash past. The author
 * can drag the clip afterwards; this is only what it starts as.
 */
export function talkDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.min(12, Math.max(1.2, 0.9 + words * 0.32))
}

export interface ActionMeta {
  kind: ActionKind
  label: string
  /** Whether the author sets the length, or the verb owns it. */
  resizable: boolean
  /** Timeline colour, as a Tailwind class pair. */
  tone: string
  /**
   * The lucide icon's name, rather than the component.
   *
   * A name, because this module is the document's vocabulary and is imported by
   * the sampler and the tests - neither of which should pull a React icon set
   * into a bun test run. The panel maps the name to a component.
   */
  icon: string
}

export const ACTION_META: Record<ActionKind, ActionMeta> = {
  move: {
    kind: 'move',
    label: 'Move',
    resizable: true,
    tone: 'bg-sky-500/70 border-sky-300/60',
    icon: 'Footprints',
  },
  turn: {
    kind: 'turn',
    label: 'Turn',
    resizable: true,
    tone: 'bg-cyan-500/60 border-cyan-300/60',
    icon: 'RotateCw',
  },
  jump: {
    kind: 'jump',
    label: 'Jump',
    resizable: false,
    tone: 'bg-emerald-500/70 border-emerald-300/60',
    icon: 'ArrowBigUp',
  },
  kick: {
    kind: 'kick',
    label: 'Kick',
    // The swing is a curve over the clip's own length, so stretching it is a
    // slower kick rather than a broken one.
    resizable: true,
    tone: 'bg-orange-500/70 border-orange-300/60',
    icon: 'Zap',
  },
  hit: {
    kind: 'hit',
    label: 'Hit',
    resizable: true,
    tone: 'bg-red-500/70 border-red-300/60',
    icon: 'Swords',
  },
  shake: {
    kind: 'shake',
    label: 'Shake',
    resizable: true,
    tone: 'bg-amber-500/70 border-amber-300/60',
    icon: 'Wind',
  },
  dance: {
    kind: 'dance',
    label: 'Dance',
    resizable: true,
    tone: 'bg-fuchsia-500/70 border-fuchsia-300/60',
    icon: 'Music',
  },
  talk: {
    kind: 'talk',
    label: 'Talk',
    resizable: true,
    tone: 'bg-violet-500/70 border-violet-300/60',
    icon: 'MessageCircle',
  },
  emote: {
    kind: 'emote',
    label: 'Emote',
    /*
     * Resizable, unlike the live bubble it borrows its default from.
     *
     * `EMOTE_HOLD` is how long a face stays up in the lounge, where three
     * seconds is right because somebody is about to pull another one. A shot is
     * composed, and how long a reaction lands for is a timing decision like any
     * other - the fox laughing for six seconds is the joke in at least one of
     * the shipped templates.
     */
    resizable: true,
    tone: 'bg-pink-500/70 border-pink-300/60',
    icon: 'Smile',
  },
}

/** The order the "add" menu offers them in: movement, contact, expression. */
export const ACTION_KINDS: readonly ActionKind[] = [
  'move',
  'turn',
  'jump',
  'kick',
  'hit',
  'shake',
  'dance',
  'talk',
  'emote',
]

/**
 * A new action of a kind, at a moment.
 *
 * `where` is the actor's position at that moment, so a fresh move starts as a
 * pause on the spot rather than a teleport to the origin - the first thing
 * anybody does with a new move is drag its destination, and starting it at
 * 0,0 means every one of them is a diagonal sprint across the field first.
 */
export function newAction(
  kind: ActionKind,
  t: number,
  where: { x: number; z: number; rotation: number },
): Action {
  switch (kind) {
    case 'move':
      return { kind, t, duration: 2, x: where.x, z: where.z }
    case 'turn':
      return { kind, t, duration: 0.6, rotation: where.rotation }
    case 'jump':
      // The clip is exactly as long as the arc, because the arc's length is not
      // a thing the author gets to choose - it is the game's, and a shot whose
      // jump hangs differently is advertising a different game.
      return { kind, t, duration: JUMP_AIRTIME, air: false }
    case 'kick':
    case 'hit':
      return { kind, t, duration: SWING }
    case 'shake':
      return { kind, t, duration: SHAKE_CYCLE * 3 }
    case 'dance':
      return { kind, t, duration: 3 }
    case 'talk':
      return { kind, t, duration: talkDuration('Hello!'), text: 'Hello!' }
    case 'emote':
      return { kind, t, duration: EMOTE_HOLD, emote: 2 }
  }
}

/** What the timeline writes on the clip. */
export function actionLabel(action: Action): string {
  switch (action.kind) {
    case 'move':
      return `Move ${action.x.toFixed(1)}, ${action.z.toFixed(1)}`
    case 'turn':
      return `Turn ${Math.round(action.rotation)}°`
    case 'jump':
      return action.air ? 'Double jump' : 'Jump'
    case 'talk':
      return action.text.length > 24 ? `${action.text.slice(0, 23)}…` : action.text
    case 'emote':
      return `Emote ${action.emote}`
    default:
      return ACTION_META[action.kind].label
  }
}

// ---------------------------------------------------------------------------
// Reading one back
// ---------------------------------------------------------------------------

const MAX_DURATION = 120

function number(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** Longest thing anybody says in one bubble. */
export const MAX_LINE = 120

/**
 * An action from whatever was in the URL, or nothing.
 *
 * Dropped rather than defaulted when the kind is unreadable: unlike a peep's
 * avatar, where an unknown name has an obvious substitute, there is no sensible
 * action to put in place of one nobody can name.
 */
export function parseAction(value: unknown): Action | null {
  const raw = (value ?? {}) as Record<string, unknown>
  const kind = raw.kind
  if (typeof kind !== 'string' || !(kind in ACTION_META)) return null

  const t = number(raw.t, 0, 0, MAX_DURATION)
  // Floored well above zero: a clip with no width cannot be grabbed in the
  // timeline, and a `move` of zero seconds is a division by zero in the sampler.
  const duration = number(raw.duration, 1, 0.05, MAX_DURATION)

  switch (kind as ActionKind) {
    case 'move':
      return {
        kind: 'move',
        t,
        duration,
        x: number(raw.x, 0, -40, 40),
        z: number(raw.z, 0, -40, 40),
      }
    case 'turn':
      return { kind: 'turn', t, duration, rotation: number(raw.rotation, 0, -360, 360) }
    case 'jump': {
      // The authored duration is discarded rather than clamped: a jump's length
      // is the arc's, so the only honest width for the clip is the real one.
      const air = raw.air === true
      return { kind: 'jump', t, duration: jumpLength(air), air }
    }
    case 'kick':
      return { kind: 'kick', t, duration }
    case 'hit':
      return { kind: 'hit', t, duration }
    case 'shake':
      return { kind: 'shake', t, duration }
    case 'dance':
      return { kind: 'dance', t, duration }
    case 'talk': {
      const text = typeof raw.text === 'string' ? raw.text.slice(0, MAX_LINE) : ''
      // A line with nothing in it draws an empty bubble and says nothing out
      // loud, which is a clip that only exists to be confusing.
      if (text.trim().length === 0) return null
      return { kind: 'talk', t, duration, text }
    }
    case 'emote': {
      if (typeof raw.emote !== 'number' || raw.emote < 0 || raw.emote >= EMOTE_COUNT) return null
      return { kind: 'emote', t, duration, emote: Math.floor(raw.emote) }
    }
  }
}

/**
 * Ordered by time, because everything that samples them assumes it.
 *
 * Sorted rather than rejected, for the reason the old waypoint list gave: the
 * editor inserts at the playhead, so scrubbing backwards and adding one is an
 * ordinary thing to do and the only sensible reading of it is the ordered one.
 */
export function ordered<T extends { t: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.t - b.t)
}
