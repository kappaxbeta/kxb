'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'

/**
 * The "looks like you are in ..." card - the one client component in the
 * handbook, because the browser is the only party that knows.
 *
 * The signal is `navigator.languages`: a locale like `de-AT` carries a region
 * subtag, and if that region's guide is written we offer it. Deliberately not
 * an IP lookup - no request leaves the page, nothing is stored, and a reader
 * whose browser says nothing regional simply sees no card.
 *
 * The language subtag alone ("de" with no region) is not used: it names a
 * language, not a country, and guessing Germany at a Swiss reader is worse
 * than staying quiet.
 *
 * Read through `useSyncExternalStore` rather than an effect: the region is an
 * external, never-changing fact of the browser, and the server snapshot of
 * `null` keeps the SSR HTML honest - the card appears on hydration, without a
 * setState-in-effect flash.
 */

const subscribeNever = () => () => {}

/** Cached so the snapshot is referentially stable across renders. */
let cachedRegion: string | null | undefined

function regionSnapshot(): string | null {
  if (cachedRegion === undefined) {
    cachedRegion =
      (navigator.languages ?? [navigator.language])
        .map((tag) => {
          try {
            return new Intl.Locale(tag).region?.toLowerCase()
          } catch {
            return undefined
          }
        })
        .find((region): region is string => !!region) ?? null
  }
  return cachedRegion
}

export function GeoCountry({
  countries,
  labels,
}: {
  /** The written countries only - slug, display name, flag, one-liner. */
  countries: { slug: string; href: string; name: string; flag: string; standfirst: string }[]
  labels: { lead: string; open: string }
}) {
  const region = useSyncExternalStore(subscribeNever, regionSnapshot, () => null)
  const match = region ? countries.find((country) => country.slug === region) : undefined

  if (!match) return null
  return (
    <Link
      href={match.href}
      className="group flex items-center gap-4 transition hover:translate-x-1"
    >
      <span aria-hidden className="text-4xl leading-none">
        {match.flag}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-ink-muted">
          {labels.lead} {match.name}
        </span>
        <span className="line-clamp-2 block text-lg font-semibold text-ink transition group-hover:text-accent">
          {match.standfirst}
        </span>
      </span>
      <span className="shrink-0 rounded-full border border-accent px-4 py-1.5 text-sm text-accent transition group-hover:bg-accent/10">
        {labels.open} →
      </span>
    </Link>
  )
}
