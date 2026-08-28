import { describe, expect, test } from 'bun:test'
import { layoutOf } from '@/app/xp/_editor/panels/flow-graph'
import { ROUND_AGAIN, RUN_OVER, type XpFlow } from '@kxb/xp'

/**
 * Where the boxes go, checked on its own.
 *
 * The arrows and the nodes both read this, and a layout that disagreed with
 * itself would draw lines to where a node is not - which is the one bug in a
 * graph that looks like a rendering glitch and is arithmetic.
 */
describe('laying a flow out', () => {
  const turn: XpFlow = {
    start: 'roll',
    phases: {
      roll: { next: [{ on: 'rolled', go: 'move' }] },
      move: { next: [{ on: 'moved', go: 'roll' }] },
      over: {},
    },
  }

  test('the start is the top row', () => {
    const spots = layoutOf(turn)
    expect(spots.roll.y).toBeLessThan(spots.move.y)
  })

  test('rows are by distance from the start, not by declaration order', () => {
    const flow: XpFlow = {
      start: 'a',
      phases: {
        c: { next: [] },
        a: { next: [{ on: 'x', go: 'b' }] },
        b: { next: [{ on: 'y', go: 'c' }] },
      },
    }
    const spots = layoutOf(flow)
    expect(spots.a.y).toBeLessThan(spots.b.y)
    expect(spots.b.y).toBeLessThan(spots.c.y)
  })

  test('a phase nothing reaches goes in a row of its own at the bottom', () => {
    /**
     * A diagnosis rather than a fallback: an orphan sitting apart from the graph
     * is the clearest possible drawing of "nothing gets here", and the panel
     * labels it as well.
     */
    const spots = layoutOf(turn)
    expect(spots.over.y).toBeGreaterThan(spots.move.y)
  })

  test('every phase gets a spot, including ones nothing points at', () => {
    expect(Object.keys(layoutOf(turn)).sort()).toEqual(['move', 'over', 'roll'])
  })

  test('a loop back to the start does not put anything in two rows', () => {
    // `move` points back at `roll`, and `roll` must not be dragged down to it.
    const spots = layoutOf(turn)
    expect(spots.roll.y).toBe(14)
  })

  test('a start that names nothing still lays the rest out', () => {
    // The parser refuses this, and the panel is what you look at while making
    // it - so the graph has to draw something rather than throw.
    const spots = layoutOf({ start: 'nowhere', phases: { a: {}, b: {} } })
    expect(Object.keys(spots).sort()).toEqual(['a', 'b'])
  })
})

describe('the destinations that are not phases', () => {
  const best: XpFlow = {
    rounds: 3,
    start: 'play',
    phases: {
      play: { next: [{ after: 90, go: 'between' }] },
      between: { next: [{ after: 4, go: ROUND_AGAIN }] },
    },
  }

  test('the seam gets a spot, so the arrow to it can be drawn', () => {
    /**
     * The whole reason it is laid out at all: a step to the seam used to have
     * no `spots` entry, the renderer skipped the arrow, and the one thing a
     * best-of-three most needs to show - that it goes round - was the one
     * thing missing from the picture.
     */
    const spots = layoutOf(best)
    expect(spots[ROUND_AGAIN]).toBeDefined()
  })

  test('and it sits under every phase', () => {
    const spots = layoutOf(best)
    const lowest = Math.max(spots.play.y, spots.between.y)
    expect(spots[ROUND_AGAIN].y).toBeGreaterThan(lowest)
  })

  test('a flow that never reaches one draws neither', () => {
    // Two boxes nobody's arrow points at would be a legend rather than a graph.
    const spots = layoutOf({ start: 'a', phases: { a: {} } })
    expect(spots[ROUND_AGAIN]).toBeUndefined()
    expect(spots[RUN_OVER]).toBeUndefined()
  })
})
