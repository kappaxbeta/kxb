import type { Metadata } from 'next'
import Link from 'next/link'
import { WorldCard } from '@/app/worlds/world-card'
import { FavouriteButton } from '@/app/worlds/favourite-button'
import {
  listFavouriteWorlds,
  listPublicWorlds,
  readFavouriteIds,
  type WorldSort,
} from '@/domain/worlds/queries'
import { isWorldTag, WORLD_TAGS } from '@/domain/worlds/tags'
import { createClient, getUser } from '@/lib/supabase/server'
import { readLocale } from '@/app/i18n/preference'
import { workspaceDict } from '@/app/i18n/workspace'

export const metadata: Metadata = {
  title: 'Worlds',
  description:
    'Places built block by block — arenas, pitches, hangouts — ready to drop into a space.',
}

export const dynamic = 'force-dynamic'

/**
 * The catalogue.
 *
 * Public, and signed out on purpose: this is the page that answers "what is
 * this thing" for somebody who has not made an account, in the only way that
 * actually lands - by showing them places other people built and letting them
 * walk around one. /demo does the same job for the lounge.
 *
 * There is nothing to leak. Every row here is one somebody chose to publish,
 * the select policy for `anon` admits exactly those, and the document is the
 * same thing the viewer at /w has been handing out in a link since the builder
 * shipped.
 *
 * The filters are links rather than a form, which is what makes them
 * shareable - "the arenas" is a URL somebody can send - and what keeps this
 * page a server component with no client bundle at all.
 */
export default async function WorldsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tag?: string
    q?: string
    from?: string
    sort?: string
    kept?: string
  }>
}) {
  const { tag, q, from, sort, kept } = await searchParams
  const supabase = await createClient()
  const user = await getUser()

  // Only somebody signed in has a list of kept worlds; for everybody else the
  // filter is not offered and the hearts are not drawn.
  const showingKept = kept === '1' && !!user

  const origin = from === 'platform' || from === 'space' ? from : undefined
  // 'used' is the default and 'new' is the opt-in, for the reason in the
  // popularity migration: a use is somebody choosing this world over the others.
  const order: WorldSort = sort === 'new' ? 'new' : 'used'
  // The card's own words - see the note on `WorldCard`.
  const locale = await readLocale()
  const worldWords = workspaceDict(locale).worlds
  const [worlds, favourites] = await Promise.all([
    showingKept && user
      ? listFavouriteWorlds(supabase, user.id)
      : listPublicWorlds(supabase, { tag, q, origin, sort: order }),
    readFavouriteIds(supabase, user?.id ?? null),
  ])

  // Rebuilt rather than concatenated, so a filter link never carries a stale
  // copy of the filter it is replacing.
  const href = (next: { tag?: string; from?: string; sort?: WorldSort; kept?: boolean }) => {
    const params = new URLSearchParams()
    if (next.tag) params.set('tag', next.tag)
    if (next.from) params.set('from', next.from)
    if (next.sort && next.sort !== 'used') params.set('sort', next.sort)
    if (next.kept) params.set('kept', '1')
    if (q) params.set('q', q)
    const query = params.toString()
    return query ? `/worlds?${query}` : '/worlds'
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Worlds</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Places built block by block. Open one to walk around it, fork it to
          make it yours, or drop it into your space as a battlefield.
        </p>
        {/* The shop front, from the shelf. This page keeps every filter and the
            saved list and stays the whole catalogue; `/browse` is where the
            games are, and somebody who arrived here from a shared tag link has
            no other way to find out that it exists. */}
        <p className="mt-3 text-sm text-ink-muted">
          Looking for something to play rather than somewhere to stand?{' '}
          <Link href="/browse" className="text-accent transition hover:opacity-80">
            Browse the games
          </Link>
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-1.5" aria-label="Filter worlds">
        <FilterChip href={href({ from: origin, sort: order })} on={!tag}>
          Everything
        </FilterChip>
        {WORLD_TAGS.map((entry) => (
          <FilterChip
            key={entry.id}
            href={href({ tag: entry.id, from: origin, sort: order })}
            on={tag === entry.id}
            title={entry.hint}
          >
            {entry.label}
          </FilterChip>
        ))}
        <span className="mx-1 w-px bg-line" aria-hidden />
        <FilterChip href={href({ tag, from: 'platform', sort: order })} on={origin === 'platform'}>
          By the kxb.team team
        </FilterChip>
      </nav>

      <nav className="mb-6 flex flex-wrap gap-1.5" aria-label="Order worlds">
        <FilterChip href={href({ tag, from: origin, sort: 'used' })} on={order === 'used'}>
          Most used
        </FilterChip>
        <FilterChip href={href({ tag, from: origin, sort: 'new' })} on={order === 'new'}>
          Newest
        </FilterChip>
        {user && (
          <>
            <span className="mx-1 w-px bg-line" aria-hidden />
            {/* Its own list rather than a filter over the one above: what you
                kept is ordered by when you kept it, and the tag and sort
                controls do not apply to a list of twelve things. */}
            <FilterChip href={href({ kept: true })} on={showingKept}>
              Saved
            </FilterChip>
          </>
        )}
      </nav>

      {worlds.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface/40 px-4 py-6 text-sm text-ink-muted">
          {showingKept
            ? 'Nothing kept yet. The heart on a card puts it here.'
            : tag && isWorldTag(tag)
            ? 'Nothing tagged that yet.'
            : 'Nothing published yet — the first world here will be one somebody built in the block builder.'}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {worlds.map((world) => (
            <WorldCard
              key={world.id}
              world={world}
              href={`/worlds/${world.id}`}
              t={worldWords}
              locale={locale}
            >
              {user && <FavouriteButton id={world.id} kept={favourites.has(world.id)} />}
            </WorldCard>
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-ink-muted">
        Built one of your own?{' '}
        <Link href="/login" className="underline hover:text-ink">
          Sign in
        </Link>{' '}
        and publish it from your space&rsquo;s builder.
      </p>
    </main>
  )
}

function FilterChip({
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
