/**
 * A host made of nothing.
 *
 * Implements `XpHost` with no browser, no network, no clock of its own and no
 * storage - everything is a `Map` and a set of callbacks in the same process.
 *
 * ---------------------------------------------------------------------------
 * Not a stub
 * ---------------------------------------------------------------------------
 * It would be easy to read this as a placeholder until the real one arrives,
 * and it is the opposite: it is the implementation that makes the *interface*
 * mean anything. A port with one implementation is not a port, it is
 * indirection with extra steps - and the second implementation is what proves
 * the first was actually written against an interface rather than against a
 * transport wearing one.
 *
 * It also does three jobs nothing else can:
 *
 * - **Tests.** A whole match - four players, coins, a timer, a winner - runs
 *   inside `bun test` in microseconds, because nothing waits for anything. That
 *   is only possible because the clock is injected and the socket delivers
 *   synchronously.
 * - **Single player.** An XP with nobody else in it needs no transport, and
 *   paying for a websocket to talk to yourself is a slower way to be alone.
 * - **The benchmark.** Measuring the simulation means measuring the
 *   simulation, not a channel.
 *
 * ---------------------------------------------------------------------------
 * What it is honest about
 * ---------------------------------------------------------------------------
 * Delivery here is synchronous, ordered and lossless, and a real transport is
 * none of those. So this cannot find a race, and a rule that only works because
 * a message arrived instantly will pass here and fail on a network. That is a
 * known limit rather than a flaw: what this proves is that the *rules* are
 * right, and what proves the netcode is two browsers.
 */

import type {
  XpArbiter,
  XpChat,
  XpLine,
  XpHost,
  XpIdentity,
  XpNetwork,
  XpPersistence,
  XpPlayer,
  XpSocket,
  XpVerdict,
} from './host'

type Handler = (payload: unknown, from: string) => void

interface Topic {
  members: Map<string, { handlers: Map<string, Set<Handler>>; onPeers: Set<(peers: XpPlayer[]) => void> }>
  players: Map<string, XpPlayer>
}

/**
 * A shared switchboard, so several memory hosts can talk to each other.
 *
 * One per test or per instance. Passing the same one to four `memoryHost` calls
 * gives four clients in a room; passing none gives a client alone.
 */
export interface MemoryNetwork {
  topics: Map<string, Topic>
  /**
   * Everybody listening for something said, across every host on this network.
   *
   * On the network rather than on the host because two tabs sharing a
   * `memoryNetwork` are the case this exists for: a test that puts two players
   * in a room and has one of them talk. A per-host list would make chat the one
   * thing in this file that cannot reach a second player.
   */
  listeners: Set<(line: XpLine) => void>
}

export function memoryNetwork(): MemoryNetwork {
  return { topics: new Map(), listeners: new Set() }
}

// ---------------------------------------------------------------------------
// One authority, in this process
// ---------------------------------------------------------------------------

/**
 * What a rule is handed when it decides.
 *
 * `by` is whoever asked, taken from the host rather than from the payload -
 * a client that names its own player id in the body of the ask is a client
 * that can score for somebody else.
 */
export interface MemoryRuling {
  by: XpPlayer
  payload: unknown
  /** The state everybody shares. Mutate it; the mutation is the outcome. */
  state: Map<string, unknown>
}

/** A refusal a rule can throw, so the common path stays a plain return. */
export class Refused extends Error {}

export interface MemoryArbiter extends XpArbiter {
  /**
   * Teach it one action. Last registration wins, so a test can override.
   *
   * The function runs to completion before the next one starts - which is the
   * one thing this fake shares with the database function it stands in for,
   * and the only reason a two-row outcome can be tested here at all.
   */
  decides(action: string, rule: (ruling: MemoryRuling) => unknown): MemoryArbiter
  /** How the shared state is cut down for one client. Identity by default. */
  shows(redact: (state: Map<string, unknown>, to: XpPlayer) => unknown): MemoryArbiter
  /** The whole of it, for a test to assert against. Not reachable by a client. */
  readonly state: Map<string, unknown>
  /**
   * This same authority, as one client holds it.
   *
   * The split the real thing has too: one function, and a session per caller.
   * `memoryHost` calls this, so a test hands the same arbiter to four hosts and
   * gets four clients who cannot decide anything for themselves.
   */
  for(player: XpPlayer): XpArbiter
}

/**
 * An arbiter shared by every host that is handed it.
 *
 * The second implementation of `XpArbiter`, and the point of it is the same as
 * the point of this whole file: a port with one implementation is indirection
 * with extra steps. Four `memoryHost`s given one of these are four clients that
 * cannot decide anything for themselves - which is exactly the property the
 * real one has to have, expressed in a `Map`.
 *
 * **What it is honest about.** It cannot lose a message, so `lost` never
 * happens here and the client code that handles it is untested by this. It also
 * decides instantly, so nothing here proves the pending state is drawn - that
 * needs a browser and a slow reply. What it *does* prove is that the rules are
 * right and that no client short-circuits them, which is the half that is
 * cheapest to get wrong.
 */
