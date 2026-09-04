'use client'

import { useActionState, useState, useTransition } from 'react'
import {
  copyXp,
  priceXp,
  moveXp,
  removeXp,
  rollBackXp,
  setXpAccess,
  shareXp,
  submitXp,
  transferXp,
  unshareXp,
  withdrawXp,
  type XpActionResult,
} from '@/domain/xps/actions'
import type { XpRelease } from '@/domain/xps/queries'
import { CoinPrice } from '@/app/components/coin-price'
import { SUBMISSION_FEE } from '@/domain/bank/prices'
import { browseDict } from '@/app/i18n/browse'
import { useLocale } from '@/app/i18n/locale-context'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * The controls that change a project's standing.
 *
 * One client component rather than four, because every one of them is the same
 * shape — a form, a server action that returns a reason, and somewhere to put
 * the reason — and four copies of `useActionState` wired identically is four
 * places for the error handling to drift.
 */

type Result = XpActionResult | null

function useAction(run: (formData: FormData) => Promise<XpActionResult>) {
  return useActionState(async (_previous: Result, formData: FormData) => run(formData), null)
}

function Refusal({ state }: { state: Result }) {
  const refusal = useRefusal()
  if (!state || state.ok) return null
  return (
    <p
      role="alert"
      className="mt-3 rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-ink"
    >
      {refusal(state.error)}
    </p>
  )
}

/**
 * Ask for review, or take the ask back.
 *
 * The note is optional and the placeholder says what it is for. A reviewer
 * opening a level cold has to work out what changed since last time, and one
 * line from the author is worth more than any diff we could show them.
 */
export function SubmitPanel({
  slug,
  xpId,
  submitted,
  economy = false,
}: {
  slug: string
  xpId: string
  submitted: boolean
  /**
   * Whether this space is running the economy.
   *
   * The fee is only shown when it will actually be taken. A price on a button
   * in a space that charges nothing is a threat the product does not carry out.
   */
  economy?: boolean
}) {
  const t = browseDict(useLocale()).controls
  const [state, submit, submitting] = useAction((formData) => submitXp(slug, formData))
  const [withdrawState, withdraw, withdrawing] = useAction(() => withdrawXp(slug, xpId))

  if (submitted) {
    return (
      <form action={withdraw}>
        <p className="text-sm text-ink-muted">
          {t.waiting}
        </p>
        <button
          type="submit"
          disabled={withdrawing}
          className="mt-3 rounded-full border border-line px-4 py-2 text-sm text-ink-muted transition hover:text-ink disabled:opacity-60"
        >
          {withdrawing ? t.withdrawing : t.withdraw}
        </button>
        <Refusal state={withdrawState} />
      </form>
    )
  }

  return (
    <form action={submit}>
      <input type="hidden" name="xpId" value={xpId} />
      <label htmlFor="note" className="block text-sm font-medium">
        {t.anythingToKnow}
      </label>
      <textarea
        id="note"
        name="note"
        rows={2}
        maxLength={500}
        placeholder={t.whatChanged}
        className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition placeholder:text-ink-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      <button
        type="submit"
        disabled={submitting}
        className="mt-3 rounded-full bg-accent px-5 py-2 text-sm font-medium text-[oklch(0.16_0.04_300)] transition hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? t.sending : t.submit}
        {/*
          What it costs, on the button that spends it.

          The fee is the one thing about submitting somebody could reasonably
          not expect, and a rejection does not refund it - so the number belongs
          where the decision is made, not in a paragraph above it that a
          returning author has stopped reading.

          Draws nothing when the economy is off for this space, because the
          charge does not happen then either. See `CoinPrice`.
        */}
        <CoinPrice coins={economy ? SUBMISSION_FEE : 0} />
      </button>
      <Refusal state={state} />
    </form>
  )
}

/**
 * What has shipped, and going back to one of them.
 *
 * Every row here has been through review, which is why this is the owner's
 * control rather than a request to us: moving between approved releases is
 * movement inside what review already permitted. A version that was never
 * released is not in this list and the decider refuses it anyway.
 */
