import type { Metadata } from 'next'
import { EventBanner } from '@/app/t/[slug]/event-banner'
import { PageChrome } from '@/app/t/[slug]/page-chrome'
import { VerifyEmailBanner } from '@/app/t/[slug]/verify-email-banner'
import { LocaleProvider } from '@/app/i18n/locale-context'
import { SpaceProvider } from '@/app/t/[slug]/space-context'
import { railDict } from '@/app/i18n/rail'
import { readLocale } from '@/app/i18n/preference'
// `ViewTransition` ships in React's canary channel, which is what the App
// Router runs on. Its types come from `react-canary.d.ts` at the repo root -
// see the note there for why they are not imported here.
import { Suspense, ViewTransition } from 'react'
import { BackgroundMusic } from '@/app/components/audio/background-music'
import { ShootingStars } from '@/app/components/shooting-stars'
import { PartyRail } from '@/app/world/_hud/party-rail'
import { GuestPulse } from '@/app/t/[slug]/guest-pulse'
import { Sidebar } from '@/app/t/[slug]/sidebar'
import { WorkspaceDeactivated } from '@/app/t/[slug]/deactivated'
import { readEntitlement } from '@/domain/billing/entitlement'
import { EVENT_SURFACES } from '@/domain/events/presets'
import { guestCanReach } from '@/domain/events/queries'
import { chatProjection } from '@/domain/chat/projection'
import { listChatMessages } from '@/domain/chat/queries'
import { guestRoomSlug } from '@/domain/guests/application'
import {
  listGuestLinks,
  listGuests,
  readGuestDestination,
} from '@/domain/guests/queries'
import { roomsProjection } from '@/domain/rooms/projection'
import { readRoomMarks } from '@/domain/rooms/marks'
import { listRooms } from '@/domain/rooms/queries'
import { emailVerified } from '@/domain/profile/email-verification'
import { readProfileAvatar, readSpaceAvatar } from '@/domain/profile/avatar-queries'
import { readDisplayName } from '@/domain/profile/username-queries'
import { readNowPlaying } from '@/domain/radio/queries'
import { recordDailyVisit } from '@/domain/streaks/record'
import { mayClaimFreeMonth } from '@/domain/promo/winback'
import { runProjection } from '@/es/projection'
import { env } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  battleOpen,
  chatOpen,
  hasTier,
  isGuest,
  requireTenant,
  writeBlockedReason,
  xpOpen,
} from '@/lib/tenant'

/**
 * Everything under /t/[slug] is inside a workspace, so the membership check
 * lives here once rather than in every page.
 *
 * A layout is not a security boundary on its own - it does not re-run for a
 * Server Action, and a page can be requested in ways that skip it. Each page
 * and each action calls requireTenant() too. The call here is what makes the
 * *navigation* correct; the calls further in are what make it safe.
 *
 * The navigation itself is a rail down the left rather than a row across the
 * top. A row could hold five links; the workspace now has four surfaces, four
 * places and a list of people, and the places in particular were being
 * navigated from *inside* the 3D scenes because there was nowhere else to put
 * them. A column has room for all of it and does not grow taller as the app
 * does.
 */
