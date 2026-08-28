import { createHash } from 'node:crypto'
import { env } from '@/lib/env'
import { campaignFrom } from './campaign'
import { isEventName, type PropValue, sanitiseProps } from './events'
import { parseVariant } from './experiment'
import { countryForIp } from './geo'

/**
 * Turning a request into a row of `page_views`.
 *
 * Everything interesting here is a decision about what *not* to keep. The
 * address is hashed and dropped, the query string is thrown away before the
 * path is stored, and no cookie is set - the banner promises essential cookies
 * only, and an analytics cookie is not essential. What survives is enough to
 * answer "how many people, from where, looking at what" and not enough to
 * answer "who".
 *
 * Pure functions, no I/O: the route handler does the insert. That is what makes
 * the parsing testable without a database or a request - and the reason there
 * is no `server-only` import, which the aggregates go without for the same
 * reason. Nothing here would work in a browser anyway: `node:crypto` and the
 * service role key are both server-side, and the only importer is the endpoint.
 */

/** What the endpoint writes. Mirrors the table, minus its defaults. */
export interface PageViewRow {
  path: string
  referrer_host: string | null
  country: string | null
  language: string | null
  device: string
  visitor_hash: string
  user_id: string | null
  /** `experiment:arm` for a page under test, null everywhere else. */
  variant: string | null
}

/** One row of `analytics_events`. */
export interface EventRow {
  name: string
  path: string
  variant: string | null
  visitor_hash: string
  user_id: string | null
  props: Record<string, PropValue>
}

/**
 * Surfaces worth counting.
 *
 * The admin surface is excluded because measuring your own visits inflates
 * every number on the page you are reading them from, and API routes are
 * excluded because a beacon POST is not a visit.
 *
 * `/backoffice` stays in the list even though that route is gone. It is one
 * comparison, and the alternative is that any page view logged under the old
 * path - a bookmarked tab left open across the deploy, a retried beacon - lands
 * in the numbers it was always meant to stay out of.
 *
 * `/notme` is the page for asking not to be counted. Counting the visit that
 * turns measurement off is a small joke at the visitor's expense, and it would
 * be the one hit the cookie cannot suppress: it is set by that page, and so is
 * not on the request that loaded it.
 */
const UNTRACKED = ['/api/', '/ovaloffice', '/backoffice', '/notme']

export function isTrackablePath(path: string): boolean {
  if (!path.startsWith('/')) return false
  return !UNTRACKED.some((prefix) => path.startsWith(prefix))
}

/**
 * The path as it should be stored: no origin, no query, no fragment.
 *
 * A query string is where ids, invitation tokens and search terms live, and
 * none of them are traffic data. Dropping it here rather than in the query
 * layer means the sensitive half is never written in the first place.
 */
export function cleanPath(raw: string): string | null {
  const path = raw.split('?')[0]?.split('#')[0]?.trim() ?? ''
  if (!path.startsWith('/') || path.length > 512) return null
  return path
}

/**
 * Where the visit came from, as a bare host.
 *
 * Our own hostname is not a source - a click from one page to the next is
 * navigation, not acquisition - so a same-host referrer reads as direct, which
 * is what `null` means in the column.
 */
