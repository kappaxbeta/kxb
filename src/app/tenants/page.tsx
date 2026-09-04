import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { signOut } from '@/app/(auth)/actions'
import { CreateTenantForm } from '@/app/tenants/create-tenant-form'
import { GuestPicker } from '@/app/tenants/guest-picker'
import { Lobby } from '@/app/tenants/lobby'
import { SubscribePrompt } from '@/app/tenants/subscribe-prompt'
import {
  readEntitlementRefreshingIfInactive,
  syncUserEntitlement,
} from '@/domain/billing/entitlement'
import { isRegistrationOpen, resolveFeatures } from '@/domain/flags/queries'
import { describeGrantEnd, isRedeemOutcome, refusalForLocale } from '@/domain/promo/application'
import { fill } from '@/app/i18n/fill'
import { readLocale } from '@/app/i18n/preference'
import { spacesDict } from '@/app/i18n/spaces'
import { readGrant } from '@/domain/promo/queries'
import { mayRedeem } from '@/domain/promo/redeem'
import { mayClaimFreeMonth } from '@/domain/promo/winback'
import { landingPath } from '@/domain/tenants/last-space'
import { readProfileAvatar, readShowXp } from '@/domain/profile/avatar-queries'
import { shopFor } from '@/domain/skins/queries'
import { readDisplayName } from '@/domain/profile/username-queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { listMyInvitations, listMyTenants } from '@/domain/tenants/queries'
import { requireUser } from '@/lib/auth'
import { LAST_SPACE_COOKIE } from '@/lib/last-space'

export const dynamic = 'force-dynamic'

/**
 * The workspace picker - the one page in the app that is not inside a tenant.
 *
 * Note it does not run a projection. Membership comes from tenant_members,
 * which the database trigger keeps current, so this list is never stale even
 * though tenants_read_model might briefly be.
 */
