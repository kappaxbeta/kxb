'use client'

import { useSyncExternalStore } from 'react'
import type { RadioScope } from '@/domain/radio/events'
import type { NowPlaying } from '@/domain/radio/queries'

/**
 * What the radio is doing, for whoever is drawing it.
 *
 * The same split `chat-store` makes and for the same reason: `<RadioDock>` has
 * to be mounted exactly once - it owns a Realtime subscription and, more to the
 * point, an iframe playing audio, and two of those is two songs - while the
 * panel that shows what is on has to be renderable in both rails, because there
 * is no right-hand rail below `xl`.
 *
 * So the dock draws nothing. It owns the channel, the player and the consent,
 * and publishes all of it here; the rail is a reader, and there may be as many
 * readers as there are places to put one.
 */

export interface RadioView {
  slug: string
  /** What the space is playing, or null if it never has. */
  nowPlaying: NowPlaying | null
  /** Whether this viewer may work the controls. Re-checked server-side regardless. */
  canControl: boolean
  /** Whether this device has agreed to hear it. */
  playing: boolean
  /** True when there is something on and this device has not answered yet. */
  asking: boolean
  /**
   * Set when the player could not play this track *here* - embedding disabled,
   * a regional block, a deleted upload.
   *
   * Local to this listener by nature, which is the whole reason it has to be
   * shown rather than logged: everybody else may be hearing it perfectly, so
   * the room is no help in working out what went wrong.
   */
  error: string | null
  /** Which service the current track is on, for the label. Null when nothing is on. */
  providerLabel: string | null
  /**
   * Whether the room is actually being held together on this track.
   *
   * False for the services that publish an embed and no seek - see
   * `providers.ts`. The panel says so out loud rather than letting people
   * believe in a synchronisation that is not happening, which would be the
   * worse failure: a room that thinks it is together and is not has no way to
   * discover the difference.
   */
  synced: boolean
  /** How far the current track reaches. */
  scope: RadioScope
  /** Which room it reaches, when the reach is narrow. */
  place: string | null
  /**
   * Whether this viewer is somewhere the track reaches.
   *
   * The panel needs it to tell two silences apart: "nothing is on" and "it is
   * on, in another room". Without it, a room-scoped track looks identical to a
   * broken radio from everywhere else in the space.
   */
  inRange: boolean
  /** Where this viewer is standing, so "just this room" can name the room. */
  herePlace: string | null
  /**
   * Whether a world is on screen at all.
   *
   * The third silence, and the one the other two do not cover: the radio only
   * plays where there is a scene to play it in, so on the dashboard or in
   * settings a running track is quiet and looks broken. Distinct from
   * `herePlace` because a battle arena is a scene and not one of the four
   * places - see `enterScene` in here-store.
   */
  inScene: boolean
  /**
   * The track is loaded and in position, but this browser will not start audio
   * without a gesture of its own.
   *
   * Overwhelmingly an iPhone. Safari on iOS only grants playback to work done
   * in the same call stack as a tap, and a tap in this page does not reach into
   * a cross-origin player frame - so the automatic start is refused silently.
   * The panel turns that into a button, which is the one thing that does work.
   */
  needsTap: boolean
}

export interface RadioActions {
  /** Yes, play it, and stop asking on this device. */
  accept: () => void
  /** Not this track. The next one asks again. */
  decline: () => void
  /** Stop the radio on this device only, and stop asking. Everybody else plays on. */
  silence: () => void
  /**
   * Start playback from the listener's own tap.
   *
   * Synchronous by contract, not by accident: it must be called straight out of
   * a click or touch handler with nothing awaited in front of it, or iOS will
   * refuse it exactly as it refused the automatic attempt. Any caller that
   * wraps this in a promise has removed the only reason it exists.
   */
  start: () => void
  /** Admin: put a track on, either across the space or just where they stand. */
  play: (trackUrl: string, scope: RadioScope) => Promise<{ ok: boolean; error?: string }>
  /** Admin: stop it for the whole space. */
  stop: () => Promise<{ ok: boolean; error?: string }>
  /** Admin: pick it back up where it stopped. */
  resume: () => Promise<{ ok: boolean; error?: string }>
}

let view: RadioView | null = null
let actions: RadioActions | null = null

const listeners = new Set<() => void>()

function announce() {
  for (const listener of listeners) listener()
}

/**
 * Report the radio's state.
 *
 * Unlike `publishChat` there is no equality check, because every field here is
 * a discrete event somebody pressed a button to cause - a track change, an
 * answer to the prompt, an error. None of them fire at frame rate, so skipping
 * a re-render would save nothing and would need an equality function that has
 * to be updated every time this interface grows a field.
 */
export function publishRadio(next: RadioView, nextActions: RadioActions): void {
  view = next
  actions = nextActions
  announce()
}

/** Stop reporting, on unmount. There is exactly one dock, so nothing to guard on. */
export function clearRadio(): void {
  if (!view && !actions) return
  view = null
  actions = null
  announce()
}

export function radioActions(): RadioActions | null {
  return actions
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function radioNow(): RadioView | null {
  return view
}

function serverSnapshot(): null {
  return null
}

/**
 * The radio, for a panel that wants to draw it.
 *
 * Null on the server and on the first client render - the dock publishes from
 * an effect, so there is one frame where a reader knows nothing. Readers draw
 * nothing for it rather than an empty radio, which is the honest difference
 * between "off" and "not asked yet".
 */
export function useRadio(): RadioView | null {
  return useSyncExternalStore(subscribe, radioNow, serverSnapshot)
}
