'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AnimationDoc, Keyframe } from '@/domain/animator/clip'
import { keyAt, snapTime } from '@/domain/animator/clip'

/**
 * The strip: time left to right, a diamond per key, a line where you are.
 *
 * The shape everybody already knows from a video editor, and chosen for exactly
 * that reason - the whole promise of this tool is that if you have ever trimmed
 * a clip you can already animate a walk. So: click anywhere to go there, drag
 * the line to scrub, drag a diamond to re-time the pose on it.
 *
 * ---------------------------------------------------------------------------
 * It zooms now, and that changed what "time to pixels" means
 * ---------------------------------------------------------------------------
 * It used to be one fixed strip: a key at 1.5s of a 4s clip sat at 37.5% and
 * the arithmetic was a percentage. That works until two poses are a frame
 * apart, at which point their diamonds are drawn on top of each other and
 * neither can be grabbed.
 *
 * So the strip has a **scale** - pixels per second - and scrolls. The content
 * is `duration * scale` wide inside a box that is whatever the panel is, which
 * makes "zoom in" and "make the strip longer" the same operation, and makes
 * every conversion below `seconds * scale` rather than a fraction of a
 * measured width.
 *
 * The trackpad drives it the way every other canvas on the web is driven:
 * **two fingers pan, pinch zooms.** Those arrive as the same `wheel` event and
 * are told apart by `ctrlKey`, which the browser sets for a pinch and for
 * nothing else. It is not a gesture we invented - it is the one the operating
 * system already sends, which is why it needs no affordance to discover.
 *
 * ---------------------------------------------------------------------------
 * And when they still overlap, they stack
 * ---------------------------------------------------------------------------
 * Zoom moves the problem rather than solving it: any two keys are one zoom
 * level away from touching, and somebody looking at a whole clip is zoomed out
 * on purpose. So `lanesFor` puts a key that would land on top of its neighbour
 * on a second row - see the note there for why this is greedy rather than
 * optimal.
 */

/** How wide a diamond is, and therefore how close two may be before stacking. */
const DIAMOND = 14

/** Pixels per second. The floor fits a minute on a phone; the ceiling is a frame you can hit. */
const MIN_SCALE = 8
const MAX_SCALE = 1200

/**
 * Which row each key is drawn on.
 *
 * Greedy, left to right: a key goes on the first row whose last diamond it
 * clears, and starts a new row when it clears none. That is not the fewest
 * possible rows for a given set of keys - the optimal packing is a graph
 * colouring - and it is the right algorithm anyway, because it has the
 * property the optimal one does not: **a key never moves rows because of a key
 * to its right.** Adding a pose at the end of a clip must not reshuffle the
 * whole strip under somebody's cursor.
 */
function lanesFor(keys: Keyframe[], scale: number): number[] {
  const lastX: number[] = []
  return keys.map((key) => {
    const x = key.time * scale
    const lane = lastX.findIndex((taken) => x - taken >= DIAMOND + 2)
    if (lane === -1) {
      lastX.push(x)
      return lastX.length - 1
    }
    lastX[lane] = x
    return lane
  })
}

