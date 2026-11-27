'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { InkLabels } from '@/app/world/_ink/labels'
import { createNeon, type Neon } from '@/app/world/_ink/neon'
import { PALETTE, ringsFor } from '@/app/world/_ink/palette'
import type { Pt } from '@/app/world/_ink/points'
import { writeNote } from '@/domain/ink/note'
import { sampleFor } from '@/app/world/_ink/samples'
import { Spellbook } from '@/app/world/_ink/spellbook'
import { createReader, type Reader } from '@/app/world/_ink/spell'
import type { Word } from '@/app/world/_ink/words'

/**
 * The pen: a sheet of glass over the room that you can write on.
 *
 * Three things meet here and nothing else does - the finger (pointer events),
 * the light (`neon.ts`) and the meaning (`spell.ts`). Each of those is a file
 * of its own because each is testable or lookable-at on its own; this is the
 * part that owns the frame loop and the lifetimes, which can only be judged by
 * using it.
 *
 * The layer sits *under* the thumb buttons (z-10 against their z-20) on
 * purpose. Drawing must not cost you the pen button that puts the pen away,
 * and on a phone the other hand is usually still on the stick - so you can
 * walk while you write, which is most of the fun.
 *
 * It also comes up uninvited. A word somebody else wrote arrives as `incoming`
 * and plays here whether or not this player has a pen out, because that is what
 * a shout *is*: see the note on `shown`.
 *
 * Everything that changes between frames lives in one plain object made once
 * with `useState`, and every function that touches it is module-level and takes
 * it as an argument. That is not a style preference: this repo lints with the
 * React Compiler rules, where a ref read from anything the compiler believes is
 * render is an error - and a frame loop is nothing but mutable state read from
 * a closure.
 */

/** How long a stroke stays on the glass, in seconds. */
const LIFE = 2.6

/** Half-width of the filament, in CSS pixels. */
const WIDTH = 3

/** How long the magic takes, in seconds. */
const BURST = 0.9

/** Where the book is remembered, so it opens itself exactly once per browser. */
const SEEN = 'kxb.ink.seen'

interface Live {
  points: Pt[]
  /** When each point was drawn, in `performance.now()` milliseconds. */
  times: number[]
  hue: number
  /** Whether the finger is still down on it. */
  drawing: boolean
  /** The event timestamp of the last sample taken in. See `onPointerMove`. */
  mark: number
}

interface Burst {
  strokes: Live[]
  origin: Pt
  hues: number[]
  start: number
}

interface InkState {
  strokes: Live[]
  burst: Burst | null
  reader: Reader
  /** Which colour the next stroke gets. See `palette.ts`. */
  hue: number
}

/** A word somebody else wrote, arriving from the room. */
export interface Incoming {
  word: Word
  /** Who sent it, for the line under it. */
  from?: string
  /** When it arrived. A new value is a new burst, so it must actually change. */
  at: number
}

/**
 * Hand the reader a new vocabulary.
 *
 * Out here rather than inline in the effect for the reason every mutation in
 * this file is: `ink` is made by a hook, and a hook body may not write to it.
 *
 * It matters because a room's vocabulary is not fixed. Flipping a lounge into
 * battle adds the beam, and a reader built once on mount would go on refusing
 * the word the book had started offering.
 */
function retune(ink: InkState, allowed: readonly Word[] | undefined) {
  ink.reader = createReader({ allowed })
}

/** A circle as a stroke, for the shockwave the magic throws off. */
function ring(origin: Pt, radius: number, points = 96): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2
    out.push({ x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius })
  }
  return out
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/** The middle of the ink on screen, for the burst to fly out of. */
function middleOf(group: Live[]): Pt {
  let x = 0
  let y = 0
  let count = 0
  for (const stroke of group) {
    for (const point of stroke.points) {
      x += point.x
      y += point.y
      count++
    }
  }
  return count ? { x: x / count, y: y / count } : { x: 0, y: 0 }
}

