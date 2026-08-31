'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useId, useState, useTransition } from 'react'
import {
  closeRoom,
  createRoom,
  renameRoom,
  setRoomGroup,
  setRoomIcon,
  setRoomPinned,
  setRoomTint,
  setRoomVisibility,
} from '@/domain/rooms/actions'
import { ROOM_GROUP_MAX } from '@/domain/rooms/events'
import { ROOM_ICONS, ROOM_TINTS } from '@/domain/rooms/look'
import { groupNames } from '@/domain/rooms/places'
import { RoomGlyph, tintClass } from '@/app/t/[slug]/room-icons'
import { attempt } from '@/app/components/connection'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict, type RailDict } from '@/app/i18n/rail'
import {
  closeRoomMatch,
  copyRoomXp,
  findPlayableXps,
  findRoomMatch,
  findRoomUpdate,
  openXpHere,
  swapRoomXp,
  type RoomMatch,
  type RoomUpdate,
} from '@/domain/xps/place-actions'
import { SceneDebug } from '@/app/xp/_runtime/hud/scene-debug'
import { UnstickButton } from '@/app/t/[slug]/unstick-button'
import { parseXpRef } from '@/domain/xps/ref'
import type { RoomVisibility } from '@/domain/rooms/events'
import type { RoomView } from '@/domain/rooms/queries'
import type { PlayableXp } from '@/domain/xps/playable'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Rooms, in the rail's Room tab.
 *
 * This is where a room is made and managed, rather than on the rooms page,
 * because of when you want to do it: the moment you want another room is the
 * moment you are standing in one that is busy. Sending somebody to a separate
 * admin screen to open a room means leaving the room they are in, which is the
 * one thing they were trying not to do.
 *
 * The page at /t/[slug]/rooms still exists and lists the same rooms - it is the
 * place you land from a link, and the place a phone reads comfortably. This is
 * the copy that is always to hand.
 *
 * Three things, in the order somebody reaches for them: walk into one, manage
 * the one you are in, open a new one.
 */
