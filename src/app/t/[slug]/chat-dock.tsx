'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ChatLine } from '@/app/t/[slug]/chat-panel'
import { clearChat, publishChat, publishChatFeed } from '@/app/world/_stores/chat-store'
import type { ChatMessage } from '@/app/world/_presence/presence-core'
import { sceneWorldNow, subscribe as subscribeHere } from '@/app/world/_stores/here-store'
import { announceSaid } from '@/app/world/_stores/said-store'
import { countReceived, countSent } from '@/app/world/perf/store'
import { postChatMessage, readRoomChat } from '@/domain/chat/actions'
import { CHAT_HISTORY_LIMIT } from '@/domain/chat/events'
import { createClient } from '@/lib/supabase/client'
import { notifyIfHidden, openTabChannel } from '@/lib/tab-sync/broadcast'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'

/**
 * The space's chat. Draws nothing.
 *
 * The one component that owns the conversation: the Realtime subscription, the
 * message list, and sending. It is in the sidebar rather than in the lounge
 * because the sidebar is the only thing mounted for the whole session - see the
 * note on `said-store` for why there can be exactly one subscriber, and why the
 * scene cannot be it.
 *
 * It used to render the panel too, and stopped when the panel moved to the
 * right-hand rail. There is no right rail below `xl`, so the panel has to exist
 * in two places while the subscription still has to exist in exactly one. The
 * split is the resolution: this owns the state and publishes it to
 * `chat-store`, and `<ChatRail>` draws it wherever there is room. Mounted once,
 * drawn as often as necessary.
 *
 * The practical consequence is the feature people actually wanted: the
 * conversation keeps running while you read the board, write a page or sit in
 * settings. Walking out of the lounge no longer ends it.
 *
 * ---------------------------------------------------------------------------
 * Broadcast, not postgres_changes
 * ---------------------------------------------------------------------------
 * Messages are durable rows, so subscribing to inserts on
 * `chat_messages_read_model` would also work and would need no sender at all.
 * It is not used because a broadcast carries exactly the four fields the panel
 * draws, where a row change would arrive as a database record that has to be
 * re-authorised and re-shaped on the client.
 *
 * ---------------------------------------------------------------------------
 * `chat:`, not `lounge:`
 * ---------------------------------------------------------------------------
 * This began on the lounge's topic, which was already open and already gated on
 * membership, and that stopped working the moment the dock moved into the rail.
 * A supabase-js client keeps one channel object per topic string, so asking for
 * `lounge:<id>` here handed `<Multiplayer>` back this already-subscribed
 * channel and it could no longer attach its presence callbacks to it.
 *
 * So the conversation has its own topic, gated on the same membership by the
 * migration in 20260818010000. The two are not the same thing anyway: presence
 * is bodies in a room and ends when you walk out; this outlives every scene.
 */
