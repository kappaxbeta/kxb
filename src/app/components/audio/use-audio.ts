'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { AudioPrefs } from '@/lib/audio/prefs'
import { arm, getPrefs, getServerPrefs, subscribe, updatePrefs } from '@/lib/audio/store'

/**
 * The React face of the mixer.
 *
 * Two hooks and nothing else. Everything that decides *what* a sound is lives
 * in src/lib/audio; this file only connects it to a component tree.
 */

export interface AudioControls {
  prefs: AudioPrefs
  /** Change one or more preferences. Applies immediately and persists. */
  set: (patch: Partial<AudioPrefs>) => void
  /** The lounge's quick button, and the settings toggle, are the same act. */
  toggleMusic: () => void
}

export function useAudioPrefs(): AudioControls {
  const prefs = useSyncExternalStore(subscribe, getPrefs, getServerPrefs)

  const set = useCallback((patch: Partial<AudioPrefs>) => updatePrefs(patch), [])

  const toggleMusic = useCallback(() => {
    // Read through the store rather than closing over `prefs`, so a click that
    // lands in the same tick as another change flips the value that is actually
    // current instead of the one this render happened to see.
    updatePrefs({ music: !getPrefs().music })
  }, [])

  return { prefs, set, toggleMusic }
}

/**
 * Arm the autoplay gate from anywhere sound might happen.
 *
 * Needed in more than one place because the workspace layout is not the only
 * route that makes noise: the public showcase at /v/[slug]/lounge renders the
 * same scene for visitors who never signed in and so never passed through
 * <BackgroundMusic>. They get no music - it is a preview of somebody's world,
 * not a session - but a block landing should still knock.
 *
 * Idempotent, so calling it from both the layout and a scene inside it costs a
 * flag check the second time.
 */
export function useAudioGate(): void {
  useEffect(() => {
    arm()
  }, [])
}
