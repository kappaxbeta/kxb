'use client'

import { useRef, useState } from 'react'
import type { AnimationDoc } from '@/domain/animator/clip'
import { keyAt, snapTime } from '@/domain/animator/clip'

/**
 * The strip: time left to right, a diamond per key, a line where you are.
 *
 * The shape everybody already knows from a video editor, and chosen for exactly
 * that reason - the whole promise of this tool is that if you have ever trimmed
 * a clip you can already animate a walk. So: click anywhere to go there, drag
 * the line to scrub, drag a diamond to re-time the pose on it.
 *
 * The strip is the only place in the editor that reads a pointer in pixels.
 * Everything else works in seconds, and the conversion happens here against the
 * element's own rectangle, measured at the moment of the event - no resize
 * observer, no cached width to go stale behind a collapsing sidebar.
 */
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
  const strip = useRef<HTMLDivElement>(null)
  /** Which key is under the hand, by its current time. Null while scrubbing. */
  const [held, setHeld] = useState<number | null>(null)

  const at = (clientX: number): number => {
    const box = strip.current?.getBoundingClientRect()
    if (!box || box.width === 0) return 0
    const fraction = Math.min(Math.max((clientX - box.left) / box.width, 0), 1)
    return snapTime(fraction * doc.duration, doc.fps)
  }

  const percent = (seconds: number) => `${(seconds / doc.duration) * 100}%`

  // A tick a second, or every five when a minute would otherwise be sixty
  // lines two pixels apart.
  const step = doc.duration > 20 ? 5 : 1
  const ticks: number[] = []
  for (let second = 0; second <= doc.duration + 1e-6; second += step) ticks.push(second)

  const current = keyAt(doc, time)

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
        ref={strip}
        className="relative h-16 cursor-pointer touch-none rounded-xl border border-border bg-secondary/40"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          // A press on empty strip is a scrub; a press on a diamond has already
          // said which key it was via `held`, and stopped this from firing.
          if (held === null) onSeek(at(event.clientX))
        }}
        onPointerMove={(event) => {
          // No buttons down means this is a hover, not a drag. Checking the
          // button mask rather than a `dragging` flag means a pointer that was
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
          <div key={second} className="absolute top-0 bottom-0" style={{ left: percent(second) }}>
            <div className="h-full w-px bg-border/70" />
            <span className="absolute top-0.5 left-1 font-mono text-[10px] text-muted-foreground">
              {second}s
            </span>
          </div>
        ))}

        {/*
          The keys. Diamonds rather than the bars a video editor uses for clips,
          because a key is an instant and a bar reads as a duration - and the
          question people ask of this strip is "is there a key exactly here",
          which a point answers and a rectangle does not.
        */}
        {doc.keys.map((key) => {
          const here = Math.abs(key.time - time) < 0.5 / doc.fps
          return (
            <button
              key={key.time}
              type="button"
              aria-label={`Key at ${key.time.toFixed(2)} seconds, ${key.ease}`}
              className="absolute bottom-4 size-3.5 -translate-x-1/2 rotate-45 rounded-[3px] border transition-colors"
              style={{
                left: percent(key.time),
                borderColor: here ? 'var(--accent)' : 'var(--border)',
                background: here
                  ? 'var(--accent)'
                  : key.ease === 'hold'
                    ? 'var(--muted-foreground)'
                    : 'var(--secondary)',
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                // The strip below would start a scrub on the same press, and a
                // scrub sets `held` to null - so the drag has to be claimed
                // here before it bubbles.
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
          style={{ left: percent(Math.min(time, doc.duration)) }}
        >
          <div className="absolute -top-px -left-[3px] size-[7px] rounded-full bg-accent" />
        </div>
      </div>
    </div>
  )
}
