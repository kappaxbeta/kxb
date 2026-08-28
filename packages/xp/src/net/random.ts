/**
 * Random that two clients agree about.
 *
 * `Math.random` is taken away from a script on purpose (see ./script-api): two
 * browsers running the same rules over the same entities would disagree about
 * the result, and a dice game is the shortest possible demonstration of why
 * that matters. What replaces it is this - a stream that is a *function of
 * agreed state* rather than a cursor somebody keeps.
 *
 * ---------------------------------------------------------------------------
 * Why it is addressed rather than advanced
 * ---------------------------------------------------------------------------
 * The obvious shape is a generator: a seed, a cursor, `next()`. It works right
 * up until somebody joins a match that is already running. Their cursor starts
 * at zero and everybody else's is at four thousand, and from that moment the
 * two machines roll different numbers forever - silently, because nothing
 * errors and both sides look correct locally.
 *
 * So a value here is `hash(seed, tick, index)`: the seed everybody was told
 * when the match opened, the tick everybody already agrees on, and how many
 * times random has been asked *within that tick*. The index resets at every
 * tick boundary, which is the whole point - a client that was wrong about the
 * count is wrong for the rest of one frame rather than for the rest of the
 * match. There is no state to get out of step, only three numbers, and two of
 * them are already shared.
 *
 * The cost is that it is not a cryptographic stream and must never be used as
 * one. It is dice, spawn jitter, and which of four idle animations a peep
 * picks. A secret belongs somewhere a client cannot read it at all, which is
 * `docs/xp/server-authority.md` and not this file.
 */

/** Mixed to 32 bits. Bit-for-bit the same on every machine that runs it. */
function mix(value: number): number {
  let x = value | 0
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad)
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97)
  return (x ^ (x >>> 15)) >>> 0
}

/**
 * One value of the stream, as a 32-bit unsigned integer.
 *
 * Three coordinates rather than a position, so any of them can be asked for in
 * any order and out of nothing but numbers everybody already has.
 */
export function randomBits(seed: number, tick: number, index: number): number {
  return mix(mix(mix(seed | 0) ^ (tick | 0)) ^ Math.imul(index | 0, 0x9e3779b1))
}

/** The same value in `[0, 1)`, which is what a script actually asks for. */
export function randomAt(seed: number, tick: number, index: number): number {
  return randomBits(seed, tick, index) / 4294967296
}

/**
 * A seed out of a string, for a document that was not given one.
 *
 * A match gets its seed from the room, because that is the only place all the
 * clients are looking. Everything else - a test, a screenshot, a level opened
 * alone in the editor - wants the *same* rolls every time it runs, which is
 * what this gives: the same document, the same numbers, forever.
 */
export function seedFrom(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return mix(hash)
}
