import { ACTION_META, type Action } from '@/domain/studio/action'
import { lookLabel } from '@/domain/studio/scene'
import type { Actor, ShotSpec } from '@/domain/studio/shot'

/**
 * A shot, as words on a page.
 *
 * ---------------------------------------------------------------------------
 * Why a shot needs a reading of itself that is not a picture
 * ---------------------------------------------------------------------------
 * Everything else the studio exports is pixels: a WebM, a transparent WebP, a
 * still. Pixels are the wrong container for the one part of a shot that is
 * *language*. A line burned into a bubble cannot be translated, cannot be
 * searched, cannot be pasted into a subtitle track, and cannot be checked by
 * anybody who is not willing to sit through the video with their finger on the
 * pause key. The words exist in the document as text and stop being text at
 * the moment they are drawn, which is precisely backwards.
 *
 * So this is the other export. `dialogue` in `@/domain/studio/shot` already
 * knows every line and who says it, because the voice needed that; this turns
 * the same pull into something a person reads, and `hush` in
 * `@/domain/studio/scene` is what takes the bubbles back out of the frame when
 * you are going to use it.
 *
 * ---------------------------------------------------------------------------
 * Two readings, one timeline
 * ---------------------------------------------------------------------------
 * `dialogue` is the script as an actor wants it: who spoke, what they said,
 * when. Nothing else, because a list where every second line is "the fox turns
 * 40°" is a list nobody proof-reads to the end.
 *
 * `script` is the same timeline with the verbs left in, which is what you want
 * when the question is about the *shot* rather than about the writing - what
 * is anybody doing while that line is up, does the walk land before it starts,
 * is the second half of this thing just three animals standing still.
 *
 * They are one function with a filter rather than two functions, because the
 * ordering, the naming and the timecodes are the whole of the work and having
 * two copies of them is how a transcript comes to disagree with a video.
 *
 * ---------------------------------------------------------------------------
 * Why the timecode is on every line
 * ---------------------------------------------------------------------------
 * The file is only worth anything next to the footage. A tenth of a second is
 * the resolution the studio authors at - `talkDuration` deals in tenths, the
 * timeline drags in them - and it is enough to find a beat in an editor. Whole
 * seconds would round two lines of a fast exchange onto the same mark.
 *
 * There is no React and no browser here on purpose: the transcript of a shot
 * is a property of the document, so a script can write one without a canvas.
 * The download itself is `downloadText` in the backoffice, which is the only
 * part that needs a tab.
 */

/** Which reading of the shot. See the note above. */
export type TranscriptMode = 'dialogue' | 'script'

/**
 * One entry in a transcript: a time, somebody, and either a line or a deed.
 *
 * `said` and `did` are exclusive - a `talk` beat carries the text and nothing
 * else, everything else carries a sentence and no text - and both are on the
 * type rather than in a union so a renderer is a single template. Which one is
 * filled is `kind`, which is kept because a caller that wants to colour or
 * filter by verb should not be parsing English back out.
 */
export interface Beat {
  /** Seconds from the start of the shot. */
  at: number
  /** How long the beat occupies, in seconds. */
  length: number
  /** Whose beat it is, already disambiguated across the cast. */
  who: string
  kind: Action['kind']
  /** What they said, for a `talk` beat. Null for every other verb. */
  said: string | null
  /** What they did, in words. Null for a `talk` beat. */
  did: string | null
}

/**
 * What to call each actor, with no two of them called the same thing.
 *
 * A row's own name if it has one, the animal otherwise - the same fallback the
 * cast list in the panel draws. The numbering is the part that matters: a shot
 * with two unnamed penguins is a completely ordinary shot, and a transcript
 * with two speakers called PENGUIN is unreadable in a way that is not obvious
 * until somebody tries to use it. Every member of a colliding group is
 * numbered, including the first, because "PENGUIN and PENGUIN 2" reads as one
 * named character and one afterthought.
 */
export function castNames(shot: ShotSpec): string[] {
  const plain = shot.cast.map((actor: Actor) => (actor.name.trim() || lookLabel(actor.avatar)).trim())

  const seen = new Map<string, number>()
  for (const name of plain) seen.set(name, (seen.get(name) ?? 0) + 1)

  const used = new Map<string, number>()
  return plain.map((name) => {
    if ((seen.get(name) ?? 0) < 2) return name
    const nth = (used.get(name) ?? 0) + 1
    used.set(name, nth)
    return `${name} ${nth}`
  })
}

/**
 * A verb, as a sentence about the actor doing it.
 *
 * A switch over the kind rather than a lookup table, so a new verb in
 * `@/domain/studio/action` fails to compile here until somebody has decided
 * what it is called in a transcript. `ACTION_META.label` is not that decision:
 * it is a word on a timeline block, and "Move" is not a sentence.
 *
 * Coordinates are one decimal because the stage is measured in blocks and
 * nobody stages anything to a millimetre; the same rounding is what keeps a
 * dragged waypoint from printing seventeen digits.
 */
function did(action: Action): string | null {
  switch (action.kind) {
    case 'talk':
      return null
    case 'move':
      return `moves to ${round(action.x)}, ${round(action.z)}`
    case 'turn':
      return `turns to face ${Math.round(action.rotation)}°`
    case 'jump':
      return action.air ? 'jumps again, in the air' : 'jumps'
    case 'kick':
      return 'kicks'
    case 'hit':
      return 'hits'
    case 'shake':
      return 'shakes'
    case 'dance':
      return 'dances'
    case 'pose':
      return 'plays their clip'
    case 'hide':
      return 'leaves the shot'
    case 'emote':
      // The emotes have ids and no names - see `@/domain/world/emotes`, which
      // is a sprite sheet and a grid. Printing the number is honest; inventing
      // a word for tile 27 would be a caption nobody could check.
      return `shows emote ${action.emote}`
  }
}

