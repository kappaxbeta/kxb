import type { Metadata } from 'next'
import { EventBannerForm } from '@/app/t/[slug]/settings/event-banner-form'
import { EventDesk } from '@/app/t/[slug]/settings/event-desk'
import { EventHeaderForm } from '@/app/t/[slug]/settings/event-header-form'
import { SettingsForm } from '@/app/t/[slug]/settings/settings-form'
import { StorageCard } from '@/app/t/[slug]/settings/space/storage-card'
import { listBanners } from '@/domain/events/banners'
import { linkProblem } from '@/domain/guests/application'
import { listGuestLinks } from '@/domain/guests/queries'
import {
  GUEST_WRITE_CAPABILITIES,
} from '@/domain/tenants/events'
import { findPublicTenant } from '@/domain/tenants/queries'
import { spaceXpBytes, storeOverview } from '@/domain/xps/queries'
import { env } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasTier, requireTenant } from '@/lib/tenant'
import { CAPS } from '@/lib/xp-formats'
import { readLocale } from '@/app/i18n/preference'
import { settingsDict } from '@/app/i18n/settings'
import { fill } from '@/app/i18n/fill'

/** The tab, in the reader's language. The layout adds the space's name. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: settingsDict(await readLocale()).metaSpace }
}

/**
 * The space's half: what it is called, what it shows the outside world, and -
 * for an event - what its hosts have opened up.
 *
 * A member who is not an owner or an admin still sees this, read-only, which is
 * why it is a page of its own rather than an owner-gated section: knowing how
 * the space is configured is not the same as being able to change it, and the
 * controls already say which of the two you have.
 */
