'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
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
            // Out of the feed rather than through the store, unlike `say`: the
            // dock has to remove the lines as well as write the row, so this is
            // the dock's own function and not a fire-and-forget command.
            onBlock={feed.onBlock}
            blockedReason={feed.blockedReason}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Which conversation you are reading, and how to reach another.
 *
 * One control, whatever the space is: the conversation you are in, and a list
 * behind it. It used to be every room drawn at once as a wrap of chips, which
 * is fine for a space with three rooms and untidy for a space with nine - six
 * lines of chips above a panel whose whole job is the seventh. Worse, the block
 * grew as the space did, so the busiest spaces got the shortest chat.
 *
 * The list is a menu rather than a `<select>` because the rows carry a head
 * count, and because a native picker on a phone is a modal wheel that hides the
 * room you are trying to compare against.
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
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  /** The lounge first, then the rooms in the order the space keeps them. */
  const options: { id: string | null; name: string; heads: number }[] = [
    { id: null, name: t.theLounge, heads: heads.lounge },
    ...rooms.map((room) => ({
      id: room.roomId,
      name: room.name,
      heads: heads.rooms[room.roomId] ?? 0,
    })),
  ]

  const here = options.find((option) => option.id === roomId) ?? options[0]

  /**
   * A filter, but only once the list is long enough to need one.
   *
   * Six rows are read; sixteen are searched. Below the threshold the box would
   * be a control asking a question the eye has already answered - and the first
   * thing the keyboard lands on when the menu opens, which would put a text
   * field between somebody and a two-room space.
   */
  const filtering = options.length > 7
  const needle = query.trim().toLowerCase()
  const shown =
    filtering && needle
      ? options.filter((option) => option.name.toLowerCase().includes(needle))
      : options

  /**
   * Escape closes and hands the focus back, and so does a press anywhere else.
   *
   * On the document rather than behind a full-screen catcher: this panel sits
   * over a running world in the drawer, and an overlay would eat the first click
   * back into the room every time. See the same note in `<EmotePicker>`.
   */
  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }

    const onPointerDown = (event: PointerEvent) => {
      if (box.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  /**
   * The room you are reading, brought into view when the list opens.
   *
   * The list is capped at about six rows and a space can have twenty, so the
   * one row the menu is opened *from* was routinely below the fold - and a
   * picker that opens somewhere other than where you are reads as a list that
   * has forgotten you. `nearest`, so a room already on screen does not move.
   */
  useEffect(() => {
    if (!open) return
    box.current?.querySelector('[data-room-row][aria-checked="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const choose = (id: string | null) => {
    onRoom(id)
    setOpen(false)
    setQuery('')
    trigger.current?.focus()
  }

  /**
   * Up and down walk the rows, from wherever the focus happens to be - the
   * filter box included, which is where it starts on a long list. Plain
   * `querySelectorAll` rather than a ref array: the rows are re-filtered as
   * somebody types, so the list React holds and the list on screen are only the
   * same between renders, and the DOM is the one the arrow key means.
   */
  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const rows = Array.from(
      box.current?.querySelectorAll<HTMLButtonElement>('[data-room-row]') ?? [],
    )
    if (rows.length === 0) return
    event.preventDefault()
    const at = rows.indexOf(document.activeElement as HTMLButtonElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    // From outside the rows (the filter box), down starts at the top and up at
    // the bottom - which is what both keys mean when nothing is selected yet.
    const next = at === -1 ? (step === 1 ? 0 : rows.length - 1) : (at + step + rows.length) % rows.length
    rows[next]?.focus()
  }

  return (
    <div ref={box} className="relative z-20 mb-2 shrink-0">
      {/*
        The label keeps its own line, and the control gets the whole width.

        Beside each other they fit - and then the name, which is the only part
        that ever changes, is squeezed into whatever a fixed 15.5rem rail has
        left after eleven characters of `Gespräch in`. Two lines cost fourteen
        pixels once; a room truncated to `Mensch är…` costs them every time
        somebody looks at it.
      */}
      <p className="px-1 pb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted/70">
        {t.talkingIn}
      </p>
      <div className="px-1">
        <button
          ref={trigger}
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown') return
            event.preventDefault()
            setOpen(true)
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`${t.talkingIn}: ${here.name} — ${t.switchRoom}`}
          className={`flex w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition ${
            open
              ? 'border-accent bg-accent/15 text-ink'
              : 'border-line/50 bg-surface-raised/40 text-ink hover:border-accent/60'
          }`}
        >
          {/* Where you are, said before the name is read. */}
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_6px_var(--color-accent)]" />
          <span className="min-w-0 flex-1 truncate text-left">{here.name}</span>
          <Heads count={here.heads} />
          <span
            aria-hidden
            className={`shrink-0 text-ink-muted transition-transform duration-[var(--dur-fast)] ${
              open ? 'rotate-180' : ''
            }`}
          >
            <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 6.5 8 10 11.5 6.5" />
            </svg>
          </span>
        </button>
      </div>

      {/*
        Over the conversation rather than above it.

        In flow, opening this would shove the messages down by the height of the
        list and then yank them back - a panel that follows new lines to the
        bottom, jumping twice for one press. Absolute keeps the reading position
        exactly where it was, and the list is capped so it never fills the tab it
        is opening inside.
      */}
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t.switchRoom}
          onKeyDown={onMenuKey}
          className="absolute inset-x-1 top-full z-30 mt-1 origin-top overflow-hidden rounded-xl border border-line/60 bg-surface/95 shadow-2xl backdrop-blur animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-[var(--dur-fast)]"
        >
          {filtering && (
            <div className="border-b border-line/40 p-1.5">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.filterRooms}
                aria-label={t.filterRooms}
                className="w-full rounded-lg border border-line/40 bg-surface-raised/60 px-2 py-1 text-xs text-ink outline-none placeholder:text-ink-muted/60 focus:border-accent/70"
              />
            </div>
          )}

          {/*
            Six rows and a bit, and then it scrolls itself.

            Measured against the shorter of the two panels it opens inside: the
            drawer's tab body is 288px, the list starts about 88px down it once
            the label, the control and the filter are drawn, and a taller list
            than this is one the *panel* has to be scrolled to finish reading -
            which is a menu hiding its own last rows.
          */}
          <div className="max-h-[11rem] overflow-y-auto overscroll-contain p-1">
            {shown.map((option) => (
              <Row
                key={option.id ?? 'lounge'}
                active={option.id === roomId}
                label={option.name}
                heads={option.heads}
                onClick={() => choose(option.id)}
              />
            ))}
            {shown.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-ink-muted">{t.noRoomMatches}</p>
            )}
          </div>
        </div>
      )}
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
      role="menuitemradio"
      aria-checked={active}
      data-room-row
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
        active ? 'bg-accent/15 text-ink' : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
      }`}
    >
      {/* A dot rather than a tick, and always drawn: a mark that appears only on
          one row shifts every other name a few pixels left of where the eye
          expects them while it is scanning the column. */}
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-full ${
          active ? 'bg-accent shadow-[0_0_6px_var(--color-accent)]' : 'bg-ink-muted/25'
        }`}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Heads count={heads} />
    </button>
  )
}

/**
 * How many people are standing in there, or nothing at all.
 *
 * Only when there is somebody: a column of zeroes is "nobody is anywhere", said
 * once per room.
 */
function Heads({ count }: { count: number }) {
  if (count <= 0) return null

  return (
    <span
      title={`${count} ${count === 1 ? 'person' : 'people'} in here`}
      className="shrink-0 rounded-full bg-white/10 px-1.5 font-mono text-[10px] tabular-nums text-ink-muted"
    >
      {count}
    </span>
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
