'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePageLocale } from '@/app/i18n/locale-context'
import { type Locale, publicLocale } from '@/domain/i18n/locale'

/**
 * The notice, per language.
 *
 * It was German on every page in the app, in every locale, since it was
 * written - which meant an English reader on `/` and a Bulgarian one on `/bg`
 * both got a consent notice they may not read, about cookies they are being
 * asked to accept. That is the one kind of copy where being understood is the
 * entire point of showing it.
 *
 * The German is the original and is the wording that was actually reviewed; the
 * other two say the same thing and should be read by somebody who can sign off
 * on that before this is relied on. Nothing about *what* is claimed has
 * changed - it is the same statement about essential cookies, three times.
 *
 * `strong` is split from the rest because it is the bolded opening clause, and
 * in neither German nor Bulgarian does the bold end where it ends in English.
 */
const NOTICE: Record<Locale, { strong: string; body: string; more: string; and: string; accept: string; privacy: string; imprint: string }> = {
  en: {
    strong: 'We use cookies',
    body: ' to keep the basic functionality of the site working (essential cookies). By carrying on, you agree to them being used.',
    more: 'You can read more in our ',
    and: ' and in the ',
    accept: 'Got it',
    privacy: 'privacy policy',
    imprint: 'imprint',
  },
  de: {
    strong: 'Wir verwenden Cookies',
    body: ' um die grundlegende Funktionalität der Webseite sicherzustellen (essenzielle Cookies). Indem Sie fortfahren, stimmen Sie der Nutzung dieser Cookies zu.',
    more: 'Weitere Informationen finden Sie in unserer ',
    and: ' und im ',
    accept: 'Verstanden',
    privacy: 'Datenschutzerklärung',
    imprint: 'Impressum',
  },
  bg: {
    strong: 'Използваме бисквитки',
    body: ', за да работи основната функционалност на сайта (задължителни бисквитки). Като продължавате, се съгласявате с използването им.',
    more: 'Повече може да прочетете в нашата ',
    and: ' и в ',
    accept: 'Разбрах',
    privacy: 'политика за поверителност',
    imprint: 'импресума',
  },
}

export function CookieBanner() {
  const pathname = usePathname()
  /**
   * Same rule as the contact launcher beside it: this is mounted by the root
   * layout, above every page translated or not, so the path decides where the
   * path says anything and the shell decides everywhere else.
   */
  const locale = usePageLocale(pathname)
  const t = NOTICE[locale]
  /**
   * The two legal pages exist in German and English only - they are documents
   * under German law rather than dictionary entries - so a Bulgarian reader is
   * sent to the English ones. Same fork the waitlist form makes.
   */
  const legal = publicLocale(locale) === 'de' ? '' : '/en'
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Check if the user has already acknowledged the banner
    let consent: string | null = null
    try {
      consent = window.localStorage.getItem('cookie-consent')
    } catch {}
    if (!consent) {
      const timer = setTimeout(() => setShow(true), 0)
      return () => clearTimeout(timer)
    }
  }, [])

  const accept = () => {
    try {
      window.localStorage.setItem('cookie-consent', 'true')
    } catch {}
    setShow(false)
  }

  if (!show) return null

  /*
    Compact on a phone, unchanged from `sm` up.

    Fixed to the bottom of the viewport, this card is the last thing between a
    first-time visitor and the crowd in the hero - and at `p-4` around `p-6`
    around two paragraphs of `text-sm` it stood 286px tall on a 375px screen,
    which is the entire lower third of the fold. Every person arriving from a
    post got the headline, the buttons, and a wall of consent copy where the
    room was supposed to be.

    Not a word of the notice has changed: what it says is a legal question, not
    a layout one. What changed is the space around it - the padding, the type
    size and where the button sits - which takes it to about 170px and leaves
    the crowd standing above it.
  */
  return (
    // The positioner spans the whole width and the card inside it does not, so
    // the padding either side is an invisible box lying across the bottom of
    // every page at z-50 - and on a wide screen that is exactly where the rail's
    // chat composer is. It swallowed clicks on Send until the notice was
    // dismissed. Same fix, and same reason, as `.corner-dock`: the wrapper hands
    // its pointer events back and the card takes its own.
    <div className="cookie-banner pointer-events-none fixed bottom-0 left-0 right-0 z-50 p-2 sm:p-4">
      <div className="pointer-events-auto max-w-4xl mx-auto bg-surface-raised border border-line rounded-lg shadow-xl p-3 sm:p-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <div className="text-xs leading-snug sm:text-sm sm:leading-normal">
          <p className="mb-1 sm:mb-2">
            <strong>{t.strong}</strong>
            {t.body}
          </p>
          <p className="text-ink-muted">
            {t.more}
            {/*
              `prefetch={false}` on both, because this banner is on every page -
              including the lounge, where it lies across the bottom of the world.

              Next prefetches a `<Link>` once it enters the viewport, and these
              two are in the viewport from the moment the room starts loading. So
              every first-time visitor spends two full server renders on the
              legal pages while the blocks are still arriving, on the same
              connection. Worse, both pages are `force-dynamic` and answer
              `no-store`, so the router cache cannot keep the result and it is
              fetched *again* and again: standing still on /demo for thirty
              seconds asked for /impressum four times and /datenschutz three.

              Nobody needs an instant Impressum. Dropping the prefetch costs a
              reader one normal navigation and gives the room back its bandwidth.
            */}
            <Link href={`/datenschutz${legal}`} prefetch={false} className="text-accent hover:underline">
              {t.privacy}
            </Link>
            {t.and}
            <Link href={`/impressum${legal}`} prefetch={false} className="text-accent hover:underline">
              {t.imprint}
            </Link>
            .
          </p>
        </div>
        {/* Full width under the notice on a phone, where a right-aligned pill
            leaves a strip of dead card beside it and is further from the thumb
            than the edge of the screen. */}
        <button
          onClick={accept}
          className="w-full shrink-0 bg-accent text-white px-6 py-2 rounded text-sm font-medium transition-colors hover:brightness-110 cursor-pointer sm:w-auto sm:text-base"
        >
          {t.accept}
        </button>
      </div>
    </div>
  )
}
