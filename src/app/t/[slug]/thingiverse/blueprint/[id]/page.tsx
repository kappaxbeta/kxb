import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { readLocale } from '@/app/i18n/preference'
import { workspaceDict } from '@/app/i18n/workspace'
import { Composer } from '@/app/t/[slug]/thingiverse/blueprint/[id]/composer'
import { readAvatarHere } from '@/domain/profile/avatar-queries'
import { readXpBody } from '@/domain/skins/queries'
import { thingiverseProjection } from '@/domain/thingiverse/projection'
import { coinsOf, nextPrice } from '@/domain/bank/next'
import { countVehicles, findBlueprint, listClips } from '@/domain/thingiverse/queries'
import { runProjection } from '@/es/projection'
import { requireTenant, requireThingiverse } from '@/lib/tenant'

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
  requireThingiverse(context)

  const { supabase, tenant, user } = context

  await runProjection(supabase, thingiverseProjection, tenant.id)
  /*
    The blueprint, and the body that is going to be seen holding it.

    Read here rather than inside the grip panel because it is two queries and
    this is the server: which peep somebody wears in this space, and whether
    they have an XP body on instead. The same pair the showcase reads, and for
    the same reason it reads both - `show_xp` decides which of the two a room
    actually draws, and guessing gets a Knight into a lounge.
  */
  const [blueprint, avatar, body, clips] = await Promise.all([
    findBlueprint(supabase, tenant.id, user.id, id),
    readAvatarHere(supabase, user.id, tenant.id),
    readXpBody(supabase, user.id),
    /*
      What this space has animated, for the seat pickers and for the preview.

      The whole `ClipView` rather than the names, because the body standing in
      the first seat has to actually *play* the clip somebody just chose - a
      picker whose preview cannot show you the answer is a picker you check by
      saving and summoning. The samples travel with the row for exactly this
      reason; see `listClips`.
    */
    listClips(supabase, tenant.id, user.id),
  ])

  // A blueprint that is not there, is retired, or belongs to somebody else and
  // is private, are one answer as far as this route is concerned. Saying which
  // would be telling somebody a private blueprint exists.
  if (!blueprint) notFound()

  const t = workspaceDict(await readLocale()).thingiverse

  /*
    What ticking the vehicle box will cost. Read here rather than in the
    composer for the reason every other price on this branch is: it comes from
    `nextPrice`, which is also what `reshapeBlueprint` charges from, so the
    number beside the checkbox and the number out of the purse are one answer.
  */
  const vehiclePrice = coinsOf(
    await nextPrice(
      supabase,
      tenant.id,
      tenant.tier,
      'vehicles',
      await countVehicles(supabase, tenant.id),
    ),
  )

  return (
    <Composer
      slug={slug}
      blueprint={blueprint}
      vehiclePrice={vehiclePrice}
      body={{ avatar, skin: body.inLounge ? body.model : null }}
      clips={clips}
      t={t}
    />
  )
}
