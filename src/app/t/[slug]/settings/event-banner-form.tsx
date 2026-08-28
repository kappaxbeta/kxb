'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { attachEventBanner } from '@/domain/events/banner-actions'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'
import { useRefusal } from '@/app/i18n/use-refusal'
import { ErrorNote } from '@/app/components/error-note'

/**
 * What the event shows to people who have not walked in yet.
 *
 * The header form above this one is the banner *inside* the event, read by
 * everybody standing in the room. This is the outside: the picture on
 * `/e/<slug>`, and which guest link its button hands out. They are next to each
 * other because a host thinks of both as "the banner", and separate because
 * one is a sentence anybody running the event can retype in ten seconds and the
 * other publishes a live token to the internet.
 *
 * Both fields are one control each and both can be set to nothing, which is the
 * point: taking the door down has to be as easy as putting it up.
 */

export interface BannerOption {
  id: string
  name: string
  /** Whether there is a picture to show. A banner saved without one is listed and warned about. */
  hasPoster: boolean
}

export interface LinkOption {
  id: string
  label: string
  /** Why it cannot be used, or null. Shown so a host does not publish a dead door. */
  problem: string | null
}

export function EventBannerForm({
  slug,
  banners,
  links,
  initialBannerId,
  initialLinkId,
  featured,
  appUrl,
}: {
  slug: string
  banners: BannerOption[]
  links: LinkOption[]
  initialBannerId: string | null
  initialLinkId: string | null
  featured: boolean
  appUrl: string
}) {
  const refusal = useRefusal()
  const t = settingsDict(useLocale()).event
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [bannerId, setBannerId] = useState(initialBannerId ?? '')
  const [linkId, setLinkId] = useState(initialLinkId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const chosenLink = links.find((link) => link.id === linkId)
  const chosenBanner = banners.find((banner) => banner.id === bannerId)

  function save() {
    setError(null)
    setSaved(false)

    startTransition(async () => {
      const result = await attachEventBanner(slug, {
        // Empty string is the "None" option, and it has to become null rather
        // than travel as '' - the column is a uuid reference and the function
        // reads null as "take it down".
        bannerId: bannerId || null,
        linkId: linkId || null,
      })

      if (!result.ok) {
        setError(refusal(result.error))
        return
      }

      setSaved(true)
      router.refresh()
    })
  }

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface-raised/40 p-5">
      <div>
        <h2 className="font-semibold text-ink">{t.publicPage}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {t.publicLead}
          <Link
            href={`/e/${slug}`}
            className="text-ink underline underline-offset-2 hover:text-accent"
          >
            {appUrl}/e/{slug}
          </Link>
          {t.publicTail}
        </p>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <label className="block space-y-1">
        <span className="text-sm text-ink-muted">
          {t.banner}{' '}
          <span className="text-xs">
            {t.bannerHintLead}
            <Link
              href={`/t/${slug}/studio/hero`}
              className="underline underline-offset-2 hover:text-ink"
            >
              {t.bannerStudio}
            </Link>
          </span>
        </span>
        <select
          value={bannerId}
          onChange={(changed) => {
            setSaved(false)
            setBannerId(changed.target.value)
          }}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">{t.noBanner}</option>
          {banners.map((banner) => (
            <option key={banner.id} value={banner.id}>
              {banner.name}
              {banner.hasPoster ? '' : t.noPicture}
            </option>
          ))}
        </select>
      </label>

      {banners.length === 0 && (
        <p className="text-xs text-ink-muted">
          {t.noBanners}
        </p>
      )}

      {chosenBanner && !chosenBanner.hasPoster && (
        <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {t.bannerNoPicture}
        </p>
      )}

      <label className="block space-y-1">
        <span className="text-sm text-ink-muted">
          {t.theButton} <span className="text-xs">{t.theButtonHint}</span>
        </span>
        <select
          value={linkId}
          onChange={(changed) => {
            setSaved(false)
            setLinkId(changed.target.value)
          }}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">{t.noButton}</option>
          {links.map((link) => (
            <option key={link.id} value={link.id}>
              {link.label}
              {link.problem ? t.notUsable : ''}
            </option>
          ))}
        </select>
      </label>

      {/*
        Said out loud, because it is the one thing on this page with a
        consequence somebody might not expect. The token is what lets a stranger
        in without an account - that is the whole feature - and putting it on a
        page means anybody who has the address has the token. The controls that
        make that safe already exist on the link itself, so this points at them
        rather than inventing a second kind of limit.
      */}
      {linkId && (
        <p className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-muted">
          {t.linkWarning}
          {featured && t.alsoFeatured}
        </p>
      )}

      {chosenLink?.problem && (
        <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {chosenLink.problem}
          {t.pickAnother}
        </p>
      )}

      {links.length === 0 && (
        <p className="text-xs text-ink-muted">
          {t.noGuestLinks}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg border border-accent/60 bg-accent/15 px-4 py-2 text-sm text-ink transition hover:bg-accent/25 disabled:opacity-50"
        >
          {pending ? t.saving : t.savePublic}
        </button>
        {saved && !pending && (
          <Link
            href={`/e/${slug}`}
            className="text-xs text-emerald-300 underline underline-offset-2"
          >
            {t.publicSaved}
          </Link>
        )}
      </div>
    </section>
  )
}
