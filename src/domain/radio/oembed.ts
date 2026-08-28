import 'server-only'
import { trackTitleSchema } from '@/domain/radio/commands'
import { providerForHost } from '@/domain/radio/providers'

/**
 * Ask SoundCloud what a track is called.
 *
 * oEmbed, which is a public endpoint needing no key, no account and no API
 * credential - which is the whole reason the lookup can live on the server at
 * all. The obvious alternative, taking the title from the admin's own player
 * and sending it up with the command, is worse in a way that only shows up in
 * use: the person pasting a link may not have consented to the radio on that
 * device, so their browser may have no player to ask. Their track would then go
 * on unnamed for everybody, and the label is not decoration here - it is what
 * the consent prompt shows people so they can decide.
 *
 * Not SSRF. The URL is a *parameter* to soundcloud.com's endpoint, and the only
 * host ever contacted is soundcloud.com; the link itself has already been
 * through `trackUrlSchema`'s host allowlist before it reaches this.
 */

/**
 * How long a name is worth waiting for.
 *
 * Short, because this sits in front of the room hearing the track. Everything
 * about the radio works without a title, so a slow third party must cost a
 * label rather than a delay - the failure mode to avoid is an admin pressing
 * play and the music starting four seconds later because a metadata lookup was
 * being patient.
 */
const TIMEOUT_MS = 2_000

export async function readTrackTitle(trackUrl: string): Promise<string | null> {
  try {
    const provider = providerForHost(new URL(trackUrl).hostname)
    if (!provider) return null

    const response = await fetch(
      `${provider.oembed}?format=json&url=${encodeURIComponent(trackUrl)}`,
      {
        /**
         * Redirects followed, which is not incidental: Audiomack's oEmbed
         * answers 308 to `creators.audiomack.com`, so a `redirect: 'manual'`
         * here would silently make every Audiomack track unnamed.
         */
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // The name of a public track is not per-request state, and the same
        // link goes on more than once over an evening.
        next: { revalidate: 3600 },
      },
    )

    if (!response.ok) return null

    const body: unknown = await response.json()
    /**
     * Guarded rather than indexed straight into, because these four do not all
     * answer the same shape. hearthis.at replies `[]` for a track it does not
     * know - an array, not an object, and `[].title` is a silent `undefined`
     * that would look like a nameless track rather than a failed lookup.
     */
    const title =
      typeof body === 'object' && body !== null && !Array.isArray(body)
        ? (body as { title?: unknown }).title
        : null

    /**
     * Through the same schema the command uses, rather than trusted as a
     * string. This is a third party's JSON: it is bounded and coerced here so
     * that a surprising response is an unnamed track rather than four kilobytes
     * written into a row every member of the space reads.
     */
    return trackTitleSchema.parse(title)
  } catch {
    // A timeout, a network failure, an outage, a body that is not JSON. None of
    // them are reasons the room cannot have music.
    return null
  }
}
