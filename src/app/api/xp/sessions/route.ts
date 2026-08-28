import { NextResponse } from 'next/server'
import { z } from 'zod'
import { SESSION_OUTCOMES, sessionFrom } from '@/domain/xps/sessions'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/server'

/**
 * A level closing behind somebody.
 *
 * docs/xp/creator.md §18.6. One POST at teardown, never during play - nothing
 * here is 8 Hz, and nothing in the game waits for it.
 *
 * ---------------------------------------------------------------------------
 * Why this is a route, when `xp_store` deliberately is not
 * ---------------------------------------------------------------------------
 * `_hosts/store.ts` argues at length that the policies are the boundary and a
 * route in front of them is a second place for the same rules to be right. That
 * argument is correct and does not reach here, for two reasons that are
 * properties of *this* write rather than preferences:
 *
 *   - **The identity must not be in the body.** A save belongs to whoever is
 *     writing it and RLS can say so. A session is a claim about who played, and
 *     under §18.2's user-centric split, a forged one spends somebody else's €3.
 *     So the account is read from the cookie here and the body has no field for
 *     it - which is `page_views`' arrangement (20260803000000) and the same
 *     reason.
 *   - **`sendBeacon` cannot reach PostgREST.** The one send that survives a tab
 *     closing cannot set headers, so it cannot carry an `apikey` or an
 *     `Authorization`. It can reach a same-origin route, which carries the
 *     session cookie on its own. A session that is only recorded when somebody
 *     navigates away politely is a ledger with a hole shaped like closing a tab.
 *
 * ---------------------------------------------------------------------------
 * Always 204, and nothing is ever shown as counted
 * ---------------------------------------------------------------------------
 * §18.6 inherits Section 9's trap - `race-finish-latched-before-confirmation` -
 * which says a result must not be latched locally before the write returns. The
 * resolution here is stronger than obeying it: **the player is never told**.
 * There is no pending state, no confirmation and no error, because a takings
 * ledger is not a thing the game reports on. A refused row and a stored one look
 * identical from the browser, which is what keeps a failing ledger from being
 * visible in the play it is measuring.
 */

const NO_CONTENT = new NextResponse(null, { status: 204 })

const Beacon = z.object({
  /** Bounded here to the column's own limit; `sessionFrom` decides what it means. */
  ref: z.string().min(1).max(64),
  instance: z.string().max(256).nullable().optional(),
  startedAt: z.string().min(1).max(64),
  seconds: z.number(),
  outcome: z.enum(SESSION_OUTCOMES),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NO_CONTENT
  }

  const parsed = Beacon.safeParse(body)
  if (!parsed.success) return NO_CONTENT

  /**
   * Whoever is signed in, and nobody is fine.
   *
   * §18.3: a guest generates usage and no money. The row is written either way -
   * the fund's rules are a projection over these rows, and "worth €0" is
   * something a query decides, not something this endpoint refuses.
   */
  const user = await getUser().catch(() => null)

  const row = sessionFrom(
    {
      ref: parsed.data.ref,
      instance: parsed.data.instance ?? null,
      startedAt: parsed.data.startedAt,
      seconds: parsed.data.seconds,
      outcome: parsed.data.outcome,
    },
    user?.id ?? null,
  )
  if (!row) return NO_CONTENT

  const { error } = await createAdminClient().from('xp_sessions').insert(row)
  if (error) {
    // Logged, not thrown. There is no caller to tell: this request left a tab
    // that is already gone.
    console.error('xp session insert failed:', error.message)
  }

  return NO_CONTENT
}
