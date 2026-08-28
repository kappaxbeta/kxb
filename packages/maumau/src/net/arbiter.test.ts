/**
 * Four clients, one authority, and a secret that has to hold.
 *
 * ---------------------------------------------------------------------------
 * What is actually being tested here
 * ---------------------------------------------------------------------------
 * Not the rules - `../rules/table.test.ts` plays those out and needs no
 * arbiter at all. What is here is the four things that only exist once the
 * rules are behind an authority, every one of which is a way a card game leaks
 * or breaks and none of which a rules test can see:
 *
 * | | the failure it prevents |
 * |---|---|
 * | the view is redacted | somebody reads four hands out of a `view()` |
 * | the seat comes from `ruling.by` | a client plays out of somebody else's hand |
 * | the deal is not reproducible | every player computes the deal from the seed |
 * | a refusal is `refused`, not `stale` | an illegal move reads as a broken server |
 *
 * `memoryArbiter().for(player)` is what makes this possible in a `bun test`:
 * one authority, four clients that hold nothing, and no database anywhere.
 */

import { describe, expect, test } from 'bun:test'
import { memoryArbiter, memoryHost, type MemoryArbiter } from '@kxb/xp/host'
import type { XpHost, XpPlayer } from '@kxb/xp/host'

import { sizeOf } from '../rules/cards'
import { HOUSE, MAX_PLAYERS, handCap } from '../rules/house'
import { seatOf, type Seen } from '../rules/table'
import {
  DEAL,
  READY,
  LEAVE,
  MOVE,
  SIT,
  askTable,
  maumauArbiter,
  readMove,
  shuffled,
  watch,
  type Outcome,
  type Watched,
} from './arbiter'

const PLAYERS: XpPlayer[] = [
  { id: 'anna', name: 'Anna' },
  { id: 'bo', name: 'Bo' },
  { id: 'cem', name: 'Cem' },
  { id: 'dee', name: 'Dee' },
  { id: 'eve', name: 'Eve' },
]

/**
 * A deterministic stream, so a test can say which deal happened.
 *
 * It stands in for the platform's randomness and for nothing else - see the
 * header of `./arbiter`. The point of injecting it is that a test can stack the
 * deck; the point of it *not* being the seeded stream in production is that a
 * player must not be able to do the same.
 */
const counted = (seed = 1): (() => number) => {
  let at = seed
  return () => {
    at = (at * 1103515245 + 12345) % 2147483648
    return at / 2147483648
  }
}

function table(count: number, random = counted()) {
  const arbiter: MemoryArbiter = maumauArbiter(memoryArbiter(), random)
  const hosts: Record<string, XpHost> = {}
  for (const player of PLAYERS.slice(0, count)) {
    hosts[player.id] = memoryHost({ player, arbiter })
  }
  return { arbiter, hosts }
}

/** Sit everybody down and deal, which is the start of nearly every test below. */
async function dealt(count: number, random = counted(), house: unknown = {}) {
  const { arbiter, hosts } = table(count, random)
  for (const player of PLAYERS.slice(0, count)) {
    const sat = await askTable(hosts[player.id]!, SIT, house)
    expect(sat.ok).toBe(true)
    // Everybody says so before anything is dealt - see `tableReady`.
    expect((await askTable(hosts[player.id]!, READY)).ok).toBe(true)
  }
  const start = await askTable<Outcome>(hosts.anna!, DEAL)
  expect(start.ok).toBe(true)
  return { arbiter, hosts }
}

const seen = async (host: XpHost): Promise<Seen> => {
  const view = await watch(host)
  expect(view?.seen).not.toBeNull()
  return view!.seen!
}