export function ReleasePanel({
  slug,
  xpId,
  releases,
  live,
}: {
  slug: string
  xpId: string
  releases: XpRelease[]
  live: number | null
}) {
  const t = browseDict(useLocale()).controls
  const [state, roll, rolling] = useAction((formData) => rollBackXp(slug, formData))

  return (
    <div>
      <ul className="space-y-2">
        {releases.map((release) => {
          const isLive = release.version === live
          return (
            <li
              key={release.version}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface/40 px-3 py-2"
            >
              <span className="text-sm font-medium tabular-nums">v{release.version}</span>

              {isLive && (
                // Cyan: finished, structural, ours. The live release is the
                // settled one, not the one you act on.
                <span className="rounded-full border border-accent-2/50 bg-accent-2/10 px-2 py-0.5 text-xs text-accent-2">
                  live
                </span>
              )}
              {release.withdrawnAt && (
                <span
                  title={release.withdrawnReason ?? undefined}
                  className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200"
                >
                  was taken down
                </span>
              )}

              <span className="text-xs text-ink-muted">
                {new Date(release.releasedAt).toLocaleDateString()}
              </span>

              {!isLive && (
                <form action={roll} className="ml-auto">
                  <input type="hidden" name="xpId" value={xpId} />
                  <input type="hidden" name="to" value={release.version} />
                  <button
                    type="submit"
                    disabled={rolling}
                    className="rounded-full border border-line px-3 py-1 text-xs transition hover:border-accent hover:text-ink disabled:opacity-60"
                  >
                    {t.makeLive}
                  </button>
                </form>
              )}
            </li>
          )
        })}
      </ul>
      <Refusal state={state} />
    </div>
  )
}

/**
 * The space's owner, taking a project out of their space.
 *
 * A reason is required rather than optional, because this is one of the two
 * moments the system does something to somebody's work that they did not ask
 * for, and "removed" with nothing after it produces a support email rather than
 * an understanding. The copy is explicit that this is not a delete — the
 * distinction is the whole ownership bargain and it is not obvious from a
 * button called Remove.
 */
export function RemovePanel({ slug, xpId, owned }: { slug: string; xpId: string; owned: boolean }) {
  const t = browseDict(useLocale()).controls
  const [state, remove, removing] = useAction((formData) => removeXp(slug, formData))

  return (
    <form action={remove}>
      <p className="max-w-[62ch] text-sm leading-relaxed text-ink-muted">
        {t.removeBody} {owned ? t.staysYours : t.staysTheirs}
      </p>

      <input type="hidden" name="xpId" value={xpId} />
      <label htmlFor="reason" className="mt-4 block text-sm font-medium">
        {t.why}
      </label>
      <input
        id="reason"
        name="reason"
        required
        maxLength={500}
        placeholder={t.theyWillRead}
        className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition placeholder:text-ink-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
      />

      <button
        type="submit"
        disabled={removing}
        className="mt-3 rounded-full border border-danger/60 px-4 py-2 text-sm text-ink transition hover:bg-danger/10 disabled:opacity-60"
      >
        {removing ? t.removing : t.remove}
      </button>
      <Refusal state={state} />
    </form>
  )
}

/**
 * Take a copy.
 *
 * The copy costs no storage — every asset it refers to is already held by this
 * space under the same content hash — so the copy says so. "Duplicate" on its
 * own invites the question of whether it doubles the bill, and answering it in
 * six words is cheaper than a support email.
 */
export function CopyPanel({ slug, xpId }: { slug: string; xpId: string }) {
  const t = browseDict(useLocale()).controls
  const [state, copy, copying] = useAction((formData) => copyXp(slug, formData))

  return (
    <form action={copy}>
      <p className="max-w-[62ch] text-sm leading-relaxed text-ink-muted">
        {t.copyNote}
      </p>
      <input type="hidden" name="xpId" value={xpId} />
      <button
        type="submit"
        disabled={copying}
        className="mt-3 rounded-full border border-line px-4 py-2 text-sm transition hover:border-accent hover:text-ink disabled:opacity-60"
      >
        {copying ? t.copying : t.copy}
      </button>
      <Refusal state={state} />
    </form>
  )
}

/**
 * What it costs somebody else.
 *
 * `docs/product/economy.md` §9. Two prices, in one panel, because they are one
 * decision - "what is this worth to somebody else" - and splitting them across
 * two controls would make it look like two.
 *
 * ---------------------------------------------------------------------------
 * They are not alternatives
 * ---------------------------------------------------------------------------
 * `once` is what it costs to **play**, paid a single time and then never again
 * - including instead of the per-play stake every other level takes. `remix` is
 * what it costs to **take a copy and change it**. An owner can charge for one
 * and not the other in either direction, which is why they are two fields and
 * not a mode.
 *
 * Both blank or zero is free, and that is what every level is until somebody
 * says otherwise. Zero has to stay expressible or a price could be set and
 * never taken off.
 */
