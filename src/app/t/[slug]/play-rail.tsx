'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { attempt } from '@/app/components/connection'
import { XpPicker } from '@/app/t/[slug]/xp-picker'
import { fightable } from '@/domain/battle/xp-rules'
import {
  findPlayableXps,
  openXpHere,
  pinXp,
  type PlayableRail,
  unpinXp,
} from '@/domain/xps/place-actions'
import type { ShelfRow } from '@/domain/magazine/shelf'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * The levels this space can play, in the rail's Play tab.
 *
 * ---------------------------------------------------------------------------
 * Why the store is not enough
 * ---------------------------------------------------------------------------
 * docs/xp/backlog.md §11.5. An XP is something you open from a page; a place is
 * somewhere you already are, with people in it. The distance between those two
 * is the whole problem this closes - four people in a lounge who want to play
 * the level one of them finished this morning had to leave, find it, and come
 * back through a four-step wizard, and the wizard is right for a match somebody
 * is *inventing*. This is the other mood: the level has already decided the
 * mode, the ground and the clock, so there is one question left and it is
 * "that one".
 *
 * The Battle hub keeps the wizard. This is not a smaller copy of it - it has no
 * ground picker, no mode, no roster, because an XP answers all three.
 *
 * ---------------------------------------------------------------------------
 * The list is the shared picker now
 * ---------------------------------------------------------------------------
 * The shelf half of this used to be the flat list `listPlayableXps` returned,
 * which is the same list `/browse` drew with its own copy of the row. Both draw
 * `XpPicker` since the magazine exists, and what stays here is the part that is
 * only true in a rail: two ways to play a level, said out loud, because the
 * difference between them is how long the thing lasts and that is the one thing
 * a picker cannot show you afterwards.
 *
 * ---------------------------------------------------------------------------
 * Fetched on open, held while the tab is
 * ---------------------------------------------------------------------------
 * Nothing is passed in from the layout, deliberately: see `findPlayableXps`.
 * The cost of that is a spinner the first time the tab is opened, which is the
 * right trade against three queries on every page in the space.
 *
 * **No `useOptimistic` here, and that is not an oversight.** This is a rail
 * over a live scene: opening a match is a server round trip that ends in a
 * navigation, and there is no local state worth pretending about - a tick that
 * appeared and then reverted would be worse than the half second of "Opening…".
 */
