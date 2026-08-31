import { describe, expect, test } from 'bun:test'
import { capFor, type RoomOccupancy, roomWithSpace } from '@/domain/rooms/capacity'
import type { RoomView } from '@/domain/rooms/queries'

function room(id: string, cap: number | null = null): RoomView {
  return {
    roomId: id,
    tenantId: 'tenant',
    name: id,
    slug: id,
    visibility: 'open',
    mode: 'creative',
    cap,
    guestBuild: true,
    // Capacity is the same question for a level as for a lounge room: how many
    // heads fit. Nothing here reads it, and it is present so the fixture is a
    // whole RoomView rather than a cast.
    xpRef: null,
    roundStartedAt: null,
    // How a room is listed and drawn - none of which capacity has an opinion
    // about, and all of which a whole `RoomView` carries.
    adminPinnedAt: null,
    group: null,
    icon: null,
    tint: null,
    createdAt: '2026-08-04T00:00:00.000Z',
  }
}

function at(entries: Array<[string, number, number | null]>): Record<string, RoomOccupancy> {
  const out: Record<string, RoomOccupancy> = {}
  for (const [id, count, cap] of entries) {
    out[id] = { roomId: id, count, cap, full: cap !== null && count >= cap }
  }
  return out
}

const anEvent = { roomCap: 10 } as never

describe('whose cap wins', () => {
  test("the room's own answer beats the event's", () => {
    expect(capFor(room('a', 6), anEvent)).toBe(6)
  })

  test("a room with no opinion takes the event's", () => {
    expect(capFor(room('a', null), anEvent)).toBe(10)
  })

  /**
   * The answer for every room in every space that is not an event, which is
   * every room that exists today. Null has to mean "no cap" rather than
   * "unknown", or the door would start refusing people in ordinary workspaces.
   */
  test('a room in an ordinary space has no cap at all', () => {
    expect(capFor(room('a', null), null)).toBeNull()
  })

  /** Zero is not a number a cap can be, but a room's own zero must not read as absent. */
  test('a room cap of nothing is still the room speaking', () => {
    expect(capFor(room('a', 0), anEvent)).toBe(0)
  })
})

describe('where a turned-away arrival goes', () => {
  const rooms = [room('a'), room('b'), room('c')]

  /**
   * The emptiest, not the first. Cost is quadratic in a room's population, so
   * spreading arrivals is what keeps an eighty-person event inside its Realtime
   * budget - filling rooms one at a time would be cheaper to write and far more
   * expensive to run.
   */
  test('picks the emptiest room with space', () => {
    const occupancy = at([
      ['a', 10, 10],
      ['b', 7, 10],
      ['c', 2, 10],
    ])

    expect(roomWithSpace(rooms, occupancy, 'a')?.roomId).toBe('c')
  })

  test('never sends somebody back to the room they were refused from', () => {
    const occupancy = at([
      ['a', 0, 10],
      ['b', 9, 10],
      ['c', 10, 10],
    ])

    expect(roomWithSpace(rooms, occupancy, 'a')?.roomId).toBe('b')
  })

  test('answers null when every other room is full', () => {
    const occupancy = at([
      ['a', 10, 10],
      ['b', 10, 10],
      ['c', 10, 10],
    ])

    expect(roomWithSpace(rooms, occupancy, 'a')).toBeNull()
  })

  /**
   * A room the occupancy query knows nothing about counts as empty, which is
   * the same direction `roomOccupancy` fails in: a broken count lets people in
   * rather than sealing the venue.
   */
  test('a room with no occupancy entry is treated as empty', () => {
    expect(roomWithSpace(rooms, at([['a', 10, 10]]), 'a')?.roomId).toBe('b')
  })

  test('reads a Map as happily as an object', () => {
    const map = new Map(Object.entries(at([['b', 4, 10]])))
    expect(roomWithSpace(rooms, map, 'a')?.roomId).toBe('c')
  })
})