export default async function SpaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const locale = await readLocale()
  const context = await requireTenant(slug)
  const { tenant, supabase } = context

  const publicView = await findPublicTenant(supabase, tenant.id)
  const isPublicLounge = publicView?.isPublicLounge ?? true

  const isOwnerOrAdmin = tenant.role === 'owner' || tenant.role === 'admin'

  /**
   * What the public page has to choose from.
   *
   * Only fetched for an event whose leadership is looking, which is the same
   * gate the card itself has - an ordinary space pays nothing for a feature it
   * does not have, and the guest links in particular are read through the
   * service role and carry live tokens, so building this list *is* the access
   * check rather than something the card decides after the fact.
   */
  const publicPage =
    context.event && isOwnerOrAdmin
      ? await (async () => {
          const [banners, guestLinks] = await Promise.all([
            listBanners(supabase, tenant.id),
            listGuestLinks(createAdminClient(), tenant.id, tenant.slug),
          ])

          return {
            banners: banners.map((banner) => ({
              id: banner.id,
              name: banner.name,
              hasPoster: banner.posterSlug !== null,
            })),
            /**
             * The links, named as a person would name them.
             *
             * No token crosses into the client here, unlike the guest rail
             * which needs them to be copied. The picker only has to say which
             * link is which, and the id is enough for that - so this card is
             * one fewer page with a live invitation sitting in its source.
             */
            links: guestLinks.map((link) => {
              const problem = linkProblem({
                maxUses: link.maxUses,
                uses: link.uses,
                expiresAt: link.expiresAt,
                revokedAt: link.revokedAt,
              })
              const words = settingsDict(locale).event
              const used =
                link.maxUses === null
                  ? words.linkOpen
                  : fill(words.linkUsed, { uses: link.uses, max: link.maxUses })
              return {
                id: link.id,
                label: `${link.label ?? words.unnamedLink} — ${used}`,
                problem,
              }
            }),
          }
        })()
      : null

  /**
   * What the space is holding, for whoever answers for it.
   *
   * docs/xp/state.md §7.5 Reading A, at space scale: the project page answers
   * it for one game, asked by the person looking at that game, and this is the
   * same question asked by the person who answers for the whole space — "are
   * our games keeping something about the people who play them".
   *
   * Gated three ways and all three are the neighbours' gates rather than new
   * ones: `xo` because that is where projects begin and a space below it has
   * none to hold anything, and owner-or-admin because `xp_store_overview`
   * refuses everybody else anyway — asking as a member is a round trip whose
   * answer is always empty. `hasTier` rather than `requireTier`, because this
   * page belongs to every space and a missing card is the right way for it to
   * be absent.
   */
  const storage =
    isOwnerOrAdmin && hasTier(context, 'xo')
      ? await (async () => {
          const [held, lines] = await Promise.all([
            spaceXpBytes(supabase, tenant.id),
            storeOverview(supabase, tenant.id),
          ])
          return { held, lines }
        })()
      : null

  return (
    <div className="space-y-6">
      {/*
        Only for an event, and only for the people running it. An ordinary
        space never sees this card, which is why it is a conditional rather
        than a panel that renders empty.
      */}
      {/*
        Above the desk, because it is the thing a host changes on the day and
        the switches are the thing they set once. Same gate: an event, and
        somebody running it.
      */}
      {context.event && isOwnerOrAdmin && (
        <EventHeaderForm
          slug={slug}
          initialHeadline={context.event.headline}
          initialBlurb={context.event.blurb}
          initialLinks={context.event.links}
        />
      )}

      {/*
        Under the header form, because the two are read in the order somebody
        does them: write what the event says, then decide who gets to see it
        from outside.
      */}
      {context.event && publicPage && (
        <EventBannerForm
          slug={slug}
          banners={publicPage.banners}
          links={publicPage.links}
          initialBannerId={context.event.bannerId}
          initialLinkId={context.event.bannerLinkId}
          featured={context.event.featured}
          appUrl={env.appUrl()}
        />
      )}

      {context.event && isOwnerOrAdmin && (
        <EventDesk
          slug={slug}
          phase={context.event.phase}
          closesAt={
            context.event.phase === 'upcoming'
              ? context.event.opensAt
              : context.event.closesAt
          }
          switches={GUEST_WRITE_CAPABILITIES.map((capability) => ({
            key: capability,
            label: settingsDict(locale).space.capabilities[capability],
            on: context.tenant.capabilities[capability] ?? true,
            // `build` is spelled `build` in both vocabularies, and so is every
            // other one here - the two lists were deliberately kept in the same
            // words so this line is a membership test rather than a mapping
            // table that could fall out of date.
            allowed: context.event!.guestWrites.includes(capability),
          }))}
        />
      )}

      <SettingsForm
        slug={slug}
        initialName={tenant.name}
        initialIsPublicLounge={isPublicLounge}
        initialChatEnabled={tenant.chatEnabled}
        // The flag alone, not `chatOpen(context)`: this is the control that
        // *changes* the space's half of that answer, so gating it on the
        // combined one would make it impossible to switch back on.
        chatAvailable={context.features.chat}
        // Absent means on - the rule `capabilityOn` writes down once - so a
        // space that has never touched this reads as having matches, which is
        // what every space has had since the battle system shipped.
        initialMatchesEnabled={context.tenant.capabilities.battle ?? true}
        matchesAvailable={context.features.battle}
        // The one capability that defaults *off* rather than on - see
        // `perfDisplayOn`. No space has ever had this, so a missing row must
        // read as "not asked for" rather than as "always had it".
        initialPerfDisplay={context.tenant.capabilities.perf_display ?? false}
        perfAvailable={context.features.perf}
        isOwnerOrAdmin={isOwnerOrAdmin}
      />

      {/*
        Last, under the things somebody came here to change. Nothing on this
        card is a control — it is the space read back to whoever runs it, and a
        page reads better when what you can do comes before what is true.
      */}
      {storage && (
        <StorageCard
          slug={slug}
          held={storage.held}
          cap={CAPS.spaceBytes}
          lines={storage.lines}
          locale={locale}
        />
      )}
    </div>
  )
}
