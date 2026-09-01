'use client'

import { useEffect, useRef } from 'react'

/**
 * The rain that runs over the room while you change body.
 *
 * ---------------------------------------------------------------------------
 * Why a 2D canvas over the scene rather than anything in the scene
 * ---------------------------------------------------------------------------
 * The swap is a *cut*, not an event in the world: one body is replaced by
 * another between two frames, with no motion in between to watch. Something
 * has to cover that cut, and the cheapest thing that can is a flat layer over
 * the top - a DOM canvas costs the room no draw calls, no material, and no
 * re-render of the R3F tree, which is the one thing that must not happen while
 * a body is being swapped underneath it.
 *
 * It also means the effect cannot break the room. The worst a bug in here can
 * do is paint the wrong pixels on a layer that removes itself a second later.
 *
 * ---------------------------------------------------------------------------
 * Matrix rain, in the palette this product already owns
 * ---------------------------------------------------------------------------
 * Columns of digits falling at their own speeds, the head glyph bright and the
 * trail dimming behind it, each column swapping the glyph under the head as it
 * goes - which is the whole of the effect, and the part people actually
 * recognise is the *swapping*, not the falling. Green would be the quotation;
 * the hue instead runs the rainbow across the columns and drifts while it
 * plays, because a rainbow is what this room already does when it celebrates
 * (see the party rail and `.rail-things` open) and a green screen in here
 * would read as a different product's effect pasted in.
 *
 * The trail is drawn the way it has always been drawn: rather than tracking a
 * tail per column, each frame paints a translucent black sheet over everything
 * already there, so old glyphs fade on their own. That is one fill per frame
 * instead of a few hundred, and it is why this runs at a flat frame cost no
 * matter how many columns the window is wide enough for.
 *
 * An envelope fades the whole layer up and back down, so the rain arrives and
 * leaves rather than being switched on and off; `onDone` fires at the end and
 * the caller unmounts. Nothing here reads the world, so a swap that fails to
 * save still gets its animation - the rain is about the gesture, not the
 * outcome, and a rollback is a second swap that plays it again.
 */

/** Digits only. "Numbers" is what was asked for, and a glyph set with letters
 * in it stops reading as a readout and starts reading as noise. */
const GLYPHS = '0123456789'

/** Long enough to register as an effect, short enough that nobody switching
 * twice has to sit through it. */
const RUN_MS = 1100

/** One column per this many CSS pixels. Tuned so a phone still gets ~25
 * columns, which is the fewest that still reads as rain rather than as lines. */
const COLUMN_PX = 15

interface Column {
  /** Where the head is, in rows. Fractional - it moves by fractions of a row. */
  head: number
  /** Rows per second. */
  speed: number
  /** The glyphs above the head, newest first. */
  trail: string[]
}

const pick = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]