export function RoomsRail({
  slug,
  rooms,
  canManage,
}: {
  slug: string
  rooms: RoomView[]
  /** Owner or admin, and the space can still write. */
  canManage: boolean
}) {
  const refusal = useRefusal()
  const locale = useLocale()
  const t = railDict(locale).roomTab
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<RoomVisibility>('open')
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The room whose row has turned into a name field, if any. */
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  /**
   * What is typed in the group field, and which room it is about.
   *
   * The pair rather than a bare string, and for the reason `asked` gives below:
   * walking next door while a caption is half typed must not offer that caption
   * as the room you have just walked into. Comparing in the render is what makes
   * that free - clearing it in an effect would be a second pass, and a pass in
   * which the new room briefly wears the old room's group.
   */
  const [grouping, setGrouping] = useState<{ roomId: string; value: string } | null>(null)
  /** The datalist the group field offers, named once so both ends agree. */
  const groupsId = useId()
  /**
   * The room whose face is open for editing, if any.
   *
   * On the *row* rather than in the "This room" panel below, and that is the
   * whole placement decision. The panel is about the room you are standing in,
   * which is the right home for the level and the fixture - you have to be in a
   * room to care what it is playing. An icon is the opposite: the reason
   * anybody sets one is that they are looking at the list and cannot tell two
   * rooms apart, and making them walk into each room in turn to fix that is
   * asking them to leave the only screen the problem is visible on.
   */
  const [facing, setFacing] = useState<string | null>(null)
  /**
   * The levels this space can play, once somebody has asked for the picker.
   *
   * `null` until then, and fetched rather than passed down for the reason
   * `findPlayableXps` gives at length: it is three queries, and putting them in
   * the layout would run them on every page in the space to fill a list that
   * only opens when an admin wants to change what a room plays. Undefined
   * while it is in flight is not tracked separately - `swapping` is what the
   * panel reads to know it asked.
   */
  const [levels, setLevels] = useState<PlayableXp[] | null>(null)
  /**
   * The room whose level picker is open, if any.
   *
   * The *room* rather than a boolean, so walking into another one closes it
   * without an effect to notice: the panel is titled "This room", the rail
   * outlives the page under it, and a picker left open would be offering to
   * change the level of the room somebody has just left. The list of levels is
   * kept - that one is the space's, not the room's.
   */
  const [swapping, setSwapping] = useState<string | null>(null)

  /** The room this rail is being rendered inside, if it is one. */
  const here = rooms?.find((room) => pathname.startsWith(`/t/${slug}/rooms/${room.slug}`))
  /** What that room plays, if it plays anything. */
  const reference = here?.xpRef


  /**
   * The fixture, and the level it was asked about.
   *
   * Kept as a pair rather than on its own so that "is this answer about the
   * room I am standing in" is a comparison in the render, not a reset in an
   * effect. Clearing it on the way past would be a second render pass, and a
   * pass in which the new room briefly wears the old room's fixture.
   *
   * `useState` and a manual rollback rather than `useOptimistic`, which is the
   * house rule for a rail over a live scene and is load-bearing here for the
   * reason `play-rail` gives: nothing revalidates *this* panel, so an optimistic
   * value has nothing to be confirmed against and snaps back silently.
   */
  const [asked, setAsked] = useState<{
    reference: string
    match: RoomMatch | null
  } | null>(null)

  /**
   * A newer version of what this room plays, paired with what it was asked
   * about.
   *
   * The same shape as `asked` above and for the same reason: an answer about
   * the room next door is not an answer about this one, and comparing in the
   * render beats clearing it in an effect on the way past.
   */
  const [newer, setNewer] = useState<{
    reference: string
    update: RoomUpdate | null
  } | null>(null)

  const update =
    reference && newer?.reference === reference ? newer.update : null

  /**
   * `undefined` is "not asked yet" and `null` is "asked, and there is none" -
   * three states rather than two, because a control that says "Run a match"
   * before the answer is in is a control that offers a second one. An answer
   * about the room next door is not an answer about this one, so it reads as
   * the first of the three.
   */
  const match =
    reference && asked?.reference === reference ? asked.match : undefined

  /**
   * Asked once per room, when the tab is showing one that plays a level.
   *
   * Not in the layout, for the reason `findPlayableXps` gives at length: the
   * layout renders on every page in the space and this is a question about one
   * room somebody is standing in. Re-asked when the room changes, because
   * walking next door is walking into a different fixture.
   */
  useEffect(() => {
    if (!reference) return

    let live = true
    void attempt(() => findRoomMatch(slug, reference)).then((result) => {
      if (!live) return
      // `attempt`'s refusal is an object with `ok: false` on it and this
      // action's success is a `RoomMatch` or null, so the tell is the field
      // rather than a shape - the same read `play-rail` makes.
      if (result === null) setAsked({ reference, match: null })
      else if ('battleId' in result) setAsked({ reference, match: result })
      else setError(refusal(result.error))
    })

    return () => {
      live = false
    }
  }, [slug, reference, refusal])

  /**
   * And whether there is a newer version of it, asked the same way.
   *
   * A second call rather than one that answers both: they are different
   * questions with different lifetimes - a fixture starts and ends while
   * somebody is standing there, and a version appears when an author saves.
   */
  useEffect(() => {
    if (!reference) return

    let live = true
    void attempt(() => findRoomUpdate(slug, reference)).then((result) => {
      if (!live) return
      if (result === null) setNewer({ reference, update: null })
      else if ('ref' in result) setNewer({ reference, update: result })
      else setError(refusal(result.error))
    })

    return () => {
      live = false
    }
  }, [slug, reference, refusal])

  function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      // A throw inside a transition goes to the error boundary, which for a
      // rail rendered over a live world means losing the world to a moment of
      // bad signal. `attempt` turns that into a line in the rail instead.
      const result = await attempt(run)
      if (!result.ok) setError(refusal(result.error ?? railDict(locale).visitors.thatDidNotWork))
      else router.refresh()
    })
  }

  /**
   * Commit whatever is in the name field.
   *
   * Reached twice for one rename - Enter submits the form, and the field then
   * unmounts, which fires its own blur - so closing the field first is what
   * makes the second call a no-op rather than a second append.
   */
  function rename(room: RoomView) {
    if (renaming !== room.roomId) return
    const next = draft.trim()
    setRenaming(null)
    // An empty field or the name it already had is a cancel, not an error to
    // put in front of somebody who has just pressed Escape's slower cousin.
    if (next.length === 0 || next === room.name) return

    setError(null)
    startTransition(async () => {
      const result = await renameRoom(slug, room.roomId, next)
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      router.refresh()
      // The address is made from the name - see roomSlug - so renaming the room
      // you are standing in moves it out from under you. Replace rather than
      // push: the old URL no longer resolves, and Back should not return to it.
      if (here?.roomId === room.roomId) {
        router.replace(`/t/${slug}/rooms/${result.slug}`)
      }
    })
  }

  /**
   * Commit whatever is in the group field.
   *
   * Reached twice for one change - Enter blurs the field, and the blur commits
   * - so clearing the draft first is what makes the second call a no-op rather
   * than a second append. The same shape `rename` above has, for the same
   * reason.
   *
   * An empty field is "take it out of its group", not a refusal. It is what the
   * field says when somebody clears it, and the alternative is a separate
   * button beside a field they have just emptied.
   */
  function regroup(room: RoomView) {
    if (grouping?.roomId !== room.roomId) return
    const next = grouping.value.trim()
    setGrouping(null)
    // Already what it is. The decider would refuse to log it anyway; not asking
    // saves the round trip and the layout revalidation behind it, which for a
    // rail over a live scene is a re-render nobody asked for.
    if (next === (room.group ?? '')) return
    act(() => setRoomGroup(slug, room.roomId, next.length === 0 ? null : next))
  }

  /**
   * Open the level picker, and fetch the list the first time it is opened.
   *
   * Held afterwards for as long as the rail is mounted. A second swap in one
   * session is rare enough that a stale list is a better trade than a round
   * trip on every open - and the list it could be stale about is "what this
   * space can play", which changes when somebody publishes a level rather than
   * minute to minute.
   */
  function openLevels(room: RoomView) {
    setError(null)
    setSwapping(room.roomId)
    if (levels) return

    void attempt(() => findPlayableXps(slug)).then((result) => {
      // `attempt`'s own refusal has no `magazine` on it - the same tell
      // `play-rail` reads, and for the same reason: this action's success shape
      // has no `ok` to tell the two apart.
      if (!('magazine' in result)) {
        setError(refusal(result.error))
        return
      }

      /*
       * Flattened back into one list, shelf first.
       *
       * This picker asks a different question from the one the magazine
       * answers - *what could this room play instead*, which is every level
       * this space may play rather than only the ones it collected - so it
       * takes both halves. The order still carries: what a space took in is
       * what it is most likely to be swapping to.
       *
       * A shelf entry whose XP is gone drops out. There is nothing to swap a
       * room onto, and `swapRoomXp` would refuse it.
       */
      setLevels(
        [...result.magazine.inMagazine, ...result.magazine.catalogue]
          .map((row) => row.xp)
          .filter((level): level is PlayableXp => level !== null),
      )
    })
  }

  /**
   * Put another game in this room.
   *
   * A refresh rather than local state, and it is the whole point: the level is
   * drawn by a server render, so what has to change is the page under the rail.
   * The scene tears down and the new document mounts, which is what swapping a
   * game means.
   */
  function swap(room: RoomView, reference: string) {
    setError(null)
    setSwapping(null)
    startTransition(async () => {
      const result = await attempt(() => swapRoomXp(slug, room.roomId, reference))
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      router.refresh()
    })
  }

  /**
   * Take your own copy of this room's level, and land in the editor on it.
   *
   * docs/xp/backlog.md §1c's member half. Deliberately **not** a swap: the
   * room's pointer stays where it was, and an admin moves it when they want to.
   * What this does is remove the only genuinely awkward step in that flow —
   * finding the project the room plays, in a list, on another page — because
   * the person who wants to change a level is standing in it.
   *
   * The editor rather than the project page, which is why this could not reuse
   * `copyXp`: the whole reason somebody presses this is that they want to
   * change something, and a stop at a page about the copy is a click that
   * teaches them nothing.
   */
  function copyLevel(room: RoomView) {
    setError(null)
    startTransition(async () => {
      const result = await attempt(() => copyRoomXp(slug, room.roomId))
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      router.push(`/t/${slug}/studio/xp/${result.xpId}`)
    })
  }

  /**
   * Run a match of what this room plays, and go to it.
   *
   * `openXpHere` rather than a second way to make one - the same call the Play
   * tab's button makes, with this room's reference instead of a card's. What
   * shape it comes out as is the level's business now (`battleModeFor`), which
   * is why there is no mode picker here: a room control that asked the question
   * would be a second answer to it, and the level already has one.
   */
  function runMatch(reference: string) {
    setError(null)
    startTransition(async () => {
      const result = await attempt(() => openXpHere(slug, reference))
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      router.refresh()
      router.push(`/t/${slug}/battle/${result.battleId}`)
    })
  }

  /**
   * Turn it off, and stay where you are.
   *
   * No navigation, deliberately: the person calling a fixture off is standing
   * in the room and means to go on standing in it. The room, its level and
   * everybody in it are untouched - see `closeRoomMatch`.
   */
  function callOff(reference: string) {
    setError(null)
    setAsked({ reference, match: null })
    startTransition(async () => {
      const result = await attempt(() => closeRoomMatch(slug, reference))
      if (!result.ok) {
        setError(refusal(result.error))
        // Put it back. The panel is the only thing that moved, so re-asking is
        // the whole recovery - and asking is what makes it right rather than
        // merely restored.
        void attempt(() => findRoomMatch(slug, reference)).then((again) => {
          if (again && 'battleId' in again) setAsked({ reference, match: again })
        })
        return
      }
      router.refresh()
    })
  }

  /**
   * Move this room onto a newer version of the level it already plays.
   *
   * `swapRoomXp` rather than an update action of its own - it is the same act,
   * and every check that matters is already there: the reference has to be one
   * this space may play, and the room's capacity comes from the level rather
   * than the caller. An "update" path beside it would be a second place for
   * those to be got right.
   */
  function updateTo(room: RoomView, ref: string) {
    setError(null)
    setNewer({ reference: ref, update: null })
    startTransition(async () => {
      const result = await attempt(() => swapRoomXp(slug, room.roomId, ref))
      if (!result.ok) {
        setError(refusal(result.error))
        // Ask again rather than restoring what we had: the offer may be stale
        // for the same reason the swap failed.
        setNewer(null)
        return
      }
      router.refresh()
    })
  }

  function open(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createRoom(slug, name, visibility)
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      setName('')
      setVisibility('open')
      setOpening(false)
      // Straight in. A room opens empty - no floor, nothing to stand on - and
      // laying one is a click away once you are inside it.
      // Refresh before navigating, so the rail this is rendered inside has
      // the new room by the time the new page paints. `revalidatePath` marked
      // the layout stale on the server; this is what makes the client go and
      // get it, and without it the room existed everywhere except in the list
      // beside you until something else happened to refresh.
      router.refresh()
      router.push(`/t/${slug}/rooms/${result.slug}`)
    })
  }

  return (
    <div className="space-y-3 px-2 pb-2">
      {error && (
        <p role="alert" className="rounded-lg bg-red-500/15 px-2 py-1.5 text-[11px] text-red-300">
          {error}
        </p>
      )}

      {/* --- where you can go ------------------------------------------- */}
      <div>
        <p className="px-1 pb-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          {t.heading}
        </p>

        <Link
          href={`/t/${slug}/lounge`}
          className={`block rounded-lg px-2 py-1.5 text-xs transition hover:bg-surface-raised ${
            pathname.startsWith(`/t/${slug}/lounge`) ? 'bg-accent/15 text-ink' : 'text-ink-muted'
          }`}
        >
          {t.theLounge}
        </Link>

        {rooms?.map((room) =>
          renaming === room.roomId ? (
            /*
              The row itself becomes the field, rather than a dialog or a panel
              below. Renaming is the smallest edit in here - one word, usually
              a typo - and the thing you are checking your typing against is the
              list of the other names, which a modal would cover up.
            */
            <form
              key={room.roomId}
              onSubmit={(event) => {
                event.preventDefault()
                rename(room)
              }}
              className="px-1 py-1"
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setRenaming(null)
                  }
                }}
                // Leaving the field is the same as pressing Enter. There is no
                // Save button beside it, so a blur that threw the new name away
                // would be a rename that silently did not happen.
                onBlur={() => rename(room)}
                maxLength={60}
                autoFocus
                disabled={pending}
                aria-label={fill(t.rename, { name: room.name })}
                className="w-full rounded-lg border border-accent/60 bg-surface px-2 py-1 text-xs disabled:opacity-50"
              />
            </form>
          ) : (
            <div key={room.roomId}>
              <div className="group flex items-center gap-1">
                <Link
                  href={`/t/${slug}/rooms/${room.slug}`}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition hover:bg-surface-raised ${
                    here?.roomId === room.roomId ? 'bg-accent/15 text-ink' : 'text-ink-muted'
                  }`}
                >
                  {/*
                    The room's own face, at the same size the rail draws it -
                    so this list and the Places band above show the same thing,
                    and picking an icon can be checked without leaving the
                    panel it was picked in.
                  */}
                  <span
                    aria-hidden
                    className={`room-face shrink-0 [&_svg]:size-4 ${tintClass(room.tint)}`}
                  >
                    <RoomGlyph name={room.icon} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{room.name}</span>
                  {/* Only worth a mark when it is the unusual one. Every room being
                      labelled "listed" is a column of noise. */}
                  {room.visibility === 'private' && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-muted/70">
                      {t.unlistedTag}
                    </span>
                  )}
                </Link>

                {/*
                  Hidden until the row is hovered, and always reachable by
                  keyboard - the same bargain the roster's "Show out" strikes. A
                  rename button permanently beside every room would make a list of
                  places to walk into read as a list of things to administer.

                  The face button stays open once it is open, which is why it is
                  not hidden while its own panel is showing: a control that
                  vanished the moment the pointer left the row would be a panel
                  with no way to shut it.
                */}
                {canManage && (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setError(null)
                        setDraft(room.name)
                        setRenaming(room.roomId)
                      }}
                      title={fill(t.rename, { name: room.name })}
                      className="shrink-0 rounded-lg px-1.5 py-1 text-[11px] text-ink-muted opacity-0 transition hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                    >
                      {t.renameShort}
                    </button>

                    <button
                      type="button"
                      disabled={pending}
                      aria-expanded={facing === room.roomId}
                      onClick={() => {
                        setError(null)
                        setFacing(facing === room.roomId ? null : room.roomId)
                      }}
                      title={fill(t.faceOf, { name: room.name })}
                      className={`shrink-0 rounded-lg px-1.5 py-1 text-[11px] transition hover:text-ink focus-visible:opacity-100 disabled:opacity-50 ${
                        facing === room.roomId
                          ? 'text-ink opacity-100'
                          : 'text-ink-muted opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {t.faceShort}
                    </button>
                  </>
                )}
              </div>

              {canManage && facing === room.roomId && (
                <RoomFace
                  slug={slug}
                  room={room}
                  rooms={rooms ?? []}
                  groupsId={groupsId}
                  groupDraft={
                    grouping?.roomId === room.roomId ? grouping.value : (room.group ?? '')
                  }
                  onGroupType={(value) => setGrouping({ roomId: room.roomId, value })}
                  onGroupDone={() => regroup(room)}
                  onGroupCancel={() => setGrouping(null)}
                  act={act}
                  pending={pending}
                  t={t}
                />
              )}
            </div>
          ),
        )}

        {rooms?.length === 0 && (
          <p className="px-2 py-1 text-[11px] text-ink-muted">{t.noneYet}</p>
        )}
      </div>

      {/* --- the one you are in ----------------------------------------- */}
      {here && canManage && (
        <div className="space-y-2 rounded-lg border border-line/60 p-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">
            {t.thisRoom}
          </p>

          <label className="flex items-start gap-2 text-[11px] text-ink-muted">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={here.visibility === 'private'}
              disabled={pending}
              onChange={(event) =>
                act(() =>
                  setRoomVisibility(
                    slug,
                    here.roomId,
                    event.target.checked ? 'private' : 'open',
                  ),
                )
              }
            />
            <span>
              {t.unlisted}
              {/*
                Said plainly, because "private" would be a promise this does not
                keep: anybody in the space who has the link can still walk in.
                See the note on RoomVisibility.
              */}
              <span className="block text-ink-muted/70">{t.unlistedNote}</span>
            </span>
          </label>

          {/*
            --- the game in the slot ---------------------------------------

            Only for a room that is already a level, which is the decider's
            rule as well as this panel's: a lounge room full of blocks that
            became a level would strand the blocks. What this changes is *what
            is played here*, and the room - its name, its chat, its door, its
            link - stays exactly where it is. See `RoomXpSet`.
          */}
          {here.xpRef && (
            <div className="space-y-1.5 border-t border-line/40 pt-2">
              <p className="text-[11px] text-ink-muted">
                {t.plays}
                <span className="ml-1 font-mono text-[10px] text-ink">{here.xpRef}</span>
              </p>

              {/*
                A newer version, when the space has one.

                The room's reference already names the version it is on - that
                is the whole reason there is no install table beside it - so
                this is a comparison rather than a lookup somewhere else. See
                `findRoomUpdate`.
              */}
              {update ? (
                <div className="space-y-1 rounded-lg border border-accent/40 bg-accent/5 p-2">
                  <p className="text-[11px] text-ink">
                    {fill(t.updateOut, { to: update.to })}
                    <span className="ml-1 font-mono text-[10px] text-ink-muted">
                      {fill(t.updateOn, { from: update.from })}
                    </span>
                  </p>
                  {/*
                    Said rather than hidden: "update" reads like a safer word
                    than it is when the thing on the other end is a level
                    somebody saved four minutes ago and never published.
                  */}
                  {update.draft ? (
                    <p className="px-0.5 text-[10px] leading-snug text-ink-muted/80">
                      {t.updateDraft}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => updateTo(here, update.ref)}
                    className="w-full rounded-md border border-accent/60 bg-accent/10 px-2 py-1.5 text-[11px] font-medium transition hover:border-accent disabled:opacity-50"
                  >
                    {fill(t.updateCta, { to: update.to })}
                  </button>
                  <p className="px-0.5 text-[10px] leading-snug text-ink-muted/80">
                    {t.updateNote}
                  </p>
                </div>
              ) : null}

              {swapping === here.roomId ? (
                <div className="space-y-1">
                  {levels === null ? (
                    <p className="px-0.5 text-[10px] text-ink-muted" role="status">
                      {t.looking}
                    </p>
                  ) : levels.length === 0 ? (
                    <p className="px-0.5 text-[10px] text-ink-muted">{t.nothingElse}</p>
                  ) : (
                    /*
                      Offers first, then everything else.

                      docs/xp/backlog.md §1c's "and it shows in the room": a
                      member's copy was always *in* this list — it is one of the
                      space's projects — and that is exactly the problem the
                      entry describes, because so is every other project in the
                      space. Sorting the copies of what is playing here to the
                      top, and saying so, is the whole difference between an
                      offer somebody can find and a draft nobody knew was made.

                      Sorted rather than filtered into a second list: this is a
                      picker, and a room whose level was made from scratch would
                      otherwise show an empty section explaining itself.
                    */
                    offered(levels, here.xpRef).map(({ level, forThisRoom }) => (
                      <button
                        key={level.ref}
                        type="button"
                        disabled={pending || level.ref === here.xpRef}
                        onClick={() => swap(here, level.ref)}
                        className="flex w-full items-baseline justify-between gap-2 rounded-md border border-line/50 px-2 py-1 text-left text-[11px] transition hover:border-accent/60 disabled:opacity-40"
                      >
                        <span className="truncate">{level.name}</span>
                        {/*
                          Both badges on DESIGN.md's smallest documented step
                          (`rail-note`, 10px) rather than the 9px the "now" one
                          had. Two badges in one row at sizes 1px apart is worse
                          than either choice alone, and the ramp already has a
                          step for the smallest thing a rail says.
                        */}
                        {level.ref === here.xpRef ? (
                          <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-muted/70">
                            {t.now}
                          </span>
                        ) : forThisRoom ? (
                          <span className="shrink-0 text-[10px] uppercase tracking-wider text-accent/80">
                            {t.madeForThis}
                          </span>
                        ) : null}
                      </button>
                    ))
                  )}

                  <button
                    type="button"
                    onClick={() => setSwapping(null)}
                    className="w-full px-2 py-0.5 text-left text-[10px] text-ink-muted transition hover:text-ink"
                  >
                    {t.cancel}
                  </button>
                </div>
              ) : (
                <>
                  {/*
                    --- the fixture, on or off ------------------------------

                    The two products of one level, in the place where somebody
                    is standing in it: a room is somewhere you are, a match is
                    something that is *on*. Both controls are here rather than
                    only in Battle because the person who wants a fixture is
                    the person already in the room - sending them to the hub to
                    open a second copy of the level they are standing in is the
                    walk this whole tab exists to save.
                  */}
                  {match === undefined ? (
                    <p className="px-0.5 text-[10px] text-ink-muted" role="status">
                      {t.looking}
                    </p>
                  ) : match === null ? (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => runMatch(here.xpRef!)}
                        className="w-full rounded-lg border border-accent/60 bg-accent/10 px-2 py-1.5 text-[11px] font-medium transition hover:border-accent disabled:opacity-50"
                      >
                        {t.runMatch}
                      </button>
                      {/*
                        What it becomes, said before it is pressed. The two
                        differ in *how long they last*, which is the one thing
                        a control cannot show you afterwards - the Play tab
                        makes the same promise in the same words.
                      */}
                      <p className="px-0.5 text-[10px] leading-snug text-ink-muted/80">
                        {t.runMatchNote}
                      </p>
                    </>
                  ) : (
                    <>
                      <Link
                        href={`/t/${slug}/battle/${match.battleId}`}
                        className="flex w-full items-baseline justify-between gap-2 rounded-lg border border-accent-2/60 bg-accent-2/10 px-2 py-1.5 text-[11px] font-medium text-accent-2 transition hover:bg-accent-2/20"
                      >
                        <span>{match.status === 'live' ? t.matchOn : t.matchWaiting}</span>
                        <span className="shrink-0 font-mono text-[10px] text-ink-muted">
                          {fill(t.matchMeta, {
                            mode: t.modes[match.mode],
                            n: match.fighters,
                          })}
                        </span>
                      </Link>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => callOff(here.xpRef!)}
                        className="w-full px-2 py-0.5 text-left text-[11px] text-ink-muted transition hover:text-ink disabled:opacity-50"
                      >
                        {t.turnOff}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => openLevels(here)}
                    className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px] text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-50"
                  >
                    {t.playSomethingElse}
                  </button>
                  {/*
                    Said before it is pressed, because the person doing it is
                    the one person who cannot see it happen: a round in play is
                    ended by the swap, and everybody already inside keeps the
                    game they loaded until they reload.
                  */}
                  <p className="px-0.5 text-[10px] leading-snug text-ink-muted/80">
                    {t.swapNote}
                  </p>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              /*
                Two sentences for two kinds of room, because the reassurance is
                only true for one of them. A lounge room keeps what was built in
                it and can be given back; a level room has nothing built in it,
                so "delete" is what it is and saying "close" would be softening
                a word rather than a consequence.
              */
              if (
                !confirm(
                  fill(here.xpRef ? t.confirmDeleteLevel : t.confirmCloseRoom, {
                    name: here.name,
                  }),
                )
              ) {
                return
              }
              act(async () => {
                const result = await closeRoom(slug, here.roomId)
                // Standing in a room that has just been closed is standing in a
                // room whose channel will refuse the next reconnect.
                if (result.ok) router.push(`/t/${slug}/lounge`)
                return result
              })
            }}
            className="w-full rounded-lg border border-red-400/40 px-2 py-1.5 text-[11px] text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
          >
            {here.xpRef ? t.deleteRoom : t.closeRoom}
          </button>
        </div>
      )}

      {/* --- your own copy of what is playing ---------------------------- */}
      {/*
        docs/xp/backlog.md §1c, asked for as: *admins and members can both edit,
        but a member cannot change the instance code — they make a copy in the
        space, change that, and it shows in the room.*

        **Outside the admin panel above, on purpose.** This is the one control
        in the Room tab a plain member gets, and it is safe precisely because it
        changes nothing about the room: the pointer stays where it is, and an
        admin moves it when they want to. Putting it inside `canManage` would
        have hidden the whole feature from the people it was asked for.

        It is not gated on a role here either, and that is not an oversight —
        `copyRoomXp` guards `edit` on the *source project*, which is §7.4's
        ladder and already the right question. A member of a space whose policy
        does not let them open the level gets a sentence in the rail rather than
        a button that was never going to work, which is the same trade
        `findPlayableXps` makes for the Play tab.
      */}
      {here?.xpRef && (
        <div className="space-y-1.5 rounded-lg border border-line/60 p-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">
            {t.changeLevel}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => copyLevel(here)}
            className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px] text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-50"
          >
            {pending ? t.copying : t.makeCopy}
          </button>
          {/*
            Said before it is pressed rather than after, because the surprise is
            not that it copies — it is that the room does not change. Somebody
            expecting to edit what everybody is standing in should find that out
            here and not from a room that looks the same afterwards.
          */}
          <p className="px-0.5 text-[10px] leading-snug text-ink-muted/80">
            {canManage ? t.copyNoteAdmin : t.copyNoteMember}
          </p>
        </div>
      )}

      {/* --- open another ------------------------------------------------ */}
      {canManage &&
        (opening ? (
          <form onSubmit={open} className="space-y-2 rounded-lg border border-line/60 p-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t.namePlaceholder}
              maxLength={60}
              autoFocus
              className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
            />

            <label className="flex items-start gap-2 text-[11px] text-ink-muted">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={visibility === 'private'}
                onChange={(event) =>
                  setVisibility(event.target.checked ? 'private' : 'open')
                }
              />
              <span>
                {t.unlisted}
                <span className="block text-ink-muted/70">{t.unlistedNewNote}</span>
              </span>
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpening(false)}
                className="flex-1 rounded-lg border border-line px-2 py-1.5 text-[11px] text-ink-muted transition hover:text-ink disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={pending || name.trim().length === 0}
                className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-[11px] font-medium transition disabled:opacity-50"
              >
                {pending ? t.opening : t.open}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOpening(true)}
            className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px] text-ink-muted transition hover:border-accent/60 hover:text-ink"
          >
            {t.openAnother}
          </button>
        ))}

      {/* The way out of a wall you have been built into, when there is a world
          on screen to be stuck in. Below the rooms and the room, because it is
          about the place you are standing rather than about which one it is. */}
      <UnstickButton />

      {/* The level's own numbers, when one is open. Draws nothing otherwise -
          see SceneDebug, which is closed by default because moving the readout
          somewhere permanently visible would be the same problem in a new
          place. */}
      <SceneDebug />
    </div>
  )
}