const round = (value: number): string => (Math.round(value * 10) / 10).toFixed(1)

/**
 * Every beat in the shot, in the order it happens.
 *
 * Sorted by time across the whole cast rather than actor by actor, which is the
 * point: a shot is a conversation and a list grouped by speaker is not one.
 * Ties keep cast order, because `Array.prototype.sort` is stable and two things
 * at the same instant have no truer order than the one the document lists them
 * in.
 */
export function beats(shot: ShotSpec, mode: TranscriptMode): Beat[] {
  const names = castNames(shot)

  return shot.cast
    .flatMap((actor, index) =>
      actor.actions
        .filter((action) => mode === 'script' || action.kind === 'talk')
        .map((action) => ({
          at: action.t,
          length: action.duration,
          who: names[index] ?? lookLabel(actor.avatar),
          kind: action.kind,
          said: action.kind === 'talk' ? action.text : null,
          did: did(action),
        })),
    )
    .sort((a, b) => a.at - b.at)
}

/**
 * Seconds as `M:SS.d`.
 *
 * Minutes even for a four-second shot, so every line in the file is the same
 * width and the column of times reads as a column. Negative times cannot occur
 * in a parsed document - `parseAction` clamps - but a clamp here costs nothing
 * and keeps a hand-built shot from printing `0:-1.0`.
 */
export function timecode(seconds: number): string {
  // Truncated to the tenth rather than rounded, because a time in this file is
  // a place to scrub to: 3.45s printed as 3.5 sends you past the start of the
  // beat, and 3.4 sends you a hair before it. The epsilon is float dust and
  // nothing else - 61.9 is held as 61.89999999999999, and a plain floor turns
  // it into 1:01.8.
  const tenths = Math.floor(Math.max(0, seconds) * 10 + 1e-6)
  const minutes = Math.floor(tenths / 600)
  const whole = Math.floor(tenths / 10) - minutes * 60
  return `${minutes}:${String(whole).padStart(2, '0')}.${tenths % 10}`
}

/** The width of the time column, so the text after it lines up. */
const GUTTER = 8

/**
 * The whole file.
 *
 * A header of two lines and then the beats. The header exists because a
 * transcript arrives in somebody's Downloads folder a week later with no
 * conversation attached to it: it has to say which shot it is, how long that
 * shot runs, and that the times are from the start of the shot rather than
 * from anything else.
 *
 * A spoken line goes under its speaker rather than beside them - the
 * screenplay shape - because a name and a sentence on one line wraps in the
 * middle of the sentence at any width narrower than the longest line in the
 * file, and the file is read in whatever a text editor happens to be set to.
 */
export function transcribe(shot: ShotSpec, mode: TranscriptMode, title = 'shot'): string {
  const list = beats(shot, mode)
  const speaking = new Set(list.filter((beat) => beat.said !== null).map((beat) => beat.who))
  const lines = list.filter((beat) => beat.said !== null).length

  const summary =
    mode === 'dialogue'
      ? `Dialogue only · ${count(lines, 'line')} · ${count(speaking.size, 'speaker')} · ${timecode(shot.duration)} long`
      : `Dialogue and actions · ${count(list.length, 'beat')} · ${shot.cast.length} in the cast · ${timecode(shot.duration)} long`

  const head = [
    title,
    summary,
    'Times are from the start of the shot.' +
      // Only where brackets can appear. A note explaining a notation the file
      // does not use is a note that makes the reader look for one.
      (mode === 'script' ? ' A time in brackets is how long the beat runs.' : ''),
  ]

  if (list.length === 0) {
    return `${head.join('\n')}\n\n${
      mode === 'dialogue' ? 'Nobody says anything in this shot.' : 'Nobody does anything in this shot.'
    }\n`
  }

  const body = list.map((beat) =>
    beat.said === null
      ? `${timecode(beat.at).padEnd(GUTTER)}${beat.who.toUpperCase()} ${beat.did}${span(beat)}`
      : // A blank line before every spoken line, and none before an action.
        // The gap is what makes a page of dialogue scannable, and putting one
        // before each of a run of turns and kicks would make the same page
        // mostly whitespace.
        `\n${timecode(beat.at).padEnd(GUTTER)}${beat.who.toUpperCase()}\n${' '.repeat(GUTTER)}${beat.said}\n`,
  )

  return `${head.join('\n')}\n\n${body.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

/**
 * How long a beat runs, when the author is the one who decided.
 *
 * Only for the resizable verbs. A jump lasts as long as the game's arc lasts
 * and a swing is half a second: printing those would be printing a constant
 * next to every line, which is noise dressed as detail. A move, a hide or a
 * dance was dragged to that length on purpose, and the length is the content.
 */
function span(beat: Beat): string {
  if (!ACTION_META[beat.kind].resizable) return ''
  return ` (${(Math.round(beat.length * 10) / 10).toFixed(1)}s)`
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

/** What the saved file is called. The mode is in the name, because both exist. */
export function transcriptFile(stem: string, mode: TranscriptMode): string {
  return `${stem || 'shot'}-${mode === 'dialogue' ? 'dialogue' : 'script'}.txt`
}
