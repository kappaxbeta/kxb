'use client'

import { playFile } from '@/lib/audio/engine'
import { XP_SOUNDS, isSound, soundUrl } from '@kxb/xp/sounds'

/**
 * A level asking for a noise, turned into one.
 *
 * The host half of the `sound` verb (docs/xp/backlog.md §0.5). The engine
 * returns `{ kind: 'sound', sound }` and stops there, because making a noise
 * needs an `AudioContext` and the engine is pure — the same line every other
 * effect sits on.
 *
 * ---------------------------------------------------------------------------
 * The app's own audio engine, not a second one
 * ---------------------------------------------------------------------------
 * `src/lib/audio` is deliberately absent from the import restrictions in
 * `eslint.config.mjs` that keep this tree off the lounge's components, and this
 * is the case that exception is for: there is one `AudioContext` per page, one
 * gesture unlock, and one "effects off" switch that a player expects to mean
 * what it says everywhere. A copy would be a level still making noise after
 * somebody turned sound off, which is a bug rather than a divergence.
 *
 * What is *not* shared is the alphabet: the sounds live under
 * `public/xp/packs/sfx` with their own licence file, for the same reason the
 * art does. See `@kxb/xp/sounds`.
 */

/**
 * Which take, chosen here rather than in the engine.
 *
 * `Math.random` is not in the sandbox and not in the package — see `random.ts`,
 * which exists so a die roll agrees between clients. A sound is the case that
 * argument does *not* apply to: it is presentation, nothing downstream reads
 * it, and two people hearing different recordings of the same punch is what
 * makes a fight sound like a fight rather than a loop.
 */
export function playXpSound(name: string): void {
  if (!isSound(name)) return

  const url = soundUrl(name, Math.random())
  if (!url) return

  const sound = XP_SOUNDS[name]!
  playFile(url, sound.gain, sound.minGapMs)
}
