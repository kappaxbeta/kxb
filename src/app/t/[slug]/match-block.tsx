'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type CSSProperties } from 'react'
import { cancelBattle, leaveBattle, restartBattle } from '@/domain/battle/actions'
import { createGuestLink } from '@/domain/guests/actions'
import { battleDestination } from '@/domain/guests/application'
import { QrBlock } from '@/app/components/qr-block'
import { useCurrentMatch } from '@/app/t/[slug]/match-store'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * What you are playing, and the two ways out of it.
 *
 * This used to be a strip floating over the level: a title card on the left,
 * and Invite / End / Leave on the right. On anything narrower than a laptop the
 * two halves met in the middle and overlapped each other, over a 3D scene, on
 * the screen somebody is trying to play a board game on.
 *
 * So it moved here. The level gets its whole surface back, and the one control
 * left over it is the button that opens this panel.
 *
 * ---------------------------------------------------------------------------
 * Rendered directly in the rail, not behind a tab
 * ---------------------------------------------------------------------------
 * `RailTabs` was the obvious home and it is the wrong one. On a phone the rail
 * is a drawer, so a tab inside it means: press the corner, then find the right
 * tab, then read what you are playing. That is two menus deep for the answer to
 * "what am I in and how do I get out", which is the most urgent question this
 * panel ever answers.
 *
 * It draws nothing at all when there is no match, so the cost of it being
 * always-visible is a null check rather than a permanent empty box.
 */
