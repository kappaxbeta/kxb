import { describe, expect, test } from 'bun:test'
import {
  groupNames,
  groupRooms,
  LOOSE_SHOWN,
  orderPlaces,
  type RoomMarks,
} from '@/domain/rooms/places'
import type { RoomView } from '@/domain/rooms/queries'

/**
 * The Places band's ordering.
 *
 * Worth a test file of its own for the reason the module's header gives: it is
 * the only part of the band anybody will ever argue about, and every argument
 * has the shape "should a room that is *both* X and Y be here or there". Those
 * are the cases below.
 */

function room(id: string, extra: Partial<RoomView> = {}): RoomView {
  return {
    roomId: id,
    tenantId: 'tenant',
    name: id,
    slug: id,
    visibility: 'open',
    mode: 'creative',
    cap: null,
    guestBuild: true,
    xpRef: null,
    roundStartedAt: null,
    adminPinnedAt: null,
    group: null,
    icon: null,
    tint: null,
    // Distinct per room and ascending with the id, so "creation order" and
    // "the order they are written in the fixture" are the same thing.
    createdAt: `2026-08-0${id.length}T00:00:0${id.charCodeAt(0) % 10}.000Z`,
    ...extra,
  }
}

/** Names, in the order the band would draw them. */
function names(rooms: RoomView[]): string[] {
  return rooms.map((one) => one.name)
}

describe('orderPlaces', () => {
  test('with no marks and no arrangement, it is the order they were opened', () => {
    const rooms = [room('a'), room('b'), room('c')]

    const places = orderPlaces(rooms)

    expect(places.pinned).toEqual([])
    expect(places.groups).toEqual([])
    expect(names(places.loose)).toEqual(['a', 'b', 'c'])
    expect(places.overflow).toBe(0)
  })

  test('the room you were in last leads the loose band', () => {
    const rooms = [room('a'), room('b'), room('c')]
    const marks: RoomMarks = {
      a: { pinnedAt: null, seenAt: '2026-08-01T09:00:00.000Z' },
      c: { pinnedAt: null, seenAt: '2026-08-01T11:00:00.000Z' },
    }

    // c was visited most recently, then a; b has never been visited and so
    // sorts after both rather than by its creation date.
    expect(names(orderPlaces(rooms, marks).loose)).toEqual(['c', 'a', 'b'])
  })

  test("the space's pins lead, and your own follow them", () => {
    const rooms = [
      room('mine'),
      room('theirs', { adminPinnedAt: '2026-08-02T00:00:00.000Z' }),
      room('loose'),
    ]
    const marks: RoomMarks = {
      // Pinned later than the space's, and still second: the two are different
      // kinds of claim and a personal pin must not outrank an instruction.
      mine: { pinnedAt: '2026-08-09T00:00:00.000Z', seenAt: null },
    }

    const places = orderPlaces(rooms, marks)

    expect(places.pinned.map((entry) => [entry.room.name, entry.byAdmin])).toEqual([
      ['theirs', true],
      ['mine', false],
    ])
    expect(names(places.loose)).toEqual(['loose'])
  })

  test('a room pinned by both is the space\'s, and appears once', () => {
    const rooms = [room('both', { adminPinnedAt: '2026-08-02T00:00:00.000Z' })]
    const marks: RoomMarks = { both: { pinnedAt: '2026-08-03T00:00:00.000Z', seenAt: null } }

    const places = orderPlaces(rooms, marks)

    expect(places.pinned).toHaveLength(1)
    // `byAdmin` is what decides whether the row offers a control to take the
    // pin off, so the stronger of the two claims has to win here.
    expect(places.pinned[0]?.byAdmin).toBe(true)
  })

  test('pins keep the order they were pinned in, not the order you visit them', () => {
    const rooms = [
      room('first', { adminPinnedAt: '2026-08-01T00:00:00.000Z' }),
      room('second', { adminPinnedAt: '2026-08-05T00:00:00.000Z' }),
    ]
    // `second` was just visited, and stays second. A pinned band that moved
    // under somebody would be ignoring the instruction that put it there.
    const marks: RoomMarks = { second: { pinnedAt: null, seenAt: '2026-09-01T00:00:00.000Z' } }

    expect(orderPlaces(rooms, marks).pinned.map((entry) => entry.room.name)).toEqual([
      'first',
      'second',
    ])
  })

  test('a pinned room leaves its group', () => {
    const rooms = [
      room('a', { group: 'Design' }),
      room('b', { group: 'Design', adminPinnedAt: '2026-08-02T00:00:00.000Z' }),
    ]

    const places = orderPlaces(rooms)

    expect(places.pinned.map((entry) => entry.room.name)).toEqual(['b'])
    // One row per room, always. A room drawn under its caption *and* at the top
    // would be two rows that navigate to the same place.
    expect(places.groups).toHaveLength(1)
    expect(names(places.groups[0]!.rooms)).toEqual(['a'])
  })

  test('groups are ordered by their oldest room, and their rooms by recency', () => {
    const rooms = [
      room('a', { group: 'Design', createdAt: '2026-08-01T00:00:00.000Z' }),
      room('b', { group: 'Games', createdAt: '2026-08-02T00:00:00.000Z' }),
      room('c', { group: 'Design', createdAt: '2026-08-03T00:00:00.000Z' }),
    ]
    const marks: RoomMarks = { c: { pinnedAt: null, seenAt: '2026-09-01T00:00:00.000Z' } }

    const places = orderPlaces(rooms, marks)

    // Design first because `a` is the oldest room in either group - visiting
    // `c` moves it inside its group and does not move the group itself.
    expect(places.groups.map((group) => group.name)).toEqual(['Design', 'Games'])
    expect(names(places.groups[0]!.rooms)).toEqual(['c', 'a'])
  })

  test('only the loose band is cut, and the remainder is counted', () => {
    const rooms = [
      ...Array.from({ length: LOOSE_SHOWN + 3 }, (_, index) => room(`loose${index}`)),
      room('grouped', { group: 'Design' }),
      room('pinned', { adminPinnedAt: '2026-08-02T00:00:00.000Z' }),
    ]

    const places = orderPlaces(rooms)

    expect(places.loose).toHaveLength(LOOSE_SHOWN)
    expect(places.overflow).toBe(3)
    // Neither of the two arranged rooms counts towards the cap or against it:
    // somebody put them where they are on purpose.
    expect(places.pinned).toHaveLength(1)
    expect(places.groups[0]!.rooms).toHaveLength(1)
  })

  test('a mark for a room that is gone changes nothing', () => {
    const rooms = [room('a')]
    const marks: RoomMarks = {
      closed: { pinnedAt: '2026-08-02T00:00:00.000Z', seenAt: '2026-08-02T00:00:00.000Z' },
    }

    // The table has no foreign key to the read model - see the migration - so
    // marks outlive the rooms they were about, and the list is what decides.
    expect(orderPlaces(rooms, marks).pinned).toEqual([])
    expect(names(orderPlaces(rooms, marks).loose)).toEqual(['a'])
  })
})

