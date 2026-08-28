/**
 * A voice, as a list of beeps.
 *
 * What a talking animal sounds like, decided without recording anybody. Each
 * letter is a short pitched blip; the pitch wanders with the letters, the timbre
 * and register come from which animal is speaking, and the result is the
 * gibberish-speech convention Animal Crossing and Undertale made legible - you
 * read the bubble, and the noise tells you who is reading it to you.
 *
 * ---------------------------------------------------------------------------
 * Why synthesised and not spoken
 * ---------------------------------------------------------------------------
 * The obvious alternative is real text-to-speech, and both routes to it are
 * worse here. The browser's own `speechSynthesis` cannot be captured: it plays
 * out of the tab rather than through a node graph, so there is nothing to hand
 * `MediaRecorder`, and the exported file would be silent on the machine where
 * it sounded fine. A TTS API would work and would cost a key, a server route
 * and a round trip per line, for a fox.
 *
 * Blips need none of that, and they are *deterministic*: this module is a pure
 * function from text to a schedule, which is the only reason any of it can be
 * tested here at all - see the note in `@/domain/studio/shot` about the studio
 * being unwatchable from this seat.
 *
 * ---------------------------------------------------------------------------
 * The unit
 * ---------------------------------------------------------------------------
 * Times are seconds from the start of the line, frequencies are hertz and gains
 * are linear. Nothing here touches Web Audio - `@/app/ovaloffice/studio/speak`
 * turns a schedule into oscillators, and nothing else needs a browser to know
 * what the line sounds like.
 */

/** How a given animal sounds. */
export interface Voice {
  /** Middle of its range, in hertz. */
  pitch: number
  /** Square reads as chirpy, triangle as soft, sawtooth as gruff. */
  wave: 'square' | 'triangle' | 'sawtooth'
}

export interface Blip {
  /** Seconds from the start of the line. */
  at: number
  hz: number
  /** Seconds. Short - these are consonants, not notes. */
  duration: number
  gain: number
}

/**
 * A stable number from a name.
 *
 * FNV-1a, because the requirement is only that the penguin sound the same on
 * every machine and different from the fox. Nothing cryptographic is at stake
 * and nothing persists - if the roster changes, voices may shuffle, and the
 * cost of that is that a re-recorded video sounds slightly different.
 */
function hash(text: string): number {
  let value = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 0x01000193)
  }
  return value >>> 0
}

const WAVES: Voice['wave'][] = ['square', 'triangle', 'sawtooth']

/**
 * The voice for an animal.
 *
 * Spread over an octave and a half from a low growl to a small chirp. Derived
 * rather than tabulated: twenty-four hand-picked pitches would be twenty-four
 * decisions nobody has an opinion about until they hear them next to each
 * other, and the roster grows.
 */
export function voiceFor(avatar: string): Voice {
  const seed = hash(avatar)
  return {
    pitch: 190 + (seed % 340),
    wave: WAVES[(seed >>> 9) % WAVES.length],
  }
}

/** Blips a second. Fast enough to read as speech, slow enough to hear as beats. */
const RATE = 13

/** How long one blip sounds. Under a frame at 30fps, deliberately. */
const LENGTH = 0.055

/** Characters that stop the voice for a beat, and for how long. */
const PAUSES: Record<string, number> = {
  ' ': 1,
  ',': 2,
  ';': 2,
  ':': 2,
  '.': 3,
  '!': 3,
  '?': 3,
  '…': 4,
  '—': 2,
  '\n': 3,
}

const VOWELS = new Set('aeiouyAEIOUY')

/**
 * A line, as a schedule.
 *
 * Two things shape the melody. Vowels sit above the animal's centre and
 * consonants below, which is what stops a long word sounding like a fire alarm;
 * and the whole line drifts down over its length, because a sentence that ends
 * on the pitch it started on reads as a question no matter what the words say.
 *
 * `limit` is the length of the clip in the timeline. A line whose blips would
 * outrun its bubble is sped up to fit rather than cut off - the bubble and the
 * voice are one event, and the failure of them disagreeing is the last three
 * words being mimed.
 */
export function speechBlips(text: string, voice: Voice, limit: number): Blip[] {
  const letters = [...text.slice(0, 200)]
  const blips: Blip[] = []

  let at = 0
  const step = 1 / RATE

  for (const letter of letters) {
    const pause = PAUSES[letter]
    if (pause !== undefined) {
      at += step * pause
      continue
    }

    // Punctuation that is not a pause - brackets, quotes, apostrophes - makes no
    // sound of its own. Only letters and digits get a blip.
    if (!/[\p{L}\p{N}]/u.test(letter)) continue

    const code = letter.codePointAt(0) ?? 0
    // A semitone-ish wobble either side of centre, deterministic in the letter
    // so the same word always sounds like the same word.
    const wobble = ((code * 7) % 5) - 2
    const lift = VOWELS.has(letter) ? 1.18 : 0.86

    blips.push({
      at,
      hz: voice.pitch * lift * 2 ** (wobble / 24),
      duration: LENGTH,
      gain: VOWELS.has(letter) ? 0.5 : 0.36,
    })

    at += step
  }

  if (blips.length === 0) return blips

  // Squeezed, never stretched: a short line inside a long clip is somebody
  // holding the bubble up after they finished talking, which is fine and normal.
  const span = blips[blips.length - 1].at + LENGTH
  if (span <= limit || limit <= 0) return blips

  const squeeze = limit / span
  return blips.map((blip) => {
    const at = blip.at * squeeze
    return {
      ...blip,
      at,
      // The blip itself shortens too, or a squeezed line becomes one long tone -
      // and it is clamped to what is left of the clip, so the last letter cannot
      // ring on past the bubble that is carrying it.
      duration: Math.min(blip.duration, Math.max(0, limit - at), blip.duration * squeeze + 0.01),
    }
  })
}

/** Falling pitch over the line, applied where the blips are scheduled. */
export const DROOP = 0.88

/**
 * How far through the line a blip is, for the droop.
 *
 * Split out so the schedule stays a list of absolute values and the shaping
 * stays one multiplication at the point of use.
 */
export function droopAt(fraction: number): number {
  return 1 + (DROOP - 1) * Math.min(1, Math.max(0, fraction))
}