describe('sitting down', () => {
  test('takes a seat once, however many times you ask', async () => {
    const { hosts } = table(2)
    await askTable(hosts.anna!, SIT)
    await askTable(hosts.anna!, SIT)
    const view = (await watch(hosts.anna!)) as Watched
    expect(view.seats).toEqual(['anna'])
  })

  test('seats five and refuses a sixth', async () => {
    const arbiter = maumauArbiter(memoryArbiter(), counted())
    for (const player of PLAYERS) {
      const host = memoryHost({ player, arbiter })
      expect((await askTable(host, SIT)).ok).toBe(true)
    }
    expect(PLAYERS).toHaveLength(MAX_PLAYERS)
    const sixth = memoryHost({ player: { id: 'fay', name: 'Fay' }, arbiter })
    const refused = await askTable(sixth, SIT)
    expect(refused).toEqual({ ok: false, why: 'refused', message: 'this table is full' })
  })

  test('pins the house, and names the disagreement', async () => {
    const { hosts } = table(2)
    await askTable(hosts.anna!, SIT, { nines: false })
    const clash = await askTable(hosts.bo!, SIT, { nines: true })
    expect(clash).toMatchObject({
      ok: false,
      why: 'refused',
      message: 'this table was opened with different rules',
    })
  })

  test('will not deal to one', async () => {
    const { hosts } = table(2)
    await askTable(hosts.anna!, SIT)
    await askTable(hosts.anna!, READY)
    expect(await askTable(hosts.anna!, DEAL)).toMatchObject({ why: 'refused', message: 'a table needs two' })
  })

  test('refuses a seat in the middle of a hand, and gives it after', async () => {
    const arbiter = maumauArbiter(memoryArbiter(), counted())
    const anna = memoryHost({ player: PLAYERS[0]!, arbiter })
    const bo = memoryHost({ player: PLAYERS[1]!, arbiter })
    const cem = memoryHost({ player: PLAYERS[2]!, arbiter })
    await askTable(anna, SIT)
    await askTable(bo, SIT)
    await askTable(anna, READY)
    await askTable(bo, READY)
    await askTable(anna, DEAL)

    expect(await askTable(cem, SIT)).toMatchObject({
      why: 'refused',
      message: 'wait for this hand to finish',
    })
  })
})

describe('saying ready', () => {
  test('is what the deal waits for', async () => {
    const { hosts } = table(2)
    await askTable(hosts.anna!, SIT)
    await askTable(hosts.bo!, SIT)

    expect(await askTable(hosts.anna!, DEAL)).toMatchObject({
      why: 'refused',
      message: 'not everybody is ready',
    })

    await askTable(hosts.anna!, READY)
    expect(await askTable(hosts.anna!, DEAL)).toMatchObject({
      why: 'refused',
      message: 'not everybody is ready',
    })

    await askTable(hosts.bo!, READY)
    expect((await askTable(hosts.anna!, DEAL)).ok).toBe(true)
  })

  test('can be taken back, right up until the cards are down', async () => {
    const { hosts } = table(2)
    for (const id of ['anna', 'bo']) {
      await askTable(hosts[id]!, SIT)
      await askTable(hosts[id]!, READY)
    }
    expect((await askTable(hosts.bo!, READY, { ready: false })).ok).toBe(true)
    expect(await askTable(hosts.anna!, DEAL)).toMatchObject({ message: 'not everybody is ready' })
  })

  test('is public, so the table can see who it is waiting for', async () => {
    const { hosts } = table(3)
    for (const id of ['anna', 'bo', 'cem']) await askTable(hosts[id]!, SIT)
    await askTable(hosts.bo!, READY)

    const view = (await watch(hosts.cem!)) as Watched
    expect(view.ready).toEqual(['bo'])
    expect(view.seats).toEqual(['anna', 'bo', 'cem'])
  })

  test('is spent by the deal it started', async () => {
    const { arbiter, hosts } = await dealt(2)
    const view = (await watch(hosts.anna!)) as Watched
    expect(view.ready).toEqual([])
    void arbiter
  })

  test('is refused to somebody who is not at the table', async () => {
    const { arbiter } = await dealt(2)
    const stranger = memoryHost({ player: { id: 'zed', name: 'Zed' }, arbiter })
    expect(await askTable(stranger, READY)).toMatchObject({
      why: 'refused',
      message: 'you are not at this table',
    })
  })

  test('is given up along with the seat', async () => {
    const { hosts } = table(3)
    for (const id of ['anna', 'bo', 'cem']) {
      await askTable(hosts[id]!, SIT)
      await askTable(hosts[id]!, READY)
    }
    await askTable(hosts.cem!, LEAVE)
    const view = (await watch(hosts.anna!)) as Watched
    expect(view.ready).toEqual(['anna', 'bo'])
  })
})