describe('groupNames', () => {
  test('every caption in use, once each, in group order', () => {
    const rooms = [
      room('a', { group: 'Design' }),
      room('b'),
      room('c', { group: 'Games' }),
      room('d', { group: 'Design' }),
    ]

    expect(groupNames(rooms)).toEqual(['Design', 'Games'])
  })
})

describe('groupRooms', () => {
  test('every room once, under its caption, in the space own order', () => {
    const rooms = [
      room('a', { group: 'Design' }),
      room('b'),
      room('c', { group: 'Games' }),
      room('d', { group: 'Design' }),
      room('e'),
    ]

    expect(groupRooms(rooms)).toEqual([
      { name: 'Design', rooms: [rooms[0], rooms[3]] },
      { name: 'Games', rooms: [rooms[2]] },
      { name: null, rooms: [rooms[1], rooms[4]] },
    ])
  })

  test('no captions at all is one band with none', () => {
    const rooms = [room('a'), room('b')]
    expect(groupRooms(rooms)).toEqual([{ name: null, rooms }])
  })

  test('every room in a group leaves no loose band to draw', () => {
    const rooms = [room('a', { group: 'Design' }), room('b', { group: 'Design' })]
    expect(groupRooms(rooms)).toEqual([{ name: 'Design', rooms }])
  })

  test('nothing at all is nothing, not an empty caption', () => {
    expect(groupRooms([])).toEqual([])
  })
})
