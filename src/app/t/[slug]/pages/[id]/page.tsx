import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TipTapEditor } from '@/app/components/editor/tiptap-editor'
import { getPage } from '@/domain/pages/queries'
import { requireTenant } from '@/lib/tenant'

export const metadata: Metadata = {
  title: 'Page',
}

export const dynamic = 'force-dynamic'

export default async function PageDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const { supabase, tenant } = await requireTenant(slug, {
    guests: 'event',
    surface: 'pages',
  })

  const page = await getPage(supabase, tenant.id, id)
  if (!page) {
    notFound()
  }

  return (
    <TipTapEditor
      slug={slug}
      pageId={page.id}
      initialDoc={page.doc}
      initialTitle={page.title}
      parentId={page.parentId}
      position={page.position}
      version={page.version}
      archived={tenant.archived}
    />
  )
}
