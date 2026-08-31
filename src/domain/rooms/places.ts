import type { RoomView } from '@/domain/rooms/queries'

/**
 * The order the places are read in.
 *
 * Pure, and here rather than in the rail, for the usual two reasons: the rail
 * is a client component that cannot be tested without a DOM, and this is the
 * only part of the Places band anybody will ever argue about. It is a fold over
 * a list and a map, and it has a test file beside it.
 *
 * ---------------------------------------------------------------------------
 * The four things a room can be, in the order they win
 * ---------------------------------------------------------------------------
 *
 *   1. **Pinned by the space.** An owner or admin said this is the room the
 *      space runs on. Everybody sees it at the top, and nobody but an admin can
 *      move it - see `RoomPinSet`.
 *   2. **Pinned by you.** Your own, private, and worth nothing to anybody else -
 *      see `room_marks`. Under the space's pins rather than above them, because
 *      a space that pinned three rooms did it to tell people where to go, and a
 *      personal pin that buried that would be a preference overriding an
 *      instruction.
 *   3. **In a group.** A caption and the rooms under it. An admin's arrangement
 *      of what the space is doing - "Design", "Standups", "Games night".
 *   4. **Loose.** Everything else, and the only band that is cut short.
 *
 * ---------------------------------------------------------------------------
 * Recency, and the thing it costs
 * ---------------------------------------------------------------------------
 * Within every band, the room you were in most recently comes first, and rooms
 * you have never been in follow in the order they were opened.
 *
 * `listRooms` warns against exactly this - "a list that reshuffles whenever
 * somebody opens a new one is a list you have to read every time" - and the
 * warning is right about the thing it was about. This is a different ordering
 * and it does not have that failure: it does not move for anybody else's
 * activity, only for your own, and the rooms somebody uses reach the top and
 * then stay there. What used to move your list was other people; what moves it
 * now is you, one step at a time, in the direction you were already going.
 *
 * One rule for every band rather than a different rule per band. "Pinned first,
 * then your groups, and within any of them the ones you were just in" is a
 * sentence somebody can hold; "creation order inside a group, recency outside
 * it" is a rule nobody would ever be told and would have to infer.
 */

/**
 * One person's private marks on one room.
 *
 * Both halves are nullable and both mean something when null: you have not
 * pinned it, and you have never been in it.
 */
export interface RoomMark {
  /** When you pinned it to the top of your own list, or null. */
  pinnedAt: string | null
  /** When you were last standing in it, or null. */
  seenAt: string | null
}

/** Marks by room id. A room with no row simply has no entry. */
export type RoomMarks = Record<string, RoomMark | undefined>

/**
 * The stamp a pin wears while the server has not confirmed it.
 *
 * The rail pins optimistically - see the overlay in the Places band - and the
 * value it puts in has to behave like the one that is coming. `'9'` sorts after
 * every timestamp this decade (they all begin `2`), which is exactly where the
 * server's own stamp will land it: a pin made now is the newest of your pins,
 * and the band lists the oldest first. So the room moves once, when you click
 * it, and does not move again when the answer arrives.
 *
 * A string rather than `new Date().toISOString()` because it must not be a
 * *plausible* timestamp: nothing may ever write this to the table, and a value
 * that is obviously not a date is the cheapest guarantee of that.
 */
export const PIN_PENDING = '9'

/** A room in the list, and why it is where it is. */
export interface PlacedRoom {
  room: RoomView
  /**
   * Is this pin the space's rather than yours?
   *
   * Drawn differently and, more to the point, *acted on* differently: your own
   * pin has a control beside it and the space's does not, because taking a
   * pinned room off the top for everybody is not a thing a member may do from
   * a rail row. A room that is both is the space's - the stronger of the two,
   * and the one whose control you must not be offered.
   */
  byAdmin: boolean
}

/** A caption, and the rooms listed under it. */
export interface PlaceGroup {
  name: string
  rooms: RoomView[]
}

export interface Places {
  /** Kept at the top: the space's pins first, then your own. */
  pinned: PlacedRoom[]
  /** The admin's arrangement, each with its caption. */
  groups: PlaceGroup[]
  /** Everything else, cut to `limit`. */
  loose: RoomView[]
  /** How many loose rooms did not fit. Zero when they all did. */
  overflow: number
}

/**
 * How many *loose* rooms the rail shows before it stops.
 *
 * Five is about where a list stops being scannable and starts being a second
 * navigation to read - and this column already has the places, the people and
 * the tabs competing for it. The rest are one click away on the rooms page.
 *
 * It bounds the loose band alone, and that is the whole design of the cap.
 * Pinned rooms and grouped rooms are somewhere on purpose: somebody said "this
 * one matters" or "these belong together", and a cap that hid them would be the
 * rail overruling the two controls it just offered. What the cap is for is the
 * pile nobody has sorted, which is the pile that grows without anybody deciding
 * it should - and a space's room count is capped by its tier well before the
 * pinned and grouped bands could run away.
 */
