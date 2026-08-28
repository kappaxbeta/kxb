'use client'

import type { CameraMode } from '@/lib/controls/camera-mode'
import { useCameraMode } from '@/lib/controls/use-camera-mode'
import { xpDict } from '@/app/i18n/xp'
import { useLocale } from '@/app/i18n/locale-context'

/**
 * Whether moving also turns the camera, as two pictures.
 *
 * Provenance: copied in shape from `@/app/components/controls/camera-mode-choice`
 * per the copy rule in docs/xp-creator.md §1.3 - `src/app/xp/**` may not import
 * `@/app/components/*`. The preference itself is *not* copied: both hosts read
 * `@/lib/controls/camera-mode`, so choosing in the lounge chooses here too. One
 * pair of hands, one answer, wherever they are standing.
 *
 * Drawn beside the hand picker in the controls panel, but *not* gated on touch
 * the way that one is: a mouse has no handedness, but it very much has this
 * question - steering with WASD while the camera follows is the whole desktop
 * half of the feature.
 */

/**
 * What the stick does to the camera, as two pictures.
 *
 * Drawn on the same 48x32 phone frame as `./hand-choice`, because the two sit
 * one above the other in the same panel and a different canvas between them
 * reads as a different kind of question. Inside the frame they answer this
 * one, and the contrast is deliberately structural rather than decorative:
 *
 * - **Steer is one control.** A single stick, centred, inside a ring arrow -
 *   the ring *is* the answer: this stick turns you. One thumb, nothing else on
 *   the glass.
 * - **Free is two.** A stick in its corner and a separate look pad in the
 *   other, with a drag across it. The picture costs what the mode costs, which
 *   is the whole reason somebody is looking at this panel.
 *
 * Stroked in `currentColor` at 1.5 with round caps, the weight `.hud-key` and
 * the mouse glyph use, so these belong to the HUD's set rather than to
 * whatever icon library was nearest.
 */
function Sketch({ mode }: { mode: CameraMode }) {
  return (
    <svg
      viewBox="0 0 48 32"
      aria-hidden
      className="h-8 w-12 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="1" width="46" height="30" rx="4" opacity={0.35} />
      {mode === 'steer' ? (
        <>
          {/*
            The ring: 300 degrees clockwise from upper-right, round the bottom,
            with the gap at the top where the head goes. A full circle would
            read as a circle, and a half one as a smile.

            The head is a filled triangle rather than two strokes, and its
            points are computed off the arc's own tangent at the end angle
            rather than nudged by eye - the first pass was eyeballed and drew a
            tick hanging off the rim instead of an arrow. Solid because at
            32px a stroked head closes up into a blob anyway, and the knob
            below is already filled, so it matches.

            The gap is a full 100 degrees and the stick inside is deliberately
            small: at 48x32 an even ring around an even circle reads as a
            bullseye, and what it has to read as is one thing orbiting
            another.
          */}
          <path d="M30.59 11.97A8.6 8.6 0 1 1 17.41 11.97" opacity={0.8} />
          <path
            d="M17.41 11.97L16.45 17.17L12.46 13.82Z"
            fill="currentColor"
            stroke="none"
            opacity={0.8}
          />
          {/* And the one stick it is about, at the centre of its own turn. */}
          <circle cx="24" cy="17.5" r="4.3" />
          <circle cx="24" cy="17.5" r="1.7" fill="currentColor" stroke="none" />
        </>
      ) : (
        <>
          {/* The stick, in the corner it actually lives in. */}
          <circle cx="12.5" cy="19" r="5.4" />
          <circle cx="12.5" cy="19" r="1.9" fill="currentColor" stroke="none" />
          {/* The look pad: a second place for a second thumb... */}
          <rect x="27" y="11" width="15" height="14" rx="3" opacity={0.45} />
          {/* ...and the drag across it that turns the camera. */}
          <path d="M30.5 18h8" opacity={0.85} />
          <path d="M32.6 15.9L30.5 18l2.1 2.1M36.4 15.9L38.5 18l-2.1 2.1" opacity={0.85} />
        </>
      )}
    </svg>
  )
}

export function CameraChoice({
  isTouch = false,
  className,
}: {
  /**
   * Which default to show as chosen when nobody has chosen anything.
   *
   * The same answer the player drives with (`touch ? 'steer' : 'free'`), passed
   * down rather than re-derived, or the panel would highlight `Free` on a phone
   * that is steering. A picker that disagrees with the thing it picks is worse
   * than no picker: it is where somebody goes to find out what the controls are
   * doing.
   */
  isTouch?: boolean
  className?: string
}) {
  const t = xpDict(useLocale()).camera
  const { mode, choose } = useCameraMode(isTouch ? 'steer' : 'free')
  const labels: Record<CameraMode, { title: string; hint: string }> = {
    steer: { title: t.steerTitle, hint: t.steerHint },
    free: { title: t.freeTitle, hint: t.freeHint },
  }

  return (
    <div className={`pointer-events-auto ${className ?? ''}`}>
      <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
        {t.heading}
      </p>

      <div role="radiogroup" aria-label={t.groupLabel} className="flex justify-center gap-3">
        {(['steer', 'free'] as const).map((option) => {
          const on = mode === option
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(option)}
              className={`flex min-w-[7.5rem] flex-col items-center gap-1.5 rounded-xl border px-3 py-2.5 transition ${
                on
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-ink)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink-muted)] hover:bg-white/10 hover:text-[var(--color-ink)]'
              }`}
            >
              <Sketch mode={option} />
              <span className="text-xs font-semibold">{labels[option].title}</span>
              <span className="text-[10px] leading-tight opacity-70">
                {labels[option].hint}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