describe('the view', () => {
  test('is your hand in full and everybody else as a number', async () => {
    const { hosts } = await dealt(4)

    const mine = await seen(hosts.anna!)
    expect(mine.hand).toHaveLength(HOUSE.hand)
    expect(Object.keys(mine.counts).sort()).toEqual(['anna', 'bo', 'cem', 'dee'])
    for (const count of Object.values(mine.counts)) expect(count).toBe(HOUSE.hand)

    // Nobody else's cards are anywhere in the reply - not in a field, not in a
    // count, not left behind in something that was meant to be public.
    const theirs = await seen(hosts.bo!)
    const text = JSON.stringify(await watch(hosts.anna!))
    for (const card of theirs.hand) expect(text).not.toContain(card)
  })

  test('never carries the pile, in any form', async () => {
    const { arbiter, hosts } = await dealt(3)
    const view = await seen(hosts.cem!)
    expect(typeof view.pile).toBe('number')

    // The authority holds it; the client's copy does not contain any of it.
    const held = arbiter.state.get('maumau') as { table: { pile: string[] } }
    const text = JSON.stringify(await watch(hosts.cem!))
    expect(held.table.pile.length).toBeGreaterThan(0)
    for (const card of held.table.pile) expect(text).not.toContain(`"${card}"`)
  })

  test('is a different one per client, from one authority', async () => {
    const { hosts } = await dealt(2)
    const anna = await seen(hosts.anna!)
    const bo = await seen(hosts.bo!)
    expect(anna.me).toBe('anna')
    expect(bo.me).toBe('bo')
    expect(anna.hand).not.toEqual(bo.hand)
    // ...but they agree about everything public.
    expect(anna.top).toBe(bo.top)
    expect(anna.turn).toBe(bo.turn)
  })

  test('exists before anything is dealt, so a lobby can be drawn', async () => {
    const { hosts } = table(2)
    await askTable(hosts.anna!, SIT)
    const view = (await watch(hosts.anna!)) as Watched
    expect(view.seen).toBeNull()
    expect(view.seats).toEqual(['anna'])
    expect(view.house).toEqual(HOUSE)
  })
})

describe('who is asking', () => {
  test('is taken from the caller, never from the payload', async () => {
    const { hosts } = await dealt(2)
    const mine = await seen(hosts.anna!)
    expect(seatOf(mine)).toBe('anna')

    // bo asks for a move and names anna in the body. The seat is bo's whatever
    // the payload says, so this is refused for the reason it should be: it is
    // not bo's turn.
    const forged = await askTable(hosts.bo!, MOVE, {
      kind: 'draw',
      seat: 'anna',
      by: 'anna',
    })
    expect(forged).toMatchObject({ ok: false, why: 'refused', message: 'not your turn' })
  })

  test('cannot play a card it can see but does not hold', async () => {
    const { hosts } = await dealt(2)
    const anna = await seen(hosts.anna!)
    const bo = await seen(hosts.bo!)
    // anna, whose turn it is, tries one of bo's cards.
    const stolen = await askTable(hosts.anna!, MOVE, { kind: 'play', card: bo.hand[0] })
    expect(stolen.ok).toBe(false)
    if (!stolen.ok) {
      expect(['that card is not in your hand', 'that follows nothing']).toContain(stolen.message)
    }
    expect((await seen(hosts.anna!)).hand).toEqual(anna.hand)
  })

  test('refuses a stranger outright', async () => {
    const { arbiter } = await dealt(2)
    const stranger = memoryHost({ player: { id: 'zed', name: 'Zed' }, arbiter })
    // Named as a stranger rather than as a mistimed turn, which is the more
    // useful of the two true things `legal` could say.
    expect(await askTable(stranger, MOVE, { kind: 'draw' })).toMatchObject({
      why: 'refused',
      message: 'you are not at this table',
    })
    expect(await askTable(stranger, DEAL)).toMatchObject({
      why: 'refused',
      message: 'you are not at this table',
    })
  })
})

describe('a refusal', () => {
  test('says the rules said no, and not that something broke', async () => {
    const { hosts } = await dealt(2)
    const bo = await askTable(hosts.bo!, MOVE, { kind: 'draw' })
    expect(bo).toMatchObject({ ok: false, why: 'refused' })
  })

  test('reads a move strictly, and calls junk a refusal', async () => {
    expect(readMove(null)).toBeNull()
    expect(readMove({ kind: 'play' })).toBeNull()
    expect(readMove({ kind: 'play', card: 'zz' })).toBeNull()
    expect(readMove({ kind: 'catch' })).toBeNull()
    expect(readMove({ kind: 'shout' })).toBeNull()
    expect(readMove({ kind: 'draw', wish: 'hearts' })).toEqual({ kind: 'draw' })
    expect(readMove({ kind: 'play', card: 'hJ', wish: 'hearts', mau: true })).toEqual({
      kind: 'play',
      card: 'hJ',
      wish: 'hearts',
      mau: true,
    })
    // A wish that is not a suit is dropped rather than carried through as a
    // string the rules would then compare against.
    expect(readMove({ kind: 'play', card: 'hJ', wish: 'coins' })).toEqual({
      kind: 'play',
      card: 'hJ',
    })
  })

  test('is what an unknown action gets', async () => {
    const { hosts } = await dealt(2)
    expect(await askTable(hosts.anna!, 'maumau:cheat')).toMatchObject({ ok: false })
  })

  test('is what a host with no authority gets, rather than a game with no dealer', async () => {
    const alone = memoryHost({ player: PLAYERS[0]! })
    expect(await askTable(alone, SIT)).toEqual({
      ok: false,
      why: 'refused',
      message: 'this table has no dealer',
    })
    expect(await watch(alone)).toBeNull()
  })
})

