import { z } from 'zod'
import { MAX_TRACK_TITLE_LENGTH, type RadioScope } from '@/domain/radio/events'
import { PROVIDER_LIST, providerForHost } from '@/domain/radio/providers'
import { PLACE_IDS } from '@/domain/world/places'

/**
 * Commands against the radio.
 *
 * Every one carries `actorId`, filled in from the session by the Server Action
 * and never from the client - the same rule the tenant commands state. Unlike
 * those, the decider here does not *use* it to decide anything, because roles
 * are not state of this stream. It is carried anyway so the event log records
 * who put the track on, which is the question anybody will actually ask of this
 * feature afterwards.
 */

export type RadioCommand =
  | {
      type: 'PlayTrack'
      actorId: string
      trackUrl: string
      title: string | null
      scope: RadioScope
      place: string | null
    }
  | { type: 'StopTrack'; actorId: string }
  | { type: 'ResumeTrack'; actorId: string }

export const radioScopeSchema = z.enum(['space', 'room'])

/**
 * Which place a room-scoped track belongs to.
 *
 * Validated against the real list rather than accepted as a string, because it
 * is the client saying where its own user is standing - and an unrecognised
 * value would be a track scoped to a room that does not exist, which is a track
 * nobody can ever hear. Refused at the boundary, where somebody can be told.
 */
export const placeSchema = z.enum(PLACE_IDS)

/**
 * A track link from a supported service, or a refusal somebody can act on.
 *
 * Which hosts count, and what a track path looks like on each, live in
 * `providers.ts` - this is the gate that applies them. It is the security
 * boundary of the whole feature rather than input tidying: the string that gets
 * through here is handed to a player and ends up in an iframe `src`, so a field
 * that accepted any URL would be an admin-operated open embed, loading an
 * arbitrary page inside the app for everybody in the space at once.
 *
 * Normalised as well as checked. The URL is rebuilt from its parsed parts with
 * the query string and fragment dropped, because the things that ride along in
 * a pasted share link are tracking parameters (`?si=`, `?utm_*`) - they
 * identify the person who copied it, and there is no reason to write that into
 * a shared row every member of the space can read.
 */
export const trackUrlSchema = z
  .string()
  .trim()
  .min(1, 'Paste a SoundCloud link')
  .max(2000, 'That link is too long to be a track')
  .transform((value, ctx) => {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      ctx.addIssue({ code: 'custom', message: 'That does not look like a link' })
      return z.NEVER
    }

    // http as well as https would be an embed we knowingly loaded over a
    // downgraded connection, and every allowed host redirects to https anyway.
    if (url.protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', message: 'The link has to start with https://' })
      return z.NEVER
    }

    const provider = providerForHost(url.hostname)
    if (!provider) {
      ctx.addIssue({
        code: 'custom',
        message: `Use a link from ${PROVIDER_LIST.map((p) => p.label).join(', ')}`,
      })
      return z.NEVER
    }

    /**
     * A link to one playable thing, not to a person.
     *
     * The check this schema was missing, and the one that produced the bug
     * report: `https://soundcloud.com/wydrob/` is a valid URL on an allowed
     * host, and SoundCloud's widget loads it as that artist's queue rather than
     * refusing it. So the radio half-worked - something played, the title was
     * whatever happened to be first, and nothing was synchronised, because
     * "position" in a queue is not the same number for two listeners.
     *
     * Refused here, with a sentence naming the difference, because from inside
     * the app it is indistinguishable from a track link and the failure is
     * silent everywhere else.
     */
    if (!provider.isTrackPath(url.pathname, url.hostname)) {
      ctx.addIssue({
        code: 'custom',
        message: `That looks like a ${provider.label} profile or front page rather than a track. Open the track itself and copy that link — ${provider.example}`,
      })
      return z.NEVER
    }

    return `https://${url.hostname.toLowerCase()}${url.pathname}`
  })

/**
 * Whatever the widget called it, bounded and allowed to be nothing.
 *
 * `catch(null)` rather than a refusal: this value is a courtesy from a third
 * party's player, and a space losing its radio because a title came back as a
 * number would be absurd. A missing name is a track that plays unnamed.
 */
export const trackTitleSchema = z
  .string()
  .trim()
  .max(MAX_TRACK_TITLE_LENGTH)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .catch(null)

export const playTrackSchema = z.object({
  trackUrl: trackUrlSchema,
  title: trackTitleSchema,
})
