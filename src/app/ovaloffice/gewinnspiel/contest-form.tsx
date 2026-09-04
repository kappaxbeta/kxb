'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { mintContestCode, saveContestSettings } from '@/domain/contest/actions'
import type { ContestSettings } from '@/domain/contest/settings'
import type { ContestHealth } from '@/domain/contest/health'
import { PAID_TIERS } from '@/domain/billing/tiers'
import { ErrorNote } from '@/app/components/error-note'

/**
 * The contest, as two forms that do two different jobs.
 *
 * The first is the document: dates, prizes, the tag, the age floor, and whether
 * the site points at any of it. The second is the code: what somebody gets for
 * typing it. They are apart because the first is words and the second is money,
 * and an operator correcting a hashtag should not be one Enter away from
 * changing what a live campaign hands out.
 *
 * Both are plain `action={}` forms rather than controlled inputs. A page that
 * is read far more often than it is written wants the browser's own state, and
 * the only thing worth being clever about here is the confirmation.
 */

const FIELD = 'rounded-lg border border-border bg-card px-2 py-1.5 text-sm'
const BUTTON =
  'rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-secondary disabled:opacity-50'

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="flex flex-col gap-1 text-xs text-muted-foreground">
      {children}
      {hint && <span className="text-[11px] leading-snug">{hint}</span>}
    </span>
  )
}