/**
 * How one room turns up in everybody's Places list.
 *
 * Four controls that all answer one question, kept together because somebody
 * arranging a rail does all four in one sitting: they pin the room the space
 * runs on, group the ones that belong together, and give each a face so the
 * column can be read rather than scanned.
 *
 * All four are the *space's*, which is what puts the whole panel behind
 * `canManage`. A member's own pin is a control on the row in the Places band
 * and writes nowhere near the log - see `pinRoomForMe`.
 *
 * Rendered under the row it is about rather than in the "This room" panel
 * below, and that placement is the whole of it: "This room" is about the room
 * you are standing in, which is the right home for the level and the fixture,
 * because you have to be in a room to care what it is playing. An icon is the
 * opposite. The reason anybody sets one is that they are looking at the list
 * and cannot tell two rooms apart - so making them walk into each room in turn
 * would be asking them to leave the only screen the problem is visible on.
 */
function RoomFace({
  slug,
  room,
  rooms,
  groupsId,
  groupDraft,
  onGroupType,
  onGroupDone,
  onGroupCancel,
  act,
  pending,
  t,
}: {
  slug: string
  room: RoomView
  /** The space's rooms, for the captions the group field offers. */
  rooms: RoomView[]
  groupsId: string
  groupDraft: string
  onGroupType: (value: string) => void
  onGroupDone: () => void
  onGroupCancel: () => void
  act: (run: () => Promise<{ ok: boolean; error?: string }>) => void
  pending: boolean
  t: RailDict['roomTab']
}) {
  return (
    <div className="mb-1 ml-2 space-y-2 rounded-lg border border-line/60 p-2">
      <label className="flex items-start gap-2 text-[11px] text-ink-muted">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={room.adminPinnedAt !== null}
          disabled={pending}
          onChange={(event) =>
            act(() => setRoomPinned(slug, room.roomId, event.target.checked))
          }
        />
        <span>
          {t.pinForEveryone}
          <span className="block text-ink-muted/70">{t.pinNote}</span>
        </span>
      </label>

      {/*
        A field rather than a picker of existing groups, because a group *is*
        the name: there is no list to pick from until somebody has typed one,
        and a picker with a "new..." escape hatch is two controls for one
        string. The datalist is the best of both - the captions already in use
        are offered, and typing past them makes a new one.
      */}
      <label className="block text-[11px] text-ink-muted">
        <span className="block pb-1">{t.groupLabel}</span>
        <input
          value={groupDraft}
          list={groupsId}
          onChange={(event) => onGroupType(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              onGroupCancel()
            }
          }}
          // Leaving the field commits, exactly as the rename row does and for
          // the same reason: there is no Save button beside it, so a blur that
          // threw the caption away would be a change that silently did not
          // happen.
          onBlur={onGroupDone}
          maxLength={ROOM_GROUP_MAX}
          placeholder={t.groupPlaceholder}
          disabled={pending}
          className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs disabled:opacity-50"
        />
        <datalist id={groupsId}>
          {groupNames(rooms).map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <span className="block pt-1 text-ink-muted/70">{t.groupNote}</span>
      </label>

      {/*
        The face: twenty-five glyphs in five rows of five, in the order
        `ROOM_ICONS` groups them. A grid rather than a select, because the thing
        being chosen is a picture - a dropdown of the *names* of pictures is a
        control that has to be opened twenty-five times to be read once.

        The whole grid wears the room's tint, so the choice is made in the
        colour it will be drawn in rather than in grey and then recoloured.
      */}
      <div>
        <p className="pb-1 text-[11px] text-ink-muted">{t.iconLabel}</p>
        <div className={`grid grid-cols-5 gap-0.5 ${tintClass(room.tint)}`}>
          {ROOM_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              disabled={pending}
              aria-pressed={room.icon === icon}
              title={t.icons[icon]}
              aria-label={t.icons[icon]}
              onClick={() => act(() => setRoomIcon(slug, room.roomId, icon))}
              className={`grid place-items-center rounded-md py-1.5 transition disabled:opacity-50 ${
                room.icon === icon
                  ? 'room-face bg-accent/20'
                  : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
              }`}
            >
              <RoomGlyph name={icon} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="pb-1 text-[11px] text-ink-muted">{t.colourLabel}</p>
        <div className="flex flex-wrap items-center gap-1">
          {/*
            Off, first. A room with no colour is not a ninth colour and must not
            read as one - it is the row every room has until somebody chooses,
            so it is drawn as an empty ring rather than as a swatch.
          */}
          <button
            type="button"
            disabled={pending}
            aria-pressed={room.tint === null}
            title={t.colourNone}
            aria-label={t.colourNone}
            onClick={() => act(() => setRoomTint(slug, room.roomId, null))}
            className={`grid size-6 place-items-center rounded-full border transition disabled:opacity-50 ${
              room.tint === null
                ? 'border-accent-2 bg-accent/15'
                : 'border-line hover:border-ink-muted'
            }`}
          >
            <span className="room-swatch border border-line/60" />
          </button>

          {ROOM_TINTS.map((tint) => (
            <button
              key={tint}
              type="button"
              disabled={pending}
              aria-pressed={room.tint === tint}
              title={t.tints[tint]}
              aria-label={t.tints[tint]}
              onClick={() => act(() => setRoomTint(slug, room.roomId, tint))}
              className={`grid size-6 place-items-center rounded-full border transition disabled:opacity-50 ${tintClass(tint)} ${
                room.tint === tint
                  ? 'border-accent-2 bg-accent/15'
                  : 'border-transparent hover:border-line'
              }`}
            >
              <span className="room-swatch" />
            </button>
          ))}
        </div>
        <p className="pt-1 text-[10px] leading-snug text-ink-muted/70">{t.faceNote}</p>
      </div>
    </div>
  )
}


/**
 * The picker's rows, with the ones made for this room first and marked.
 *
 * docs/xp/backlog.md §1c's second half, and it is a *sort* rather than a query:
 * a member's copy has always been in this list — it is one of the space's
 * projects — and the entry's complaint is that so is everything else, so an
 * offer nobody can pick out is an offer nobody acts on.
 *
 * "Made for this" means copied from the project this room is playing, which is
 * the only link there is and deliberately so: the alternative was an explicit
 * "offer it to room X" step, and a member who made the copy and never offered
 * it is exactly the dead end §1c exists to remove. See the migration.
 *
 * Pure, exported and outside the component so it can be tested without a rail
 * around it — the same split every other decision in this app gets.
 */
export function offered(
  levels: readonly PlayableXp[],
  playing: string | null,
): { level: PlayableXp; forThisRoom: boolean }[] {
  /*
   * The *project* behind the reference, not the reference.
   *
   * A room names a version — `p-<uuid>-v3` — and a copy is taken from the
   * project, so comparing the strings would mark nothing the moment an author
   * saved a v4. The uuid is the part that does not move.
   */
  const source = playing ? parseXpRef(playing) : null
  const from = source?.kind === 'project' ? source.xpId : null

  const rows = levels.map((level) => ({
    level,
    forThisRoom: from !== null && level.copiedFrom === from,
  }))

  /*
   * A stable sort, which is what keeps the rest of the list alone: everything
   * `listPlayableXps` decided about order — newest first, ours before the
   * store's — still holds within each group, and the only thing this changes is
   * that the offers float.
   */
  return [...rows].sort((a, b) => Number(b.forThisRoom) - Number(a.forThisRoom))
}