export function ChatDock({
  slug,
  tenantId,
  userId,
  initialMessages,
  /** Null when the viewer may post. A sentence explaining why not, otherwise. */
  blockedReason,
  rooms,
}: {
  slug: string
  tenantId: string
  userId: string
  initialMessages: ChatLine[]
  blockedReason: string | null
  /** The rooms this person can see, so the rail can offer them. */
  rooms: { roomId: string; name: string }[]
}) {
  const t = railDict(useLocale()).notify
  const supabase = useMemo(() => createClient(), [])
  const [lines, setLines] = useState<ChatLine[]>(initialMessages)
  const channelRef = useRef<RealtimeChannel | null>(null)
  /** The same-browser relay - see tab-sync/broadcast.ts. */
  const tabChannelRef = useRef<BroadcastChannel | null>(null)

  /**
   * Which conversation is on screen. Null is the lounge.
   *
   * Held here rather than derived from the URL, and that is the feature: you can
   * be standing in the lounge and reading the café's chat. Tying it to the route
   * would mean the only way to change conversation was to walk somewhere, which
   * is what this exists to avoid.
   *
   * It is also why there is still exactly one dock and one subscriber - see the
   * note on `said-store`. Switching rooms re-subscribes *this* channel rather
   * than mounting a second one.
   */
  const [roomId, setRoomId] = useState<string | null>(null)

  /** True while a room's scrollback is on its way, so the panel can say so. */
  const [loading, setLoading] = useState(false)

  /**
   * Shared by the Supabase broadcast below and the same-browser relay next to
   * it, so a line cannot be shaped one way from one path and another way from
   * the other.
   *
   * The `id`-dedupe guard exists for the relay's benefit, not the socket's:
   * `announce`/`say` never see their own packet come back on either path, but
   * a future caller of either handler should not have to re-derive that.
   */
  const appendIncoming = useCallback(
    (message: ChatMessage) => {
      if (!message?.u || !message?.b) return
      // An id is not decoration: without one the line cannot be reported,
      // which is most of the point of chat being durable. A packet missing
      // one is from a client we do not understand.
      if (typeof message.i !== 'string' || !message.i) return

      setLines((current) => {
        if (current.some((line) => line.id === message.i)) return current
        return [
          ...current,
          {
            key: message.i,
            id: message.i,
            body: message.b,
            authorId: message.u,
            authorName: message.n || t.someone,
            createdAt: new Date().toISOString(),
          },
        ].slice(-CHAT_HISTORY_LIMIT)
      })

      // And raise a bubble over them, if anybody is currently drawing bodies -
      // and if this is the room the bodies are standing in. A packet arriving
      // on another room's topic belongs in the panel, not over somebody's head.
      if (sceneWorldNow() === roomId) {
        announceSaid({ userId: message.u, body: message.b })
      }
    },
    // `t` is one of two module-level objects, so it changes only when the
    // reader's language does - which is a reload, not a render.
    [roomId, t.someone],
  )

  useEffect(() => {
    /**
     * `private: true` for the same reason the scene passes it: without the flag
     * the topic is open to anybody holding the anon key who can guess a
     * workspace id, and a chat is exactly the thing that must not be.
     *
     * No presence config and no `track()`. This is a listener, not a body in a
     * room - appearing in the lounge's roster because you happen to have the
     * rail open on the tasks page would be a ghost standing in the world.
     */
    /**
     * A topic per conversation, so a room's lines only reach the people reading
     * that room. The lounge keeps the bare `chat:<tenant>` topic it has always
     * had - so an old client and a new one still hear each other in the lounge,
     * which is the only place an old client can be.
     */
    const channel = supabase.channel(
      roomId ? `chat:${tenantId}:${roomId}` : `chat:${tenantId}`,
      { config: { private: true } },
    )
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        /**
         * Counted into the room's tally even though this is a different socket.
         *
         * Chat has its own `chat:<tenantId>` topic - see the note above - but
         * the question the performance page answers is "how much traffic is
         * this room making", and the person in the room is making all of it.
         * Free when nobody is measuring: `countReceived` is one null check
         * against a store the flag never armed. See `world/perf/store`.
         */
        countReceived('chat', performance.now())
        const message = payload as ChatMessage
        // Skipped by user, not by tab: this is the socket's own echo rule, and
        // the reason a second tab of the *same* person needs the relay below
        // rather than a narrower version of this same check.
        if (message?.u === userId) return
        appendIncoming(message)
      })
      .subscribe()

    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [supabase, tenantId, userId, roomId, appendIncoming])

  /**
   * The same-browser shortcut - see tab-sync/broadcast.ts.
   *
   * This is the one place `message.u === userId` must *not* be checked: a
   * packet on this channel came from one of this same person's own tabs by
   * construction (`BroadcastChannel` never crosses an origin, let alone a
   * person), so it is exactly the message the socket above just declined to
   * deliver for being "your own".
   */
  useEffect(() => {
    const channel = openTabChannel(
      `chat-tabs:${tenantId}:${roomId ?? 'lounge'}`,
    )
    tabChannelRef.current = channel
    if (!channel) return

    channel.onmessage = (event) => {
      const message = event.data as ChatMessage
      appendIncoming(message)
      if (message?.b) notifyIfHidden(message.n || t.chat, message.b)
    }

    return () => {
      tabChannelRef.current = null
      channel.close()
    }
  }, [tenantId, roomId, appendIncoming, t.chat])

  /**
   * Say something.
   *
   * Three steps in a deliberate order, and the order is the whole design:
   *
   *   1. The line goes into the list and your own bubble goes up immediately,
   *      marked `sending`. At conversational distance a round trip before
   *      anything appears reads as the key not having worked.
   *   2. The action stores it and hands back the id it was stored under.
   *   3. Only then is it broadcast, carrying that id - so everybody in the
   *      space receives a message they can report, rather than one that exists
   *      only in their tab.
   *
   * A refusal marks the line `failed` rather than removing it. A sentence that
   * vanishes silently is one somebody assumes was sent.
   */
  const say = useCallback(
    (body: string) => {
      // Local only, and never sent: the broadcast carries the server's id, and
      // this just keeps the optimistic row identifiable until that arrives.
      const key = `local:${Date.now()}:${Math.random().toString(36).slice(2)}`

      /**
       * A bubble over your own head, but only where you are actually talking.
       *
       * Reading another room's conversation from the lounge is the whole point
       * of the switcher, and it means "said" and "said *here*" have come apart.
       * Without this check, posting into the café from the lounge would put a
       * speech bubble over your body in the lounge - other people would see you
       * apparently saying nothing, since the broadcast goes to the café's topic
       * and never reaches them.
       *
       * `sceneWorldNow()` is null for the lounge and for every scene that is not
       * a room, which lines up with `roomId` being null for the lounge - so the
       * comparison is the plain one it looks like.
       */
      if (sceneWorldNow() === roomId) announceSaid({ userId, body })

      setLines((current) =>
        [
          ...current,
          {
            key,
            id: null,
            body,
            authorId: userId,
            authorName: 'You',
            createdAt: new Date().toISOString(),
            status: 'sending' as const,
          },
        ].slice(-CHAT_HISTORY_LIMIT),
      )

      // The room as it is *now*, captured before the round trip: switching
      // rooms mid-send must not deliver the sentence to wherever you ended up.
      const said = roomId

      void postChatMessage(slug, body, said).then((result) => {
        if (!result.ok) {
          setLines((current) =>
            current.map((line) =>
              line.key === key ? { ...line, status: 'failed' as const } : line,
            ),
          )
          return
        }

        setLines((current) =>
          current.map((line) =>
            line.key === key
              ? {
                  ...line,
                  id: result.data.id,
                  // The name the *server* resolved, which is the one written
                  // beside the message and the one everyone else will see.
                  authorName: result.data.authorName,
                  createdAt: result.data.createdAt,
                  status: undefined,
                }
              : line,
          ),
        )

        const message: ChatMessage = {
          u: userId,
          i: result.data.id,
          n: result.data.authorName,
          b: body,
        }
        countSent('chat')
        channelRef.current?.send({ type: 'broadcast', event: 'chat', payload: message })
        tabChannelRef.current?.postMessage(message)
      })
    },
    [slug, userId, roomId],
  )

  /**
   * Walk the conversation over to another room, without moving.
   *
   * The list is replaced rather than merged, because these are different
   * conversations and a moment of one room's lines under another's heading is
   * worse than a blank panel. On a refusal the room is put back, so the switcher
   * never shows a room whose messages are not the ones underneath it.
   *
   * Guarded by a token rather than an abort: two quick taps can leave two
   * requests in flight, and the older one landing last would draw the room you
   * are no longer looking at.
   */
  const wanted = useRef<string | null>(null)

  const goToRoom = useCallback(
    (next: string | null) => {
      if (next === roomId) return

      wanted.current = next
      setRoomId(next)
      setLines([])
      setLoading(true)

      void readRoomChat(slug, next).then((result) => {
        // Somebody has tapped again since. Their request owns the panel.
        if (wanted.current !== next) return
        setLoading(false)

        if (!result.ok) {
          setRoomId(roomId)
          return
        }

        setLines(
          result.data.map((message) => ({
            key: message.id,
            id: message.id,
            body: message.body,
            authorId: message.authorId,
            authorName: message.authorName,
            createdAt: message.createdAt,
          })),
        )
      })
    },
    [slug, roomId],
  )

  /**
   * Handed to the emote picker, wherever one happens to be open.
   *
   * No dependency array: cheap, and the one thing that must never happen is a
   * stale `say` outliving a re-render - see `publishDoor` for the same choice
   * made for the same reason.
   */
  useEffect(() => {
    publishChat({ blockedReason }, { say })
  })

  /**
   * And the conversation itself, for the rails drawing it.
   *
   * Separate from the call above because the two have different audiences and
   * different rhythms - see the note on the two listener sets in `chat-store`.
   * This one has a dependency array: it must fire when a line arrives, and
   * firing on every render as well would announce a list that has not changed.
   */
  useEffect(() => {
    publishChatFeed({
      slug,
      selfId: userId,
      lines,
      blockedReason,
      rooms,
      roomId,
      loading,
      onRoom: goToRoom,
    })
  }, [slug, userId, lines, blockedReason, rooms, roomId, loading, goToRoom])

  /**
   * The conversation follows you into a room.
   *
   * `roomId` is the conversation on screen and only ever moved when somebody
   * tapped the switcher; `sceneWorldNow()` is the room your body is standing
   * in and moves when you walk. Nothing joined the two, so walking into a room
   * left the chat pointed at the lounge - and two things went wrong at once:
   * what you typed went to the lounge, where nobody in the room with you could
   * read it, and `sceneWorldNow() === roomId` was false so no bubble was raised
   * over anybody's head. Reported as the blue bubble simply not appearing.
   *
   * Switching *without* moving stays exactly as it was - reading another room's
   * conversation from the lounge is the whole point of the switcher. This is
   * the other half of that rule rather than a reversal of it: moving is a
   * statement about where your voice is, and the panel should agree with your
   * feet until you say otherwise.
   *
   * Keyed on the scene alone. Listing `roomId` would re-run this the moment
   * somebody switched to read elsewhere and yank them straight back.
   */
  const here = useSyncExternalStore(subscribeHere, sceneWorldNow, () => null)
  /**
   * Held in a ref and refreshed in its own effect rather than written during
   * render: a ref assigned while rendering is the arrangement React's compiler
   * refuses, and it is right to - a render can be thrown away, and this one
   * would leave the ref holding a callback from a render that never committed.
   * Declared first, so it is current before the effect below reads it.
   */
  const followRoom = useRef(goToRoom)
  useEffect(() => {
    followRoom.current = goToRoom
  }, [goToRoom])
  useEffect(() => {
    followRoom.current(here)
  }, [here])

  useEffect(() => clearChat, [])

  return null
}
