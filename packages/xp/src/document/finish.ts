// Type-only, so this is not a runtime cycle with the parser that calls it.
import type { XpProblem } from './format'

/**
 * What the level's cartridge is made of.
 *
 * ---------------------------------------------------------------------------
 * Why a document gets to say this at all
 * ---------------------------------------------------------------------------
 * Every other appearance in this format is about the world: what is in it, how
 * it is lit, where the camera stands. This one is about the level's *object* -
 * the cartridge it is drawn as on a shelf, in a store, in a picker. It belongs
 * to the document for the same reason `name` and `blurb` do: it travels with
 * the level wherever the level goes, and a level that looks like galaxy glass in
 * one space and matte plastic in another is two levels as far as anybody
 * choosing between them is concerned.
 *
 * ---------------------------------------------------------------------------
 * A closed set, not a colour
 * ---------------------------------------------------------------------------
 * The shell is already tinted by a hue derived from the level's reference, so
 * this is deliberately not a colour picker: it says what the shell is *made of*
 * and never what colour it is. A shelf of nine materials is a set, where a
 * shelf of arbitrary colours is a jumble - and the tint keeps two levels with
 * the same finish from being the same object.
 *
 * Absent is `plastic`, and absent stays absent: the parser leaves the field off
 * rather than materialising the default, so a document that has never had an
 * opinion round-trips through the editor without growing one. The same rule
 * `rules`, `camera` and `backend` follow.
 */

export const FINISHES = [
  'plastic',
  'shiny',
  'metal',
  'rust',
  'glass',
  'rainbow',
  'galaxy',
  'neon',
  'hologram',
] as const

export type Finish = (typeof FINISHES)[number]

export const DEFAULT_FINISH: Finish = 'plastic'

export function isFinish(value: unknown): value is Finish {
  return typeof value === 'string' && (FINISHES as readonly string[]).includes(value)
}

/**
 * Read strictly, and refuse rather than fall back.
 *
 * A misspelled finish is somebody who meant something. Quietly answering
 * `plastic` would leave them looking at the default wondering which of the
 * other six they typed wrong, which is the failure mode this parser exists to
 * turn into a sentence.
 */
export function readFinish(raw: unknown, problems: XpProblem[]): Finish | undefined {
  if (raw === undefined) return undefined
  if (!isFinish(raw)) {
    problems.push({
      at: 'finish',
      message: `not one of ${FINISHES.join(', ')}`,
    })
    return undefined
  }
  return raw
}

/**
 * The shell's colour, as a hue.
 *
 * ---------------------------------------------------------------------------
 * A number on the wheel, not a colour
 * ---------------------------------------------------------------------------
 * Zero to three hundred and fifty-nine, and nothing else - no saturation, no
 * lightness, no hex. That is not a simplification, it is the same argument the
 * finish set makes one level down: every surface that draws a cartridge builds
 * its shell, its label plate, its edge glow and the shadow under its name from
 * *one* hue with saturations and lightnesses chosen per finish. Handed a free
 * colour it would have to take the hue back out again - and it would let
 * somebody pick a shell so dark the neon on it is invisible, or so pale the
 * cover cannot be read against it.
 *
 * ---------------------------------------------------------------------------
 * Absent means "you decide"
 * ---------------------------------------------------------------------------
 * And that is a real answer rather than a missing one. With no hue the shelf
 * derives one from the level's reference, spread around the wheel by the golden
 * angle so neighbours differ - see `hueFor`. A shelf of levels nobody has
 * coloured is therefore already a shelf of different colours, which is most of
 * what the field is for; declaring one is for the author who wants *that* red.
 *
 * The field stays off the document until somebody says so, like `finish` and
 * for the same reason.
 */

/** Exclusive. Three hundred and sixty is zero, and two names for red is a bug. */
export const HUES = 360

export function isHue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < HUES
  )
}

/**
 * Read strictly, and refuse rather than clamp.
 *
 * A hue of 400 is somebody who thinks the wheel is something other than it is,
 * and quietly folding it to 40 gives them an orange cartridge and no reason.
 * The same call `readFinish` makes about a misspelling.
 */
export function readHue(raw: unknown, problems: XpProblem[]): number | undefined {
  if (raw === undefined) return undefined
  if (!isHue(raw)) {
    problems.push({ at: 'hue', message: `not a whole number from 0 to ${HUES - 1}` })
    return undefined
  }
  return raw
}
