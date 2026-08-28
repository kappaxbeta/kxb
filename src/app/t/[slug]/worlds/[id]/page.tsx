import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { WorldDetailView } from '@/app/worlds/world-detail'
import { findRoom } from '@/domain/rooms/queries'
import { listMyTenants } from '@/domain/tenants/queries'
import { findWorld, readMyReports, recordWorldView } from '@/domain/worlds/queries'
import { requireFeature, requireTenant } from '@/lib/tenant'
import { readLocale } from '@/app/i18n/preference'
import { workspaceDict } from '@/app/i18n/workspace'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}): Promise<Metadata> {
  const { slug, id } = await params
  const context = await requireTenant(slug)
  const world = await findWorld(context.supabase, id)

  // A world's own name is never translated - it is what somebody called it.
  return world
    ? { title: world.name }
    : { title: workspaceDict(await readLocale()).titles.world }
}

/**
 * A world, without leaving the workspace.
 *
 * The same view as the public page, inside the tenant layout - which is the
 * entire reason it exists. A member browsing the catalogue from their space
 * used to follow a link to /worlds and lose the rail, the rooms, the people and
 * the way back; the only route home was the browser's Back button. A catalogue
 * you have to leave your space to read is one people read once.
 *
 * Everything that decides *what* is shown is still in `findWorld` and its
 * policies, so this page can be a thinner thing than it looks: membership gets
 * you the frame, and the row's own rules get you the world.
 */
export default async function SpaceWorldPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<{ room?: string }>
}) {
  const { slug, id } = await params
  const { room } = await searchParams

  const context = await requireTenant(slug)
  requireFeature(context, 'worlds')

  const { supabase, tenant, user } = context

  const world = await findWorld(supabase, id)
  if (!world) notFound()

  await recordWorldView(supabase, world.id, user.id, world.authorId)
  const myReport = await readMyReports(supabase, user.id, world.id)

  const spaces = (await listMyTenants(supabase, user.id))
    .filter((tenant) => !tenant.archived)
    .map((tenant) => ({ slug: tenant.slug, name: tenant.name }))

  // Proven this tenant's own rather than trusted because it arrived in the
  // URL - the same check the list page makes, so a stray or foreign id just
  // falls back to the ordinary "use in my space" actions instead of leaking
  // another tenant's room name.
  const pickingRoom = room ? await findRoom(supabase, room) : null
  const forRoom = pickingRoom && pickingRoom.tenantId === tenant.id ? pickingRoom : null
  const roomQuery = forRoom ? `?room=${forRoom.roomId}` : ''

  return (
    <WorldDetailView
      world={world}
      spaces={spaces}
      signedIn
      mine={world.authorId === user.id}
      myReport={myReport}
      // Every link stays inside the space, so browsing the catalogue never
      // walks you out of it. Carrying `?room=` along keeps "picking a world
      // for this room" the mode you're in until you leave it on purpose.
      backHref={`/t/${slug}/worlds${roomQuery}`}
      hrefFor={(other) => `/t/${slug}/worlds/${other}${roomQuery}`}
      tagHref={(tag) => `/t/${slug}/worlds?tag=${tag}`}
      intoRoom={forRoom ? { slug, id: forRoom.roomId, name: forRoom.name } : undefined}
    />
  )
}
