'use client'

import { useEffect, useRef } from 'react'

import { createNeon, type Neon } from '@/app/world/_ink/neon'

/**
 * A canvas that fills its parent, with the ink renderer on it and a frame loop
 * winding a clock.
 *
 * The lifecycle is the same three lines in every place that draws ink - make a
 * context, watch the box for a resize, run a loop and tear all of it down - and
 * getting one of them wrong is a blank canvas with no error anywhere. So it
 * lives once, here, and the two components that only need to *draw* something
 * (the spellbook's demonstrations and a saved note) say what to draw and
 * nothing else.
 *
 * The pen itself does not use this. `<InkLayer>` has to own its loop for other
 * reasons - it releases the pointer lock, it drops the strokes on the way out,
 * and its cleanup has to leave the reader empty - and a hook with three flags on
 * it to cover that would be worse than the twenty lines it saved.
 *
 * `still` draws exactly one frame and stops, which is what somebody who asked
 * their browser not to animate things gets: the finished picture, held.
 */
export function useNeon(
  paint: (neon: Neon, seconds: number, size: { width: number; height: number }) => void,
  still = false,
): React.RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  /*
    The painter through a ref, written from an effect.

    It is a closure over the component's props and so a new function every
    render; depending on it would build a new WebGL context several times a
    second on any page whose state moves.
  */
  const painter = useRef(paint)
  useEffect(() => {
    painter.current = paint
  }, [paint])

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return

    const neon = createNeon(canvas)
    if (!neon) return

    let width = 0
    let height = 0
    const size = () => {
      const box = parent.getBoundingClientRect()
      width = box.width
      height = box.height
      neon.resize(width, height, Math.min(window.devicePixelRatio || 1, 2))
    }
    size()

    const draw = (seconds: number) => painter.current(neon, seconds, { width, height })

    // A resize while nothing is animating would otherwise leave the last frame
    // stretched until something else happened - and when `still`, nothing else
    // ever does.
    const observer = new ResizeObserver(() => {
      size()
      if (still) draw(0)
    })
    observer.observe(parent)

    if (still) {
      draw(0)
      return () => {
        observer.disconnect()
        neon.destroy()
      }
    }

    const started = performance.now()
    let frame = requestAnimationFrame(function tick(now: number) {
      frame = requestAnimationFrame(tick)
      draw((now - started) / 1000)
    })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      neon.destroy()
    }
  }, [still])

  return canvasRef
}
