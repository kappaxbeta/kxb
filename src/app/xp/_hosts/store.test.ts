import { describe, expect, test } from 'bun:test'
import { eventData, xpStore } from '@/app/xp/_hosts/store'

/**
 * The two decisions this port makes before it touches the network.
 *
 * Everything else about `xp_store` is enforced by RLS and checked against the
 * running database - an owner reading no `player` row, a member reading the
 * space's, the `with check` that stops a row being handed to another account.
 * Those are properties of the schema and a test here could only re-state them
 * less reliably.
 *
 * What is decided *here* is which host has a store at all, what a key means, and
 * what an author's appended event turns into. The first two are refusals, and a
 * refusal that is wrong is one nobody finds out about until somebody's progress
 * is in the wrong place.
 */

const SAVED = '88db9b6f-6454-4722-8d08-669df9c1fe30'

describe('which hosts have a store', () => {
  test('a saved project gets one', () => {
    expect(xpStore(SAVED)).not.toBeNull()
  })

  /**
   * `null`, not a no-op store, and the difference is the whole point of the
   * port: `missingCapabilities` refuses a document whose `backend.needs` asks
   * for persistence on a host that has none. A no-op would let that document
   * load, appear to save, and lose everything.
   */
  test('a file on disk does not, because there is no row to hang it on', () => {
    expect(xpStore('ladder-run')).toBeNull()
    expect(xpStore(null)).toBeNull()
    expect(xpStore(undefined)).toBeNull()
    expect(xpStore('')).toBeNull()
  })
})

describe('a key says which scope it is in', () => {
  test('it refuses a key with no scope rather than picking one', async () => {
    const store = xpStore(SAVED)
    if (!store) throw new Error('a saved project has a store')

    // The failure this prevents only goes one way and cannot be taken back: a
    // `player` blob defaulted to `space` is somebody's progress shown to the
    // space, and nothing later can un-show it.
    await expect(store.get('coins')).rejects.toThrow(/player:coins/)
    await expect(store.put('coins', 1)).rejects.toThrow(/space:coins/)
  })

  test('it refuses a scope that is not one of the two', async () => {
    const store = xpStore(SAVED)
    if (!store) throw new Error('a saved project has a store')

    // `global` is the one worth naming: scenes.md §3.2 keeps it out of the
    // table until the commit that also brings a byte cap, a rate limit,
    // moderation and the rule that values are never markup.
    await expect(store.get('global:wall')).rejects.toThrow(/says which scope/)
  })
})

describe('the scope you own and everybody can see', () => {
  test('it is one of the three a key may name', async () => {
    const store = xpStore(SAVED)
    if (!store) throw new Error('a saved project has a store')

    // §7.1. The scope is in the key the author types rather than a flag
    // somebody can flip later, so nothing is promoted from private to visible
    // after it was written - which is why the refusal below has to offer it
    // beside the other two rather than leaving an author to guess it exists.
    await expect(store.get('score')).rejects.toThrow(/"shared:score"/)
  })

  test('only a shared key has a board', async () => {
    const store = xpStore(SAVED)
    if (!store) throw new Error('a saved project has a store')

    // Asking for everybody's `player` row is asking for something §3.4 refuses
    // outright, and a message saying so beats an empty list that looks like
    // "nobody has played yet".
    await expect(store.board('player:coins')).rejects.toThrow(/only a shared key/)
    await expect(store.board('space:town')).rejects.toThrow(/only a shared key/)
  })
})

describe('what a level appends', () => {
  test('an object is what it is', () => {
    expect(eventData({ seconds: 12.5, by: 'me' })).toEqual({ seconds: 12.5, by: 'me' })
  })

  test('a bare value is wrapped rather than refused', () => {
    // A script recording a time as a number is an author being brief. Throwing
    // would send them to read our types to find out where their result went.
    expect(eventData(12.5)).toEqual({ value: 12.5 })
    expect(eventData('won')).toEqual({ value: 'won' })
    expect(eventData(true)).toEqual({ value: true })
  })

  test('nothing at all is still an event', () => {
    // `append(stream, type)` with no data is a fact whose type is the whole of
    // it — "finished", "gave up". The row exists; the payload is empty.
    expect(eventData(undefined)).toEqual({ value: null })
    expect(eventData(null)).toEqual({ value: null })
  })

  test('an array is wrapped too, though jsonb would take it', () => {
    // One shape per stream. A fold over entries that are sometimes objects and
    // sometimes arrays needs a branch per entry, forever.
    expect(eventData([1, 2, 3])).toEqual({ value: [1, 2, 3] })
  })

  test('a saved project now offers the third call as well as the first two', () => {
    expect(typeof xpStore(SAVED)?.append).toBe('function')
  })
})
