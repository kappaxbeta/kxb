'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, useState, useTransition } from 'react'
import { Canvas } from '@react-three/fiber'
import { Spinnable, Stage, XpBody } from '@/app/components/character-stage'
import {
  chooseSkin,
  claimFreeSkin,
  giftSkinVoucher,
  redeemSkinVoucher,
  spendVouchersOnSkin,
} from '@/domain/skins/actions'
import { startBucksCheckout } from '@/domain/skins/buck-actions'
import { claimSkinGift, giftSkin } from '@/domain/skins/gifts'
import { skinThumbUrl, type ShopView, type SkinView } from '@/domain/skins/application'
import type { BuckBundle } from '@/domain/skins/bucks'
import { ErrorNote } from '@/app/components/error-note'

/**
 * The shop, shaped like the lobby.
 *
 * It was a grid of cards with a thumbnail in the corner of each - the product
 * filed as an icon, nine times. A skin is a character you will be looking at
 * for hours, so the shop shows one at a time, life-size, standing on the same
 * podium the lobby uses and breathing through the same idle clip the games
 * play. You turn it with the pointer. The shelf becomes a strip along the
 * bottom, which is what a shelf is.
 *
 * Selection is local and free: browsing costs nothing, so moving along the
 * strip commits to nothing and the argument for the one you are looking at -
 * its name, its backstory, its price - sits beside it rather than under a
 * thumbnail.
 *
 * One state machine for the whole page. Every action here ends in a
 * `router.refresh()` - buying, gifting and equipping all change what the rest
 * of the page should say.
 *
 * Deliberately no optimistic equip, unlike the peep picker: wearing a skin is
 * a claim about ownership that a row policy adjudicates, and showing it worn
 * before the database agrees is showing somebody a thing they may not have.
 */
