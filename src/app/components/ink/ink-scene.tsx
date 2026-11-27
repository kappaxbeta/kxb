'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { InkControls } from '@/app/components/ink/ink-controls'
import { drawSchool } from '@/app/components/ink/ink-fish-draw'
import { createInk, paramsFor } from '@/app/components/ink/ink-gl'
import { drawFaces } from '@/app/components/ink/ink-face-draw'
import { drawJellies } from '@/app/components/ink/ink-jelly-draw'
import { drawTurtles } from '@/app/components/ink/ink-turtle-draw'
import { createLife, type Life } from '@/app/components/ink/ink-life'
import { palette } from '@/app/components/ink/ink-palettes'
import { DEFAULT_SETTINGS, type InkSettings } from '@/app/components/ink/ink-settings'
import { useMediaQuery } from '@/app/world/lounge/_hud/touch-controls'

/**
 * Red ink in black water, with something pale swimming through it.
 *
 * After a projection seen in a dark room: smoke-red clouds that never settle,
 * blooms that go off like ink dropped from a height and unfold into
 * jellyfish, and fish that swim through the middle of it trailing their own
 * colours. It is a fluid solver on the GPU (./ink-gl, shaders in ./ink-glsl)
 * fed by a handful of emitters (./ink-life; the fish in ./ink-fish, the
 * jellyfish in ./ink-jelly, the turtles in ./ink-turtle, the faces in
 * ./ink-face), with the creatures themselves drawn on a 2D canvas laid over
 * the water (./ink-fish-draw, ./ink-jelly-draw, ./ink-turtle-draw,
 * ./ink-face-draw). This file
 * is the two canvases, the clock, the pointer, and the panel that edits it
 * all (./ink-controls, editing ./ink-settings).
 *
 * Unlike the canyon this one *wants* to be touched, so the canvas takes
 * pointer events: a drag lays a pale ribbon, a tap sets off a red bloom. The
 * time step is clamped so a tab coming back from the background gets one
 * long-ish frame rather than one impossible one, which in a fluid solver is
 * the difference between a hiccup and an explosion.
 */

/** What a page holding this scene may ask it for. */
export type InkHandle = {
  /** Bring out every face that is away, now. */
  callFaces(): void
}

/** Slower than this and the solver takes two frames' worth in one step. */
const MAX_DT = 1 / 30
/** Retina at full density is four times the dye texels for a picture of smoke. */
const MAX_DPR = 1.5

/**
 * How many seconds the water runs before the first frame is shown.
 *
 * Without it the page opens black and fills over five seconds, which reads
 * as broken. With it the first frame is already a picture. A hundred-odd
 * steps of the solver is a fraction of a second on any GPU that runs the
 * rest of this app.
 */
const WARM = 6

