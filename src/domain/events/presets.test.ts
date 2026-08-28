import { describe, expect, test } from 'bun:test'
import {
  budgetVerdict,
  DEFAULT_PRESET,
  EVENT_CAPABILITIES,
  EVENT_PRESETS,
  EVENT_SURFACES,
  findPreset,
  realtimeWorstCase,
  SEND_HZ,
} from '@/domain/events/presets'

/**
 * The cost model is the reason room caps exist, so it is worth pinning to the
 * numbers that were actually measured rather than to itself. Every expectation
 * below is a row from the table in performancestudy/coalescing-design.md, at
 * `SEND_HZ = 8` with everybody moving.
 *
 * If someone changes SEND_HZ, these fail - which is correct. That constant is
 * the one input to every capacity decision in the product, and changing it
 * silently is how a room cap that was right becomes a room cap that drops
 * frames for the whole space.
 */
describe('the Realtime cost of a room', () => {
  test('agrees with the measured table at 8 Hz', () => {
    expect(SEND_HZ).toBe(8)
    expect(realtimeWorstCase(1, 10)).toBe(720)
    expect(realtimeWorstCase(1, 16)).toBe(1_920)
    expect(realtimeWorstCase(1, 25)).toBe(4_800)
    expect(realtimeWorstCase(1, 30)).toBe(6_960)
  })

  /**
   * The whole reason an event is many small rooms rather than one big one:
   * doubling the rooms doubles the cost, doubling a room's population roughly
   * quadruples it.
   */
  test('is linear in rooms and quadratic in room size', () => {
    expect(realtimeWorstCase(2, 10)).toBe(2 * realtimeWorstCase(1, 10))

    const small = realtimeWorstCase(1, 10)
    const double = realtimeWorstCase(1, 20)
    expect(double).toBeGreaterThan(3.5 * small)
    expect(double).toBeLessThan(4.5 * small)
  })

  test('eighty people in one room is off the scale, and split across rooms is not', () => {
    expect(realtimeWorstCase(1, 80)).toBe(50_560)
    expect(realtimeWorstCase(8, 10)).toBe(5_760)
    expect(realtimeWorstCase(12, 7)).toBe(4_032)
  })

  /** A room of one has nobody to broadcast to, and a room of none is not a room. */
  test('degenerate rooms cost nothing rather than throwing', () => {
    expect(realtimeWorstCase(1, 1)).toBe(0)
    expect(realtimeWorstCase(0, 10)).toBe(0)
  })
})

describe('the budget warning', () => {
  test('flags a configuration that would drop frames for the whole space', () => {
    expect(budgetVerdict(12, 16, 20_000).over).toBe(true)
    expect(budgetVerdict(8, 10, 20_000).over).toBe(false)
  })

  /**
   * The default budget is kxb.team's, and an event box is provisioned higher -
   * so the same configuration can be fine there and over here. The verdict
   * takes the budget as an argument for exactly that reason.
   */
  test('the same rooms can be over budget on one box and inside it on another', () => {
    expect(budgetVerdict(8, 10, 5_000).over).toBe(true)
    expect(budgetVerdict(8, 10, 20_000).over).toBe(false)
  })
})

describe('the presets', () => {
  test('every preset names a capability and surface vocabulary that exists', () => {
    for (const preset of EVENT_PRESETS) {
      for (const capability of preset.guestWrites) {
        expect(EVENT_CAPABILITIES).toContain(capability)
      }
      for (const surface of preset.surfaces) {
        expect(EVENT_SURFACES).toContain(surface)
      }
    }
  })

  /**
   * A guest who may write somewhere they cannot reach is a checkbox that does
   * nothing, and it is the mistake these two lists invite. The reverse is fine
   * and expected - a conference can read the pinboard without posting on it.
   */
  test('nothing is writable on a surface guests cannot reach', () => {
    const surfaceFor: Partial<Record<string, string>> = {
      build: 'lounge',
      rooms: 'rooms',
      board: 'board',
      tasks: 'tasks',
      pages: 'pages',
    }

    for (const preset of EVENT_PRESETS) {
      for (const capability of preset.guestWrites) {
        const needed = surfaceFor[capability]
        if (!needed) continue
        expect(preset.surfaces).toContain(needed as never)
      }
    }
  })

  test('every preset fits its own room settings inside a raised budget', () => {
    for (const preset of EVENT_PRESETS) {
      expect(budgetVerdict(preset.roomMax, preset.roomCap, 20_000).over).toBe(false)
    }
  })

  test('the default preset exists', () => {
    expect(findPreset(DEFAULT_PRESET)).not.toBeNull()
    expect(findPreset('not-a-preset')).toBeNull()
  })
})
