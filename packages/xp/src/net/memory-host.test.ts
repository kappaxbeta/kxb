import { describe, expect, test } from 'bun:test'
import {
  HOST_CAPABILITIES,
  memoryHost,
  memoryNetwork,
  missingCapabilities,
  unsupported,
  type XpLine,
  memoryArbiter,
  Refused,
} from './host'
import { createSnowflakes, timeOf, XP_EPOCH } from './snowflake'
import { createStore, electHost } from './store'

/**
 * The memory host, and one whole match run through it.
 *
 * The point of the last test in this file is not the coins. It is that a match
 * with four players, a clock, a scoreboard and a result runs to completion
 * inside a unit test in microseconds - which is only possible because the clock
 * is injected and the socket delivers synchronously, and which is the whole
 * argument for the host being an interface rather than a Supabase channel.
 */

const player = (id: string, team: string) => ({ id, name: id, team })

describe('the interface is satisfied', () => {
  test('a memory host provides everything a document can ask for', () => {
    const host = memoryHost({ player: player('a', 'red'), arbiter: memoryArbiter() })
    expect(missingCapabilities(host, HOST_CAPABILITIES)).toEqual([])
  })

  /**
   * The arbiter is the one capability this host does not have by default, and
   * that is the point of it: a game whose fairness depends on somebody else
   * deciding must refuse to start where nobody does, rather than quietly
   * deciding for itself.
   */
  test('there is no arbiter unless one was handed in', () => {
    const alone = memoryHost({ player: player('a', 'red') })
    expect(missingCapabilities(alone, ['arbiter'])).toEqual(['arbiter'])
    expect(missingCapabilities(alone, ['identity', 'network', 'persistence'])).toEqual([])
  })

  test('a host with no persistence is refused for it, and only for it', () => {
    // The needs/wants split made concrete: a level with an optional leaderboard
    // must still run somewhere with no database.
    const host = memoryHost({ player: player('a', 'red') })
    const withoutStorage = { ...host, persistence: undefined }
    expect(missingCapabilities(withoutStorage, ['identity', 'network'])).toEqual([])
    expect(missingCapabilities(withoutStorage, ['persistence'])).toEqual(['persistence'])
  })

  test('the clock is whatever it is handed', () => {
    let seconds = 0
    const host = memoryHost({ player: player('a', 'red'), now: () => seconds })
    expect(host.now()).toBe(0)
    seconds = 299
    expect(host.now()).toBe(299)
  })
})

describe('a room', () => {
  test('everybody sees everybody', async () => {
    const network = memoryNetwork()
    const a = await memoryHost({ player: player('a', 'red'), network }).network.join('m')
    const b = await memoryHost({ player: player('b', 'blue'), network }).network.join('m')

    expect(a.peers().map((p) => p.id)).toEqual(['b'])
    expect(b.peers().map((p) => p.id)).toEqual(['a'])
  })

  test('a message reaches the others and not the sender', async () => {
    // A sender that hears its own message has to remember to ignore it, and
    // every caller forgetting once is a whole class of double-applied update.
    const network = memoryNetwork()
    const a = await memoryHost({ player: player('a', 'red'), network }).network.join('m')
    const b = await memoryHost({ player: player('b', 'blue'), network }).network.join('m')

    const heard: string[] = []
    a.on('ping', () => heard.push('a'))
    b.on('ping', (_payload, from) => heard.push(`b from ${from}`))

    a.send('ping', {})
    expect(heard).toEqual(['b from a'])
  })

  test('two topics do not hear each other', async () => {
    const network = memoryNetwork()
    const a = await memoryHost({ player: player('a', 'red'), network }).network.join('one')
    const b = await memoryHost({ player: player('b', 'blue'), network }).network.join('two')
    let heard = 0
    b.on('ping', () => (heard += 1))
    a.send('ping', {})
    expect(heard).toBe(0)
  })

  test('leaving tells the others', async () => {
    const network = memoryNetwork()
    const a = await memoryHost({ player: player('a', 'red'), network }).network.join('m')
    const b = await memoryHost({ player: player('b', 'blue'), network }).network.join('m')

    let roster: string[] = []
    a.onPeers((peers) => (roster = peers.map((p) => p.id)))
    b.leave()
    expect(roster).toEqual(['a'])
  })
})

