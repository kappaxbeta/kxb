import { describe, expect, test } from 'bun:test'
import {
  bytes,
  diskStatus,
  duration,
  heapPressure,
  lagStatus,
  loadStatus,
  memoryStatus,
  overall,
  percent,
  windowTotals,
} from '@/domain/health/format'

/**
 * The decisions, not the rendering.
 *
 * Everything tested here is a threshold or a piece of arithmetic that decides
 * what an operator is told - "is this disk a problem", "did the box restart".
 * Those are worth pinning down; the colour of the pill is not.
 */

describe('bytes', () => {
  test('scales to the unit a person would say', () => {
    expect(bytes(512)).toBe('512 B')
    expect(bytes(1536)).toBe('1.5 KB')
    expect(bytes(3 * 1024 ** 3)).toBe('3 GB')
  })

  test('drops the decimal once the number is big enough not to need it', () => {
    expect(bytes(15.4 * 1024 ** 2)).toBe('15 MB')
  })

  test('a missing reading is a dash, not a zero', () => {
    // The distinction the whole page rests on: a replica that did not answer
    // must not render as a replica using no memory.
    expect(bytes(null)).toBe('—')
    expect(bytes(undefined)).toBe('—')
    expect(bytes(Number.NaN)).toBe('—')
  })
})

describe('duration', () => {
  test('picks the largest unit that still says something', () => {
    expect(duration(45)).toBe('45s')
    expect(duration(90)).toBe('1m')
    expect(duration(3600)).toBe('1h')
    expect(duration(86_400 * 2)).toBe('2d')
  })

  test('keeps minutes beside hours, because a fresh deploy is the question', () => {
    expect(duration(7_800)).toBe('2h 10m')
  })

  test('says nothing rather than zero when there is no reading', () => {
    expect(duration(null)).toBe('—')
  })
})

describe('percent', () => {
  test('keeps a tenth where a tenth is the whole signal', () => {
    expect(percent(0.004)).toBe('0.4%')
  })

  test('does not round a small error rate away to nothing', () => {
    // 0.02% of requests failing is not "0%", and rounding it there is how a
    // real problem becomes invisible on a dashboard.
    expect(percent(0.0002)).toBe('<0.1%')
  })

  test('drops the decimal once the number is large', () => {
    expect(percent(0.87)).toBe('87%')
  })
})

describe('diskStatus', () => {
  test('healthy with room to spare', () => {
    expect(diskStatus(50, 100)).toBe('ok')
  })

  test('warns before it is too late to act', () => {
    expect(diskStatus(8, 100)).toBe('slow')
  })

  test('red once there is effectively nothing left', () => {
    expect(diskStatus(3, 100)).toBe('down')
  })

  test('an unmounted volume is unknown, not full', () => {
    expect(diskStatus(null, null)).toBeNull()
    expect(diskStatus(10, 0)).toBeNull()
  })
})

describe('lagStatus', () => {
  test('a few milliseconds is a healthy event loop', () => {
    expect(lagStatus(3)).toBe('ok')
  })

  test('flags the point where requests are queueing behind CPU work', () => {
    expect(lagStatus(120)).toBe('slow')
  })

  test('a quarter second is unresponsive even though it still answers', () => {
    expect(lagStatus(400)).toBe('down')
  })

  test('no reading is not a good reading', () => {
    expect(lagStatus(null)).toBeNull()
  })
})

describe('loadStatus', () => {
  test('is judged per core, so both boxes use one threshold', () => {
    // 4.0 on the 6-core database box is fine; the caller has already divided.
    expect(loadStatus(4 / 6)).toBe('ok')
    // The same 4.0 on the 2-core app box is not.
    expect(loadStatus(4 / 2)).toBe('down')
  })

  test('one runnable process per core is where work starts waiting', () => {
    expect(loadStatus(1.2)).toBe('slow')
  })
})

describe('memoryStatus', () => {
  test('a box with room is fine', () => {
    expect(memoryStatus(0.4)).toBe('ok')
  })

  test('warns while there is still time to do something', () => {
    expect(memoryStatus(0.88)).toBe('slow')
  })

  test('red just before the OOM killer picks for you', () => {
    expect(memoryStatus(0.97)).toBe('down')
  })
})

describe('heapPressure', () => {
  test('is a fraction of the heap, not of the machine', () => {
    expect(heapPressure(50, 100)).toBe(0.5)
  })

  test('refuses to divide by a heap that is not there', () => {
    expect(heapPressure(50, 0)).toBeNull()
    expect(heapPressure(null, 100)).toBeNull()
  })
})

describe('overall', () => {
  test('takes the worst, never the average', () => {
    // The rule the whole page depends on: one dead replica beside three healthy
    // ones is a red morning, not a mostly-green one.
    expect(overall(['ok', 'ok', 'down'])).toBe('down')
    expect(overall(['ok', 'slow'])).toBe('slow')
  })

  test('ignores the things that could not be measured', () => {
    expect(overall(['ok', null, null])).toBe('ok')
  })

  test('nothing measured at all is not an alarm', () => {
    expect(overall([null, null])).toBe('ok')
  })
})

describe('windowTotals', () => {
  test('sums the deltas', () => {
    const totals = windowTotals([
      { requestsDelta: 100, errorsDelta: 1 },
      { requestsDelta: 200, errorsDelta: 2 },
    ])
    expect(totals.requests).toBe(300)
    expect(totals.errors).toBe(3)
    expect(totals.rate).toBeCloseTo(0.01)
  })

  test('skips the gaps rather than counting them as zero', () => {
    // A null is "we did not record this", which is not the same as "nothing
    // happened" - the first sample after a restart is always null.
    const totals = windowTotals([
      { requestsDelta: null, errorsDelta: null },
      { requestsDelta: 50, errorsDelta: 0 },
    ])
    expect(totals.requests).toBe(50)
    expect(totals.errors).toBe(0)
  })

  test('an idle window has no error rate rather than a perfect one', () => {
    const totals = windowTotals([{ requestsDelta: 0, errorsDelta: 0 }])
    expect(totals.rate).toBeNull()
  })
})