describe('reading a view shaped like the database one', () => {
  /**
   * The real `xp_arbiter_view` returns the *whole instance*, and its `maumau`
   * key is a JSON null until somebody sits down.
   *
   * The memory arbiter cannot produce that shape - its `shows` always builds a
   * table - so every test in this file agreed with a `watch` that read an empty
   * table as *no answer*. The game drew that as "Asking the dealer…" and a
   * fresh room never got past it, because the only way out was to sit down and
   * the button to sit down was behind the view.
   */
  const asIfSql = (maumau: unknown): XpHost => ({
    identity: { current: async () => PLAYERS[0]! },
    network: { sendHz: 8, maxPlayers: 8, join: async () => { throw new Error('not used') } },
    now: () => 0,
    arbiter: {
      ask: async () => ({ ok: false, why: 'refused' as const, message: 'not used' }),
      // Every other key the real view carries, so the reader has to find ours.
      view: async () =>
        ({ scores: {}, health: {}, lives: {}, me: 'anna', turn: null, maumau }) as never,
    },
  })

  test('an instance nobody has sat at reads as an empty table, not as silence', async () => {
    const view = await watch(asIfSql(null))
    expect(view).not.toBeNull()
    expect(view?.seats).toEqual([])
    expect(view?.seen).toBeNull()
    // Who is looking is known even with no table, so a lobby can be drawn.
    expect(view?.me).toBe('anna')
    expect(view?.house).toEqual(HOUSE)
  })

  test('...and so does one where the key is simply absent', async () => {
    const view = await watch(asIfSql(undefined))
    expect(view?.seats).toEqual([])
  })

  test('a table that is there is read straight through', async () => {
    const view = await watch(
      asIfSql({ seats: ['anna', 'bo'], house: HOUSE, seen: null, me: 'anna' }),
    )
    expect(view?.seats).toEqual(['anna', 'bo'])
  })

  test('no authority at all is still the one thing null means', async () => {
    expect(await watch(memoryHost({ player: PLAYERS[0]! }))).toBeNull()
  })
})

describe('the deal', () => {
  test('gives out a whole pack and keeps the rest face down', async () => {
    const { arbiter, hosts } = await dealt(4)
    const held = arbiter.state.get('maumau') as {
      table: { pile: string[]; discard: string[]; hands: Record<string, string[]> }
    }
    const everything = [
      ...held.table.pile,
      ...held.table.discard,
      ...Object.values(held.table.hands).flat(),
    ]
    expect(new Set(everything).size).toBe(sizeOf('short'))
    expect((await seen(hosts.dee!)).pile).toBe(
      sizeOf('short') - 4 * HOUSE.hand - 1,
    )
  })

  test('is different every time, which is the whole point of it', async () => {
    const first = await dealt(4, counted(1))
    const second = await dealt(4, counted(99))
    expect((await seen(first.hosts.anna!)).hand).not.toEqual(
      (await seen(second.hosts.anna!)).hand,
    )
  })

  test('keeps the hand a small table asked for', async () => {
    // Two players agreeing on ten each get ten: the pack can deal it, and the
    // cap is re-read at the deal against the seats that actually turned up.
    const { hosts } = table(2)
    for (const player of PLAYERS.slice(0, 2)) {
      await askTable(hosts[player.id]!, SIT, { hand: 10 })
      await askTable(hosts[player.id]!, READY)
    }
    await askTable(hosts.anna!, DEAL)
    expect((await seen(hosts.anna!)).hand).toHaveLength(10)
  })

  test('shrinks it to fit the seats that actually turned up', async () => {
    // The same ten, with five at the table. `handCap` says five, so five - and
    // it is the deal that decides, because that is when the seats are known.
    const { hosts } = table(5)
    for (const player of PLAYERS) {
      await askTable(hosts[player.id]!, SIT, { hand: 10 })
      await askTable(hosts[player.id]!, READY)
    }
    await askTable(hosts.anna!, DEAL)
    const view = await seen(hosts.anna!)
    expect(view.house.hand).toBe(handCap('short', MAX_PLAYERS))
    expect(view.hand).toHaveLength(5)
  })

  test('is refused while a hand is still being played', async () => {
    const { hosts } = await dealt(2)
    expect(await askTable(hosts.bo!, DEAL)).toMatchObject({
      why: 'refused',
      message: 'this hand is not finished',
    })
  })

  test('carries the score into the next hand', async () => {
    const { arbiter, hosts } = await dealt(2)
    // Reach into the authority to end the hand rather than playing thirty legal
    // moves: what is under test is the deal, and a scripted win belongs in the
    // rules test that already has one.
    const held = arbiter.state.get('maumau') as { table: { phase: string; wins: Record<string, number> } }
    held.table.phase = 'over'
    held.table.wins = { anna: 2 }

    // Ready is spent by the deal that used it, so the next hand asks again.
    for (const player of PLAYERS.slice(0, 2)) await askTable(hosts[player.id]!, READY)
    expect((await askTable(hosts.bo!, DEAL)).ok).toBe(true)
    expect((await seen(hosts.bo!)).wins).toEqual({ anna: 2 })
  })
})

