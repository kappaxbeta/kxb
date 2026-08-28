import type { Metadata } from 'next'
import Link from 'next/link'
import { RoomsPanel } from '@/app/t/[slug]/rooms/rooms-panel'
import { guestRoomSlug } from '@/domain/guests/application'
import { readGuestDestination } from '@/domain/guests/queries'
import { roomOccupancy } from '@/domain/rooms/occupancy'
import { roomsProjection } from '@/domain/rooms/projection'
import { listRooms } from '@/domain/rooms/queries'
import { runProjection } from '@/es/projection'
import { createAdminClient } from '@/lib/supabase/admin'
import { canWrite, hasRole, isGuest, requireFeature, requireTenant } from '@/lib/tenant'
import { workspaceDict } from '@/app/i18n/workspace'
import { readLocale } from '@/app/i18n/preference'


/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).titles.rooms }
}

export const dynamic = 'force-dynamic'

/**
 * Everywhere in this space you can stand.
 *
 * The lounge is listed first and is not one of these rows: it is the room every
 * space has and cannot close, so it has no id here and nothing to manage. The
 * rest are rooms somebody opened, each with a world and a channel of its own.
 */
export default async function RoomsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const context = await requireTenant(slug, { guests: true })
  const { supabase, tenant } = context

  requireFeature(context, 'lounge')

  await runProjection(supabase, roomsProjection, tenant.id)
  const all = await listRooms(supabase, tenant.id)

  /**
   * A guest sees the room they were invited into, and nothing else.
   *
   * The same rule the rail applies, applied again here rather than trusted to
   * the layout: this page is reachable directly, and a list somebody can get by
   * typing a URL is not filtered by a component that draws a sidebar. See
   * `guestRoomSlug` for why the full list is not a guest's to read.
   */
  const invited = isGuest(context)
    ? guestRoomSlug(
        await readGuestDestination(
          supabase,
          createAdminClient(),
          tenant.id,
          context.user.id,
        ),
        slug,
      )
    : null

  /**
   * ...unless this is an event, where the whole point is that they can move.
   *
   * An event's guests are its attendees, not visitors to somebody's workspace.
   * Confining each of them to the one room their link named would break the
   * two things rooms are there for at an event: spreading eighty people out so
   * no single room takes the Realtime budget down, and letting somebody walk
   * from the talk to the jam. The ceiling still decides - this only widens for
   * an event whose `surfaces` list includes rooms, which `requireTenant` has
   * already checked to let them load this page at all.
   */
  const eventGuest = isGuest(context) && context.event !== null

  const rooms =
    isGuest(context) && !eventGuest
      ? invited
        ? all.filter((room) => room.slug === invited)
        : []
      : all

  const occupancy = await roomOccupancy(supabase, tenant.id, rooms, context.event)
  const t = workspaceDict(await readLocale()).rooms

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">{t.heading}</h2>
        <p className="text-sm text-ink-muted">{t.body}</p>
      </div>

      <Link
        href={`/t/${slug}/lounge`}
        className="flex items-center justify-between gap-3 rounded-xl border border-accent/50 bg-accent/10 p-4 transition hover:border-accent"
      >
        <span>
          <span className="block font-medium">{t.theLounge}</span>
          <span className="block text-xs text-ink-muted">{t.theLoungeBody}</span>
        </span>
        <span aria-hidden className="text-ink-muted">
          →
        </span>
      </Link>

      <RoomsPanel
        slug={slug}
        rooms={rooms}
        occupancy={Object.fromEntries(occupancy)}
        isEvent={context.event !== null}
        canManage={canWrite(context) && hasRole(context, ['owner', 'admin'])}
      />

    </div>
  )
}
