'use client'

import type { CameraMode } from '@/lib/controls/camera-mode'
import { useCameraMode } from '@/lib/controls/use-camera-mode'

/**
 * Whether moving also turns the camera, as two pictures.
 *
 * Drawn rather than written, for the same reason `./hand-choice` is: "the
 * stick steers the camera" is a sentence you have to think about, and a sketch
 * of a thumb doing it is not. The words underneath are confirmation, not the
 * question.
 *
 * Unlike the hand picker this is *not* a touch-only control. On a desktop the
 * steering mode means WASD swings the camera round - the one-handed way to
 * drive - so every surface that offers the hand picker behind an `isTouch`
 * check offers this one unconditionally.
 *
 * Also copied, in shape rather than in code, to
 * `@/app/xp/_runtime/hud/camera-choice`. `src/app/xp/**` may not import
 * `@/app/components/*` (eslint.config.mjs; docs/xp-creator.md §1.3), and the
 * two are allowed to look different - what they must share is the
 * *preference*, which they do, through `@/lib/controls/camera-mode`.
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

const LABELS: Record<CameraMode, { title: string; hint: string }> = {
  steer: { title: 'Turn and go', hint: 'Sideways turns you, forward walks' },
  free: { title: 'On its own', hint: 'Drag or use the mouse to look' },
}

export function CameraModeChoice({
  /**
   * `null` to drop the little heading, exactly as `HandChoice` allows - for
   * the settings card, where a proper `<h2>` has already said it.
   */
  heading = 'Camera',
  /** `start` for a settings card, where a centred row floats off its own text. */
  align = 'center',
  className,
}: {
  heading?: string | null
  align?: 'center' | 'start'
  className?: string
}) {
  const { mode, choose } = useCameraMode()

  return (
    <div className={`pointer-events-auto ${className ?? ''}`}>
      {heading !== null && (
        <p
          className={`mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)] ${
            align === 'center' ? 'text-center' : 'text-left'
          }`}
        >
          {heading}
        </p>
      )}

      <div
        role="radiogroup"
        aria-label="How the camera is driven"
        className={`flex gap-3 ${align === 'center' ? 'justify-center' : 'justify-start'}`}
      >
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
              <span className="text-xs font-semibold">{LABELS[option].title}</span>
              <span className="text-[10px] leading-tight opacity-70">
                {LABELS[option].hint}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
