'use client'

import { useEffect } from 'react'
import type { ControlRow, Glyph } from '@/app/xp/_runtime/input/controls'
import { CameraChoice } from '@/app/xp/_runtime/hud/camera-choice'
import { HandChoice } from '@/app/xp/_runtime/hud/hand-gate'
import { xpDict, type XpDict } from '@/app/i18n/xp'
import { useLocale } from '@/app/i18n/locale-context'

/**
 * The controls panel, drawn.
 *
 * Provenance: copied from `src/app/world/hud.tsx` (`GlyphView`, `GestureMark`,
 * `spoken`, `ControlsPanel`) per the copy rule in docs/xp/creator.md §1.3 and
 * the lint rule that enforces it. The CSS is *not* copied - `.hud-key`,
 * `.hud-panel` and friends live in globals.css under "The in-world HUD", and a
 * stylesheet is shared ground in a way a component is not.
 *
 * Three things were dropped on the way in, and each is a decision rather than
 * an omission:
 *
 * - **The entry gate.** The lounge's panel is also the door into the world: it
 *   takes the first click and that click is what grants pointer lock. An XP has
 *   its own way in already, so this is only ever the reopened modal - which
 *   removes `interactive`, `onEnter` and the click-through branch, three props
 *   whose whole job was telling those two cases apart.
 * - **`footer`.** It exists for the lounge's floor generator. Nothing in an XP
 *   has scene-specific chrome to hang here, and an unused escape hatch is an
 *   invitation to put game logic in a panel.
 * - **The unreachable rows are new**, and are the one thing this has that the
 *   original does not. See `ControlRow.unreachable` in ./controls.
 */

function GlyphView({ glyph }: { glyph: Glyph }) {
  if (glyph.kind === 'mouse') {
    return (
      <span
        aria-hidden
        className={`hud-mouse ${glyph.button === 'left' ? 'hud-mouse-left' : 'hud-mouse-right'}`}
      />
    )
  }

  if (glyph.kind === 'gesture') {
    return <GestureMark motion={glyph.motion} />
  }

  if (glyph.kind === 'wasd') {
    return (
      <span aria-hidden className="flex flex-col items-center gap-1">
        <span className="hud-key">W</span>
        <span className="flex gap-1">
          <span className="hud-key">A</span>
          <span className="hud-key">S</span>
          <span className="hud-key">D</span>
        </span>
      </span>
    )
  }

  return (
    <span
      className={`hud-key ${glyph.tone === 'pink' ? 'hud-key-pink' : ''} ${
        glyph.wide ? 'hud-key-wide' : ''
      }`}
    >
      {glyph.label}
    </span>
  )
}

/**
 * A hand doing the thing, on a keycap-sized tile.
 *
 * Sized and framed like `.hud-key` so a touch row lines up with a keyboard row
 * - the panel has both in it on a tablet with a keyboard attached.
 */
function GestureMark({ motion }: { motion: 'pan' | 'stick' }) {
  return (
    <span aria-hidden className="hud-key hud-key-wide grid place-items-center">
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* A pointing finger with the fist under it. The same shape for both
            gestures - what differs is what is drawn around it. */}
        <path d="M11 12V6.2a1.3 1.3 0 0 1 2.6 0V12" />
        <path d="M13.6 10.4a1.2 1.2 0 0 1 2.4 0v1.4M16 11a1.2 1.2 0 0 1 2.4 0v3.1a5 5 0 0 1-5 5h-1.2a4 4 0 0 1-3.1-1.5l-2.4-3a1.2 1.2 0 0 1 1.8-1.6L11 15" />
        {motion === 'pan' ? (
          <>
            <path d="M4.6 6.5h-2.2M2.4 6.5l1.4-1.3M2.4 6.5l1.4 1.3" opacity="0.85" />
            <path
              d="M19.4 6.5h2.2M21.6 6.5l-1.4-1.3M21.6 6.5l1.4 1.3"
              opacity="0.85"
              transform="translate(-1.4)"
            />
          </>
        ) : (
          <circle cx="12" cy="4.2" r="2.6" opacity="0.5" />
        )}
      </svg>
    </span>
  )
}

/**
 * The screen-reader text for a row.
 *
 * The glyphs are all `aria-hidden` or bare letters, so without this a mouse
 * button announces as nothing at all and the WASD cross announces as four
 * unrelated letters.
 */
function spoken(row: ControlRow, words: XpDict['controls']['spoken']): string {
  /**
   * An unreachable row announces its label alone.
   *
   * Its "keycap" is the action's own name - there is no key, which is the whole
   * point of the row - so the general form below reads it out twice: "grab:
   * grab — no button for this yet". Caught by driving the panel in the browser,
   * which is the one thing the unit tests could not see.
   */
  if (row.unreachable) return row.label

  const parts = row.glyphs.map((glyph) => {
    if (glyph.kind === 'mouse') {
      return glyph.button === 'left' ? words.leftClick : words.rightClick
    }
    // The four letters, read out as four letters. They are the keys under the
    // reader's own left hand, not a word to translate.
    if (glyph.kind === 'wasd') return 'W A S D'
    if (glyph.kind === 'gesture') {
      return glyph.motion === 'pan' ? words.dragAnywhere : words.theStick
    }
    return glyph.label
  })
  return `${parts.join(` ${words.or} `)}: ${row.label}`
}