export function BodySwap({ seed, onDone }: { seed: number; onDone: () => void }) {
  const box = useRef<HTMLCanvasElement | null>(null)
  /* The callback in a ref: it is almost always a fresh arrow function from the
   * caller's render, and listing it in the effect below would restart the rain
   * every time the scene re-renders - which, in a room, is constantly. Written
   * in its own effect rather than during render, which is both the rule and the
   * reason for it: a render that is thrown away must not leave the ref pointing
   * at a callback that render's tree never got. */
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])

  useEffect(() => {
    const canvas = box.current
    if (!canvas) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const context = canvas.getContext('2d')
    if (!context) {
      // No 2D context is not a reason to strand the caller in "swapping".
      done.current()
      return
    }

    /* Capped at 2: this is a full-screen layer of translucent fills over a room
     * that is already fill-rate bound (see the lounge's own notes), and the
     * third device pixel buys nothing on glyphs this small. */
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = Math.max(1, Math.floor(width * dpr))
    canvas.height = Math.max(1, Math.floor(height * dpr))
    context.scale(dpr, dpr)

    const size = 13
    const rows = Math.ceil(height / size) + 1
    const columns: Column[] = Array.from(
      { length: Math.max(1, Math.ceil(width / COLUMN_PX)) },
      () => {
        /**
         * Seeded mid-fall, with the trail it would have grown getting there.
         *
         * Every column used to start above the top, which is the obvious way to
         * write it and is wrong for an effect this short: measured, a third of
         * the run had gone before the first heads reached the middle of the
         * screen, so the rain arrived just in time to leave. Most columns now
         * start on screen and carry a trail already, and the ones seeded above
         * the top are what keeps it from looking like a single planted frame.
         */
        const head = Math.random() * rows * 1.6 - rows * 0.6
        const grown = Math.min(rows, Math.max(0, Math.floor(head)))
        return {
          head,
          speed: rows * (0.9 + Math.random() * 1.4),
          trail: Array.from({ length: grown }, pick),
        }
      },
    )

    context.textBaseline = 'top'
    context.font = `600 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`

    let raf = 0
    let start = 0
    let last = 0

    const frame = (now: number) => {
      if (!start) {
        start = now
        last = now
      }
      const t = Math.min(1, (now - start) / RUN_MS)
      const step = Math.min(0.05, (now - last) / 1000)
      last = now

      /**
       * Up fast, down slow: the rain has to be there before the body changes
       * underneath it, and it has to leave gently enough that the new body is
       * revealed rather than uncovered. The cut happens under the peak.
       */
      const envelope = t < 0.18 ? t / 0.18 : 1 - (t - 0.18) / 0.82

      canvas.style.opacity = String(Math.max(0, envelope))

      /* The trail, and the only clear this loop does: a sheet of near-black at
       * low alpha, which fades everything already painted by a fixed fraction
       * per frame. */
      context.fillStyle = 'rgba(2, 0, 11, 0.28)'
      context.fillRect(0, 0, width, height)

      columns.forEach((column, index) => {
        /* The rainbow runs across the columns and drifts as it plays, so the
         * band of colour travels sideways while the glyphs fall - two clocks,
         * the same trick the party rail uses. */
        const hue = ((index / columns.length) * 360 + t * 220) % 360

        const was = Math.floor(column.head)
        column.head += column.speed * step
        const rowsCrossed = Math.floor(column.head) - was

        for (let i = 0; i < rowsCrossed; i++) {
          column.trail.unshift(pick())
          // A trail longer than the screen is glyphs nobody can see.
          if (column.trail.length > rows) column.trail.pop()
        }

        const x = index * COLUMN_PX

        column.trail.forEach((glyph, depth) => {
          const y = (Math.floor(column.head) - depth) * size
          if (y < -size || y > height) return
          /* The head is white and the trail is the hue, dimming with depth -
           * the head reads as the thing that is happening and the trail as
           * where it has been. */
          const fade = 1 - depth / column.trail.length
          context.fillStyle =
            depth === 0
              ? 'rgba(255, 255, 255, 0.95)'
              : `oklch(0.78 0.2 ${hue.toFixed(0)} / ${(fade * 0.85).toFixed(3)})`
          context.fillText(glyph, x, y)
        })
      })

      if (t >= 1) {
        done.current()
        return
      }
      raf = requestAnimationFrame(frame)
    }

    if (reduced) {
      /**
       * Reduced motion gets the colour and none of the movement: one still
       * band of glyphs, fading. Somebody who asked for no motion still asked
       * to be told the body changed - an effect that simply does not happen is
       * a swap with no feedback at all.
       */
      context.fillStyle = 'rgba(2, 0, 11, 0.55)'
      context.fillRect(0, 0, width, height)
      columns.forEach((column, index) => {
        const hue = (index / columns.length) * 360
        context.fillStyle = `oklch(0.78 0.2 ${hue.toFixed(0)} / 0.7)`
        context.fillText(pick(), index * COLUMN_PX, height / 2 - size / 2)
      })
      canvas.style.opacity = '1'
      canvas.style.transition = `opacity ${RUN_MS}ms linear`
      // Next frame, so the transition has a value to move away from.
      const off = requestAnimationFrame(() => {
        canvas.style.opacity = '0'
      })
      const timer = window.setTimeout(() => done.current(), RUN_MS)
      return () => {
        cancelAnimationFrame(off)
        window.clearTimeout(timer)
      }
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [seed])

  return (
    <canvas
      ref={box}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
      style={{ opacity: 0 }}
    />
  )
}
