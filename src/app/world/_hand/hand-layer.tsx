'use client'

import { useEffect, useRef, useState } from 'react'

import { type Letter, SPACE } from '@/app/world/_hand/alphabet'
import { type Finger, FIST, INITIALS, type Pose, withFinger } from '@/app/world/_hand/fingers'
import { HandCamera, type Seen } from '@/app/world/_hand/hand-camera'
import { HandView } from '@/app/world/_hand/hand-view'
import type { HandLabels } from '@/app/world/_hand/labels'
import { type Phrase, wordingOf } from '@/app/world/_hand/phrases'
import type { Drift } from '@/app/world/_hand/sight'
import { createSigner, type Said } from '@/app/world/_hand/signing'
import { spellSigned } from '@/app/world/_hand/spells'
import type { Word } from '@/app/world/_ink'
import { isTyping } from '@/app/world/_sim/typing'
import type { Locale } from '@/domain/i18n/locale'

/**
 * Hand mode: your hand on the screen, and a way to say something with it.
 *
 * The mode exists for the room's quiet half. Not everybody in a space can hear
 * it, not everybody wants to type, and not everybody types the same language -
 * and all three of those are the same problem, which is that the only way to
 * say "wait, I'm coming" used to be a sentence in a chat box. A hand is faster
 * than a sentence, it is visible from across a room, and - because what travels
 * is a *meaning* rather than words - it arrives in the reader's own language.
 * See `phrases.ts`, which is where that promise is actually kept.
 *
 * ## Your hand is on the keyboard already
 *
 * The five keys are `Space J K L ;`, which is a right hand resting on the home
 * row: thumb on the space bar, then one finger per key, in order. You are not
 * learning a keyboard shortcut, you are putting your hand down and *making the
 * shape* - and the hand on screen makes it with you. That is worth more than
 * any mnemonic, and it is why the keys are read by `code` (a position on the
 * board) rather than by `key` (a letter, which moves between layouts).
 *
 * It costs the space bar while the hand is out, so you cannot jump mid-sentence.
 * That is the right trade: signing is something you stop to do, the way you stop
 * to talk, and a thumb that is also a jump would fire one every `e`.
 *
 * On a phone there is no home row, so there are six pads. Five are the fingers
 * and the sixth is the open hand - because holding five pads at once with the
 * hand that is holding the phone is not a thing anybody can do, and the open
 * hand is the one pose you need to make constantly. See `send` below.
 *
 * ## And there is a third way, which is your actual hand
 *
 * Where the caller passes `camera`, a switch appears that points a webcam at
 * you and reads the pose off your own fingers - `hand-camera.tsx` for the loop,
 * `sight.ts` for the reading. It is a switch rather than the default because it
 * costs a permission prompt and eight megabytes of model, and because the keys
 * work in a dark room on a laptop with the lid half shut.
 *
 * Nothing downstream knows which of the three made the pose. That is the point:
 * a camera is a third way to *hold a hand up*, and the alphabet, the signer and
 * the phrasebook below it never learn that one exists. What it does bring is a
 * hand that **moves** - see `drift` - because once a camera is watching, a hand
 * pinned to the corner of the screen is the one thing on screen not doing what
 * the hand in front of it is doing.
 *
 * Everything mutable is in one object made once by `useState`, touched only by
 * module-level functions - the React Compiler rule this repo lints with, and
 * the same note `_ink/ink-layer.tsx` carries.
 */

/** Which physical key is which finger. See the note above about `code`. */
const KEYS: Record<string, Finger> = {
  Space: 'thumb',
  KeyJ: 'index',
  KeyK: 'middle',
  KeyL: 'ring',
  Semicolon: 'pinky',
}

/** How long something you just said stays on your own screen, in ms. */
const ECHO = 2600

interface Live {
  pose: Pose
  /**
   * The pose React has been told about.
   *
   * Two homes for one fact, and both are needed. `pose` is what the reader is
   * fed sixty times a second and must never be a render behind; `drawn` is what
   * the hand on screen is holding. Keeping them apart means a key press can
   * write the truth immediately and the frame loop can decide, once a frame,
   * whether that is worth a re-render.
   */
  drawn: Pose
  signer: ReturnType<typeof createSigner>
  /** How many letters the readout is currently showing. `-1` forces a redraw. */
  shown: number
  /**
   * Where the camera last saw the hand, or `null` when nothing is watching.
   *
   * Beside the pose rather than in React state for exactly the reason the pose
   * is: it changes thirty times a second and only the frame loop that draws the
   * hand ever reads it. See `sight.ts` for what it is, and `flow` in
   * `neon-hand.tsx` for what it does with it.
   */
  drift: Drift | null
}