/**
 * The space's name in the tab, and the page's name in front of it.
 *
 * A `template` rather than a title, so this is written once here instead of
 * once per page: every page under `/t/[slug]` that exports a `title` gets
 * "House · Acme", and the ones that do not fall back to `default` and simply
 * say "Acme". That is the right shape for a product people keep open in a
 * background tab all day - the space is the thing they are looking for when
 * they scan a row of favicons, and the room they were in is the thing they
 * need once they have found it.
 *
 * Read with the caller's own client, so RLS answers the question. A non-member
 * reads nothing back and gets no title rather than a 404's worth of
 * information about a space they cannot see - `requireTenant` below is what
 * actually turns them away, and metadata is generated before it runs.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('tenants_read_model')
    .select('name')
    .eq('slug', slug)
    .maybeSingle()

  if (!data?.name) return {}

  return { title: { default: data.name, template: `%s · ${data.name}` } }
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const context = await requireTenant(slug, { guests: true })
  const { user, tenant, supabase, features } = context

  // Mark this member as here today, once per UTC day. Runs on every page in the
  // space because the streak is "showed up here", not "opened this page"; it is
  // cheap after the first visit of the day and never throws - see the function.
  await recordDailyVisit(context)

  const username = await readDisplayName(supabase, user.id)
  /**
   * Which animal this account is, for the rail's picker.
   *
   * Read for guests too - `requireTenant(..., { guests: true })` above means
   * `user` is a real account whether or not they were invited, and being one of
   * four identical penguins is not a thing that should check.
   */
  /**
   * Which animal this account wears *here*, and whether that is an override.
   *
   * Two values because the picker has to say both: which one is lit, and
   * whether it applies to this space only or to you everywhere. Read for guests
   * too - `requireTenant(..., { guests: true })` above means `user` is a real
   * account whether or not they were invited.
   */
  const spaceAvatar = await readSpaceAvatar(supabase, user.id, tenant.id)
  const avatar = spaceAvatar ?? (await readProfileAvatar(supabase, user.id))

  // Only when the wall is about to show, so the common path keeps its cost.
  // A member reads back zeros here - RLS lets them see their own row only -
  // which is right: the owner's renewal date is not theirs to know.
  //
  // `deactivated` and not `!entitled`, which would now be almost every request:
  // since the free tier arrived, "not paying" is the ordinary state of a space
  // rather than the rare one, and this row is only ever read to fill in a date
  // on the wall. Gating it on the thing that renders it keeps a query off the
  // common path instead of putting one on every free space's every page.
  const entitlement = tenant.deactivated ? await readEntitlement(supabase, user.id) : null

  /**
   * Whether to offer a month on us.
   *
   * `owner` first, and the order is the point rather than style. Both operands
   * used to be rare; `!entitled` is now the common case, so leading with it
   * would run the round trip for every member of every free space and throw the
   * answer away. Ownership is the narrow test now, so it goes first and
   * short-circuits for everybody else.
   *
   * Still gated on not paying, because that is who the offer is for - which now
   * includes a free space that never subscribed, and should: a month of xo is
   * exactly the nudge that tier exists to set up.
   */
  const freeMonth =
    tenant.role === 'owner' &&
    !tenant.entitled &&
    (await mayClaimFreeMonth(supabase, user.id))

  /**
   * What this event's guests may reach, decided here and passed down.
   *
   * Only for a guest: a member's rail has never been narrowed by the event's
   * guest settings and must not start being. Resolved through the same
   * `guestCanReach` the routes use, so the rail cannot offer a row that the
   * page behind it would refuse - including while an event is still upcoming,
   * which that helper treats as "nothing yet".
   */
  const guestSurfaces =
    tenant.role === 'guest'
      ? EVENT_SURFACES.filter((surface) => guestCanReach(context.event, surface))
      : []

  /**
   * Guest links for the rail, and only for the people who may hand them out.
   *
   * Building this object is the access check - a member gets null and the
   * section is never rendered, rather than rendered and hidden. That matters
   * more than usual here because the payload *is* the secret: these rows carry
   * live tokens, and a hidden element in a client component is a token sitting
   * in the page source.
   *
   * Read through the service role because `guest_links` has no policy for
   * anybody holding a session, which is deliberate - see the migration.
   */
  const isOwnerOrAdmin = tenant.role === 'owner' || tenant.role === 'admin'

  /**
   * The rooms, read once for the whole rail.
   *
   * Here rather than in either copy of the rail because both panels render the
   * same list - the left one on a tablet, the right one on a laptop - and two
   * components fetching the same rows would be two round trips to draw one
   * list. Guests get it too, but only the one they were invited into - see
   * `guestRoomSlug`, and the filter below.
   *
   * `includePrivate` follows the role, because an unlisted room the admin who
   * made it cannot see is a room nobody can close.
   */
  const rooms = features.lounge
    ? await (async () => {
        await runProjection(supabase, roomsProjection, tenant.id)
        const all = await listRooms(supabase, tenant.id, {
          includePrivate: isOwnerOrAdmin,
        })

        if (!isGuest(context)) return all

        /**
         * A guest sees the room they came for, and nothing else.
         *
         * A room is part of the commons for the people who belong to the space.
         * For somebody let in through a link it is not: the list of open rooms
         * is a list of what a company is doing this afternoon, handed to a
         * visitor who was invited to one conversation. Their link is the whole
         * of what they were offered, so it is the whole of what is drawn.
         *
         * A listing rule, not a wall - the same thing `visibility` is, and its
         * note says why. What actually keeps a guest out of a room is the room
         * itself; this stops the rail from doing the advertising.
         */
        const invited = guestRoomSlug(
          await readGuestDestination(supabase, createAdminClient(), tenant.id, user.id),
          tenant.slug,
        )

        return invited ? all.filter((room) => room.slug === invited) : []
      })()
    : []


  // Same pair every other room command re-checks server-side. This only decides
  // whether the controls are drawn.
  // `deactivated`, not `entitled`. A space that stopped paying is on free and
  // is over its place cap, which is exactly when somebody needs to close a room
  // - see the shelving rules in docs/product/pricing.md §6. Gating this on
  // paying would freeze them holding twenty rooms they cannot tidy.
  const canManageRooms = isOwnerOrAdmin && !tenant.deactivated

  /**
   * This person's own pins and last visits, for the Places band's ordering.
   *
   * Here rather than in the band for the reason the rooms above are: both
   * copies of the rail draw the same list, and a client component fetching its
   * own ordering would be a second round trip to sort five rows.
   *
   * Skipped entirely when there are no rooms, which is most spaces - the marks
   * are only ever *about* rooms, so with none there is nothing for them to
   * order and the query would be a round trip to build an empty object.
   */
  const marks = rooms.length > 0 ? await readRoomMarks(supabase, tenant.id) : {}

  const guestAccess = isOwnerOrAdmin
    ? await (async () => {
        const admin = createAdminClient()
        const [links, present, { data: limit }] = await Promise.all([
          listGuestLinks(admin, tenant.id, tenant.slug),
          listGuests(admin, tenant.id),
          admin.rpc('tenant_guest_limit', { p_tenant_id: tenant.id }),
        ])
        return {
          origin: env.appUrl(),
          links,
          // The list itself, not `present.length`. It was already being fetched
          // and thrown away to produce a count; the rail needs the names to put
          // a kick button beside each one.
          guests: present,
          capacity: limit ?? null,
        }
      })()
    : null

  /**
   * The chat, for `<ChatDock>` in the rail.
   *
   * Lives here rather than in the lounge page for the reason `said-store`
   * explains: the rail is mounted for the whole workspace session, and the
   * lounge's canvas is not. Catching the projection up and reading the
   * scrollback on every navigation inside the space is the cost of that - one
   * cheap query, skipped entirely under the same `chatOpen` gate the page used
   * to carry alone.
   */
  /**
   * The radio, for `<RadioDock>` in the rail.
   *
   * Read here rather than in the lounge page, for the reason the chat is: the
   * rail is mounted for the whole workspace session and the lounge's canvas is
   * not, and a player that restarted every time somebody walked between two
   * rooms would be worse than no player.
   *
   * The projection is *not* caught up first, unlike the chat's. A radio row is
   * only ever written by the same action that broadcasts the change, so a
   * reader arriving here is either after that action - in which case the row is
   * current - or before it, in which case the broadcast is what tells them. The
   * one case it costs is a listener whose page load raced an admin's click by
   * milliseconds, and they are corrected by the packet a moment later.
   */
  const radio = features.radio
    ? {
        tenantId: tenant.id,
        nowPlaying: await readNowPlaying(supabase, tenant.id),
        // The polite copy of the rule. `playTrack` re-asks, and the restrictive
        // policy on `events` is what actually enforces it.
        canControl: isOwnerOrAdmin && !tenant.deactivated,
      }
    : null

  const chatting = chatOpen(context)
  if (chatting) {
    await runProjection(supabase, chatProjection, tenant.id)
  }
  const chat = chatting
    ? {
        tenantId: tenant.id,
        userId: user.id,
        // The lounge's conversation, which is what the dock opens on. Switching
        // to another room's is a client-side fetch - see `readRoomChat`.
        initialMessages: (await listChatMessages(supabase, tenant.id, null)).map((message) => ({
          key: message.id,
          id: message.id,
          body: message.body,
          authorId: message.authorId,
          authorName: message.authorName,
          createdAt: message.createdAt,
        })),
        // A guest reads what has been said and is told in a sentence why they
        // cannot add to it - the same rule `postChatMessage` enforces again at
        // the boundary, from the same function.
        blockedReason: writeBlockedReason(context),
      }
    : null

  /**
   * The language the whole workspace is read in, resolved once here.
   *
   * This layout is the only thing every surface inside a space renders under,
   * which makes it the one place a locale can be established without each page
   * asking again - and `LocaleProvider` below is what carries the same answer
   * into the client components, where most of this app's copy actually lives.
   */
  const locale = await readLocale()

  /**
   * Whether to ask this person to confirm their address.
   *
   * Free: `user` is already loaded and the answer is read off it - see
   * `emailVerified`, which folds in every reason there is nothing to ask
   * (a guest, an account with no address, an address Google already vouched
   * for). No query, so the common case - everybody who is confirmed - costs
   * the rest of the space one boolean.
   *
   * `new_email` comes off the same object, and is what lets the banner say
   * "waiting on the new address" rather than repeating itself while a change
   * is already in flight.
   */
  const unverified = !emailVerified(user)
  const pendingEmail = (user as { new_email?: unknown }).new_email

  return (
    <LocaleProvider locale={locale}>
      {/*
        Which space this is, for the client components the server cannot hand
        it to. Exactly one thing reads it today - a framed XP, which is mounted
        out of a registry against a contract that carries no fact about our
        product. See `./space-context`.
      */}
      <SpaceProvider slug={slug} tenantId={tenant.id}>
      <div className="min-h-dvh">
          <PartyRail />
          {/* The same sky the landing page sits in, so walking through the front
          door does not change worlds. It is fixed and behind everything, and
          the scenes no longer paint over it - their canvases are transparent
          now, so the world is built in this sky rather than in front of it. */}
          <ShootingStars/>

          {/* Draws nothing; it is here for the same reason the sky is. The layout
          is what spans a whole session inside a workspace, so it is the only
          place a loop can start once and not be cut off by every navigation. */}
          <BackgroundMusic/>

          {/* Draws nothing either. A guest's tab asking, every ten seconds, whether
          the visit is still on - and leaving when it is not. The layout for the
          same reason as the music: it is the one thing that spans everywhere a
          guest can stand, so a kick lands in the lounge, in a room and in a
          match alike. See the component for why the server cannot do this. */}
          {tenant.role === 'guest' && <GuestPulse tenantId={tenant.id} slug={slug} />}

          {/* The rail is the heaviest client component on every page in a space
          and nothing above it depends on what it renders, so it streams in
          behind its own boundary rather than holding up the shell. It used to
          be *required* to have one - it read `?of=` to carry a visit from link
          to link - and the boundary is worth keeping now that it is only an
          optimisation. */}
          <Suspense fallback={null}>
              <Sidebar
                  slug={slug}
                  tenantName={tenant.name}
                  archived={tenant.archived}
                  features={{
                      pages: features.pages,
                      tasks: features.tasks,
                      lounge: features.lounge,
                      cafe: features.cafe,
                      // `battleOpen` rather than the flag, so the space's own
                      // switch reaches every row the sidebar draws from this -
                      // the Battle entry, and the guest one below it.
                      battle: battleOpen(context),
                      worlds: features.worlds,
                      scenes: features.scenes,
                      xp: hasTier(context, 'xp'),
                      skinShop: features.skin_shop,
                  }}
                  username={username}
                  email={user.email ?? railDict(locale).account.signedIn}
                  role={tenant.role}
                  tier={tenant.tier}
                  guestSurfaces={guestSurfaces}
                  guestAccess={guestAccess}
                  rooms={rooms}
                  marks={marks}
                  canManageRooms={canManageRooms}
                  canPlayXp={xpOpen(context) && battleOpen(context)}
                  avatar={avatar}
                  hereOnly={spaceAvatar !== null}
                  chat={chat}
                  radio={radio}
              />
          </Suspense>

          {/*
        Inset by exactly the panels - `--rail` and `--rail-gap` in globals.css
        are the one place those numbers are written - and only once there is a
        panel to inset by. On a phone the left one is a drawer floating over
        this rather than a column beside it, and the right one does not exist
        below `xl`.
      */}
          {/* `rail-shell` is what the folded-rail rule in globals.css reaches
              for - see the note there. The padding utility stays as the
              default; the rule only overrides it while the rail is closed. */}
          <div className="rail-shell md:pl-[calc(var(--rail)+var(--rail-gap)*2)] xl:pr-[calc(var(--rail)+var(--rail-gap)*2)]">
              {/* `page-main` is not decoration: globals.css widens the side
                  padding here for every page that is *not* a scene. See the
                  note on `.page-main` there. */}
              <main className="page-main mx-auto w-full max-w-5xl px-1 py-6 sm:px-8">
                  {/*
                    Above the content rather than in the rail, because it is a
                    fact about the whole visit rather than a place to navigate
                    to - and because the rail is a drawer on a phone, where the
                    people at an event mostly are.
                  */}
                  {/*
                    Wrapped so a full-height surface below can subtract them.

                    Both banners sit in the flow above the content, so on a
                    lounge or an editor - which are sized to the window less the
                    shell's padding - they push the page past the fold and it
                    scrolls under the drag you meant for the world. `PageChrome`
                    measures whatever is in here and publishes it; see
                    `.h-viewport-inset` in globals.css for the other half.
                  */}
                  <PageChrome>
                    <EventBanner event={context.event} />
                    {/*
                      Under the event's banner, because an event is about the
                      next two hours and this is about the account - and when
                      both are up, the one with a deadline should be read first.
                    */}
                    {unverified && user.email && (
                      <VerifyEmailBanner
                        email={user.email}
                        pending={typeof pendingEmail === 'string' && pendingEmail ? pendingEmail : null}
                      />
                    )}
                  </PageChrome>
                  {/*
                    The middle, handed over rather than swapped.

                    Only this column: the rails either side hold still, which is
                    what makes the change read as "this part of the room
                    changed" instead of "the whole page blinked". The CSS in
                    globals.css is what pins the rest - see `::view-transition`
                    there - and it is deliberately the *shorter* half of the
                    pair, because a navigation is a thing somebody does dozens
                    of times an hour and an animation they wait on twice is one
                    they resent by the tenth.

                    `default="none"` so this boundary only animates for the
                    navigation it belongs to, rather than joining in with every
                    unrelated transition on the page.
                  */}
                  <ViewTransition enter="middle-in" exit="middle-out" default="none">
                      {!tenant.deactivated ? (
                          children
                      ) : (
                          <WorkspaceDeactivated
                              slug={slug}
                              name={tenant.name}
                              isOwner={tenant.role === 'owner'}
                              paidThrough={entitlement?.currentPeriodEnd ?? null}
                              freeMonth={freeMonth}
                          />
                      )}
                  </ViewTransition>
              </main>
          </div>
      </div>
      </SpaceProvider>
    </LocaleProvider>
  )
}
