'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { type VoiceMode, DEFAULT_VOICE_MODE } from '@/lib/controls/voice-mode'
import {
  chooseVoiceMode,
  getServerVoiceMode,
  getStoredVoiceMode,
  subscribe,
} from '@/lib/controls/voice-mode-store'

/**
 * The React face of the voice-mode store.
 *
 * In `src/lib` beside the store rather than under `src/app/components`, for the
 * same lint-shaped reason `use-camera-mode` is: `src/app/xp/**` may not import
 * `@/app/components/*`, and if voice ever reaches an XP it needs this exactly
 * as much as the lounge does.
 */

export interface VoiceModeControls {
  /** The mode to talk with. Never null - unset renders as the default. */
  mode: VoiceMode
  /** Change it. Applies immediately and persists. */
  choose: (mode: VoiceMode) => void
}

export function useVoiceMode(): VoiceModeControls {
  const stored = useSyncExternalStore(subscribe, getStoredVoiceMode, getServerVoiceMode)

  const choose = useCallback((mode: VoiceMode) => chooseVoiceMode(mode), [])

  return { mode: stored ?? DEFAULT_VOICE_MODE, choose }
}