describe('persistence', () => {
  test('what goes in comes out', async () => {
    const host = memoryHost({ player: player('a', 'red') })
    await host.persistence!.put('best', 42)
    expect(await host.persistence!.get('best')).toBe(42)
    expect(await host.persistence!.get('nothing')).toBeUndefined()
  })
})

/**
 * One authority, and the clients that cannot argue with it.
 *
 * The worked example is the one `docs/xp/server-authority.md` §4.1 picks as the
 * first slice, and it is deliberately not a card game: a **kill**. Two clients
 * disagree, one of them is the one that benefits, there is no secret anywhere in
 * it, and the outcome has to move two numbers together.
 */
describe('an arbiter decides what no client may', () => {
  /** Scores and lives, and the rules that move them - all in one place. */
  function deathmatch() {
    const arbiter = memoryArbiter()
    arbiter.state.set('scores', { a: 0, b: 0 })
    arbiter.state.set('lives', { a: 3, b: 3 })

    return arbiter.decides('kill', ({ by, payload, state }) => {
      const victim = (payload as { victim: string }).victim
      const lives = state.get('lives') as Record<string, number>
      const scores = state.get('scores') as Record<string, number>

      // Every one of these is a thing a client would have got wrong, and the
      // reason the decision is here rather than there.
      if (victim === by.id) throw new Refused('you cannot kill yourself for a point')
      if (!(victim in lives)) throw new Refused('no such player')
      if (lives[victim]! <= 0) throw new Refused('already out')

      // The two-rows-together half. Not two calls - one rule, and either both
      // numbers moved or the throw above meant neither did.
      lives[victim] -= 1
      scores[by.id] = (scores[by.id] ?? 0) + 1
      return { scores: { ...scores }, lives: { ...lives } }
    })
  }

  test('a kill moves two numbers, and both clients see the same two', async () => {
    const shared = deathmatch()
    const network = memoryNetwork()
    const a = memoryHost({ player: player('a', 'red'), network, arbiter: shared })
    const b = memoryHost({ player: player('b', 'blue'), network, arbiter: shared })

    const verdict = await a.arbiter!.ask('kill', { victim: 'b' })
    expect(verdict.ok).toBe(true)

    // Asked by the other client, from its own session, and it agrees - because
    // there is one copy of this and neither of them is holding it.
    const seen = (await b.arbiter!.view()) as { scores: Record<string, number>; lives: Record<string, number> }
    expect(seen.scores).toEqual({ a: 1, b: 0 })
    expect(seen.lives).toEqual({ a: 3, b: 2 })
  })

  /**
   * The credit goes to whoever asked, taken from the host's own identity. A
   * client that could name the scorer in the payload is a client that can score
   * for somebody else, which is the same bug as trusting the wire.
   */
  test('you cannot score on somebody else s behalf', async () => {
    const shared = deathmatch()
    const b = memoryHost({ player: player('b', 'blue'), arbiter: shared })

    await b.arbiter!.ask('kill', { victim: 'a', by: 'a' })
    expect(shared.state.get('scores')).toEqual({ a: 0, b: 1 })
  })

  test('a refusal says which kind it is, and changes nothing', async () => {
    const shared = deathmatch()
    const a = memoryHost({ player: player('a', 'red'), arbiter: shared })

    const suicide = await a.arbiter!.ask('kill', { victim: 'a' })
    expect(suicide).toEqual({ ok: false, why: 'refused', message: 'you cannot kill yourself for a point' })
    expect(shared.state.get('scores')).toEqual({ a: 0, b: 0 })

    const unknown = await a.arbiter!.ask('teleport', {})
    expect(unknown.ok).toBe(false)
    expect(unknown.ok === false && unknown.why).toBe('refused')
  })

  test('a broken rule is not reported as an illegal move', async () => {
    const shared = memoryArbiter().decides('boom', () => {
      throw new TypeError('the rule itself is wrong')
    })
    const a = memoryHost({ player: player('a', 'red'), arbiter: shared })
    const verdict = await a.arbiter!.ask('boom')
    // `refused` would tell a player their move was illegal when the truth is
    // that we crashed, and they would go looking for a rule that does not exist.
    expect(verdict.ok === false && verdict.why).toBe('stale')
  })

  test('running out of lives is a rule, not a client s opinion', async () => {
    const shared = deathmatch()
    const a = memoryHost({ player: player('a', 'red'), arbiter: shared })
    for (let i = 0; i < 3; i++) expect((await a.arbiter!.ask('kill', { victim: 'b' })).ok).toBe(true)

    const fourth = await a.arbiter!.ask('kill', { victim: 'b' })
    expect(fourth).toEqual({ ok: false, why: 'refused', message: 'already out' })
    expect(shared.state.get('scores')).toEqual({ a: 3, b: 0 })
  })

  /**
   * The secrecy half, in the smallest form that proves the shape: the view is
   * computed per asker, so what reaches a client is decided by the arbiter
   * rather than trimmed by the client afterwards.
   */
  test('the view is per player, and it is a reply rather than a broadcast', async () => {
    const shared = memoryArbiter()
    shared.state.set('hands', { a: ['ace'], b: ['king'] })
    shared.shows((state, to) => {
      const hands = state.get('hands') as Record<string, string[]>
      return {
        mine: hands[to.id] ?? [],
        others: Object.fromEntries(
          Object.entries(hands)
            .filter(([id]) => id !== to.id)
            .map(([id, cards]) => [id, cards.length]),
        ),
      }
    })

    const network = memoryNetwork()
    const a = memoryHost({ player: player('a', 'red'), network, arbiter: shared })
    const b = memoryHost({ player: player('b', 'blue'), network, arbiter: shared })

    type Seen = { mine: string[]; others: Record<string, number> }
    expect(await a.arbiter!.view<Seen>()).toEqual({ mine: ['ace'], others: { b: 1 } })
    expect(await b.arbiter!.view<Seen>()).toEqual({ mine: ['king'], others: { a: 1 } })

    // And nothing private went over the wire to get there: the socket is a
    // broadcast bus, so the only thing it could have been is public.
    const socket = await a.network.join('m')
    const heard: unknown[] = []
    const listener = await b.network.join('m')
    listener.on('hand', (payload) => heard.push(payload))
    socket.send('turn', { whose: 'b' })
    expect(heard).toEqual([])
  })
})

