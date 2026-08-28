'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAudioPrefs } from '@/app/components/audio/use-audio'
import { useHere, useInScene } from '@/app/world/_stores/here-store'
import { clearRadio, publishRadio } from '@/app/world/_stores/radio-store'
import type { RadioScope } from '@/domain/radio/events'
import { playTrack, resumeTrack, stopTrack } from '@/domain/radio/actions'
import { providerForHost } from '@/domain/radio/providers'
import type { NowPlaying } from '@/domain/radio/queries'
import { duckForRadio } from '@/lib/audio/engine'
import { musicGain } from '@/lib/audio/prefs'
import {
  loadRadioPrefs,
  mayPlay,
  type RadioPrefs,
  saveRadioPrefs,
  shouldAsk,
} from '@/lib/radio/prefs'
import { DRIFT_CHECK_MS, hasFinished, playheadAt, shouldReseek } from '@/lib/radio/sync'
import { createRadioPlayer, type RadioPlayer } from '@/lib/radio/widget'
import { createClient } from '@/lib/supabase/client'
import { notifyIfHidden, openTabChannel } from '@/lib/tab-sync/broadcast'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'

/**
 * The space's radio. Draws nothing.
 *
 * Mounted once in the workspace layout, beside `<ChatDock>` and for the same
 * reason plus a stronger one. The chat has to outlive any single scene; the
 * radio has to outlive them *and* be singular, because it owns an iframe that
 * makes noise. Two docks would be two players a few hundred milliseconds apart,
 * which is not a doubled volume - it is a phaser.
 *
 * ---------------------------------------------------------------------------
 * Nobody is played at
 * ---------------------------------------------------------------------------
 * The rule the whole component is arranged around: an admin decides what is on,
 * and each listener decides whether they hear it. A track arriving does not
 * start audio - it raises a question, and the answer lives on the device. See
 * src/lib/radio/prefs.ts for why that is a stronger promise than the browser's
 * own autoplay gate, which only knows whether somebody clicked *something*.
 *
 * ---------------------------------------------------------------------------
 * Broadcast for the nudge, the row for the truth
 * ---------------------------------------------------------------------------
 * The channel carries the new `NowPlaying` so a room hears a track change
 * within a packet. It is not the source of truth: the same object was written
 * to `space_radio` first, which is what makes somebody who reloads, or who
 * arrives an hour later, land in the same second of the same song. A broadcast
 * on its own would mean the radio existed only for whoever happened to be
 * looking when the link was pasted.
 */