export function Timeline({
  doc,
  time,
  onSeek,
  onMoveKey,
}: {
  doc: AnimationDoc
  time: number
  onSeek: (time: number) => void
  /** A diamond dropped somewhere else. Both times are already snapped. */
  onMoveKey: (from: number, to: number) => void
}) {
  /** The scroller, which owns the visible window. */
  const box = useRef<HTMLDivElement>(null)
  /** The strip inside it, which is `duration * scale` wide. */
  const strip = useRef<HTMLDivElement>(null)
  /** Which key is under the hand, by its current time. Null while scrubbing. */
  const [held, setHeld] = useState<number | null>(null)
  const [scale, setScale] = useState<number | null>(null)

  // Null until the panel has been measured once, then whatever the person has
  // zoomed to. Starting at "the whole clip fits" is the only sensible opening
  // view, and it cannot be computed before there is a box to measure.
  useLayoutEffect(() => {
    if (scale !== null) return
    const width = box.current?.clientWidth ?? 0
    if (width > 0) setScale(clamp(width / Math.max(doc.duration, 0.001)))
  }, [scale, doc.duration])

  const px = scale ?? MIN_SCALE

  /**
   * Pan and pinch.
   *
   * A `useEffect` with `{ passive: false }` rather than an `onWheel` prop,
   * because React attaches wheel listeners as passive and a passive listener
   * may not call `preventDefault` - which is the whole job here. Without it a
   * pinch zooms the *page*, and a horizontal pan navigates back.
   */
  useEffect(() => {
    const node = box.current
    if (!node) return

    function onWheel(event: WheelEvent) {
      const node = box.current
      if (!node) return

      // ctrlKey on a wheel event means a pinch. The browser synthesises it;
      // no real Ctrl key is involved, and no other gesture sets it.
      if (event.ctrlKey) {
        event.preventDefault()
        setScale((current) => {
          const from = current ?? MIN_SCALE
          // Exponential, so a pinch feels the same at every zoom level - a
          // linear step crawls when zoomed out and jumps when zoomed in.
          const to = clamp(from * Math.exp(-event.deltaY / 180))

          // Keep whatever is under the fingers under the fingers. Without this
          // the strip zooms toward its own left edge and the thing being
          // looked at slides away.
          const anchor = event.clientX - node.getBoundingClientRect().left
          const seconds = (node.scrollLeft + anchor) / from
          requestAnimationFrame(() => {
            node.scrollLeft = seconds * to - anchor
          })
          return to
        })
        return
      }

      // A two-finger pan. Horizontal on a trackpad arrives as deltaX; a mouse
      // wheel only has deltaY, so it is taken as scroll too rather than
      // leaving a plain wheel doing nothing over the strip.
      const by = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (by === 0) return
      event.preventDefault()
      node.scrollLeft += by
    }

    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [])

  /** Where a pointer is, in seconds - against the strip, which scrolls. */
  const at = (clientX: number): number => {
    const rect = strip.current?.getBoundingClientRect()
    if (!rect) return 0
    const seconds = (clientX - rect.left) / px
    return snapTime(Math.min(Math.max(seconds, 0), doc.duration), doc.fps)
  }

  // A tick every second, or every fifth/tenth when a second would be a line
  // two pixels from the last one. Driven by the scale rather than by the
  // duration, because that is what actually decides whether they fit.
  const step = px > 60 ? 1 : px > 22 ? 5 : 10
  const ticks: number[] = []
  for (let second = 0; second <= doc.duration + 1e-6; second += step) ticks.push(second)

  const current = keyAt(doc, time)
  const lanes = lanesFor(doc.keys, px)
  const rows = Math.max(1, ...lanes.map((lane) => lane + 1))

  return (
    <div className="select-none">
      <div className="mb-1 flex items-baseline justify-between font-mono text-[10px] text-muted-foreground">
        <span>
          {time.toFixed(2)}s · frame {Math.round(time * doc.fps)}
          {current >= 0 && <span className="ml-1.5 text-accent">on a key</span>}
        </span>
        <span>
          {doc.keys.length} {doc.keys.length === 1 ? 'key' : 'keys'} · {doc.duration.toFixed(2)}s ·{' '}
          {doc.fps}fps
        </span>
      </div>

      <div
        ref={box}
        /* `overscroll-contain` so panning off the end of the strip does not
           start scrolling the page behind it - which on a trackpad is the
           difference between a strip you can pan and one that fights you. */
        className="overflow-x-auto overscroll-contain rounded-xl border border-border bg-secondary/40"
      >
        <div
          ref={strip}
          style={{
            width: Math.max(doc.duration * px, 1),
            // Room for the ruler, the rows of diamonds, and a little air.
            height: 30 + rows * (DIAMOND + 4),
          }}
          className="relative cursor-pointer touch-none"
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            // A press on empty strip is a scrub; a press on a diamond has
            // already said which key it was via `held`, and stopped this.
            if (held === null) onSeek(at(event.clientX))
          }}
          onPointerMove={(event) => {
            // No buttons down means this is a hover, not a drag. Checking the
            // button mask rather than a `dragging` flag means a pointer
            // released off-screen cannot leave the strip stuck in scrub mode.
            if (event.buttons !== 1) return
            const to = at(event.clientX)
            if (held !== null) {
              if (to !== held) {
                onMoveKey(held, to)
                setHeld(to)
              }
            } else {
              onSeek(to)
            }
          }}
          onPointerUp={() => setHeld(null)}
          onPointerCancel={() => setHeld(null)}
        >
          {ticks.map((second) => (
            <div key={second} className="absolute top-0 bottom-0" style={{ left: second * px }}>
              <div className="h-full w-px bg-border/70" />
              <span className="absolute top-0.5 left-1 font-mono text-[10px] text-muted-foreground">
                {second}s
              </span>
            </div>
          ))}

          {/*
            The keys. Diamonds rather than the bars a video editor uses for
            clips, because a key is an instant and a bar reads as a duration -
            and the question people ask of this strip is "is there a key
            exactly here", which a point answers and a rectangle does not.
          */}
          {doc.keys.map((key, index) => {
            const here = Math.abs(key.time - time) < 0.5 / doc.fps
            return (
              <button
                key={key.time}
                type="button"
                aria-label={`Key at ${key.time.toFixed(2)} seconds, ${key.ease}`}
                className="absolute size-3.5 -translate-x-1/2 rotate-45 rounded-[3px] border transition-colors"
                style={{
                  left: key.time * px,
                  // Stacked upward from the bottom, so the first row stays
                  // where it has always been and a clip that never overlaps
                  // looks exactly as it did before rows existed.
                  bottom: 6 + lanes[index] * (DIAMOND + 4),
                  borderColor: here ? 'var(--accent)' : 'var(--border)',
                  background: here
                    ? 'var(--accent)'
                    : key.ease === 'hold'
                      ? 'var(--muted-foreground)'
                      : 'var(--secondary)',
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  // The strip below would start a scrub on the same press, and
                  // a scrub sets `held` to null - so the drag has to be
                  // claimed here before it bubbles.
                  event.stopPropagation()
                  event.currentTarget.releasePointerCapture?.(event.pointerId)
                  strip.current?.setPointerCapture(event.pointerId)
                  setHeld(key.time)
                  onSeek(key.time)
                }}
              />
            )
          })}

          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-accent"
            style={{ left: Math.min(time, doc.duration) * px }}
          >
            <div className="absolute -top-px -left-[3px] size-[7px] rounded-full bg-accent" />
          </div>
        </div>
      </div>
    </div>
  )
}

function clamp(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}