describe('a whole match, in one test', () => {
  test('four players collect coins, the host adds up, the clock runs out', async () => {
    interface Shared extends Record<string, unknown> {
      scores: Record<string, number>
      timeLeft: number
      winner: string | null
      resultId: string | null
    }
    interface Mine extends Record<string, unknown> {
      coins: number
      team: string
    }

    const network = memoryNetwork()
    let seconds = 0
    const ids = createSnowflakes(1, () => XP_EPOCH + seconds * 1000)

    const roster = [
      player('a', 'red'),
      player('b', 'red'),
      player('c', 'blue'),
      player('d', 'blue'),
    ]

    const hosts = roster.map((p) => memoryHost({ player: p, network, now: () => seconds }))
    const sockets = await Promise.all(hosts.map((h) => h.network.join('match')))

    // Everybody elects from the same roster and gets the same answer.
    const elected = roster.map((p) => electHost(roster.filter((o) => o.id !== p.id), p.id))
    expect(new Set(elected).size).toBe(1)
    const hostId = elected[0]
    expect(hostId).toBe('a')

    const stores = roster.map((p, i) =>
      createStore<Shared, Mine>({
        socket: sockets[i],
        self: p.id,
        isHost: () => p.id === hostId,
        shared: { scores: {}, timeLeft: 60, winner: null, resultId: null },
        mine: { coins: 0, team: p.team! },
      }),
    )

    for (const [i, p] of roster.entries()) stores[i].setMine({ team: p.team! })

    // Play. Each player counts their own pickups - nobody can write anybody
    // else's, so there is nothing to reconcile.
    const collected = { a: 7, b: 2, c: 5, d: 5 }
    for (const [i, p] of roster.entries()) {
      stores[i].setMine({ coins: collected[p.id as keyof typeof collected] })
    }

    // The clock runs out. Sixty seconds pass in no time at all, because the
    // clock is a variable.
    seconds = 60
    const host = stores[0]
    expect(host.isHost()).toBe(true)

    const totals: Record<string, number> = {}
    for (const slice of Object.values(host.getState().players)) {
      const team = (slice.team as string) ?? 'none'
      totals[team] = (totals[team] ?? 0) + ((slice.coins as number) ?? 0)
    }
    const winner = Object.entries(totals).sort((x, y) => y[1] - x[1])[0][0]
    const resultId = ids.next()

    host.setShared({ scores: totals, timeLeft: 0, winner, resultId })

    // One machine writes the result, once.
    await hosts[0].persistence!.append!('match:1', 'finished', {
      id: resultId,
      scores: totals,
      winner,
    })

    // Everybody agrees, including the two who never did any arithmetic.
    for (const store of stores) {
      expect(store.getState().shared.scores).toEqual({ red: 9, blue: 10 })
      expect(store.getState().shared.winner).toBe('blue')
      expect(store.getState().shared.resultId).toBe(resultId)
    }

    // And the result's id says when it happened, in UTC.
    expect(timeOf(resultId)).toBe(XP_EPOCH + 60_000)
  })
})

