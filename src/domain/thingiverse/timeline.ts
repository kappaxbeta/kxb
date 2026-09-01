import type { ThingDeed, ThingWhen } from '@/domain/thingiverse/blueprint'

/**
 * A thing's own animation, written as a list of the deeds it already has.
 *
 * ---------------------------------------------------------------------------
 * Why a timeline is not a second animation system
 * ---------------------------------------------------------------------------
 * A blueprint could already do one thing at a time forever: `ThingAction` says
 * "when somebody is near, spin", and that is the whole of it. What it cannot
 * say is *and then* - the lid opens, waits, and shuts; the sign flashes twice;
 * the machine plays its clip, drops the ball and stops. Every one of those is
 * the same four verbs the room already keeps promises about, in an order, with
 * gaps.
 *
 * So this is not a keyframe format and deliberately holds no transforms. A
 * curve over position and rotation would be a second, richer, incompatible way
 * to move a thing - one the pose animator already owns for *bodies*, one the XP
 * runtime owns for levels, and one a room would then own for furniture. Three
 * spellings of "move over time" is how a product ends up with three editors.
 * A cue names a moment and a verb, and what that verb looks like stays where it
 * has always been, in `_sim/thing-actions.ts`, with one definition.
 *
 * ---------------------------------------------------------------------------
 * Cues address parts, and that is the whole reason this is worth having
 * ---------------------------------------------------------------------------
 * A blueprint is a root model with pieces bolted to it (see `BlueprintPart`),
 * and a timeline that could only address the whole thing would spin the market
 * stall rather than its sign. A cue names the part it happens to, or names
 * nothing and means the thing itself.
 *
 * ---------------------------------------------------------------------------
 * What a cue means until the next one
 * ---------------------------------------------------------------------------
 * Two of the four deeds are states and two are moments, and a timeline has to
 * read them differently or half of them do nothing:
 *
 *   - `spin` and `bob` are *held*. A cue starts one and it runs on that part
 *     until another cue on that same part says otherwise. This is what makes a
 *     gap between two cues mean something.
 *   - `play` and `vanish` are *fired*. They happen once, as the clock crosses
 *     the cue, and asking whether they are "still true" a second later is not a
 *     question with an answer. So are the four that arrived with the machine -
 *     `emit`, `become`, `attack` and `shoot` - and for exactly that reason: a
 *     word has been shouted or it has not, and a shot has left the barrel or it
 *     has not. Nothing is holding any of them.
 *
 *     `become` on a timeline is the one worth pausing on, because it can end
 *     the run that fired it: a cue that moves the thing to a state is a cue
 *     that may replace the timeline it is in. That is allowed and is what a
 *     firing sequence is - wind up, fire, become `spent` - and the runtime
 *     resolves it the obvious way, by letting the machine win. A timeline is a
 *     performance and a state is what the thing *is*.
 *   - `still` is the fifth word, and exists because there is no other way to
 *     say "stop". It is not a deed - nothing can be triggered by an action to
 *     do it - which is why it lives here rather than in `THING_DEEDS`.
 */

/** Ending whatever that target was doing. See the note above. */
export const CUE_STILL = 'still'

/**
 * Which deeds keep going, and which happen once.
 *
 * Stated as data rather than as a branch in the sampler because both the editor
 * and the renderer have to agree about it: a timeline drawn with `play` as a
 * bar and read with `play` as a moment would be a picture of something the room
 * never does.
 *
 * Between them they are `THING_DEEDS`, and the list is written out here rather
 * than imported and partitioned. That is not a preference: a blueprint carries
 * a timeline, so `blueprint.ts` imports this file, and this file importing a
 * *value* back out of it is a cycle - which in a bundle is not a warning, it is
 * a constant that is undefined for however long the two modules take to settle.
 * A test asserts the two halves still add up to the four deeds a room has.
 */
export const HELD_DEEDS: readonly ThingDeed[] = ['spin', 'bob']
export const FIRED_DEEDS: readonly ThingDeed[] = [
  'play',
  'vanish',
  'emit',
  'become',
  'attack',
  'shoot',
]

/** What one cue may ask for: any deed, or an end to the one before it. */
export const CUE_DEEDS = [...HELD_DEEDS, ...FIRED_DEEDS, CUE_STILL] as const
export type CueDeed = (typeof CUE_DEEDS)[number]

/** How long the clip name a cue carries may be. The same bound an action's has. */
export const MAX_CUE_VALUE = 64

/** How many cues one timeline may carry. */
export const MAX_TIMELINE_CUES = 24

/**
 * How long one run may be, in seconds, and the grid a cue sits on.
 *
 * A minute, because past that nobody in the room is still watching the thing
 * that started it, and twentieths of a second because that is about the finest
 * gap two cues can have and still read as two events rather than as one. The
 * grid is also what makes two cues at "the same time" actually equal, which the
 * sampler depends on when it decides which one wins.
 */
export const MAX_TIMELINE_SECONDS = 60
export const MIN_TIMELINE_SECONDS = 0.2
export const CUE_STEP = 0.05

/** One moment in a run: what happens, to which piece, and when. */
export interface Cue {
  /** Seconds from the start of the run. On the `CUE_STEP` grid. */
  at: number
  /**
   * Which piece it happens to, by its place in `spec.parts`, or absent for the
   * thing itself.
   *
   * An index rather than a name because a `BlueprintPart` has no name: it is a
   * model, a place and a turn, and the composer has always addressed the pieces
   * by where they are in the list. A cue pointing past the end does nothing,
   * which is what unbolting a piece leaves behind.
   */
  part?: number
  deed: CueDeed
  /** The clip `play` plays. Ignored by the rest. */
  value?: string
}

