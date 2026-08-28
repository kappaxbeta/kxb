import type { Metadata } from 'next'
import Link from 'next/link'
import { listPages } from '@/domain/pages/queries'
import { requireTenant } from '@/lib/tenant'
import { workspaceDict } from '@/app/i18n/workspace'
import { readLocale } from '@/app/i18n/preference'
import { fill } from '@/app/i18n/fill'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).titles.pages }
}

export const dynamic = 'force-dynamic'

export default async function PagesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { supabase, tenant } = await requireTenant(slug, {
    guests: 'event',
    surface: 'pages',
  })

  const pages = await listPages(supabase, tenant.id)
  const t = workspaceDict(await readLocale()).pages

  return (
    <div className="flex flex-col items-center justify-center min-h-full p-8 text-center">
      <div className="max-w-md space-y-4">
        <div className="text-4xl">📝</div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {fill(t.welcome, { space: tenant.name })}
        </h1>
        <p className="text-sm text-ink-muted leading-relaxed">{t.body}</p>

        {pages.length > 0 ? (
          <div className="pt-4 text-left">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-2">
              {t.recent}
            </h2>
            <div className="space-y-1">
              {pages.slice(0, 5).map((page) => (
                <Link
                  key={page.id}
                  href={`/t/${slug}/pages/${page.id}`}
                  className="flex items-center gap-2 p-2 rounded-lg border border-line bg-surface-raised/50 hover:bg-surface-raised transition text-sm font-medium text-ink"
                >
                  <span>📄</span>
                  <span className="truncate">{page.title || t.untitled}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="pt-2">
            <p className="text-xs text-ink-muted">
              {t.pick}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
