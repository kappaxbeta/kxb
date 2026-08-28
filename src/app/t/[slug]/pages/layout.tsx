import { HomeShell } from '@/app/t/[slug]/pages/home-shell'
import { pagesProjection } from '@/domain/pages/projection'
import { listPages } from '@/domain/pages/queries'
import { runProjection } from '@/es/projection'
import { requireFeature, requireTenant } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export default async function HomeLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const context = await requireTenant(slug)
  const { supabase, tenant } = context

  // Before the projection run: a disabled surface should cost nothing.
  requireFeature(context, 'pages')

  // Catch up projection on read so new/replayed events are visible
  await runProjection(supabase, pagesProjection, tenant.id)

  const pages = await listPages(supabase, tenant.id)

  return (
    <HomeShell slug={slug} pages={pages} archived={tenant.archived}>
      {children}
    </HomeShell>
  )
}
