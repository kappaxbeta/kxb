import { arm, configure } from '@/lib/audio/engine'
import {
  AUDIO_STORAGE_KEY,
  DEFAULT_PREFS,
  loadPrefs,
  parsePrefs,
  savePrefs,
  type AudioPrefs,
} from '@/lib/audio/prefs'

/**
 * The one copy of the preferences React reads.
 *
 * An external store rather than a context provider, because the three places
 * that touch these values are nowhere near each other in the tree - the audio
 * settings page, the quick button floating over the lounge canvas, and the
 * music player in the workspace layout - and a provider high enough to cover
 * all three would re-render the entire workspace on every drag of a volume
 * slider. `useSyncExternalStore` subscribers re-render on their own.
 *
 * It is also what makes the engine's singleton honest: there is exactly one
 * mixer, so there should be exactly one thing telling it what to do.
 */

/** Null until the first client read. See `getPrefs`. */
let current: AudioPrefs | null = null

const listeners = new Set<() => void>()

/** Installed with the first subscriber. See `subscribe`. */
let watchingStorage = false

function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * The current preferences, loading them from storage on first use.
 *
 * Lazy rather than initialised at module scope, because this module is
 * imported by a server-rendered layout and `localStorage` does not exist
 * there. The first call happens during the first client render, which is also
 * the first moment the engine could usefully be configured - so it is done
 * here, once, rather than in an effect that would leave the mixer at defaults
 * for a frame.
 *
 * The identity is stable between changes, which `useSyncExternalStore`
 * requires: returning a fresh object each call would re-render forever.
 */
export function getPrefs(): AudioPrefs {
  if (!current) {
    current = loadPrefs()
    configure(current)
  }
  return current
}

/**
 * What the server rendered with.
 *
 * Always the defaults, because the server cannot know what is in the visitor's
 * localStorage. React uses this for the hydrating render and then swaps to
 * `getPrefs`, which is exactly the behaviour wanted: the markup matches, and a
 * player who has muted sees the muted button one render later rather than
 * seeing a hydration mismatch.
 */
export function getServerPrefs(): AudioPrefs {
  return DEFAULT_PREFS
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  /**
   * Other tabs of the same app.
   *
   * Without this, muting the music on the settings page leaves the lounge in
   * the next tab still playing it - two tabs, one set of speakers, and the
   * button visibly did nothing. `storage` only fires in the tabs that did not
   * make the change, which is precisely the set that needs telling.
   */
  if (!watchingStorage && typeof window !== 'undefined') {
    watchingStorage = true
    window.addEventListener('storage', (event) => {
      if (event.key !== AUDIO_STORAGE_KEY) return

      // Same tolerance as the initial read: the value came from disk and this
      // listener has no way to refuse a page for it being malformed.
      let next = DEFAULT_PREFS
      if (event.newValue) {
        try {
          next = parsePrefs(JSON.parse(event.newValue))
        } catch {
          next = DEFAULT_PREFS
        }
      }

      current = next
      configure(next)
      emit()
    })
  }

  return () => {
    listeners.delete(listener)
  }
}

/**
 * Change some of the preferences.
 *
 * A patch rather than a whole object, so a toggle does not have to restate the
 * volumes it is not touching and cannot stomp a slider that moved in between.
 */
export function updatePrefs(patch: Partial<AudioPrefs>): void {
  const next = { ...getPrefs(), ...patch }
  current = next

  // Applied before it is stored: the point of the mixer hearing first is that
  // a full disk cannot stop a mute from taking effect.
  configure(next)
  savePrefs(next)
  emit()
}

/**
 * Let sound out as soon as the browser allows it.
 *
 * Re-exported here rather than reached for from the engine directly, so the
 * React side of this feature has one import to know about.
 */
export { arm }