export interface HandIncoming {
  /** Who signed it. */
  name: string
  phrase: Phrase
  /** A new timestamp each time, so the same phrase twice plays twice. */
  at: number
}

export function HandLayer({
  active,
  camera,
  labels,
  locale,
  spells,
  onSay,
  onCast,
  incoming,
  onOpenChart,
  onAway,
  className,
}: {
  active: boolean
  /**
   * Offer the camera as a way to make a hand.
   *
   * An offer rather than a setting: the switch is drawn, and nothing is asked
   * for until somebody presses it. A permission prompt that appeared because a
   * mode opened would be a mode people close.
   *
   * Off by default, so every caller that does not ask for it is the mode it
   * already was - no model downloaded, no camera element, nothing.
   */
  camera?: boolean
  labels: HandLabels
  /** The reader's language, which is what everything here is drawn in. */
  locale: Locale
  /** Which spells this room allows, so a hand casts exactly what a pen does. */
  spells?: readonly Word[]
  /** A finished run. Phrases carry a meaning; anything else is spelled out. */
  onSay: (said: Said) => void
  /** A run the pen would have recognised. See `spells.ts`. */
  onCast?: (word: Word) => void
  incoming?: HandIncoming | null
  onOpenChart?: () => void
  /**
   * Put the hand away.
   *
   * Optional because a page that *is* the hand - the practice pad - has nowhere
   * to put it away to. A room passes it, and must: a room takes its joystick
   * down while the finger pads are up, so without this the only way out on a
   * phone would be a key that phone does not have.
   */
  onAway?: () => void
  className?: string
}) {
  const [live] = useState<Live>(() => ({
    pose: FIST,
    drawn: FIST,
    signer: createSigner(),
    shown: 0,
    drift: null,
  }))
  const [pose, setPose] = useState<Pose>(FIST)
  const [run, setRun] = useState<Letter[]>([])
  const [echo, setEcho] = useState<string | null>(null)
  /** Whether the camera is on. Never true unless `camera` was offered. */
  const [watching, setWatching] = useState(false)

  /*
    The latest callbacks, without making the frame loop depend on them. A scene
    that passes a fresh `onSay` every time anything in the room moves would
    otherwise tear down and rebuild this loop sixty times a second - the same
    trap `_ink/ink-layer.tsx` documents.
  */
  const sink = useRef({ onSay, onCast, spells })
  useEffect(() => {
    sink.current = { onSay, onCast, spells }
  }, [onSay, onCast, spells])

  useEffect(() => {
    // Leaving the mode drops the half-word with it. Coming back an hour later
    // and sending three letters you no longer remember signing is worse than
    // starting again. Nothing is drawn while it is away, so React is left
    // holding whatever it had - the first tick after coming back fixes it.
    if (!active) return putAway(live)

    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const said = live.signer.hold(live.pose, performance.now())
      if (said) setEcho(deliver(sink.current, said, locale))

      /*
        Everything React is told is decided here, once a frame, and only when
        something actually changed.

        A key press writes `live.pose` and nothing else, so the reader always
        has the truth; this is where that becomes a render. Setting state from
        the handler instead would be a render per key, and setting the letters
        unconditionally would be a render per *frame* for a readout that changes
        twice a second.
      */
      if (live.pose !== live.drawn) {
        live.drawn = live.pose
        setPose(live.pose)
      }
      const letters = live.signer.run()
      if (letters.length !== live.shown) {
        live.shown = letters.length
        setRun(letters)
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, live, locale])

  useEffect(() => {
    /*
      The camera takes the keys with it.

      Two hands writing one pose is the bug this avoids: a finger lifted on the
      home row and a finger the camera can see are the same bit, and whichever
      wrote last would win, thirty times a second. The camera is the hand while
      it is on - so the keys stand down, the pads are not drawn, and `Space`,
      `L` and `;` go back to meaning what they mean in the room.
    */
    if (!active || watching) return

    const move = (event: KeyboardEvent, up: boolean) => {
      const finger = KEYS[event.code]
      if (!finger || isTyping(event)) return
      // The space bar scrolls the page and jumps in a room; while the hand is
      // out it is a thumb and nothing else.
      event.preventDefault()
      // A held key repeats at whatever rate the OS is set to. A finger is
      // already up; hearing about it forty more times must not move anything.
      if (event.repeat) return
      press(live, finger, up)
    }

    const down = (event: KeyboardEvent) => move(event, true)
    const up = (event: KeyboardEvent) => move(event, false)
    // A hand cannot stay held through an alt-tab: the key-up lands on the other
    // window, and the finger would be stuck raised until it was pressed again.
    const drop = () => openHand(live, false)

    /*
      Captured, not bubbled, and that is load-bearing.

      Three of the five keys already mean something in a room - the space bar
      jumps, `L` toggles the look lock - and the handlers that own them run on
      `window` like this one does. Listeners on the same target fire in the
      order they were added, and this one is added last, when the mode opens.
      So `preventDefault` in the bubble phase would come too late: every `e`
      would also be a jump.

      A capture listener on `window` runs before every bubble listener anywhere,
      which is what makes `preventDefault` here actually mean "this key is
      mine". The handlers downstream check `defaultPrevented` and stand aside -
      the same courtesy the lounge's own key handler already extends.
    */
    window.addEventListener('keydown', down, { capture: true })
    window.addEventListener('keyup', up, { capture: true })
    window.addEventListener('blur', drop)
    return () => {
      window.removeEventListener('keydown', down, { capture: true })
      window.removeEventListener('keyup', up, { capture: true })
      window.removeEventListener('blur', drop)
    }
  }, [active, live, watching])

  useEffect(() => {
    if (!echo) return
    const timer = setTimeout(() => setEcho(null), ECHO)
    return () => clearTimeout(timer)
  }, [echo])

  // Nothing at all while the hand is away: no canvas, no frame loop, no keys.
  if (!active) return null

  return (
    <div className={`pointer-events-none absolute inset-0 z-10 ${className ?? ''}`}>
      {incoming && (
        <p
          key={incoming.at}
          className="absolute inset-x-0 top-6 mx-auto w-fit max-w-[80%] rounded-full border border-[var(--color-accent)]/40 bg-black/55 px-4 py-1.5 text-center text-sm text-[var(--color-ink)] backdrop-blur"
        >
          <span className="opacity-60">{labels.from.replace('{name}', incoming.name)} </span>
          {wordingOf(incoming.phrase, locale)}
        </p>
      )}

      {/*
        The corner - and, when a camera is on, the whole card.

        The outer box is the card and is the only *positioned* thing here, which
        is what lets the hand at the bottom of the stack say `inset-0` and mean
        the card while still being a child of this column.
      */}
      <div className="absolute inset-0 flex flex-col items-end justify-end gap-1 p-3">
        <div className="flex w-40 flex-col items-end gap-1 sm:w-52">
          {camera && (
            <button
              type="button"
              onClick={() => setWatching((on) => !on)}
              aria-pressed={watching}
              className={`pointer-events-auto rounded-full border px-3 py-1 text-xs backdrop-blur transition-colors ${
                watching
                  ? 'border-[var(--color-accent)] bg-black/45 text-[var(--color-ink)]'
                  : 'border-white/15 bg-black/35 text-white/60 hover:border-[var(--color-accent)]'
              }`}
            >
              {labels.camera}
            </button>
          )}

          {watching && (
            <HandCamera
              labels={labels}
              onSee={(seen) => watched(live, seen)}
              className="w-24 sm:w-28"
            />
          )}

          <Readout labels={labels} run={run} echo={echo} />

          {/* `shrink-0`, or the canvas is squeezed by whatever the readout
              above it happens to be showing - and a canvas that changes size
              mid-word re-frames the hand while you are looking at it.

              Watching, it stops being a corner: the hand takes the whole card
              and moves around it with the one in front of the lens, which is
              the only size at which having it follow you is worth anything.
              Behind the rest of the stack, because the readout is the thing
              you are reading and a hand can pass under it.

              The `key` is what makes that switch actually happen, and it was
              measured rather than assumed: growing the box with a class alone
              leaves `<Canvas>` drawing at the old size - 208 by 208 over a
              whole room - until something else on the page resizes. So the
              canvas is remade when the mode changes. It costs one WebGL
              context per press of a button nobody presses twice a minute,
              which is the cheaper of the two mistakes. */}
          <HandView
            pose={pose}
            settle={() => live.signer.settling(performance.now())}
            key={watching ? 'roaming' : 'corner'}
            drift={watching ? () => live.drift : undefined}
            roaming={watching}
            className={watching ? 'absolute inset-0 -z-10' : 'h-40 w-40 shrink-0 sm:h-52 sm:w-52'}
          />
        </div>
      </div>

      {/* Not while the camera is on: the pads are a hand *instead of* one, and
          six of them under a phone's own camera would be six ways to argue with
          the finger it can already see. */}
      {!watching && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-2 flex justify-center gap-1.5 px-2 sm:hidden">
          {(['thumb', 'index', 'middle', 'ring', 'pinky'] as Finger[]).map((finger, index) => (
            <Pad
              key={finger}
              label={INITIALS[index]}
              onHold={(down) => press(live, finger, down)}
              lit={(pose & (1 << index)) !== 0}
            />
          ))}
          <Pad
            label={labels.send}
            wide
            onHold={(down) => openHand(live, down)}
            lit={pose === SPACE}
          />
        </div>
      )}

      {onOpenChart && (
        <button
          type="button"
          onClick={onOpenChart}
          className="pointer-events-auto absolute top-4 left-4 rounded-full border border-white/15 px-3 py-1 text-xs opacity-70 hover:opacity-100"
        >
          {labels.hint}
        </button>
      )}

      {onAway && (
        <button
          type="button"
          onClick={onAway}
          className="pointer-events-auto absolute top-4 right-4 rounded-full border border-[var(--color-accent)]/50 bg-black/45 px-3 py-1 text-xs text-[var(--color-ink)] backdrop-blur"
        >
          {labels.away}
        </button>
      )}
    </div>
  )
}

