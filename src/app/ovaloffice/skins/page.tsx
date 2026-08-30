import { SkinShelf } from '@/app/ovaloffice/skins/skin-shelf'
import { VoucherLog } from '@/app/ovaloffice/skins/voucher-log'
import { listSkinsAdmin, listVouchersAdmin } from '@/domain/skins/queries'
import { resolveFeatures } from '@/domain/flags/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * The shelf, and the vouchers that buy from it.
 *
 * One page for both halves, for the reason the codes page next door gives: an
 * operator minting a voucher wants to see what it can be spent on without
 * deciding to go and look. Same section, same rhythm - a shelf is something
 * you run, not something you configure once.
 *
 * The art is not editable here and never will be: a skin's id is the XP
 * catalogue's model id, and ownership rows point at it. What an operator owns
 * on this page is the *words* - the name somebody sees over the character and
 * the backstory that makes them want it - plus what it costs and whether it
 * is still for sale.
 */
export default async function SkinsPage() {
  const { admin, supabase, level } = await requireBackofficeSection('skins')

  const [skins, vouchers, features] = await Promise.all([
    listSkinsAdmin(admin),
    listVouchersAdmin(admin),
    resolveFeatures(supabase, null),
  ])

  const owned = skins.reduce((total, skin) => total + skin.owners, 0)

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-lg font-semibold">Skins</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A look for the XP character, bound to the person who bought it — the
          same skin in every space and every level. The art ships with the
          client; what is sold here is the right to wear it. A{' '}
          <span className="font-medium text-foreground">skin</span> is bought
          with money, a{' '}
          <span className="font-medium text-foreground">super</span> skin only
          with vouchers, and a subscription posts one voucher a month.
        </p>
        {/*
          The flag, said plainly on the page it governs. An operator editing
          prices on a shelf nobody can reach should find that out here rather
          than from a support message - and `skin_shop` closes the shop, not
          the wardrobe: a bought skin stays wearable either way.
        */}
        <p className="mt-2 text-sm">
          {features.skin_shop ? (
            <span className="text-emerald-600">The shop is open.</span>
          ) : (
            <span className="text-amber-600">
              The shop is closed — the <code>skin_shop</code> flag is off, so
              nobody can browse or buy. Skins already owned stay wearable.
            </span>
          )}
          <span className="ml-2 text-muted-foreground">
            {skins.length} on the shelf · {owned} owned.
          </span>
        </p>
      </div>

      <SkinShelf skins={skins} readOnly={level !== 'write'} />

      {/* Below the shelf, because it is the other way onto it. */}
      <VoucherLog vouchers={vouchers} readOnly={level !== 'write'} />
    </div>
  )
}
