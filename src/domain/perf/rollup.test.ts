import { describe, expect, test } from 'bun:test'
import {
  ceilingShare,
  eventRates,
  oneWayGuess,
  projectedDeliveredHz,
  rollUpClient,
  rollUpRoom,
  TENANT_EVENT_CEILING,
  type PerfSample,
} from '@/domain/perf/rollup'

function sample(overrides: Partial<PerfSample> = {}): PerfSample {
  return {
    sampledAt: '2026-08-18T10:00:00.000Z',
    tenantId: 't',
    topic: 'lounge:t',
    roomKind: 'lounge',
    userId: 'u1',
    conn: 'c1',
    windowMs: 15_000,
    channelState: 'subscribed',
    reconnects: 0,
    quietMs: 120,
    restFallback: false,
    sent: {},
    received: {},
    sentTotal: 0,
    recvTotal: 0,
    peers: 0,
    frames: 900,
    frameP50Ms: 16,
    frameP95Ms: 20,
    hiddenMs: 0,
    rttSamples: 5,
    rttLost: 0,
    rttP50Ms: 40,
    rttP95Ms: 60,
    linkJitterMs: 3,
    linkDelayMs: 250,
    ...overrides,
  }
}

describe('one client', () => {
  test('a rate is the mean of the windows, not the total over the period', () => {
    // The case that decides it: this client joined for the second window only.
    // Dividing 120 packets by the whole period would halve its rate and report
    // a client sending 8Hz as if it were sending 4.
    const client = rollUpClient([
      sample({ sampledAt: '2026-08-18T10:00:15.000Z', sentTotal: 120 }),
    ])
    expect(client.sentHz).toBeCloseTo(8, 3)
  })

  test('the channel state is the newest window, not the worst one seen', () => {
    // A client that errored ten minutes ago and has been fine since is not a
    // problem now, and a page that kept saying so would be ignored.
    const client = rollUpClient([
      sample({ sampledAt: '2026-08-18T10:00:00.000Z', channelState: 'errored' }),
      sample({ sampledAt: '2026-08-18T10:00:15.000Z', channelState: 'subscribed' }),
    ])
    expect(client.channelState).toBe('subscribed')
  })

  test('a REST fallback anywhere in the period is still reported', () => {
    // The opposite rule to the state above, and deliberately: the fallback
    // explains a stretch of the room that already happened.
    const client = rollUpClient([
      sample({ sampledAt: '2026-08-18T10:00:00.000Z', restFallback: true }),
      sample({ sampledAt: '2026-08-18T10:00:15.000Z', restFallback: false }),
    ])
    expect(client.restFallback).toBe(true)
  })

  test('p95 is the worst real window, never the mean of two percentiles', () => {
    const client = rollUpClient([
      sample({ sampledAt: '2026-08-18T10:00:00.000Z', frameP95Ms: 90, frameP50Ms: 33 }),
      sample({ sampledAt: '2026-08-18T10:00:15.000Z', frameP95Ms: 18, frameP50Ms: 16 }),
    ])
    // Not 54, which is the average of two p95s and a statistic of nothing.
    expect(client.worstFrameP95Ms).toBe(90)
    // p50 is the most recent, because that is how the room feels right now.
    expect(client.frameP50Ms).toBe(16)
    expect(client.fps).toBeCloseTo(62.5, 1)
  })

  test('frames per second comes off the median, so a hidden tab is not halved', () => {
    const client = rollUpClient([
      sample({ frames: 450, hiddenMs: 7500, frameP50Ms: 16.7 }),
    ])
    expect(client.fps).toBeCloseTo(59.9, 1)
    expect(client.hiddenShare).toBeCloseTo(0.5, 3)
  })

  test('a window that drew nothing has no frame rate at all', () => {
    const client = rollUpClient([
      sample({ frames: 0, frameP50Ms: null, frameP95Ms: null, hiddenMs: 15_000 }),
    ])
    // Null, not zero. Zero reads as a room that died; this is a minimised tab.
    expect(client.fps).toBeNull()
    expect(client.hiddenShare).toBe(1)
  })

  test('p50 skips a window that measured nothing, and stays latest otherwise', () => {
    // A window can legitimately have neither: nobody to ping, or a hidden tab.
    // Taking the newest row regardless put a dash in the headline next to a p95
    // of 58ms, which reads as the page contradicting itself.
    const client = rollUpClient([
      sample({ sampledAt: '2026-08-18T10:00:00.000Z', rttSamples: 4, rttP50Ms: 41, frames: 900, frameP50Ms: 16 }),
      sample({ sampledAt: '2026-08-18T10:00:15.000Z', rttSamples: 3, rttP50Ms: 90, frames: 900, frameP50Ms: 25 }),
      sample({ sampledAt: '2026-08-18T10:00:30.000Z', rttSamples: 0, rttP50Ms: null, frames: 0, frameP50Ms: null }),
    ])
    // The newest window that actually measured, not the newest window.
    expect(client.rttP50Ms).toBe(90)
    expect(client.frameP50Ms).toBe(25)
  })

  test('a client that measured nothing at all still reads as nothing', () => {
    // The fallback must not reach back forever *past* real emptiness - a client
    // alone in a room for ten minutes has no round trip, and inventing one
    // would be worse than the dash.
    const client = rollUpClient([
      sample({ rttSamples: 0, rttP50Ms: null, frames: 0, frameP50Ms: null, hiddenMs: 15_000 }),
    ])
    expect(client.rttP50Ms).toBeNull()
    expect(client.frameP50Ms).toBeNull()
    expect(client.fps).toBeNull()
  })

  test('lost pings are totalled across the period', () => {
    const client = rollUpClient([
      sample({ sampledAt: '2026-08-18T10:00:00.000Z', rttSamples: 4, rttLost: 1 }),
      sample({ sampledAt: '2026-08-18T10:00:15.000Z', rttSamples: 5, rttLost: 2 }),
    ])
    expect(client.rttSamples).toBe(9)
    expect(client.rttLost).toBe(3)
  })
})

