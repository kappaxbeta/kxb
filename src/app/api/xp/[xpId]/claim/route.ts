import { NextResponse } from 'next/server'
import { mayDo } from '@/domain/xps/access'
import { CLAIM_SECONDS, RENEW_SECONDS, releaseClaim, takeClaim } from '@/domain/xps/claims'
import { readGrant } from '@/domain/xps/grants'
import { findXpProject } from '@/domain/xps/queries'
import { displayNameFrom, readUsernames } from '@/domain/profile/username-queries'
import { createClient, getUser } from '@/lib/supabase/server'
import { requireTenant } from '@/lib/tenant'

/**
 * Take the editor, keep it, or give it back.
 *
 * docs/xp/backend.md §12.7. `POST` takes or renews; `DELETE` releases.
 *
 * The editor calls `POST` when it opens and every `RENEW_SECONDS` after that,
 * and `DELETE` on the way out. Only the first of those is required to work:
 * the claim expires on its own, so a release that never arrives costs a
 * colleague ninety seconds rather than costing anybody the project.
 *
 * ---------------------------------------------------------------------------
 * A refusal here is not an error
 * ---------------------------------------------------------------------------
 * Losing the claim is an ordinary outcome — somebody else got there first —
 * and the response says who, so the editor can put a name on the screen rather
 * than a status code. That is why it is a 200 with `held: false` and not a 409:
 * the request did exactly what it was supposed to, and the answer is no.
 */

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ xpId: string }> },
) {
  const { xpId } = await params

  const gate = await guard(xpId)
  if ('response' in gate) return gate.response

  const outcome = await takeClaim(gate.supabase, xpId, gate.userId)

  if (!outcome.ok) {
    return NextResponse.json({
      held: false,
      by: await nameFor(gate.supabase, outcome.heldBy),
      since: outcome.since,
      // So the editor can say "try again in a minute" rather than asking the
      // person to guess, and so the Take over button knows when to appear.
      freeAt: outcome.expiresAt,
      renewSeconds: RENEW_SECONDS,
    })
  }

  return NextResponse.json({
    held: true,
    expiresAt: outcome.claim.expiresAt,
    renewSeconds: RENEW_SECONDS,
    claimSeconds: CLAIM_SECONDS,
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ xpId: string }> },
) {
  const { xpId } = await params

  const gate = await guard(xpId)
  if ('response' in gate) return gate.response

  // Scoped to the caller's own claim by the query, so a release cannot take
  // somebody else's — which matters because this is the one call the editor
  // fires from an unload handler, where nothing is watching the result.
  await releaseClaim(gate.supabase, xpId, gate.userId)
  return NextResponse.json({ held: false })
}

/**
 * Everything both verbs need, or the reason neither may run.
 *
 * Guarded on `edit` rather than `read`: a claim is a statement about who is
 * changing something, and somebody who may only look at a project has nothing
 * to claim. It also means the claim table cannot be used to find out whether a
 * project exists by somebody who could not otherwise tell.
 */
async function guard(
  xpId: string,
): Promise<
  | { response: NextResponse }
  | { supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
> {
  const user = await getUser()
  if (!user) return { response: new NextResponse('Not found', { status: 404 }) }

  const supabase = await createClient()
  const project = await findXpProject(supabase, xpId)
  if (!project) return { response: new NextResponse('Not found', { status: 404 }) }

  const verdict = mayDo(project, 'edit', {
    accountId: user.id,
    space: await spaceFor(supabase, project.tenantId),
    grant: await readGrant(supabase, xpId, user.id),
    operator: false,
  })
  if (!verdict.allowed) {
    return { response: NextResponse.json({ error: verdict.reason }, { status: 403 }) }
  }

  return { supabase, userId: user.id }
}

/**
 * A name rather than a uuid.
 *
 * The whole reason the claim is a row somebody else can read is so the second
 * editor is told *who* has it. "Held by 8f3c-…" is the same as "no" with extra
 * characters, and in a space of four people knowing it is Ana is usually enough
 * to resolve it without us.
 */
async function nameFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
): Promise<string> {
  try {
    const usernames = await readUsernames(supabase, [accountId])
    return displayNameFrom(usernames, accountId)
  } catch {
    return 'somebody else'
  }
}

async function spaceFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
) {
  const { data } = await supabase
    .from('tenants_read_model')
    .select('slug')
    .eq('id', tenantId)
    .maybeSingle()

  if (!data) return null
  try {
    return await requireTenant(data.slug)
  } catch {
    return null
  }
}
