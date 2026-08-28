import { describe, expect, test } from 'bun:test'
import { PROGRESS_KEY, readProgress, resumes, type XpProgress } from './progress'
import { DEFAULT_RULES, type XpRules } from '../document/rules'
import type { Capability } from '../document/capabilities'

const rules = (over: Partial<XpRules> = {}): XpRules => ({ ...DEFAULT_RULES, ...over })
const caps = (...list: Capability[]) => list

describe('which levels put you back where you were', () => {
  test('a room does', () => {
    // The case the whole feature exists for: a world somebody wanders into and
    // out of over a week.
    expect(resumes(rules(), caps('freeplay'))).toBe(true)
    expect(resumes(rules({ preset: 'parkour' }), caps('freeplay'))).toBe(true)
  })

  test('a race does not, however many checkpoints it has', () => {
    // A run that began three checkpoints in is not a run, and the leaderboard
    // it produces is one nobody can trust. Note this is the *course* case, so
    // it is exactly the level most likely to have checkpoints in it.
    expect(resumes(rules({ preset: 'parkour' }), caps('competition'))).toBe(false)
  })

  test('a match does not, so both sides start together', () => {
    // Two sides beginning in different places because one of them played
    // yesterday is not a match starting; it is one already in progress.
    expect(resumes(rules({ preset: 'deathmatch' }), caps('freeplay'))).toBe(false)
    expect(resumes(rules({ preset: 'football' }), caps('football'))).toBe(false)
    expect(resumes(rules(), caps('match'))).toBe(false)
  })

  test('the answer comes from the document, not from whether a save exists', () => {
    // Same question, same answer, for a player who has never been here and one
    // who has - which is what makes "this level resumes" a property an author
    // can reason about rather than a thing that happens to some people.
    const room = rules({ preset: 'freestyle' })
    expect(resumes(room, caps('freeplay'))).toBe(resumes(room, caps('freeplay')))

    // And a level that stops being a race starts resuming, which is the right
    // way round: the author changed what the level is.
    expect(resumes(room, caps('competition'))).toBe(false)
    expect(resumes(room, caps('freeplay'))).toBe(true)
  })
})

describe('what came back from the store', () => {
  const saved: XpProgress = { at: { x: 4, y: 1, z: -2, facing: 90 } }

  test('a position survives the round trip', () => {
    expect(readProgress(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  })

  test('the scene travels with it, for the day scenes exist', () => {
    // Nothing writes this yet. It is in the shape now because the alternative
    // is migrating rows that belong to players, in projects we do not own.
    expect(readProgress({ ...saved, scene: 'cellar' })).toEqual({ ...saved, scene: 'cellar' })
    expect(readProgress({ ...saved, scene: '' })?.scene).toBeUndefined()
  })

  test('a value that is not a place is dropped rather than repaired', () => {
    // Starting at the spawn is a working session. A body placed at NaN is a
    // camera pointing at nothing and a level that looks broken.
    expect(readProgress({ at: { x: 0, y: 0, z: 0, facing: Number.NaN } })).toBeNull()
    expect(readProgress({ at: { x: 0, y: 0, z: 0 } })).toBeNull()
    expect(readProgress({ at: 'over there' })).toBeNull()
    expect(readProgress(null)).toBeNull()
    expect(readProgress([])).toBeNull()
    expect(readProgress(undefined)).toBeNull()
  })

  test('the checkpoint number comes back when the pad said one', () => {
    expect(readProgress({ ...saved, order: 3 })?.order).toBe(3)
    expect(readProgress({ ...saved, order: 'third' })?.order).toBeUndefined()
  })
})

test('the key says which scope it is in, like every other store key', () => {
  // ../../src/app/xp/_hosts/store.ts refuses a key with no scope rather than
  // defaulting one, so this constant carries the prefix.
  expect(PROGRESS_KEY.startsWith('player:')).toBe(true)
})
