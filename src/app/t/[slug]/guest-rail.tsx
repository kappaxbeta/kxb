'use client'

import { usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ShareInvite } from '@/app/components/share-invite'
import { createGuestLink, removeGuest, revokeGuestLink } from '@/domain/guests/actions'
import {
  guestLandingLabel,
  guestLinkUrl,
  battleDestination,
  guestRoomSlug,
  roomDestination,
} from '@/domain/guests/application'
import type { GuestLinkView, GuestView } from '@/domain/guests/queries'
import { useCurrentMatch } from '@/app/t/[slug]/match-store'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Guest access, in the rail beside the people.
 *
 * It lives here rather than on the settings page because of *when* it is
 * wanted. Handing somebody a link is something you do in the middle of a
 * conversation - they are asking to see the place, and you are three clicks
 * into a room. Settings is where you go to change the space; this is something
 * you do to the afternoon, so it sits next to the roster it affects.
 *
 * Nothing here is optimistic, and that is the same call the members panel
 * makes: a token rendered from memory before the server agreed to it is a
 * secret that may not exist, and one that turns out to be wrong is a link
 * somebody has already pasted into a chat.
 */
export function GuestRail({
  slug,
  origin,
  links,
  /** Who is inside on a guest pass, across every link. */
  guests,
  /** The concurrent cap in force here, or null when there is none. */
  capacity,
}: {
  slug: string
  origin: string
  links: GuestLinkView[]
  guests: GuestView[]
  capacity: number | null
}) {
  const refusal = useRefusal()
  const t = railDict(useLocale()).guests
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  /**
   * Which link is showing its code, if any.
   *
   * One id rather than a set, so opening a second closes the first. The rail is
   * a column about 260px wide and a QR square is most of it - two open at once
   * would be a scroll rather than a comparison, and nobody compares two QR
   * codes.
   */
  const [shown, setShown] = useState<string | null>(null)

  /**
   * Ticked means the link works once and is spent.
   *
   * Unticked - an open link anybody may use - is the default because it is the
   * one people mean when they say "send them a link". The stricter option being
   * the deliberate tick is the right way round: choosing to be more careful is
   * a decision, and being more careful by accident produces a link that
   * mysteriously stops working for the second person you sent it to.
   */
  const [singleUse, setSingleUse] = useState(false)

  /**
   * Ticked means somebody inside has to let them in.
   *
   * Unticked by default for the same reason `singleUse` is, and the reason
   * matters more here: a knock link that nobody answers is a visitor who was
   * sent a link and got nothing. Making that the accident rather than the
   * decision would be the wrong way round.
   */
  const [mustKnock, setMustKnock] = useState(false)

  /**
   * The room the person making the link is standing in, or null in the lounge.
   *
   * Read from the path rather than passed down, because the rail is mounted by
   * the space layout and the room is a parameter of a route *below* it - the
   * layout genuinely does not know, and threading it would mean every page
   * under `/t/[slug]` declaring where it is for the benefit of one panel.
   *
   * `guestRoomSlug` is reused rather than a fresh regex: it already parses
   * exactly this shape, and it confines through `guestArrival` on the way, so a
   * path that is not inside this space answers null instead of minting a link
   * pointing out of it.
   */
  const here = guestRoomSlug(usePathname(), slug)

  /**
   * Default on, and only offered when there is a room to be in.
   *
   * On, because standing in a room and pressing "create link" means "let them
   * come here" - the lounge default is what sent guests to a different Realtime
   * topic from the person who invited them, which reads as presence being
   * broken rather than as a link pointing somewhere else. Off is still worth
   * offering: handing somebody the front door while you happen to be in a room
   * is a real thing to want.
   */
  const [intoRoom, setIntoRoom] = useState(true)

  /**
   * A match beats a room, when you are standing in one.
   *
   * The match room used to carry its own invite button on a strip over the
   * level; it lives here now, and this is the whole of what moved. The
   * destination is the difference that matters: `battleDestination` is the
   * shared format the sweep matches on when it revokes these links after a
   * match empties, so a hand-rolled URL here would leave tokens behind that
   * nothing cleans up.
   *
   * Read from the same store the rail's match block reads, rather than from the
   * path. A battle id in a URL is an id; the store already holds the match, and
   * asking it means this file never learns a second route shape.
   */
  const match = useCurrentMatch()

  const target = match
    ? { destination: battleDestination(slug, match.battleId), label: t.intoMatch }
    : here
      ? { destination: roomDestination(slug, here), label: t.intoRoom }
      : null

  const destination = target && intoRoom ? target.destination : null

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    start(async () => {
      const result = await action()
      if (!result.ok) setError(refusal(result.error ?? t.somethingWrong))
    })
  }

  /**
   * Copy, with a fallback.
   *
   * `navigator.clipboard` needs a secure context and this rail is reachable
   * over plain http in development, so a failure shows the URL to copy by hand
   * rather than silently doing nothing - the difference between "copy is
   * broken" and "copy did nothing and I did not notice".
   */
  const copy = async (link: GuestLinkView) => {
    const url = guestLinkUrl(origin, link.token)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(link.id)
      setTimeout(() => setCopied((id) => (id === link.id ? null : id)), 2000)
    } catch {
      setError(url)
    }
  }

  // Revoked links are dropped here, unlike the admin lists. The rail is a
  // working surface rather than a record - what is live, and who is in - and a
  // growing column of dead tokens would push the useful part off the bottom.
  const active = links.filter((link) => !link.revokedAt)

  return (
    <div className="space-y-2">
      {/*
        Who is actually in, before how they got in.

        The order is the point. Revoking a link used to be the only way to
        remove anybody, which meant the only available answer to "this one
        person is being a problem" was to also eject the three others who came
        through the same link and break the URL still sitting in a thread. The
        list is above the links because a guest is a person in the room and a
        link is a piece of plumbing.
      */}
      {guests.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between px-3 pb-1">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
              {t.guestsIn}
            </h2>
            <span className="text-[10px] text-ink-muted">
              {guests.length}
              {capacity !== null && `/${capacity}`}
            </span>
          </div>

          <ul className="space-y-1 px-3">
            {guests.map((guest) => (
              <li
                key={guest.guestId}
                className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface/60 px-2 py-1.5"
              >
                <span className="truncate text-[11px] text-ink">{guest.displayName}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => removeGuest(slug, guest.guestId))}
                  // Says the part that is not obvious. A kick is instant and
                  // total - the row *is* their standing, so it ends mid-click -
                  // but it does not touch the link, so somebody who still has
                  // the URL can walk straight back in. Revoke is the other
                  // button, and this is how you find that out before rather
                  // than after.
                  title={fill(t.kickTitle, { name: guest.displayName })}
                  className="shrink-0 text-[10px] text-ink-muted transition hover:text-red-400 disabled:opacity-60"
                >
                  {t.kick}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-baseline justify-between px-3 pb-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          {t.links}
        </h2>
      </div>

      <div className="space-y-2 px-3">
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-muted">
          <input
            type="checkbox"
            checked={singleUse}
            onChange={(event) => setSingleUse(event.target.checked)}
            className="size-3 accent-[var(--accent)]"
          />
          {t.singleUse}
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-muted">
          <input
            type="checkbox"
            checked={mustKnock}
            onChange={(event) => setMustKnock(event.target.checked)}
            className="size-3 accent-[var(--accent)]"
          />
          {t.mustKnock}
        </label>

        {/* Only when there is somewhere else to point. In the lounge, with no
            match on, the tick would be a control with one setting. */}
        {target && (
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-muted">
            <input
              type="checkbox"
              checked={intoRoom}
              onChange={(event) => setIntoRoom(event.target.checked)}
              className="size-3 accent-[var(--accent)]"
            />
            {target.label}
          </label>
        )}

        {/* Only when it is ticked. The consequence is worth stating - somebody
            has to be around, and a visitor who is not let in gets nothing - but
            a permanent paragraph explaining an unticked box is the kind of
            help text people stop reading. */}
        {mustKnock && (
          <p className="text-[10px] leading-relaxed text-ink-muted">{t.knockNote}</p>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() =>
              createGuestLink(slug, {
                maxUses: singleUse ? 1 : null,
                requiresKnock: mustKnock,
                destination,
              }),
            )
          }
          className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px] font-medium text-ink transition hover:border-accent hover:text-accent disabled:opacity-60"
        >
          {t.createLink}
        </button>

        {error && (
          <p role="alert" className="break-all text-[10px] text-red-400">
            {error}
          </p>
        )}
      </div>

      {active.length === 0 ? (
        <p className="px-3 text-[11px] text-ink-muted">{t.noLinks}</p>
      ) : (
        <ul className="space-y-1.5 px-3">
          {active.map((link) => (
            <li key={link.id} className="rounded-lg border border-line bg-surface/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[10px] font-medium text-ink">
                  {link.maxUses === null ? t.open : t.singleEntry}
                  {/* Marked on the row rather than only at creation, because
                      the two kinds of link behave completely differently for
                      the person you hand one to, and a rail full of
                      indistinguishable "Open" rows is how you send somebody the
                      wrong one. */}
                  {link.requiresKnock && (
                    <span className="rounded bg-amber-400/20 px-1 py-0.5 text-[9px] font-medium text-amber-300">
                      {t.knockTag}
                    </span>
                  )}
                </span>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => copy(link)}
                    className="text-[10px] text-ink-muted transition hover:text-accent"
                  >
                    {copied === link.id ? t.copied : t.copy}
                  </button>
                  {/*
                    Folded away rather than always open, and one at a time.

                    A code is the right thing when the people you are inviting
                    are in the room with you, and the wrong thing when they are
                    not - which is most of the time this rail is open. Four rows
                    each carrying a QR square would push the guest list, which
                    is the part somebody came here to read, off the bottom.
                  */}
                  <button
                    type="button"
                    onClick={() => setShown((id) => (id === link.id ? null : link.id))}
                    aria-expanded={shown === link.id}
                    className="text-[10px] text-ink-muted transition hover:text-accent"
                  >
                    {shown === link.id ? t.hide : t.showCode}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => revokeGuestLink(slug, link.id))}
                    // Spells out the consequence, because "revoke" reads as
                    // "stop new people joining" and this also empties the room
                    // of everybody that link let in.
                    title={
                      link.liveGuests > 0
                        ? fill(t.revokeTitleWith, { n: link.liveGuests })
                        : t.revokeTitle
                    }
                    className="text-[10px] text-ink-muted transition hover:text-red-400 disabled:opacity-60"
                  >
                    {t.revoke}
                  </button>
                </div>
              </div>

              {/*
                Where it puts them, which is the thing this list used to leave
                out entirely.

                Every row said how a link behaves - open or single entry,
                whether it makes them knock - and nothing about where it goes,
                so four links made from four different rooms rendered as four
                identical rows. Picking the wrong one is not a visible mistake:
                the visitor gets in, lands in the lounge, and waits somewhere
                nobody is.

                Above the counts rather than beside the kind, because it is the
                longest thing on the row and the one worth reading first.
              */}
              <p className="mt-1 flex items-center gap-1 text-[10px] text-ink-muted">
                <span aria-hidden>→</span>
                <span className="truncate text-ink">
                  {guestLandingLabel(link.landing, t.landing)}
                </span>
              </p>

              {/*
                The code, the link and the Telegram share, for the one row that
                asked for them.

                `guestLinkUrl` again rather than a value carried down from
                `copy`: the origin is the server's, not `window.location`'s, and
                the note at the top of `domain/guests/actions` explains why that
                distinction is load-bearing - a link built from the address bar
                on a laptop pointed at staging pastes `localhost` into a chat.
              */}
              {shown === link.id && (
                <ShareInvite
                  url={guestLinkUrl(origin, link.token)}
                  className="mt-2 rounded-lg border border-line bg-black/30 p-2"
                />
              )}

              {/* The two numbers that are actually asked about: how many have
                  ever walked through this link, and how many of them are still
                  here. They are different questions - a link with twelve
                  entries and nobody online is a link that had a good afternoon. */}
              <p className="mt-1 text-[10px] text-ink-muted">
                {fill(t.counts, { uses: link.uses, live: link.liveGuests })}
                {link.maxUses !== null &&
                  fill(t.countsCapped, { uses: link.uses, max: link.maxUses })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
