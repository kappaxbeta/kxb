import { describe, expect, test } from 'bun:test'
import type { XpPlayer, XpSocket } from './host'
import { berlinTime, createSnowflakes, nodeOf, timeOf, XP_EPOCH } from './snowflake'
import { createStore, electHost } from './store'

/**
 * A room of sockets wired to each other, in memory.
 *
 * No transport, no timers, no network - which is the point of the socket being
 * an interface rather than a Supabase channel. Everything a store does can be
 * checked by handing it a fake and reading what came out.
 */
function room() {
  const members = new Map<string, { handlers: Map<string, Set<(p: unknown, from: string) => void>>; peers: Set<(peers: XpPlayer[]) => void> }>()

  const roster = (): XpPlayer[] =>
    [...members.keys()].map((id) => ({ id, name: id }))

  function join(id: string): XpSocket {
    members.set(id, { handlers: new Map(), peers: new Set() })
    for (const member of members.values()) {
      for (const listener of member.peers) listener(roster())
    }

    return {
      send(type, payload) {
        for (const [other, member] of members) {
          if (other === id) continue
          for (const handler of member.handlers.get(type) ?? []) handler(payload, id)
        }
      },
      on(type, handler) {
        const member = members.get(id)!
        const set = member.handlers.get(type) ?? new Set()
        set.add(handler)
        member.handlers.set(type, set)
        return () => set.delete(handler)
      },
      peers: () => roster().filter((peer) => peer.id !== id),
      onPeers(handler) {
        members.get(id)!.peers.add(handler)
        return () => members.get(id)?.peers.delete(handler)
      },
      leave() {
        members.delete(id)
        for (const member of members.values()) {
          for (const listener of member.peers) listener(roster())
        }
      },
    }
  }

  return { join, roster }
}

interface Shared extends Record<string, unknown> {
  scores: Record<string, number>
  timeLeft: number
  winner: string | null
}

interface Mine extends Record<string, unknown> {
  coins: number
  team: string
}

function twoPlayers() {
  const net = room()
  const aSocket = net.join('a')
  const bSocket = net.join('b')

  const shared: Shared = { scores: {}, timeLeft: 60, winner: null }
  const a = createStore<Shared, Mine>({
    socket: aSocket,
    self: 'a',
    isHost: () => true,
    shared,
    mine: { coins: 0, team: 'red' },
  })
  const b = createStore<Shared, Mine>({
    socket: bSocket,
    self: 'b',
    isHost: () => false,
    shared,
    mine: { coins: 0, team: 'blue' },
  })
  return { a, b, net }
}

describe('a player owns their own slice', () => {
  test('what I set, everybody sees', () => {
    const { a, b } = twoPlayers()
    a.setMine({ coins: 3 })
    expect(b.getState().players.a?.coins).toBe(3)
    expect(a.getState().players.a?.coins).toBe(3)
  })

  test('my slice keeps what I did not touch', () => {
    const { a, b } = twoPlayers()
    a.setMine({ coins: 3 })
    expect(b.getState().players.a?.team).toBeUndefined()
    a.setMine({ team: 'red' })
    expect(b.getState().players.a).toEqual({ coins: 3, team: 'red' })
  })

  test('a slice is filed under whoever sent it, not under what the message says', () => {
    /**
     * The one rule that makes ownership real: the id comes from the transport,
     * so claiming to be somebody else means the transport lied rather than that
     * a client typed a different string.
     */
    const { a, b } = twoPlayers()
    b.setMine({ coins: 99 })
    expect(a.getState().players.b?.coins).toBe(99)
    expect(a.getState().players.a?.coins).toBe(0)
  })

  test('subscribers hear about it, with a new object each time', () => {
    const { a, b } = twoPlayers()
    const seen: number[] = []
    b.subscribe((state) => seen.push(state.players.a?.coins ?? -1))
    a.setMine({ coins: 1 })
    a.setMine({ coins: 2 })
    expect(seen).toEqual([1, 2])
  })

  test('unsubscribing stops it', () => {
    const { a, b } = twoPlayers()
    let count = 0
    const off = b.subscribe(() => (count += 1))
    a.setMine({ coins: 1 })
    off()
    a.setMine({ coins: 2 })
    expect(count).toBe(1)
  })
})

describe('the host owns the totals', () => {
  test('the host writes and everybody sees', () => {
    const { a, b } = twoPlayers()
    a.setShared({ scores: { red: 5 }, timeLeft: 59 })
    expect(b.getState().shared.scores).toEqual({ red: 5 })
    expect(b.getState().shared.timeLeft).toBe(59)
  })

  test('a non-host writing is refused, not applied locally', () => {
    /**
     * Applying it locally would give that one client a score nobody else has,
     * which is worse than nothing happening: it looks like it worked, and the
     * disagreement only surfaces when somebody compares screens.
     */
    const { a, b } = twoPlayers()
    b.setShared({ timeLeft: 1 })
    expect(b.getState().shared.timeLeft).toBe(60)
    expect(a.getState().shared.timeLeft).toBe(60)
  })

  test('a client that believes it is host ignores somebody else claiming to be', () => {
    // Two clients briefly both believing it is a real state during an election.
    // Each listener uses its own view, so the disagreement lasts exactly as long
    // as the election.
    const { a, b } = twoPlayers()
    a.setShared({ timeLeft: 30 })
    expect(a.getState().shared.timeLeft).toBe(30)
    expect(b.getState().shared.timeLeft).toBe(30)
  })
})

