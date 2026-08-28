/**
 * A name for a match, so nobody has to think of one.
 *
 * ---------------------------------------------------------------------------
 * Why the field was prefilled rather than made optional
 * ---------------------------------------------------------------------------
 * `battleNameSchema` requires one, and the wizard would not advance past the
 * step without it - so the last thing between somebody and a match they had
 * already fully described was a text field asking them to be funny on demand.
 * The placeholder said "Friday night" and could not be pressed, which is the
 * worst version of the problem: it showed exactly what was wanted and still
 * made them type it.
 *
 * Making the name optional was the other way, and it is worse. A list of
 * matches all called "Match" is a lobby nobody can read, and the name is the
 * only thing distinguishing two matches on the same level - so the answer is
 * that everything gets a name and nobody is asked for one.
 *
 * ---------------------------------------------------------------------------
 * Why it is deliberately silly
 * ---------------------------------------------------------------------------
 * A generated name that tried to be neutral - "Match 4", "Blue vs Red" - would
 * read as a placeholder, and a placeholder is a thing people feel obliged to
 * replace. Something that is obviously a joke reads as *ours*, which is the
 * feeling the whole surface is after, and the ones nobody wants get changed in
 * one press anyway. That is what the re-roll beside the field is for.
 *
 * Kept away from anything that would be unpleasant to find attached to your
 * name in a lobby: no insults, nothing about anybody's body, no swearing. The
 * comedy is in the mismatch between a very serious adjective and a very
 * unserious noun, which needs neither.
 */

/** Serious, official, or self-important. Half the joke. */
const SHAPES = [
  'Emergency',
  'Unofficial',
  'Highly Professional',
  'Slightly Illegal',
  'Deeply Serious',
  'Strictly Ceremonial',
  'Mildly Competitive',
  'Extremely Tactical',
  'Legally Distinct',
  'Provisional',
  'Ill-Advised',
  'Long-Awaited',
  'Suspiciously Calm',
  'Fully Sanctioned',
  'Reasonably Fair',
  'Unlicensed',
  'Annual',
  'Final (Again)',
] as const

/** And the other half, which should never be worth being serious about. */
const OCCASIONS = [
  'Nonsense',
  'Kerfuffle',
  'Situation',
  'Disagreement',
  'Team Building',
  'Lunch Break',
  'Business Meeting',
  'Scramble',
  'Rumble',
  'Debacle',
  'Grudge Match',
  'Uprising',
  'Showdown',
  'Incident',
  'Fixture',
  'Reunion',
  'Bit of a Moment',
  'Afternoon',
] as const

/**
 * One of the 324, picked fresh.
 *
 * `Math.random` rather than anything seeded, and it matters where this is
 * called from: a random value in a `useState` initialiser is a different string
 * on the server than in the browser, which is a hydration mismatch on the one
 * field somebody is about to type in. The wizard calls this on mount for that
 * reason - see the note there.
 *
 * No memory of what it said last time. Two identical names in one lobby is a
 * one-in-324 coincidence somebody will find funnier than the alternative, which
 * is this module keeping state to prevent it.
 */
export function funnyMatchName(): string {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)]!
  const occasion = OCCASIONS[Math.floor(Math.random() * OCCASIONS.length)]!
  return `${shape} ${occasion}`
}

/** Both halves, for the test that checks every pair against `BATTLE_NAME_MAX`. */
export const NAME_PARTS = { shapes: SHAPES, occasions: OCCASIONS }
