import { SettingsTabs } from '@/app/t/[slug]/settings/settings-tabs'
import { readLocale } from '@/app/i18n/preference'
import { settingsDict } from '@/app/i18n/settings'

/**
 * The frame both settings pages share: the heading, and the switch between
 * them.
 *
 * No `requireTenant` here - the pages under it each call it themselves, and a
 * layout is not a gate in the app router (it does not re-run on every
 * navigation between its children). The slug comes from the URL, which is all
 * the tab strip needs to build two links.
 */
export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const t = settingsDict(await readLocale())

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{t.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t.blurb}</p>
      </div>

      <SettingsTabs slug={slug} />

      {children}
    </main>
  )
}