/** One frame: the live ink, then whatever the magic is doing over it. */
function paintFrame(ink: InkState, neon: Neon, now: number, calm: boolean, keep: boolean) {
  neon.begin()

  for (const stroke of ink.strokes) {
    neon.draw({
      points: stroke.points,
      /*
        Ink written to be kept does not age. Everywhere else a stroke fades from
        its tail within a couple of seconds, which is what makes the pen feel
        like light rather than paint; on a slate somebody is composing a note on,
        the same behaviour would rub out what they had written while they
        thought about the next word.
      */
      ages: keep ? stroke.times.map(() => 0) : stroke.times.map((at) => (now - at) / 1000),
      hue: stroke.hue,
      width: WIDTH,
      energy: 1,
      life: LIFE,
    })
  }

  // Ink nobody can see any more is ink nobody should be paying for.
  if (!keep) {
    ink.strokes = ink.strokes.filter(
      (stroke) => stroke.drawing || now - stroke.times[stroke.times.length - 1] < LIFE * 1000,
    )
  }

  const going = ink.burst
  if (!going) return

  const through = (now - going.start) / 1000 / BURST
  if (through >= 1) {
    ink.burst = null
    return
  }

  const eased = easeOut(through)
  const left = 1 - through

  /*
    The letters you wrote are what explodes.

    Nothing new is drawn for the magic except the rings: your own strokes fly
    outwards from their middle, fattening and burning out. That is the whole
    difference between "a word was recognised" and "the thing I drew did that".
  */
  for (const stroke of going.strokes) {
    neon.draw({
      points: stroke.points,
      ages: stroke.times.map(() => 0),
      hue: stroke.hue,
      width: WIDTH * (1 + eased * 1.6),
      energy: 2.6 * left * left,
      life: LIFE,
      scale: 1 + eased * 2.4,
      origin: going.origin,
    })
  }

  going.hues.forEach((hue, index) => {
    // Staggered, so the rings read as one wave going out rather than as a
    // single fat circle with a colour fringe.
    const lag = index * 0.1
    const ripple = (through - lag) / (1 - lag)
    if (ripple <= 0) return
    neon.draw({
      points: ring(going.origin, 40 + easeOut(ripple) * 520),
      ages: new Array(97).fill(0),
      hue,
      width: WIDTH * 1.4 * (1 - ripple),
      energy: 1.8 * (1 - ripple),
      life: LIFE,
      taper: false,
    })
  })

  /*
    A wash, not a camera flash. This lands over a room somebody is playing in,
    and additive light at the strength that looks right on a black probe page
    turns the whole world one colour for a beat.
  */
  neon.flash((calm ? 0.07 : 0.2) * Math.pow(left, 4), going.hues[0])
}

/**
 * The finger has left the glass: read what is written, and set it off if it is
 * a word.
 *
 * Every stroke on the glass goes into the burst, not only the ones that spelled
 * the word. Half a discarded letter left hanging in the air beside an explosion
 * is the sort of detail that reads as a bug.
 */
function finishStroke(ink: InkState, now: number, keep: boolean): Word | null {
  const last = ink.strokes[ink.strokes.length - 1]
  if (!last || last.points.length < 2) return null

  const word = ink.reader.add(last.points, now)
  if (!word) return null

  // A slate keeps what was written, so a word recognised on it must not blow
  // the drawing up - see `keep`. Reading it is still useful: a scene may want
  // to know, and a slate simply passes no words it cares about.
  if (keep) return word

  ink.burst = {
    strokes: ink.strokes,
    origin: middleOf(ink.strokes),
    hues: ringsFor(word),
    start: now,
  }
  ink.strokes = []
  return word
}

/** The ink on the glass, written down. Null when there is nothing worth keeping. */
function takeNote(ink: InkState, box: { width: number; height: number }): string | null {
  return writeNote(ink.strokes, box)
}

/**
 * Somebody else's word, drawn in the middle of your screen and set off.
 *
 * The sender's actual handwriting is not on the wire and should not be: it is
 * a word, not a drawing, and shipping a few hundred points across a presence
 * channel to make somebody else's wobble authentic would be paying real
 * bandwidth for a detail nobody can see once it is exploding. So the book's own
 * demonstration of that word is what flies apart, which has the happy property
 * that a shout looks like the picture in the spellbook.
 */
function borrowedBurst(word: Word, box: { width: number; height: number }, now: number): Burst {
  const sample = sampleFor(word)
  const origin = { x: box.width / 2, y: box.height / 2 }
  if (!sample) return { strokes: [], origin, hues: ringsFor(word), start: now }

  const scale =
    Math.min(box.width / sample.box.width, box.height / sample.box.height) * 0.45
  const left = origin.x - (sample.box.width * scale) / 2
  const top = origin.y - (sample.box.height * scale) / 2

  return {
    strokes: sample.strokes.map((stroke, index) => ({
      points: stroke.map((point) => ({ x: left + point.x * scale, y: top + point.y * scale })),
      times: stroke.map(() => now),
      hue: PALETTE[(index + 1) % PALETTE.length],
      drawing: false,
      mark: 0,
    })),
    origin,
    hues: ringsFor(word),
    start: now,
  }
}

