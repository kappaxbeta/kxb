'use client'

import { useEffect, useState } from 'react'
import { micIsLive, PUSH_TO_TALK_KEY, type VoiceMode } from '@/lib/controls/voice-mode'
import { setMicLive } from '@/app/world/_stores/face-store'

/**
 * The key that opens the microphone, and every way it has to close again.
 *
 * The rule itself is `micIsLive` and is tested without a browser. What is here
 * is the awkward half: a key can be held when the window loses focus, when the
 * tab is hidden, when a dialog steals the event, or when the component unmounts
 * mid-press - and every one of those leaves a microphone open in a room the
 * person has stopped looking at.
 *
 * So this errs one way throughout. Anything that is not clearly "the key is
 * down and this page is in front of somebody" closes the mic.
 */
export function usePushToTalk({
  enabled,
  mode,
}: {
  /** The mic switch in the HUD. */
  enabled: boolean
  mode: VoiceMode
}): boolean {
  const [pushing, setPushing] = useState(false)

  useEffect(() => {
    /**
     * No handlers at all with the mic switched off, and no need to clear
     * `pushing` either: `micIsLive` gates on the switch before it looks at the
     * key, so a stale `true` left over from a previous press opens nothing.
     * Letting it stand is also what stops this from writing state during an
     * effect for no observable gain.
     */
    if (!enabled) return

    const down = (event: KeyboardEvent) => {
      if (event.code !== PUSH_TO_TALK_KEY) return
      /**
       * Not while somebody is typing.
       *
       * The lounge has a chat box, and `T` is a letter. Without this, saying
       * "tomorrow" in the rail opens the microphone eight times.
       */
      if (isTyping(event.target)) return
      if (event.repeat) return
      setPushing(true)
    }

    const up = (event: KeyboardEvent) => {
      if (event.code !== PUSH_TO_TALK_KEY) return
      setPushing(false)
    }

    /**
     * Every way a held key stops being a held key without a `keyup`.
     *
     * `blur` covers alt-tab and clicking another window - the keyup lands
     * somewhere else and never arrives here. `visibilitychange` covers the tab
     * going to the background, which is not the same event and is the one that
     * matters most: a microphone live in a tab nobody is looking at is the
     * failure this feature would be remembered for.
     */
    const release = () => setPushing(false)
    const hidden = () => {
      if (document.visibilityState !== 'visible') setPushing(false)
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', hidden)

    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [enabled])

  /**
   * The one place the track is opened or closed.
   *
   * In an effect rather than in the handlers, so that all three inputs - the
   * switch, the mode and the key - arrive at the decision through the same
   * function. A handler that flipped the track directly would be a fourth
   * author of the same fact, and the one that disagreed on unmount.
   */
  useEffect(() => {
    const live = micIsLive({ mode, enabled, pushing })
    setMicLive(live)
    // Whatever happens, the microphone does not outlive this component.
    return () => setMicLive(false)
  }, [mode, enabled, pushing])

  return micIsLive({ mode, enabled, pushing })
}

/** Whether the event landed in something somebody is typing into. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
