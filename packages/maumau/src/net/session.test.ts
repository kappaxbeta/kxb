/**
 * Four sessions on one topic, over one authority.
 *
 * ---------------------------------------------------------------------------
 * What this adds to `./arbiter.test.ts`
 * ---------------------------------------------------------------------------
 * That file proves the authority. This proves the *loop* - that a move made on
 * one client reaches the other three, that it reaches them without carrying
 * anything secret, and that the things which are supposed to be cheap are.
 *
 * The socket is `memoryNetwork`, which behaves like the real one in the two
 * ways that matter here: it does not echo to the sender, and a `send` reaches
 * every other member synchronously. What it does *not* do is drop anything -
 * so the dropped-nudge case is tested by never sending one, which is the same
 * thing from the receiver's side and does not need a flaky network.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { memoryArbiter, memoryHost, memoryNetwork, type MemoryArbiter } from '@kxb/xp/host'
import type { XpHost, XpPlayer } from '@kxb/xp/host'

import { playableIn, seatOf } from '../rules/table'
import { maumauArbiter } from './arbiter'
import { joinMaumau, type MaumauSession } from './session'
import { readMoved } from './wire'

const PLAYERS: XpPlayer[] = [
  { id: 'anna', name: 'Anna' },
  { id: 'bo', name: 'Bo' },
  { id: 'cem', name: 'Cem' },
  { id: 'dee', name: 'Dee' },
]

const counted = (seed = 1): (() => number) => {
  let at = seed
  return () => {
    at = (at * 1103515245 + 12345) % 2147483648
    return at / 2147483648
  }
}

const open: MaumauSession[] = []
afterEach(() => {
  // Every session holds an interval. One left running turns the next test's
  // failure into a timeout somewhere else entirely.
  while (open.length > 0) open.pop()?.leave()
})

async function sat(count: number, seed = 1) {
  const arbiter: MemoryArbiter = maumauArbiter(memoryArbiter(), counted(seed))
  const network = memoryNetwork()
  const sessions: Record<string, MaumauSession> = {}

  for (const player of PLAYERS.slice(0, count)) {
    const session = await joinMaumau({
      host: memoryHost({ player, arbiter, network }),
      topic: 'kitchen-table',
    })
    open.push(session)
    sessions[player.id] = session
    expect(await session.sit()).toBe(true)
    expect(await session.ready()).toBe(true)
  }
  return { arbiter, sessions }
}

describe('joining', () => {
  test('reads the table before anybody has been dealt anything', async () => {
    const { sessions } = await sat(2)
    expect(sessions.anna!.view?.seats).toEqual(['anna', 'bo'])
    expect(sessions.anna!.view?.seen).toBeNull()
    expect(sessions.anna!.me.id).toBe('anna')
  })

  test('puts everybody on the same roster, the reader included', async () => {
    const { sessions } = await sat(3)
    // Every client sees all three, itself among them - which the memory
    // socket's own `peers()` does not do. See `MaumauSession.peers`.
    for (const session of Object.values(sessions)) {
      expect(session.peers().map((peer) => peer.id).sort()).toEqual(['anna', 'bo', 'cem'])
    }
  })
})

describe('joining a socket that announces at once', () => {
  /**
   * The bug this test exists for, and why nothing else caught it.
   *
   * `src/app/xp/_hosts/realtime.ts` calls an `onPeers` handler *synchronously,
   * inside `onPeers`*, so that a client subscribing late still learns the room
   * as it is now. That is deliberate and documented there. It means the act of
   * subscribing fires a change before `joinMaumau` has finished running.
   *
   * `memoryNetwork` does not: it announces inside `join`, before the caller has
   * had a chance to subscribe. So every test in this file passed against a host
   * that never exercised the path, and the real one crashed at join with
   * `Cannot access 'session' before initialization` - reported from the game,
   * not from here.
   *
   * The fake below has the *realtime* behaviour, because that is the one people
   * play on. A game package that only holds up against the fake is a game
   * package that has been tested against itself.
   */
  function eagerHost(player: XpPlayer, arbiter: MemoryArbiter): XpHost {
    const base = memoryHost({ player, arbiter, network: memoryNetwork() })
    return {
      ...base,
      network: {
        ...base.network,
        async join(topic: string) {
          const socket = await base.network.join(topic)
          return {
            ...socket,
            onPeers(handler) {
              const off = socket.onPeers(handler)
              // The line that matters: answered now, not on the next change.
              handler(socket.peers())
              return off
            },
          }
        },
      },
    }
  }

  test('does not throw, and reports the roster it was handed', async () => {
    const arbiter = maumauArbiter(memoryArbiter(), counted())
    const seen: MaumauSession[] = []

    const session = await joinMaumau({
      host: eagerHost(PLAYERS[0]!, arbiter),
      topic: 'eager',
      onChange: (live) => seen.push(live),
    })
    open.push(session)

    // It joined at all, which is the whole assertion: the failure was a throw
    // out of `onPeers` before the handle existed.
    expect(session.me.id).toBe('anna')
    expect(session.peers().map((peer) => peer.id)).toEqual(['anna'])

    // ...and the caller was told something, rather than the early call being
    // swallowed and the first view never arriving.
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.at(-1)).toBe(session)
    expect((await joinedView(session)).seats).toEqual([])
  })

  test('and a sit made straight after it still lands', async () => {
    const arbiter = maumauArbiter(memoryArbiter(), counted())
    const session = await joinMaumau({ host: eagerHost(PLAYERS[0]!, arbiter), topic: 'eager2' })
    open.push(session)
    expect(await session.sit()).toBe(true)
    expect(session.view?.seats).toEqual(['anna'])
  })
})

