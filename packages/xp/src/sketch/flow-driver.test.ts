import { describe, expect, test } from 'bun:test'
import type { XpFlow } from '../document/flow'
import { flowAllows, flowOnEvent, flowTick, packFlow, readPackedFlow, startFlow } from './flow-driver'

/**
 * The flow driver, pure - a whole run played with a fake clock.
 *
 * Moved from `src/app/xp/_sketch/sketch.test.ts` alongside `./flow-driver.ts`
 * - see that file's header for why the module lives in the package now.
 */

describe('the flow driver', () => {
  const FLOW: XpFlow = {
    start: 'aim',
    rounds: 2,
    phases: {
      aim: { says: 'Line it up', allow: ['boost'], next: [{ after: 5, go: 'fly' }] },
      fly: { next: [{ on: 'landed', go: '@next-round' }, { after: 30, go: '@next-round' }] },
    },
  }

  test('a run opens in its start phase with the timer set', () => {
    const state = startFlow(FLOW, 100)
    expect(state.phase).toBe('aim')
    expect(state.round).toBe(1)
    expect(state.endsAt).toBe(105)
    expect(flowAllows(FLOW, state)).toEqual(['boost'])
  })

  test('the clock moves the run, from the deadline rather than from late', () => {
    let state = startFlow(FLOW, 100)
    expect(flowTick(FLOW, state, 104)).toBe(state) // same object: nothing to say
    state = flowTick(FLOW, state, 107)
    expect(state.phase).toBe('fly')
    // Entered at 105, when the aim phase actually ended - a laggy tick must
    // not stretch every phase by its own lateness.
    expect(state.endsAt).toBe(135)
  })

  test('an event moves it too, and rounds go round', () => {
    let state = startFlow(FLOW, 100)
    state = flowTick(FLOW, state, 105)
    state = flowOnEvent(FLOW, state, 'landed', 110)
    expect(state.phase).toBe('aim')
    expect(state.round).toBe(2)
    state = flowTick(FLOW, state, 115)
    state = flowOnEvent(FLOW, state, 'landed', 120)
    // Second round was the last: the run is over, not round three.
    expect(state.over).toBe(true)
    expect(flowAllows(FLOW, state)).toEqual([])
  })

  test('an event no step listens for changes nothing', () => {
    const state = startFlow(FLOW, 100)
    expect(flowOnEvent(FLOW, state, 'landed', 101)).toBe(state)
  })

  test('the packed state survives the wire and lands on the local clock', () => {
    const state = flowTick(FLOW, startFlow(FLOW, 100), 105)
    const packed = packFlow(state, 110)
    expect(packed.l).toBe(25)
    const landed = readPackedFlow(JSON.parse(JSON.stringify(packed)), 1000)
    expect(landed?.phase).toBe('fly')
    expect(landed?.endsAt).toBe(1025)
    expect(readPackedFlow({ p: 42 }, 0)).toBeNull()
  })

  test('seq grows on every move, so a stale broadcast is refusable', () => {
    let state = startFlow(FLOW, 100)
    const before = state.seq
    state = flowTick(FLOW, state, 105)
    expect(state.seq).toBeGreaterThan(before)
  })
})