export function memoryArbiter(): MemoryArbiter {
  const state = new Map<string, unknown>()
  const rules = new Map<string, (ruling: MemoryRuling) => unknown>()
  let redact: (state: Map<string, unknown>, to: XpPlayer) => unknown = (all) =>
    Object.fromEntries(all)

  /**
   * Who the next call is from.
   *
   * Set by `for`'s wrappers immediately before the call and read inside it.
   * Safe only because deciding here is synchronous - which is true of this fake
   * and is the sort of thing that is a race in anything real, so it is not a
   * pattern to copy out of this file.
   */
  let asking: XpPlayer = { id: 'nobody', name: 'nobody' }

  const arbiter: MemoryArbiter = {
    state,

    for(player) {
      return {
        ask(action, payload) {
          asking = player
          return arbiter.ask(action, payload)
        },
        view() {
          asking = player
          return arbiter.view()
        },
      }
    },

    decides(action, rule) {
      rules.set(action, rule)
      return arbiter
    },

    shows(next) {
      redact = next
      return arbiter
    },

    async ask<T = unknown>(action: string, payload?: unknown): Promise<XpVerdict<T>> {
      const rule = rules.get(action)
      // An action nobody taught it is refused rather than ignored. Silence here
      // would be a client waiting forever for a verdict on a typo.
      if (!rule) return { ok: false, why: 'refused', message: `no rule for "${action}"` }
      try {
        // The cast is the boundary this fake cannot type: a rule is written per
        // test and the caller says what it expects back. The real one has the
        // same hole and the same answer - a document declares its own shapes.
        return { ok: true, outcome: rule({ by: asking, payload, state }) as T }
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason)
        // Only a deliberate `Refused` is the rules saying no. Anything else is
        // the rule itself being broken, and calling that `refused` would tell a
        // player their move was illegal when the truth is that we crashed.
        return { ok: false, why: reason instanceof Refused ? 'refused' : 'stale', message }
      }
    },

    async view() {
      return redact(state, asking) as never
    },
  }

  return arbiter
}

export interface MemoryHostOptions {
  player: XpPlayer
  /** Share one to give several clients the same authority. */
  arbiter?: MemoryArbiter
  /** Share one to put several hosts in the same room. */
  network?: MemoryNetwork
  /**
   * The clock, in seconds since the instance started.
   *
   * Injected rather than read, for the reason `XpHost.now` gives: an engine
   * that reads its own clock cannot be run faster than real life, so every test
   * about a timer takes as long as the timer.
   */
  now?: () => number
}

export function memoryHost({
  player,
  network = memoryNetwork(),
  now = () => 0,
  arbiter,
}: MemoryHostOptions): XpHost {
  const store = new Map<string, unknown>()
  const streams = new Map<string, { type: string; data: unknown }[]>()

  const identity: XpIdentity = {
    current: async () => player,
    guest: async (name) => ({ ...player, name }),
  }

  /**
   * Said, heard, and kept by nobody.
   *
   * No `recent`, deliberately: this is the *"two tabs on a laptop"* host, and
   * backlog §7b wants trying a level out to cost nothing and tell nobody. A
   * history here would be one that vanishes on reload while looking like one
   * that does not — and `recent` being optional is what lets a level ask
   * whether there is any rather than reading an empty list as an empty room.
   */
  const chat: XpChat = {
    async say(text: string) {
      const line: XpLine = { by: player.id, text, at: now() }
      // A copy per listener is not worth it: the line is frozen by being a
      // literal nobody holds a reference to before this loop.
      for (const listener of network.listeners) listener(line)
    },
    on(handler) {
      network.listeners.add(handler)
      return () => void network.listeners.delete(handler)
    },
  }

  const net: XpNetwork = {
    // The same rate the lounge settled on, so a rule tuned here is tuned for
    // the transport it will actually run on.
    sendHz: 8,
    maxPlayers: 25,

    async join(topicName: string): Promise<XpSocket> {
      let topic = network.topics.get(topicName)
      if (!topic) {
        topic = { members: new Map(), players: new Map() }
        network.topics.set(topicName, topic)
      }

      const me = { handlers: new Map<string, Set<Handler>>(), onPeers: new Set<(peers: XpPlayer[]) => void>() }
      topic.members.set(player.id, me)
      topic.players.set(player.id, player)

      const roster = (): XpPlayer[] => [...topic!.players.values()]
      const announce = () => {
        for (const member of topic!.members.values()) {
          for (const listener of member.onPeers) listener(roster())
        }
      }
      announce()

      return {
        send(type, payload) {
          for (const [id, member] of topic!.members) {
            // Not to ourselves. A sender that hears its own message has to
            // remember to ignore it, and every caller forgetting once is a
            // whole class of double-applied update.
            if (id === player.id) continue
            for (const handler of member.handlers.get(type) ?? []) handler(payload, player.id)
          }
        },

        on(type, handler) {
          const set = me.handlers.get(type) ?? new Set()
          set.add(handler)
          me.handlers.set(type, set)
          return () => set.delete(handler)
        },

        peers: () => roster().filter((peer) => peer.id !== player.id),

        onPeers(handler) {
          me.onPeers.add(handler)
          return () => me.onPeers.delete(handler)
        },

        leave() {
          topic!.members.delete(player.id)
          topic!.players.delete(player.id)
          announce()
        },
      }
    },
  }

  const persistence: XpPersistence = {
    async get(key) {
      return store.get(key)
    },
    async put(key, value) {
      store.set(key, value)
    },
    async append(stream, type, data) {
      const existing = streams.get(stream) ?? []
      existing.push({ type, data })
      streams.set(stream, existing)
    },
  }

  // Absent unless one was handed in, so `missingCapabilities` refuses a
  // document that needs an arbiter on a host that was never given one - which
  // is the whole reason the capability is declarable.
  return {
    identity,
    network: net,
    persistence,
    chat,
    now,
    ...(arbiter ? { arbiter: arbiter.for(player) } : {}),
  }
}
