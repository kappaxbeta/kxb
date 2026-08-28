'use client'

import { useCallback, useEffect, useState } from 'react'
import { CameraModeChoice } from '@/app/components/controls/camera-mode-choice'
import { VoiceModeChoice } from '@/app/components/controls/voice-mode-choice'
import { HandChoice } from '@/app/components/controls/hand-choice'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { worldDict, type WorldDict } from '@/app/i18n/world'
import { isTyping } from '@/app/world/_sim/typing'
import { useHand } from '@/lib/controls/use-hand'

/**
 * The in-world HUD kit.
 *
 * Three scenes overlay a HUD on a <Canvas> - the lounge (which the battle rooms
 * and the public showcase also render), the house, and the café - and until now
 * each drew its own panels, its own keycaps and its own "click to enter" card.
 * They had drifted into three different looks, none of which was the neon the
 * rest of the app is painted in.
 *
 * So the parts that are the same everywhere live here: the controls panel, the
 * keycaps it is built from, and the chip vocabulary the readouts use. What is
 * *not* here is anything a scene knows and the others do not - a block count, a
 * coin purse, a comfort score. Those stay where they are; this is the shared
 * frame around them.
 *
 * The visual half is in globals.css under "The in-world HUD", for the reason
 * given there: the glow is a multi-layer box-shadow no utility string can say,
 * and it must not be re-typed three times.
 */

/* -------------------------------------------------------------------------
 * Glyphs
 * ------------------------------------------------------------------------- */

/**
 * One thing you press.
 *
 * A union rather than a string, because a mouse button and the WASD cross are
 * not letters and cannot be drawn as one. The alternative - passing raw JSX in
 * from each scene - is how the three HUDs diverged in the first place.
 */
export type Glyph =
  | { kind: 'key'; label: string; tone: 'cyan' | 'pink'; wide: boolean }
  | { kind: 'mouse'; button: 'left' | 'right' }
  | { kind: 'wasd' }
  | { kind: 'gesture'; motion: 'pan' | 'stick' }

/** A key. Cyan by convention: movement, navigation, the passive half. */
export function key(label: string): Glyph {
  // Anything longer than two characters is a word wearing a keycap - "Shift",
  // "Spacebar" - and a square would either clip it or blow the row's height.
  return { kind: 'key', label, tone: 'cyan', wide: label.length > 2 }
}

/** A key that does something to the world. Fuchsia, as everywhere else. */
export function actionKey(label: string): Glyph {
  return { kind: 'key', label, tone: 'pink', wide: label.length > 2 }
}

export function mouse(button: 'left' | 'right'): Glyph {
  return { kind: 'mouse', button }
}

/** The movement cross, drawn as one unit rather than four loose caps. */
export function wasd(): Glyph {
  return { kind: 'wasd' }
}

/**
 * A thing you do with a finger, drawn rather than named.
 *
 * The touch rows used to be keycaps with words on them - a cap reading "Drag"
 * next to the label "Look" - which is a keyboard metaphor offered to somebody
 * holding a phone, and it left the single most important control in the room
 * unexplained: that the way to turn round is to drag anywhere on the world
 * itself, not on any button. A hand with arrows around it says that in one
 * glance and in every language.
 */
export function gesture(motion: 'pan' | 'stick'): Glyph {
  return { kind: 'gesture', motion }
}

/** A line in the panel: what you press, and what it does. */
export interface ControlRow {
  glyphs: Glyph[]
  label: string
}

export function row(glyphs: Glyph[], label: string): ControlRow {
  return { glyphs, label }
}

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
 * The screen-reader text for a row.
 *
 * The glyphs are all `aria-hidden` or bare letters, so without this a mouse
 * button announces as nothing at all and the WASD cross announces as four
 * unrelated letters. Spelling the row out once is cheaper than trying to make
 * four decorative spans individually legible.
 */