describe('standing up', () => {
  test('ends a hand in progress rather than repacking the table', async () => {
    const { hosts } = await dealt(3)
    expect((await askTable(hosts.bo!, LEAVE)).ok).toBe(true)
    const view = (await watch(hosts.anna!)) as Watched
    expect(view.seats).toEqual(['anna', 'cem'])
    expect(view.seen).toBeNull()
  })

  test('leaves a finished hand where it is, so the result can still be read', async () => {
    const { arbiter, hosts } = await dealt(3)
    const held = arbiter.state.get('maumau') as { table: { phase: string; winner: string | null } }
    held.table.phase = 'over'
    held.table.winner = 'anna'

    await askTable(hosts.cem!, LEAVE)
    const view = (await watch(hosts.anna!)) as Watched
    expect(view.seen?.winner).toBe('anna')
  })

  test('is quiet about somebody who was never sitting', async () => {
    const { hosts } = table(2)
    await askTable(hosts.anna!, SIT)
    expect((await askTable(hosts.bo!, LEAVE)).ok).toBe(true)
  })
})

describe('a hand played through the authority', () => {
  /**
   * Every move a real client makes, made the way a real client makes it.
   *
   * The rules test proves the rules; this proves that going through `ask` and
   * `view` for each of them arrives at the same place - that the seat rotates,
   * that a refusal does not advance anything, and that the revision moves so a
   * client can tell a fresh view from one it has already drawn.
   */
  test('rotates the seat and moves the revision', async () => {
    const { hosts } = await dealt(3)

    let view = await seen(hosts.anna!)
    expect(seatOf(view)).toBe('anna')

    const first = await askTable<Outcome>(hosts.anna!, MOVE, { kind: 'draw' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.outcome.turn).toBe('bo')

    // A refusal changes nothing, including the revision a client watches.
    const wrong = await askTable<Outcome>(hosts.anna!, MOVE, { kind: 'draw' })
    expect(wrong).toMatchObject({ ok: false, why: 'refused' })

    const second = await askTable<Outcome>(hosts.bo!, MOVE, { kind: 'draw' })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.outcome.turn).toBe('cem')
    expect(second.outcome.at).toBeGreaterThan(first.outcome.at)

    view = await seen(hosts.cem!)
    expect(seatOf(view)).toBe('cem')
    expect(view.counts.anna).toBe(HOUSE.hand + 1)
    expect(view.counts.bo).toBe(HOUSE.hand + 1)
  })
})

describe('the shuffle', () => {
  test('keeps every card and reorders them', () => {
    const pack = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const mixed = shuffled(pack, counted(7))
    expect([...mixed].sort()).toEqual([...pack].sort())
    expect(mixed).not.toEqual(pack)
  })

  test('reaches every position, which a comparator shuffle does not', () => {
    // Where the first card ends up, over many deals. A biased shuffle leaves
    // holes in this set; Fisher-Yates fills it.
    const landed = new Set<number>()
    for (let seed = 1; seed < 400; seed++) {
      landed.add(shuffled(['0', '1', '2', '3', '4'], counted(seed)).indexOf('0'))
    }
    expect(landed.size).toBe(5)
  })
})
