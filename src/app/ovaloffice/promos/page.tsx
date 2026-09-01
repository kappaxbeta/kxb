import { PromoList } from '@/app/ovaloffice/promos/promo-list'
import { RedemptionLog } from '@/app/ovaloffice/promos/redemption-log'
import { listPromoCodes, listRedemptions } from '@/domain/promo/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * Codes, and what they brought in.
 *
 * One page for both halves for the same reason Access holds the door and the
 * queue together: an admin minting a code wants to see, in the same glance,
 * whether the last one worked. Splitting them would mean deciding to go and
 * look, which is the decision people do not make.
 *
 * It sits under Operations rather than Management because a campaign is a thing
 * you run on a date - the same rhythm as the queues and the events beside it,
 * and not the same as configuring a world.
 */
export default async function PromosPage() {
  const { admin } = await requireBackofficeSection('promos')

  const [codes, redemptions] = await Promise.all([
    listPromoCodes(admin),
    listRedemptions(admin),
  ])

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-lg font-semibold">Codes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A code gets a new account one month free — no card, nothing charged
          when it ends, and the space simply goes read-only until they subscribe.
          One per account, ever: somebody who has already redeemed, or who has
          been through Stripe, is refused wherever they try it.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Most codes are handed out one link at a time. A code named{' '}
          <span className="font-mono">SIGNUP…</span> is the exception — it is a
          standing offer, shown on the sign-up form to everybody who reaches it
          and filled in for them. Name one that way only when you mean it to be
          public.
        </p>
      </div>

      <PromoList codes={codes} />

      {/* Below the codes, because it is the answer to them. */}
      <RedemptionLog redemptions={redemptions} />
    </div>
  )
}
