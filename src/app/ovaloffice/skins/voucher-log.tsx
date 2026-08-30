'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { mintSkinVouchers } from '@/domain/skins/actions'
import type { VoucherAdminRow } from '@/domain/skins/queries'
import { ErrorNote } from '@/app/components/error-note'

/**
 * Bucks: where they came from and what became of them.
 *
 * The full list rather than the unspent ones, because the question support
 * actually gets is "was this code ever real" - and a log that hides spent
 * codes cannot answer it.
 *
 * Minting hands back the codes it just made and keeps them on screen until the
 * page is left. They are bearer codes: unclaimed, whoever types one owns it, so
 * an operator who navigates away before copying them has minted confetti. That
 * is also why they are selectable text rather than a toast.
 */

const BUTTON =
  'rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary disabled:opacity-50'

const FIELD = 'rounded-lg border border-border bg-card px-2 py-1.5 text-sm'

/** Where a voucher came from, in the order somebody meets them. */
const SOURCE_LABEL: Record<string, string> = {
  subscription: 'monthly',
  backoffice: 'minted',
  gift: 'gifted',
  purchase: 'bought',
}

export function VoucherLog({
  vouchers,
  readOnly,
}: {
  vouchers: VoucherAdminRow[]
  readOnly: boolean
}) {
  const router = useRouter()
  const [minted, setMinted] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function mint(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await mintSkinVouchers(Number(formData.get('count') ?? 1))
      if (result.ok) {
        setMinted(result.codes)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">KXB bucks</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          One buck buys a regular skin; a super skin takes two. Money buys
          bucks, bucks buy everything on the shelf. A code is a bearer token
          until somebody redeems it — anybody who has the string can claim it,
          which is what makes gifting work and an uncopied mint a waste.
        </p>
      </div>

      {!readOnly && (
        <form action={mint} className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">How many</span>
            <input
              name="count"
              type="number"
              min="1"
              max="50"
              defaultValue="5"
              className={`${FIELD} block w-24`}
            />
          </label>
          <button type="submit" disabled={isPending} className={BUTTON}>
            {isPending ? 'Minting…' : 'Mint codes'}
          </button>
        </form>
      )}

      <ErrorNote>{error}</ErrorNote>

      {minted.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            Just minted — copy them now, they are not shown again.
          </p>
          <p className="mt-2 select-all font-mono text-sm leading-relaxed">
            {minted.join('  ')}
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">From</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium">Minted</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((voucher) => (
              <tr key={voucher.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{voucher.code}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {SOURCE_LABEL[voucher.source] ?? voucher.source}
                </td>
                <td className="px-3 py-2 text-xs">
                  {voucher.spentOn ? (
                    <span className="text-muted-foreground">
                      spent on <span className="font-mono">{voucher.spentOn}</span>
                    </span>
                  ) : voucher.claimed ? (
                    <span className="text-emerald-600">claimed</span>
                  ) : (
                    <span className="text-amber-600">in flight</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                  {new Date(voucher.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {vouchers.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            No vouchers yet. Mint a handful above, or wait for the first
            subscription month to post one.
          </p>
        )}
      </div>
    </section>
  )
}
