import { PriceList } from '@/app/ovaloffice/pricing/price-list'
import { TierEditor } from '@/app/ovaloffice/pricing/tier-editor'
import { listStoredPrices, listStoredTiers } from '@/domain/billing/tier-admin'
import { readTierTable } from '@/domain/billing/tier-table'
import type { TierLimits } from '@/domain/billing/tiers'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * What a plan costs and what it holds.
 *
 * The tier table shipped as rows so a price could change without a deploy, and
 * until now there was nowhere to change it - the table was editable in
 * principle and only through SQL in practice. This is the page that was
 * missing.
 *
 * Both halves on one page, and that is the point. `tiers.cents` is what the
 * landing page *quotes*; `tier_prices` is what Stripe *charges*. They are two
 * tables answering two questions and the failure mode is entirely in the gap
 * between them - a tier moved to €12 while the €10 price is still the one on
 * sale advertises a number nobody is charged. Editing them in one place is what
 * makes that a thing you notice.
 *
 * Under System rather than Operations: this is configuration, not a queue. You
 * come here having already decided something.
 */
export default async function PricingPage() {
  const { admin } = await requireBackofficeSection('pricing')

  const [stored, prices, resolved] = await Promise.all([
    listStoredTiers(admin),
    listStoredPrices(admin),
    /*
     * The same read the product makes, alongside the rows themselves.
     *
     * A stored row says what *differs*; this says what a space actually gets.
     * The editor needs both, or every field left inheriting is a blank space
     * where an operator has to do the merge in their head.
     */
    readTierTable(admin),
  ])

  const effective: Record<string, TierLimits> = Object.fromEntries(
    resolved.map((row) => [row.tier, row.limits]),
  )

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-lg font-semibold">Pricing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The tier table, live. Every limit in the product resolves through these
          rows, and the landing page quotes them — so a change here lands without a
          deploy. A row that cannot be read falls back to the compiled constants in{' '}
          <code className="font-mono text-xs">billing/tiers.ts</code>, which is why
          this table is safe to be wrong about.
        </p>
      </div>

      <TierEditor tiers={stored} effective={effective} />

      {/* Below the tiers, because it is the half that takes the money. A tier
          says what a plan costs; a price is what checkout actually charges. */}
      <PriceList prices={prices} effective={effective} />
    </div>
  )
}
