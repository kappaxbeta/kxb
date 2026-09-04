'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  clearGrantsFor,
  createPromoCode,
  grantTierToAccount,
  revokePromoCode,
} from '@/domain/promo/actions'
import { isSignupOffer, SIGNUP_OFFER_PREFIX, type RedeemSource } from '@/domain/promo/application'
import type { PromoCodeView } from '@/domain/promo/queries'
import { asTier, isPaidTier, PAID_TIERS, tierPrice } from '@/domain/billing/tiers'
import { ErrorNote } from '@/app/components/error-note'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

/**
 * The plan a promo grants when the form says nothing.
 *
 * The cheapest thing that can actually be bought, not `DEFAULT_TIER` - which is
 * now `free`, and a free month of the free plan is not an offer. `PAID_TIERS`
 * is ordered cheapest first, so this stays right if a rung is added below xo.
 */
const DEFAULT_PROMO_TIER = PAID_TIERS[0]

/**
 * The plan named on the form, if it is one a promo can grant.
 *
 * Falls back rather than throwing, and rejects `free` on the way through: the
 * select only offers paid plans, so anything else arrived by hand-editing the
 * request, and the useful response to that is the default rather than a stack
 * trace in an operator's face.
 */
function paidTierOr(value: FormDataEntryValue | null) {
  const tier = asTier(value)
  return tier && isPaidTier(tier) ? tier : DEFAULT_PROMO_TIER
}

/**
 * The codes, and the form for minting one.
 *
 * Modelled on the invite list next door, deliberately - they are the same act
 * from an admin's point of view (hand somebody a string that does something)
 * and the muscle memory should carry across. The differences are the ones that
 * matter: a code is public, so it is displayed rather than hidden behind a copy
 * button, and it carries a redemption breakdown, because unlike an invite the
 * whole reason for minting it is to find out where people came from.
 *
 * As with the invites, the link is built from `window.location.origin` rather
 * than from NEXT_PUBLIC_APP_URL: an admin copying a link wants the host they
 * are on, and a staging backoffice handing out production links is a quietly
 * wrong answer that looks right.
 */

const BUTTON =
  'rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary disabled:opacity-50'

const FIELD = 'rounded-lg border border-border bg-card px-2 py-1.5 text-sm'

/** The doors, in the order somebody meets them. */
const SOURCE_LABEL: Record<RedeemSource, string> = {
  link: 'link',
  signup: 'sign-up',
  picker: 'picker',
  space: 'in space',
  // Not a door: nobody redeemed this, an operator handed it over.
  grant: 'granted',
}