export function RadioDock({
  slug,
  tenantId,
  initialNowPlaying,
  canControl,
}: {
  slug: string
  tenantId: string
  initialNowPlaying: NowPlaying | null
  canControl: boolean
}) {
  const t = railDict(useLocale()).notify
  const supabase = useMemo(() => createClient(), [])
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(initialNowPlaying)
  /**
   * Consent, read from storage on the first render.
   *
   * A lazy initialiser rather than an effect, which is only safe because this
   * component renders `null`. The usual objection - the server cannot see
   * `localStorage`, so server and client would disagree - is about *markup*,
   * and there is none here to disagree about. `loadRadioPrefs` answers with the
   * defaults wherever there is no storage, so the server pass is well defined
   * and the client pass replaces it with the real answer before anything can
   * act on it.
   *
   * The alternative, correcting in an effect, would leave one frame in which
   * somebody who consented yesterday reads as not having - and the effect that
   * starts the player keys off exactly that value.
   */
  const [prefs, setPrefs] = useState<RadioPrefs>(loadRadioPrefs)
  const [error, setError] = useState<string | null>(null)
  /**
   * The player is loaded and in the right place, but the browser will not start
   * it without a gesture of its own. See `confirmStarted`.
   */
  const [needsTap, setNeedsTap] = useState(false)

  const channelRef = useRef<RealtimeChannel | null>(null)
  /** The same-browser relay - see tab-sync/broadcast.ts. */
  const tabChannelRef = useRef<BroadcastChannel | null>(null)
  /**
   * The player is state, not a ref, and that is a bug fix rather than a style
   * choice.
   *
   * It was a ref. Building a player is asynchronous, so the assignment happened
   * inside a `.then()` - and writing a ref does not re-render, so the effect
   * that loads the track had already run, found `null`, and returned. Nothing
   * ever ran it again. The radio therefore worked only when a *second* track
   * arrived after the player existed, which is exactly the "it played once and
   * then never again" this shipped with.
   */
  const [player, setPlayer] = useState<RadioPlayer | null>(null)
  /** What the player currently holds, so a re-render does not reload the track. */
  const loadedRef = useRef<string | null>(null)

  // The music slider governs the radio too - see the note at the top of
  // widget.ts about the two mixers that look like one.
  const { prefs: audio } = useAudioPrefs()
  const volume = musicGain(audio)

  const remember = useCallback((next: RadioPrefs) => {
    setPrefs(next)
    saveRadioPrefs(next)
  }, [])

  /**
   * Which place this person is standing in, or null out in the app.
   *
   * Published out of the running scene - see `here-store`. It is null on the
   * dashboard, in settings, on the pinboard: those are not rooms, so a
   * room-scoped track does not reach them, which is the intended reading rather
   * than an edge case to paper over.
   */
  const here = useHere()

  /**
   * Is this track meant for where I am?
   *
   * The whole of the reach, in one expression, so the dock and the panel cannot
   * disagree about it. A space-wide track reaches every *room* in the space; a
   * room-scoped one reaches the place it went on in and nowhere else.
   *
   * Being in a world at all is the first half, and it is new: "space" used to
   * mean the whole site, so the radio came on over the dashboard, over settings,
   * over the billing page - anywhere inside the workspace, whether or not there
   * was a world on screen. That is not a radio, it is background music on a form.
   * Music belongs to the scene, so no scene means no music.
   *
   * `inScene` and not `here.place`, because those are different questions and
   * only one of them is this one: `place` names which of the four rooms you are
   * in, and an arena, a match and a visited world are none of them. Gating on it
   * would have cut the music in every battle. See `enterScene` in here-store.
   *
   * An unrecognised place name is false - it cannot match any real room. That
   * is the safe direction for a *narrowed* track: unexpected silence in one
   * room beats a track escaping the room it was deliberately confined to.
   */
  const inScene = useInScene()

  const inRange =
    nowPlaying === null ||
    (inScene && (nowPlaying.scope === 'space' || here.place === nowPlaying.place))

  const listening =
    mayPlay(prefs) && nowPlaying !== null && nowPlaying.playing && inRange

  /**
   * Which service this track is on, worked out from its own URL.
   *
   * Derived rather than stored, so there is no column that can disagree with
   * the link beside it. The link already passed the host allowlist before it
   * was written, so this always resolves for a stored track; a null here means
   * a row from a future version naming a service this build has never heard of,
   * which is silence rather than a crash.
   */
  const provider = useMemo(() => {
    if (!nowPlaying) return null
    try {
      return providerForHost(new URL(nowPlaying.trackUrl).hostname)
    } catch {
      return null
    }
  }, [nowPlaying])

  /* ---------------------------------------------------------------------
   * Hearing about changes
   * --------------------------------------------------------------------- */

  /**
   * Shared by the Supabase broadcast below and the same-browser relay next to
   * it, so the two paths cannot drift into validating a packet differently.
   */
  const applyNowPlaying = useCallback((payload: unknown) => {
    const next = payload as NowPlaying | null

    // A packet from a client we do not understand. The row is still
    // authoritative, so ignoring this costs a page load's worth of lag
    // rather than correctness.
    if (next !== null && (typeof next.trackUrl !== 'string' || !next.startedAt)) return

    setNowPlaying(next)
    // A new track is a new question, so a stale failure must not sit on
    // top of it - see the note on `error` in the store.
    setError(null)
  }, [])

  useEffect(() => {
    /**
     * `private: true`, like every other topic in the app. Without it the topic
     * is open to anybody holding the anon key who can guess a workspace id -
     * and on this channel that would be a stranger able to point every player
     * in a space at a URL of their choosing.
     *
     * The migration's `radio_write` policy is the actual guard, and it is
     * narrower than the chat's: only an owner or admin may send here.
     */
    const channel = supabase.channel(`radio:${tenantId}`, { config: { private: true } })
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'radio' }, ({ payload }) => applyNowPlaying(payload))
      .subscribe()

    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [supabase, tenantId, applyNowPlaying])

  /**
   * The same-browser shortcut: another tab on this same lobby, reached
   * without the round trip through Supabase - see tab-sync/broadcast.ts for
   * why this needs no permission of its own.
   */
  useEffect(() => {
    const channel = openTabChannel(`radio-tabs:${tenantId}`)
    tabChannelRef.current = channel
    if (!channel) return

    channel.onmessage = (event) => {
      applyNowPlaying(event.data)
      const track = (event.data as NowPlaying | null)?.trackUrl ?? null
      if (track) notifyIfHidden(t.radio, fill(t.nowPlayingElsewhere, { track }))
    }

    return () => {
      tabChannelRef.current = null
      channel.close()
    }
  }, [tenantId, applyNowPlaying, t.radio, t.nowPlayingElsewhere])

  /* ---------------------------------------------------------------------
   * The player
   * --------------------------------------------------------------------- */

  /**
   * Build the iframe on first consent, and never before.
   *
   * Deferred rather than created on mount, and that is a promise as much as an
   * optimisation: somebody who has not agreed to the radio has no third-party
   * player in their page at all - no frame, no script from soundcloud.com, no
   * request carrying their address there.
   */
  const providerId = provider?.id ?? null

  useEffect(() => {
    if (!listening || !providerId) return

    let cancelled = false
    let built: RadioPlayer | null = null

    void createRadioPlayer(providerId, {
      onError: () => {
        if (!cancelled) {
          setError(t.trackBlocked)
        }
      },
    })
      .then((next) => {
        if (cancelled) {
          next.destroy()
          return
        }
        built = next
        next.setVolume(volume)
        // The line the old ref could not do: this is what re-runs the effect
        // below, which is the one that actually loads the track.
        setPlayer(next)
      })
      .catch(() => {
        if (!cancelled) setError(t.playerFailed)
      })

    /**
     * Torn down when the *service* changes, not on every track.
     *
     * Two tracks on SoundCloud reuse one frame - see `load` in widget.ts for
     * why that matters for autoplay. A track on a different service needs a
     * different frame and a different script, so that is where the boundary is.
     */
    return () => {
      cancelled = true
      built?.destroy()
      built = null
      loadedRef.current = null
      setPlayer(null)
    }
    // `volume` deliberately absent: applied on creation, then kept current by
    // the effect below. Listing it would rebuild the player on every drag of
    // the volume slider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, providerId])

  /** The loop is released whatever else happens, including a hard unmount. */
  useEffect(() => () => duckForRadio(false), [])

  useEffect(() => {
    player?.setVolume(volume)
  }, [player, volume])

  /** The built-in loop stands down exactly while the radio has the floor. */
  useEffect(() => {
    duckForRadio(listening)
  }, [listening])

  /* ---------------------------------------------------------------------
   * Placing the playhead
   * --------------------------------------------------------------------- */

  /**
   * Load the track and seek to where the room is.
   *
   * The seek happens in the `load` callback rather than after it, because a
   * `seekTo` issued before the widget is ready is silently dropped - which
   * shows up as one person starting at zero while everybody else is thirty
   * seconds in, with nothing in any log to say why.
   */
  useEffect(() => {
    if (!player || !listening || !nowPlaying || !provider) return

    let cancelled = false

    /**
     * Check the player actually started, and offer a tap if it did not.
     *
     * This exists for iPhones, and the reason is not a bug anywhere in this
     * codebase. Safari on iOS will only begin audio from a user gesture in the
     * same call stack as the `play()`, and a gesture in this page does not
     * carry into a cross-origin iframe. Everything the radio does is
     * necessarily a tick or two later than the tap - consent is stored, a
     * player is built, a script loads, a track loads, a seek lands - so by the
     * time `play()` runs, the gesture is long gone and iOS silently declines.
     *
     * No amount of restructuring removes that: the last step is always a
     * postMessage into somebody else's frame. What *can* be fixed is the
     * silence. Once the player exists and is loaded, a tap can call `play()`
     * synchronously, and iOS accepts that - so the panel asks for one rather
     * than claiming music is playing while the phone sits quiet.
     *
     * The delay is generous because a phone on a slow connection is exactly the
     * case here, and asking too early would offer a tap to somebody whose track
     * was merely still buffering.
     */
    const confirmStarted = async (target: RadioPlayer) => {
      await new Promise((resolve) => setTimeout(resolve, 1_200))
      if (cancelled) return
      const paused = await target.isPaused()
      if (!cancelled) setNeedsTap(paused)
    }

    const place = async () => {
      if (loadedRef.current !== nowPlaying.trackUrl) {
        await player.load(nowPlaying.trackUrl)
        if (cancelled) return
        loadedRef.current = nowPlaying.trackUrl
      }

      /**
       * A service we cannot steer just starts.
       *
       * Audiomack and hearthis.at expose no seek, so there is no honest way to
       * put a latecomer where the room is - they begin at the top. Attempting
       * the arithmetic anyway would produce a confident `seekTo` into a player
       * that ignores it, and a panel claiming a synchronisation that is not
       * happening. The help panel says which services this applies to.
       */
      if (!provider.synced) {
        player.play()
        await confirmStarted(player)
        return
      }

      const target = playheadAt(nowPlaying, Date.now())
      const duration = await player.duration()
      if (cancelled) return

      /**
       * Arriving after the song has already run out.
       *
       * The room's anchor keeps advancing after a three-minute track finishes,
       * so somebody joining at minute five computes a playhead past the end.
       * Seeking there either fails or silently restarts, and a radio that
       * quietly loops for latecomers while everybody else hears silence is the
       * most confusing failure this feature has. So: nothing plays, and the
       * panel says the track has finished.
       */
      if (hasFinished(target, duration)) {
        player.pause()
        return
      }

      player.seekTo(target)
      player.play()
      await confirmStarted(player)
    }

    void place()
    return () => {
      cancelled = true
    }
  }, [player, listening, nowPlaying, provider])

  /** Stopped, or consent withdrawn: silence, but keep the track loaded. */
  useEffect(() => {
    if (!listening) player?.pause()
  }, [player, listening])

  /**
   * The correction loop.
   *
   * `setInterval`, never `requestAnimationFrame`, and the choice is load-bearing
   * twice over: rAF does not tick in a backgrounded tab, which is exactly when
   * a player drifts furthest, and it does not tick at all in the in-app browser
   * pane. A drift check that only runs while somebody is watching is a drift
   * check that never runs when it is needed.
   *
   * Ten seconds apart and only past the tolerance, because every seek is an
   * audible stutter - a loop that corrected a 200ms error would make the track
   * worse to fix something nobody could hear. See sync.ts.
   */
  useEffect(() => {
    // Not started at all for a service that cannot seek: the loop would ask a
    // player that answers 0 and then order a correction it will ignore, once
    // every ten seconds for the length of the track.
    if (!player || !listening || !nowPlaying || !provider?.synced) return

    const timer = setInterval(() => {
      void (async () => {
        const actual = await player.position()
        const target = playheadAt(nowPlaying, Date.now())
        if (shouldReseek(actual, target)) player.seekTo(target)
      })()
    }, DRIFT_CHECK_MS)

    return () => clearInterval(timer)
  }, [player, listening, nowPlaying, provider])

  /* ---------------------------------------------------------------------
   * Acting
   * --------------------------------------------------------------------- */

  /**
   * Tell the room, after the server has agreed.
   *
   * Order matters and it is the same order `<ChatDock>` uses: the action runs
   * first, and only its result is broadcast. Announcing optimistically would
   * point every player in the space at a URL the database might still refuse.
   */
  const announce = useCallback((next: NowPlaying | null) => {
    setNowPlaying(next)
    channelRef.current?.send({ type: 'broadcast', event: 'radio', payload: next })
    tabChannelRef.current?.postMessage(next)
  }, [])

  const play = useCallback(
    async (trackUrl: string, scope: RadioScope) => {
      /**
       * The room is this admin's own current place, read here rather than
       * chosen from a list.
       *
       * "Just this room" means the one they are standing in - which is the only
       * reading that needs no second control, and the only one where the person
       * ticking the box can hear the result of their own decision.
       */
      const result = await playTrack(
        slug,
        trackUrl,
        scope,
        scope === 'room' ? here.place : null,
      )
      if (!result.ok) return { ok: false, error: result.error }

      announce(result.data)
      return { ok: true }
    },
    [slug, announce, here.place],
  )

  /**
   * Start it from the listener's own tap.
   *
   * Deliberately synchronous - no `await` before `play()`, and nothing async in
   * front of it. That is the entire point: iOS grants the gesture only to work
   * done in the same call stack as the tap, so an `await` here, however small,
   * would put the play back into the next microtask and Safari would refuse it
   * exactly as it refused the automatic attempt.
   *
   * The seek is fire-and-forget for the same reason. The player is already at
   * roughly the right position from the placing effect; the drift loop tidies
   * the rest within ten seconds. Getting *sound out* is what this tap is for.
   */
  const start = useCallback(() => {
    if (!player) return
    player.play()
    setNeedsTap(false)
  }, [player])

  const stop = useCallback(async () => {
    const result = await stopTrack(slug)
    if (!result.ok) return { ok: false, error: result.error }
    announce(result.data)
    return { ok: true }
  }, [slug, announce])

  const resume = useCallback(async () => {
    const result = await resumeTrack(slug)
    if (!result.ok) return { ok: false, error: result.error }
    announce(result.data)
    return { ok: true }
  }, [slug, announce])

  /* ---------------------------------------------------------------------
   * Publishing, for whichever rail is drawing
   * --------------------------------------------------------------------- */

  useEffect(() => {
    publishRadio(
      {
        slug,
        nowPlaying,
        canControl,
        playing: listening,
        asking: shouldAsk(prefs, nowPlaying?.playing ? nowPlaying.trackUrl : null),
        error,
        providerLabel: provider?.label ?? null,
        scope: nowPlaying?.scope ?? 'space',
        place: nowPlaying?.place ?? null,
        // Whether this listener is somewhere the track reaches. The panel needs
        // it to tell "nothing is playing" apart from "it is playing, elsewhere".
        inRange,
        // Where the admin's "just this room" would land, so the checkbox can
        // name the room instead of saying "this room" from the dashboard.
        herePlace: here.place,
        // Whether there is a world on screen at all, which is now what decides
        // whether anything plays. The panel says so, because a track that is
        // running and silent otherwise reads as broken.
        inScene,
        // Only worth asking for a tap when there is a loaded player for that
        // tap to reach. Otherwise the button would do nothing, which is a worse
        // answer than the silence it is trying to explain.
        needsTap: needsTap && listening && player !== null,
        // So the panel can say "everyone starts at the top" for the two
        // services where that is true, rather than implying a sync that is not
        // happening.
        synced: provider?.synced ?? true,
      },
      {
        accept: () => remember({ consent: 'on', declined: null }),
        // Declines *this track*, not the radio. The next one asks again.
        decline: () =>
          remember({ consent: 'ask', declined: nowPlaying?.trackUrl ?? null }),
        // And this is the other one: off for good, no more prompts, and it
        // changes nothing for anybody else in the space.
        silence: () => remember({ consent: 'off', declined: null }),
        start,
        play,
        stop,
        resume,
      },
    )
  }, [
    slug,
    nowPlaying,
    canControl,
    listening,
    prefs,
    error,
    provider,
    inRange,
    inScene,
    here.place,
    needsTap,
    player,
    remember,
    start,
    play,
    stop,
    resume,
  ])

  useEffect(() => clearRadio, [])

  return null
}