export function InkScene({
  initial = DEFAULT_SETTINGS,
  warm = WARM,
  chrome = true,
  settings: controlled,
  onSettings,
  handleRef,
}: {
  initial?: InkSettings
  warm?: number
  /**
   * Whether this is the piece or a backdrop. The piece takes the pointer and
   * has the settings button; a backdrop behind a page does neither, because
   * the page in front of it owns the hand.
   */
  chrome?: boolean
  /**
   * A backdrop's settings, owned by the page in front of it, so that page
   * can draw the panel above its own content. Left out, the scene keeps its
   * own.
   */
  settings?: InkSettings
  onSettings?: (next: InkSettings) => void
  /**
   * Filled with the few things a page outside the scene can ask it to do.
   * A ref rather than a callback prop because the answers change when the
   * scene is rebuilt and nothing rendering should have to re-render for it.
   */
  handleRef?: RefObject<InkHandle | null>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const lifeRef = useRef<Life | null>(null)
  const tuneRef = useRef<((settings: InkSettings) => void) | null>(null)
  const [own, setOwn] = useState<InkSettings>(initial)
  const settings = controlled ?? own
  const setSettings = onSettings ?? setOwn
  const [panel, setPanel] = useState(false)
  // Bumped when the browser hands the context back after losing it - a GPU
  // reset, too many canvases - so the whole machine is built again.
  const [epoch, setEpoch] = useState(0)
  // Somebody who has asked for less motion gets the picture a few seconds in
  // and then held still: the blooms and ribbons are the motion, but the ink
  // lying there is still the art, and an empty black page is neither.
  const still = useMediaQuery('(prefers-reduced-motion: reduce)')

  // The settings reach the water through a ref rather than the effect's
  // dependencies: rebuilding the solver on every slider tick would black out
  // the picture, and everything reads them on its next frame anyway.
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
    lifeRef.current?.set(settings)
    tuneRef.current?.(settings)
  }, [settings])

  useEffect(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay) return

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const rect = canvas.getBoundingClientRect()
      canvas.width = overlay.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = overlay.height = Math.max(1, Math.round(rect.height * dpr))
    }
    fit()

    // A lost context is allowed to come back, and when it does the effect
    // runs again and builds everything fresh.
    const lost = (event: Event) => event.preventDefault()
    const restored = () => setEpoch((e) => e + 1)
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', restored)

    const ink = createInk(canvas)
    if (!ink) {
      return () => {
        canvas.removeEventListener('webglcontextlost', lost)
        canvas.removeEventListener('webglcontextrestored', restored)
      }
    }
    const life = createLife(ink, settingsRef.current)
    lifeRef.current = life
    if (handleRef) handleRef.current = { callFaces: () => life.faces().call() }
    // A handle for a debugger's console, in development only.
    if (process.env.NODE_ENV === 'development') (window as unknown as { __ink?: unknown }).__ink = { ink, life }
    const tune = (s: InkSettings) => {
      const colours = palette(s.mode)
      ink.tune(paramsFor(s.blob, colours.iris, colours.glow))
    }
    tune(settingsRef.current)
    tuneRef.current = tune
    const ctx = overlay.getContext('2d')

    const draw = () => {
      const s = settingsRef.current
      ink.draw(life.time())
      if (!ctx) return
      ctx.clearRect(0, 0, overlay.width, overlay.height)
      drawJellies(ctx, life.jellies().jellies(), s, overlay.width, overlay.height, life.time())
      drawTurtles(ctx, life.turtles().turtles(), s, overlay.width, overlay.height, life.time())
      drawSchool(ctx, life.school().fish(), s, overlay.width, overlay.height, life.time())
      // Last, and over everything: a face is a sign hung in front of the
      // water, not something swimming in it.
      drawFaces(ctx, life.faces().faces(), s, overlay.width, overlay.height, life.time())
    }

    let frame = 0
    let last = performance.now()

    // Warm up, and somebody who has asked for less motion gets held there.
    const steps = Math.round((still ? Math.max(warm, 6) : warm) * 30)
    for (let i = 0; i < steps; i++) {
      life.tick(1 / 30)
      ink.step(1 / 30)
    }
    if (still) {
      draw()
    } else {
      const loop = (now: number) => {
        const dt = Math.min(MAX_DT, (now - last) / 1000)
        last = now
        life.tick(dt)
        ink.step(dt)
        draw()
        frame = requestAnimationFrame(loop)
      }
      frame = requestAnimationFrame(loop)
    }

    // Resize loses the picture; the fume refills it within a couple of seconds
    // and that is cheaper than resampling four fields into new textures.
    const observer = new ResizeObserver(() => {
      fit()
      ink.resize()
      if (still) draw()
    })
    observer.observe(canvas)

    // Pointer: uv with y up, tracked per pointer so two fingers draw two lines.
    const pointers = new Map<number, { x: number; y: number; at: number; moved: number }>()
    const toUv = (event: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect()
      return [(event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height]
    }
    const down = (event: PointerEvent) => {
      const [x, y] = toUv(event)
      pointers.set(event.pointerId, { x, y, at: event.timeStamp, moved: 0 })
      canvas.setPointerCapture(event.pointerId)
    }
    const move = (event: PointerEvent) => {
      const p = pointers.get(event.pointerId)
      if (!p) return
      const [x, y] = toUv(event)
      const dt = (event.timeStamp - p.at) / 1000
      if (dt > 0) life.stroke(x, y, p.x, p.y, dt)
      p.moved += Math.hypot(x - p.x, y - p.y)
      p.x = x
      p.y = y
      p.at = event.timeStamp
    }
    const up = (event: PointerEvent) => {
      const p = pointers.get(event.pointerId)
      pointers.delete(event.pointerId)
      if (p && p.moved < 0.01) life.tap(p.x, p.y)
      if (still) {
        ink.step(1 / 60)
        draw()
      }
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', restored)
      lifeRef.current = null
      tuneRef.current = null
      if (handleRef) handleRef.current = null
      ink.dispose()
    }
  }, [still, warm, epoch, handleRef])

  return (
    <>
      <canvas
        ref={canvasRef}
        className={
          'absolute inset-0 h-full w-full select-none ' + (chrome ? 'touch-none' : 'pointer-events-none')
        }
        aria-label="Ink drifting in dark water with fish and jellyfish swimming in it. Drag to draw, tap to drop ink."
        role="img"
      />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
      {chrome ? (
        <InkControls
          settings={settings}
          onChange={setSettings}
          open={panel}
          onOpenChange={setPanel}
          onCallFaces={() => lifeRef.current?.faces().call()}
        />
      ) : null}
    </>
  )
}
