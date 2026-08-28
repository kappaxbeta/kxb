import { describe, expect, test } from 'bun:test'
import {
  createCollector,
  fpsOf,
  percentile,
  perfEvent,
  PING_TIMEOUT_MS,
} from '@/app/world/perf/collector'

describe('percentile', () => {
  test('is null for nothing rather than zero', () => {
    // The distinction the whole hidden-tab story rests on: 0ms is a perfect
    // frame, and "no frames" is a tab nobody is looking at.
    expect(percentile([], 50)).toBeNull()
    expect(percentile([], 95)).toBeNull()
  })

  test('nearest rank, not interpolation', () => {
    const values = [10, 20, 30, 40]
    expect(percentile(values, 50)).toBe(20)
    expect(percentile(values, 95)).toBe(40)
    expect(percentile(values, 100)).toBe(40)
  })

  test('does not reorder the caller', () => {
    // The frame ring is reused, and sorting it in place would scramble the
    // "drop the oldest" rule the next window depends on.
    const values = [3, 1, 2]
    percentile(values, 50)
    expect(values).toEqual([3, 1, 2])
  })

  test('separates a steady room from one that hitches', () => {
    // The claim the column exists for. Both of these average ~20ms.
    const steady: number[] = Array.from({ length: 100 }, () => 20)
    const hitchy: number[] = Array.from({ length: 100 }, (_, i) =>
      i % 10 === 0 ? 56 : 16,
    )

    const steadyMean = steady.reduce((a, b) => a + b) / steady.length
    const hitchyMean = hitchy.reduce((a, b) => a + b) / hitchy.length
    expect(Math.abs(steadyMean - hitchyMean)).toBeLessThan(1)

    expect(percentile(steady, 95)).toBe(20)
    expect(percentile(hitchy, 95)).toBe(56)
  })
})

describe('perfEvent', () => {
  test('folds anything unrecognised onto `other`', () => {
    expect(perfEvent('move')).toBe('move')
    expect(perfEvent('chat')).toBe('chat')
    expect(perfEvent('ball-reset')).toBe('other')
    expect(perfEvent('')).toBe('other')
  })
})

describe('counting', () => {
  test('sent and received are tallied by event and drained on close', () => {
    const collector = createCollector()
    collector.noteSent('move')
    collector.noteSent('move')
    collector.noteSent('emote')
    collector.noteReceived('move', 100)
    collector.noteReceived('ball', 120)

    const first = collector.close(1000)
    expect(first.sent).toEqual({ move: 2, emote: 1 })
    expect(first.received).toEqual({ move: 1, ball: 1 })
    expect(first.windowMs).toBe(1000)

    // Drained, so the next window is not the running total of the session.
    const second = collector.close(2000)
    expect(second.sent).toEqual({})
    expect(second.received).toEqual({})
    expect(second.windowMs).toBe(1000)
  })

  test('peers is the high-water mark, and resets per window', () => {
    const collector = createCollector()
    collector.notePeers(2)
    collector.notePeers(7)
    collector.notePeers(3)
    expect(collector.close(1000).peers).toBe(7)
    collector.notePeers(1)
    expect(collector.close(2000).peers).toBe(1)
  })

  test('quiet is null until something arrives', () => {
    const collector = createCollector()
    expect(collector.close(1000).quietMs).toBeNull()
    collector.noteReceived('move', 1500)
    expect(collector.close(2000).quietMs).toBe(500)
  })
})

describe('the channel', () => {
  test('the first subscribe is arriving; the rest are reconnects', () => {
    const collector = createCollector()
    collector.noteChannel('subscribed')
    expect(collector.close(1000).reconnects).toBe(0)

    collector.noteChannel('errored')
    collector.noteChannel('subscribed')
    const second = collector.close(2000)
    expect(second.reconnects).toBe(1)
    expect(second.channelState).toBe('subscribed')
  })

  test('reconnects and the REST fallback survive a window boundary', () => {
    // Both are facts about the session, not about fifteen seconds of it. A
    // client that reconnected twice has not recovered because time passed.
    const collector = createCollector()
    collector.noteChannel('subscribed')
    collector.noteChannel('subscribed')
    collector.noteRestFallback()
    expect(collector.close(1000).restFallback).toBe(true)

    const second = collector.close(2000)
    expect(second.reconnects).toBe(1)
    expect(second.restFallback).toBe(true)
  })
})

