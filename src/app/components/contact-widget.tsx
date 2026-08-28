'use client'

import { usePathname } from 'next/navigation'
import { contactDict } from '@/app/i18n/contact'
import { usePageLocale } from '@/app/i18n/locale-context'
import { useCallback, useRef, useState } from 'react'
import { ContactForm } from '@/app/components/contact-form'
import { contactIdentity } from '@/domain/contact/actions'

/**
 * The way to reach a human, from anywhere.
 *
 * Rendered by the root layout, which is what "from anywhere" means here - one
 * launcher on every page rather than a link each surface has to remember to
 * carry. /contact is the same form as a page, for the links that want a URL and
 * for anybody whose JavaScript never arrived.
 *
 * The launcher is no longer pinned itself - it is a pill inside `.corner-dock`,
 * which is what positions it and the music toggle beside it. See globals.css.
 *
 * Inside a workspace the pill steps aside: `/t/...` carries the same form as a
 * row in the account menu instead (`variant="rail"`, rendered by the sidebar),
 * because the corner there is already crowded by the rooms' own controls. The
 * dock keeps the music toggle, which has nowhere else to live.
 *
 * Built on the native `<dialog>` rather than a div with a high z-index: it
 * brings the focus trap, the Escape key, the inert background and the top-layer
 * stacking with it, and every one of those is something a hand-rolled modal
 * gets subtly wrong. It matters more than usual on a page like the lounge,
 * which is full of key handlers that would otherwise still be listening.
 */
export function ContactWidget({ variant = 'dock' }: { variant?: 'dock' | 'rail' }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const pathname = usePathname()
  /**
   * The launcher rides in the root layout, so nothing can hand it a locale as
   * a prop - it is mounted above every page, translated or not. `usePageLocale`
   * is the rule for exactly that position: `/de/...` is German because the URL
   * says so, and anywhere else it is whatever shell this is floating over -
   * which inside a space is the member's own choice.
   */
  const locale = usePageLocale(pathname)
  const dict = contactDict(locale)
  const [open, setOpen] = useState(false)
  const [defaults, setDefaults] = useState<{
    username: string | null
    email: string | null
  } | null>(null)

  // Both halves, every time. `close()` is what actually shuts the dialog;
  // `setOpen(false)` is what unmounts the form inside it, so the next visit
  // starts blank instead of showing the last message still sitting there.
  //
  // The state is set here rather than only in the element's `close` event
  // because that event is the one path we cannot count on - it is queued by the
  // browser, and there is at least one embedded environment where it never
  // arrives. `onClose` below still catches the closes we do not initiate
  // (Escape, mostly), and setting the same state twice costs nothing.
  const close = useCallback(() => {
    dialog.current?.close()
    setOpen(false)
  }, [])

  function openDialog() {
    setOpen(true)
    dialog.current?.showModal()

    // Prefill from the session, if there is one. Asked for on open rather than
    // rendered into the page so that a static page stays static; a failure here
    // is not worth surfacing, it only means typing your own name.
    if (!defaults) {
      contactIdentity()
        .then(setDefaults)
        .catch(() => setDefaults({ username: null, email: null }))
    }
  }

  // One launcher, not two: the dock copy stands down wherever the rail copy is
  // rendering. Decided from the path rather than by a prop threaded down from
  // the root layout, which is a server component and would have to become a
  // client one to know where it is.
  if (variant === 'dock' && pathname.startsWith('/t/')) return null

  return (
    <>
      {variant === 'rail' ? (
        <button
          type="button"
          onClick={openDialog}
          aria-haspopup="dialog"
          role="menuitem"
          className="rail-link w-full text-left"
        >
          <span aria-hidden className="rail-link-icon">
            <EnvelopeIcon />
          </span>
          <span className="min-w-0 flex-1 truncate">{dict.widget.open}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={openDialog}
          aria-haspopup="dialog"
          // Named here rather than left to the label, because the label is the
          // thing that goes away: below 480px the pill collapses to the envelope
          // alone (see `.corner-launcher-label`), and a button whose only content
          // is a decorative glyph has no accessible name at all.
          aria-label={dict.widget.open}
          className="corner-launcher"
        >
          <EnvelopeIcon />
          <span className="corner-launcher-label">{dict.widget.open}</span>
        </button>
      )}

      <dialog
        ref={dialog}
        aria-labelledby="contact-dialog-title"
        className="contact-dialog"
        // Closes we did not ask for - Escape, and the browser's own close
        // request. `close()` has already run by the time this fires.
        onClose={() => setOpen(false)}
        // A click that lands on the dialog element itself is a click on the
        // backdrop - anything inside hits a child first.
        onClick={(event) => {
          if (event.target === dialog.current) close()
        }}
      >
        {open && (
          <div className="contact-dialog-panel">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="contact-dialog-title" className="text-lg font-semibold">
                  {dict.widget.dialogTitle}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">{dict.widget.dialogIntro}</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={dict.widget.close}
                className="rounded-lg border border-line px-2.5 py-1 text-sm text-ink-muted transition hover:text-ink"
              >
                ✕
              </button>
            </div>

            <ContactForm
              autoFocus
              defaults={defaults ?? undefined}
              path={typeof window === 'undefined' ? undefined : window.location.pathname}
              locale={locale}
            />
          </div>
        )}
      </dialog>
    </>
  )
}

function EnvelopeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}
