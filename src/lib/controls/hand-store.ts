import { type Hand, HAND_STORAGE_KEY, loadHand, parseHand, saveHand } from '@/lib/controls/hand'

/**
 * The one copy of the handedness React reads.
 *
 * An external store rather than a context, on the same terms as the audio one
 * in `@/lib/audio/store`: the places that care are nowhere near each other in
 * the tree - a thumbstick inside a 3D scene, the controls panel over it, the
 * settings page in a different route entirely - and a provider high enough to
 * cover them would re-render a whole world to move a joystick 300px sideways.
 *
 * It lives in `src/lib` rather than beside a component because both hosts need
 * it and they are not allowed to share components: `src/app/xp/**` may not
 * import `@/app/components/*` (see eslint.config.mjs, and docs/xp-creator.md
 * §1.3 for why). A preference is not a renderer, so this is the piece that is
 * genuinely shared - the two pickers that set it are copies, deliberately.
 */

/** Whether `current` has been read off the device yet. See `getStoredHand`. */
let loaded = false

/** `null` means never asked, which is not the same as "right". See ./hand. */
let current: Hand | null = null

const listeners = new Set<() => void>()

/** Installed with the first subscriber. See `subscribe`. */
let watchingStorage = false

function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * The stored choice, reading it off the device on first use.
 *
 * Lazy rather than initialised at module scope, because this module is imported
 * by server-rendered trees and `localStorage` does not exist there.
 *
 * The value is a string or null, so `useSyncExternalStore`'s identity
 * requirement is satisfied for free - there is no object here to accidentally
 * rebuild on every read and re-render forever.
 */
export function getStoredHand(): Hand | null {
  if (!loaded) {
    current = loadHand()
    loaded = true
  }
  return current
}

/**
 * What the server rendered with.
 *
 * Always "never asked", because the server cannot see the visitor's storage.
 * React hydrates with this and then swaps to `getStoredHand`, which is the
 * behaviour wanted: the markup matches, and a left-handed player sees the stick
 * jump corners one render later rather than seeing a hydration mismatch. It
 * costs nothing in practice - the touch layout is behind a `pointer: coarse`
 * query that is client-corrected on exactly the same render.
 */
export function getServerHand(): Hand | null {
  return null
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  /**
   * Other tabs of the same app.
   *
   * Two tabs and one pair of hands: answering the question in the lounge should
   * not leave a level open in the next tab still laid out for the other thumb.
   * `storage` only fires in the tabs that did not make the change, which is
   * precisely the set that needs telling.
   */
  if (!watchingStorage && typeof window !== 'undefined') {
    watchingStorage = true
    window.addEventListener('storage', (event) => {
      if (event.key !== HAND_STORAGE_KEY) return

      current = parseHand(event.newValue)
      loaded = true
      emit()
    })
  }

  return () => {
    listeners.delete(listener)
  }
}

/**
 * Answer the question, or change the answer.
 *
 * Applied before it is stored, so a browser that refuses writes still moves the
 * controls for this session - a player who cannot persist the choice is still a
 * player who can make it.
 */
export function chooseHand(hand: Hand): void {
  current = hand
  loaded = true
  emit()
  saveHand(hand)
}