/**
 * A hand doing the thing, on a keycap-sized tile.
 *
 * Sized and framed like `.hud-key` so a touch row lines up with a keyboard row
 * - the panel has both in it on a tablet with a keyboard attached, and a
 * drawing that sat a few pixels off the cap next to it would read as a mistake
 * rather than as a different kind of instruction.
 *
 * Drawn here rather than pulled from an icon set: it is two paths, and an icon
 * dependency for two paths is a dependency the whole HUD would then have.
 */
function GestureMark({ motion }: { motion: 'pan' | 'stick' }) {
  return (
    <span aria-hidden className="hud-key hud-key-wide grid place-items-center">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        {/* The hand: a pointing finger with the fist under it. The same shape
            for both gestures - what differs is what is drawn around it. */}
        <path d="M11 12V6.2a1.3 1.3 0 0 1 2.6 0V12" />
        <path d="M13.6 10.4a1.2 1.2 0 0 1 2.4 0v1.4M16 11a1.2 1.2 0 0 1 2.4 0v3.1a5 5 0 0 1-5 5h-1.2a4 4 0 0 1-3.1-1.5l-2.4-3a1.2 1.2 0 0 1 1.8-1.6L11 15" />
        {motion === 'pan' ? (
          // Swept sideways: the arrows say which way the finger goes, which is
          // the whole instruction - drag anywhere, and the view turns.
          <>
            <path d="M4.6 6.5h-2.2M2.4 6.5l1.4-1.3M2.4 6.5l1.4 1.3" opacity="0.85" />
            <path d="M19.4 6.5h2.2M21.6 6.5l-1.4-1.3M21.6 6.5l1.4 1.3" opacity="0.85" transform="translate(-1.4)" />
          </>
        ) : (
          // Held: a ring under the finger, the way a thumbstick is a place you
          // put a thumb and leave it.
          <circle cx="12" cy="4.2" r="2.6" opacity="0.5" />
        )}
      </svg>
    </span>
  )
}

function spoken(row: ControlRow, t: WorldDict['hud']): string {
  const parts = row.glyphs.map((glyph) => {
    if (glyph.kind === 'mouse') {
      return glyph.button === 'left' ? t.leftClick : t.rightClick
    }
    // The one thing here that is not a phrase: four keycaps, read out as the
    // four letters printed on them. A German keyboard has the same four.
    if (glyph.kind === 'wasd') return 'W A S D'
    if (glyph.kind === 'gesture') {
      return glyph.motion === 'pan' ? t.dragAnywhere : t.onScreenStick
    }
    return glyph.label
  })
  return fill(t.spoken, { keys: parts.join(t.or), does: row.label })
}

/* -------------------------------------------------------------------------
 * The panel
 * ------------------------------------------------------------------------- */

/**
 * The controls panel, and the door into the world.
 *
 * It is deliberately both. Every scene needed a card explaining the keys and a
 * gate that takes the first click, and running them as two things meant the
 * explanation was destroyed by the act of reading past it - dismiss it once and
 * there was no way back to "what does F do".
 *
 * Two subtleties, both about who receives the entry click.
 *
 * `interactive` says the panel was reopened mid-session, so it is an ordinary
 * modal: it dims the world, takes pointer events, and closes on the backdrop.
 * As the entry gate it is none of those things - the scene behind it is what is
 * being advertised, and it must not be dimmed.
 *
 * `onEnter` says the gate has a real way in of its own. Absent, the whole panel
 * is click-through and the click lands on the canvas underneath, which is how
 * pointer lock is granted and how two of the three scenes start. Present - the
 * lounge on touch, where entering is a React flag and no click on the canvas
 * would do anything - the panel takes the click itself.
 */
