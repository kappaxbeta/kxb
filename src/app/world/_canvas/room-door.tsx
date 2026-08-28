'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { clearDoor, publishDoor } from '@/app/world/_stores/door-store'
import type { Room } from '@/app/world/_presence/room-presence'
import { setHomesteadAccess } from '@/domain/homestead/actions'
import type { DoorMode } from '@/domain/homestead/events'
import { hrefFor, type OwnedPlace } from '@/domain/world/places'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { worldDict, type WorldDict } from '@/app/i18n/world'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * The front door, from both sides.
 *
 * `<DoorScreen>` is what a visitor sees instead of the room. `<DoorPanel>` is
 * what the owner sees on top of it - who is knocking, who is inside, and the
 * setting that decides whether either happens.
 *
 * Both are plain DOM over the canvas rather than anything in the scene. A
 * knock is a conversation, and a conversation belongs in text you can read at a
 * glance, not floating in a 3D room the person may not even be able to see yet.
 */

/**
 * The three settings, in the order they loosen.
 *
 * The words moved into the world dictionary, so this is the *order* and nothing
 * else - which is the half that is not a language.
 */
const DOOR_ORDER: DoorMode[] = ['open', 'knock', 'closed']

function doorWords(t: WorldDict['door'], mode: DoorMode): { label: string; hint: string } {
  if (mode === 'open') return { label: t.open, hint: t.openHint }
  if (mode === 'knock') return { label: t.knock, hint: t.knockHint }
  return { label: t.closed, hint: t.closedHint }
}

/** What the visitor is told, per state. Keyed so nothing can go unhandled. */
function doorway(
  admission: Room['admission'],
  ownerName: string,
  place: string,
  t: WorldDict['door'],
): { title: string; body: string; retry: boolean } | null {
  const who = { name: ownerName, place }

  switch (admission) {
    case 'owner':
    case 'admitted':
      return null
    case 'connecting':
      return { title: t.walkingUp, body: fill(t.walkingUpBody, who), retry: false }
    case 'knocking':
      return { title: t.knocking, body: fill(t.knockingBody, who), retry: false }
    case 'absent':
      return { title: t.nobodyHome, body: fill(t.nobodyHomeBody, who), retry: true }
    case 'refused':
      return { title: t.notNow, body: fill(t.notNowBody, who), retry: true }
    case 'closed':
      return { title: t.bolted, body: fill(t.boltedBody, who), retry: false }
    case 'ejected':
      return { title: t.shownOut, body: fill(t.shownOutBody, who), retry: true }
    case 'error':
      return { title: t.unreachable, body: t.unreachableBody, retry: true }
  }
}

