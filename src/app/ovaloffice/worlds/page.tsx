import Link from 'next/link'
import { CataloguePanel } from '@/app/ovaloffice/worlds/catalogue-panel'
import { listPlatformWorlds } from '@/domain/worlds/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const metadata = { title: 'Worlds' }

export const dynamic = 'force-dynamic'

/**
 * The worlds the kxb.team team has published.
 *
 * The sidebar has pointed here since before there was anything to point at -
 * this is that page. What it lists is the *catalogue* side of worlds: the
 * documents built in /ovaloffice/builder and published under the platform's
 * name, which is what every space sees at /worlds.
 *
 * Not to be confused with its own child route. `/ovaloffice/worlds/[worldId]`
 * is the moderation preview of a *reported battlefield* - a space's world,
 * walked through by an admin deciding whether to take it down. Different thing,
 * different table, and the two live under one path only because "world" is the
 * honest word for both. The reports queue is where that one is reached from.
 *
 * Read through the admin's own client rather than the service-role one: the
 * update policy already gives a backoffice admin the reach they need here, and
 * a page that read past RLS would be claiming a right the database never
 * granted it.
 */
export default async function BackofficeWorldsPage() {
  const { supabase } = await requireBackofficeSection('worlds')
  const worlds = await listPlatformWorlds(supabase)

  const published = worlds.filter((world) => world.visibility === 'public').length

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">Worlds</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Places built here and published as ours. {published} of {worlds.length} are in{' '}
            <Link href="/worlds" className="underline hover:text-foreground">
              the catalogue
            </Link>
            .
          </p>
        </div>
        <Link
          href="/ovaloffice/builder"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
        >
          Build a world
        </Link>
      </header>

      <CataloguePanel worlds={worlds} />
    </section>
  )
}
