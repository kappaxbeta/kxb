import 'server-only'
import type { RoomMark, RoomMarks } from '@/domain/rooms/places'
import type { Client } from '@/es/store'

/**
 * Your own marks on the rooms of a space: a pin, and when you were last in one.
 *
 * ---------------------------------------------------------------------------
 * Why this is not event-sourced, next door to a folder full of things that are
 * ---------------------------------------------------------------------------
 * Everything in `src/domain/rooms` except this file folds a log. A room's name,
 * its visibility, the space's pin and the group it is listed under are all
 * decisions somebody made on behalf of everybody, and the log is where those
 * live so they can be replayed, audited and argued with.
 *
 * These two are not that:
 *
 *   * Nothing decides anything on them. No rule reads a pin, no door checks a
 *     visit; they change an ordering in one person's rail and nothing else.
 *   * Nobody may read them but their owner, which is a property the event log
 *     does not have and should not acquire. `tenant_events` is readable by the
 *     space, and "which rooms does this person keep going back to" is not the
 *     space's business.
 *   * Losing them costs an order, not a truth. A rebuilt `room_marks` is a rail
 *     in creation order for a week - the same reasoning `world_occupancy` and
 *     `room_perf_samples` are outside the log on.
 *
 * So: a plain table, written last-write-wins, read once per rail render.
 *
 * ---------------------------------------------------------------------------
 * Every write here is best-effort, and every one of them swallows its error
 * ---------------------------------------------------------------------------
 * `touchRoom` runs on the way into a room and `pinRoom` runs from a rail over a
 * live scene. Neither is the thing the person came to do, and neither is worth
 * a page that fails to render or a red line over a 3D canvas. What a failed
 * write costs is one room in the wrong position, which nobody will notice and
 * which the next successful visit fixes.
 */

type Row = {
  room_id: string
  pinned_at: string | null
  seen_at: string | null
}

/**
 * My marks in this space, keyed by room id.
 *
 * One query for the whole rail rather than one per room. RLS narrows this to
 * the caller's own rows - see the migration - so `user_id` is not in the filter
 * and must not be: passing one would make the query *look* like it is what
 * keeps other people's rows out, and the day somebody passes the wrong id the
 * policy is the only thing that saves it.
 *
 * An empty map on any failure. The rail then draws the space's pins, the groups
 * and creation order, which is a complete and sensible list - and a rail that
 * throws because a preference table was unreachable would take the whole
 * workspace shell down with it.
 */
export async function readRoomMarks(
  supabase: Client,
  tenantId: string,
): Promise<RoomMarks> {
  const { data, error } = await supabase
    .from('room_marks')
    .select('room_id, pinned_at, seen_at')
    .eq('tenant_id', tenantId)

  if (error) return {}

  const marks: RoomMarks = {}
  for (const row of (data ?? []) as Row[]) {
    marks[row.room_id] = {
      pinnedAt: row.pinned_at ?? null,
      seenAt: row.seen_at ?? null,
    } satisfies RoomMark
  }
  return marks
}

/**
 * Remember that this person was in this room.
 *
 * Called from the room page's render, on the way in. A write during a GET,
 * which is worth naming rather than hiding: it is idempotent, it is one row, it
 * is scoped to the caller, and the alternative - a client effect posting to a
 * Server Action on mount - is a round trip that re-runs `requireTenant`, writes
 * cookies and re-renders the page under a live scene. See the note on polling
 * Server Actions; this is the reason the cheap thing is the server-side one.
 *
 * `now` is passed rather than stamped here so the caller's clock is the page
 * render's, and so a test can say when.
 *
 * Not awaited for its result anywhere - the return value is whether it landed,
 * for tests. A page that waited to find out would be a page whose time to first
 * byte depends on a preference.
 */
export async function touchRoom(
  supabase: Client,
  tenantId: string,
  userId: string,
  roomId: string,
  now: string = new Date().toISOString(),
): Promise<boolean> {
  const { error } = await supabase.from('room_marks').upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      room_id: roomId,
      seen_at: now,
      updated_at: now,
    },
    // The natural key, which is the primary key: one row per person per room.
    // Without naming it, a second visit inserts and the unique index refuses -
    // which would make every visit after the first a swallowed error.
    { onConflict: 'user_id,room_id' },
  )

  return !error
}

/**
 * Pin a room to the top of your own list, or take it off.
 *
 * Upsert rather than update, because the first pin is usually the first mark
 * this person has ever had on this room - somebody pins a room they have not
 * been in yet more often than you would think, which is exactly what a pin is
 * for when a space opens a room for next week.
 *
 * Unpinning nulls the column and leaves the row, so the visit it also holds
 * survives being unpinned. There is no delete policy on the table for the same
 * reason.
 */
export async function setRoomMarkPinned(
  supabase: Client,
  tenantId: string,
  userId: string,
  roomId: string,
  pinned: boolean,
  now: string = new Date().toISOString(),
): Promise<boolean> {
  const { error } = await supabase.from('room_marks').upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      room_id: roomId,
      pinned_at: pinned ? now : null,
      updated_at: now,
    },
    { onConflict: 'user_id,room_id' },
  )

  return !error
}
