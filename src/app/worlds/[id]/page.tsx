import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { WorldDetailView } from '@/app/worlds/world-detail'
import { listMyTenants } from '@/domain/tenants/queries'
import { creditFor } from '@/domain/worlds/credit'
import { findWorld, readMyReports, recordWorldView } from '@/domain/worlds/queries'
import { createClient, getUser } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const world = await findWorld(supabase, id)

  if (!world) return { title: 'World' }

  return {
    title: `${world.name} · Worlds`,
    description: world.blurb ?? `A world by ${creditFor(world)}.`,
    // A private world is reachable by its owner through this same page, and a
    // draft should not be what a search engine has of somebody's space.
    robots: world.visibility === 'public' ? undefined : { index: false, follow: false },
  }
}

/**
 * One world, on the public catalogue.
 *
 * The page is the frame; `WorldDetailView` is everything inside it, and it is
 * shared with the copy that lives inside a workspace at
 * /t/[slug]/worlds/[id]. What differs here is only that there is no space
 * around it - this is the page somebody opens from a link with no account at
 * all.
 *
 * `notFound()` covers both "no such world" and "not yours to see", because the
 * select policy makes them indistinguishable from here and telling the two
 * apart would be a way to learn that a private world exists.
 */
export default async function WorldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const world = await findWorld(supabase, id)
  if (!world) notFound()

  const user = await getUser()

  // Counted here rather than from the browser, because a click on a card is not
  // a view - what this page does is show somebody the world. Awaited only so
  // the failure has somewhere to be logged; the function swallows its own
  // errors, so nothing about the page depends on it.
  await recordWorldView(supabase, world.id, user?.id ?? null, world.authorId)
  const myReport = await readMyReports(supabase, user?.id ?? null, world.id)

  const spaces = user
    ? (await listMyTenants(supabase, user.id))
        .filter((tenant) => !tenant.archived)
        .map((tenant) => ({ slug: tenant.slug, name: tenant.name }))
    : []

  return (
    <WorldDetailView
      world={world}
      spaces={spaces}
      signedIn={!!user}
      // Editing in place is for the people the update policy would actually let
      // write; everyone else is offered a fork, which is the same choice the
      // builder's panel makes and the same sentence behind it.
      mine={!!user && world.authorId === user.id}
      myReport={myReport}
    />
  )
}