export function PricePanel({
  slug,
  xpId,
  once,
  remix,
}: {
  slug: string
  xpId: string
  once: number
  remix: number
}) {
  const [nextOnce, setOnce] = useState(String(once || ''))
  const [nextRemix, setRemix] = useState(String(remix || ''))
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const changed =
    (Number(nextOnce) || 0) !== once || (Number(nextRemix) || 0) !== remix

  return (
    <div className="space-y-3">
      <p className="max-w-[62ch] text-sm leading-relaxed text-ink-muted">
        Coins somebody else pays. Playing is charged once and then never again;
        remixing is charged each time a copy is taken. Both go to you. Leave
        them empty for free.
      </p>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          To play, once
          <input
            type="number"
            min={0}
            value={nextOnce}
            placeholder="0"
            onChange={(event) => setOnce(event.target.value)}
            className="w-24 rounded border border-line bg-surface px-2 py-1 text-sm tabular-nums text-ink"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          To remix
          <input
            type="number"
            min={0}
            value={nextRemix}
            placeholder="0"
            onChange={(event) => setRemix(event.target.value)}
            className="w-24 rounded border border-line bg-surface px-2 py-1 text-sm tabular-nums text-ink"
          />
        </label>

        <button
          type="button"
          disabled={pending || !changed}
          onClick={() =>
            start(async () => {
              setNote(null)
              const result = await priceXp(slug, {
                xpId,
                // Empty is free, not a refusal. See the panel's note.
                once: Number(nextOnce) || 0,
                remix: Number(nextRemix) || 0,
              })
              setNote(result.ok ? 'Saved' : result.error)
            })
          }
          className="rounded-full border border-line px-4 py-2 text-sm transition hover:border-accent hover:text-ink disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save prices'}
        </button>
      </div>

      {note && <p className="text-xs text-ink-muted">{note}</p>}
    </div>
  )
}

/**
 * Who else can get at it.
 *
 * Two mechanisms in one panel, because they answer one question and keeping
 * them apart made people set the wrong one: the **policy** is a blanket rule
 * for everybody in the space, and a **grant** names one person. Somebody who
 * wants "Ana can edit this" should not have to work out that the space-wide
 * dropdown is the wrong control.
 *
 * The policy is listed first and the grants under it, in the order they take
 * effect, so the panel reads as "everybody gets this, and then these people".
 */
