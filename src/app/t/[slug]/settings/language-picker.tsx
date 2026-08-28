'use client'

import { useTransition } from 'react'
import { chooseLocale } from '@/app/i18n/actions'
import { useLocale } from '@/app/i18n/locale-context'
import { settingsDict } from '@/app/i18n/settings'
import { LOCALES } from '@/domain/i18n/locale'

/**
 * Which language the app is in.
 *
 * Sits with the avatar and the audio sliders rather than under the workspace
 * settings, because it is yours: switching here changes what *you* read, not
 * what the space is written in. Two people in the same lounge can be reading
 * two different rails.
 *
 * No optimistic state, unusually for this app. The change is not a value on
 * this page that could be drawn early and reconciled - it is the language every
 * string in the tree was chosen in, most of it rendered on the server, and only
 * the round trip can produce those words. Painting the new label first would
 * leave a German button sitting above an English page for the length of the
 * request, which reads as broken rather than as fast. So the buttons go quiet
 * and say so instead.
 */
export function LanguagePicker() {
  const locale = useLocale()
  const t = settingsDict(locale).language
  const [pending, startTransition] = useTransition()

  return (
    <div className="max-w-2xl space-y-5 rounded-xl border border-line bg-surface-raised/40 p-6">
      <div>
        <h2 className="text-base font-semibold text-ink">{t.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t.body}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {LOCALES.map((option) => {
          const active = option === locale
          return (
            <button
              key={option}
              type="button"
              // The active one is not disabled by `pending` - it is the way
              // back if somebody changes their mind mid-request, and a row of
              // dead buttons during a reload looks like a hung page.
              disabled={active || pending}
              // A locale is one of two known strings, so the switch is a pair
              // of buttons rather than a `<select>`: the choice is visible
              // without opening anything, and both are one tap on a phone.
              onClick={() => startTransition(() => chooseLocale(option))}
              className={
                active
                  ? 'rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)]/15 px-4 py-2 text-xs font-medium text-ink'
                  : 'rounded-full border border-line px-4 py-2 text-xs font-medium text-ink transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'
              }
            >
              {t.names[option]}
              {active && (
                <span className="ml-2 text-[10px] uppercase tracking-wide text-ink-muted">
                  {t.current}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-ink-muted" aria-live="polite">
        {pending ? t.switching : t.footnote}
      </p>
    </div>
  )
}
