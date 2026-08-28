import { NextResponse } from 'next/server'
import { DOORKEEPERS } from '@/domain/guests/application'
import { listKnocks } from '@/domain/guests/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasRole, requireTenant } from '@/lib/tenant'

/**
 * Who is standing at the door, for the doorbell in the rail.
 *
 * A route handler rather than the Server Action it used to be, for the reason
 * written out in `../heads/route.ts` - and this is the one that was actually
 * costing something. It polls every eight seconds on every page in the space,
 * so it was the request re-rendering whatever anybody was in the middle of.
 *
 * Note what most members get back: an empty array. `DOORKEEPERS` excludes
 * guests, and a space where nobody is knocking has nothing to report either
 * way, so the overwhelmingly common answer to this question is `[]` - which is
 * a strong argument for it being cheap, and was the least defensible thing
 * about a version of it that re-rendered the page to say so.
 *
 * A refusal is an empty list, not a 403. The rail asks this on every page for
 * everybody, including people who may not answer a door; "nobody is waiting"
 * and "not for you to answer" draw the same thing - nothing - and a status code
 * would only give the rail an error to swallow.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const context = await requireTenant(slug)
  if (!hasRole(context, DOORKEEPERS)) {
    return NextResponse.json([], { headers: { 'cache-control': 'no-store' } })
  }

  // The admin client, as the action did: a knock is a row nobody but a
  // doorkeeper may read, and the check above is the gate rather than RLS.
  return NextResponse.json(await listKnocks(createAdminClient(), context.tenant.id), {
    headers: { 'cache-control': 'no-store' },
  })
}
