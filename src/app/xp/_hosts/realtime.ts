'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { xpStore } from '@/app/xp/_hosts/store'
import { createClient } from '@/lib/supabase/client'
import {
  memoryHost,
  type XpArbiter,
  type XpHost,
  type XpNetwork,
  type XpPlayer,
  type XpSocket,
  type XpVerdict,
} from '@kxb/xp/host'

/**
 * A host made of Supabase Realtime.
 *
 * The third `XpHost`, and the first one that reaches a second machine. `local`
 * is two tabs on one laptop through a `BroadcastChannel`, which is exactly right
 * for trying a level out and cannot do the thing this is for: sending somebody a
 * link and both being in the room.
 *
 * ---------------------------------------------------------------------------
 * Copied from the lounge, not imported from it
 * ---------------------------------------------------------------------------
 * `src/app/world/lounge/multiplayer.tsx` has done this for two years and every
 * decision below is its decision - presence keyed by user id, the roster derived
 * from `presenceState` on every sync, positions as broadcasts rather than as
 * presence updates. It is copied per docs/xp/creator.md §1.2 and owned here,
 * because the lounge is live and this is a prototype, and a shared module means
 * one of them drags the other around.
 *
 * What is *not* copied is the interpolation: the lounge holds peer positions in
 * React state and lerps in a component, and this hands raw samples to `Crowd` in
 * `@kxb/xp/engine`, which is pure and tested. That is the one place this is
 * better rather than merely separate.
 *
 * ---------------------------------------------------------------------------
 * Three things it is honest about
 * ---------------------------------------------------------------------------
 * **It needs a signed-in person.** The topic is `private: true` and the policy
 * in `20260920000000_xp_rooms.sql` is `to authenticated`, so a visitor has to be
 * somebody - a guest account is somebody. Anonymous strangers are not a thing
 * this can admit without a public channel, and a public channel is one anybody
 * holding the anon key can shout into.
 *
 * **Eight a second.** Room traffic grows with the *square* of the room, which is
 * the number that actually bounds how many people can be in one - see `sendHz`
 * in `@kxb/xp/host`. Interpolation makes eight samples look like sixty.
 *
 * **Nothing here is durable.** A socket is for what is true now. A score that
 * has to survive the tab closing goes through persistence, and in a match it
 * goes through the battle stream.
 */

/**
 * What a project id looks like, so a builtin's name is not sent to a `uuid`.
 *
 * `xpStore` keeps its own copy of this test for the same reason and they are
 * deliberately not shared: one answers *does this host have a store*, the other
 * *can anything be raided here*, and a module in between would make a level's
 * saves and its raids fail together for reasons neither owns.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One topic per room. The room id is the capability - see the migration. */
const topicFor = (room: string) => `xp:${room}`

/**
 * One channel setup at a time, per topic, for the whole tab.
 *
 * Module-level and not per `realtimeNetwork`, because the thing being protected
 * is: `createClient()` hands every caller the *same* browser client, so the
 * channel list is one list however many networks are made against it.
 *
 * What it protects is the window between asking for a channel and binding the
 * presence handler onto it. `RealtimeClient.channel(topic)` returns the
 * *existing* channel when one is registered under that topic, so two joins of
 * one topic that overlap end with the second one binding a handler onto a
 * channel the first has already subscribed - which is the "cannot add
 * `presence` callbacks for realtime:xp:<id> after `subscribe()`" reported from
 * production, and the case the `stale` removal below cannot close on its own:
 * it looks for a channel that is *registered*, and the join it is racing has
 * not registered one yet.
 *
 * Which happens on the ordinary path rather than a strange one. A room mounts
 * two joins - the scene's topic and the instance's (see ./room-scene) - and any
 * remount re-runs both while the first pair is still settling. The old failure
 * mode is the nasty kind: the throw is inside a promise nobody awaits, so the
 * console has an error and the room has a door that quietly never reached
 * anybody.
 *
 * Only the *setup* is queued, deliberately - not the subscribe. Waiting for a
 * subscription to complete would make a second join hang for as long as the
 * first takes to be admitted, and a channel refused by the policy never
 * completes at all.
 */