export function MatchBlock() {
  const refusal = useRefusal()
  const match = useCurrentMatch()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  /**
   * Which match End has been pressed for, rather than *whether* it has been.
   *
   * A second press rather than a `confirm()`, kept from the strip this replaces
   * and for the reason given there: it is the only control here that ends
   * something *other people* are in the middle of, so the button says what it
   * will do before it does it.
   *
   * This panel is mounted by the space layout and never unmounts - walking from
   * one match into another swaps `useCurrentMatch()` underneath it and leaves
   * every piece of state here exactly as it was. A bare boolean therefore
   * carried a half-pressed End across that walk, and the first press in the new
   * match would have been the second press of the old one. Keyed by the id, the
   * confirmation belongs to the match it was made about.
   */
  const [confirmingEnd, setConfirmingEnd] = useState<string | null>(null)

  /**
   * The same gate on Restart, for a smaller reason.
   *
   * It does not end anybody's evening the way End does - everybody is walked
   * straight into the new match - but it does throw away the game in front of
   * four people, and "I meant to press Leave" is exactly the sort of mistake a
   * row of small buttons over a 3D scene produces.
   */
  const [confirmingRestart, setConfirmingRestart] = useState<string | null>(null)

  /**
   * The guest link somebody asked for, **and the match it was minted for**.
   *
   * Held here rather than minted on open, because a link is a *capability* -
   * creating one every time the rail rendered would leave a trail of live doors
   * nobody meant to open, and the sweep that revokes them only runs once a
   * match empties.
   *
   * The battle id beside it is the whole of a bug worth spelling out, because
   * nothing about it looked wrong on screen. This panel never unmounts: it is
   * mounted by the space layout and `useCurrentMatch()` changes under it, so a
   * URL minted in one match was still sitting in this state - drawn as a QR
   * square, over the *new* match's name - after walking into the next one.
   * Pointing a camera at it took the guest to the match that had already
   * finished, which reads as "guest links are broken" rather than as "that is
   * yesterday's link".
   *
   * Compared on render rather than cleared in an effect: a stale link is not a
   * thing to tidy up after the fact, it is a link that was never for this match,
   * and there is no frame in which it should be on screen.
   */
  const [invite, setInvite] = useState<
    { battleId: string; url: string; code: string | null } | null
  >(null)

  /**
   * Whether the code is on screen.
   *
   * Folded away by default, unlike the rail's own share panel - and the two
   * disagreeing is deliberate. That panel exists to be *shown* to a room; this
   * one lives in a column beside a running game, where a QR square is the
   * largest thing on the rail and is wanted for about ten seconds. The link
   * underneath is the part that gets pasted.
   */
  const [showCode, setShowCode] = useState(false)
  const t = railDict(useLocale()).match

  if (!match) return null

  const { slug, battleId, name, xpName, preset, status, joined, canEnd } = match

  /** The link, but only if it was made for the match currently in front of us. */
  const link = invite?.battleId === battleId ? invite.url : null
  /** The spoken form of the same door, stamped with the same match. */
  const code = invite?.battleId === battleId ? invite.code : null
  /** And the same question of the two armed buttons. See `confirmingEnd`. */
  const armedEnd = confirmingEnd === battleId
  const armedRestart = confirmingRestart === battleId

  /*
   * The level's name, unless it is already the heading.
   *
   * A match is named after the level it is played in unless somebody renamed
   * it, so the common case had "Mensch ärgere dich nicht" twice - once as the
   * title and once as the first word of the line under it. Same string, no
   * information, and the line below is meant to be the details.
   */
  /*
   * The match name, unless it is already the line above.
   *
   * A battle is named after its level unless somebody renamed it, so the common
   * case printed "Mensch ärgere dich nicht" twice - once as the heading and
   * once as the first word of the line meant to explain it. Same string, no
   * information. Dropped when it repeats, kept when somebody chose it.
   */
  const details = [name === xpName ? null : name, preset, status].filter(Boolean).join(' · ')
  /** Whether the match is one somebody could still be standing in. */
  const live = status === 'open' || status === 'live' || status === 'running'

  function walkOut() {
    setError(null)
    startTransition(async () => {
      if (joined) await leaveBattle(slug, battleId)
      router.push(`/t/${slug}/battle`)
    })
  }

  /**
   * Mint an open link that lands on this match.
   *
   * Always an open link, matching `GuestInviteButton`: a single-use link is a
   * considered choice and being mid-match is the opposite of a considered
   * moment. Anybody wanting the stricter kind makes one in the Visitors tab,
   * where the checkbox is.
   */
  function inviteGuest() {
    setError(null)
    startTransition(async () => {
      const result = await createGuestLink(slug, {
        maxUses: null,
        destination: battleDestination(slug, battleId),
      })

      if (!result.ok) {
        setError(refusal(result.error ?? t.couldNotMakeLink))
        return
      }

      // Stamped with the match it opens onto, so walking into the next one
      // hides it instead of offering it as that match's door.
      setInvite({ battleId, url: result.url, code: result.code })
      // Best effort. The clipboard refuses over plain http, and the link is
      // drawn above either way - so a failure here costs nothing.
      try {
        await navigator.clipboard.writeText(result.url)
      } catch {
        /* shown as text and as a code regardless */
      }
    })
  }

  /**
   * The same match again, from the top.
   *
   * Asked for as *"add a rematch in the rail, to restart the battle"*, and it
   * belongs beside Leave rather than in the match room's own chrome for the
   * reason this whole panel exists: what am I in, and what can I do about it,
   * are the same question and it is asked in one place.
   *
   * It is not the rematch button the *result* card offers - that one asks the
   * room to opt in, because a finished match has a result people are still
   * looking at. This is for a match that is still going and has stopped being
   * worth finishing: somebody has dropped out, and four people would rather
   * line up again than play a game a player short. Everybody else is carried
   * across by the pointer `restartBattle` leaves on the old match.
   */
  function restart() {
    setError(null)
    startTransition(async () => {
      const result = await restartBattle(slug, battleId)
      if (!result.ok) {
        setError(refusal(result.error ?? t.thatDidNotWork))
        setConfirmingRestart(null)
        return
      }
      router.push(`/t/${slug}/battle/${result.battleId}`)
    })
  }

  function endMatch() {
    setError(null)
    startTransition(async () => {
      const result = await cancelBattle(slug, battleId)
      if (!result.ok) {
        setError(refusal(result.error ?? t.thatDidNotWork))
        setConfirmingEnd(null)
        return
      }
      router.push(`/t/${slug}/battle`)
    })
  }

  return (
    /*
      ---------------------------------------------------------------------
      Lit, because it is the one block in here that is *happening*
      ---------------------------------------------------------------------
      Everything else in this rail is a list you could open: people, pages,
      visitors. This is a state you are currently inside, and if it reads as
      another list item then "what am I in" is answered by reading rather than
      by looking.

      One step warmer than the panels around it and no new colour: a low wash in
      the accent's own hue under the same border the rail uses everywhere. The
      design system's rule is that a card carries local colour through one hue
      and derives the rest, so this sets the hue and derives - it does not
      introduce a fifth surface.
    */
    <section
      style={{ '--box-hue': '322' } as CSSProperties}
      className="rounded-xl border border-[oklch(0.6_0.15_var(--box-hue)/0.32)] bg-[radial-gradient(120%_100%_at_50%_-20%,oklch(0.5_0.22_var(--box-hue)/0.18),transparent_70%),var(--color-surface)] p-3"
    >
      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
        {/*
          A dot rather than the word "live". The status is already spelled out
          on the line below; what this adds is that it is spelled in the
          present tense, which a glance can read and a word cannot.
        */}
        {live ? (
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_0_3px_oklch(0.7_0.27_322/0.18)]"
          />
        ) : null}
        {t.inThisMatch}
      </p>

      {/*
        The level leads, and the match name explains it.

        What is on the screen in front of somebody is the *level* - the board
        they are looking at - and the battle's own name is the thing they would
        use to tell somebody else which one. Leading with the name put the
        answer to "what is this" one line below the answer to "which is this".

        Two steps and only two, which is the rail's whole ramp: 11px for what
        you read, 10px for the line under it that explains what you just read.
      */}
      <p className="mt-1.5 text-[11px] leading-snug text-ink">{xpName}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-ink-muted">
        {details}
      </p>

      {error && (
        <p role="alert" className="mt-2 text-[11px] leading-snug text-red-300">
          {error}
        </p>
      )}

      {/*
        A code, for the person sitting next to you.

        The common case for pulling somebody into a match is that they are in
        the room with you holding a phone, and reading a URL with a token in it
        aloud is the worst interface available. The link stays underneath for
        everybody else.
      */}
      {link && (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-line/60 bg-surface/60 p-2">
          {/*
            The code first, and bigger than anything else in this panel.

            The link is what gets pasted and the QR is what gets scanned, but
            neither works for the commonest case in a room full of people: the
            person you are inviting is *sitting there*, and the fastest path is
            saying six characters out loud. This is that path, so it leads.

            Absent for a link minted before codes existed, which is why it is
            conditional rather than assumed - the panel degrades to exactly what
            it was.
          */}
          {code && (
            <div className="flex w-full flex-col items-center gap-0.5 py-1">
              <span className="font-mono text-2xl tracking-[0.3em] text-ink">
                {code}
              </span>
              <span className="text-[10px] text-ink-muted">
                {fill(t.atJoin, { host: joinHost() })}
              </span>
            </div>
          )}

          {showCode && (
            <QrBlock
              text={link}
              label={t.guestLinkLabel}
              className="h-36 w-36 rounded bg-white p-1.5"
            />
          )}
          <button
            type="button"
            onClick={() => setShowCode((was) => !was)}
            aria-expanded={showCode}
            className="w-full rounded-lg border border-line/60 px-2.5 py-1 text-[10px] text-ink-muted transition hover:border-line hover:text-ink"
          >
            {showCode ? t.hideCode : t.showCode}
          </button>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(link)}
            title={t.copyLink}
            className="w-full break-all text-center text-[10px] leading-snug text-ink-muted transition hover:text-ink"
          >
            {link}
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={pending || link !== null}
          onClick={inviteGuest}
          className="rounded-lg border border-line/60 px-2.5 py-1 text-[11px] text-ink-muted transition hover:border-line hover:text-ink disabled:opacity-40"
        >
          {link ? t.linkReady : t.inviteGuest}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={walkOut}
          className="rounded-lg border border-line/60 px-2.5 py-1 text-[11px] text-ink-muted transition hover:border-line hover:text-ink disabled:opacity-40"
        >
          {joined ? t.leave : t.backToMatches}
        </button>

        {/*
          Restart sits between the two on purpose: it is the middle answer.
          Leave takes you out and leaves the match standing, End takes the match
          away from everybody, and this one keeps the room together and throws
          away only the game.

          Gated on the same `canEnd`, because the authority is the same
          authority - a restart calls this match off for everybody, and the
          decider asks the same question of it that it asks of End.
        */}
        {canEnd && (
          <button
            type="button"
            disabled={pending}
            onClick={() => (armedRestart ? restart() : setConfirmingRestart(battleId))}
            onBlur={() => setConfirmingRestart(null)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setConfirmingRestart(null)
            }}
            className={
              armedRestart
                ? 'rounded-lg border border-amber-400/70 bg-amber-400/15 px-2.5 py-1 text-[11px] text-amber-200 transition hover:bg-amber-400/25 disabled:opacity-40'
                : 'rounded-lg border border-line/60 px-2.5 py-1 text-[11px] text-ink-muted transition hover:border-amber-400/60 hover:text-amber-200 disabled:opacity-40'
            }
          >
            {pending && armedRestart
              ? t.restarting
              : armedRestart
                ? t.startsEveryoneOver
                : t.restart}
          </button>
        )}

        {/*
          Only while there is something to end. A match already over is already
          out of the list, and a button that would be refused is one that
          teaches somebody a control this space does not have.
        */}
        {canEnd && (
          <button
            type="button"
            disabled={pending}
            onClick={() => (armedEnd ? endMatch() : setConfirmingEnd(battleId))}
            onBlur={() => setConfirmingEnd(null)}
            onKeyDown={(event) => {
              // Escape disarms. A control that can only be disarmed by clicking
              // somewhere else is one somebody keeps armed by accident.
              if (event.key === 'Escape') setConfirmingEnd(null)
            }}
            /*
              ---------------------------------------------------------------
              The armed state names the consequence, not the button
              ---------------------------------------------------------------
              This is the only control in the rail that ends something *other
              people are inside*. A second press is the right gate - a
              `confirm()` is a browser dialog over a 3D scene - but the second
              press was labelled "End it — sure?", which asks whether you are
              sure without saying what of.

              So the armed label says who it happens to. Same two presses, and
              the sentence in between is the part that does the work.
            */
            className={
              armedEnd
                ? 'rounded-lg border border-red-400/70 bg-red-500/15 px-2.5 py-1 text-[11px] text-red-200 transition hover:bg-red-500/25 disabled:opacity-40'
                : 'rounded-lg border border-line/60 px-2.5 py-1 text-[11px] text-ink-muted transition hover:border-red-400/60 hover:text-red-200 disabled:opacity-40'
            }
          >
            {pending && armedEnd
              ? t.ending
              : armedEnd
                ? t.endsForEveryone
                : t.endTheMatch}
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * Where to tell somebody to type the code.
 *
 * Read off the browser rather than passed down from the server, because this
 * panel is mounted by the space layout and threading `appUrl` through it for
 * one line of text would touch every surface between. The host is what somebody
 * says out loud - "kxb dot team slash join" - so the protocol and any port are
 * dropped; a dev server on localhost:3000 is the one case where the port would
 * matter and is the one case where nobody is reading it aloud.
 */
function joinHost(): string {
  if (typeof window === 'undefined') return ''
  return window.location.host.replace(/^www\./, '')
}
