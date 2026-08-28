'use client'

import { useState } from 'react'
import { radioActions, useRadio } from '@/app/world/_stores/radio-store'
import { PROVIDER_LIST } from '@/domain/radio/providers'
import { PLACES } from '@/domain/world/places'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict, type RailDict } from '@/app/i18n/rail'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * What is on, and what you may do about it.
 *
 * A reader, like `<ChatRail>`: `<RadioDock>` owns the player and the state, and
 * this draws it wherever there is room. That is what lets the same panel appear
 * in the right-hand rail on a laptop and in the drawer on a phone without there
 * being two players.
 *
 * The panel has three audiences stacked in one column, in the order they need
 * attention:
 *
 *   1. Anybody who has not answered the question yet. The prompt is first
 *      because it is the only thing here that is *waiting* on somebody.
 *   2. Everybody, seeing what is on.
 *   3. Owners and admins, who can change it.
 */
export function RadioRail() {
  const radio = useRadio()

  // Null until the dock publishes, which is one frame after mount - drawing an
  // empty radio in the meantime would say "nothing is on" before we know.
  if (!radio) return null

  return (
    <div className="space-y-3 px-1 pb-2">
      {radio.asking && <Prompt />}
      {radio.needsTap && <TapToPlay />}
      <NowPlaying />
      {radio.canControl && <Controls />}
    </div>
  )
}

/**
 * The track is ready and the browser will not start it by itself.
 *
 * Almost always an iPhone. Safari on iOS only lets audio begin from a gesture
 * in the same call stack as the `play()`, and a tap on this page does not carry
 * into the cross-origin player frame - so the automatic start is declined with
 * no error and no sound. That is the worst failure this feature has, because
 * everything on screen insists music is playing.
 *
 * The handler calls `start()` directly, with nothing awaited in front of it.
 * That is the entire mechanism: it must run inside the tap, or Safari refuses
 * it for exactly the same reason it refused the first attempt.
 *
 * Above the track it refers to, because it is the only thing on this panel that
 * is waiting on somebody.
 */
function TapToPlay() {
  const t = railDict(useLocale()).radio

  return (
    <button
      type="button"
      onClick={() => radioActionsOrNothing()?.start()}
      className="w-full rounded-xl border border-accent/60 bg-accent/10 px-3 py-2.5 text-left transition hover:bg-accent/20"
    >
      <span className="block text-sm text-ink">{t.tapTitle}</span>
      <span className="mt-0.5 block text-[10px] leading-snug text-ink-muted">{t.tapNote}</span>
    </button>
  )
}

/**
 * The question, asked once per track and never answered on somebody's behalf.
 *
 * Two buttons and a third, quieter way out. "Play it" and "Not now" are the
 * immediate pair; "never ask" is set apart and understated because it is the
 * only one of the three that is hard to undo from here - it is the difference
 * between declining a song and leaving the room.
 *
 * The track's name is deliberately shown before anybody agrees to anything.
 * "Someone put music on" is not enough to decide with; the whole reason to ask
 * is so the answer can be an informed one.
 */
function Prompt() {
  const t = railDict(useLocale()).radio
  const radio = useRadio()
  if (!radio?.nowPlaying) return null

  return (
    <div className="rounded-xl border border-accent/60 bg-accent/10 p-3">
      <p className="text-sm text-ink">{t.someoneOn}</p>
      <p
        className="mt-0.5 truncate text-[11px] text-ink-muted"
        title={label(radio.nowPlaying.title, t)}
      >
        {label(radio.nowPlaying.title, t)}
      </p>

      <div className="mt-2.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => radioActionsOrNothing()?.accept()}
          className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-[11px] font-medium text-white transition hover:opacity-90"
        >
          {t.playIt}
        </button>
        <button
          type="button"
          onClick={() => radioActionsOrNothing()?.decline()}
          className="flex-1 rounded-lg border border-line/70 px-2 py-1.5 text-[11px] text-ink-muted transition hover:bg-line/40 hover:text-ink"
        >
          {t.notNow}
        </button>
      </div>

      <button
        type="button"
        onClick={() => radioActionsOrNothing()?.silence()}
        className="mt-1.5 w-full rounded-lg px-2 py-1 text-[10px] text-ink-muted transition hover:text-ink"
      >
        {t.neverAsk}
      </button>
    </div>
  )
}

