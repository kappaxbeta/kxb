import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EventConsole } from '@/app/ovaloffice/events/[tenantId]/event-console'
import { MachinePanel } from '@/app/ovaloffice/events/[tenantId]/machine-panel'
import { eventOrigin, getMachine } from '@/domain/events/machines'
import { guestLinkUrl } from '@/domain/guests/application'
import { env } from '@/lib/env'
import { getEvent } from '@/domain/events/queries'
import { roomOccupancy } from '@/domain/rooms/occupancy'
import { roomsProjection } from '@/domain/rooms/projection'
import { listRooms } from '@/domain/rooms/queries'
import {
  GUEST_WRITE_CAPABILITIES,
  SPACE_CAPABILITY_LABELS,
} from '@/domain/tenants/events'
import { listInvitations, listMembers } from '@/domain/tenants/queries'
import { StaffPanel } from '@/app/ovaloffice/events/[tenantId]/staff-panel'
import { runProjection } from '@/es/projection'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * One event's console.
 *
 * Shows both halves of every answer - what the platform allows, and what the
 * space's own staff currently have switched on - because the two are different
 * facts with different owners and collapsing them is how "the host turned tasks
 * off at lunchtime" becomes indistinguishable from "this event never had
 * tasks". Only the first half is editable here; the second belongs to the
 * event's admins, in the space.
 */
export default async function EventConsolePage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const { tenantId } = await params
  const { admin, user } = await requireBackofficeSection('events')

  const event = await getEvent(admin, tenantId)
  if (!event) notFound()

  const { data: tenant } = await admin
    .from('tenants_read_model')
    .select('name, slug, archived, capabilities')
    .eq('id', tenantId)
    .maybeSingle()

  if (!tenant) notFound()

  await runProjection(admin, roomsProjection, tenantId)
  const rooms = await listRooms(admin, tenantId, { includePrivate: true })
  const occupancy = await roomOccupancy(admin, tenantId, rooms, event)

  const [members, invitations] = await Promise.all([
    listMembers(admin, tenantId),
    listInvitations(admin, tenantId),
  ])

  /**
   * The live link, pointed at wherever this event currently is.
   *
   * Built here rather than read from a column, because an event moves: it
   * starts on kxb.team, may spend a weekend on its own box, and comes back. A
   * link stored at creation is wrong for two of those three phases - which is
   * how one event ends up with two different links and nobody sure which to
   * send.
   *
   * The *token* is stable across all of that; only the host changes. So the
   * token is read from whichever live link the space has, and the origin is
   * decided by the machine's state.
   */
  const machine = await getMachine(admin, tenantId)

  const { data: link } = await admin
    .from('guest_links')
    .select('token')
    .eq('tenant_id', tenantId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  /**
   * The link that works where the event actually is.
   *
   * A token is only meaningful in the database that minted it, and a box gets
   * its own during seeding - so pointing main's token at the box's hostname
   * produces a URL that is well-formed, looks entirely correct, and renders
   * "this link has expired" to everyone you sent it to. That is not a
   * hypothetical: it is what the console showed the first time a box came up.
   *
   * So once there is a machine, its `guest_url` is the answer, whole. Main's
   * token is right only while the event is still at home.
   */
  const onABox = machine?.status === 'ready' && machine.guestUrl

  const guestUrl = onABox
    ? machine.guestUrl
    : link
      ? guestLinkUrl(eventOrigin(tenant.slug, machine, env.appUrl()), link.token)
      : null

  const capabilities = (tenant.capabilities ?? {}) as Record<string, boolean>

  return (
    <div className="space-y-8">
      <div>
        <Link href="/ovaloffice/events" className="nav-link text-sm">
          &larr; Events
        </Link>
        <h2 className="mt-4 text-lg font-semibold">{tenant.name}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          <Link href={`/t/${tenant.slug}`} className="underline">
            /t/{tenant.slug}
          </Link>{' '}
          · {event.preset} ·{' '}
          {/*
            Counted here rather than linked to the space's own members page,
            because that page is a 404 for an operator now: building an event
            no longer makes you a member of it. The panel below is where staff
            are invited, and it appends to the same stream `inviteMember` does
            - the only difference is the flag that stands in for a role.
          */}
          {members.length} staff
        </p>
      </div>

      <StaffPanel
        tenantId={tenantId}
        slug={tenant.slug}
        members={members.map((member) => ({
          userId: member.userId,
          username: member.username,
          role: member.role,
        }))}
        invitations={invitations.map((invitation) => ({
          invitee: invitation.invitee,
          label: invitation.label,
          role: invitation.role,
        }))}
        viewerIsMember={members.some((member) => member.userId === user.id)}
      />

      <MachinePanel
        tenantId={tenantId}
        slug={tenant.slug}
        machine={machine}
        guestUrl={guestUrl}
      />

      <EventConsole
        tenantId={tenantId}
        slug={tenant.slug}
        event={event}
        rooms={rooms.map((room) => ({
          roomId: room.roomId,
          name: room.name,
          cap: room.cap,
          guestBuild: room.guestBuild,
          count: occupancy.get(room.roomId)?.count ?? 0,
          effectiveCap: occupancy.get(room.roomId)?.cap ?? null,
        }))}
        /**
         * The staff half, read-only here.
         *
         * Rendered rather than omitted because an operator diagnosing "the
         * attendees say they cannot post" needs to see which of the two levels
         * is saying no, and having to open the space as a member to find out
         * would make the console useless for exactly the question it is opened
         * for.
         */
        staffSwitches={GUEST_WRITE_CAPABILITIES.map((capability) => ({
          key: capability,
          label: SPACE_CAPABILITY_LABELS[capability],
          on: capabilities[capability] ?? true,
        }))}
      />
    </div>
  )
}
