import { describe, expect, test } from 'bun:test'
import { parseXp, type XpFlow } from '@kxb/xp'
import {
  flowAllows,
  flowOnEvent,
  flowTick,
  packFlow,
  readPackedFlow,
  startFlow,
} from './flow-driver'
import {
  MAX_SEND_BYTES,
  MAX_STATE_BYTES,
  readFrameMessage,
  readWireControl,
} from './protocol'
import { SKETCH_SDK } from './sdk'
import { sketchSrcdoc } from './srcdoc'

/**
 * The sketch container, tested at its seams.
 *
 * Three of them: the srcdoc (the containment - what would be an XSS if the
 * armour slipped), the protocol (the validation - what a hostile frame can
 * make the stage do), and the flow driver (the run - pure, so a whole match
 * plays in a test with a fake clock).
 */

const sketchOf = (files: Record<string, string>, entry = 'main.js') => {
  const parsed = parseXp({
    format: 'xp/1',
    id: 'probe',
    name: 'Probe',
    capabilities: [],
    sketch: { engine: 'p5', entry, files },
  })
  if (!parsed.ok) throw new Error('should have parsed')
  return parsed.document.sketch!
}

const ORIGIN = 'https://example.test'

describe('the srcdoc', () => {
  test('a source written to break out of its tag cannot', () => {
    const evil = 'var s = "</script><script>alert(1)</script>"'
    const html = sketchSrcdoc({
      sketch: sketchOf({ 'main.js': evil }),
      origin: ORIGIN,
      me: null,
      keys: [],
    })
    // The raw close tag must not survive anywhere the parser would see one.
    expect(html).not.toContain('</script><script>alert')
    expect(html).toContain('<\\/script>')
  })

  test('the boot config cannot spell a tag either', () => {
    const html = sketchSrcdoc({
      sketch: sketchOf({ 'main.js': '' }),
      origin: ORIGIN,
      me: { id: 'u1', name: '</script><b>' },
      keys: [],
    })
    expect(html).not.toContain('name":"</script>')
  })

  test('every file is there, entry last', () => {
    const html = sketchSrcdoc({
      sketch: sketchOf({ 'main.js': 'MAIN()', 'lib/helper.js': 'HELPER()' }, 'main.js'),
      origin: ORIGIN,
      me: null,
      keys: [],
    })
    expect(html.indexOf('HELPER()')).toBeGreaterThan(-1)
    expect(html.indexOf('MAIN()')).toBeGreaterThan(html.indexOf('HELPER()'))
  })

  test('a shader is carried into the boot, never into a script tag', () => {
    const parsed = parseXp({
      format: 'xp/1',
      id: 'probe',
      name: 'Probe',
      capabilities: [],
      sketch: {
        engine: 'p5',
        entry: 'main.js',
        files: { 'glow.frag': 'GLOW_SOURCE()', 'main.js': 'MAIN()' },
      },
    })
    if (!parsed.ok) throw new Error('should have parsed')
    const html = sketchSrcdoc({ sketch: parsed.document.sketch!, origin: ORIGIN, me: null, keys: [] })
    // In the boot JSON (escaped), not as an executable tag.
    expect(html).not.toContain('<script>/* glow.frag */')
    expect(html).toContain('GLOW_SOURCE()')
  })

  test('the containment headers are present and pinned to the origin', () => {
    const html = sketchSrcdoc({
      sketch: sketchOf({ 'main.js': '' }),
      origin: ORIGIN,
      me: null,
      keys: [],
    })
    expect(html).toContain(`default-src 'none'`)
    expect(html).toContain(`connect-src ${ORIGIN}`)
    expect(html).toContain(`${ORIGIN}/xp/vendor/p5.min.js`)
  })
})

describe('the protocol reader', () => {
  test('reads the real shapes and refuses the rest', () => {
    expect(readFrameMessage({ t: 'ready' })).toEqual({ t: 'ready' })
    expect(readFrameMessage({ t: 'control', name: 'boost', down: true })).toEqual({
      t: 'control',
      name: 'boost',
      down: true,
    })
    expect(readFrameMessage({ t: 'emit', name: 'goal' })).toEqual({ t: 'emit', name: 'goal' })
    expect(readFrameMessage(null)).toBeNull()
    expect(readFrameMessage({ t: 'nonsense' })).toBeNull()
    expect(readFrameMessage({ t: 'control', name: '', down: true })).toBeNull()
    expect(readFrameMessage({ t: 'emit', name: 'x'.repeat(65) })).toBeNull()
  })

  test('a send over the byte cap is dropped whole', () => {
    const fat = { t: 'send', data: 'x'.repeat(MAX_SEND_BYTES + 1) }
    expect(readFrameMessage(fat)).toBeNull()
    const fine = { t: 'send', data: { score: 3 } }
    expect(readFrameMessage(fine)).toEqual({ t: 'send', data: { score: 3 } })
  })

  test('a state packet over its own cap is dropped whole', () => {
    expect(readFrameMessage({ t: 'state', state: 'x'.repeat(MAX_STATE_BYTES + 1) })).toBeNull()
    expect(readFrameMessage({ t: 'state', state: { a: { x: 1 } } })).not.toBeNull()
  })

  test('a circular payload cannot travel', () => {
    const loop: Record<string, unknown> = {}
    loop.me = loop
    expect(readFrameMessage({ t: 'send', data: loop })).toBeNull()
  })

  test('a wire control edge is read as narrowly', () => {
    expect(readWireControl({ name: 'boost', down: false })).toEqual({ name: 'boost', down: false })
    expect(readWireControl({ name: 42, down: true })).toBeNull()
  })

  test('log lines are cut to size, not refused', () => {
    const read = readFrameMessage({ t: 'log', level: 'log', line: 'y'.repeat(5000) })
    expect(read?.t === 'log' && read.line.length).toBeLessThanOrEqual(400)
  })
})

describe('the SDK speaks the whole protocol', () => {
  /** As close to a shared type as a string can get: every message type the
   * protocol names appears in the SDK's source. */
  test.each([
    ['roster'],
    ['key'],
    ['control'],
    ['peer'],
    ['peer-state'],
    ['flow'],
    ['ready'],
    ['send'],
    ['state'],
    ['emit'],
    ['log'],
    ['trouble'],
    ['stick'],
  ])('mentions %s', (type) => {
    expect(SKETCH_SDK).toContain(`'${type}'`)
  })
})

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