/** A thing's animation: what starts it, how long it runs, and what happens. */
export interface Timeline {
  /** What sets it going. The same three words an action uses. */
  when: ThingWhen
  /** How long one run is, in seconds. */
  length: number
  /** Whether it starts again at the end. */
  loop: boolean
  cues: readonly Cue[]
}

/** What a fresh timeline is: two seconds, looping, empty. */
export function freshTimeline(): Timeline {
  return { when: 'always', length: 2, loop: true, cues: [] }
}

/** What a cue with no part means: the thing itself rather than a piece of it. */
export const WHOLE = -1

/** The key a cue's target is filed under. See `WHOLE`. */
export function targetOf(cue: Cue): number {
  return cue.part ?? WHOLE
}

/** Snap a time onto the grid cues sit on, and inside the run. */
export function onBeat(at: number, length: number): number {
  const snapped = Math.round(at / CUE_STEP) * CUE_STEP
  const inside = Math.min(length, Math.max(0, snapped))
  // Tenths of a step, so 0.30000000000000004 is not a different time from 0.3.
  return Math.round(inside * 1000) / 1000
}

/**
 * What is wrong with a timeline, in the words somebody set it in.
 *
 * How many pieces there are is passed in rather than read off a blueprint,
 * because this runs in the editor while a part is being deleted and in the
 * decider after it already has been, and only the caller knows how many exist
 * at that moment.
 */
export function timelineProblems(timeline: Timeline, parts = 0): string[] {
  const problems: string[] = []

  if (
    !Number.isFinite(timeline.length) ||
    timeline.length < MIN_TIMELINE_SECONDS ||
    timeline.length > MAX_TIMELINE_SECONDS
  ) {
    problems.push(
      `A run is between ${MIN_TIMELINE_SECONDS} and ${MAX_TIMELINE_SECONDS} seconds.`,
    )
  }

  if (timeline.cues.length > MAX_TIMELINE_CUES) {
    problems.push(`A timeline holds ${MAX_TIMELINE_CUES} cues.`)
  }

  for (const cue of timeline.cues) {
    if (!CUE_DEEDS.includes(cue.deed)) {
      problems.push(`A thing cannot "${cue.deed}".`)
    }

    if (!Number.isFinite(cue.at) || cue.at < 0 || cue.at > timeline.length) {
      problems.push('A cue sits inside the run.')
    }

    if (
      cue.part !== undefined &&
      (!Number.isInteger(cue.part) || cue.part < 0 || cue.part >= parts)
    ) {
      problems.push('A cue points at a piece this thing does not have.')
    }

    if (cue.value !== undefined && cue.value.length > MAX_CUE_VALUE) {
      problems.push(`A cue's clip name is at most ${MAX_CUE_VALUE} characters.`)
    }
  }

  return problems
}

/** What a thing is doing at one moment, and what it should do right now. */
export interface Playing {
  /** Which held deed each target is in the middle of. See `targetOf`. */
  holds: ReadonlyMap<number, ThingDeed>
  /** The one-shots crossed since the last look, in the order they were crossed. */
  fires: readonly Cue[]
  /** Whether the run has finished. Never true while looping. */
  done: boolean
}

/**
 * Read a timeline between two moments.
 *
 * Two moments rather than one, because half the answer is a *crossing*: a
 * `play` cue at 1.4s has to fire exactly once, and a renderer that asked "what
 * is happening at 1.4s" sixty times a second would either fire it several times
 * or miss it entirely depending on where the frames landed. So the caller says
 * where it looked last and where it is looking now, and everything between the
 * two is answered at once.
 *
 * Both are seconds since the run began, and may be past its end: the wrap is
 * done here rather than by the caller, because a caller that wrapped its own
 * clock would have to solve the crossing problem a second time on the seam -
 * and the seam is exactly where a looping timeline drops its first cue.
 */
export function playing(timeline: Timeline, before: number, now: number): Playing {
  const length = Math.max(CUE_STEP, timeline.length)
  const ordered = [...timeline.cues].sort((a, b) => a.at - b.at)

  const ended = !timeline.loop && now >= length
  const at = timeline.loop ? now % length : Math.min(now, length)

  const holds = new Map<number, ThingDeed>()
  for (const cue of ordered) {
    if (cue.at > at) break
    const target = targetOf(cue)
    if (cue.deed === CUE_STILL) holds.delete(target)
    else if (HELD_DEEDS.includes(cue.deed)) holds.set(target, cue.deed)
  }

  return { holds, fires: crossed(ordered, length, before, now, timeline.loop), done: ended }
}

/**
 * The one-shots between two moments, laps included.
 *
 * A frame is long enough to cross a whole short loop when a tab has been in the
 * background, so this walks the laps rather than assuming there is at most one
 * seam. It stops at a lap's worth of cues per call: a thing that was off screen
 * for a minute should carry on from where it is, not replay the minute.
 */
function crossed(
  ordered: readonly Cue[],
  length: number,
  before: number,
  now: number,
  loop: boolean,
): Cue[] {
  const shots = ordered.filter(
    (cue) => cue.deed !== CUE_STILL && FIRED_DEEDS.includes(cue.deed),
  )
  if (shots.length === 0 || now <= before) return []

  const fires: Cue[] = []
  const laps = loop ? Math.min(Math.floor(now / length) - Math.floor(before / length), 1) : 0

  if (laps === 0) {
    const from = loop ? before % length : before
    const to = loop ? now % length : Math.min(now, length)
    // A non-looping run that has already ended crosses nothing more.
    if (to >= from) for (const cue of shots) if (cue.at > from && cue.at <= to) fires.push(cue)
    return fires
  }

  const from = before % length
  const to = now % length
  for (const cue of shots) if (cue.at > from) fires.push(cue)
  for (const cue of shots) if (cue.at <= to) fires.push(cue)
  return fires
}