export function ControlsPanel({
  open,
  rows,
  isTouch,
  interactive,
  onEnter,
  onClose,
  title,
  intro,
  footer,
}: {
  open: boolean
  rows: ControlRow[]
  isTouch: boolean
  /** True when reopened mid-session, false when it is the entry gate. */
  interactive: boolean
  /**
   * The gate's own way in, for scenes where a click on the canvas would not do
   * it. Omit and the gate lets the click through to the canvas instead.
   */
  onEnter?: () => void
  /** Dismiss. On a gate with an `onEnter`, closing and entering are the same. */
  onClose: () => void
  /** Overrides the default heading. A scene that has its own name for itself. */
  title?: string
  /** A line above the keys - what this world is, or that it is still loading. */
  intro?: React.ReactNode
  /** Scene-specific extras below the keys, e.g. the lounge's floor generator. */
  footer?: React.ReactNode
}) {
  /**
   * Which thumb the controls belong to, asked here because here is the door.
   *
   * The panel is already the first thing a phone sees - it is the entry gate,
   * and nobody reaches the world without going through it - so the question
   * costs no extra screen and no extra step. Putting it in a dedicated
   * first-run overlay instead would have meant two cards to dismiss before
   * walking anywhere, on the one device where that is most annoying.
   *
   * It stays on the panel afterwards rather than disappearing once answered.
   * A layout you chose in the first ten seconds of your first session is
   * exactly the kind of thing you get wrong, and the panel is where somebody
   * confused about the controls already goes - `?` on the HUD, `H` on a
   * keyboard. `asking` only changes the heading above it.
   */
  const t = worldDict(useLocale()).hud
  const heading = title ?? t.title

  const { chosen } = useHand()

  // Esc closes. Free on desktop's entry gate (nothing is locked yet, so the
  // browser is not also using it), and the only keyboard way out of the
  // reopened panel.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  // A gate with no way in of its own is a gate the click must pass through.
  const clickThrough = !interactive && !onEnter

  return (
    <div
      className={`absolute inset-0 z-30 flex items-center justify-center p-4 ${
        clickThrough ? 'pointer-events-none' : 'pointer-events-auto'
      }`}
      style={{
        // Dim the world behind, but only once the panel is a real modal. On the
        // entry gate the scene is the thing being advertised.
        background: interactive ? 'oklch(0.08 0.04 285 / 0.55)' : undefined,
      }}
      onClick={interactive ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal={interactive}
        aria-label={heading}
        className="hud-panel hud-panel-enter max-h-full w-full max-w-lg overflow-y-auto px-5 py-6 sm:px-8 sm:py-8"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={interactive ? t.close : t.enter}
          className={`absolute right-3 top-3 flex size-9 items-center justify-center rounded-full text-lg text-[var(--color-ink-muted)] transition hover:bg-white/10 hover:text-[var(--color-ink)] ${
            clickThrough ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
        >
          ✕
        </button>

        <h2 className="font-pixel mb-1 text-center text-xl uppercase tracking-[0.12em] text-[var(--color-accent)] [text-shadow:0_0_1.5rem_oklch(0.7_0.27_322/0.7)] sm:text-2xl">
          {heading}
        </h2>

        {intro && (
          <p className="mb-5 text-center text-xs leading-relaxed text-[var(--color-ink-muted)]">
            {intro}
          </p>
        )}
        {!intro && <div className="mb-5" />}

        {/*
          Two columns at every width - see the note on the XP panel's copy of
          this list. One column on a phone made the keys a thing you scroll
          past to reach the way in and the settings under it, which is the
          wrong thing to spend a screen on.
        */}
        <ul className="grid grid-cols-2 gap-x-4 gap-y-4 sm:gap-x-6">
          {rows.map((entry) => (
            <li key={entry.label} className="flex items-center gap-3">
              <span aria-hidden className="flex shrink-0 items-center gap-1.5">
                {entry.glyphs.map((glyph, index) => (
                  <GlyphView key={index} glyph={glyph} />
                ))}
              </span>
              <span
                aria-hidden
                className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]"
              >
                {entry.label}
              </span>
              <span className="sr-only">{spoken(entry, t)}</span>
            </li>
          ))}
        </ul>

        {/*
          The way in, above the settings rather than below them.

          A button where there is one to offer, and otherwise the sentence that
          says where the click should go. The sentence is not a worse button: on
          a click-through gate the whole screen is the button, and drawing one
          would suggest it is the only place that works.

          It used to sit last, under the camera and hand pickers, which on a
          phone put the only way into the world below the fold - "put the button
          to enter over the config, so you see to enter immediately and not just
          when you scroll down". The pickers are a thing you *might* want; the
          door is the thing everybody came for, so the door goes first and the
          settings become what you scroll to if you want them.
        */}
        {!interactive && (
          <div className="mt-6 text-center">
            {onEnter ? (
              <button
                type="button"
                onClick={onEnter}
                className="bg-accent pointer-events-auto rounded-full px-7 py-2.5 text-sm font-semibold"
              >
                {isTouch ? t.tapEnter : t.enter}
              </button>
            ) : (
              <p className="text-xs text-[var(--color-ink-muted)]">
                {isTouch ? t.tapAnywhere : t.clickAnywhere}
              </p>
            )}
          </div>
        )}

        {/*
          Whether moving also turns the camera - for everyone, not just touch.

          On the entry panel because this is the door: choosing before you are
          inside is the whole point on a desktop, where there is no gate and no
          other chrome between you and the world. On a click-through gate the
          wrapper is `pointer-events-none`; the picker turns them back on for
          itself, same as the hand picker below.
        */}
        <div className="mt-6 border-t border-[var(--color-line)] pt-5">
          <CameraModeChoice />
        </div>

        {/*
          And when the microphone is open, on the same door and for a stronger
          version of the same reason.

          The camera question can be answered from inside - drive badly for ten
          seconds, change your mind, no harm done. This one cannot: by the time
          you have noticed that open mic was the wrong answer for the room you
          are sitting in, the room has already been sent. It belongs before the
          threshold, next to the other thing you decide on the way in.

          Shown whether or not this space has faces switched on. The setting is
          about this person and this device rather than about the space, it
          persists across worlds, and a control that appeared and vanished as
          you moved between spaces would be one nobody could ever find twice.
        */}
        <div className="mt-5">
          <VoiceModeChoice />
        </div>

        {/*
          Which way round the rig goes, on the devices that have one.

          Above the footer rather than below it, because the footer is scene
          chrome - the lounge's floor generator - and this is part of the
          controls the list above it just described. On a click-through gate the
          wrapper is `pointer-events-none`; the picker turns them back on for
          itself, so a tap here sets the hand instead of falling through and
          entering the world with the layout untouched.
        */}
        {isTouch && (
          <div className="mt-6 border-t border-[var(--color-line)] pt-5">
            <HandChoice asking={!chosen && !interactive} />
          </div>
        )}

        {footer && (
          <div className="mt-6 border-t border-[var(--color-line)] pt-5">{footer}</div>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------
 * Reopening it
 * ------------------------------------------------------------------------- */

/**
 * The corner button that brings the panel back.
 *
 * Small and quiet on purpose: it is on screen for the entire session and only
 * wanted twice in it. Sized past the 44px touch floor anyway, because the thing
 * it is next to on a phone is the edge of the screen.
 */
/**
 * The chip's face: a pad, drawn in the panel's own hand.
 *
 * A literal `?` was the first version and it asked the wrong question - it
 * reads as *help*, and what is behind it is the controls, the handedness and
 * the camera mode. A pad says "settings for the thing in your hands" without a
 * word in any language.
 *
 * Stroked in `currentColor` at 1.6, round caps and joins, on a 24 grid: the
 * same construction as `GestureMark` and the same weight as the `.hud-key`
 * caps it sits beside. Copied in shape to `@/app/xp/_runtime/hud/hud` per the
 * rule that keeps those two trees apart - the point of this change is that the
 * two hosts wear the same face, so the copies must stay in step.
 */
function GamepadMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* The body: a lozenge, because a rectangle reads as a screen. */}
      <rect x="2.2" y="7.4" width="19.6" height="9.2" rx="4.6" />
      {/* The d-pad, left, where a left thumb goes. */}
      <path d="M7 9.9v2.6M5.7 11.2h2.6" />
      {/* And the face buttons, right, offset the way every pad has them. */}
      <circle cx="16.2" cy="10.9" r="0.95" fill="currentColor" stroke="none" />
      <circle cx="18.6" cy="13.1" r="0.95" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function HelpButton({
  onClick,
  className,
}: {
  onClick: () => void
  className?: string
}) {
  const t = worldDict(useLocale()).hud

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t.showControls}
      title={t.controlsTitle}
      className={`hud-chip pointer-events-auto size-11 justify-center !px-0 ${className ?? ''}`}
    >
      <GamepadMark />
    </button>
  )
}

/* -------------------------------------------------------------------------
 * Palette
 * ------------------------------------------------------------------------- */

/**
 * One buyable thing, as a picture.
 *
 * The café and the house both used to list their catalogs as names and numbers,
 * which asks the player to know what a "countertop_straight_B_long" looks like
 * before they can shop. The models are the answer, so the tile is mostly model:
 * a thumbnail shot from `scripts/render-props.ts` at the same three-quarter
 * angle the room is drawn at, with the name under it and the price on it.
 *
 * The thumbnails are files rather than live 3D. A <Canvas> per tile would mean
 * seventy WebGL contexts fighting the one that is drawing the room — browsers
 * cap those at around sixteen and silently drop the oldest.
 */
export function PaletteTile({
  src,
  name,
  price,
  bonus,
  active,
  affordable,
  title,
  onClick,
}: {
  src: string
  name: string
  price: number
  /** The small green number, for catalogs that have one (comfort, ambience). */
  bonus?: number
  active: boolean
  affordable: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? name}
      aria-pressed={active}
      className={[
        'group relative flex flex-col overflow-hidden rounded-lg border text-left transition',
        active
          ? 'border-amber-300/70 bg-amber-300/15 shadow-[0_0_0_1px_oklch(0.85_0.15_85/0.35),0_0_18px_-4px_oklch(0.85_0.15_85/0.5)]'
          : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10',
        // Dimmed rather than disabled: you can still select something you are
        // saving up for, and seeing it is half the reason to save up.
        affordable ? '' : 'opacity-45',
      ].join(' ')}
    >
      <span className="relative block aspect-square w-full">
        {/*
          A plain <img>, not next/image: these are 192px files served straight
          out of /public inside a client scene, so the optimizer has nothing to
          optimize and would only add a request per tile.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-contain p-1 transition-transform duration-200 group-hover:scale-110"
        />
        <span
          className={[
            'absolute right-0.5 top-0.5 rounded px-1 text-[10px] font-medium tabular-nums backdrop-blur-sm',
            affordable ? 'bg-black/50 text-amber-300' : 'bg-black/50 text-red-300',
          ].join(' ')}
        >
          {price}
        </span>
        {bonus ? (
          <span className="absolute left-0.5 top-0.5 rounded bg-black/50 px-1 text-[10px] font-medium tabular-nums text-emerald-300 backdrop-blur-sm">
            +{bonus}
          </span>
        ) : null}
      </span>
      <span
        className={[
          'block truncate border-t px-1.5 py-1 text-[10px] leading-tight',
          active
            ? 'border-amber-300/30 text-amber-100'
            : 'border-white/5 text-white/70',
        ].join(' ')}
      >
        {name}
      </span>
    </button>
  )
}

/**
 * Open/close state for the controls panel, plus the H shortcut.
 *
 * A hook rather than three copies of the same four lines, and because the
 * shortcut has one non-obvious guard in it: H is a letter, and the scenes have
 * text inputs in them (a world name, a search box in the block picker). Firing
 * on a keystroke that was meant for an input would pop the panel over whatever
 * was being typed.
 */
export function useControlsPanel(): {
  open: boolean
  show: () => void
  hide: () => void
} {
  const [open, setOpen] = useState(false)

  const show = useCallback(() => setOpen(true), [])
  const hide = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'h' && event.key !== 'H') return

      // Was written out inline here, and is now shared with the two handlers in
      // the lounge that had to learn the same thing when chat gave the scene
      // something to type into. See `isTyping`.
      if (isTyping(event)) return

      // Pointer lock has to go first. The panel is unreadable and unclickable
      // with the cursor still captured by the canvas, and Esc - the only other
      // way out - would then be read by the panel as "close me".
      if (document.pointerLockElement) document.exitPointerLock()
      setOpen((current) => !current)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return { open, show, hide }
}
