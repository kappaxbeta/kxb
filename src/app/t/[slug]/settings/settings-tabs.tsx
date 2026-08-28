'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'

/**
 * The two halves of settings, side by side.
 *
 * They were one page, which meant your name, your avatar and your password sat
 * in the same column as the space's name and the event's banner - things with
 * different owners, different audiences and, for a member who is not an admin,
 * different answers to "may I change this". Splitting them is mostly about that
 * last one: half of what used to be here was disabled for most of the people
 * looking at it, and a page that is half greyed out reads as broken rather than
 * as somebody else's business.
 *
 * A client component only because the current tab is the pathname; everything
 * either side of it is server-rendered.
 */
export function SettingsTabs({ slug }: { slug: string }) {
  const t = settingsDict(useLocale())
  const pathname = usePathname()

  const tabs = [
    { href: `/t/${slug}/settings/profile`, label: t.tabs.profile },
    { href: `/t/${slug}/settings/space`, label: t.tabs.space },
  ]

  return (
    <nav
      aria-label={t.title}
      className="flex w-fit gap-1 rounded-lg border border-line bg-surface-raised/40 p-1 text-sm"
    >
      {tabs.map((tab) => {
        const on = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? 'page' : undefined}
            className={`rounded px-4 py-1.5 transition ${
              on
                ? 'bg-surface font-medium text-ink'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
