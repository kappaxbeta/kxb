/**
 * Shared state, with an owner for every part of it.
 *
 * A store shaped like the ones a React app already uses - `getState`,
 * `setState`, `subscribe` - except that setting something tells everybody else,
 * and reading it sees what everybody else set. The coins you collected, the
 * score per team, how long is left, who won.
 *
 * ---------------------------------------------------------------------------
 * Why it is not just a shared object
 * ---------------------------------------------------------------------------
 * A store where anyone can write anything is last-write-wins over an unreliable
 * transport, which means two clients that disagree stay disagreeing and there
 * is no rule for which is right. That is not a bug you fix later; it is the
 * absence of a decision.
 *
 * So every part of the state has exactly one writer:
 *
 * - **`mine`** - one slice per player, written only by that player. Where you
 *   are, what you are holding, how many coins *you* picked up. Nobody else can
 *   write yours, so there is nothing to reconcile: a message about somebody
 *   else's slice from anybody but them is dropped.
 * - **`shared`** - written only by the host. The totals, the clock, the winner.
 *   One machine adds up the coins, so the sum is a fact rather than an average
 *   of four opinions.
 *
 * The host is the same elected role football already uses for the ball, and the
 * same one that mints ids (./snowflake): one clock, one adder, one answer.
 *
 * ---------------------------------------------------------------------------
 * What it deliberately does not do
 * ---------------------------------------------------------------------------
 * No conflict resolution, no CRDT, no operation log. Ownership makes conflicts
 * impossible rather than resolvable, which is a smaller thing to build and a
 * far smaller thing to reason about at three in the morning when the scores
 * disagree.
 *
 * No persistence either. The store is what is true *now*; what survives a
 * refresh goes through `XpPersistence` (./host), and the moment for that is the
 * end of a match - one result, written once, by the host.
 */

import type { XpSocket } from './host'

export {
  berlinTime,
  createSnowflakes,
  nodeOf,
  timeOf,
  XP_EPOCH,
  type Snowflakes,
} from './snowflake'

/** A plain, serialisable bag. Whatever a game wants to track. */
export type Slice = Record<string, unknown>

export interface StoreState<S extends Slice, M extends Slice> {
  /** Host-owned. Totals, timer, winner. */
  shared: S
  /** One per player, owned by that player. */
  players: Record<string, M>
}

export interface XpStore<S extends Slice, M extends Slice> {
  getState(): StoreState<S, M>
  /** My own slice. Broadcast to everyone; nobody else may write it. */
  setMine(partial: Partial<M>): void
  /**
   * The shared slice. Host only.
   *
   * A non-host calling this is refused rather than queued or applied locally.
   * Applying it locally would give that client a score nobody else has, which
   * is worse than nothing happening - it looks like it worked.
   */
  setShared(partial: Partial<S>): void
  /** Returns an unsubscribe, the same shape every store in the app already has. */
  subscribe(listener: (state: StoreState<S, M>) => void): () => void
  /** Whether this client is currently the one that may write `shared`. */
  isHost(): boolean
  /** Stop listening and leave the topic. */
  close(): void
}

/** How a store's messages look on the wire. Two, and that is the whole protocol. */
const MINE = 'store:mine'
const SHARED = 'store:shared'

export interface StoreOptions<S extends Slice, M extends Slice> {
  socket: XpSocket
  /** This client's player id. What `setMine` writes under. */
  self: string
  /** Whether this client is the host, asked fresh each time - it can change. */
  isHost: () => boolean
  shared: S
  mine: M
}

export function createStore<S extends Slice, M extends Slice>({
  socket,
  self,
  isHost,
  shared,
  mine,
}: StoreOptions<S, M>): XpStore<S, M> {
  let state: StoreState<S, M> = {
    shared: { ...shared },
    players: { [self]: { ...mine } },
  }

  const listeners = new Set<(state: StoreState<S, M>) => void>()

  /**
   * A new object every time, so a React subscriber can compare by identity.
   *
   * Mutating in place and calling listeners is the shape that silently does
   * nothing in a memoised component, and "the score is right in the store and
   * wrong on screen" is a bad afternoon.
   */
  const publish = () => {
    for (const listener of listeners) listener(state)
  }

  const offMine = socket.on(MINE, (payload, from) => {
    /**
     * A slice is only ever written by the player it belongs to.
     *
     * The `from` the transport reports, not a field in the message - a client
     * claiming to be somebody else is then a client the transport has to have
     * lied about, rather than one that typed a different string.
     */
    if (typeof payload !== 'object' || payload === null) return
    if (from === self) return

    state = {
      ...state,
      players: { ...state.players, [from]: { ...(state.players[from] ?? {}), ...payload } as M },
    }
    publish()
  })

  const offShared = socket.on(SHARED, (payload, from) => {
    if (typeof payload !== 'object' || payload === null) return
    /**
     * Only from the host, and *we* decide who that is.
     *
     * Trusting the sender's word for it would make "I am the host" a thing any
     * client can say. Two clients briefly believing they are host during an
     * election is a real state, and the resolution is that each listener uses
     * its own view - so the disagreement lasts as long as the election and no
     * longer.
     */
    if (isHost()) return
    state = { ...state, shared: { ...state.shared, ...payload } as S }
    publish()
  })

  const offPeers = socket.onPeers((peers) => {
    /**
     * Forget a player who left.
     *
     * Otherwise a scoreboard keeps somebody who closed their tab an hour ago,
     * and a "who is winning" that counts them is wrong in a way nobody can see
     * from the numbers.
     */
    const here = new Set(peers.map((peer) => peer.id))
    here.add(self)
    const players: Record<string, M> = {}
    for (const [id, slice] of Object.entries(state.players)) {
      if (here.has(id)) players[id] = slice
    }
    if (Object.keys(players).length !== Object.keys(state.players).length) {
      state = { ...state, players }
      publish()
    }
  })

  return {
    getState: () => state,

    setMine(partial) {
      state = {
        ...state,
        players: { ...state.players, [self]: { ...state.players[self], ...partial } as M },
      }
      socket.send(MINE, partial)
      publish()
    },

    setShared(partial) {
      if (!isHost()) return
      state = { ...state, shared: { ...state.shared, ...partial } as S }
      socket.send(SHARED, partial)
      publish()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    isHost,

    close() {
      offMine()
      offShared()
      offPeers()
      listeners.clear()
      socket.leave()
    },
  }
}

/**
 * Who the host is, out of whoever is present.
 *
 * The lowest id, which is not arbitrary: it is *stable*. Any rule that depends
 * on join order, latency or a vote produces a different answer on different
 * machines during the moment it matters, and this one produces the same answer
 * everywhere from the same list. Football's ball already elects its owner this
 * way, and it survived contact with a room full of people.
 *
 * Re-run whenever the roster changes, which is what makes a host leaving a
 * hiccup rather than a stopped match.
 */
export function electHost(peers: readonly { id: string }[], self: string): string | null {
  const ids = [...peers.map((peer) => peer.id), self].sort()
  return ids[0] ?? null
}