/**
 * Raise or lower one finger.
 *
 * Module-level, taking `live` as an argument, like everything else that touches
 * it. The React Compiler rules this repo lints with forbid modifying a value
 * that came out of `useState` where they can see the assignment - inside the
 * component - so the mutations live out here, where they are a function's own
 * business. `_ink/ink-layer.tsx` arranges its frame state the same way.
 *
 * Nothing here calls a setter. Drawing is the frame loop's job; see `drawn`.
 */
function press(live: Live, finger: Finger, up: boolean): void {
  live.pose = withFinger(live.pose, finger, up)
}

/**
 * What the camera saw, written where the frame loop will find it.
 *
 * Module-level for the same reason `press` is: the React Compiler rules forbid
 * modifying a `useState` value inside the component that owns it. It writes
 * both halves of a reading together because they *are* one reading - a pose
 * drawn at the last frame's tilt is a hand whose fingers and wrist disagree.
 */
function watched(live: Live, seen: Seen): void {
  live.pose = seen.pose
  live.drift = seen.drift
}

/** The open hand, and the fist it falls back to. See `signing.ts` on sending. */
function openHand(live: Live, open: boolean): void {
  live.pose = open ? SPACE : FIST
}

/** Drop the hand and the half-word, and make the next tick redraw both. */
function putAway(live: Live): void {
  live.signer.clear()
  live.pose = FIST
  live.drift = null
  live.shown = -1
}

