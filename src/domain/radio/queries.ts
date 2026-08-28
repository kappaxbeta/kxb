import 'server-only'
import type { RadioScope } from '@/domain/radio/events'
import type { Client } from '@/es/store'

/**
 * What is on, as the dock needs it to start playing.
 *
 * The three fields under the label are the whole synchronisation contract, and
 * they are meaningless apart: a URL says what, `startedAt` says when that
 * started, and `positionMs` says where in the track "that" was. Together they
 * place any browser, joining at any moment, at the same second as the room.
 */
export interface NowPlaying {
  trackUrl: string
  title: string | null
  /** ISO, from the database's clock. The anchor every playhead is measured from. */
  startedAt: string
  positionMs: number
  playing: boolean
  /** Everybody in the space, or only the room it went on in. */
  scope: RadioScope
  /** Which room, when the scope is narrow. Null otherwise. */
  place: string | null
}

/**
 * Read one space's radio, or null when it has never had one on.
 *
 * Null is also the answer for a row whose track or anchor is missing, which is
 * not paranoia about a nullable column: a row that says it is playing but
 * cannot say from where would put every listener at a different point in the
 * song, which is worse than silence and much harder to explain. A radio that is
 * off is a normal, legible state; a radio that is on and unsynchronised is not.
 *
 * A stopped radio still returns a row, with `playing: false`. The dock needs it
 * - that is how an admin sees the track sitting in the box to resume, and how
 * everybody else sees the label of what was last on rather than an empty panel
 * that gives no sign the feature exists.
 */
export async function readNowPlaying(
  supabase: Client,
  tenantId: string,
): Promise<NowPlaying | null> {
  const { data, error } = await supabase
    .from('space_radio')
    .select('track_url, title, started_at, position_ms, playing, scope, place')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load the radio: ${error.message}`)
  if (!data?.track_url || !data.started_at) return null

  return {
    trackUrl: data.track_url,
    title: data.title,
    startedAt: data.started_at,
    positionMs: data.position_ms,
    playing: data.playing,
    // Narrowed here rather than trusted, so a row carrying a value this build
    // does not know about reads as "everywhere" - audible, and therefore
    // noticed - instead of as a room nobody is standing in, which is silence
    // with no explanation.
    scope: data.scope === 'room' ? 'room' : 'space',
    place: data.place,
  }
}
