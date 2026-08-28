import type { Metadata } from 'next'
import Link from 'next/link'
import { FavouriteButton } from '@/app/worlds/favourite-button'
import { WorldCard } from '@/app/worlds/world-card'
import { findRoom } from '@/domain/rooms/queries'
import {
  listFavouriteWorlds,
  listPublicWorlds,
  listSpaceWorlds,
  readFavouriteIds,
  type WorldSort,
} from '@/domain/worlds/queries'
import { isWorldTag, WORLD_TAGS } from '@/domain/worlds/tags'
import { requireFeature, requireTenant } from '@/lib/tenant'
import { workspaceDict } from '@/app/i18n/workspace'
import { readLocale } from '@/app/i18n/preference'
import { fill } from '@/app/i18n/fill'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).titles.worlds }
}

export const dynamic = 'force-dynamic'

/**
 * The catalogue, inside the space.
 *
 * The same browsing the public page offers - the tags, the ordering, the
 * hearts - but under the workspace layout, which is the entire reason it is a
 * second page rather than a link to the first. A member who followed "browse
 * worlds" out to /worlds lost the rail, the rooms and the people, and the only
 * way back was the browser's Back button. A catalogue you have to leave your
 * space to read is one people read once.
 *
 * Two lists, kept apart because they afford different things: yours can be
 * opened in the builder and saved over, everybody else's can be forked or
 * dropped into a battlefield. Drafts are in the first one - this is the page
 * you come back to in order to finish something.
 */
export default async function SpaceWorldsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tag?: string; sort?: string; kept?: string; room?: string }>
}) {
  const { slug } = await params
  const { tag, sort, kept, room } = await searchParams

  const context = await requireTenant(slug)
  requireFeature(context, 'worlds')

  const { supabase, tenant, user } = context

  const order: WorldSort = sort === 'new' ? 'new' : 'used'
  const showingKept = kept === '1'

  // Proven this tenant's own the same way the detail page does, rather than
  // trusted because it arrived in the URL - a stray or foreign id just falls
  // back to ordinary browsing instead of leaking another tenant's room name.
  const pickingRoom = room ? await findRoom(supabase, room) : null
  const forRoom = pickingRoom && pickingRoom.tenantId === tenant.id ? pickingRoom : null

  const [mine, elsewhere, favourites] = await Promise.all([
    listSpaceWorlds(supabase, tenant.id),
    showingKept
      ? listFavouriteWorlds(supabase, user.id)
      : listPublicWorlds(supabase, { tag, sort: order, limit: 60 }),
    readFavouriteIds(supabase, user.id),
  ])

  // Your own worlds are in the list above; showing them twice makes the page
  // look like it has duplicates.
  const theirs = elsewhere.filter((world) => world.tenantId !== tenant.id)

  const href = (next: { tag?: string; sort?: WorldSort; kept?: boolean }) => {
    const params = new URLSearchParams()
    if (next.tag) params.set('tag', next.tag)
    if (next.sort && next.sort !== 'used') params.set('sort', next.sort)
    if (next.kept) params.set('kept', '1')
    if (forRoom) params.set('room', forRoom.roomId)
    const query = params.toString()
    return query ? `/t/${slug}/worlds?${query}` : `/t/${slug}/worlds`
  }

  /** A card's own link, carrying the room along so the detail page still knows. */
  const locale = await readLocale()
  const t = workspaceDict(locale).worlds

  const cardHref = (worldId: string) =>
    forRoom ? `/t/${slug}/worlds/${worldId}?room=${forRoom.roomId}` : `/t/${slug}/worlds/${worldId}`

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t.heading}</h2>
          <p className="text-sm text-ink-muted">
            {forRoom ? fill(t.forRoom, { name: forRoom.name }) : t.body}
          </p>
        </div>
        {forRoom ? (
          <Link
            href={`/t/${slug}/rooms/${forRoom.roomId}`}
            className="rounded-lg border border-line px-4 py-2 text-sm transition hover:bg-surface"
          >
            {t.backToRoom}
          </Link>
        ) : (
          <Link
            href={`/t/${slug}/builder`}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            {t.build}
          </Link>
        )}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">{t.yours}</h3>
        {mine.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface/40 px-4 py-6 text-sm text-ink-muted">
            {t.yoursEmpty}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((world) => (
              <WorldCard key={world.id} world={world} href={cardHref(world.id)} t={t} locale={locale}>
                <Link
                  href={`/t/${slug}/builder?world=${world.id}`}
                  className="block rounded-lg border border-line px-3 py-1.5 text-center text-xs transition hover:bg-surface"
                >
                  {t.openInBuilder}
                </Link>
              </WorldCard>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">
            {showingKept ? t.kept : t.fromEveryone}
          </h3>
          {/* The public page is still there for sharing a link with somebody
              who has no account - it is not where a member should have to go
              to read the catalogue. */}
          <Link href="/worlds" className="text-xs text-ink-muted hover:underline">
            {t.publicCatalogue}
          </Link>
        </div>

        <nav className="flex flex-wrap gap-1.5" aria-label={t.filterLabel}>
          <Chip href={href({ sort: order })} on={!tag && !showingKept}>
            {t.everything}
          </Chip>
          {WORLD_TAGS.map((entry) => (
            <Chip
              key={entry.id}
              href={href({ tag: entry.id, sort: order })}
              on={tag === entry.id && !showingKept}
              title={t.tags[entry.id]?.hint ?? entry.hint}
            >
              {t.tags[entry.id]?.label ?? entry.label}
            </Chip>
          ))}
          <span className="mx-1 w-px bg-line" aria-hidden />
          <Chip href={href({ tag, sort: 'new' })} on={order === 'new' && !showingKept}>
            {t.newest}
          </Chip>
          <Chip href={href({ kept: true })} on={showingKept}>
            {t.saved}
          </Chip>
        </nav>

        {theirs.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {showingKept
              ? t.keptEmpty
              : tag && isWorldTag(tag)
                ? t.taggedEmpty
                : t.publishedEmpty}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {theirs.map((world) => (
              <WorldCard key={world.id} world={world} href={cardHref(world.id)} t={t} locale={locale}>
                <FavouriteButton id={world.id} kept={favourites.has(world.id)} />
              </WorldCard>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Chip({
  href,
  on,
  title,
  children,
}: {
  href: string
  on: boolean
  title?: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={on ? 'true' : undefined}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        on
          ? 'border-accent bg-accent/15 text-ink'
          : 'border-line text-ink-muted hover:bg-surface hover:text-ink'
      }`}
    >
      {children}
    </Link>
  )
}