/**
 * What this level's keys are.
 *
 * Always a modal here, unlike the lounge's, because an XP has its own way in -
 * see the note at the top of this file. So it dims the world, takes pointer
 * events and closes on the backdrop, with no branch for the case where it is a
 * door.
 */
export function ControlsPanel({
  open,
  rows,
  onClose,
  title,
  intro,
  isTouch = false,
}: {
  open: boolean
  rows: ControlRow[]
  onClose: () => void
  /** Defaults to the word for "Controls" in the reader's language. */
  title?: string
  intro?: React.ReactNode
  /**
   * Whether to offer the handedness switch.
   *
   * Passed in rather than queried here, on the same terms as `rows`: this panel
   * is handed what to draw. It is also the caller's answer already - the scene
   * asks `useIsTouch` once and builds the rows from it, and a panel that asked
   * again could disagree with the list of controls printed inside it.
   */
  isTouch?: boolean
}) {
  const t = xpDict(useLocale())
  const heading = title ?? t.panel.title
  // Esc closes. The only keyboard way out, and it is also what releases pointer
  // lock, so the two agree about what "get me out of this" means.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center p-4"
      style={{ background: 'oklch(0.08 0.04 285 / 0.55)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={heading}
        className="hud-panel hud-panel-enter max-h-full w-full max-w-lg overflow-y-auto px-5 py-6 sm:px-8 sm:py-8"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t.panel.close}
          className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full text-lg text-[var(--color-ink-muted)] transition hover:bg-white/10 hover:text-[var(--color-ink)]"
        >
          ✕
        </button>

        <h2 className="font-pixel mb-1 text-center text-xl uppercase tracking-[0.12em] text-[var(--color-accent)] [text-shadow:0_0_1.5rem_oklch(0.7_0.27_322/0.7)] sm:text-2xl">
          {heading}
        </h2>

        {intro ? (
          <p className="mb-5 text-center text-xs leading-relaxed text-[var(--color-ink-muted)]">
            {intro}
          </p>
        ) : (
          <div className="mb-5" />
        )}

        {/*
          Two columns at every width.

          This was one column on a phone, on the theory that a WASD cross and a
          label in 160px wraps badly. What it actually bought was a list you
          scroll past to reach anything below it - and everything below it is
          the settings, which is the part somebody opened this to change. The
          rows are mostly a keycap and one word, so they fit; `gap-x-4` rather
          than 6 is what buys the label back the room the second column costs.
        */}
        <ul className="grid grid-cols-2 gap-x-4 gap-y-4 sm:gap-x-6">
          {rows.map((row) => (
            <li
              key={row.label}
              className={`flex items-center gap-3 ${row.unreachable ? 'opacity-45' : ''}`}
            >
              <span aria-hidden className="flex shrink-0 items-center gap-1">
                {row.glyphs.map((glyph, index) => (
                  <GlyphView key={index} glyph={glyph} />
                ))}
              </span>
              <span className="sr-only">{spoken(row, t.controls.spoken)}</span>
              <span aria-hidden className="text-xs text-[var(--color-ink-muted)]">
                {row.label}
              </span>
            </li>
          ))}
        </ul>

        {/*
          Where a change of mind goes.

          The gate in ./hand-gate asks once, before the first level anyone plays;
          this is the answer to "how do I put it back". It belongs on the panel
          rather than in a settings page because the panel is where somebody
          confused about the controls already is - it is what the `?` chip and
          `H` open - and a control scheme is not something you go to another
          route to fix mid-level.
        */}
        {/*
          Back to the level, above the settings rather than below them.

          This is where a divider used to be, and a button is the better thing
          to put in the gap: the panel opens over a *running* level, so the one
          thing everybody wants from it is out. Leaving that to the ✕ in the
          corner or a tap on the backdrop meant the way back was the least
          visible thing on the screen, under two rows of settings.
        */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onClose}
            className="bg-accent pointer-events-auto rounded-full px-7 py-2.5 text-sm font-semibold"
          >
            {t.panel.play}
          </button>
        </div>

        {/*
          Whether moving also turns the camera - for everyone, not just touch.

          Above the hand picker because it is the bigger decision: it changes
          how the level drives, where the hand only decides which corner the
          stick sits in. And unlike that one it is offered to a mouse too - on
          a desktop it means the keys swing the camera, which is exactly the
          one-handed mode the panel exists to make findable.
        */}
        <div className="mt-6 pt-1">
          <CameraChoice isTouch={isTouch} />
        </div>

        {isTouch && (
          <div className="mt-6 pt-1">
            <HandChoice />
          </div>
        )}
      </div>
    </div>
  )
}