/**
 * The letters gathered so far, and whatever was last sent.
 *
 * Both in one place, because they are one thought: the run is what you are
 * saying and the echo is what you just said. Splitting them across the screen
 * would mean watching two places to know whether a phrase landed.
 */
function Readout({
  labels,
  run,
  echo,
}: {
  labels: HandLabels
  run: Letter[]
  echo: string | null
}) {
  if (run.length === 0 && !echo) return null

  return (
    <div className="mb-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-1.5 text-right backdrop-blur">
      {run.length > 0 && (
        <>
          <span className="block text-[0.55rem] tracking-widest uppercase opacity-40">
            {labels.saying}
          </span>
          <span className="block font-mono text-lg tracking-[0.2em] text-[var(--color-ink)] uppercase">
            {run.join('')}
          </span>
        </>
      )}
      {echo && <span className="block text-sm text-[var(--color-accent)]">{echo}</span>}
    </div>
  )
}

function Pad({
  label,
  lit,
  wide,
  onHold,
}: {
  label: string
  lit: boolean
  wide?: boolean
  onHold: (down: boolean) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={lit}
      // Pointer events rather than click, because a pad is *held*: the finger
      // is up for exactly as long as the thumb is down on it.
      onPointerDown={(event) => {
        event.preventDefault()
        onHold(true)
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onPointerLeave={() => onHold(false)}
      className={`h-12 touch-none rounded-xl border text-xs font-semibold tracking-widest uppercase transition-colors select-none ${
        wide ? 'flex-1' : 'w-11'
      } ${
        lit
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/25 text-[var(--color-ink)]'
          : 'border-white/15 bg-black/40 text-white/60'
      }`}
    >
      {label}
    </button>
  )
}

/**
 * What happens to a finished run, and what your own screen says about it.
 *
 * The order is the mode's priority, and it is worth stating: a **phrase** wins,
 * then a **spell**, then the letters as they were signed. A phrase wins because
 * it is the only one of the three that crosses a language, which is what the
 * mode is for; nothing in the phrasebook is spelled like a spell, so the two
 * never actually compete - but if somebody adds one that is, this is the line
 * that decides it, rather than whichever check happened to come first.
 */
function deliver(
  sink: { onSay: (said: Said) => void; onCast?: (word: Word) => void; spells?: readonly Word[] },
  said: Said,
  locale: Locale,
): string {
  if (said.phrase) {
    sink.onSay(said)
    return wordingOf(said.phrase, locale)
  }

  const word = sink.onCast ? spellSigned(said.letters, sink.spells) : null
  if (word) {
    sink.onCast?.(word)
    return said.letters.join('').toUpperCase()
  }

  sink.onSay(said)
  return said.letters.join('').toUpperCase()
}
