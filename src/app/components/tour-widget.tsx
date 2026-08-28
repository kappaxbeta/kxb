'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { OnboardingTour } from '@/app/components/onboarding-tour'
import { visibleTourSteps } from '@/app/components/tour-steps'
import { tourDict } from '@/app/i18n/tour'
import { usePageLocale } from '@/app/i18n/locale-context'
import type { FeatureKey } from '@/domain/flags/keys'

/**
 * The tour, reopenable, from inside a space.
 *
 * The first-run tour is a page somebody sees once and then never again, and
 * "once" is the wrong number for an explanation of six surfaces - nobody
 * remembers on Tuesday that the café has a barista in it. This is the same six
 * panels behind a row in the account menu, where the rest of the things about
 * *you* already live.
 *
 * Built on the native `<dialog>`, and copied deliberately closely from
 * <ContactWidget>, which is the other dialog-opening row in that same menu: it
 * brings the focus trap, the Escape key, the inert background and the top-layer
 * stacking, and every one of those is something a hand-rolled modal gets subtly
 * wrong. That matters more than usual here - the tour opens over the lounge,
 * which is full of key handlers that would otherwise still be listening to the
 * arrow keys the tour itself uses.
 */
export function TourWidget({
  variant = 'rail',
  features,
}: {
  /** A row in the rail, or a standalone pill for anywhere else. */
  variant?: 'rail' | 'pill'
  /**
   * The flags, so the tour does not describe surface this space has switched
   * off. Optional: omitted, every panel is shown, which is what a page with no
   * tenant behind it wants.
   */
  features?: Partial<Record<FeatureKey, boolean>>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  /** Same rule as the contact launcher's - see `usePageLocale`. */
  const dict = tourDict(usePageLocale(pathname))
  const steps = visibleTourSteps(features ?? null)

  // Both halves, every time - see the note in <ContactWidget>. `close()` shuts
  // the element; `setOpen(false)` unmounts the tour inside it, which is also
  // what makes the next visit start at panel one instead of wherever the last
  // one was abandoned.
  const close = useCallback(() => {
    dialog.current?.close()
    setOpen(false)
  }, [])

  function openDialog() {
    setOpen(true)
    dialog.current?.showModal()
  }

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
            <HelpIcon />
          </span>
          <span className="min-w-0 flex-1 truncate">{dict.launch}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={openDialog}
          aria-haspopup="dialog"
          className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm transition hover:bg-surface-raised"
        >
          <HelpIcon />
          {dict.launch}
        </button>
      )}

      <dialog
        ref={dialog}
        aria-labelledby="tour-dialog-title"
        className="tour-dialog"
        onClose={() => setOpen(false)}
        // A click that lands on the dialog element itself landed on the
        // backdrop - anything inside hits a child first.
        onClick={(event) => {
          if (event.target === dialog.current) close()
        }}
      >
        {open && (
          <div className="tour-dialog-panel">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id="tour-dialog-title" className="text-lg font-semibold">
                {dict.dialogTitle}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={dict.close}
                className="rounded-lg border border-line px-2.5 py-1 text-sm text-ink-muted transition hover:text-ink"
              >
                ✕
              </button>
            </div>

            {/*
              No `finish` and no `onSkip`: in here the tour is an explanation
              rather than a path to anything, so the last panel simply ends and
              "skip" would mean the same thing as the close button already
              beside it. `onDone` closes.
            */}
            <OnboardingTour steps={steps} dict={dict} onDone={close} />
          </div>
        )}
      </dialog>
    </>
  )
}

/** A question mark in a circle, at the rail's 16px and weight. */
function HelpIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.2" />
      <path d="M6.2 6.1a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4" />
      <path d="M8 11.9h.01" />
    </svg>
  )
}