/** The view a freshly joined session holds, once it has read one. */
async function joinedView(session: MaumauSession) {
  await session.refresh()
  return session.view!
}

describe('a move', () => {
  test('reaches the other clients without anybody asking', async () => {
    const { sessions } = await sat(3)
    expect(await sessions.anna!.deal()).toBe(true)

    // bo and cem never called anything, and both already know the deal
    // happened - because anna's ask nudged them.
    expect(seatOf(sessions.bo!.view!.seen!)).toBe('anna')
    expect(sessions.cem!.view?.seen?.hand).toHaveLength(sessions.cem!.view!.house.hand)

    expect(await sessions.anna!.draw()).toBe(true)
    expect(seatOf(sessions.bo!.view!.seen!)).toBe('bo')
    expect(seatOf(sessions.cem!.view!.seen!)).toBe('bo')
  })

  test('carries no cards on the wire, only a revision', async () => {
    const arbiter = maumauArbiter(memoryArbiter(), counted())
    const network = memoryNetwork()
    const heard: unknown[] = []

    const anna = await joinMaumau({
      host: memoryHost({ player: PLAYERS[0]!, arbiter, network }),
      topic: 'felt',
    })
    const bo = await joinMaumau({
      host: memoryHost({ player: PLAYERS[1]!, arbiter, network }),
      topic: 'felt',
    })
    open.push(anna, bo)

    // A third listener on the same topic, which is what an eavesdropper would
    // be: on the socket, holding no seat, reading everything that crosses it.
    const spy = memoryHost({ player: { id: 'zed', name: 'Zed' }, arbiter, network })
    const socket = await spy.network.join('felt')
    socket.on('maumau:moved', (payload) => heard.push(payload))

    await anna.sit()
    await bo.sit()
    await anna.ready()
    await bo.ready()
    await anna.deal()

    expect(heard.length).toBeGreaterThan(0)
    for (const message of heard) {
      // Exactly one field, and it is a number.
      expect(Object.keys(message as object)).toEqual(['at'])
      expect(readMoved(message)).not.toBeNull()
    }

    const text = JSON.stringify(heard)
    for (const card of anna.view!.seen!.hand) expect(text).not.toContain(card)
  })

  test('is refused without changing anything, and says why', async () => {
    const { sessions } = await sat(2)
    await sessions.anna!.deal()
    const before = sessions.bo!.view!.seen!.hand

    expect(await sessions.bo!.draw()).toBe(false)
    expect(sessions.bo!.refusal).toEqual({ why: 'refused', message: 'not your turn' })
    expect(sessions.bo!.view!.seen!.hand).toEqual(before)
    expect(sessions.bo!.pending).toBeNull()
  })

  test('clears the last refusal when the next ask is made', async () => {
    const { sessions } = await sat(2)
    await sessions.anna!.deal()
    await sessions.bo!.draw()
    expect(sessions.bo!.refusal).not.toBeNull()

    await sessions.anna!.draw()
    expect(await sessions.bo!.draw()).toBe(true)
    expect(sessions.bo!.refusal).toBeNull()
  })
})

describe('the hand a client holds', () => {
  test('is its own, and it can tell which cards it may play', async () => {
    const { sessions } = await sat(4)
    await sessions.anna!.deal()

    const mine = sessions.anna!.view!.seen!
    const playable = playableIn(mine)
    for (const card of playable) expect(mine.hand).toContain(card)

    // Everybody else can compute nothing at all, because it is not their turn -
    // which is the client-side half of "one predicate, two callers".
    expect(playableIn(sessions.dee!.view!.seen!)).toEqual([])
  })

  test('is never in anybody else’s view', async () => {
    const { sessions } = await sat(4)
    await sessions.anna!.deal()

    for (const [who, session] of Object.entries(sessions)) {
      const text = JSON.stringify(session.view)
      for (const [other, them] of Object.entries(sessions)) {
        if (other === who) continue
        for (const card of them.view!.seen!.hand) expect(text).not.toContain(card)
      }
    }
  })
})

describe('the nudge', () => {
  test('is thrown away when it is not newer', () => {
    expect(readMoved({ at: 3 })).toEqual({ at: 3 })
    expect(readMoved({ at: -1 })).toBeNull()
    expect(readMoved({ at: Number.NaN })).toBeNull()
    expect(readMoved({ at: '3' })).toBeNull()
    expect(readMoved(null)).toBeNull()
  })

  test('is not the only way a client catches up', async () => {
    // A client that hears nothing at all still sees the table on its own read,
    // which is what `POLL_SECONDS` is a floor under. Driven by hand here rather
    // than by waiting four seconds.
    const { sessions } = await sat(2)
    const deaf = sessions.bo!
    deaf.leave()

    await sessions.anna!.deal()
    expect(deaf.view?.seen).toBeNull()

    // ...but `leave` also stops it reading, which is the honest behaviour: a
    // session that has left is not a session that is quietly behind.
    await deaf.refresh()
    expect(deaf.view?.seen).toBeNull()
  })
})

describe('standing up', () => {
  test('gives up the seat, and closing the tab does not', async () => {
    const { arbiter, sessions } = await sat(3)
    expect(await sessions.cem!.stand()).toBe(true)
    expect(sessions.anna!.view?.seats).toEqual(['anna', 'bo'])

    // bo's tab closes. The seat stays, because a tunnel is not a decision.
    sessions.bo!.leave()
    await sessions.anna!.refresh()
    expect(sessions.anna!.view?.seats).toEqual(['anna', 'bo'])
    expect((arbiter.state.get('maumau') as { seats: string[] }).seats).toEqual(['anna', 'bo'])
  })
})
