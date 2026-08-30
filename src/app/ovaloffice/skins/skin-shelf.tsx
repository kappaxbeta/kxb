'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { saveSkin } from '@/domain/skins/actions'
import { skinThumbUrl } from '@/domain/skins/application'
import type { SkinAdminRow } from '@/domain/skins/queries'
import { ErrorNote } from '@/app/components/error-note'

/**
 * The shelf: every skin, its words, and what it costs.
 *
 * One card per skin rather than a table row, because the thing being edited is
 * a paragraph. A backstory in a table cell is a backstory nobody reads before
 * shipping it, and these are the sentences that do the selling.
 *
 * Editing is per-card and explicit: a card opens, you change what you came to
 * change, you save that one row. `saveSkin` is a whole-row write, so the form
 * always posts every field - which is also why a card cannot be half-open.
 */

const BUTTON =
  'rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary disabled:opacity-50'

const FIELD = 'rounded-lg border border-border bg-card px-2 py-1.5 text-sm'

export function SkinShelf({
  skins,
  readOnly,
}: {
  skins: SkinAdminRow[]
  readOnly: boolean
}) {
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">The shelf</h3>

      <ul className="grid gap-3 lg:grid-cols-2">
        {skins.map((skin) => (
          <li key={skin.id}>
            <SkinCard
              skin={skin}
              readOnly={readOnly}
              open={editing === skin.id}
              onOpen={() => setEditing(editing === skin.id ? null : skin.id)}
              onDone={() => setEditing(null)}
            />
          </li>
        ))}
      </ul>

      {skins.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No skins yet. The shelf is seeded by the skins migration; a new look
          is a new catalogue row, because ownership points at the model id.
        </p>
      )}
    </section>
  )
}

function SkinCard({
  skin,
  readOnly,
  open,
  onOpen,
  onDone,
}: {
  skin: SkinAdminRow
  readOnly: boolean
  open: boolean
  onOpen: () => void
  onDone: () => void
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await saveSkin({
        id: skin.id,
        name: String(formData.get('name') ?? '').trim(),
        tier: formData.get('tier') === 'super' ? 'super' : 'skin',
        // Money no longer buys a skin directly - it buys bucks - so the euro
        // price is not edited here any more. It is posted back unchanged
        // because saveSkin is a whole-row write and omitting it would blank
        // the column for the rows that still carry a historical price.
        priceCents: skin.priceCents,
        voucherCost: Number(formData.get('voucherCost') ?? 1),
        backstory: String(formData.get('backstory') ?? '').trim(),
        active: formData.get('active') === 'on',
      })

      if (result.ok) {
        onDone()
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="h-full rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        {/* The thumbnail the XP pipeline already draws, so this page cannot
            advertise a model the catalogue does not have. */}
        <Image
          src={skinThumbUrl(skin.id)}
          alt=""
          width={192}
          height={192}
          className="h-16 w-16 shrink-0 rounded-lg border border-border object-contain"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{skin.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{skin.id}</span>
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              className={
                skin.tier === 'super'
                  ? 'rounded bg-secondary px-1.5 py-0.5 font-medium text-foreground'
                  : 'rounded bg-secondary px-1.5 py-0.5'
              }
            >
              {skin.tier}
            </span>
            <span>
              {skin.voucherCost} {skin.voucherCost === 1 ? 'buck' : 'bucks'}
            </span>
            <span>· {skin.owners} owned</span>
            {!skin.active && <span className="text-amber-600">· retired</span>}
          </p>
        </div>

        {!readOnly && (
          <button type="button" onClick={onOpen} className={BUTTON}>
            {open ? 'Close' : 'Edit'}
          </button>
        )}
      </div>

      {!open && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {skin.backstory || <span className="italic">No backstory written yet.</span>}
        </p>
      )}

      {open && (
        <form action={save} className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className="flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">Name</span>
              <input
                name="name"
                defaultValue={skin.name}
                required
                maxLength={60}
                className={`${FIELD} w-full`}
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Tier</span>
              <select name="tier" defaultValue={skin.tier} className={`${FIELD} block`}>
                <option value="skin">skin</option>
                <option value="super">super</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Bucks</span>
              <input
                name="voucherCost"
                type="number"
                min="1"
                max="10"
                defaultValue={skin.voucherCost}
                className={`${FIELD} block w-24`}
              />
            </label>

            <label className="flex items-end gap-2 pb-1.5 text-sm">
              <input type="checkbox" name="active" defaultChecked={skin.active} />
              On sale
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">
              Backstory — what somebody reads before they buy
            </span>
            <textarea
              name="backstory"
              defaultValue={skin.backstory}
              rows={5}
              maxLength={1000}
              className={`${FIELD} w-full leading-relaxed`}
            />
          </label>

          <ErrorNote>{error}</ErrorNote>

          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className={BUTTON}>
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onDone} className={BUTTON}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
