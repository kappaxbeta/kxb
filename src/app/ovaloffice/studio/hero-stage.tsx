'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { type HeroAssets, paintHero } from '@/app/ovaloffice/studio/hero-paint'
import { loadPixelFace } from '@/app/components/fonts/pixel-face'
import { heroBlocks, type StudioHero } from '@/domain/studio/hero'

/**
 * The hero's viewport.
 *
 * A canvas at the export's exact pixel size, scaled down by CSS to fit the
 * panel — so the preview is not a representation of the output, it is the
 * output, drawn smaller. See the long note at the top of `./hero-paint` about
 * why this is a canvas at all.
 *
 * The canvas element itself is handed up through `canvasRef` because the two
 * exports live in the editor's toolbar: the still reads `toDataURL` off it and
 * the clip hands it to `record`. Neither belongs in here, which only knows how
 * to draw.
 */

/** Loads one image, or resolves to nothing if it will not load. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    // Same-origin paths do not need it, but an absolute URL pasted into the
    // source field does: without it the canvas is tainted and `toDataURL`
    // throws a security error at the moment of export, which is the worst
    // possible time to find out.
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

/**
 * Everything the painter needs, fetched as the document asks for it.
 *
 * Cached across renders in a module-level map rather than in state: the block
 * renders never change, a reroll asks for a different eight of the same
 * nineteen, and re-fetching them on every seed change would make the drift
 * flicker on a slow connection.
 */
const blockCache = new Map<string, HTMLImageElement>()

export function useHeroAssets(hero: StudioHero): { assets: HeroAssets; ready: boolean } {
  const [, setVersion] = useState(0)
  const [fontReady, setFontReady] = useState(false)
  /**
   * The loaded picture, tagged with the source it came from.
   *
   * Tagged rather than cleared, because clearing is a `setState` in an effect
   * body — a cascading render, and the lint rule that forbids it is right: what
   * this actually wants to express is "the picture is stale until the one for
   * the current source arrives", which is a comparison, not a state change.
   */
  const [loaded, setLoaded] = useState<{ src: string; image: HTMLImageElement | null } | null>(null)
  /** The lockup, the same way and for the same reason. */
  const [mark, setMark] = useState<{ src: string; image: HTMLImageElement | null } | null>(null)

  const wanted = useMemo(
    () => Array.from(new Set(heroBlocks(hero).map((block) => block.model))),
    [hero],
  )
  const src = hero.image?.src ?? null
  const logoSrc = hero.logo?.src ?? null

  useEffect(() => {
    let live = true
    loadPixelFace().then(() => {
      if (live) setFontReady(true)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    let live = true
    const missing = wanted.filter((model) => !blockCache.has(model))
    if (missing.length === 0) return

    Promise.all(
      missing.map(async (model) => {
        const image = await loadImage(`/xo/blocks/${model}.png`)
        if (image) blockCache.set(model, image)
      }),
      // A bump rather than a state object: the cache is the state, and this
      // only exists to tell React that a frame drawn before now is stale.
    ).then(() => live && setVersion((v) => v + 1))

    return () => {
      live = false
    }
  }, [wanted])

  useEffect(() => {
    if (!src) return
    let live = true
    loadImage(src).then((image) => {
      if (live) setLoaded({ src, image })
    })
    return () => {
      live = false
    }
  }, [src])

  useEffect(() => {
    if (!logoSrc) return
    let live = true
    loadImage(logoSrc).then((image) => {
      if (live) setMark({ src: logoSrc, image })
    })
    return () => {
      live = false
    }
  }, [logoSrc])

  // Only the picture for the source the document asks for right now. A stale one
  // would otherwise be painted for a frame or two after the source changed,
  // which on a slow fetch is the old picture flashing under the new one's
  // position and size.
  const settled = src !== null && loaded?.src === src
  const picture = settled ? loaded.image : null
  const logoSettled = logoSrc !== null && mark?.src === logoSrc
  const logo = logoSettled ? mark.image : null

  const assets = useMemo<HeroAssets>(
    () => ({ blocks: blockCache, image: picture, logo }),
    // These two are the only references that change; the block cache is mutated
    // in place and `version` is what says it has.
    [picture, logo],
  )

  // Ready means "drawing now would not produce a frame that changes by itself":
  // the face has landed, every block asked for is in the cache, and both
  // pictures have either arrived or failed to. The export buttons wait on it.
  const ready =
    fontReady &&
    wanted.every((model) => blockCache.has(model)) &&
    (src === null || settled) &&
    (logoSrc === null || logoSettled)

  return { assets, ready }
}

/**
 * The viewport.
 *
 * Takes its assets rather than loading them, because the editor's two export
 * buttons paint their own frames — the still at `posterTime`, the clip on the
 * recorder's clock — and they need the same block renders this does. Loading
 * them in both places would mean two caches and a recording that can start
 * before the pictures the preview is already showing have arrived.
 */
export function HeroStage({
  hero,
  assets,
  playing,
  canvasRef,
}: {
  hero: StudioHero
  assets: HeroAssets
  /** Runs the clock. Off, the frame is held at `motion.posterTime`. */
  playing: boolean
  canvasRef: React.RefObject<HTMLCanvasElement | null>
}) {
  const frame = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    // The canvas is the export, at full size, every time. Scaling it for the
    // panel is the CSS below — a backing store sized to the panel would mean
    // composing at one resolution and delivering another.
    if (canvas.width !== hero.width) canvas.width = hero.width
    if (canvas.height !== hero.height) canvas.height = hero.height

    if (!playing) {
      // A held frame, drawn once. Not a paused animation loop: the panel is a
      // form and most of the time here is spent typing into it, so a canvas
      // repainting sixty times a second behind a text field is heat for nothing.
      paintHero(ctx, hero, assets, hero.motion.posterTime)
      return
    }

    const started = performance.now()
    const tick = () => {
      // Wrapped at the duration so the preview loops, which is how the clip
      // will actually be watched — an entrance that reads well once and badly
      // on the second pass is worth finding out about here.
      const t = ((performance.now() - started) / 1000) % hero.motion.duration
      paintHero(ctx, hero, assets, t)
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [hero, assets, playing, canvasRef])

  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-black"
      style={{ aspectRatio: `${hero.width} / ${hero.height}` }}
    >
      {/* `block` because a canvas is inline by default, and the descender space
          under an inline element is a strip of card showing below the frame. */}
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
