import {
  AccessSettings,
  type LimitSetting,
} from '@/app/ovaloffice/access/access-settings'
import { ApplicationQueue } from '@/app/ovaloffice/access/application-queue'
import { type AdminGuestLink, GuestLinkList } from '@/app/ovaloffice/access/guest-link-list'
import { InviteList } from '@/app/ovaloffice/access/invite-list'
import {
  type ApplicationStatus,
  countLiveInvites,
  listApplications,
  listInvites,
} from '@/domain/access/queries'
import {
  FEATURES,
  featureOverrideScope,
  featureValueSpec,
  VALUED_FEATURE_KEYS,
} from '@/domain/flags/keys'
import { listFeatureFlags } from '@/domain/flags/queries'
import { listAllGuestLinks } from '@/domain/guests/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * Who gets in.
 *
 * The three things on this page are one decision seen from three sides - the
 * door, the queue behind it, and the keys handed out - so they are one page
 * rather than three. An admin closing registration wants to see, in the same
 * glance, how many people that leaves waiting.
 *
 * The seat limit sits here too rather than with the other feature flags on the
 * overview, because it answers the same question as the rest of this page: how
 * many people, and which ones. It is still the same flag, edited through the
 * same actions - this is a second door onto it, not a second setting.
 */
export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const { supabase, admin } = await requireBackofficeSection('access')

  const filter: ApplicationStatus | 'all' =
    status === 'invited' || status === 'rejected' || status === 'all' ? status : 'pending'

  const [applications, pending, invites, flags, guestLinks] = await Promise.all([
    listApplications(admin, filter),
    // The queue count is always the pending one, whatever is being shown, so
    // the heading does not change meaning when the filter does.
    listApplications(admin, 'pending'),
    listInvites(admin),
    listFeatureFlags(supabase, admin),
    listAllGuestLinks(admin),
  ])

  /**
   * Names for the spaces those links point into.
   *
   * One query for the distinct set rather than a join in `listAllGuestLinks`,
   * which would make that query's shape depend on this page. A backoffice list
   * of tokens against bare uuids is unreadable, and "which space is this" is
   * the first thing an admin asks of every row.
   */
  const tenantIds = [...new Set(guestLinks.map((link) => link.tenantId))]

  const { data: tenantRows } = tenantIds.length
    ? await admin
        .from('tenants_read_model')
        .select('id, name, slug')
        .in('id', tenantIds)
    : { data: [] }

  const tenants = new Map((tenantRows ?? []).map((row) => [row.id, row]))

  const adminGuestLinks: AdminGuestLink[] = guestLinks.map((link) => ({
    ...link,
    // A link whose space has been deleted still deserves a row - it is exactly
    // the kind of thing somebody should be able to see and revoke.
    tenantName: tenants.get(link.tenantId)?.name ?? 'Unknown space',
    tenantSlug: tenants.get(link.tenantId)?.slug ?? link.tenantId.slice(0, 8),
  }))

  const registration = flags.find((flag) => flag.key === 'open_registration')

  /**
   * One card for every flag that carries a number.
   *
   * Driven from the registry rather than named here, so a new valued flag in
   * `flags/keys.ts` appears on this page without anybody remembering it exists.
   * The unit and the bounds come from the same place, which is what stops a
   * `match_limit` input inheriting `seat_limit`'s range and offering ten
   * thousand concurrent battles.
   *
   * A flag missing from `listFeatureFlags` has no row yet - a migration that
   * has not run here, or a key added in code first. It still gets a card, off,
   * showing the registry's own minimum, because a backoffice that silently
   * omits a control is harder to diagnose than one showing a control that does
   * nothing yet.
   */
  const limits: LimitSetting[] = VALUED_FEATURE_KEYS.map((key) => {
    const spec = featureValueSpec(key)
    const row = flags.find((flag) => flag.key === key)

    return {
      key,
      label: row?.label ?? FEATURES[key].label,
      unit: spec?.unit ?? '',
      min: spec?.min ?? 1,
      max: spec?.max ?? 10_000,
      scope: featureOverrideScope(key),
      enabled: row?.enabled ?? false,
      value: row?.valueInt ?? spec?.min ?? 1,
      overrides: row?.overrides ?? [],
    }
  })

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-lg font-semibold">Access</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Whether anybody can sign up, who is waiting if they cannot, and how many
          people fit in a space. The landing page says whichever of these is in
          force.
        </p>
      </div>

      <AccessSettings
        registrationOpen={registration?.enabled ?? false}
        limits={limits}
        pendingCount={pending.length}
      />

      <ApplicationQueue applications={applications} filter={filter} pending={pending.length} />

      <InviteList invites={invites} live={countLiveInvites(invites)} />

      {/* Below the invites, because they answer neighbouring questions in
          decreasing order of consequence: an invite creates an account that
          outlives everything, a guest link lets somebody stand in one room
          until it expires. */}
      <GuestLinkList links={adminGuestLinks} />
    </div>
  )
}