const setups = new Map<string, Promise<unknown>>()

/** Run `work` once whatever was setting this topic up has finished. */
function afterSetup<T>(topic: string, work: () => Promise<T>): Promise<T> {
  const previous = setups.get(topic) ?? Promise.resolve()
  // Both arms, so one join that failed does not strand every later one behind
  // a rejected promise.
  const next = previous.then(work, work)
  setups.set(
    topic,
    next.catch(() => {}),
  )
  return next
}

/**
 * How many updates a second a client sends.
 *
 * The lounge's number, unchanged, and for the reason its own comment gives: at
 * 8 Hz a twenty-person room is already 3,200 messages a second leaving the
 * server, and twelve would be 7,200 for movement nobody can tell apart.
 */
const SEND_HZ = 8

/** Past this a room stops being a game and starts being a queue. */
const MAX_PLAYERS = 16

export function realtimeNetwork(me: XpPlayer): XpNetwork {
  const supabase = createClient()

  return {
    sendHz: SEND_HZ,
    maxPlayers: MAX_PLAYERS,

    async join(room: string): Promise<XpSocket> {
      const topic = topicFor(room)

      let peers: XpPlayer[] = []
      const rosters = new Set<(peers: XpPlayer[]) => void>()

      /**
       * Asked for, cleared and bound in one go, with no other join of this topic
       * able to run in the middle of it - see `afterSetup` above for why that is
       * the unit rather than any one of the three lines.
       *
       * Reported from production as "cannot add 'presence' callbacks for
       * realtime:xp:<id> after subscribe()", which reads like a mistake in the
       * order of the lines below and is not: the presence handler is bound
       * before `subscribe` and always has been. What it is instead is two of
       * these running at once.
       */
      const channel: RealtimeChannel = await afterSetup(topic, async () => {
        /**
         * Any channel still registered for this room, gone before we ask for one.
         *
         * `RealtimeClient.channel(topic)` **returns the existing channel** when
         * one with that topic is already registered rather than making a new one.
         * `removeChannel` is asynchronous, so a client that re-joins the same room
         * - a remount, a swapped level, a reconnect - can reach here while the
         * previous channel is still in the list, be handed that one back, and then
         * try to bind a handler on something that has already subscribed.
         *
         * Awaited rather than fired and forgotten: the point is to be certain it
         * is gone before asking, and `void`ing it would reproduce exactly the
         * race being closed. It costs nothing in the common case, where there is
         * nothing to remove.
         */
        const stale = supabase
          .getChannels()
          .find((existing) => existing.topic === `realtime:${topic}`)
        if (stale) await supabase.removeChannel(stale)

        /**
         * `private: true` makes Realtime check the policy before letting us in.
         * Without it the topic is open to anyone holding the anon key who can
         * guess a room id, and the anon key is in the page.
         */
        const made: RealtimeChannel = supabase.channel(topic, {
          config: { private: true, presence: { key: me.id } },
        })
        bindPresence(made)
        return made
      })

      /**
       * The roster, off presence. A function only so that binding it can happen
       * inside the queued block above rather than a microtask after it.
       */
      function bindPresence(channel: RealtimeChannel) {
        channel.on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState<{
            id: string
            name: string
            skin?: string
            team?: string
          }>()

          /**
           * Everybody in the room, ourselves included.
           *
           * Including us is what `peers()` promises, and it is what the election a
           * mode will one day need - "who owns the ball" is answered by sorting a
           * roster everybody agrees on, so a roster that leaves one person out is
           * one that gives two different answers.
           *
           * One entry per *person* rather than per connection: somebody with two
           * tabs open is one player, and drawing them twice would mean two bodies
           * fighting over one position with a network round trip in between.
           */
          const next: XpPlayer[] = []
          for (const entries of Object.values(state)) {
            for (const entry of entries) {
              if (!entry?.id) continue
              if (next.some((player) => player.id === entry.id)) continue
              next.push({
                id: entry.id,
                name: entry.name || 'Someone',
                ...(entry.skin ? { skin: entry.skin } : {}),
                ...(entry.team ? { team: entry.team } : {}),
              })
            }
          }
          peers = next
          for (const listen of rosters) listen(next)
        })
      }

      return new Promise<XpSocket>((resolve) => {
        const handlers = new Map<string, Set<(payload: unknown, from: string) => void>>()

        channel.subscribe((status) => {
          if (status !== 'SUBSCRIBED') return
          // Our own body, announced once we are actually in. Tracking before
          // subscription succeeds is a presence nobody receives.
          void channel.track({ id: me.id, name: me.name, skin: me.skin, team: me.team })
          resolve(socket)
        })

        const socket: XpSocket = {
          send(type, payload) {
            // Fire and forget, which is what the interface promises and what a
            // position update wants: a retry of where somebody was is worse than
            // nothing, because by the time it lands it is a lie.
            void channel.send({ type: 'broadcast', event: type, payload })
          },

          on(type, handler) {
            let set = handlers.get(type)
            if (!set) {
              set = new Set()
              handlers.set(type, set)
              /**
               * One Realtime listener per event type, however many handlers.
               *
               * `channel.on` cannot be undone individually, so a subscribe per
               * caller would leak a listener every time a component remounted -
               * and in a frame loop that is every hot reload.
               */
              channel.on('broadcast', { event: type }, ({ payload }) => {
                const from =
                  typeof payload === 'object' && payload !== null && 'from' in payload
                    ? String((payload as { from: unknown }).from)
                    : ''
                // Our own echo, dropped here rather than by every caller: a body
                // drawn from the network *and* from the camera is two answers to
                // where somebody is, a round trip apart.
                if (from === me.id) return
                for (const listen of handlers.get(type) ?? []) listen(payload, from)
              })
            }
            set.add(handler)
            return () => {
              set?.delete(handler)
            }
          },

          peers: () => peers,

          onPeers(handler) {
            rosters.add(handler)
            // Whoever asks late still gets the room as it is now, rather than
            // waiting for somebody else to arrive before hearing anything.
            handler(peers)
            return () => {
              rosters.delete(handler)
            }
          },

          leave() {
            rosters.clear()
            handlers.clear()
            void supabase.removeChannel(channel)
          },
        }
      })
    },
  }
}

