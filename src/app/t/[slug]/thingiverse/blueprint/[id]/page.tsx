import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { readLocale } from '@/app/i18n/preference'
import { workspaceDict } from '@/app/i18n/workspace'
import { Composer } from '@/app/t/[slug]/thingiverse/blueprint/[id]/composer'
import { thingiverseProjection } from '@/domain/thingiverse/projection'
import { findBlueprint } from '@/domain/thingiverse/queries'
import { runProjection } from '@/es/projection'
import { requireFeature, requireTenant, requireTier } from '@/lib/tenant'

export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).thingiverse.composer.heading }
}

export const dynamic = 'force-dynamic'

/**
 * The bench a thing is built on.
 *
 * ---------------------------------------------------------------------------
 * Why this is a route and not a panel on the shelf
 * ---------------------------------------------------------------------------
 * The shelf's row editor is a form: nine fields, one Save, read while scanning a
 * list. It is the right shape for "make this bounce". It is the wrong shape for
 * *composing*, because composing is a spatial act - you are deciding that the
 * lamp goes at the left end of the bench, and no arrangement of number fields
 * will tell you whether it does. That needs a viewport, room to orbit, and the
 * whole width of the screen.
 *
 * So it is its own address, in the studio's own shape: a stage that keeps the
 * screen and a column of controls beside it. Same reason `/ovaloffice/studio`
 * is not a panel inside the backoffice dashboard.
 *
 * It deliberately does **not** carry the rails. A composer with the space's
 * navigation down one side and the roster down the other is a viewport in the
 * middle third of a monitor - see the layout, which drops its chrome for this
 * segment.
 *
 * ---------------------------------------------------------------------------
 * Both gates, and a third
 * ---------------------------------------------------------------------------
 * The flag and the tier as everywhere else, plus `mine`: the decider refuses a
 * reshape from anybody but the owner or an admin, and an editor whose every Save
 * comes back refused is a worse way of saying "not yours" than not opening. The
 * shelf makes the same call about the rows it will not let you expand.
 */
export default async function BlueprintComposerPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params

  const context = await requireTenant(slug)
  requireFeature(context, 'thingiverse')
  requireTier(context, 'xo')

  const { supabase, tenant, user } = context

  await runProjection(supabase, thingiverseProjection, tenant.id)
  const blueprint = await findBlueprint(supabase, tenant.id, user.id, id)

  // A blueprint that is not there, is retired, or belongs to somebody else and
  // is private, are one answer as far as this route is concerned. Saying which
  // would be telling somebody a private blueprint exists.
  if (!blueprint) notFound()

  const t = workspaceDict(await readLocale()).thingiverse

  return <Composer slug={slug} blueprint={blueprint} t={t} />
}
