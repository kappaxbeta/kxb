'use client'

import { useEffect, useRef } from 'react'

import { createNeon, type Neon } from '@/app/world/_ink/neon'
import { PALETTE } from '@/app/world/_ink/palette'
import type { Pt } from '@/app/world/_ink/points'
import type { Sample } from '@/app/world/_ink/samples'

/**
 * A word, drawing itself, in the same ink the pen writes with.
 *
 * A still picture of an X does not teach the thing that actually matters,
 * which is that it is *two strokes, one after the other* - and neither does a
 * sentence saying so, in a HUD nobody reads. So the book draws it: the stroke
 * appears at the speed a hand moves, the second follows, they hold for a beat
 * and fade, and it starts again.
 *
 * Same renderer as the pen, same palette, same taper. That is the point of
 * having taken the ink out into `neon.ts` - the demonstration cannot drift
 * from the thing it demonstrates, because there is only one of them.
 */

/** Seconds: how long one stroke takes, the beat after it, the hold, the fade. */
const DRAW = 0.6
const GAP = 0.15
const HOLD = 1.1
const FADE = 0.45

export function GlyphDemo({ sample, className }: { sample: Sample; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return

    const neon = createNeon(canvas)
    if (!neon) return

    let width = 0
    let height = 0
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const size = () => {
      const box = parent.getBoundingClientRect()
      width = box.width
      height = box.height
      neon.resize(width, height, Math.min(window.devicePixelRatio || 1, 2))
    }
    size()
    const observer = new ResizeObserver(() => {
      size()
      // A resize while nothing is animating would otherwise leave the last
      // frame stretched until the loop came round again - and under reduced
      // motion there is no loop to come round.
      if (calm) play(neon, sample, { width, height }, HOLD)
    })
    observer.observe(parent)

    if (calm) {
      // The finished word, held. Somebody who has asked their browser not to
      // animate things has not asked to be told less.
      play(neon, sample, { width, height }, sample.strokes.length * (DRAW + GAP))
      return () => {
        observer.disconnect()
        neon.destroy()
      }
    }

    const started = performance.now()
    const loop = sample.strokes.length * (DRAW + GAP) + HOLD + FADE
    let frame = requestAnimationFrame(function tick(now: number) {
      frame = requestAnimationFrame(tick)
      play(neon, sample, { width, height }, ((now - started) / 1000) % loop)
    })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      neon.destroy()
    }
  }, [sample])

  return (
    <div className={`relative shrink-0 ${className ?? ''}`}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
    </div>
  )
}

/** One frame of the loop, at `seconds` into it. */
function play(neon: Neon, sample: Sample, size: { width: number; height: number }, seconds: number) {
  neon.begin()
  if (size.width === 0 || size.height === 0) return

  /*
    Letterboxed rather than stretched. The samples are real handwriting in real
    coordinates (see `samples.ts`), and a circle squashed to fit a wide card is
    a demonstration of a shape the recogniser would refuse.
  */
  const scale = Math.min(size.width / sample.box.width, size.height / sample.box.height) * 0.86
  const left = (size.width - sample.box.width * scale) / 2
  const top = (size.height - sample.box.height * scale) / 2
  const place = (point: Pt): Pt => ({ x: left + point.x * scale, y: top + point.y * scale })

  const written = sample.strokes.length * (DRAW + GAP)
  const fading = Math.max(0, (seconds - written - HOLD) / FADE)
  const energy = Math.max(0, 1 - fading)
  if (energy === 0) return

  sample.strokes.forEach((stroke, index) => {
    const through = (seconds - index * (DRAW + GAP)) / DRAW
    if (through <= 0) return

    // The prefix of the stroke the hand has reached, which is the whole trick:
    // ink appears at the speed somebody would draw it.
    const upto = Math.max(2, Math.ceil(Math.min(through, 1) * stroke.length))
    const points = stroke.slice(0, upto).map(place)

    neon.draw({
      points,
      // No age: the book's ink does not rot while you are reading it.
      ages: points.map(() => 0),
      hue: PALETTE[(index + 1) % PALETTE.length],
      width: 2.2,
      energy,
      life: 1,
    })
  })
}
