'use client'

import { useParty } from '@/app/world/_stores/party-store'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'
import { fill } from '@/app/i18n/fill'

/**
 * The half of the masthead's line that is not a fact about a row.
 *
 * The radio *is* a row and comes down with the page; it is here rather than in
 * the server component because the two things are one sentence: when the lights
 * are on, what is playing is part of what is happening rather than a second
 * announcement beside it.
 *
 * ---------------------------------------------------------------------------
 * The party half does not light from this page, and that is not a bug here
 * ---------------------------------------------------------------------------
 * A party is a broadcast and nothing else - see the note on `PartyRail`. It
 * survives no reload, is written down nowhere, and today the store behind
 * `useParty` is fed by exactly one thing: a mounted lounge canvas, in this tab.
 * The board is not that, so from here it reads off, every time.
 *
 * The branch is kept rather than deleted because it is the correct rendering of
 * the state it describes, and because the fix - a space-wide party channel the
 * whole app can listen on rather than a same-tab handoff - lands in the store,
 * not here. Deleting it would mean the day that happens, the front page of
 * every space is the one surface that did not notice. `useParty` costs a
 * subscription to a module-level variable; there is no network in it.
 */
export function BoardLive({
  radio,
}: {
  radio: { title: string | null; playing: boolean } | null
}) {
  const t = workspaceDict(useLocale()).board
  const { on } = useParty()

  const playing = radio?.playing ? (radio.title ?? t.theRadio) : null

  if (!on && !playing) return null

  return (
    <>
      <span aria-hidden className="text-line">
        ·
      </span>
      {/*
        Capped and truncated, because a track title is the one thing in this
        line somebody else wrote. Radio metadata routinely arrives as
        "Mokwena The Croco Sessions Replay www.traxfm.org - 2nd August 2026",
        which uncapped is the whole line and pushes the facts either side of it
        off the end. `title` keeps the rest reachable.
      */}
      {on ? (
        // Cyan would be wrong: this is not finished or structural, it is the
        // one thing on the page that is happening right now.
        <span
          title={playing ?? undefined}
          className="max-w-[24ch] truncate text-accent sm:max-w-[40ch]"
        >
          {t.lightsAreOn}
          {playing ? ` — ${playing}` : ''}
        </span>
      ) : (
        <span title={playing ?? undefined} className="max-w-[24ch] truncate sm:max-w-[36ch]">
          {fill(t.isOn, { name: playing ?? '' })}
        </span>
      )}
    </>
  )
}
