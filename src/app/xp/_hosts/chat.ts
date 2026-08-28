'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import type { XpChat, XpLine } from '@kxb/xp/host'
import { createClient } from '@/lib/supabase/client'
import { postChatMessage, readRoomChat } from '@/domain/chat/actions'

/**
 * The space's own conversation, handed to a level.
 *
 * docs/xp/backlog.md §7b's third host, and the one the entry is actually about:
 * *a message sent in a level is a message in the space* rather than a second
 * inbox nobody watches. The memory host talks to nobody and `local` talks
 * between two tabs; this one talks to the people who are already here.
 *
 * ---------------------------------------------------------------------------
 * Copied from the chat dock, not imported from it
 * ---------------------------------------------------------------------------
 * `src/app/t/[slug]/chat-dock.tsx` has carried this conversation for months and
 * every decision below is its decision — a private broadcast topic per room, the
 * action first and the broadcast after it, the sender skipping its own packet.
 * It is copied per `AGENTS.md`, which forbids `src/app/xp` reaching into the
 * rest of the app, and owned here.
 *
 * What is deliberately *not* copied is the dock's tab-sync relay. That exists so
 * a second tab of the same person sees their own line, which matters for a panel
 * somebody keeps open in the background; a level is played in the tab you are
 * looking at.
 *
 * ---------------------------------------------------------------------------
 * The action first, then the broadcast
 * ---------------------------------------------------------------------------
 * Backwards from the obvious order, and `actions.ts` says why: everybody learns
 * the message under the id it was actually stored with, so the report button
 * beside a line names a row that exists. The cost is a round trip before anybody
 * else sees it, and the sender does not pay it — their own line is echoed
 * locally the moment the write returns.
 */
export function realtimeChat({
  slug,
  tenantId,
  roomId = null,
  me,
}: {
  /** The space, for the server action. */
  slug: string
  /** The space's id, for the topic. The action takes a slug; the channel does not. */
  tenantId: string
  /**
   * Which conversation this level belongs to. Null is the space's own.
   *
   * Passed in rather than derived, because it is a question the *caller* can
   * answer and the level cannot: a level standing in a room belongs to that
   * room's conversation, and a level played as a battle has no room at all.
   */
  roomId?: string | null
  /** Whose lines to ignore on the way back in — see the echo rule below. */
  me: string
}): XpChat {
  const supabase = createClient()

  const listeners = new Set<(line: XpLine) => void>()
  let channel: RealtimeChannel | null = null

  /**
   * Subscribed on the first listener rather than on construction.
   *
   * A level nobody is talking in should not hold a WebSocket topic open, and
   * this is built in a memo that runs whether or not anything reads it. Same
   * shape as the network host beside it: joining is what opens a channel.
   */
  const join = () => {
    if (channel) return channel

    /**
     * A topic per conversation, and the bare one for the space.
     *
     * The exact strings the dock uses, because they are the same conversation:
     * a line said in a level has to reach the panel somebody has open in the
     * rail, and a topic that differed by one character would be two rooms that
     * look like one.
     */
    channel = supabase.channel(roomId ? `chat:${tenantId}:${roomId}` : `chat:${tenantId}`, {
      config: { private: true },
    })

    channel
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        const message = payload as { u?: string; n?: string; b?: string }
        // Skipped by *person*, not by tab: the sender already echoed this
        // locally under the id the server gave it, and drawing it twice is
        // worse than drawing it once early.
        if (!message || message.u === me) return
        if (typeof message.b !== 'string' || typeof message.u !== 'string') return

        /**
         * The name comes along, and the panel prefers the roster to it.
         *
         * Carried because the person talking may not be *in* the level — the
         * dock in the rail posts on this same topic, so a line can arrive from
         * somebody who never joined the room and whom no roster will ever
         * resolve. See `XpLine.name`.
         */
        const line: XpLine = {
          by: message.u,
          text: message.b,
          at: Date.now() / 1000,
          ...(typeof message.n === 'string' && message.n ? { name: message.n } : {}),
        }
        for (const listener of listeners) listener(line)
      })
      .subscribe()

    return channel
  }

  return {
    async say(text: string) {
      const result = await postChatMessage(slug, text, roomId)
      /**
       * A refusal is thrown rather than swallowed.
       *
       * `postChatMessage` returns a reason — chat is off in this space, the
       * space is read-only, the message is empty — and the caller is the one
       * that can put it in front of the person who typed it. A `say` that
       * resolved on refusal would be a message that vanished.
       */
      if (!result.ok) throw new Error(result.error)

      // Under the name the server resolved rather than one this tab guessed:
      // the whole reason the write comes first is that everybody learns the line
      // as it was stored, and that includes who it says wrote it.
      const line: XpLine = {
        by: me,
        text,
        at: Date.now() / 1000,
        ...(result.data.authorName ? { name: result.data.authorName } : {}),
      }
      for (const listener of listeners) listener(line)

      join().send({
        type: 'broadcast',
        event: 'chat',
        payload: { u: me, i: result.data.id, n: result.data.authorName, b: text },
      })
    },

    on(handler) {
      join()
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
        /**
         * The channel outlives the last listener on purpose.
         *
         * A HUD panel that is closed and reopened would otherwise tear down and
         * re-establish a WebSocket topic each time, and the conversation would
         * miss whatever was said in between — which is the one thing a person
         * closing a panel does not expect to lose.
         */
      }
    },

    /**
     * What was said before this level opened.
     *
     * Present here and absent on the other two hosts, which is the whole reason
     * it is optional: this host keeps history and those do not, and a panel can
     * tell the difference rather than reading an empty list as an empty room.
     */
    async recent(): Promise<XpLine[]> {
      const result = await readRoomChat(slug, roomId)
      if (!result.ok) throw new Error(result.error)

      return result.data.map((message) => ({
        // An author who has since been deleted leaves their lines behind, and
        // the panel draws them under the name the server resolved at the time.
        by: message.authorId ?? '',
        text: message.body,
        at: new Date(message.createdAt).getTime() / 1000,
        /**
         * And the name with it, which is what makes history readable at all.
         *
         * Almost nobody in a scrollback is standing in the level: these are
         * lines from the space's conversation, said before this session opened,
         * and the roster the panel would otherwise look them up in knows only
         * the people who are here now. Without this the panel draws a column of
         * uuids and the history is worse than absent.
         */
        ...(message.authorName ? { name: message.authorName } : {}),
      }))
    },
  }
}