/**
 * `unsupported`, which is the same question from a caller that holds ports
 * rather than a host — the runtime composes a network and sometimes an arbiter
 * and passes them down separately.
 */
describe('what the host does not offer', () => {
  test('names exactly what was asked for and is not there', () => {
    expect(unsupported(['identity', 'persistence'], ['identity', 'network'])).toEqual([
      'persistence',
    ])
  })

  test('asking for nothing is not a refusal', () => {
    // The common case, and docs/xp/state.md §7.3's default: a level that stores
    // nothing must cost nothing, including this check.
    expect(unsupported(undefined, [])).toEqual([])
    expect(unsupported([], [])).toEqual([])
  })

  test('it does not care which list it was given', () => {
    // The asymmetry between needs and wants is the caller's to keep: this
    // answers "which of these is absent", and refusing versus degrading is
    // decided by which list was passed in. Combining them at the call site is
    // the mistake, not here.
    expect(unsupported(['arbiter'], [])).toEqual(['arbiter'])
  })
})

describe('saying something', () => {
  test('one tab hears the other, because the listeners live on the network', async () => {
    // The case this host exists for: two tabs on a laptop, sharing a network,
    // one of them talking. A per-host list would make chat the one thing here
    // that cannot reach a second player.
    const network = memoryNetwork()
    const ana = memoryHost({ player: { id: 'ana', name: 'Ana' }, network, now: () => 12 })
    const bo = memoryHost({ player: { id: 'bo', name: 'Bo' }, network })

    const heard: XpLine[] = []
    bo.chat!.on((line) => heard.push(line))
    await ana.chat!.say('over here')

    expect(heard).toEqual([{ by: 'ana', text: 'over here', at: 12 }])
  })

  test('the line carries the id and the host is clock', async () => {
    // `by` is an id because a roster already maps one to a name, and a line
    // carrying a name is wrong the moment somebody renames themselves. `at` is
    // the host's clock because a sender's clock is a sender's opinion.
    const network = memoryNetwork()
    const host = memoryHost({ player: { id: 'ana', name: 'Ana' }, network, now: () => 7 })

    const heard: XpLine[] = []
    host.chat!.on((line) => heard.push(line))
    await host.chat!.say('hello')

    expect(heard[0]?.by).toBe('ana')
    expect(heard[0]?.at).toBe(7)
  })

  test('unsubscribing stops it', async () => {
    const network = memoryNetwork()
    const host = memoryHost({ player: { id: 'ana', name: 'Ana' }, network })

    const heard: XpLine[] = []
    const off = host.chat!.on((line) => heard.push(line))
    off()
    await host.chat!.say('nobody home')

    expect(heard).toEqual([])
  })

  test('it keeps no history, and says so by not offering any', () => {
    // Trying a level out should cost nothing and tell nobody. A history here
    // would be one that vanishes on reload while looking like one that does
    // not - and `recent` being absent is how a level can tell the difference
    // between "no history kept" and "an empty room".
    const host = memoryHost({ player: { id: 'ana', name: 'Ana' } })
    expect(host.chat?.recent).toBeUndefined()
  })
})
