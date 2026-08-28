import { NextResponse } from 'next/server'
import { roomHeads } from '@/domain/chat/queries'
import { requireTenant } from '@/lib/tenant'

/**
 * How many people are in each room, for the switcher in the rail.
 *
 * ---------------------------------------------------------------------------
 * Why a route handler and not the Server Action this used to be
 * ---------------------------------------------------------------------------
 * This is polled. Every fifteen seconds, on every page in the space, for as
 * long as anybody has one open - and a poll must not be a Server Action, for a
 * reason that is nothing to do with taste.
 *
 * Every action here goes through `requireTenant`, which builds the Supabase
 * client, which refreshes the session and writes the auth cookies back. A
 * Server Component cannot set a cookie so that write is a no-op on a render;
 * inside an *action* it succeeds. Next then sees an action that modified
 * cookies, decides the client's router cache may be stale, and answers with
 * `x-action-revalidated` - which tells the router to throw its cache away and
 * re-render the whole current route from the server.
 *
 * So a read of one small table was re-rendering the entire page, on a timer.
 * On the video studio that is a quarter of a megabyte of Flight payload and a
 * full `force-dynamic` render every eight seconds; twelve hours of one person
 * working came to seventy megabytes of it. Worse than the waste is what the
 * re-render does on the way in: the middle column is rebuilt, an editor holding
 * a document in React state is remounted, and whatever was typed in the second
 * before the tick is gone. "I set the length to sixteen and it went back to
 * eight" was this.
 *
 * A route handler is outside that protocol entirely. The response is the JSON
 * asked for, nothing is invalidated, and nothing re-renders. It is also the
 * honest verb: this reads and changes nothing, and it was never a POST in
 * anything but Next's plumbing.
 *
 * The session still stays fresh, because `src/proxy.ts` matches this path like
 * any other and refreshes it there - which is where that job belongs.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  // Guests included, matching what the action did: a visitor can see the rail
  // and the same numbers on it. `requireTenant` still 404s anybody who is not
  // in this space at all.
  const { supabase, tenant } = await requireTenant(slug, { guests: true })

  return NextResponse.json(await roomHeads(supabase, tenant.id), {
    // A count that is twenty seconds from being wrong has no business in any
    // cache between here and the tab that asked.
    headers: { 'cache-control': 'no-store' },
  })
}