describe('round trips', () => {
  test('matches an echo to its own nonce and reports elapsed time', () => {
    const collector = createCollector()
    collector.notePing('aaa', 100)
    collector.notePing('bbb', 200)
    expect(collector.noteEcho('aaa', 180)).toBe(true)
    expect(collector.noteEcho('bbb', 260)).toBe(true)

    const window = collector.close(1000)
    expect(window.rttSamples).toBe(2)
    expect(window.rttLost).toBe(0)
    expect(window.rttP50Ms).toBe(60)
    expect(window.rttP95Ms).toBe(80)
  })

  test('an echo we are not waiting on is ignored, not counted', () => {
    const collector = createCollector()
    // Somebody else's ping, fanned out to everyone on the channel.
    expect(collector.noteEcho('not-ours', 100)).toBe(false)
    expect(collector.close(1000).rttSamples).toBe(0)
  })

  test('a ping is not counted twice by its own echo arriving twice', () => {
    const collector = createCollector()
    collector.notePing('aaa', 100)
    expect(collector.noteEcho('aaa', 150)).toBe(true)
    expect(collector.noteEcho('aaa', 160)).toBe(false)
    expect(collector.close(1000).rttSamples).toBe(1)
  })

  test('a ping is given the full timeout before it is written off', () => {
    const collector = createCollector()
    collector.notePing('aaa', 100)
    collector.expirePings(100 + PING_TIMEOUT_MS - 1)
    expect(collector.close(1000).rttLost).toBe(0)
  })

  test('an unanswered ping becomes a loss, not a very slow round trip', () => {
    const collector = createCollector()
    collector.notePing('aaa', 100)
    collector.expirePings(100 + PING_TIMEOUT_MS)

    const window = collector.close(6000)
    expect(window.rttLost).toBe(1)
    // And it did not drag the percentile up with a number that is not a
    // latency - a five second "round trip" is a packet that never came.
    expect(window.rttP95Ms).toBeNull()
  })

  test('losses are per window, so a bad minute does not follow a good one', () => {
    const collector = createCollector()
    collector.notePing('aaa', 100)
    collector.expirePings(100 + PING_TIMEOUT_MS)
    expect(collector.close(6000).rttLost).toBe(1)
    expect(collector.close(12_000).rttLost).toBe(0)
  })

  test('a ping sent near the boundary is still matched in the next window', () => {
    // The reason `pending` is not cleared on close. Clearing it would count
    // every window boundary as a lost packet on a perfectly good link.
    const collector = createCollector()
    collector.notePing('aaa', 990)
    expect(collector.close(1000).rttSamples).toBe(0)
    expect(collector.noteEcho('aaa', 1040)).toBe(true)
    expect(collector.close(2000).rttP50Ms).toBe(50)
  })
})

describe('a hidden tab', () => {
  test('is a labelled gap and never a zero frame rate', () => {
    const collector = createCollector()
    collector.noteFrame(16)
    collector.noteHidden(true, 200)
    collector.noteHidden(false, 800)
    collector.noteFrame(16)

    const window = collector.close(1000)
    expect(window.hiddenMs).toBe(600)
    expect(window.frames).toBe(2)
  })

  test('still hidden at the close banks the time and keeps counting', () => {
    const collector = createCollector()
    collector.noteHidden(true, 500)

    const first = collector.close(1000)
    expect(first.hiddenMs).toBe(500)
    expect(first.frames).toBe(0)
    // Nothing drew, so there is no percentile to report - and reporting 0 here
    // is the bug the whole column exists to avoid.
    expect(first.frameP50Ms).toBeNull()
    expect(fpsOf(first)).toBeNull()

    const second = collector.close(2000)
    expect(second.hiddenMs).toBe(1000)
  })

  test('the catch-up frame after a background is not the p95', () => {
    // A tab returning from the background hands the loop one enormous delta for
    // the time it was away. It is not a frame anybody waited for.
    const collector = createCollector()
    for (let i = 0; i < 20; i++) collector.noteFrame(16)
    collector.noteFrame(45_000)

    const window = collector.close(1000)
    expect(window.frames).toBe(20)
    expect(window.frameP95Ms).toBe(16)
  })
})

describe('fpsOf', () => {
  test('reads the frames that were drawn, not the wall clock', () => {
    // A tab hidden for half the window drew half as many frames. Dividing by
    // the whole window would report 30fps for a room running perfectly.
    expect(fpsOf({ frames: 450, frameP50Ms: 16.7 })).toBeCloseTo(59.9, 1)
    expect(fpsOf({ frames: 0, frameP50Ms: null })).toBeNull()
  })
})

describe('the frame ring', () => {
  test('a window far longer than the ring keeps its newest frames', () => {
    const collector = createCollector()
    // A slow stretch, then a full ring's worth of fast frames. Everything from
    // the slow stretch has been pushed out, so the percentiles describe the end
    // of the window - which is the part somebody watching is asking about.
    for (let i = 0; i < 4096; i++) collector.noteFrame(100)
    for (let i = 0; i < 4096; i++) collector.noteFrame(10)

    const window = collector.close(90_000)
    // The count is of every frame drawn, not of what the ring kept.
    expect(window.frames).toBe(8192)
    expect(window.frameP50Ms).toBe(10)
    expect(window.frameP95Ms).toBe(10)
  })
})