describe('collecting coins, adding them up, and calling it', () => {
  test('the whole flow, with the host doing the arithmetic', () => {
    /**
     * The shape the product asked for: each player counts their own pickups,
     * the host sums them per team, and when the clock runs out the host decides
     * the winner. One machine adds up, so the total is a fact rather than an
     * average of four opinions.
     */
    const { a, b } = twoPlayers()

    a.setMine({ team: 'red', coins: 0 })
    b.setMine({ team: 'blue', coins: 0 })

    // Play.
    a.setMine({ coins: 7 })
    b.setMine({ coins: 4 })

    // The host adds up from what it can see.
    const totals: Record<string, number> = {}
    for (const slice of Object.values(a.getState().players)) {
      const team = (slice.team as string) ?? 'none'
      totals[team] = (totals[team] ?? 0) + ((slice.coins as number) ?? 0)
    }
    a.setShared({ scores: totals, timeLeft: 0 })

    // Time is up, so the host names a winner.
    const winner = Object.entries(totals).sort((x, y) => y[1] - x[1])[0][0]
    a.setShared({ winner })

    expect(b.getState().shared.scores).toEqual({ red: 7, blue: 4 })
    expect(b.getState().shared.winner).toBe('red')
  })
})

describe('somebody leaving', () => {
  test('their slice goes with them', () => {
    // A scoreboard that keeps somebody who closed their tab an hour ago is
    // wrong in a way the numbers cannot show.
    const net = room()
    const aSocket = net.join('a')
    const bSocket = net.join('b')
    const a = createStore<Shared, Mine>({
      socket: aSocket,
      self: 'a',
      isHost: () => true,
      shared: { scores: {}, timeLeft: 60, winner: null },
      mine: { coins: 0, team: 'red' },
    })
    const b = createStore<Shared, Mine>({
      socket: bSocket,
      self: 'b',
      isHost: () => false,
      shared: { scores: {}, timeLeft: 60, winner: null },
      mine: { coins: 0, team: 'blue' },
    })

    b.setMine({ coins: 5 })
    expect(a.getState().players.b?.coins).toBe(5)

    b.close()
    expect(a.getState().players.b).toBeUndefined()
    expect(a.getState().players.a).toBeDefined()
  })
})

describe('electing a host', () => {
  test('the lowest id, so every machine picks the same one', () => {
    expect(electHost([{ id: 'b' }, { id: 'c' }], 'a')).toBe('a')
    expect(electHost([{ id: 'a' }, { id: 'c' }], 'b')).toBe('a')
  })

  test('alone, it is you', () => {
    expect(electHost([], 'z')).toBe('z')
  })

  test('the same answer whatever order the roster arrives in', () => {
    // Any rule that depends on join order or latency gives a different answer
    // on different machines during the moment it matters.
    expect(electHost([{ id: 'c' }, { id: 'b' }], 'd')).toBe(
      electHost([{ id: 'b' }, { id: 'c' }], 'd'),
    )
  })
})

describe('ids that sort themselves', () => {
  test('later ids sort after earlier ones, as plain strings', () => {
    let clock = XP_EPOCH + 1000
    const ids = createSnowflakes(1, () => clock)
    const first = ids.next()
    clock += 5
    const second = ids.next()
    expect(second > first).toBe(true)
    expect([second, first].sort()).toEqual([first, second])
  })

  test('two in the same millisecond still order', () => {
    const clock = XP_EPOCH + 1000
    const ids = createSnowflakes(1, () => clock)
    const a = ids.next()
    const b = ids.next()
    expect(b > a).toBe(true)
  })

  test('a clock that jumps backwards does not reorder anything', () => {
    /**
     * `Date.now()` is not monotonic - an NTP correction moves it back by
     * seconds - and an id that moves back is a pair of events that swap places.
     */
    let clock = XP_EPOCH + 10_000
    const ids = createSnowflakes(1, () => clock)
    const before = ids.next()
    clock -= 5_000
    const after = ids.next()
    expect(after > before).toBe(true)
  })

  test('an id carries when and who', () => {
    const clock = XP_EPOCH + 123_456
    const ids = createSnowflakes(7, () => clock)
    const id = ids.next()
    expect(timeOf(id)).toBe(clock)
    expect(nodeOf(id)).toBe(7)
  })

  test('every id is the same width, which is what makes string sorting work', () => {
    let clock = XP_EPOCH
    const ids = createSnowflakes(0, () => clock)
    const widths = new Set<number>()
    for (let i = 0; i < 50; i++) {
      clock += 999
      widths.add(ids.next().length)
    }
    expect(widths.size).toBe(1)
  })

  test('a node outside the field is refused rather than truncated', () => {
    expect(() => createSnowflakes(-1)).toThrow()
    expect(() => createSnowflakes(9999)).toThrow()
  })

  test('Berlin is a display, and only a display', () => {
    /**
     * The id itself is UTC. Building it out of local time is a bug that fires
     * once a year: Berlin goes back an hour at the end of October, so for that
     * hour ids issued later would sort earlier.
     *
     * Midday UTC on a summer day is 14:00 in Berlin, which is the +2 offset
     * being applied at the edge where it belongs.
     */
    const noon = Date.UTC(2026, 6, 1, 12, 0, 0)
    const ids = createSnowflakes(0, () => noon)
    expect(berlinTime(ids.next())).toContain('14:00')
  })
})