export const LOOSE_SHOWN = 5

/**
 * Sort the rooms into the four bands the rail draws.
 *
 * `marks` may be empty - for a guest, for somebody's first visit, or for any
 * page that has not read them - and the result is then the space's pins, the
 * groups, and everything else in the order it was opened. Nothing here needs a
 * mark to work.
 */
export function orderPlaces(
  rooms: RoomView[],
  marks: RoomMarks = {},
  limit: number = LOOSE_SHOWN,
): Places {
  const recent = byRecency(marks)

  const pinned: PlacedRoom[] = rooms
    .filter((room) => room.adminPinnedAt !== null || marks[room.roomId]?.pinnedAt)
    .map((room) => ({ room, byAdmin: room.adminPinnedAt !== null }))
    .sort((a, b) => {
      // The space's pins above yours, whatever either was pinned at. Two
      // orderings stacked rather than one comparison over a merged timestamp,
      // because the two pins are different kinds of claim and a personal pin
      // made this morning must not sit above an instruction from the space.
      if (a.byAdmin !== b.byAdmin) return a.byAdmin ? -1 : 1
      // Then oldest pin first, so pinning a fourth room does not move the three
      // that were already there. Recency deliberately does *not* apply in this
      // band: a pin is somebody saying where a room should sit, and a list that
      // moved pinned rooms around under them would be ignoring the instruction
      // in the name of guessing.
      const at = a.byAdmin ? a.room.adminPinnedAt : (marks[a.room.roomId]?.pinnedAt ?? null)
      const bt = b.byAdmin ? b.room.adminPinnedAt : (marks[b.room.roomId]?.pinnedAt ?? null)
      return compareTimes(at, bt, 'asc') || a.room.createdAt.localeCompare(b.room.createdAt)
    })

  const pinnedIds = new Set(pinned.map((entry) => entry.room.roomId))
  const rest = rooms.filter((room) => !pinnedIds.has(room.roomId))

  /*
   * The groups, in the order their oldest room was opened.
   *
   * Stable by construction, which is what a caption needs to be: a group does
   * not move because somebody walked into a room in it, and a new group appears
   * at the bottom rather than shuffling the others. Alphabetical was the other
   * candidate and is worse for the same reason it is worse in a file tree -
   * renaming "Design" to "Product" would move the whole band.
   */
  const groups: PlaceGroup[] = []
  const byName = new Map<string, PlaceGroup>()
  for (const room of rest) {
    if (!room.group) continue
    let group = byName.get(room.group)
    if (!group) {
      group = { name: room.group, rooms: [] }
      byName.set(room.group, group)
      groups.push(group)
    }
    group.rooms.push(room)
  }
  for (const group of groups) group.rooms.sort(recent)

  const loose = rest.filter((room) => !room.group).sort(recent)

  return {
    pinned,
    groups,
    loose: loose.slice(0, Math.max(0, limit)),
    overflow: Math.max(0, loose.length - Math.max(0, limit)),
  }
}

/**
 * Most recently visited first, then the ones you have never been in.
 *
 * Never-visited rooms sort *after* every visited one rather than being treated
 * as visited long ago, which is the difference between "the new room is at the
 * bottom" and "the new room is wherever its creation date lands it". Among
 * themselves they keep the order they were opened in, so opening two rooms puts
 * them in the list in the order they were made.
 */
function byRecency(marks: RoomMarks): (a: RoomView, b: RoomView) => number {
  return (a, b) => {
    const seenA = marks[a.roomId]?.seenAt ?? null
    const seenB = marks[b.roomId]?.seenAt ?? null
    if (seenA && seenB) {
      return compareTimes(seenB, seenA, 'asc') || a.createdAt.localeCompare(b.createdAt)
    }
    if (seenA) return -1
    if (seenB) return 1
    return a.createdAt.localeCompare(b.createdAt)
  }
}

/**
 * Compare two timestamps, either of which may be missing.
 *
 * A missing one sorts last in both directions, which is what every caller here
 * wants: no pin and no visit are both "not applicable", not "at the beginning
 * of time". Compared as strings because every timestamp in this codebase is
 * ISO-8601 from Postgres, where lexical order *is* chronological order - and
 * `new Date()` on each side of a comparator is two allocations per step.
 */
function compareTimes(a: string | null, b: string | null, direction: 'asc'): number {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  return direction === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
}

/**
 * The captions a space is already using, for the picker beside the field.
 *
 * Offered rather than enforced - a group is made by typing a name no other room
 * uses, and this is only what saves somebody from making "Design" and "design"
 * on two different afternoons. Sorted the way `orderPlaces` sorts groups, so
 * the list and the rail agree.
 */
export function groupNames(rooms: RoomView[]): string[] {
  const seen: string[] = []
  for (const room of rooms) {
    if (room.group && !seen.includes(room.group)) seen.push(room.group)
  }
  return seen
}