/**
 * The state of the radio, for everybody.
 *
 * Says four different things, and the distinctions are the point - "off",
 * "playing to the room but not to you", "playing" and "it broke for you" are
 * four situations somebody would otherwise have to work out from silence.
 */
function NowPlaying() {
  const t = railDict(useLocale()).radio
  const radio = useRadio()
  if (!radio) return null

  const { nowPlaying, playing, error } = radio

  if (!nowPlaying) {
    return (
      <div className="space-y-2 px-1">
        <p className="px-1 text-[11px] leading-relaxed text-ink-muted">{t.nothingOn}</p>
        {/* The help is reachable with nothing playing too - "which services can
            I use" is a question people have *before* they have a link. */}
        <Help />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-line/60 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
        {nowPlaying.playing ? t.onAir : t.stopped}
      </p>
      <p className="mt-1 truncate text-sm text-ink" title={label(nowPlaying.title, t)}>
        {label(nowPlaying.title, t)}
      </p>

      {/*
        The reach, said on the track.

        This is the line that stops a room-scoped track from looking like a
        broken one: from the café, a track playing only in the lounge is
        otherwise indistinguishable from a radio that has stopped working.
      */}
      {nowPlaying.scope === 'room' && (
        <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
          {fill(radio.inRange ? t.onlyIn : t.playingIn, {
            place: placeIn(nowPlaying.place, t),
          })}
        </p>
      )}

      {/*
        The other way to be out of range, and it needs saying for the same
        reason: the radio only plays where there is a world to play it in, so on
        the dashboard or in settings a running track is silent and otherwise
        looks broken.
      */}
      {nowPlaying.scope === 'space' && !radio.inScene && (
        <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
          {t.quietOutHere}
        </p>
      )}

      {radio.providerLabel && (
        <p className="mt-0.5 text-[10px] text-ink-muted">
          {radio.providerLabel}
          {/*
            Said on the track itself, not only in the help. Somebody noticing
            their room is slightly out of step should find the reason on the
            thing they are looking at rather than having to go and ask for it.
          */}
          {!radio.synced && t.notInStep}
        </p>
      )}

      {/*
        A failure here is local by nature - the same track may be playing
        perfectly for everybody else in the room - so it has to be said on this
        screen. The room is no help in diagnosing it.
      */}
      {error && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-600">{error}</p>
      )}

      {/*
        Playing to the room, but not to you. Worth stating rather than leaving
        as silence: somebody who declined an hour ago has no other way to tell
        the difference between "nobody is playing anything" and "you said no".
      */}
      {nowPlaying.playing && !playing && !error && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] text-ink-muted">{t.forRoomNotYou}</p>
          <button
            type="button"
            onClick={() => radioActionsOrNothing()?.accept()}
            className="shrink-0 rounded-lg border border-line/70 px-2 py-1 text-[10px] text-ink-muted transition hover:bg-line/40 hover:text-ink"
          >
            {t.join}
          </button>
        </div>
      )}

      {playing && (
        <button
          type="button"
          onClick={() => radioActionsOrNothing()?.silence()}
          className="mt-1.5 text-[10px] text-ink-muted underline-offset-2 transition hover:text-ink hover:underline"
        >
          {t.muteForMe}
        </button>
      )}
    </div>
  )
}

/**
 * The admin's half: paste a link, or stop what is on.
 *
 * Every owner and admin gets the same controls over the same radio - whoever
 * started a track is not its owner, and somebody who has to leave should not be
 * taking the stop button with them.
 *
 * Optimism is deliberately absent here, unlike everywhere else in this app.
 * Changing a track is the one action whose effect is *other people's speakers*,
 * so the button waits for the server rather than showing a new song that might
 * be refused. It is also the only place where the wait is invisible: what
 * somebody is watching for is the music changing, which the round trip is a
 * small part of.
 */
