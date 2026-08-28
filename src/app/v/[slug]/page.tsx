import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LoungeScene } from '@/app/world/lounge/lounge-scene'
import { LocaleProvider } from '@/app/i18n/locale-context'
import { readLocale } from '@/app/i18n/preference'
import { loungeProjection } from '@/domain/lounge/projection'
import { loungeImagesProjection } from '@/domain/lounge/image-projection'
import { listLoungeImages } from '@/domain/lounge/image-queries'
import { listLoungeBlocks } from '@/domain/lounge/queries'
import { findPublicTenant } from '@/domain/tenants/queries'
import { runProjection } from '@/es/projection'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
// public space lobby view
export default async function ShowcasePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // Use admin client with service role key to bypass RLS for public showcase rendering
  const supabaseAdmin = createAdminClient()

  const tenant = await findPublicTenant(supabaseAdmin, slug)
  if (!tenant) {
    notFound()
  }

  if (!tenant.isPublicLounge) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6">
        <div className="max-w-md w-full text-center space-y-4 rounded-2xl border border-line bg-surface-raised/40 p-8 shadow-xl">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised border border-line text-2xl">
            🔒
          </div>
          <h1 className="text-xl font-semibold text-ink">{tenant.name}</h1>
          <p className="text-sm text-ink-muted">
            The 3D Lounge showcase for this space is private. The space owner has disabled public showcase access.
          </p>
          <div className="pt-2">
            <Link
              href={`/t/${tenant.slug}/lounge`}
              className="inline-block rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white transition hover:opacity-90"
            >
              Sign In to View
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Catch up projection before rendering lounge
  await runProjection(supabaseAdmin, loungeProjection, tenant.id)
  await runProjection(supabaseAdmin, loungeImagesProjection, tenant.id)

  const [blocks, images] = await Promise.all([
    listLoungeBlocks(supabaseAdmin, tenant.id),
    listLoungeImages(supabaseAdmin, tenant.id),
  ])

  return (
    /*
      A public door, so the world takes the reader's own language rather than
      the space's: there is no membership here and no workspace shell above it,
      and `readLocale` falls back to the browser's `Accept-Language` for
      somebody who has never expressed a preference.
    */
    <LocaleProvider locale={await readLocale()}>
      <div className="relative h-screen w-screen overflow-hidden bg-black">
        <LoungeScene
          slug={tenant.slug}
          initialBlocks={blocks}
          initialImages={images}
          readOnly={true}
          canModerate={false}
        />
      </div>
    </LocaleProvider>
  )
}
