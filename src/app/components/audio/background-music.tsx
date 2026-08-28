'use client'

import { useEffect } from 'react'
import { useAudioGate } from '@/app/components/audio/use-audio'
import { releaseMusic, wantMusic } from '@/lib/audio/engine'

/**
 * The background loop, for as long as you are inside a workspace.
 *
 * Renders nothing. It is mounted once in the /t/[slug] layout, which is the
 * narrowest place that means "signed in and somewhere" - so the track starts
 * on the first click after login and keeps playing across the dashboard, the
 * settings page, the lounge and the café without restarting at every
 * navigation. Putting it in a page instead would cut the music off and start
 * it again from the top each time somebody walked between two rooms, which is
 * the one thing background music must never do.
 *
 * It does not start on mount. Browsers refuse audio until the user has
 * interacted with the document, so what mounting does is *ask* - the engine
 * holds the request and honours it on the first gesture. See `arm`.
 */
export function BackgroundMusic() {
  useAudioGate()

  useEffect(() => {
    wantMusic()
    // Released rather than stopped, so leaving the workspace silences the
    // track without touching the preference - come back and it plays again
    // unless you were the one who turned it off.
    return () => releaseMusic()
  }, [])

  return null
}