export function referrerHost(referrer: string | null, selfHost: string | null): string | null {
  if (!referrer) return null
  let host: string
  try {
    host = new URL(referrer).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
  if (!host) return null
  // The Host header carries the port (`127.0.0.1:3000`) and the referrer never
  // does, so the two only compare after it is stripped - otherwise every
  // in-app click is filed as an external referral from our own domain.
  const self = selfHost?.split(':')[0]?.replace(/^www\./, '')
  if (self && host === self) return null
  return host.slice(0, 253)
}

const BOT = /(bot|crawler|spider|crawling|slurp|facebookexternalhit|preview|monitor|curl|wget|headless)/i
const TABLET = /(ipad|tablet|playbook|silk)|(android(?!.*mobile))/i
const MOBILE = /(android|iphone|ipod|windows phone|mobile)/i

/** Four buckets, because a table of user agent strings is not a report. */
export function deviceOf(userAgent: string | null): string {
  const ua = userAgent ?? ''
  if (!ua || BOT.test(ua)) return 'bot'
  if (TABLET.test(ua)) return 'tablet'
  if (MOBILE.test(ua)) return 'mobile'
  return 'desktop'
}

/**
 * The country, from the proxy if it knows and from our own table if it does not.
 *
 * The header comes first because a proxy that resolves geolocation is doing it
 * closer to the connection than we can - Cloudflare and Vercel both set their
 * own, and `X-Country` is honoured for anything else in front of us. We ran
 * without any of them for a while, which is why the report showed nothing but
 * Unknown: DNS points straight at the box and Caddy sets no such header.
 *
 * `countryForIp` is the fallback and now the normal path. It reads a registry
 * table baked into the build, so it costs one binary search and sends nothing
 * anywhere - see `geo.ts`. Unknown is still unknown rather than guessed.
 */
export function countryOf(headers: Headers): string | null {
  const raw =
    headers.get('cf-ipcountry') ??
    headers.get('x-vercel-ip-country') ??
    headers.get('x-country') ??
    headers.get('x-geo-country')

  if (raw) {
    const code = raw.trim().toUpperCase()
    // Cloudflare sends XX for "could not tell" and T1 for Tor. Both mean the
    // proxy has no answer, so we fall through and have our own look.
    if (/^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1') return code
  }

  return countryForIp(clientIp(headers))
}

/** The first language tag, e.g. `de` out of `de-DE,de;q=0.9,en;q=0.8`. */
export function languageOf(acceptLanguage: string | null): string | null {
  const tag = acceptLanguage?.split(',')[0]?.split(';')[0]?.trim().slice(0, 12)
  return tag && /^[a-zA-Z-]{2,12}$/.test(tag) ? tag.toLowerCase() : null
}

/** The client address as the proxy reports it. Used to hash, never stored. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * Who this is, for one day only.
 *
 * Salted so the hash cannot be recomputed from an address by anyone without the
 * secret, and dated so it stops matching at midnight UTC. The consequence is
 * deliberate: "unique visitors" is a daily number here and cannot be turned into
 * a per-person history across days, because the identifier does not survive the
 * day it was made in.
 *
 * The salt is the service role key rather than a new environment variable. It
 * is already required, already server-only, and rotating it - which should
 * happen if it ever leaks - correctly invalidates every hash derived from it.
 */
export function visitorHash(ip: string, userAgent: string | null, now = new Date()): string {
  const day = now.toISOString().slice(0, 10)
  return createHash('sha256')
    .update(`${env.supabaseServiceRoleKey()}:${day}:${ip}:${userAgent ?? ''}`)
    .digest('hex')
    .slice(0, 32)
}

/** Everything above, applied to one beacon. `null` when it is not worth a row. */
export function pageViewFrom(
  input: {
    path: string
    referrer: string | null
    userId: string | null
    /** The visit's own query string, for `?src=`. Absent everywhere else. */
    search?: string | null
    /** `experiment:arm`, as the page actually rendered it. */
    variant?: string | null
  },
  headers: Headers,
  now = new Date(),
): PageViewRow | null {
  const path = cleanPath(input.path)
  if (!path || !isTrackablePath(path)) return null

  const userAgent = headers.get('user-agent')

  return {
    path,
    /**
     * The tag wins over the referrer, on the one visit that has both.
     *
     * A tagged link clicked on a site that does send a referrer would otherwise
     * be filed under that site - which is true, and useless: we know it was on
     * that site, we put it there. What is being asked is which of *our* posts
     * sent this person, and only the tag answers that.
     */
    referrer_host:
      campaignFrom(input.search ?? null) ??
      referrerHost(input.referrer, headers.get('host')),
    country: countryOf(headers),
    language: languageOf(headers.get('accept-language')),
    device: deviceOf(userAgent),
    visitor_hash: visitorHash(clientIp(headers), userAgent, now),
    user_id: input.userId,
    // Validated rather than trusted: this arrives from the browser, and an arm
    // we never issued is somebody trying their luck, not a new arm.
    variant: parseVariant(input.variant) ? (input.variant ?? null) : null,
  }
}

/**
 * One event, from what the browser sent and what the request itself says.
 *
 * The same split `pageViewFrom` makes and for the same reason: the client
 * supplies what it did, the headers supply who and where, and the two are never
 * allowed to swap roles. A page can claim it fired `checkout_complete`; it
 * cannot claim to be somebody else's visitor hash.
 *
 * Returns null for an unknown event name rather than storing it. See the note
 * on the vocabulary in `./events` - an unrecognised name is not a new event.
 */
export function eventFrom(
  input: {
    name: string
    path: string
    variant?: string | null
    props?: unknown
    userId: string | null
  },
  headers: Headers,
  now = new Date(),
): EventRow | null {
  if (!isEventName(input.name)) return null

  const path = cleanPath(input.path)
  if (!path || !isTrackablePath(path)) return null

  const userAgent = headers.get('user-agent')

  return {
    name: input.name,
    path,
    variant: parseVariant(input.variant) ? (input.variant ?? null) : null,
    visitor_hash: visitorHash(clientIp(headers), userAgent, now),
    user_id: input.userId,
    props: sanitiseProps(input.props),
  }
}
