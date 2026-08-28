import {
  type VoiceMode,
  VOICE_MODE_STORAGE_KEY,
  loadVoiceMode,
  parseVoiceMode,
  saveVoiceMode,
} from '@/lib/controls/voice-mode'

/**
 * The one copy of the voice mode React reads.
 *
 * The same shape as `./camera-mode-store`, and for the same reasons - see the
 * note there. Neighbouring questions, read by the same far-apart places: a key
 * handler inside a 3D scene, the panel over it, the settings page in another
 * route.
 */

/** Whether `current` has been read off the device yet. */
let loaded = false

/** `null` means nothing stored, which renders as the default. */
let current: VoiceMode | null = null

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
 */
export function getStoredVoiceMode(): VoiceMode | null {
  if (!loaded) {
    current = loadVoiceMode()
    loaded = true
  }
  return current
}

/** What the server rendered with: always "nothing stored". */
export function getServerVoiceMode(): VoiceMode | null {
  return null
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  /**
   * Other tabs of the same app. `storage` only fires in the tabs that did not
   * make the change, which is precisely the set that needs telling - and it
   * matters more here than for a camera mode: somebody switching to
   * push-to-talk in one tab has decided something about the room they are
   * sitting in, and a second tab left on open mic would still be listening to
   * it.
   */
  if (!watchingStorage && typeof window !== 'undefined') {
    watchingStorage = true
    window.addEventListener('storage', (event) => {
      if (event.key !== VOICE_MODE_STORAGE_KEY) return

      current = parseVoiceMode(event.newValue)
      loaded = true
      emit()
    })
  }

  return () => {
    listeners.delete(listener)
  }
}

/**
 * Change the answer.
 *
 * Applied before it is stored, so a browser that refuses writes still switches
 * for this session - somebody who cannot persist the choice can still make it.
 */
export function chooseVoiceMode(mode: VoiceMode): void {
  current = mode
  loaded = true
  emit()
  saveVoiceMode(mode)
}
