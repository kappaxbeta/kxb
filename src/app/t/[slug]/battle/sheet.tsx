'use client'

import { useEffect } from 'react'
import { battleDict } from '@/app/i18n/battle'
import { useLocale } from '@/app/i18n/locale-context'
import { ErrorNote } from '@/app/components/error-note'

/**
 * The sheet the hub's doors open onto.
 *
 * Pulled out of ./summon-wizard.tsx when tournaments and challenges got the
 * same treatment: all three pages ask a handful of questions that used to sit
 * unfolded above the thing you actually came to look at, and all three now put
 * them behind a door. The wizard keeps its own copy of this shell because it
 * has a step strip in the middle of it - what is shared is the frame: the
 * backdrop that only closes on itself, Escape, the neon rail, the mark in its
 * bobbing box, and a footer with one loud button on the right.
 *
 * One screen, not four. A tournament is three answers and a challenge is four,
 * which is a form; the wizard's steps exist because a match is eight.
 */
export function BattleSheet({
  title,
  subtitle,
  mark,
  cta,
  hint,
  error,
  disabled,
  pending,
  onSubmit,
  onClose,
  children,
}: {
  title: string
  subtitle: string
  mark: React.ReactNode
  /** The loud button, bottom right. */
  cta: string
  /** The line beside it, saying why it is off or what it will do. */
  hint: string
  error: string | null
  disabled: boolean
  pending: boolean
  onSubmit: () => void
  onClose: () => void
  children: React.ReactNode
}) {
  const t = battleDict(useLocale()).sheet
  // Escape closes from anywhere inside, including a text field - which is where
  // somebody is most likely to be when they change their mind.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      // Only the backdrop itself closes: a drag that starts on a control inside
      // and ends out here must not throw the answers away.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="summon-sheet relative my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-accent/40 bg-surface shadow-2xl"
      >
        <div className="summon-rail2" />

        <div className="flex items-start gap-3 p-5 sm:p-6">
          <span
            aria-hidden
            className="summon-bob grid size-11 shrink-0 place-items-center rounded-xl border border-accent/50 text-accent"
          >
            {mark}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="truncate font-mono text-xs text-ink-muted">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-ink-muted transition hover:bg-surface-raised hover:text-ink"
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-6 px-5 pb-6 sm:px-6">
          {error && <ErrorNote>{error}</ErrorNote>}
          {children}
        </div>

        <div className="flex items-center gap-3 border-t border-line/40 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-ink-muted transition hover:text-ink"
          >
            {t.cancel}
          </button>
          <span className="ml-auto truncate font-mono text-xs text-ink-muted">
            {hint}
          </span>
          <button
            type="submit"
            disabled={disabled || pending}
            className="summon-cta shrink-0 rounded-xl px-6 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed"
          >
            {cta}
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * A field, labelled the way the wizard labels its own.
 *
 * The old panels leaned on placeholders for this, which is a label that leaves
 * as soon as you answer - fine for one input, not for a row of three where the
 * answers stop saying what they are answers to.
 */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted"
      >
        {label}
      </label>
      {children}
    </div>
  )
}
