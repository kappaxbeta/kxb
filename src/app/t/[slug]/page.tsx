import type { Metadata } from 'next'
import { Masthead } from '@/app/t/[slug]/dashboard/masthead'
import { Pinboard } from '@/app/t/[slug]/dashboard/pinboard'
import { StudioShelf } from '@/app/t/[slug]/dashboard/studio-shelf'
import { boardProjection } from '@/domain/board/projection'
import { type BoardAuthor, listBoardPosts } from '@/domain/board/queries'
import { avatarOf, readProfileAvatars } from '@/domain/profile/avatar-queries'
import { displayNameFrom } from '@/domain/profile/username-queries'
import { listSpaceNews } from '@/domain/news/queries'
import { readNowPlaying } from '@/domain/radio/queries'
import { listRooms } from '@/domain/rooms/queries'
import { listScenes } from '@/domain/scenes/queries'
import { readStreak } from '@/domain/streaks/queries'
import { listMembers } from '@/domain/tenants/queries'
import { runProjection } from '@/es/projection'
import { canWrite, hasRole, requireTenant } from '@/lib/tenant'
import { readLocale } from '@/app/i18n/preference'
import { workspaceDict } from '@/app/i18n/workspace'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).titles.overview }
}

export const dynamic = 'force-dynamic'

/**
 * How many animals the masthead's roster draws before it counts the rest.
 *
 * Two rows at a comfortable width, and a number rather than a CSS truncation
 * because the ones past it are not hidden - they are added up into a "+12" that
 * says the space is bigger than the row. A row that just stopped would say the
 * space was this size.
 */
const ROSTER_LIMIT = 16

/** How many recent scenes the shelf at the foot of the board offers. */
const SHELF_LIMIT = 8

/**
 * Where opening a workspace lands you.
 *
 * This used to redirect - to pages, or to tasks when the pages flag was off -
 * and the redirect is gone rather than pointed somewhere new. A workspace root
 * that only ever bounced you elsewhere meant the address people actually share
 * was never the address they landed on, and it made "the first thing you see"
 * a property of two feature flags instead of a decision.
 *
 * ---------------------------------------------------------------------------
 * Three things, in the order somebody arriving wants them
 * ---------------------------------------------------------------------------
 *   1. Which room this is, who is in it, and the way in. The masthead.
 *   2. What has been said since you were last here. The board.
 *   3. What is here to make. The studio shelf.
 *
 * One column, top to bottom. A side rail for (1) and (3) was the obvious
 * alternative and does not fit: `<main>` in the layout above already sits
 * between a 15.5rem rail and, from `xl`, a second one, so an aside inside it
 * leaves the reading column around 400px on a 1280px screen. A stream of
 * paragraphs at 400px is not a stream. The rails are the app's navigation and
 * they are not moving, so the page is built for the width they leave.
 *
 * /t/[slug]/dashboard still resolves - it redirects here now, so old links and
 * bookmarks keep working.
 */
export default async function TenantRootPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const context = await requireTenant(slug, { guests: 'event', surface: 'board' })
  const { supabase, tenant, user, features } = context

  // Catch up on first load, not just after a command: the board is the first
  // thing anyone sees when they open the space, and the notice they need to
  // read was almost certainly written by somebody else.
  await runProjection(supabase, boardProjection, tenant.id)

  // The whole space, not just the people who reacted - one round trip either
  // way, and it means an author who has since left still renders as a handle.
  const members = await listMembers(supabase, tenant.id)

  /**
   * Everybody's animal, in one query rather than one per face.
   *
   * The board hangs each notice off its author's avatar and the masthead draws
   * the roster out of the same map, so this is read once here and handed to
   * both. `readProfileAvatar` on its own would be a round trip per person.
   */
  const avatars = await readProfileAvatars(
    supabase,
    members.map((member) => member.userId),
  )

  const people = new Map<string, BoardAuthor>(
    members.map((member) => [
      member.userId,
      { name: member.username, avatar: avatarOf(avatars, member.userId) },
    ]),
  )

  /**
   * What to call the reader.
   *
   * Through `displayNameFrom` rather than off the map, because the reader is
   * not necessarily in it: a guest is let in by a link and is not a row in
   * `tenant_members`, so a bare lookup would leave the optimistic reaction
   * layer attributing their own face to `undefined`.
   */
  const myName = displayNameFrom(
    new Map([...people].map(([userId, who]) => [userId, who.name])),
    user.id,
  )

  const posts = await listBoardPosts(supabase, tenant.id, user.id, people)

  /**
   * What the platform has to say to this space.
   *
   * Not behind a role or a flag: an announcement is aimed at everybody who
   * opens the space, and the one thing worse than an unread announcement is one
   * only its admins could have read. `listSpaceNews` swallows its own failures
   * for the same reason - the board must open either way.
   */
  const news = await listSpaceNews(supabase, tenant.id)

  /**
   * The three facts under the space's name, each behind the flag that owns it.
   *
   * All three are cheap single-row or single-table reads and all three are
   * skipped entirely when the space has the feature off, which is why they are
   * not worth a Suspense boundary: with the flags off this is the same page it
   * was, and with them on it is three queries on a page that already makes six.
   *
   * The rooms are *not* projected first, unlike the board. The layout above has
   * already caught that projection up on the way to drawing the rail, and doing
   * it twice per page load would be a write to earn a number in a sentence.
   */
  const rooms = features.lounge ? (await listRooms(supabase, tenant.id)).length : 0

  const radio = features.radio ? await readNowPlaying(supabase, tenant.id) : null

  const scenes = features.scenes
    ? await listScenes(supabase, { tenantId: tenant.id, limit: SHELF_LIMIT })
    : []

  /**
   * The reader's own streak, for the badge at the top of the masthead.
   *
   * The layout counted today on the way in, so a member reads back at least
   * one; a guest has no row and reads zero, which the badge turns into the
   * "show up daily" prompt rather than a bare 0.
   */
  const streak = await readStreak(supabase, tenant.id, user.id)

  /**
   * The board no longer fetches the space's scenes for a picker.
   *
   * Something is attached in a studio now, next to the thing being attached, so
   * the composer here is words and a pin checkbox. The shelf below does list
   * scenes, and that is a different job - it is a way into the studio, not a
   * control inside the composer.
   *
   * The cards on notices that already carry something are unaffected: those
   * come down with the board itself, in `listBoardPosts`.
   */
  const canPost = hasRole(context, ['owner', 'admin']) && canWrite(context)
  const locale = await readLocale()

  return (
    <div className="mt-8 flex flex-col gap-8">
      <Masthead
        slug={slug}
        name={tenant.name}
        people={members.slice(0, ROSTER_LIMIT).map((member) => ({
          userId: member.userId,
          username: member.username,
          avatar: avatarOf(avatars, member.userId),
        }))}
        memberCount={members.length}
        rooms={rooms}
        radio={radio ? { title: radio.title, playing: radio.playing } : null}
        canEnter={features.lounge}
        streak={{ current: streak.current, longest: streak.longest }}
        locale={locale}
      />

      <Pinboard
        slug={slug}
        posts={posts}
        me={myName}
        myAvatar={avatarOf(avatars, user.id)}
        // Mirrors the checks in src/domain/board/actions.ts so the UI hides what
        // would be refused. Those are still the ones that enforce it.
        canPost={canPost}
        canReact={canWrite(context)}
        news={news}
      />

      {features.scenes && (
        <StudioShelf slug={slug} scenes={scenes} locale={locale} />
      )}
    </div>
  )
}