export function ContestForm({
  settings,
  offer,
  readOnly,
}: {
  settings: ContestSettings
  offer: ContestHealth['offer']
  readOnly: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(what: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    setSaved(null)
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        setSaved(what)
        router.refresh()
      } else {
        setError(result.error ?? 'That did not work.')
      }
    })
  }

  return (
    <div className="space-y-8">
      {error && <ErrorNote>{error}</ErrorNote>}
      {saved && (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-500">
          {saved}
        </p>
      )}

      <form
        action={(formData) => {
          run('Saved. The six pages have been rebuilt.', () =>
            saveContestSettings({
              live: formData.get('live') === 'on',
              code: String(formData.get('code') ?? ''),
              startsOn: String(formData.get('startsOn') ?? ''),
              endsOn: String(formData.get('endsOn') ?? ''),
              drawsOn: String(formData.get('drawsOn') ?? ''),
              prizes: String(formData.get('prizes') ?? ''),
              hashtag: String(formData.get('hashtag') ?? ''),
              handle: String(formData.get('handle') ?? ''),
              minAge: Number(formData.get('minAge') ?? 18),
            }),
          )
        }}
        className="space-y-4 rounded-lg border border-border px-4 py-4"
      >
        <h3 className="text-sm font-medium">The contest</h3>

        {/*
          The switch first, and it says what it does rather than what it is.
          "Live" on its own reads as "the contest exists", and somebody turning
          it off to end a campaign needs to know the conditions stay up - a
          document people entered on the strength of does not get to 404.
        */}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="live"
            defaultChecked={settings.live}
            disabled={readOnly}
            className="mt-1"
          />
          <span>
            Point the site at it
            <span className="mt-0.5 block text-xs text-muted-foreground">
              The footer links to the conditions while this is on. The pages
              themselves stay reachable either way.
            </span>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <Label hint="Entries count from this day.">
            opens
            <input
              type="date"
              name="startsOn"
              defaultValue={settings.startsOn}
              disabled={readOnly}
              className={FIELD}
            />
          </Label>
          <Label hint="23:59 Berlin, said in the prose.">
            closes
            <input
              type="date"
              name="endsOn"
              defaultValue={settings.endsOn}
              disabled={readOnly}
              className={FIELD}
            />
          </Label>
          <Label hint="The code has to still work on this day.">
            drawn
            <input
              type="date"
              name="drawsOn"
              defaultValue={settings.drawsOn}
              disabled={readOnly}
              className={FIELD}
            />
          </Label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Label hint="Euro, best first. As many as there are prizes.">
            prizes
            <input
              name="prizes"
              defaultValue={settings.prizes.join(', ')}
              disabled={readOnly}
              className={FIELD}
            />
          </Label>
          <Label hint="The code on the poster. Set it up below.">
            code
            <input
              name="code"
              defaultValue={settings.code}
              disabled={readOnly}
              className={`${FIELD} font-mono uppercase`}
            />
          </Label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Label hint="Without the #.">
            hashtag
            <input
              name="hashtag"
              defaultValue={settings.hashtag}
              disabled={readOnly}
              className={FIELD}
            />
          </Label>
          <Label hint="Without the @. Entries are addressed here.">
            handle
            <input
              name="handle"
              defaultValue={settings.handle}
              disabled={readOnly}
              className={FIELD}
            />
          </Label>
          <Label hint="A voucher handed to a minor needs a guardian; 18 unless the prize changes.">
            minimum age
            <input
              type="number"
              name="minAge"
              min={16}
              max={99}
              defaultValue={settings.minAge}
              disabled={readOnly}
              className={FIELD}
            />
          </Label>
        </div>

        <button type="submit" disabled={readOnly || isPending} className={BUTTON}>
          Save the contest
        </button>
      </form>

      <form
        action={(formData) => {
          run('The code is set up. Check the line at the top of the page.', () =>
            mintContestCode({
              tier: String(formData.get('tier') ?? 'xo'),
              freeDays: Number(formData.get('freeDays') ?? 30),
              bucks: Number(formData.get('bucks') ?? 0),
              vouchers: Number(formData.get('vouchers') ?? 0),
              coins: Number(formData.get('coins') ?? 0),
              days: Number(formData.get('days') ?? 0),
            }),
          )
        }}
        className="space-y-4 rounded-lg border border-dashed border-border px-4 py-4"
      >
        <h3 className="text-sm font-medium">
          What <span className="font-mono">{settings.code}</span> is worth
        </h3>
        <p className="max-w-3xl text-xs text-muted-foreground">
          This creates the code if it does not exist, and brings it into line
          with the numbers below if it does. It never raises a code from
          revoked and never touches the count of redemptions — both of those
          live on the Codes page, with the history. The code is uncapped on
          purpose: a headcount on it is a headcount on the contest, and § 5
          promises anybody may enter for nothing.
        </p>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Label hint="What the free run is of.">
            plan
            <select
              name="tier"
              defaultValue={offer?.tier ?? 'xo'}
              disabled={readOnly}
              className={`${FIELD} font-mono`}
            >
              {PAID_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </Label>
          <Label hint="Days of it, once redeemed.">
            free days
            <input
              type="number"
              name="freeDays"
              min={1}
              max={365}
              defaultValue={offer?.freeDays ?? 30}
              disabled={readOnly}
              className={FIELD}
            />
          </Label>
          {/*
            Bucks, and the reason this page has them at all: "a month free plus
            five bucks for skins" is an offer somebody acts on today, where a
            free month of a plan is a promise about a fortnight from now.
          */}
          <Label hint="Straight into their pocket. Buys skins.">
            bucks
            <input
              type="number"
              name="bucks"
              min={0}
              max={50}
              defaultValue={offer?.bucks ?? 5}
              disabled={readOnly}
              className={FIELD}
            />
          </Label>
          <Label hint="Bearer codes they can pass on. Shown once.">
            voucher codes
            <input
              type="number"
              name="vouchers"
              min={0}
              max={50}
              defaultValue={offer?.vouchers ?? 0}
              disabled={readOnly}
              className={FIELD}
            />
          </Label>
          <Label hint="Into their wallet. Only spend where the economy is on.">
            coins
            <input
              type="number"
              name="coins"
              min={0}
              max={100000}
              defaultValue={offer?.coins ?? 0}
              disabled={readOnly}
              className={FIELD}
            />
          </Label>
          <Label hint="Days the code itself works. 0 = until revoked.">
            valid days
            <input
              type="number"
              name="days"
              min={0}
              max={3650}
              defaultValue={0}
              disabled={readOnly}
              className={FIELD}
            />
          </Label>
        </div>

        <button type="submit" disabled={readOnly || isPending} className={BUTTON}>
          Set the code up
        </button>
      </form>
    </div>
  )
}