export function InkLayer({
  active,
  onWord,
  labels,
  spells,
  incoming,
  keep = false,
  onNote,
  className,
}: {
  /** Whether the pen is out. Nothing is captured while it is not. */
  active: boolean
  /** A word, the moment the ink spells one. */
  onWord: (word: Word) => void
  labels: InkLabels
  /**
   * The words this surface understands, and the ones the book lists. Every
   * word when left out - which is what the workbench page wants and what a room
   * with nothing switched off gets.
   */
  spells?: readonly Word[]
  /** A word somebody else wrote. Plays here whether or not the pen is out. */
  incoming?: Incoming
  /**
   * Whether the ink stays put.
   *
   * False everywhere a room is being played in: strokes fade, which is what
   * keeps a world from filling up with everybody's leftovers. True on a slate
   * somebody is writing a note on, where the ink *is* the thing being made.
   */
  keep?: boolean
  /**
   * The drawing, after every stroke, written down for keeping. See `note.ts`.
   *
   * Called with null when there is nothing worth keeping, so a caller can turn
   * its own "attach" button off without inspecting the string.
   */
  onNote?: (note: string | null) => void
  /**
   * Extra classes for the glass itself - in practice the corner radius of the
   * scene it covers. Ink drawn near an edge, and every ring the magic throws,
   * would otherwise paint over a rounded frame's cut corners.
   */
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [ink] = useState<InkState>(() => ({
    strokes: [],
    burst: null,
    reader: createReader({ allowed: spells }),
    hue: 0,
  }))
  const [book, setBook] = useState(false)

  // A room that changes what it understands - a lounge going into battle -
  // gets a reader that understands the same. See `retune`.
  useEffect(() => {
    retune(ink, spells)
  }, [ink, spells])

  /**
   * The arrival being played right now, or 0.
   *
   * A shout has to draw itself on the screens of people who never took a pen
   * out, so the whole layer mounts for the length of one burst and then goes
   * away again. Keyed on the arrival's own timestamp rather than a boolean,
   * because two shouts in a row are two bursts and a boolean would be true
   * both times.
   */
  const [shown, setShown] = useState(0)

  const arrivedAt = incoming?.at ?? 0
  useEffect(() => {
    if (!arrivedAt) return
    setShown(arrivedAt)
    const timer = setTimeout(() => setShown(0), BURST * 1000 + 400)
    return () => clearTimeout(timer)
  }, [arrivedAt])

  const live = active || shown !== 0

  /*
    The callback kept in a ref and written from an effect.

    The effect below owns a WebGL context and a frame loop, and the scene that
    passes `onWord` re-renders whenever anything in the room moves. Depending on
    it directly would tear the context down and build it again several times a
    second.
  */
  const said = useRef(onWord)
  useEffect(() => {
    said.current = onWord
  }, [onWord])

  // The same arrangement for the note, and for the same reason.
  const noted = useRef(onNote)
  useEffect(() => {
    noted.current = onNote
  }, [onNote])

  useEffect(() => {
    if (!live) return

    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return

    /*
      A mouse cannot draw while it is being used to look around, and in this
      room it usually is. Letting the lock stand would mean the first stroke
      landing wherever the camera happened to leave the cursor.
    */
    if (active && document.pointerLockElement) document.exitPointerLock()

    const neon = createNeon(canvas)
    if (!neon) return

    const size = () => {
      const box = parent.getBoundingClientRect()
      neon.resize(box.width, box.height, Math.min(window.devicePixelRatio || 1, 2))
    }
    size()
    const observer = new ResizeObserver(size)
    observer.observe(parent)

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let frame = requestAnimationFrame(function tick(now: number) {
      frame = requestAnimationFrame(tick)
      paintFrame(ink, neon, now, calm, keep)
    })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      neon.destroy()
      ink.strokes = []
      ink.burst = null
      ink.reader.reset()
    }
  }, [live, active, ink, keep])

  /**
   * The arrival itself, set off once the canvas it needs exists.
   *
   * Declared after the effect that builds the renderer, which is what makes
   * the canvas measurable here on the same commit the layer mounted on.
   */
  useEffect(() => {
    if (!shown || !incoming) return
    const canvas = canvasRef.current
    if (!canvas) return
    const box = canvas.getBoundingClientRect()
    ink.burst = borrowedBurst(incoming.word, box, performance.now())
    // `incoming` is a fresh object every render of the scene above; the
    // timestamp is the part that means anything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, ink])

  /**
   * The book, once, on the first time anybody here takes the pen out.
   *
   * A pen with no button on it is a feature nobody discovers, and a panel that
   * opens every time is one everybody learns to dismiss. Storage can be denied
   * outright in a locked-down browser, and this is not worth a crash: if the
   * remembering fails, the book simply opens again next time.
   */
  useEffect(() => {
    if (!active) return
    try {
      if (localStorage.getItem(SEEN)) return
      localStorage.setItem(SEEN, '1')
    } catch {
      return
    }
    setBook(true)
  }, [active])

  const point = useCallback((event: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }, [])

  if (!live) return null

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        // `touch-none` is what stops the browser scrolling the page instead of
        // giving us the drag, and z-10 is what keeps the thumb buttons above.
        // With the pen away this is a picture playing over the room, and it
        // must not eat the taps meant for the room.
        className={`absolute inset-0 z-10 h-full w-full touch-none ${
          active ? 'cursor-crosshair' : 'pointer-events-none'
        } ${className ?? ''}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          ink.hue = (ink.hue + 1) % PALETTE.length
          ink.strokes.push({
            points: [point(event)],
            times: [performance.now()],
            hue: PALETTE[ink.hue],
            drawing: true,
            mark: event.timeStamp,
          })
        }}
        onPointerMove={(event) => {
          const stroke = ink.strokes[ink.strokes.length - 1]
          if (!stroke?.drawing) return

          /*
            Coalesced events, where the browser has them: a phone delivers
            pointer moves at 60Hz while sampling the glass at 120 or 240, and
            the samples it held back are exactly the ones that make a curve a
            curve rather than a run of chords.

            Filtered by timestamp, and that filter is not a nicety. The first
            move of a stroke arrives carrying every sample since the *last*
            dispatched move - which, with a mouse, includes the travel from
            wherever the pointer was before the button went down. Taken whole,
            every stroke began with a line from the end of the previous one:
            two strokes of an X came out as one bent one and spelled nothing,
            which is exactly how the probe caught it.
          */
          const box = event.currentTarget.getBoundingClientRect()
          const now = performance.now()
          const many = (event.nativeEvent.getCoalescedEvents?.() ?? []).filter(
            (one) => one.timeStamp > stroke.mark,
          )
          stroke.mark = event.timeStamp

          if (many.length > 1) {
            for (const one of many) {
              stroke.points.push({ x: one.clientX - box.left, y: one.clientY - box.top })
              stroke.times.push(now)
            }
          } else {
            stroke.points.push(point(event))
            stroke.times.push(now)
          }
        }}
        onPointerUp={(event) => {
          const stroke = ink.strokes[ink.strokes.length - 1]
          if (stroke) stroke.drawing = false
          event.currentTarget.releasePointerCapture(event.pointerId)
          const word = finishStroke(ink, performance.now(), keep)
          if (word) said.current(word)
          if (!noted.current) return
          const box = event.currentTarget.getBoundingClientRect()
          noted.current(takeNote(ink, { width: box.width, height: box.height }))
        }}
        onPointerCancel={() => {
          const stroke = ink.strokes[ink.strokes.length - 1]
          if (stroke) stroke.drawing = false
        }}
      />

      {/*
        The hint is the book's own button.

        One control rather than two: the line that says what to draw is exactly
        where somebody looks when they do not know what to draw, so it is the
        thing to make pressable. It sits above the ink but is a small target in
        the middle of the top edge, which is nowhere anybody writes. Hidden
        while somebody else's word is playing over a room this player is not
        drawing in.
      */}
      {active && (
        <button
          type="button"
          onClick={() => setBook(true)}
          className="hud-ink-hint absolute left-1/2 top-[calc(var(--hud-edge-top)+0.25rem)] z-20 -translate-x-1/2"
        >
          {labels.hint}
        </button>
      )}

      {/* Who did that. Without it a room full of people flashing colours at
          each other is a room where nobody knows who to thank. */}
      {shown !== 0 && incoming?.from && (
        <p className="hud-ink-hint pointer-events-none absolute left-1/2 top-[calc(var(--hud-edge-top)+2.5rem)] z-20 -translate-x-1/2">
          {labels.from.replace('{name}', incoming.from)}
        </p>
      )}

      {book && <Spellbook labels={labels} spells={spells} onClose={() => setBook(false)} />}
    </>
  )
}
