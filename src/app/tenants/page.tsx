import Link from 'next/link'
import { redirect } from 'next/navigation'
import { signOut } from '@/app/(auth)/actions'
import { CreateTenantForm } from '@/app/tenants/create-tenant-form'
import { GuestPicker } from '@/app/tenants/guest-picker'
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
import { createAdminClient } from '@/lib/supabase/admin'
import { listMyInvitations, listMyTenants } from '@/domain/tenants/queries'
import { requireUser } from '@/lib/auth'

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

  const [tenants, invitations, entitlement, features, canRedeem, canClaim, grant] =
    await Promise.all([
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
    ])

  // Has to agree with the gate in createTenant, which skips its Stripe check on
  // exactly this condition. If the two disagree the failure is silent in the
  // worst direction: a comped account is shown a form the server will refuse.
  const canCreate = entitlement.canCreate || !features.billing

  const locale = await readLocale()
  const t = spacesDict(locale)

  const active = tenants.filter((tenant) => !tenant.archived)
  const archived = tenants.filter((tenant) => tenant.archived)

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {fill(t.signedInAs, { email: user.email ?? '' })}
          </p>
          {/*
            A free month has to be visible while it is running, not only on the
            day it ends. It is the one thing holding these spaces open, and
            somebody who redeemed a code three weeks ago has no other way to
            find out how long is left - the subscription copy elsewhere is all
            about a payment that was never made.
          */}
          {grant?.live && (
            <p className="mt-1 text-sm text-accent">
              {/* A grant with no end has no days to count down, so the sentence
                  changes rather than printing "0 days left" or a date a century
                  out. `describeGrantEnd` is where all three readings live. */}
              {grant.until === null
                ? t.grantForever
                : fill(t.grantRunning, {
                    when: describeGrantEnd(grant.until, new Date(), locale),
                  })}
            </p>
          )}
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-surface-raised"
          >
            {t.signOut}
          </button>
        </form>
      </header>

      {invitations.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold">{t.invitations}</h2>
          <ul className="mt-2 space-y-1.5">
            {invitations.map((invitation) => (
              <li
                key={invitation.tenantId}
                className="flex items-center gap-3 rounded-lg border border-accent/40 bg-surface-raised px-3 py-2.5"
              >
                <span className="flex-1 text-sm">
                  {invitation.tenantName}
                  <span className="ml-2 text-xs text-ink-muted">
                    {fill(t.asRole, { role: invitation.role })}
                  </span>
                </span>
                <Link
                  href="/invitations"
                  className="text-sm font-medium text-accent hover:underline"
                >
                  {t.respond}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <ul className="space-y-1.5">
          {active.map((tenant) => (
            <li key={tenant.id}>
              <Link
                href={`/t/${tenant.slug}`}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface-raised px-3 py-2.5 transition hover:border-accent"
              >
                <span className="flex-1 text-sm font-medium">{tenant.name}</span>
                <span className="font-mono text-xs text-ink-muted">/t/{tenant.slug}</span>
                <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink-muted">
                  {/* Role then plan, matching the account block in the rail:
                      what you are here, then what the space is on. */}
                  {tenant.role} <span className="opacity-60">· {tenant.tier}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {active.length === 0 && (
          <p className="text-sm text-ink-muted">{t.noSpaces}</p>
        )}

        {archived.length > 0 && (
          <>
            <h2 className="mt-8 text-sm font-semibold">{t.archived}</h2>
            <ul className="mt-2 space-y-1.5">
              {archived.map((tenant) => (
                <li key={tenant.id}>
                  <Link
                    // The space itself. `/tasks` is a 404 wherever the flag is
                    // off, which is everywhere by default - see the note in
                    // `createTenant`.
                    href={`/t/${tenant.slug}`}
                    className="flex items-center gap-3 rounded-lg border border-dashed border-line px-3 py-2.5 text-ink-muted transition hover:border-accent"
                  >
                    <span className="flex-1 text-sm">{tenant.name}</span>
                    <span className="font-mono text-xs">/t/{tenant.slug}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/*
        The answer /code/[code] redirected with.

        It has to render on a cold load, which is why it travels as a query
        parameter rather than as anything held in memory - the route handler
        that decided it has already finished, and this page may be the first
        thing rendered in a browser that has never seen the app.

        The refusal wording is the domain's, not this page's. Somebody who
        followed the same poster link twice gets told they have already had
        their month, in exactly the words the redeem box would have used.
      */}
      {promo === 'ok' && grant && (
        <p className="mt-8 rounded-lg border border-accent/50 bg-surface-raised px-4 py-3 text-sm">
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
      {/* The guard order matters: `isRedeemOutcome` is what narrows the string
          to an outcome, and only then can `!== 'ok'` narrow it to a refusal. */}
      {isRedeemOutcome(promo) && promo !== 'ok' && (
        <p className="mt-8 rounded-lg border border-line px-4 py-3 text-sm text-ink-muted">
          {refusalForLocale(promo, locale)}
        </p>
      )}

      {checkout === 'success' && (
        <p className="mt-8 rounded-lg border border-accent/50 bg-surface-raised px-4 py-3 text-sm">
          {t.checkoutDone}
        </p>
      )}
      {checkout === 'canceled' && (
        <p className="mt-8 rounded-lg border border-line px-4 py-3 text-sm text-ink-muted">
          {t.checkoutCancelled}
        </p>
      )}

      {/*
        The create form only appears with a seat to spend. Showing it otherwise
        means the only way to discover the subscription requirement is to fill
        it in and be refused - the gate in createTenant still enforces this, but
        a form you cannot submit is not a gate, it is a trap.
      */}
      {canCreate ? (
        <CreateTenantForm locale={locale} />
      ) : (
        <SubscribePrompt
          entitlement={entitlement}
          locale={locale}
          canRedeem={canRedeem}
          canClaim={canClaim}
        />
      )}
    </div>
  )
}
