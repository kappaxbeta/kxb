'use client'

import { useEffect, useState } from 'react'
import { ChatPanel } from '@/app/t/[slug]/chat-panel'
import { chatActions, useChatFeed } from '@/app/world/_stores/chat-store'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'

/**
 * The conversation, drawn in a rail.
 *
 * A reader and nothing more. Everything it shows comes from `chat-store`, put
 * there by the single `<ChatDock>` mounted in the sidebar, and everything it
 * sends goes back the same way. That is what lets there be two of these: one in
 * the right-hand panel from `xl` up, one in the left drawer below that, where
 * there is no right-hand panel to put anything in.
 *
 * Rendering both and hiding one is the same call `People` makes, and for the
 * same reason - neither copy is the source of truth, so which one is on screen
 * is a question for CSS rather than for React.
 *
 * No heading and no height of its own any more: it is the body of a tab now
 * (see ./rail-tabs.tsx), and the tab has both. It used to carry a fixed `h-72`
 * to stop the conversation eating the rail, which worked right up until the
 * sections below it were squeezed under their own content height and drew over
 * each other. A tab cannot collide with the panel it is not sharing.
 */
export function ChatRail() {
  const t = railDict(useLocale()).chat
  const feed = useChatFeed()

  // Null covers three things at once: no chat in this space, the frame before
  // the dock's first effect has run, and a dock that has gone. All three mean
  // "there is nothing to draw", which is not the same as an empty chat.
  if (!feed) return null

  return (
    <div className="flex h-full flex-col px-1">
      {/* Only where there is somewhere else to go. A space with no rooms gets a
          switcher with one row on it, which is a heading pretending to be a
          control. */}
      {feed.rooms.length > 0 && (
        <RoomSwitcher rooms={feed.rooms} roomId={feed.roomId} onRoom={feed.onRoom} />
      )}

      {/*
        A hairline under the switcher, and only when there is one.

        The scroller starts immediately below this row, so the top of the
        conversation is sliced mid-glyph whenever anybody has scrolled - which,
        because the panel follows new messages down, is nearly always. With
        nothing between the two, half a line of somebody's message reads as text
        bleeding into the chips rather than as a list that carries on upwards.
        One line says "this is a window", and that is the whole of the fix.
      */}
      <div
        className={`min-h-0 flex-1 ${
          feed.rooms.length > 0 ? 'border-t border-line/40 pt-1' : ''
        }`}
      >
        {feed.loading ? (
          /**
           * Said rather than left blank.
           *
           * A room's scrollback is a round trip, and an empty panel for that
           * half second is indistinguishable from a room nobody has ever said
           * anything in - exactly the wrong first impression to give somebody
           * who has just switched into a busy one.
           */
          <p className="px-2 py-6 text-center text-xs text-ink-muted">{t.catchingUp}</p>
        ) : (
          <ChatPanel
            slug={feed.slug}
            lines={feed.lines}
            selfId={feed.selfId}
            // Through the store rather than out of the feed, so this holds no
            // reference to the dock at all. `say` is stable in the sense that
            // matters: it is read at the moment of sending, never captured.
            onSend={(body) => chatActions()?.say(body)}
            blockedReason={feed.blockedReason}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Which conversation you are reading, and who is in the others.
 *
 * The lounge is a row rather than a member of `rooms`, because it is not one: it
 * is the null option, the commons, and the one conversation every space has.
 * Giving it a fake id to make the list uniform would put that fiction into the
 * store, the action and the column.
 *
 * Switching here does not move you. That is the whole feature - you can stand in
 * the lounge and read what is being said in the café - and it is why a room is a
 * button rather than a `<Link>`. Walking somewhere is still the Room tab's job,
 * one tab over.
 */
function RoomSwitcher({
  rooms,
  roomId,
  onRoom,
}: {
  rooms: { roomId: string; name: string }[]
  roomId: string | null
  onRoom: (roomId: string | null) => void
}) {
  const t = railDict(useLocale()).chat
  const heads = useRoomHeads(rooms)

  return (
    <div className="mb-2 shrink-0">
      <p className="px-1 pb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted/70">
        {t.talkingIn}
      </p>
      <div className="flex flex-wrap gap-1">
        <Row
          active={roomId === null}
          label={t.theLounge}
          heads={heads.lounge}
          onClick={() => onRoom(null)}
        />
        {rooms.map((room) => (
          <Row
            key={room.roomId}
            active={roomId === room.roomId}
            label={room.name}
            heads={heads.rooms[room.roomId] ?? 0}
            onClick={() => onRoom(room.roomId)}
          />
        ))}
      </div>
    </div>
  )
}

function Row({
  active,
  label,
  heads,
  onClick,
}: {
  active: boolean
  label: string
  heads: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition ${
        active
          ? 'border-accent bg-accent/15 text-ink'
          : 'border-line/50 text-ink-muted hover:border-accent/50 hover:text-ink'
      }`}
    >
      <span className="truncate">{label}</span>
      {/* Only when there is somebody. A row of zeroes is "nobody is anywhere",
          said once per room. */}
      {heads > 0 && (
        <span
          title={`${heads} ${heads === 1 ? 'person' : 'people'} in here`}
          className="shrink-0 rounded-full bg-white/10 px-1.5 font-mono text-[10px] tabular-nums"
        >
          {heads}
        </span>
      )}
    </button>
  )
}

/** How long between head counts. See the note in `useRoomHeads`. */
const HEADS_INTERVAL = 15_000

/**
 * Who is standing where, polled.
 *
 * Not Realtime, and deliberately. Occupancy is already a heartbeat table with a
 * twenty-second life - `world_occupancy`, which the room caps read - so the
 * freshest this could honestly be is twenty seconds anyway, and subscribing to
 * find out would mean the rail joined a channel for every room in the space
 * including the ones nobody in this tab is standing in.
 *
 * Fifteen seconds, inside that window, so the rail never shows a count the door
 * would disagree with. One small query, and it re-renders the rail rather than
 * the scene.
 */
function useRoomHeads(rooms: { roomId: string; name: string }[]): {
  lounge: number
  rooms: Record<string, number>
} {
  const feed = useChatFeed()
  const slug = feed?.slug
  const [heads, setHeads] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!slug) return

    let live = true

    /**
     * A route handler, not the Server Action this used to call - see
     * `src/app/api/t/[slug]/heads/route.ts` for why a poll must not be one.
     *
     * Skipped while the tab is in the background, and asked again on the way
     * back: nobody is reading a switcher they cannot see, and the count is
     * twenty seconds from being wrong anyway.
     */
    const count = async () => {
      if (!live || document.hidden) return
      try {
        const response = await fetch(`/api/t/${encodeURIComponent(slug)}/heads`)
        if (!response.ok) return
        const next = (await response.json()) as Record<string, number>
        if (live) setHeads(next)
      } catch {
        // The next one is fifteen seconds away. A switcher with yesterday's
        // numbers on it is better than one that threw.
      }
    }

    const wake = () => {
      if (!document.hidden) void count()
    }

    void count()
    const timer = setInterval(() => void count(), HEADS_INTERVAL)
    document.addEventListener('visibilitychange', wake)
    return () => {
      live = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [slug])

  /**
   * The lounge's own count, arrived at by subtraction.
   *
   * A lounge's world id is the tenant's id everywhere else in the app, and the
   * rail does not know the tenant id - nor should it learn one to render a
   * number. Everybody in the space, less everybody in a room, is the lounge, and
   * it is exact for the thing being asked.
   *
   * It does fold in anyone standing in a battlefield or a visited world, since
   * those keep occupancy rows too. That is a small overcount on one badge, and
   * the alternative is threading a tenant id through the store for it.
   */
  const inRooms = rooms.reduce((sum, room) => sum + (heads[room.roomId] ?? 0), 0)
  const everyone = Object.values(heads).reduce((sum, n) => sum + n, 0)

  return { lounge: Math.max(0, everyone - inRooms), rooms: heads }
}