export function PromoList({ codes }: { codes: PromoCodeView[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  // Code string, label, campaign channel and plan are what an operator scans -
  // the code to match a poster, the campaign to pull one channel's worth.
  const view = useTableView(
    codes,
    (code) => `${code.code} ${code.label ?? ''} ${code.campaign ?? ''} ${code.tier}`,
  )

  function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await run()
      if (!result.ok) setError(result.error ?? 'That did not work')
      else router.refresh()
    })
  }

  async function copy(code: PromoCodeView) {
    const link = `${window.location.origin}/code/${code.code}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(code.id)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Refused on an insecure origin, or without a gesture the browser saw.
      // Showing the link beats a button that silently does nothing.
      setError(link)
    }
  }

  return (
    <section className="space-y-4">
      <ErrorNote className="break-all">{error}</ErrorNote>

      {/*
        Putting one account on a plan, without a code changing hands.
        
        Above the code minter because it is the thing an operator comes here to
        do far more often: a code is for a campaign, this is for "put this
        tester on xp so they can see the editor".
        
        It mints a hidden single-use code underneath and redeems it - see
        `grantTierToAccount`. That is not a workaround: the code row is what
        answers "why is this account on xp" six months from now.
      */}
      <div className="rounded-xl border border-dashed border-border px-3 py-2.5">
        <p className="text-xs text-muted-foreground">Put an account on a plan</p>

        <form
          action={(formData) => {
            act(() =>
              grantTierToAccount({
                email: String(formData.get('email') ?? ''),
                tier: String(formData.get('grantTier') ?? DEFAULT_PROMO_TIER),
                /*
                  Forever is the absence of a length, so the checkbox wins over
                  the number rather than the number being cleared. Leaving the
                  count on screen while it is ticked is deliberate: unticking
                  puts back the number that was there, and a field that emptied
                  itself would make somebody type it again to change their mind.
                */
                days: formData.get('forever') === 'on' ? null : Number(formData.get('grantDays') ?? 30),
                // Blank is every space they own, which is what a grant has
                // always meant. `Number('')` is 0, so the empty string has to be
                // checked rather than the number.
                spaces:
                  String(formData.get('grantSpaces') ?? '').trim() === ''
                    ? null
                    : Number(formData.get('grantSpaces')),
                // The voucher rule, overridden knowingly rather than globally -
                // see `grantTierToAccount`.
                evenIfTheyPaid: formData.get('evenIfTheyPaid') === 'on',
                note: String(formData.get('note') ?? ''),
              }),
            )
          }}
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          <input
            name="email"
            type="email"
            required
            placeholder="email address"
            aria-label="Account email"
            className={`${FIELD} min-w-52 flex-1`}
          />
          <select
            name="grantTier"
            defaultValue={DEFAULT_PROMO_TIER}
            aria-label="Which plan to grant"
            className={`${FIELD} w-20 font-mono`}
          >
            {PAID_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            for
            <input
              name="grantDays"
              type="number"
              min={1}
              max={365}
              defaultValue={365}
              aria-label="Days the grant lasts"
              className={`${FIELD} w-20`}
            />
            days
          </label>
          {/*
            Or no end at all, which is a different thing from a long one.

            A checkbox rather than a "forever" option in the day count, because
            the two are not the same kind of answer: one is a number and the
            other is the absence of one. It writes NULL all the way down to
            `granted_until`, so a permanent grant says so on every screen instead
            of printing a date a century out and hoping nobody reads it.
          */}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input name="forever" type="checkbox" className="size-3.5" />
            forever
          </label>
          {/*
            The voucher rule, off for this one grant.

            `account_has_had_tier` refuses a plan to anybody who has bought it -
            right for a code, wrong here, where the people being comped are the
            ones most likely to have paid us before. Unticked by default so the
            rule is the normal answer, and the refusal points at this box by
            name when it fires.
          */}
          <label
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            title="account_has_had_tier refuses a plan somebody has already paid for. This grant ignores it."
          >
            <input name="evenIfTheyPaid" type="checkbox" className="size-3.5" />
            even if they paid before
          </label>
          {/*
            How many of their spaces it reaches. Blank is all of them, which is
            what every grant meant before this field existed - so the empty form
            behaves exactly as it did.

            The oldest that many, and the placeholder says so rather than a help
            line under the form: an operator typing 2 needs to know *which* two
            at the moment they type it, not after somebody asks why their new
            space is on free.
          */}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            for
            <input
              name="grantSpaces"
              type="number"
              min={1}
              placeholder="all"
              aria-label="How many of their spaces the grant covers, oldest first"
              className={`${FIELD} w-16`}
            />
            spaces (oldest first)
          </label>
          <input
            name="note"
            placeholder="why (optional)"
            aria-label="Why this grant exists"
            className={`${FIELD} min-w-40 flex-1`}
          />
          <button type="submit" disabled={busy} className={BUTTON}>
            Grant
          </button>
        </form>

        {/*
          Back to free is its own control, because free is the *absence* of a
          grant rather than a third option in the select above. A grant only
          ever raises, so "grant free" would be a button that appears to work
          and does nothing.
        */}
        <form
          action={(formData) => {
            const email = String(formData.get('clearEmail') ?? '')
            if (!confirm(`Remove every plan grant from ${email}?`)) return
            act(() => clearGrantsFor(email))
          }}
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          <input
            name="clearEmail"
            type="email"
            required
            placeholder="email address"
            aria-label="Account to put back on free"
            className={`${FIELD} min-w-52 flex-1`}
          />
          <button type="submit" disabled={busy} className={BUTTON}>
            Clear grants → free
          </button>
          <span className="text-xs text-muted-foreground">
            The codes stay; they are the log of what was granted.
          </span>
        </form>
      </div>

      <form
        action={(formData) => {
          act(() =>
            createPromoCode({
              code: String(formData.get('code') ?? ''),
              label: String(formData.get('label') ?? ''),
              campaign: String(formData.get('campaign') ?? ''),
              freeDays: Number(formData.get('freeDays') ?? 30),
              maxUses: Number(formData.get('maxUses') ?? 0),
              days: Number(formData.get('days') ?? 0),
              tier: paidTierOr(formData.get('tier')),
              bucks: Number(formData.get('bucks') ?? 0),
              vouchers: Number(formData.get('vouchers') ?? 0),
              coins: Number(formData.get('coins') ?? 0),
            }),
          )
        }}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5"
      >
        <input
          name="code"
          placeholder="CAFE24, or SIGNUP50 (blank = generate)"
          aria-label="The code itself"
          maxLength={40}
          className={`${FIELD} min-w-44 flex-1 font-mono uppercase`}
        />
        <input
          name="label"
          placeholder="what is it for"
          aria-label="Label"
          className={`${FIELD} min-w-40 flex-1`}
        />
        <input
          name="campaign"
          placeholder="channel, e.g. poster-hbf"
          aria-label="Campaign"
          className={`${FIELD} min-w-40 flex-1`}
        />
        {/*
          Which plan the month is of, and therefore what the code is worth.

          A select rather than a checkbox, and defaulting to xo, because the
          two are not "off and on" - they are two products at two prices, and
          the default has to be the cheaper one. See the column's own note in
          the tiers migration.
        */}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          plan
          <select
            name="tier"
            defaultValue={DEFAULT_PROMO_TIER}
            aria-label="Which plan the free month is of"
            className={`${FIELD} w-20 font-mono`}
          >
            {PAID_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier} · {tierPrice(tier)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          free days
          <input
            name="freeDays"
            type="number"
            min={1}
            max={365}
            defaultValue={30}
            aria-label="How long the free run lasts once redeemed"
            className={`${FIELD} w-16`}
          />
        </label>
        {/*
          The three things a code hands over besides the month, beside the free
          days rather than beside the plan.

          Next to each other because they are one sentence - "a month of xo,
          five bucks and 500 coins" - and an operator setting one almost always
          wants to see the other two. All three default to zero: most codes are
          still a month and nothing else, and a form that started at one would
          quietly make every campaign more expensive than it was asked to be.

          `bucks` is the one to reach for. It lands in the redeemer's own pocket
          and buys skins; `vouchers` mints bearer codes they can pass on, which
          is a different present and a rarer one.
        */}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          bucks
          <input
            name="bucks"
            type="number"
            min={0}
            max={50}
            defaultValue={0}
            aria-label="Bucks dropped in the redeemer's pocket, on top of the free month"
            className={`${FIELD} w-16`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          voucher codes
          <input
            name="vouchers"
            type="number"
            min={0}
            max={50}
            defaultValue={0}
            aria-label="Bearer voucher codes handed to the redeemer to pass on"
            className={`${FIELD} w-16`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          coins
          <input
            name="coins"
            type="number"
            min={0}
            max={100000}
            defaultValue={0}
            aria-label="Coins minted into the redeemer's wallet"
            className={`${FIELD} w-20`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          uses
          <input
            name="maxUses"
            type="number"
            min={0}
            max={1000000}
            defaultValue={0}
            aria-label="How many accounts may redeem it, 0 for unlimited"
            className={`${FIELD} w-20`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          valid days
          <input
            name="days"
            type="number"
            min={0}
            max={3650}
            defaultValue={0}
            aria-label="Days until the code stops working, 0 for never"
            className={`${FIELD} w-20`}
          />
        </label>
        <button type="submit" disabled={busy} className={BUTTON}>
          Create code
        </button>
        <p className="w-full text-xs text-muted-foreground">
          <strong className="font-medium">Free days</strong> is how long somebody
          gets once they redeem — <strong className="font-medium">valid days</strong>{' '}
          is how long the code itself keeps working. A poster that comes down in a
          fortnight still promises a full month to whoever reads it on the last
          day. Leave uses or valid days at 0 for no limit.{' '}
          <strong className="font-medium">Bucks</strong> land in the pocket the
          moment the code is redeemed and buy skins in the shop — the half of the
          offer somebody can spend the same minute.{' '}
          <strong className="font-medium">Voucher codes</strong> are bearer codes
          handed to them instead, to pass on; they are shown once, on the screen
          that took the code. <strong className="font-medium">Coins</strong> are
          minted into their wallet and only spend in a space with the economy
          switched on.
        </p>
        {/*
          The naming convention, said on the form rather than in a handbook.

          It is the one thing here that changes who can see the code, so it
          belongs next to the box you type the name into - and the rows below
          badge the codes it caught, so an operator can check they got what they
          meant rather than having to go and look at /signup.
        */}
        <p className="w-full text-xs text-muted-foreground">
          Name it{' '}
          <strong className="font-mono font-medium">{SIGNUP_OFFER_PREFIX}…</strong>{' '}
          and it becomes a standing offer: the sign-up form shows it to everyone
          and fills it in for them. Anything else is private to whoever you hand
          it to. The best offer wins the top slot — higher plan first, then the
          longer run.
        </p>
      </form>

      {codes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No codes yet. One created here works at /code/THECODE, on the sign-up
          form, and in any space’s billing page.
        </p>
      ) : (
        <div>
          <TableToolbar view={view} placeholder="Search by code, label or campaign…" unit="codes" />
          <ul className="space-y-2">
          {view.pageRows.map((code) => (
            <li
              key={code.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-sm"
            >
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  code.live
                    ? 'bg-emerald-500/20 text-emerald-500'
                    : 'bg-card text-muted-foreground'
                }`}
              >
                {code.live ? 'live' : code.revokedAt ? 'revoked' : 'closed'}
              </span>

              <span className="font-mono text-sm">{code.code}</span>

              {/*
                The plan, on every row rather than only the ones that are xp.

                Showing it conditionally would make an xo code and a code minted
                before this column existed look identical, and they are worth
                the same €5 - but an admin scanning the list for "which of these
                gives away the expensive one" needs the absence of a badge to
                mean something reliable.
              */}
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-xs ${
                  code.tier === 'xp'
                    ? 'bg-accent/20 text-accent'
                    : 'bg-card text-muted-foreground'
                }`}
              >
                {code.tier}
              </span>

              {/*
                Named to be published. Cyan rather than the accent: this says
                what the code *is*, not what an admin can do to it, and the
                buttons at the end of the row are the actions.
              */}
              {isSignupOffer(code.code) && (
                <span
                  className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-xs text-cyan-400"
                  title="Shown on the sign-up form to anyone who reaches it"
                >
                  on sign-up
                </span>
              )}

              <span className="min-w-0 flex-1">
                {code.label && <span className="truncate">{code.label}</span>}
                {code.campaign && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {code.campaign}
                  </span>
                )}
                <span className="ml-2 text-xs text-muted-foreground">
                  {/* No day count is a grant with no end, said in the word
                      rather than as a blank. */}
                  {code.freeDays === null ? 'forever' : `${code.freeDays} free days`}
                  {/* Silent when it covers everything, which is what a code has
                      always done - a "· all spaces" on every row would be noise
                      on the common case to label the rare one. */}
                  {code.spaces !== null &&
                    ` · ${code.spaces} space${code.spaces === 1 ? '' : 's'}`}
                  {/* The three extras, each silent at zero. Most codes carry
                      none of them and a row that said "0 bucks · 0 coins"
                      would be three words of nothing on every line. */}
                  {code.bucks > 0 && ` · ${code.bucks} bucks`}
                  {code.vouchers > 0 &&
                    ` · ${code.vouchers} voucher code${code.vouchers === 1 ? '' : 's'}`}
                  {code.coins > 0 && ` · ${code.coins} coins`}
                  {code.expiresAt &&
                    ` · until ${new Date(code.expiresAt).toLocaleDateString()}`}
                </span>
              </span>

              {/*
                The number the code exists to produce, and the split that a
                plain counter cannot show: the same code doing well on the link
                and badly on the sign-up form means the link is being followed
                and the form is losing people.
              */}
              <span className="text-xs text-muted-foreground">
                <span className="text-foreground">{code.uses}</span>
                {code.maxUses === null ? '' : `/${code.maxUses}`} redeemed
                {code.uses > 0 && (
                  <span className="ml-1">
                    (
                    {(Object.keys(SOURCE_LABEL) as RedeemSource[])
                      .filter((source) => code.bySource[source] > 0)
                      .map((source) => `${SOURCE_LABEL[source]} ${code.bySource[source]}`)
                      .join(', ')}
                    )
                  </span>
                )}
              </span>

              <button
                type="button"
                onClick={() => copy(code)}
                className={BUTTON}
                disabled={busy}
              >
                {copied === code.id ? 'Copied' : 'Copy link'}
              </button>

              {code.live && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm(`Stop ${code.code} working? Months already granted are kept.`)) {
                      return
                    }
                    act(() => revokePromoCode(code.id))
                  }}
                  className="text-xs text-muted-foreground transition hover:text-red-500 disabled:opacity-50"
                >
                  revoke
                </button>
              )}
            </li>
          ))}
          </ul>
          <Pager view={view} />
        </div>
      )}
    </section>
  )
}