export function DoorScreen({
  room,
  ownerName,
  place,
  slug,
}: {
  room: Room
  ownerName: string
  place: OwnedPlace
  slug: string
}) {
  const t = worldDict(useLocale()).door
  const shown = doorway(room.admission, ownerName, t.theirs[place], t)
  if (!shown) return null

  const waiting = room.admission === 'connecting' || room.admission === 'knocking'

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-6 backdrop-blur">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-black/60 p-8 text-center text-white shadow-2xl">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5 text-3xl ${
            waiting ? 'animate-pulse' : ''
          }`}
          aria-hidden
        >
          {room.admission === 'closed' ? '🔒' : '🚪'}
        </div>

        <h1 className="text-lg font-semibold">{shown.title}</h1>
        <p className="text-sm text-white/70">{shown.body}</p>

        <div className="flex flex-col gap-2 pt-2">
          {shown.retry && (
            <button
              type="button"
              onClick={room.knockAgain}
              className="rounded-lg bg-amber-400/25 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-400/35"
            >
              {t.knockAgain}
            </button>
          )}
          {/* Always a way out that is not the back button. Somebody stuck at a
              door they cannot open needs somewhere to go, and their own house
              is the one place they are always welcome. */}
          <Link
            href={hrefFor(place, slug)}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            {fill(t.goToYourOwn, { place: t.yourOwn[place] })}
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * The owner's side, published to the rail rather than drawn over the canvas.
 *
 * Renders nothing. The door used to be a panel floating in the top-right corner
 * of the scene, which put it a long way from the roster in the sidebar even
 * though the two answer one question between them - who is here, and who is
 * allowed to be. It now lives beside that roster, and this is the seam: the
 * scene owns the presence channel, the rail owns the pixels.
 *
 * Owner-gated here as well as at the call site, because a guest being shown a
 * "kick" button that silently does nothing is worse than not showing it.
 */
export function DoorPanel({
  room,
  slug,
  door,
}: {
  room: Room
  slug: string
  /** The setting as the server last recorded it. */
  door: DoorMode
}) {
  const owned = room.isOwner

  useEffect(() => {
    if (!owned) return
    publishDoor(
      { slug, mode: door, knocks: room.knocks },
      { admit: room.admit, refuse: room.refuse, eject: room.eject },
    )
  })

  useEffect(() => {
    if (!owned) return
    return () => clearDoor(slug)
  }, [owned, slug])

  return null
}

/**
 * The door itself, for the rail to render.
 *
 * Exported from here rather than written in the sidebar so that the three modes
 * and the words describing them stay next to `DoorScreen`, which is what a
 * visitor reads when the same setting turns them away. Two copies of "closed
 * means nobody can even ask" would drift.
 */
export function FrontDoorControls({ slug, mode }: { slug: string; mode: DoorMode }) {
  const refusal = useRefusal()
  const t = worldDict(useLocale()).door
  const [pending, startTransition] = useTransition()

  /**
   * The toggle moves the moment it is pressed, and only goes back if the
   * server refuses.
   *
   * Deliberately `useState` seeded from the prop rather than `useOptimistic`.
   * `useOptimistic` reverts to its base value when the transition settles, and
   * the base here comes from a page that is never revalidated - these actions
   * skip `revalidatePath` on purpose, because re-rendering the route would tear
   * down the WebGL canvas the player is standing in. So the optimistic value
   * would snap back to the old setting a second after every press, which looks
   * exactly like the write having failed.
   */
  const [shown, setShown] = useState<DoorMode>(mode)
  const [failed, setFailed] = useState<string | null>(null)

  const change = (next: DoorMode) => {
    const previous = shown
    setShown(next)
    setFailed(null)

    startTransition(async () => {
      const result = await setHomesteadAccess(slug, { mode: next })
      if (!result.ok) {
        // Put the control back where it was and say why. Leaving it showing a
        // setting the server never accepted is the one outcome worth avoiding.
        setShown(previous)
        setFailed(refusal(result.error))
      }
    })
  }

  return (
    <div className="px-1">
      <div
        className="flex gap-1 rounded-xl border border-line/70 bg-surface-raised p-1"
        role="group"
        aria-label={t.whoMayComeIn}
      >
        {DOOR_ORDER.map((option) => {
          const words = doorWords(t, option)
          return (
            <button
              key={option}
              type="button"
              onClick={() => change(option)}
              disabled={pending}
              aria-pressed={shown === option}
              title={words.hint}
              className={`flex-1 rounded-lg px-2 py-1 text-[11px] transition-colors disabled:opacity-60 ${
                shown === option
                  ? 'bg-accent-2/20 font-semibold text-accent-2'
                  : 'text-ink-muted hover:bg-line/40 hover:text-ink'
              }`}
            >
              {words.label}
            </button>
          )
        })}
      </div>
      <p className="px-1 pt-1.5 text-[11px] leading-snug text-ink-muted">
        {doorWords(t, shown).hint}
      </p>
      {failed && (
        <p className="px-1 pt-1 text-[11px] leading-snug text-red-500">{failed}</p>
      )}
    </div>
  )
}
