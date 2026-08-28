import { NextResponse } from 'next/server'
import { requestRender, type RenderScope } from '@/domain/renders/actions'
import { requireApiUser } from './auth'

/**
 * The scene-to-image API.
 *
 * `POST /api/renders` with a shot document and get back an id. That is the
 * whole interface, and it is HTTP rather than only a server action because the
 * callers are not all React: a script re-shooting the landing page, a job
 * filling in thumbnails for a catalogue, a service that wants a still of
 * something it just published.
 *
 * It returns 202, not 200, and the distinction is load-bearing. Nothing has
 * been drawn when this replies - a job has been *registered*. Poll
 * `GET /api/renders/<id>` for the picture. A synchronous version of this
 * endpoint would hold a request open for however long a software rasteriser
 * takes on a shared box, which is the failure mode the queue exists to avoid.
 *
 * Authorization is entirely `requestRender`'s: the same flag, the same
 * membership check, the same row level security as the form path. This file
 * translates HTTP into that call and its answer back, and knows nothing else.
 */

export async function POST(request: Request) {
  // First, so that "you are not signed in" arrives as a 401 with a body rather
  // than as a redirect to a login page - see the note in ./auth.
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 })
  }

  /**
   * The one field this route reads rather than passes through.
   *
   * A space's render is scoped by *slug*, because that is what a caller knows
   * and what the URL of every space surface already carries. It is resolved to
   * a tenant id behind `requireTenant`, which is also the membership check - so
   * naming a space you do not belong to 404s rather than rendering for it.
   */
  const { tenantSlug, ...rest } = body as { tenantSlug?: unknown }
  if (tenantSlug !== undefined && typeof tenantSlug !== 'string') {
    return NextResponse.json({ error: 'tenantSlug must be a string' }, { status: 400 })
  }

  const scope: RenderScope = tenantSlug
    ? { kind: 'space', slug: tenantSlug }
    : { kind: 'platform' }

  const result = await requestRender(rest, scope)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ id: result.id, status: 'pending' }, { status: 202 })
}
