import { NextResponse } from 'next/server'
import { battleIdSchema } from '@/domain/battle/commands'
import { findBattle } from '@/domain/battle/queries'
import { requireFeature, requireTenant } from '@/lib/tenant'

/**
 * The match as it stands, for a client that is standing inside it.
 *
 * ---------------------------------------------------------------------------
 * Why this is not the Server Action it was
 * ---------------------------------------------------------------------------
 * The action existed so the battle room would never have to call
 * `router.refresh()`: refreshing re-renders the route around a live WebGL
 * canvas, and doing that several times a minute mid-fight is the one thing both
 * rooms are written to avoid. The room polled the action every five seconds and
 * put the answer in React state, and the comment above it said the scene never
 * re-renders from the server at all.
 *
 * It did. Every action here goes through `requireTenant`, which refreshes the
 * session and writes the auth cookies; Next answers a cookie-writing action
 * with `x-action-revalidated`, which tells the router to drop its cache and
 * re-render the whole current route. So the poll built to avoid a refresh was
 * performing one, on a timer, in the middle of matches.
 *
 * A route handler is outside that protocol: JSON in, JSON out, nothing
 * invalidated. The promise the rooms make is true now. `../../heads/route.ts`
 * has the longer version of this note.
 *
 * ---------------------------------------------------------------------------
 * Not found is a 200 with null
 * ---------------------------------------------------------------------------
 * Matching what the action returned, because the callers already read it that
 * way: a poll that finds nothing keeps the state it had rather than blanking
 * the room. A 404 would be the same fact in a shape every call site would have
 * to translate.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; battleId: string }> },
) {
  const { slug, battleId } = await params

  const parsed = battleIdSchema.safeParse({ battleId })
  if (!parsed.success) return NextResponse.json(null)

  // Guests included: a visitor let into a space can be *in* the match, and a
  // scoreboard that stops updating for them is worse than one they cannot see.
  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')

  return NextResponse.json(await findBattle(context.supabase, parsed.data.battleId), {
    headers: { 'cache-control': 'no-store' },
  })
}
