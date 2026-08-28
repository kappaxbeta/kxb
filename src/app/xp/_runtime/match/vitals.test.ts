import { describe, expect, test } from 'bun:test'
import { barsFrom } from '@/app/xp/_runtime/match/vitals'

/**
 * The bar over somebody else's head, checked without a room.
 *
 * Every failure here is silent in play: a bar that is always full reads as an
 * enemy who cannot be hurt, a bar with no ceiling reads as one who is already
 * dying, and both of them look like a working feature. The runtime cannot be
 * watched, so this is where the rule about what a client may draw is held.
 */
describe('what may be drawn about another body', () => {
  test('the arbiter\'s row becomes a fraction of the arbiter\'s ceiling', () => {
    expect(barsFrom({ health: { bo: 75 }, full: 100, me: 'ana' })).toEqual([
      { id: 'bo', hp: 75, left: 0.75 },
    ])
  })

  test('our own row is not one of them', () => {
    // It is already a number on the HUD, and a bar over your own head is the
    // one bar in the level you cannot see from where you are standing.
    expect(barsFrom({ health: { ana: 20, bo: 40 }, full: 100, me: 'ana' })).toEqual([
      { id: 'bo', hp: 40, left: 0.4 },
    ])
  })

  test('no ceiling is no bar, rather than a full one', () => {
    // `settings` is null until somebody joins. "Nobody has joined this match"
    // and "everybody is untouched" look identical on a full bar and are not the
    // same fact - so the honest drawing of the first one is nothing.
    expect(barsFrom({ health: { bo: 100 }, full: undefined, me: 'ana' })).toEqual([])
    expect(barsFrom({ health: { bo: 100 }, full: 0, me: 'ana' })).toEqual([])
  })

  test('no health map is no bar', () => {
    // A level with no arbiter has nobody entitled to say, and a poll that has
    // not landed yet has nothing to say. Both are the same absence.
    expect(barsFrom({ health: undefined, full: 100, me: 'ana' })).toEqual([])
  })

  test('a body on zero still has a bar, empty', () => {
    // Being down is a thing worth seeing. It is also what the arbiter says
    // between a kill and the victim's own revive, so an empty bar is a real
    // state rather than a rounding error.
    expect(barsFrom({ health: { bo: 0 }, full: 100, me: 'ana' })).toEqual([
      { id: 'bo', hp: 0, left: 0 },
    ])
  })

  test('a row outside the ceiling is clamped rather than drawn out of frame', () => {
    // The ceiling and the row are two writes to one document, and a client that
    // read them a moment apart should draw a full bar rather than one hanging
    // past its own end.
    expect(barsFrom({ health: { bo: 140 }, full: 100, me: 'ana' })[0].left).toBe(1)
    expect(barsFrom({ health: { bo: -20 }, full: 100, me: 'ana' })[0].left).toBe(0)
  })

  test('a row that is not a number is dropped', () => {
    // It comes off the wire as jsonb, which makes it input.
    const health = { bo: 50, cass: 'lots' } as unknown as Record<string, number>
    expect(barsFrom({ health, full: 100, me: 'ana' }).map((bar) => bar.id)).toEqual(['bo'])
  })

  test('the order is stable, so a mesh stays with the person it belongs to', () => {
    const one = barsFrom({ health: { zoe: 10, bo: 20, ana: 30 }, full: 100, me: undefined })
    const two = barsFrom({ health: { ana: 30, zoe: 10, bo: 20 }, full: 100, me: undefined })
    expect(one.map((bar) => bar.id)).toEqual(['ana', 'bo', 'zoe'])
    expect(two.map((bar) => bar.id)).toEqual(one.map((bar) => bar.id))
  })

  test('somebody who has left is still a bar, because leaving is not this file\'s question', () => {
    // The arbiter keeps a row for everybody who ever joined. Whether there is a
    // body to hang it over is the crowd buffer's answer, and it says so by
    // having no position - see ./health-bars.
    expect(barsFrom({ health: { gone: 100 }, full: 100, me: 'ana' })).toHaveLength(1)
  })
})