export function PlayRail({
  slug,
  /**
   * May this person keep a level standing as a room?
   *
   * The rail offers two things to do with a level and only one of them is
   * everybody's. `pinXp` lands on `createXpRoom`, which answers a member with
   * "Only an owner or admin can manage rooms" - so the room half was a button,
   * a name field and two lines of copy that existed to be refused. Running a
   * match is genuinely open to a member and stays put.
   *
   * The same `canManageRooms` the Rooms tab beside this one is drawn from, so
   * the two tabs cannot come to disagree about who may open a room.
   */
  canKeepRooms,
}: {
  slug: string
  canKeepRooms: boolean
}) {
  const refusal = useRefusal()
  const t = railDict(useLocale()).play
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rail, setRail] = useState<PlayableRail | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The one being opened, so only its own button says so. */
  const [opening, setOpening] = useState<string | null>(null)
  /**
   * What is standing, held locally on top of what the server said.
   *
   * The pin actions revalidate the layout - the Places list has to grow a row -
   * but this panel is not on that path: it is a rail whose contents came from an
   * action, so nothing re-renders it. Tracking the change here is what makes the
   * button say the new thing immediately.
   *
   * `useState` and a manual rollback rather than `useOptimistic`, which is the
   * house rule for scene rails and is load-bearing here: without a revalidation
   * of *this* list, an optimistic value has nothing to be confirmed against and
   * silently snaps back.
   */
  const [pinned, setPinned] = useState<string[] | null>(null)
  const standing = pinned ?? rail?.pinned ?? []
  /**
   * What each room is being called, while somebody is typing it.
   *
   * Undefined means "the level's own name", which is also what the field shows
   * as a placeholder - so the common case is a button press with nothing typed,
   * and the field is there for the space that wants its own word for the room.
   * Keyed by reference because the panel can have several rows open over its
   * lifetime and a single string would follow the reader between them.
   */
  const [naming, setNaming] = useState<Record<string, string | undefined>>({})

  /**
   * One fetch, when the tab first appears.
   *
   * The tab is unmounted when another one is selected (see `rail-tabs`), so
   * coming back here asks again - which is the behaviour worth having: the
   * list's whole job is to include the level somebody just saved, and now also
   * the one somebody just took in.
   */
  useEffect(() => {
    let live = true

    // `attempt` rather than a bare call: a throw inside a rail rendered over a
    // running scene reaches the error boundary and takes the world with it.
    void attempt(() => findPlayableXps(slug)).then((result) => {
      if (!live) return
      // `attempt` answers either what was asked for or its own refusal, and
      // this is the one caller whose success shape has no `ok` on it to tell
      // them apart - so the list itself is what says which arrived.
      if ('magazine' in result) setRail(result)
      else setError(refusal(result.error))
    })

    return () => {
      live = false
    }
  }, [slug, refusal])

  /**
   * Keep it, or take it down.
   *
   * One control with two directions rather than two buttons, because the
   * question a reader has is "is this one of ours" and the answer is the state
   * of the thing they press.
   */
  function keep(row: ShelfRow, next: boolean) {
    setError(null)
    const before = standing
    setPinned(next ? [...before, row.ref] : before.filter((ref) => ref !== row.ref))
    const called = naming[row.ref]
    setNaming((all) => ({ ...all, [row.ref]: undefined }))

    startTransition(async () => {
      const result = await attempt(() =>
        next ? pinXp(slug, row.ref, called) : unpinXp(slug, row.ref),
      )
      if (!result.ok) {
        // Put it back where it was. The row is the only thing that moved, so
        // the rollback is the whole recovery.
        setPinned(before)
        setNaming((all) => ({ ...all, [row.ref]: called }))
        setError(refusal(result.error))
      }
    })
  }

  function open(row: ShelfRow) {
    setError(null)
    setOpening(row.ref)

    startTransition(async () => {
      const result = await attempt(() => openXpHere(slug, row.ref))
      setOpening(null)

      if (!result.ok) {
        setError(refusal(result.error))
        return
      }

      // Straight in, and a refresh first for the same reason the rooms rail
      // gives: the match is now in the lists this rail is rendered beside, and
      // without it they stay stale until something else happens.
      router.refresh()
      router.push(`/t/${slug}/battle/${result.battleId}`)
    })
  }

  if (error && !rail) {
    return <p className="px-3 py-2 text-[11px] text-ink-muted">{error}</p>
  }

  if (!rail) {
    return (
      <p className="px-3 py-2 text-[11px] text-ink-muted" role="status">
        {t.looking}
      </p>
    )
  }

  const { magazine } = rail

  if (magazine.inMagazine.length + magazine.catalogue.length === 0) {
    /*
      The empty state is a door, not a shrug.

      backend.md §8.2 makes this argument about the store on the day it ships
      with four things in it, and it is truer here: a space that has built
      nothing has an empty Play tab, and "nothing here" reads like a broken
      feature. What it actually means is that nobody has made one yet.
    */
    return (
      <div className="space-y-2 px-3 py-2">
        <p className="text-[11px] text-ink-muted">{t.emptyBody}</p>
        <Link
          href={`/t/${slug}/browse`}
          className="inline-block text-[11px] text-accent hover:underline"
        >
          {t.emptyCta}
        </Link>
      </div>
    )
  }

  return (
    <XpPicker
      slug={slug}
      inMagazine={magazine.inMagazine}
      catalogue={magazine.catalogue}
      hidden={magazine.hidden}
      blocked={rail.blocked}
      dense
      footer={
        error ? (
          <p role="alert" className="text-[10px] text-rose-300">
            {error}
          </p>
        ) : null
      }
      controls={(row) => (
        /*
          Two modes, said out loud rather than left to be discovered.

          They are genuinely different products of the same level and the
          difference is *how long it lasts*, which is the one thing a picker
          cannot show you afterwards. So each says what it makes and what
          becomes of it: a match is a session that the backstop closes a day
          later or the host closes sooner, and a room is furniture that stays
          until somebody takes it down. Discovering that a Friday room had
          evaporated by Monday is the failure this wording exists to prevent.
        */
        <div className="space-y-2">
          {/*
            Only a level a match can be fought in offers one.

            The mirror of the `freeplay` check below, and the sentence is the
            mirror too: that one says "this is a game, not a place", this one
            says "this is a place, not a match". A cartridge whose rules are
            code either has a match in it or does not - the café and the house
            do not - and `createBattle` refuses one either way. See `fightable`.
          */}
          {row.xp && !fightable(row.xp) ? (
            <p className="px-0.5 text-[10px] leading-snug text-ink-muted/80">{t.roomOnly}</p>
          ) : (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => open(row)}
              disabled={pending}
              className="w-full rounded-md border border-accent/60 bg-accent/10 px-2 py-1.5 text-[11px] font-medium transition hover:border-accent disabled:opacity-40"
            >
              {opening === row.ref ? t.opening : t.runBattle}
            </button>
            <p className="px-0.5 text-[10px] leading-snug text-ink-muted/80">
              {t.battleNote}
            </p>
          </div>
          )}

          {/*
            Only a level that says it can be a room offers to be one.

            `freeplay` is the document's own word for "a place people just walk
            into", and it is on every level by default - the editor's *Where it
            can be played* is where an author takes it off, which is how the
            board game says it is a table for four and not a room. A level
            that already stands as a room keeps its take-down button whatever
            it now declares: the room is furniture somebody put up, and an
            edit to the level must not strand it.
          */}
          {!canKeepRooms ? null : standing.includes(row.ref) ? (
            <div className="space-y-1">
              <p className="px-0.5 text-[10px] leading-snug text-ink-muted/80">
                {t.standingNote}
              </p>
              <button
                type="button"
                onClick={() => keep(row, false)}
                disabled={pending}
                className="w-full px-2 py-0.5 text-left text-[11px] text-ink-muted transition hover:text-ink disabled:opacity-40"
              >
                {t.takeDown}
              </button>
            </div>
          ) : row.xp && !row.xp.capabilities.includes('freeplay') ? (
            <p className="px-0.5 text-[10px] leading-snug text-ink-muted/80">{t.battleOnly}</p>
          ) : (
            <div className="space-y-1">
              {/*
                The name, defaulted rather than demanded.

                The placeholder *is* the value when nothing is typed - see
                `pinXp` - so this is a field somebody can ignore entirely, and
                the one space that wants to call the room something other than
                what the author called the level does not have to rename it
                afterwards.
              */}
              <input
                value={naming[row.ref] ?? ''}
                onChange={(event) =>
                  setNaming((all) => ({ ...all, [row.ref]: event.target.value }))
                }
                placeholder={row.name}
                maxLength={60}
                aria-label={t.nameLabel}
                className="w-full rounded-md border border-line bg-surface px-2 py-1 text-[11px] outline-none focus:border-accent/60"
              />
              <button
                type="button"
                onClick={() => keep(row, true)}
                disabled={pending}
                className="w-full rounded-md border border-line px-2 py-1.5 text-[11px] font-medium transition hover:border-accent/60 hover:bg-surface disabled:opacity-40"
              >
                {t.keepAsRoom}
              </button>
              <p className="px-0.5 text-[10px] leading-snug text-ink-muted/80">
                {t.keepNote}
              </p>
            </div>
          )}
        </div>
      )}
    />
  )
}