export function SharePanel({
  slug,
  xpId,
  policy,
  grants,
  members,
}: {
  slug: string
  xpId: string
  policy: 'none' | 'view' | 'edit'
  grants: { accountId: string; right: 'view' | 'edit'; name: string }[]
  members: { userId: string; username: string }[]
}) {
  const t = browseDict(useLocale()).controls
  const [policyState, setPolicy, settingPolicy] = useAction((formData) =>
    setXpAccess(slug, formData),
  )
  const [shareState, share, sharing] = useAction((formData) => shareXp(slug, formData))
  const [revokeState, revoke, revoking] = useAction((formData) => unshareXp(slug, formData))

  const granted = new Set(grants.map((grant) => grant.accountId))
  const ungranted = members.filter((member) => !granted.has(member.userId))

  return (
    <div className="space-y-6">
      <form action={setPolicy}>
        <input type="hidden" name="xpId" value={xpId} />
        <label htmlFor="spacePolicy" className="block text-sm font-medium">
          {t.everybody}
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            id="spacePolicy"
            name="spacePolicy"
            defaultValue={policy}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {/* `none` first and default, because a project made in a shared
                space should be private until somebody says otherwise rather
                than visible to eleven colleagues the moment it exists. */}
            <option value="none">{t.policies.none}</option>
            <option value="view">{t.policies.view}</option>
            <option value="edit">{t.policies.edit}</option>
          </select>
          <button
            type="submit"
            disabled={settingPolicy}
            className="rounded-full border border-line px-4 py-2 text-sm transition hover:border-accent hover:text-ink disabled:opacity-60"
          >
            {settingPolicy ? t.saving : t.apply}
          </button>
        </div>
        <Refusal state={policyState} />
      </form>

      <div>
        <p className="text-sm font-medium">{t.andThese}</p>

        {grants.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {grants.map((grant) => (
              <li
                key={grant.accountId}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface/40 px-3 py-2"
              >
                <span className="text-sm">{grant.name}</span>
                <span className="text-xs text-ink-muted">
                  {grant.right === 'edit' ? t.canEdit : t.canLook}
                </span>
                <form action={revoke} className="ml-auto">
                  <input type="hidden" name="xpId" value={xpId} />
                  <input type="hidden" name="account" value={grant.accountId} />
                  <button
                    type="submit"
                    disabled={revoking}
                    className="text-xs text-ink-muted underline-offset-4 transition hover:text-ink hover:underline disabled:opacity-60"
                  >
                    {t.revoke}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">{t.nobodyYet}</p>
        )}
        <Refusal state={revokeState} />

        {ungranted.length > 0 ? (
          <form action={share} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="xpId" value={xpId} />
            <select
              name="account"
              aria-label={t.somebody}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {ungranted.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.username}
                </option>
              ))}
            </select>
            <select
              name="right"
              aria-label={t.whatTheyCanDo}
              defaultValue="edit"
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="edit">{t.canEdit}</option>
              <option value="view">{t.canLook}</option>
            </select>
            <button
              type="submit"
              disabled={sharing}
              className="rounded-full border border-line px-4 py-2 text-sm transition hover:border-accent hover:text-ink disabled:opacity-60"
            >
              {sharing ? t.adding : t.add}
            </button>
            <Refusal state={shareState} />
          </form>
        ) : (
          /*
            §7.5: an invitation to a project is an invitation to the space. A
            non-member cannot read the stream, so a separate invite path would
            be a half-built copy of the tenant one that still had to end by
            making them a member — and the copy says that in those words rather
            than implying they get access to only this.
          */
          <p className="mt-3 text-sm text-ink-muted">
            {t.everybodyHas}
            <a
              href={`/t/${slug}/members`}
              className="text-accent transition hover:opacity-80"
            >
              {t.inviteToSpace}
            </a>
            {t.toShare}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Hand it over, or move it somewhere else.
 *
 * Both live under one heading because both are "this stops being mine, here",
 * and both are one-way in the way that matters: after a transfer only the new
 * owner can transfer it back, and a move leaves this space's copy closed.
 *
 * Neither applies on change. A dropdown that gives your project away the moment
 * it loses focus is the wrong shape for an irreversible act.
 */
export function HandOverPanel({
  slug,
  xpId,
  members,
  spaces,
}: {
  slug: string
  xpId: string
  members: { userId: string; username: string }[]
  spaces: { slug: string; name: string }[]
}) {
  const t = browseDict(useLocale()).controls
  const [transferState, transfer, transferring] = useAction((formData) =>
    transferXp(slug, formData),
  )
  const [moveState, move, moving] = useAction((formData) => moveXp(slug, formData))

  return (
    <div className="space-y-6">
      {members.length > 0 && (
        <form action={transfer}>
          <input type="hidden" name="xpId" value={xpId} />
          <p className="max-w-[62ch] text-sm leading-relaxed text-ink-muted">
            {t.handOverNote}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              name="to"
              aria-label={t.whoBecomesOwner}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.username}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={transferring}
              className="rounded-full border border-line px-4 py-2 text-sm transition hover:border-accent hover:text-ink disabled:opacity-60"
            >
              {transferring ? t.handingOver : t.handOver}
            </button>
          </div>
          <Refusal state={transferState} />
        </form>
      )}

      {spaces.length > 0 && (
        <form action={move}>
          <input type="hidden" name="xpId" value={xpId} />
          <p className="max-w-[62ch] text-sm leading-relaxed text-ink-muted">
            {t.moveNote}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              name="toSlug"
              aria-label={t.whichSpace}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {spaces.map((space) => (
                <option key={space.slug} value={space.slug}>
                  {space.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={moving}
              className="rounded-full border border-line px-4 py-2 text-sm transition hover:border-accent hover:text-ink disabled:opacity-60"
            >
              {moving ? t.moving : t.move}
            </button>
          </div>
          <Refusal state={moveState} />
        </form>
      )}
    </div>
  )
}
