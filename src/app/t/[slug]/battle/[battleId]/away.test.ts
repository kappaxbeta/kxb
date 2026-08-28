import { describe, expect, test } from 'bun:test'
import {
  cameBack,
  SETTLE_MS,
  WAIT_MS,
  whoIsAway,
  type Rostered,
} from '@/app/t/[slug]/battle/[battleId]/away'

const ME = 'me'
const ANA = 'ana'
const BO = 'bo'

const NOW = 1_760_000_000_000

const ROSTER: Rostered[] = [
  { userId: ME, name: 'You' },
  { userId: ANA, name: 'Ana' },
  { userId: BO, name: 'Bo' },
]

function away(over: {
  present?: string[]
  seen?: Record<string, number>
  roster?: Rostered[]
  now?: number
}) {
  return whoIsAway({
    roster: over.roster ?? ROSTER,
    present: over.present ?? [ME, ANA, BO],
    seen: over.seen ?? { [ME]: NOW, [ANA]: NOW, [BO]: NOW },
    me: ME,
    now: over.now ?? NOW,
  })
}

describe('who the room is waiting for', () => {
  test('nobody, while everybody is on the socket', () => {
    expect(away({})).toBeNull()
  })

  test('a gap shorter than the settle is a blink, not a departure', () => {
    expect(
      away({
        present: [ME, BO],
        seen: { [ANA]: NOW - SETTLE_MS + 500 },
        now: NOW,
      }),
    ).toBeNull()
  })

  test('and one longer than it is somebody who has gone', () => {
    const view = away({
      present: [ME, BO],
      seen: { [ANA]: NOW - 10_000 },
    })

    expect(view?.gone).toEqual([{ userId: ANA, name: 'Ana', seconds: 10 }])
    expect(view?.overdue).toBe(false)
    expect(view?.left).toBe(WAIT_MS / 1000 - 10)
  })

  /**
   * The panel is for the people still playing. Telling somebody that they
   * themselves have left would be the socket describing its own failure.
   */
  test('never yourself, whatever presence says', () => {
    expect(away({ present: [], seen: { [ME]: NOW - 60_000 } })).toBeNull()
  })

  test('never somebody who never turned up', () => {
    // No entry in `seen`: they took a seat in the lobby and never loaded.
    expect(away({ present: [ME, BO], seen: {} })).toBeNull()
  })

  test('never somebody who is already out', () => {
    expect(
      away({
        roster: [
          { userId: ME, name: 'You' },
          { userId: ANA, name: 'Ana', defeated: true },
        ],
        present: [ME],
        seen: { [ANA]: NOW - 60_000 },
      }),
    ).toBeNull()
  })

  test('longest gone first, and the wait belongs to them', () => {
    const view = away({
      present: [ME],
      seen: { [ANA]: NOW - 8_000, [BO]: NOW - 30_000 },
    })

    expect(view?.gone.map((one) => one.userId)).toEqual([BO, ANA])
    expect(view?.left).toBe(WAIT_MS / 1000 - 30)
  })

  /** A second person dropping must not restart the clock on the first. */
  test('the wait runs out, and does not start again', () => {
    const view = away({
      present: [ME],
      seen: { [ANA]: NOW - WAIT_MS - 5_000, [BO]: NOW - 6_000 },
    })

    expect(view?.left).toBe(0)
    expect(view?.overdue).toBe(true)
  })

  test('somebody back on the socket is not waited for, however long they were gone', () => {
    expect(away({ present: [ME, ANA, BO], seen: { [ANA]: NOW - 60_000 } })).toBeNull()
  })
})

describe('coming back', () => {
  test('is whoever was on the list and is not on it now', () => {
    expect(cameBack([ANA, BO], [{ userId: BO, name: 'Bo', seconds: 9 }])).toEqual([ANA])
  })

  test('is nobody when nothing has changed', () => {
    expect(cameBack([ANA], [{ userId: ANA, name: 'Ana', seconds: 20 }])).toEqual([])
  })

  test('is nobody when there was nobody', () => {
    expect(cameBack([], [])).toEqual([])
  })
})
