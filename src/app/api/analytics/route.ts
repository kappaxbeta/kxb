import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ANALYTICS_OPT_OUT_COOKIE, isOptedOut } from '@/domain/analytics/opt-out'
import { eventFrom, pageViewFrom } from '@/domain/analytics/track'
import { getUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The beacon endpoint.
 *
 * Writes go through the service role because `page_views` grants insert to
 * nobody: an anonymous visitor has no session to write with, and a signed-in
 * one must not be able to write rows attributing traffic to whoever they like.
 * The client supplies the path and the referrer; everything that identifies the
 * request - address, agent, country - is read from the headers here, where it
 * cannot be forged by the page.
 *
 * It always answers 204, including when it decided not to store anything. A
 * beacon is fire-and-forget; there is no caller to tell, and a failing analytics
 * call must never be visible in the app it is measuring.
 */

const Beacon = z.object({
  path: z.string().min(1).max(1024),
  /**
   * The A/B arm the page actually rendered, as `experiment:arm`.
   *
   * Sent by the client because the client is the only thing that knows what it
   * was shown - the arm is drawn during render and this endpoint is a separate
   * request with none of that context. Validated against the registry in
   * `eventFrom`/`pageViewFrom` rather than trusted: an arm we never issued is
   * somebody trying their luck, and it is dropped rather than stored.
   */
  variant: z.string().max(64).nullable().optional(),
  /**
   * An event name, when this beacon is an event rather than a page view.
   *
   * One endpoint for both because they are the same request with the same
   * headers and the same privacy rules, and a second route would be a second
   * copy of the address hashing and the bot filter.
   */
  event: z.string().max(64).nullable().optional(),
  /** Context for the event. Shape-checked and capped by `sanitiseProps`. */
  props: z.record(z.string(), z.unknown()).nullable().optional(),
  referrer: z.string().max(2048).nullable().optional(),
  /**
   * The visit's query string, for the `?src=` on a link we posted somewhere.
   *
   * Only `src` is ever read out of it, by `campaignFrom`, and only if it is a
   * short slug - the rest is dropped here and never stored, which is the same
   * promise `cleanPath` makes about the path. Capped short: a campaign tag is a
   * word, and a kilobyte of query string is somebody else's idea.
   */
  search: z.string().max(512).nullable().optional(),
})

const NO_CONTENT = new NextResponse(null, { status: 204 })

export async function POST(request: Request) {
  /**
   * Before anything else, including reading the body.
   *
   * This is the whole opt-out: a browser carrying the cookie from /notme gets
   * the same 204 as everybody else and leaves no row behind, for page views and
   * for events alike. Doing it here rather than in `pageViewFrom` keeps it out
   * of the pure functions - it is a property of the request, not of the visit
   * being described.
   */
  const jar = await cookies()
  if (isOptedOut(jar.get(ANALYTICS_OPT_OUT_COOKIE)?.value)) return NO_CONTENT

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NO_CONTENT
  }

  const parsed = Beacon.safeParse(body)
  if (!parsed.success) return NO_CONTENT

  // Anonymous is the normal case here - the landing page is the whole point -
  // so a missing session is not an error, just a null column.
  const user = await getUser().catch(() => null)

  // An event beacon and a page-view beacon are the same POST with one field
  // different. Events never also count as a view: a click on a page is not a
  // second visit to it, and counting it as one inflates every rate computed
  // against views - which is the one number an A/B test turns on.
  if (parsed.data.event) {
    const event = eventFrom(
      {
        name: parsed.data.event,
        path: parsed.data.path,
        variant: parsed.data.variant ?? null,
        props: parsed.data.props ?? {},
        userId: user?.id ?? null,
      },
      request.headers,
    )
    if (!event) return NO_CONTENT

    const { error } = await createAdminClient().from('analytics_events').insert(event)
    if (error) console.error('event insert failed:', error.message)
    return NO_CONTENT
  }

  const row = pageViewFrom(
    {
      path: parsed.data.path,
      referrer: parsed.data.referrer ?? null,
      search: parsed.data.search ?? null,
      variant: parsed.data.variant ?? null,
      userId: user?.id ?? null,
    },
    request.headers,
  )
  if (!row) return NO_CONTENT

  const { error } = await createAdminClient().from('page_views').insert(row)
  if (error) {
    // Logged, not thrown. Losing a hit is cheaper than a 500 in a fetch the
    // page fired on navigation.
    console.error('page view insert failed:', error.message)
  }

  return NO_CONTENT
}
