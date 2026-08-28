import { FeatureFlags } from '@/app/ovaloffice/feature-flags'
import { listFeatureFlags } from '@/domain/flags/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

export default async function FeatureFlagsPage() {
  const { supabase, admin } = await requireBackofficeSection('feature-flags')
  const flags = await listFeatureFlags(supabase, admin)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Feature Flags</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          System-wide settings and overrides.
        </p>
      </div>

      <FeatureFlags flags={flags} />
    </div>
  )
}