/**
 * The authority, for the outcomes neither client may decide.
 *
 * Two calls onto two database functions - `docs/xp/server-authority.md` §4.1 and
 * `20261005000000_xp_arbiter.sql`. Everything interesting is on the other side
 * of them; what is here is the shape of a round trip and what to say when it
 * does not come back.
 *
 * **Who is asking is not sent.** The functions read `auth.uid()` from the
 * caller's own session, so `me.id` appears nowhere in these payloads. A client
 * that could name the scorer could score for somebody else.
 *
 * The `lost` verdict is manufactured here and nowhere else: a server that could
 * report a lost message would by definition not have lost it, so the only place
 * that knows is the caller whose reply never arrived. It is deliberately *not*
 * `refused` - the action may well have happened, and the difference between
 * "the rules said no" and "we do not know" is the difference between a message
 * a player can act on and a number that quietly goes wrong.
 */
export function realtimeArbiter(instance: string, xpId?: string): XpArbiter {
  const supabase = createClient()

  return {
    /**
     * A raid, and only when we know which project this is.
     *
     * `xp_visit` is keyed by the XP rather than by the room: it moves two saves
     * that belong to the level, and the person it takes from is usually not in
     * the room or anywhere else. So this is present exactly when the scene knows
     * its project id, and absent otherwise - which is what the optional method
     * on the port is for, rather than a call that always exists and always
     * fails.
     *
     * **A uuid, tested rather than assumed**, and it is the same condition
     * `xpStore` applies one file over: a *builtin* level is served off disk and
     * named `steal-a-plant` rather than by a row, so there is no project to key
     * saves by - which is why a builtin has no store either. Passing that name
     * to a function typed `uuid` is a five-hundred where an absent method is a
     * gate that says there is nowhere to take anything from.
     */
    ...(xpId && UUID.test(xpId)
      ? {
          async visit<T = unknown>(): Promise<XpVerdict<T>> {
            const { data, error } = await supabase.rpc('xp_visit', { p_xp: xpId })
            if (error) return { ok: false, why: 'lost', message: error.message }
            return data as XpVerdict<T>
          },
        }
      : {}),
    async ask<T = unknown>(action: string, payload?: unknown): Promise<XpVerdict<T>> {
      const { data, error } = await supabase.rpc('xp_arbitrate', {
        p_instance: instance,
        p_action: action,
        p_payload: (payload ?? {}) as never,
      })
      if (error) return { ok: false, why: 'lost', message: error.message }
      return data as XpVerdict<T>
    },

    async view<T = unknown>(): Promise<T> {
      const { data, error } = await supabase.rpc('xp_arbiter_view', { p_instance: instance })
      // A view that cannot be read is not an empty view, and returning one
      // would draw an empty scoreboard over a match in progress. The caller
      // asks again; there is nothing sensible to render from a failed read.
      if (error) throw new Error(`the arbiter could not be read: ${error.message}`)
      return data as T
    },
  }
}

