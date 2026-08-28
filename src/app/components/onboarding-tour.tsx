'use client'

import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { stepLabel, type TourDict } from '@/app/i18n/tour'
import { TOUR_ICONS, type TourStep } from '@/app/components/tour-steps'

/**
 * The tour: what this place is, one panel at a time.
 *
 * A component rather than a page, because it is asked for in three places and
 * only one of them is a route. It runs as the first screen of an account that
 * has no space yet (/onboarding), as a dialog from the account menu inside a
 * space that anyone can reopen whenever they like (see <TourWidget>), and it is
 * built to run on the landing page later - which is why it takes its steps, its
 * words and its closing panel as props and resolves none of them itself. It has
 * no idea whether there is a session.
 *
 * The last panel is the caller's, passed as `finish`. That is the whole reason
 * this is not simply a page: on first run it is a form that creates a space, or
 * a Stripe button when there is no seat to spend, and inside a space it is
 * nothing at all - the tour just ends. Building that fork in here would mean
 * this component knowing about billing.
 *
 * Skippable, always, and the skip is a real control rather than an X hidden in a
 * corner: somebody who already knows what a lounge is should not have to click
 * six times to prove it, and the alternative is that they click Next six times
 * without reading, which teaches them nothing and annoys them.
 */
export function OnboardingTour({
  steps,
  dict,
  finish,
  finishTitle,
  finishBody,
  onSkip,
  onDone,
  onReachEnd,
}: {
  /** Which panels to show. Already filtered against the flags by the caller. */
  steps: TourStep[]
  dict: TourDict
  /**
   * The panel after the last one. Omitted inside a space, where the tour is
   * only ever an explanation and there is nothing to do at the end of it.
   */
  finish?: React.ReactNode
  finishTitle?: string
  finishBody?: string
  /** Leave without finishing. Omitted where there is nothing to leave to. */
  onSkip?: () => void
  /** Leave from the last panel. Only rendered when there is no `finish`. */
  onDone?: () => void
  /**
   * Fired once, the first time the last panel is reached.
   *
   * This is how the first-run route remembers that the tour has been seen
   * without waiting for a space to be created: somebody who reads all six
   * panels and then closes the tab has seen it, and should not be marched
   * through it again on their next sign-in.
   */
  onReachEnd?: () => void
}) {
  const [index, setIndex] = useState(0)

  /** The closing panel is one past the last step, when there is one. */
  const total = steps.length + (finish ? 1 : 0)
  const onFinishPanel = Boolean(finish) && index === steps.length
  const step = steps[index]
  const last = index === total - 1

  useEffect(() => {
    if (last) onReachEnd?.()
    // Deliberately keyed on the flag rather than on the callback: a parent that
    // passes a fresh closure every render must not re-fire this.
  }, [last, onReachEnd])

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => Math.min(Math.max(current + delta, 0), total - 1))
    },
    [total],
  )

  /**
   * Left and right walk the tour.
   *
   * The arrows and nothing else. Escape is not handled here because the two
   * places this renders disagree about what it should do - the dialog closes
   * itself, natively, and on the first-run page there is nothing to close - and
   * a handler here would have to guess. Space and Enter are left to whatever
   * button has focus.
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') go(1)
      else if (event.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  const copy = step ? dict.steps[step.id] : null
  const hue = step?.hue ?? 285

  return (
    <div className="tour" style={{ '--tour-hue': hue } as React.CSSProperties}>
      <div className="tour-progress">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={stepLabel(dict, i + 1, total)}
            aria-current={i === index}
            className={`tour-pip ${i === index ? 'is-active' : i < index ? 'is-done' : ''}`}
          />
        ))}
        <span className="tour-step-count">{stepLabel(dict, index + 1, total)}</span>
      </div>

      {/*
        A live region around the panel and nothing else.

        The panel changes under a button that does not move, so without this
        somebody using a screen reader presses Next and hears nothing at all -
        focus is still on the same button and the heading that changed is above
        it. Wrapped here rather than around the whole tour on purpose: a live
        region containing the buttons would re-announce the controls every time,
        and this div is stable across steps, which is what makes the change
        inside it an announcement rather than a new region appearing.
      */}
      <div aria-live="polite">
        {onFinishPanel ? (
          <div className="tour-panel">
            <p className="tour-kicker">{dict.finish.kicker}</p>
            <h2 className="tour-title font-pixel">
              {finishTitle ?? dict.finish.createTitle}
            </h2>
            <p className="tour-body">{finishBody ?? dict.finish.createBody}</p>
            {/* The caller's form or button. Its own submit is the way out of the
                tour, so no Next button is rendered beside it. */}
            <div className="mt-5">{finish}</div>
          </div>
        ) : (
          copy &&
          step && (
            <div className="tour-panel">
              <div className="tour-art">
                <Image
                  src={`/xo/scenes/${step.scene}.webp`}
                  alt={copy.alt}
                  width={step.width}
                  height={step.height}
                  /**
                   * The first panel is above the fold on the first screen of an
                   * account, so it is worth pre-empting; the rest are behind a
                   * click each and are not.
                   */
                  priority={index === 0}
                  // Matches `.tour-shot`'s own cap, so a phone is not sent a
                  // 26rem render to draw at 20rem and a desktop is not sent one
                  // wider than the panel can ever be.
                  sizes="(max-width: 480px) 100vw, 26rem"
                  className="tour-shot"
                />
              </div>

              <p className="tour-kicker">
                <span aria-hidden className="tour-icon">
                  {TOUR_ICONS[step.id]}
                </span>
                {copy.kicker}
              </p>
              <h2 className="tour-title font-pixel">{copy.title}</h2>
              <p className="tour-body">{copy.body}</p>
            </div>
          )
        )}
      </div>

      {/*
        The utilities rather than classes of our own, deliberately: `bg-accent`
        and `border-line` are what the rules at the top of globals.css hang the
        app's lit edge, glow and press on. See the note there.
      */}
      <div className="tour-actions">
        {index > 0 && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="rounded-full border border-line px-5 py-3 text-sm transition hover:bg-surface"
          >
            {dict.back}
          </button>
        )}

        {!last ? (
          <button
            type="button"
            onClick={() => go(1)}
            className="tour-advance rounded-full bg-accent px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            {dict.next}
          </button>
        ) : (
          // Only when the caller gave us no closing panel: with one, that
          // panel's own control is the end of the tour and a second button
          // beside it would be two ways out with different consequences.
          !finish &&
          onDone && (
            <button
              type="button"
              onClick={onDone}
              className="tour-advance rounded-full bg-accent px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              {dict.done}
            </button>
          )
        )}

        {/*
          Last in the row and quiet, but present on every panel including the
          final one - somebody looking at a price they do not want to pay needs
          a way out that is not the back button.
        */}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="ml-auto px-2 py-3 text-sm text-ink-muted transition hover:text-ink max-[480px]:ml-0"
          >
            {dict.skip}
          </button>
        )}
      </div>
    </div>
  )
}