function Controls() {
  // Named apart from the `refusal` state below, which holds one rather than
  // wording it.
  const wordRefusal = useRefusal()
  const t = railDict(useLocale()).radio
  const radio = useRadio()
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  /**
   * Reach, as a per-put-on choice rather than a remembered setting.
   *
   * Defaults back to "everywhere" after each track, which is deliberate: the
   * narrow option takes music away from most of the space, so it should be
   * something somebody chooses on purpose each time rather than a sticky state
   * they set once and later forget is on.
   */
  const [roomOnly, setRoomOnly] = useState(false)

  if (!radio) return null

  // Nowhere to narrow *to* from the dashboard or a settings page - those are
  // not rooms. The checkbox says so rather than disappearing, so the option
  // does not look like it does not exist.
  const canNarrow = radio.herePlace !== null

  /**
   * Run one control, with the dock's absence handled once rather than at four
   * call sites.
   *
   * The actions are only null between the dock unmounting and this panel
   * following it, which is a frame during a navigation. Treating that as "did
   * not happen" rather than asserting it away keeps a stray click from throwing
   * inside an event handler, where a thrown error takes the rail down with it.
   */
  const run = async (act: (on: NonNullable<ReturnType<typeof radioActions>>) => Promise<{ ok: boolean; error?: string }>) => {
    const on = radioActions()
    if (!on) return false

    setBusy(true)
    setRefusal(null)
    const result = await act(on)
    setBusy(false)
    if (!result.ok) setRefusal(wordRefusal(result.error ?? t.refused))
    return result.ok
  }

  return (
    <div className="space-y-2 border-t border-line/60 pt-3">
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy || link.trim() === '') return
          // Cleared only on success, so a refused link stays in the box to be
          // corrected rather than making somebody find it again.
          if (await run((on) => on.play(link.trim(), roomOnly && canNarrow ? 'room' : 'space'))) setLink('')
        }}
      >
        <label htmlFor="radio-link" className="sr-only">
          {t.linkLabel}
        </label>
        <input
          id="radio-link"
          type="url"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder={t.linkPlaceholder}
          disabled={busy}
          className="w-full rounded-lg border border-line/70 bg-surface-raised px-2.5 py-1.5 text-[11px] text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none disabled:opacity-60"
        />
      </form>

      {/*
        Above the buttons, because it changes what the button does.

        A real `<input type="checkbox">` rather than a styled div: it is a
        binary choice with a label, which is exactly what a checkbox is for, and
        it arrives with the keyboard behaviour and the screen-reader
        announcement already correct.
      */}
      <label
        className={`flex items-start gap-2 px-0.5 ${
          canNarrow ? 'cursor-pointer' : 'cursor-default opacity-60'
        }`}
      >
        <input
          type="checkbox"
          checked={roomOnly && canNarrow}
          disabled={!canNarrow || busy}
          onChange={(event) => setRoomOnly(event.target.checked)}
          className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-accent,currentColor)]"
        />
        <span className="min-w-0 flex-1 text-[11px] leading-snug text-ink-muted">
          {canNarrow ? (
            <>
              {fill(t.onlyInHere, { place: placeIn(radio.herePlace, t) })}
              <span className="block text-[10px] opacity-80">
                {roomOnly ? t.narrowOn : t.narrowOff}
              </span>
            </>
          ) : (
            <>
              {t.cannotNarrow}
              <span className="block text-[10px] opacity-80">{t.cannotNarrowNote}</span>
            </>
          )}
        </span>
      </label>

      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={busy || link.trim() === ''}
          onClick={async () => {
            if (await run((on) => on.play(link.trim(), roomOnly && canNarrow ? 'room' : 'space'))) setLink('')
          }}
          className="flex-1 rounded-lg bg-accent/20 px-2 py-1.5 text-[11px] font-medium text-ink transition hover:bg-accent/30 disabled:opacity-40"
        >
          {t.putItOn}
        </button>

        {radio.nowPlaying?.playing ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => run((on) => on.stop())}
            className="flex-1 rounded-lg border border-line/70 px-2 py-1.5 text-[11px] text-ink-muted transition hover:bg-line/40 hover:text-ink disabled:opacity-40"
          >
            {t.stop}
          </button>
        ) : (
          radio.nowPlaying && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run((on) => on.resume())}
              className="flex-1 rounded-lg border border-line/70 px-2 py-1.5 text-[11px] text-ink-muted transition hover:bg-line/40 hover:text-ink disabled:opacity-40"
            >
              {t.resume}
            </button>
          )
        )}
      </div>

      {refusal && <p className="text-[11px] leading-relaxed text-amber-600">{refusal}</p>}

      <Help />
    </div>
  )
}