describe('a room', () => {
  test('the room rate is the sum across clients, never their average', () => {
    // The whole reason this function exists. Six clients each sending 8Hz is a
    // room making 48 messages a second; averaging would call it 8 and describe
    // a twenty-player room as no busier than a two-player one.
    const samples = Array.from({ length: 6 }, (_, i) =>
      sample({ conn: `c${i}`, userId: `u${i}`, sentTotal: 120, recvTotal: 600, peers: 5 }),
    )
    const room = rollUpRoom(samples)

    expect(room.clients).toHaveLength(6)
    expect(room.sentHz).toBeCloseTo(48, 3)
    // And the fan-out is the bigger number, measured rather than assumed: each
    // of the six took 40Hz off the wire.
    expect(room.deliveredHz).toBeCloseTo(240, 3)
    expect(room.peers).toBe(5)
  })

  test('two tabs of one person are two clients', () => {
    // The ball election already depends on this being true, and two tabs have
    // two frame rates and two sockets.
    const room = rollUpRoom([
      sample({ conn: 'a', userId: 'same', sentTotal: 120 }),
      sample({ conn: 'b', userId: 'same', sentTotal: 120 }),
    ])
    expect(room.clients).toHaveLength(2)
    expect(room.sentHz).toBeCloseTo(16, 3)
  })

  test('an unhealthy client is counted from its latest window', () => {
    const room = rollUpRoom([
      sample({ conn: 'a', channelState: 'subscribed' }),
      sample({ conn: 'b', channelState: 'errored' }),
    ])
    expect(room.unhealthy).toBe(1)
  })
})

describe('per event', () => {
  test('sums each event across clients and drops the ones nobody used', () => {
    const byClient = new Map([
      ['a', [sample({ conn: 'a', sent: { move: 120 }, received: { move: 120, emote: 3 } })]],
      ['b', [sample({ conn: 'b', sent: { move: 120 }, received: { move: 120 } })]],
    ])
    const rates = eventRates(byClient)

    const move = rates.find((rate) => rate.event === 'move')
    expect(move?.sentHz).toBeCloseTo(16, 3)
    expect(move?.deliveredHz).toBeCloseTo(16, 3)

    // A lounge with no ball in it is not a row of zeroes inviting somebody to
    // wonder what happened to football.
    expect(rates.some((rate) => rate.event === 'ball')).toBe(false)

    const emote = rates.find((rate) => rate.event === 'emote')
    expect(emote?.sentHz).toBe(0)
    expect(emote?.deliveredHz).toBeCloseTo(0.2, 3)
  })
})

describe('the honest labels', () => {
  test('one way is exactly half, and null stays null', () => {
    expect(oneWayGuess(84)).toBe(42)
    expect(oneWayGuess(null)).toBeNull()
  })

  test('the ceiling share is against the raised tenant limit', () => {
    expect(TENANT_EVENT_CEILING).toBe(25_000)
    // 500/s against 25 000 is 2%. It read as 10% for as long as this file
    // carried its own copy of the ceiling - see the constant's note.
    expect(ceilingShare(500)).toBeCloseTo(0.02, 6)
  })

  test('the projection is quadratic, which is the point of showing it', () => {
    // A room comfortable at six is at the ceiling at forty without anybody
    // changing anything, and that is invisible in a measurement of today.
    expect(projectedDeliveredHz(8, 6)).toBe(240)
    expect(projectedDeliveredHz(8, 40)).toBe(12_480)
    expect(projectedDeliveredHz(8, 1)).toBe(0)
  })
})
