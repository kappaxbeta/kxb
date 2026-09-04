import { describe, expect, test } from 'bun:test'
import { MAX_SEND_BYTES, MAX_STATE_BYTES, readFrameMessage, readWireControl } from './protocol'

/**
 * The protocol reader, tested at its seam: what a hostile frame can make the
 * stage do.
 *
 * Moved from `src/app/xp/_sketch/sketch.test.ts` alongside `./protocol.ts` -
 * see that file's header for why the module lives in the package now.
 */

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
