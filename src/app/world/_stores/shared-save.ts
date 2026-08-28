/**
 * The browser's copy of the two numbers every place agrees on.
 *
 * The rules about those numbers - what they are called, what you start with,
 * what counts as a valid stored value - live in `@/domain/world/save`. This
 * file is only the part that knows they happen to be kept in `localStorage`,
 * which is why it is here and not there: domain code does not touch the DOM,
 * and an ESLint rule over `src/domain/**` now enforces that rather than
 * trusting it.
 *
 * Worth keeping split even with one backend. A second client would reimplement
 * this file against its own store and leave the rules alone, rather than
 * forking them.
 */

import { KEYS, normaliseShared, type Shared } from '@/domain/world/save'

/**
 * A shared number, or null when nobody has ever written one.
 *
 * Null rather than a default on purpose: "never played" and "played, and it
 * happens to be zero" are different answers, and only the caller knows whether
 * its own save should be trusted instead.
 */
export function readShared(name: Shared): number | null {
  if (typeof window === 'undefined') return null

  try {
    // A hand-edited or half-written value is not worth crashing a game over,
    // and treating it as absent lets the caller's own save cover for it.
    return normaliseShared(window.localStorage.getItem(KEYS[name]))
  } catch {
    // Private browsing, or storage disabled. The game still runs; it just will
    // not be there tomorrow.
    return null
  }
}

export function writeShared(name: Shared, value: number): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(KEYS[name], String(Math.max(0, Math.floor(value))))
  } catch {
    // Same as above - a save that cannot be written is not a reason to stop
    // playing.
  }
}

/**
 * Everywhere you have made nice, added up.
 *
 * What the café pays tips on. A place nobody has visited contributes nothing
 * rather than a default, which is why `readShared` returning null matters.
 */
export function totalComfort(): number {
  return (readShared('comfort:home') ?? 0) + (readShared('comfort:outdoor') ?? 0)
}

/**
 * Follow a shared number while another tab changes it.
 *
 * `storage` only fires in the tabs that did *not* write, which is exactly the
 * case worth handling: the café open in one tab and the house in another. A
 * player who spends at home should not be able to switch back to the café tab
 * and spend the same coins again.
 */
export function watchShared(
  name: Shared,
  onChange: (value: number) => void,
): () => void {
  if (typeof window === 'undefined') return () => {}

  const listener = (event: StorageEvent) => {
    if (event.key !== KEYS[name]) return
    const value = readShared(name)
    if (value !== null) onChange(value)
  }

  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}