export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; promo?: string }>
}) {
  const { user, supabase } = await requireUser()
  const { checkout, promo } = await searchParams

  /**
   * A visitor, before any of the member questions below are asked.
   *
   * Both halves of the condition say the same thing and both are worth having.
   * `is_anonymous` comes off the verified JWT and is the definition the rest of
   * the app uses - `requireTenant`, `landingPath`. The missing email is the
   * consequence, and it is the one this page would otherwise have printed:
   * "Signed in as " with nothing after it was the first symptom.
   *
   * Everything below is a member's page - an entitlement refresh keyed on an
   * email, a list from `tenant_members`, a form that sells a seat - and a guest
   * has none of the rows any of it reads. See <GuestPicker> for why they get
   * their own view rather than four hidden sections, and in particular why the
   * sign-out button must not be among them.
   */
  if (user.is_anonymous || !user.email) {
    /**
     * `landingPath` answers "where does this session belong" for guests
     * already: the room they were admitted to while the admission is live,
     * `/g/left` once it is not. Reusing it means the way back on this page
     * cannot disagree with the way back everywhere else - and a visitor whose
     * afternoon ended mid-click gets the goodbye page rather than a button
     * leading to a 404.
     */
    const back = await landingPath(supabase, user)
    if (!back.startsWith('/t/')) redirect(back)

    return (
      <GuestPicker
        back={back}
        registrationOpen={await isRegistrationOpen(supabase)}
        locale={await readLocale()}
      />
    )
  }

  // Coming straight back from Stripe, the cached entitlement is one sync behind
  // reality - and this is precisely the moment someone tries to spend the seat
  // they just bought. Refresh before reading, rather than telling a paying
  // customer to wait for tonight's job.
  if (checkout === 'success' && user.email) {
    try {
      await syncUserEntitlement(
        createAdminClient() as unknown as typeof supabase,
        user.id,
        user.email,
      )
    } catch {
      // The daily job will catch it. Not worth failing the page over.
    }
  }

  const [
    tenants,
    invitations,
    entitlement,
    features,
    canRedeem,
    canClaim,
    grant,
    avatar,
    username,
    wardrobe,
    showXp,
  ] = await Promise.all([
    listMyTenants(supabase, user.id),
    listMyInvitations(supabase),
    readEntitlementRefreshingIfInactive(
      supabase,
      createAdminClient() as unknown as typeof supabase,
      user.id,
      user.email,
    ),
    resolveFeatures(supabase),
    mayRedeem(supabase, user.id),
    mayClaimFreeMonth(supabase, user.id),
    readGrant(supabase, user.id),
    readProfileAvatar(supabase, user.id),
    readDisplayName(supabase, user.id),
    // The wardrobe, for the locker on the stage: what is owned, what is worn,
    // and whether the shelf is even open. The same read the shop page runs.
    shopFor(supabase, user.id),
    // And which of the two bodies rooms draw. A mode rather than a third body:
    // the locker holds both halves and this says which one is on screen.
    readShowXp(supabase, user.id),
  ])

  // Has to agree with the gate in createTenant, which skips its Stripe check on
  // exactly this condition. If the two disagree the failure is silent in the
  // worst direction: a comped account is shown a form the server will refuse.
  const canCreate = entitlement.canCreate || !features.billing

  const locale = await readLocale()
  const t = spacesDict(locale)

  const active = tenants.filter((tenant) => !tenant.archived)
  const archived = tenants.filter((tenant) => tenant.archived)

  /**
   * Where the ✕ goes back to, and which card the rail lights up first: the
   * space this session last stood in, if it is still one of yours. The proxy
   * rewrites the cookie on every request, so this is simply the most recent
   * room — no extra query, and no re-proving membership beyond the list
   * already fetched.
   */
  const lastSlug = (await cookies()).get(LAST_SPACE_COOKIE)?.value ?? null
  const backSlug = active.find((tenant) => tenant.slug === lastSlug)?.slug ?? null

  /**
   * Everything below the list is server-rendered and handed to the lobby as
   * slots, so the client component decides layout and nothing else. The
   * banner copy, the guard order on `isRedeemOutcome`, and the create-form
   * gate are unchanged from the list-page days — see the histories in
   * `application.ts` and `createTenant`.
   */
  /**
   * The banners, in a wrapper rather than in a fragment.
   *
   * A `<>` here is the obvious spelling and it is the one that warned. `Lobby`
   * is a Client Component and this is a slot passed across that boundary, so
   * the fragment does not stay a fragment: RSC serialises its children and the
   * client re-renders them as a *dynamic* array, which React then key-checks.
   * With one banner showing there is no array and nothing happens - which is
   * why it only ever appeared for somebody with two of them at once, and why
   * the warning named `<form action={signOut}>` (a sibling slot from the same
   * owner) rather than any of the paragraphs below.
   *
   * Keys on each `<p>` would also silence it. A wrapper is better: these are
   * one stack of banners rather than a list of independent things, they carry
   * their own `mb-3`, and one element cannot go back to being an array the next
   * time somebody adds a case.
   */
  const notices = (
    <div>
      {grant?.live && (
        <p className="mb-3 rounded-lg border border-accent/50 bg-surface-raised px-3 py-2.5 text-sm text-accent">
          {grant.until === null
            ? t.grantForever
            : fill(t.grantRunning, {
                when: describeGrantEnd(grant.until, new Date(), locale),
              })}
        </p>
      )}
      {promo === 'ok' && grant && (
        <p className="mb-3 rounded-lg border border-accent/50 bg-surface-raised px-3 py-2.5 text-sm">
          {grant.until === null ? (
            t.promoForever
          ) : (
            <>
              {t.promoLead}
              <span className="font-medium">
                {new Date(grant.until).toLocaleDateString(locale)}
              </span>
              {t.promoTail}
            </>
          )}
        </p>
      )}
      {isRedeemOutcome(promo) && promo !== 'ok' && (
        <p className="mb-3 rounded-lg border border-line px-3 py-2.5 text-sm text-ink-muted">
          {refusalForLocale(promo, locale)}
        </p>
      )}
      {checkout === 'success' && (
        <p className="mb-3 rounded-lg border border-accent/50 bg-surface-raised px-3 py-2.5 text-sm">
          {t.checkoutDone}
        </p>
      )}
      {checkout === 'canceled' && (
        <p className="mb-3 rounded-lg border border-line px-3 py-2.5 text-sm text-ink-muted">
          {t.checkoutCancelled}
        </p>
      )}
    </div>
  )

  return (
    <Lobby
      spaces={active.map(({ id, slug, name, role, tier }) => ({
        id,
        slug,
        name,
        role,
        tier,
      }))}
      archived={archived.map(({ id, slug, name, role, tier }) => ({
        id,
        slug,
        name,
        role,
        tier,
      }))}
      invitations={invitations.map(({ tenantId, tenantName, role }) => ({
        tenantId,
        tenantName,
        role,
      }))}
      avatar={avatar}
      showXp={showXp}
      username={username}
      wardrobe={wardrobe}
      email={user.email ?? ''}
      defaultSlug={backSlug ?? active[0]?.slug ?? null}
      backHref={backSlug ? `/t/${backSlug}` : null}
      locale={locale}
      notices={notices}
      footer={
        canCreate ? (
          // Bare once spaces exist: the lobby folds the form behind its own
          // "New space" summary, and the boxed version there would be a
          // heading inside a heading — the tour learned this first.
          <CreateTenantForm locale={locale} bare={active.length > 0} />
        ) : (
          <SubscribePrompt
            entitlement={entitlement}
            locale={locale}
            canRedeem={canRedeem}
            canClaim={canClaim}
          />
        )
      }
      signOutForm={
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-full border border-line px-3 py-1.5 text-sm text-ink-muted transition hover:border-accent hover:text-ink"
          >
            {t.signOut}
          </button>
        </form>
      }
    />
  )
}