/**
 * The whole host: a real network, and everything else in memory.
 *
 * Identity is still the memory host's, which is the honest shape of this
 * milestone - what is being tested is whether two people can be in a level
 * together, and a durable score is a different question with its own answer
 * already written (the battle stream).
 *
 * Persistence is real when there is a saved project to store against, and
 * absent otherwise rather than in memory. A file under `public/xp/xps/` has a
 * slug and no row, so there is nowhere to put a save and `missingCapabilities`
 * says so at load - which is better than a store that accepts writes for the
 * length of a session and forgets them, and is what docs/xp/state.md §7.3 means
 * by a stateless room costing nothing.
 *
 * The arbiter is the exception, and it is present only when there is a room to
 * be the authority *of*. An instance is a topic, so a host with no topic has no
 * instance, and a document that needs an arbiter is refused there by
 * `missingCapabilities` rather than quietly deciding things for itself.
 */
export function realtimeHost(me: XpPlayer, instance?: string, xpId?: string): XpHost {
  /**
   * A clock that actually moves.
   *
   * ---------------------------------------------------------------------------
   * `memoryHost`'s default is `() => 0`, and this host inherited it
   * ---------------------------------------------------------------------------
   * Which is exactly right where it comes from - `memoryHost` is built so a test
   * can drive a whole match in a loop without waiting for one, and a clock it
   * does not control would defeat that. It is silently wrong here, and it was
   * wrong from the day this file was written: `realtimeHost` spreads a memory
   * host for its identity and persistence and took the frozen clock with it.
   *
   * Nothing noticed because the XP runtime keeps its own elapsed time and never
   * asks. The first consumer to read `host.now()` found a host where time does
   * not pass, and the way that failed is worth writing down: a game sending
   * position updates on a schedule sent exactly one, forever, because
   * `now >= next` is false for every value of `next` above zero. Both clients
   * were in the room, presence agreed, and neither ever heard from the other.
   *
   * `performance.now` rather than `Date.now`, per `XpHost.now`: monotonic by
   * specification, so a match timer does not jump when NTP corrects the system
   * clock.
   */
  const started = typeof performance === 'undefined' ? 0 : performance.now()
  const base = memoryHost({
    player: me,
    now: () => (typeof performance === 'undefined' ? 0 : (performance.now() - started) / 1000),
  })
  const store = xpStore(xpId)
  return {
    ...base,
    network: realtimeNetwork(me),
    ...(instance ? { arbiter: realtimeArbiter(instance, xpId) } : {}),
    ...(store ? { persistence: store } : { persistence: undefined }),
  }
}
