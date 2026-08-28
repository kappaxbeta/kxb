'use server'

import { radioDecider } from '@/domain/radio/aggregate'
import {
  placeSchema,
  playTrackSchema,
  radioScopeSchema,
  type RadioCommand,
} from '@/domain/radio/commands'
import { readTrackTitle } from '@/domain/radio/oembed'
import { radioProjection } from '@/domain/radio/projection'
import { type NowPlaying, readNowPlaying } from '@/domain/radio/queries'
import { radioStreamId } from '@/domain/radio/streams'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { hasRole, requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * Working the radio.
 *
 * Three actions and one dispatcher, and the shape follows `postChatMessage`
 * next door in the one way that matters: nothing here broadcasts. The client
 * announces the change over Realtime only once this has returned, so every
 * listener in the space learns about the track from a caller that has already
 * been authorised and whose event is already in the log. A broadcast sent first
 * would be a room full of players pointed at a URL that the database might
 * still refuse.
 *
 * No `revalidatePath`. Whoever presses these buttons may be standing inside the
 * lounge's WebGL canvas, and a layout re-render would tear the scene down - the
 * lesson `setLoungeMode` learned first, and the one this app's scene actions
 * all inherit. The dock's own state and the broadcast are what update the room.
 */

export type RadioResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

async function dispatch(
  slug: string,
  build: (actorId: string) => RadioCommand,
): Promise<RadioResult<NowPlaying | null>> {
  const context = await requireTenant(slug)
  const { user, supabase, tenant } = context

  /**
   * The flag, re-asked at the boundary.
   *
   * The page checked it before drawing a control, and that is a courtesy to
   * whoever is clicking rather than a boundary - a Server Action is a public
   * POST endpoint. Refused as a sentence rather than through `requireFeature`,
   * which is `notFound()`: a 404 in reply to pressing stop is not something a
   * panel can render.
   */
  if (!context.features.radio) {
    return { ok: false, error: 'The radio is not available in this space' }
  }

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  /**
   * Owners and admins, exactly like every other switch that changes what a
   * space is doing to everybody in it.
   *
   * This is the fast, polite copy of the rule. The real one is the RESTRICTIVE
   * policy on `events` in the radio migration, and unusually for this codebase
   * it is not backed by a decider: roles live on the tenant stream, the radio
   * deliberately does not, so the check cannot be made where the rest of them
   * are. The migration explains the trade. What matters here is that removing
   * this line would produce a polite failure from Postgres rather than an
   * unauthorised track.
   */
  if (!hasRole(context, ['owner', 'admin'])) {
    return { ok: false, error: 'Only an owner or an admin can work the radio' }
  }

  try {
    await executeCommand({
      supabase,
      decider: radioDecider,
      tenantId: tenant.id,
      // One radio per space, at an id derived from the space rather than equal
      // to it - see streams.ts for why that distinction is load-bearing.
      streamId: radioStreamId(tenant.id),
      command: build(user.id),
      metadata: { actorId: user.id },
    })
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message }
    if (error instanceof ConcurrencyError) {
      return { ok: false, error: 'Somebody else just changed the radio. Try again.' }
    }
    throw error
  }

  await runProjection(supabase, radioProjection, tenant.id)

  /**
   * The row is read back rather than reconstructed here, and this is the one
   * place in the feature where waiting on the projection is right.
   *
   * `startedAt` is the anchor the whole room synchronises against, and it is
   * the database's timestamp on the event - not something this process can mint
   * without inventing a second, disagreeing clock. So the value that goes out
   * over the broadcast has to be the stored one. The projection ran on the line
   * above; if it somehow did not, the caller gets a null and re-reads on its
   * next render, which is a beat of silence rather than a room split across two
   * timelines.
   */
  return { ok: true, data: await readNowPlaying(supabase, tenant.id) }
}

/**
 * Put a track on.
 *
 * The only argument from the client is the link, and it is validated against a
 * host allowlist before it can reach an iframe - see `trackUrlSchema`, which is
 * the security boundary of the feature.
 *
 * The name is looked up here rather than sent along, which is worth a note
 * because the reverse would be cheaper. It is resolved server-side because the
 * admin pasting the link may not have consented to the radio on that device and
 * so may have no player to read a title from - their track would go on unnamed
 * for the whole space, and the label is what everybody else's consent prompt
 * shows them. A lookup that fails costs the name and nothing else.
 */
export async function playTrack(
  slug: string,
  trackUrl: string,
  scope: string,
  place: string | null,
): Promise<RadioResult<NowPlaying | null>> {
  const parsed = playTrackSchema.safeParse({ trackUrl, title: null })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That link will not play' }
  }

  const reach = radioScopeSchema.safeParse(scope)
  if (!reach.success) return { ok: false, error: 'Unknown radio reach' }

  /**
   * The place is validated only when it is going to be used.
   *
   * A browser sending `place: 'lounge'` alongside `scope: 'space'` is not
   * wrong, it is just telling us something that does not apply - so the value
   * is dropped rather than refused. When the scope *is* narrow the name has to
   * be real, because a track scoped to a room that does not exist is a track
   * nobody can ever hear, and it would fail as silence.
   */
  let where: string | null = null
  if (reach.data === 'room') {
    const parsedPlace = placeSchema.safeParse(place)
    if (!parsedPlace.success) {
      return {
        ok: false,
        error: 'Go into a room first — there is nowhere for a room-only track to play',
      }
    }
    where = parsedPlace.data
  }

  const title = await readTrackTitle(parsed.data.trackUrl)

  return dispatch(slug, (actorId) => ({
    type: 'PlayTrack',
    actorId,
    trackUrl: parsed.data.trackUrl,
    title,
    scope: reach.data,
    place: where,
  }))
}

/** Turn it off, remembering where it got to. */
export async function stopTrack(slug: string): Promise<RadioResult<NowPlaying | null>> {
  return dispatch(slug, (actorId) => ({ type: 'StopTrack', actorId }))
}

/** Pick it back up from there. */
export async function resumeTrack(slug: string): Promise<RadioResult<NowPlaying | null>> {
  return dispatch(slug, (actorId) => ({ type: 'ResumeTrack', actorId }))
}