/**
 * What this thing is, and what it can and cannot do.
 *
 * Collapsed by default and opened from a `?` beside it, because it answers
 * questions somebody has once - which services work, why a link was refused,
 * why a track is not in step - and a panel that explained itself permanently
 * would be mostly in the way. `<details>` rather than state and a popover: it
 * is disclosure, it wants to be findable by the browser's own find-in-page, and
 * it works before hydration.
 *
 * The honesty here is load-bearing rather than decorative. Two of the four
 * services cannot be synchronised, and a person choosing where to upload - or
 * wondering why their room is not in step - needs that said plainly rather than
 * discovered.
 */
function Help() {
  const t = railDict(useLocale()).radio.help

  return (
    <details className="group rounded-lg border border-line/60 open:bg-surface-raised/40">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-ink-muted transition hover:text-ink">
        {/*
          The badge is sized to the glyph rather than the glyph shrunk to the
          badge. It began as an `8px` "?" inside a fixed circle, which was off
          the rail's two-step scale and, at that size, genuinely hard to read -
          the `size-4` circle carries a `10px` glyph with room to spare.
        */}
        <span
          aria-hidden
          className="grid size-4 shrink-0 place-items-center rounded-full border border-current text-[10px] font-semibold leading-none"
        >
          ?
        </span>
        {t.summary}
      </summary>

      <div className="space-y-2.5 px-2.5 pb-2.5 pt-0.5">
        <p className="text-[10px] leading-relaxed text-ink-muted">{t.lead}</p>

        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            {t.supported}
          </p>
          <ul className="mt-1 space-y-1.5">
            {PROVIDER_LIST.map((provider) => (
              <li key={provider.id} className="text-[10px] leading-relaxed">
                <span className="text-ink">{provider.label}</span>
                {/*
                  The capability is stated next to the name rather than in a
                  footnote, because it is the thing that decides which service
                  somebody should paste from.
                */}
                <span className={provider.synced ? 'text-ink-muted' : 'text-amber-600'}>
                  {provider.synced ? t.inStep : t.outOfStep}
                </span>
                <span className="block text-ink-muted opacity-70">{provider.example}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[10px] leading-relaxed text-ink-muted">{t.embedNote}</p>

        <p className="text-[10px] leading-relaxed text-ink-muted">{t.artistNote}</p>

        {/*
          Stated rather than left to be discovered, because on a phone the
          symptom is silence and there is nothing on screen to blame.
        */}
        <p className="text-[10px] leading-relaxed text-ink-muted">{t.iphoneNote}</p>
      </div>
    </details>
  )
}

/**
 * A name for the track, or an honest stand-in.
 *
 * The title comes from SoundCloud by way of somebody else's browser and is
 * allowed to be missing - see the note on `TrackStarted`. "A track" is better
 * than the URL: a permalink is not a name, and it is the wrong length for this
 * column.
 */
function label(title: string | null, t: RailDict['radio']): string {
  return title ?? t.aTrack
}

/**
 * Where a track is playing, as the phrase a sentence can take.
 *
 * "in the lounge" rather than "lounge", because the three sentences that use it
 * cannot build that phrase themselves once there is a second language in the
 * app: German puts the article inside and it disagrees by gender - *in der
 * Lounge*, *im Café* - and *home* is not a place-with-an-article at all.
 *
 * Still through `PLACES` for the membership test, so the rail cannot drift from
 * the travel bar about which ids exist. An id this build does not know about
 * falls back to "in another room", which is honest and is the case a
 * room-scoped track written by a newer deploy would land in.
 */
function placeIn(id: string | null, t: RailDict['radio']): string {
  if (!id) return t.thisRoom
  const place = PLACES.find((p) => p.id === id)
  return place ? t.inPlace[place.id] : t.anotherRoom
}

/**
 * Reach the dock's actions.
 *
 * Read from the store rather than passed down, for the reason the store exists:
 * this panel is rendered in two places and the dock is mounted in neither of
 * them. Null while the dock is unmounted, which every call site handles by
 * doing nothing - a button that briefly does nothing during a navigation is
 * better than one that throws.
 */
function radioActionsOrNothing() {
  return radioActions()
}
