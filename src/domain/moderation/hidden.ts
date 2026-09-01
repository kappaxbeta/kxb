import 'server-only'
import type { Client } from '@/es/store'

/**
 * Which of these have been taken down.
 *
 * ---------------------------------------------------------------------------
 * Filtered in the query layer, not in a policy
 * ---------------------------------------------------------------------------
 * `banned_worlds` does this the other way: 20260803080000 rewrote the *select
 * policy* on `lounge_blocks_read_model` so a banned arena is unreadable at the
 * database. That is the stronger guarantee and it was the right call there,
 * because a public battlefield is reachable by strangers and the blast radius
 * of a missed call site is somebody being sent into it.
 *
 * This is filtered a layer up instead, and the difference is what the content
 * is: a blueprint, a clip and an XP are visible to their own space and to
 * whoever they were shared with, so "hidden" has to mean hidden from the
 * *listings* while the row stays exactly where it is and keeps working for
 * everything that already points at it. A policy that cut the row off would
 * take down the room it is standing in - things summoned from a blueprint
 * resolve through it, and a lounge full of un-renderable furniture is a worse
 * outcome than an offensive name on a shelf for another hour.
 *
 * The honest consequence: a call site that forgets to ask still serves it.
 * That is why this is one function rather than a repeated `.not('id', 'in', …)`
 * - there is a single place to grep for, and a single place to change if this
 * ever does move into the policies.
 */
export async function hiddenAmong(
  supabase: Client,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()

  const { data, error } = await supabase
    .from('hidden_content')
    .select('target_id')
    .in('target_id', [...ids])

  // A failure here must not take the listing down with it. The table is
  // readable by everyone signed in, so an error means something is wrong with
  // the database rather than with this caller - and a shelf that refuses to
  // draw because moderation is unavailable is a worse failure than a shelf that
  // briefly shows one thing too many.
  if (error) return new Set()

  return new Set((data ?? []).map((row) => row.target_id))
}

/** Whether this one thing is down. */
export async function isHidden(supabase: Client, id: string): Promise<boolean> {
  return (await hiddenAmong(supabase, [id])).has(id)
}