export function Shop({
  view,
  bundles,
  checkout,
}: {
  view: ShopView
  bundles: BuckBundle[]
  checkout: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  /** Codes handed back this session, by what produced them. */
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [gifting, setGifting] = useState(false)

  /**
   * Who is on the podium. Seeded to what you are wearing, so the page opens on
   * the answer you already gave rather than on whatever sorts first.
   */
  const [selectedId, setSelectedId] = useState<string | null>(
    view.chosen ?? view.skins[0]?.id ?? null,
  )
  const [, startTransition] = useTransition()

  const wallet = view.vouchers.length
  const skin = view.skins.find((entry) => entry.id === selectedId) ?? view.skins[0] ?? null

  function run(
    key: string,
    action: () => Promise<{ ok: boolean; error?: string; message?: string; code?: string }>,
  ) {
    setBusy(key)
    setError(null)
    setNote(null)
    startTransition(async () => {
      const result = await action()
      setBusy(null)
      if (result.ok) {
        if (result.code) setCodes((all) => ({ ...all, [key]: result.code! }))
        if (result.message) setNote(result.message)
        router.refresh()
      } else {
        setError(result.error ?? 'That did not work. Try again.')
      }
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-8">
      {/*
        The way back, above the title rather than beside it.

        This page is reached from three places - the rail in a space, the
        lobby's locker, and a link somebody was sent - and none of them is a
        tab you can close to get back. Pointing at the lobby rather than at
        `history.back()` because it is the one destination that is right from
        all three: it is where your spaces are, and it is where the other half
        of the wardrobe lives.
      */}
      <Link
        href="/tenants"
        className="-mb-2 inline-flex w-fit items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
      >
        <span aria-hidden>←</span> Back to your spaces
      </Link>

      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-pixel text-2xl uppercase text-ink">Skins</h1>
        <p className="text-sm text-ink-muted">
          A look for your character in the games — yours on every account, in
          every space.
        </p>
      </header>

      {!view.open && (
        <p className="rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-ink-muted">
          The shop is closed just now. Anything you already own stays yours and
          stays wearable.
        </p>
      )}

      {checkout === 'bucks' && (
        <p className="rounded-xl border border-accent/50 bg-surface-raised px-4 py-3 text-sm">
          Payment went through — your bucks are in the wallet. If the count
          looks short, give it a moment and reload.
        </p>
      )}
      {checkout === 'canceled' && (
        <p className="rounded-xl border border-line px-4 py-3 text-sm text-ink-muted">
          Checkout was cancelled. Nothing was charged.
        </p>
      )}

      {view.signedIn && (
        <Wallet
          count={wallet}
          vouchers={view.vouchers}
          bundles={bundles}
          codes={codes}
          busy={busy}
          open={view.open}
          onBuy={(bundleId) => run(`bucks:${bundleId}`, () => startBucksCheckout(bundleId))}
          /*
           * One field, both kinds of code. A present and a loose buck arrive
           * as the same string from the recipient\'s point of view, and asking
           * which they were given is a question only the sender can answer -
           * so the field tries the present first (it is the code with a name
           * on it) and falls through to the buck when no present has it.
           */
          onCode={(code) =>
            run('code', async () => {
              const asGift = await claimSkinGift(code)
              if (asGift.ok || asGift.error !== 'No present has that code.') return asGift
              return redeemSkinVoucher(code)
            })
          }
          onGiveBuck={(id) =>
            run(`buck:${id}`, async () => {
              const result = await giftSkinVoucher(id)
              return result.ok ? { ok: true, code: result.code } : result
            })
          }
        />
      )}

      <ErrorNote>{error}</ErrorNote>
      {note && (
        <p className="rounded-xl border border-accent/50 bg-surface-raised px-4 py-3 text-sm">
          {note}
        </p>
      )}

      {skin && (
        <div className="grid gap-5 lg:grid-cols-[1fr_minmax(20rem,26rem)]">
          {/* The stage. First on a phone, because it is the thing you came to
              look at; second on desktop, where the argument reads left. */}
          <section
            aria-label={skin.name}
            className="order-first rounded-2xl border border-line bg-surface-raised/40 lg:order-last"
          >
            <div className="relative h-[42dvh] w-full lg:h-[58dvh]">
              <Canvas
                camera={{ position: [0, 1.35, 6.4], fov: 35 }}
                style={{ touchAction: 'pan-y' }}
              >
                <ambientLight intensity={1.1} />
                <directionalLight position={[3, 6, 4]} intensity={2.2} />
                <pointLight position={[-2, 0.5, 2]} intensity={12} color="#ff4fa3" />
                <pointLight position={[2, 1, 2]} intensity={10} color="#4fd8ff" />
                <Suspense fallback={null}>
                  <group position={[0, -0.35, 0]}>
                    <Stage />
                    <Spinnable position={[0, 0, 0]} base={-0.35}>
                      {/* Keyed on the model: a mixer caches its bindings under
                          the root it was handed, so a re-dressed body would
                          stand stone still. */}
                      <XpBody key={skin.id} model={skin.id} />
                    </Spinnable>
                  </group>
                </Suspense>
              </Canvas>
              <p className="pointer-events-none absolute right-4 top-4 text-[0.62rem] uppercase tracking-[0.18em] text-ink-muted">
                drag to turn
              </p>
            </div>
          </section>

          <Detail
            skin={skin}
            owned={Boolean(view.owned[skin.id])}
            worn={view.chosen === skin.id}
            wallet={wallet}
            open={view.open}
            signedIn={view.signedIn}
            busy={busy}
            giftCode={codes[`gift:${skin.id}`] ?? null}
            gifting={gifting}
            onOpenGift={() => setGifting((was) => !was)}
            onGift={(message) =>
              run(`gift:${skin.id}`, async () => {
                const result = await giftSkin(skin.id, message)
                if (result.ok) setGifting(false)
                return result
              })
            }
            onSpend={() =>
              run(`spend:${skin.id}`, () =>
                isFree(skin) ? claimFreeSkin(skin.id) : spendVouchersOnSkin(skin.id),
              )
            }
            onWear={() => run(`wear:${skin.id}`, () => chooseSkin(skin.id))}
            onRemove={() => run(`wear:${skin.id}`, () => chooseSkin(null))}
          />
        </div>
      )}

      <Shelf
        skins={view.skins}
        owned={view.owned}
        chosen={view.chosen}
        selectedId={skin?.id ?? null}
        onSelect={(id) => {
          setSelectedId(id)
          setGifting(false)
        }}
      />

      {!view.signedIn && (
        <p className="text-sm text-ink-muted">
          Skins are bound to an account.{' '}
          <Link href="/signup" className="text-accent hover:underline">
            Make one
          </Link>{' '}
          and whatever you take follows you into every space.
        </p>
      )}
    </div>
  )
}

/**
 * Every skin, small, along the bottom.
 *
 * A strip rather than a grid: the grid was nine equal boxes competing for the
 * same glance, and what a shelf is for is picking the next one to look at.
 * Owned ones carry a tick so the strip doubles as the wardrobe.
 */
function Shelf({
  skins,
  owned,
  chosen,
  selectedId,
  onSelect,
}: {
  skins: SkinView[]
  owned: Record<string, string>
  chosen: string | null
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <section
      aria-label="The shelf"
      role="radiogroup"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2"
    >
      {skins.map((entry) => {
        const isSelected = entry.id === selectedId
        const isOwned = Boolean(owned[entry.id])
        return (
          <button
            key={entry.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(entry.id)}
            title={entry.name}
            className={`relative flex w-24 shrink-0 flex-col items-center rounded-xl border p-2 transition ${
              isSelected
                ? 'border-accent bg-accent/10'
                : 'border-line bg-surface-raised/50 hover:border-accent/60'
            }`}
          >
            <Image
              src={skinThumbUrl(entry.id)}
              alt=""
              width={192}
              height={192}
              className="h-12 w-12 object-contain"
            />
            <span
              className={`mt-1 w-full truncate text-center text-[0.7rem] ${
                isSelected ? 'text-ink' : 'text-ink-muted'
              }`}
            >
              {entry.name}
            </span>
            <span className="text-[0.62rem] text-ink-muted">
              {isFree(entry)
                ? 'free'
                : `${entry.voucherCost} ${entry.voucherCost === 1 ? 'buck' : 'bucks'}`}
            </span>
            {chosen === entry.id ? (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-accent px-1.5 text-[0.6rem] font-medium text-[oklch(0.16_0.04_300)]">
                worn
              </span>
            ) : (
              isOwned && (
                <span
                  aria-label="owned"
                  className="absolute right-1.5 top-1.5 text-[0.7rem] text-accent-2"
                >
                  ✓
                </span>
              )
            )}
          </button>
        )
      })}
    </section>
  )
}

/**
 * The argument for the one on the podium: what it is called, what it costs,
 * who it is, and the one thing to do about it.
 */
function Detail({
  skin,
  owned,
  worn,
  wallet,
  open,
  signedIn,
  busy,
  giftCode,
  gifting,
  onOpenGift,
  onGift,
  onSpend,
  onWear,
  onRemove,
}: {
  skin: SkinView
  owned: boolean
  worn: boolean
  wallet: number
  open: boolean
  signedIn: boolean
  busy: string | null
  giftCode: string | null
  gifting: boolean
  onOpenGift: () => void
  onGift: (message: string) => void
  onSpend: () => void
  onWear: () => void
  onRemove: () => void
}) {
  const wearing = busy === `wear:${skin.id}`
  const buying = busy === `spend:${skin.id}`
  const sending = busy === `gift:${skin.id}`
  const free = isFree(skin)
  const affordable = free || wallet >= skin.voucherCost
  const cost = free
    ? 'Free'
    : `${skin.voucherCost} ${skin.voucherCost === 1 ? 'buck' : 'bucks'}`

  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface-raised/60 p-5 lg:self-start">
      <div className="flex flex-wrap items-center gap-2">
        {skin.tier === 'super' && (
          <span className="rounded-full border border-accent-2/40 px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.14em] text-accent-2">
            super
          </span>
        )}
        {worn && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-[oklch(0.16_0.04_300)]">
            worn
          </span>
        )}
        {owned && !worn && (
          <span className="text-[0.62rem] uppercase tracking-[0.14em] text-accent-2">
            yours
          </span>
        )}
      </div>

      <h2 className="mt-2 font-pixel text-xl uppercase leading-tight text-ink">
        {skin.name}
      </h2>
      <p className={`mt-1 text-sm ${free ? 'text-accent-2' : 'text-ink-muted'}`}>
        {cost}
      </p>

      <p className="mt-4 text-sm leading-relaxed text-ink-muted">{skin.backstory}</p>

      <div className="mt-5 space-y-2">
        {owned ? (
          <button
            type="button"
            disabled={wearing}
            onClick={worn ? onRemove : onWear}
            className={
              worn
                ? 'w-full rounded-full border border-line px-4 py-2.5 text-sm text-ink-muted transition hover:border-accent hover:text-ink disabled:opacity-50'
                : 'w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-[oklch(0.16_0.04_300)] transition hover:opacity-90 disabled:opacity-60'
            }
          >
            {wearing ? 'Saving…' : worn ? 'Take it off' : 'Wear it'}
          </button>
        ) : !signedIn ? (
          <Link
            href="/signup"
            className="block w-full rounded-full border border-line px-4 py-2.5 text-center text-sm text-ink-muted transition hover:border-accent hover:text-ink"
          >
            Account needed
          </Link>
        ) : !open ? (
          <p className="text-xs text-ink-muted">Not for sale just now.</p>
        ) : (
          <button
            type="button"
            disabled={buying || !affordable}
            onClick={onSpend}
            /* Two whole classNames rather than a `disabled:` layered over the
               accent one: the dark-on-fuchsia label needs an arbitrary colour,
               and the variant left the price unreadable on its own button. */
            className={
              affordable
                ? 'w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-[oklch(0.16_0.04_300)] transition hover:opacity-90 disabled:opacity-60'
                : 'w-full cursor-not-allowed rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink-muted'
            }
          >
            {buying
              ? 'One moment…'
              : free
                ? 'Take it'
                : affordable
                  ? `Buy · ${cost}`
                  : `Needs ${cost}`}
          </button>
        )}

        {/* Not on a free skin: gifting spends the bucks the giver has, and
            there is nothing to spend - the present is the link to this page. */}
        {open && signedIn && !free && (
          <>
            {giftCode ? (
              <p className="rounded-lg border border-accent-2/40 bg-surface px-3 py-2 text-xs text-ink-muted">
                Send this on:{' '}
                <span className="select-all font-mono text-sm text-accent-2">{giftCode}</span>
              </p>
            ) : gifting ? (
              <form
                action={(formData) => onGift(String(formData.get('message') ?? ''))}
                className="space-y-2 rounded-lg border border-line p-3"
              >
                <label className="block text-xs text-ink-muted">
                  A line to go with it, if you like
                  <input
                    name="message"
                    maxLength={200}
                    placeholder="thought this was you"
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-base text-ink outline-none focus:border-accent sm:text-sm"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={sending || !affordable}
                    className="flex-1 rounded-full border border-accent px-3 py-1.5 text-xs text-accent transition hover:bg-accent/10 disabled:opacity-50"
                  >
                    {sending ? 'Wrapping…' : `Pay ${cost}`}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenGift}
                    className="rounded-full border border-line px-3 py-1.5 text-xs text-ink-muted transition hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={onOpenGift}
                disabled={!affordable}
                className="w-full rounded-full px-4 py-1.5 text-xs text-ink-muted transition hover:text-accent-2 disabled:opacity-40"
              >
                Buy it for someone
              </button>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/**
 * The wallet, as a bar rather than a panel.
 *
 * It was a tall box holding four unrelated jobs - a balance, a shop, a
 * giveaway and a code field - which gave a piece of supporting chrome the
 * same visual weight as the shelf it supports. One line now: what you have,
 * then what it costs to have more. The two things you do rarely (pass a buck
 * on, type a code somebody sent) fold into a quiet strip underneath, where
 * they are one click from reach and nowhere near the eye's first pass.
 */
function Wallet({
  count,
  vouchers,
  bundles,
  codes,
  busy,
  open,
  onBuy,
  onCode,
  onGiveBuck,
}: {
  count: number
  vouchers: ShopView['vouchers']
  bundles: BuckBundle[]
  codes: Record<string, string>
  busy: string | null
  open: boolean
  onBuy: (bundleId: string) => void
  onCode: (code: string) => void
  onGiveBuck: (id: string) => void
}) {
  const given = vouchers.filter((voucher) => codes[`buck:${voucher.id}`])

  return (
    <section className="rounded-2xl border border-line bg-surface-raised/60 px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* The balance leads, and it is the only pixel-face number on the
            page: one figure everything else is read against. */}
        <div className="flex items-baseline gap-2">
          <span className="font-pixel text-2xl leading-none text-ink">{count}</span>
          <span className="text-sm text-ink-muted">
            {count === 1 ? 'buck' : 'bucks'}
          </span>
        </div>

        {open && (
          <div className="flex flex-wrap items-center gap-2">
            {bundles.map((bundle) => (
              <button
                key={bundle.id}
                type="button"
                disabled={busy === `bucks:${bundle.id}`}
                onClick={() => onBuy(bundle.id)}
                className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs transition hover:border-accent disabled:opacity-50"
              >
                {busy === `bucks:${bundle.id}` ? (
                  'Off to Stripe…'
                ) : (
                  <>
                    <span className="font-medium text-ink">+{bundle.bucks}</span>
                    <span className="ml-1.5 text-ink-muted">
                      €{(bundle.cents / 100).toFixed(2)}
                    </span>
                    {bundle.note && (
                      <span className="ml-1.5 text-accent-2">{bundle.note}</span>
                    )}
                  </>
                )}
              </button>
            ))}
          </div>
        )}

        <p className="ml-auto hidden text-xs text-ink-muted lg:block">
          A plan posts you one a month.
        </p>
      </div>

      {/* The rare half. Same row, quieter, and one of them is folded. */}
      <div className="mt-3 flex flex-col gap-3 border-t border-line/50 pt-3 sm:flex-row sm:items-center sm:gap-x-4">
        <form
          action={(formData) => {
            const code = String(formData.get('code') ?? '')
            if (code.trim()) onCode(code)
          }}
          className="flex w-full min-w-0 items-center gap-2 sm:flex-1"
        >
          <label htmlFor="skin-code" className="sr-only">
            A code somebody sent you
          </label>
          <input
            id="skin-code"
            name="code"
            maxLength={64}
            placeholder="Got a code? SKIN-…"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-base uppercase text-ink outline-none placeholder:normal-case placeholder:text-ink-muted focus:border-accent sm:text-sm"
          />
          <button
            type="submit"
            disabled={busy === 'code'}
            className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted transition hover:border-accent hover:text-ink disabled:opacity-50"
          >
            {busy === 'code' ? 'Checking…' : 'Redeem'}
          </button>
        </form>

        {vouchers.length > 0 && (
          <details className="w-full min-w-0 sm:w-auto">
            <summary className="cursor-pointer list-none text-xs text-ink-muted transition hover:text-ink">
              Give a buck away
            </summary>
            <ul className="mt-2 space-y-1.5">
              {vouchers.map((voucher) => (
                <li
                  key={voucher.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2"
                >
                  <span className="text-xs text-ink-muted">
                    {voucher.source === 'subscription'
                      ? 'from your plan'
                      : voucher.source === 'gift'
                        ? 'a gift'
                        : voucher.source === 'purchase'
                          ? 'bought'
                          : 'from us'}
                  </span>
                  {codes[`buck:${voucher.id}`] ? (
                    <span className="ml-auto select-all font-mono text-sm text-accent-2">
                      {codes[`buck:${voucher.id}`]}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === `buck:${voucher.id}`}
                      onClick={() => onGiveBuck(voucher.id)}
                      className="ml-auto rounded-full border border-line px-3 py-1 text-xs text-ink-muted transition hover:border-accent hover:text-ink disabled:opacity-50"
                    >
                      {busy === `buck:${voucher.id}` ? 'Releasing…' : 'Release as code'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {given.length > 0 && (
              <p className="mt-2 text-xs text-ink-muted">
                Send that code on — whoever types it first keeps it, and it has
                left your wallet already.
              </p>
            )}
          </details>
        )}
      </div>
    </section>
  )
}

/**
 * Free means free in both currencies.
 *
 * A skin at zero money that still costs a buck is free only where you happen
 * to be standing, so both have to be zero before the card says the word - and
 * `tier` is in the test because a super is bought with bucks by definition and
 * a zero-priced one is a row with a typo, not a giveaway.
 */
function isFree(skin: SkinView): boolean {
  return skin.tier === 'skin' && skin.priceCents === 0 && skin.voucherCost === 0
}

