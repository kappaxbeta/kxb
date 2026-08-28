'use client'

import { useCallback, useState, useSyncExternalStore, useTransition } from 'react'
import { resendVerification } from '@/domain/profile/email-actions'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { useRefusal } from '@/app/i18n/use-refusal'
import { workspaceDict } from '@/app/i18n/workspace'

/**
 * "We have never checked that this address reaches you."
 *
 * Sign-up on this deployment does not wait for a confirmation - see
 * `email-verification.ts` for why, and why `email_confirmed_at` is not the fact
 * being read here. The cost of that choice is that an account can exist for
 * months behind an address with a typo in it, and its owner finds out on the day
 * they forget their password. This banner is how that cost gets paid down
 * without putting a wall back at the front door.
 *
 * It asks for one tap and explains the two things people actually get stuck on:
 * where the mail went (spam, on a first send from a new sender) and what
 * opening it is for.
 *
 * ---------------------------------------------------------------------------
 * Who never sees it
 * ---------------------------------------------------------------------------
 * Guests. The layout decides that - `emailVerified` answers `true` for an
 * anonymous account - and it is worth being explicit about why: somebody let in
 * through a guest link never gave an address, is here for one room for one
 * afternoon, and would be looking at a request they cannot satisfy.
 */
export function VerifyEmailBanner({
  email,
  pending,
}: {
  email: string
  /** An address change already in flight, if there is one. */
  pending: string | null
}) {
  const locale = useLocale()
  const t = workspaceDict(locale).verifyEmail
  const refusal = useRefusal()

  const [sending, startSending] = useTransition()
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  /**
   * Closed for this sitting only, and per address.
   *
   * Session storage rather than local, and the same reasoning as the event
   * banner beside it: "not now" should mean the rest of this visit, not
   * forever. Somebody who comes back tomorrow with an unconfirmed address still
   * needs telling - this is the only place the app ever asks.
   *
   * The address is in the key so that changing it re-opens the banner. The new
   * one has its own confirmation to do, and inheriting the old one's dismissal
   * would hide the request at exactly the moment it started mattering.
   */
  const key = `verify-email:${email}`

  /**
   * Read through `useSyncExternalStore` so the server's answer (never closed)
   * renders first and the browser's swaps in on hydration, with no flash of a
   * banner somebody already closed.
   *
   * Inside a try, because in a browser with site data blocked - and in a
   * sandboxed iframe - reading the property itself throws rather than returning
   * null. This runs as a `getSnapshot`, so a throw would take down the render
   * of every page in the space. Refused storage reads as "never closed", which
   * shows the banner once too often rather than showing nothing at all.
   */
  const stored = useSyncExternalStore(
    () => () => {},
    useCallback(() => {
      try {
        return window.sessionStorage.getItem(key) === '1'
      } catch {
        return false
      }
    }, [key]),
    () => false,
  )

  if (stored || dismissed) return null

  const send = () => {
    setError(null)
    startSending(async () => {
      const result = await resendVerification()
      if (result.ok) setSent(email)
      else setError(result.error)
    })
  }

  return (
    <section
      className="mb-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 shadow-sm backdrop-blur-sm"
      aria-label={t.label}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] opacity-80">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />
            <span className="text-amber-100">{t.label}</span>
          </p>

          <p className="mt-1 text-sm leading-relaxed text-amber-50">
            {fill(t.body, { email })}
          </p>

          {/* The change already asked for, if there is one. It replaces the
              nudge to send another link, because the link that matters is
              already in an inbox and asking for a second one here would send
              it to the old address. */}
          {pending && (
            <p className="mt-1.5 text-xs leading-relaxed text-amber-100/70">
              {fill(t.pending, { email: pending })}
            </p>
          )}

          {sent ? (
            <p className="mt-2 text-xs font-medium leading-relaxed text-emerald-300">
              ✓ {fill(t.sent, { email: sent })}
            </p>
          ) : (
            <>
              {/* Under the button rather than over it: it is the answer to
                  "I pressed it and nothing came", which is a thing somebody
                  reads after pressing. */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={send}
                  disabled={sending}
                  className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3.5 py-1.5 text-xs font-medium text-amber-50 transition hover:border-amber-300/70 hover:bg-amber-400/20 disabled:opacity-50"
                >
                  {sending ? t.sending : t.send}
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-amber-100/60">{t.spam}</p>
            </>
          )}

          {error && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-300">
              ✕ {refusal(error)}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            // State first, storage second inside a try: "Not now" must close
            // the banner even in a browser that refuses to remember it.
            setDismissed(true)
            try {
              window.sessionStorage.setItem(key, '1')
            } catch {
              // Closed for this page, and back on the next. Better than a
              // button that does nothing.
            }
          }}
          aria-label={t.hide}
          className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-sm leading-none text-amber-100 opacity-50 transition hover:bg-white/10 hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </section>
  )
}
