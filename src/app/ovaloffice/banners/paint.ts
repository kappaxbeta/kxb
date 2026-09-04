'use client'

import { DEVICES, slotRects, type BannerSpec, type CaptureFit } from '@/domain/banners'
import { loadBannerFonts, pixelFamily, SANS } from '@/app/ovaloffice/banners/fonts'
import { layoutRuns, wrapText, type Run } from '@/app/ovaloffice/banners/wrap'

/**
 * One banner, drawn onto a canvas at full App Store size.
 *
 * This is the only renderer. The preview on screen is this canvas scaled down
 * by CSS, and the PNG that gets uploaded is this canvas read back - so there is
 * no second layout that can drift from the first, which is the failure every
 * "what you see is roughly what you get" export tool has.
 *
 * Drawing order is back to front and it matters twice: the loose voxels go
 * under the scrim so they can never sit on the body copy, and the slot frames
 * go over everything so a corner tick is never half-covered by a block.
 */

/* The palette, resolved out of oklch and into something a canvas will take.
 * `globals.css` is the original of these six; they are duplicated rather than
 * read back because a canvas cannot resolve a CSS variable, and a colour that
 * silently becomes black is worse than one written down twice. */
const SURFACE = '#0d0819'
const INK = '#f6f2fb'
const INK_MUTED = '#b9aed6'
const LINE = 'rgba(139,124,214,0.6)'
const ACCENT = '#f43ce0'
const ACCENT_2 = '#5ce8e0'

const images = new Map<string, HTMLImageElement>()

async function image(src: string): Promise<HTMLImageElement> {
  const cached = images.get(src)
  if (cached?.complete) return cached
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  await img.decode().catch(() => undefined)
  images.set(src, img)
  return img
}

/**
 * A well-spread number in [0,1) from a seed and an index.
 *
 * Not `rng(seed + i)()`. The generator below is a plain LCG, and the *first*
 * value it yields for two nearby seeds is nearly the same number - so seeding
 * per frame that way gave three frames a tilt of 0.9°, 1.1° and 1.3°, all the
 * same direction, which reads as "not tilted" rather than as an arrangement.
 * Mixing the bits first is what makes consecutive indices unrelated.
 */
function jitter(seed: number, index: number): number {
  let h = (seed ^ (index * 0x9e3779b9)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Seeded, so the same panel scatters the same way every redraw. */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** Draw an image into a box the way `object-fit: contain` would. */
function contain(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  x: number, y: number, w: number, h: number, align: 'center' | 'right-bottom' = 'center',
) {
  if (!img.naturalWidth) return
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  const dx = align === 'right-bottom' ? x + w - dw : x + (w - dw) / 2
  const dy = align === 'right-bottom' ? y + h - dh : y + (h - dh) / 2
  ctx.drawImage(img, dx, dy, dw, dh)
}

/**
 * Draw a capture into its frame, centred, at whichever of the four scales was
 * asked for.
 *
 * Always centred: a crop that keeps the middle is the one that keeps the
 * subject, because whoever framed the screenshot framed it in the middle.
 */
function fitBounds(
  img: HTMLImageElement, fit: CaptureFit,
  x: number, y: number, w: number, h: number,
): Box {
  const sx = w / img.naturalWidth
  const sy = h / img.naturalHeight
  const scale = fit === 'contain' ? Math.min(sx, sy)
    : fit === 'height' ? sy
    : fit === 'width' ? sx
    : Math.max(sx, sy)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh }
}

interface Box { x: number; y: number; w: number; h: number }

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/**
 * The headline shrinks until it fits the band reserved for it.
 *
 * Measured rather than estimated, because the two pixel faces have different
 * advance widths and a guess that works for English quietly overflows in
 * Bulgarian - which is exactly the panel nobody proofreads.
 */
function fitHeadline(
  ctx: CanvasRenderingContext2D, family: string, runs: Run[], maxWidth: number, budget: number, max: number,
) {
  for (let size = max; size > 38; size -= 2) {
    ctx.font = `700 ${size}px ${family}`
    const lines = layoutRuns((t) => ctx.measureText(t).width, runs, maxWidth)
    if (lines.length * size * 1.16 <= budget) return { size, lines }
  }
  ctx.font = `700 38px ${family}`
  return { size: 38, lines: layoutRuns((t) => ctx.measureText(t).width, runs, maxWidth) }
}

export async function paintBanner(canvas: HTMLCanvasElement, spec: BannerSpec): Promise<void> {
  await loadBannerFonts()
  const d = DEVICES[spec.device]
  const pixel = pixelFamily(spec.locale)

  canvas.width = d.w
  canvas.height = d.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const rects = slotRects(spec.device, spec.slots, spec.slotLabels, spec.slotLayout)
  const content = d.w - d.padX * 2

  // ---------------------------------------------------------------- the sky
  ctx.fillStyle = SURFACE
  ctx.fillRect(0, 0, d.w, d.h)
  const blooms: [number, number, number, string][] = [
    [d.w * 0.1, d.h * 0.03, d.w * 1.18, 'rgba(244,60,224,0.32)'],
    [d.w * 0.94, d.h * 0.22, d.w * 1.0, 'rgba(92,232,224,0.24)'],
    [d.w * 0.5, d.h * 1.03, d.w * 1.3, 'rgba(244,60,224,0.22)'],
  ]
  for (const [x, y, r, colour] of blooms) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, colour)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, d.w, d.h)
  }

  // The floor of the world seen edge on, faded out at the rim so it reads as a
  // texture rather than as a table.
  const grid = document.createElement('canvas')
  grid.width = d.w
  grid.height = d.h
  const gctx = grid.getContext('2d')
  if (gctx) {
    gctx.strokeStyle = 'rgba(139,124,214,0.14)'
    gctx.lineWidth = 2
    const step = Math.round(d.w / 10)
    gctx.beginPath()
    for (let x = 0; x <= d.w; x += step) { gctx.moveTo(x, 0); gctx.lineTo(x, d.h) }
    for (let y = 0; y <= d.h; y += step) { gctx.moveTo(0, y); gctx.lineTo(d.w, y) }
    gctx.stroke()
    const mask = gctx.createRadialGradient(d.w / 2, d.h * 0.4, 0, d.w / 2, d.h * 0.4, d.w * 0.78)
    mask.addColorStop(0.24, 'rgba(0,0,0,1)')
    mask.addColorStop(1, 'rgba(0,0,0,0)')
    gctx.globalCompositeOperation = 'destination-in'
    gctx.fillStyle = mask
    gctx.fillRect(0, 0, d.w, d.h)
    ctx.drawImage(grid, 0, 0)
  }

  // ------------------------------------------------------- the loose voxels
  const r = rng(spec.seed)
  const S = rects[0]
  const last = rects[rects.length - 1]
  const band = await Promise.all(spec.band.map(image))
  for (let i = 0; i < 30 && band.length; i++) {
    const size = 90 + r() * 170
    const x = r() * (d.w - size)
    const y = r() * (d.h - size)
    // Never over a slot: a block half under a pasted screenshot reads as a
    // mistake rather than as depth.
    if (x + size > S.x - 20 && x < S.x + S.w + 20 && y + size > S.y - 20 && y < last.y + last.h + 20) continue
    ctx.save()
    ctx.globalAlpha = 0.1 + r() * 0.14
    ctx.filter = `blur(${(1.4 + r() * 2.2).toFixed(1)}px)`
    ctx.translate(x + size / 2, y + size / 2)
    ctx.rotate((r() - 0.5) * 0.8)
    contain(ctx, band[i % band.length], -size / 2, -size / 2, size, size)
    ctx.restore()
  }

  // -------------------------------------------------------------- the mark
  const logo = await image('/logo.png')
  const logoW = logo.naturalWidth ? (logo.naturalWidth / logo.naturalHeight) * d.logoH : d.logoH
  ctx.save()
  ctx.shadowColor = 'rgba(92,232,224,0.8)'
  ctx.shadowBlur = 28
  contain(ctx, logo, d.padX, d.headTop, logoW, d.logoH)
  ctx.restore()

  const chipSize = Math.round(d.tagSize * 0.7)
  ctx.font = `700 ${chipSize}px ${pixel}`
  ctx.textBaseline = 'middle'
  const chipText = 'kxb.team'
  const chipW = ctx.measureText(chipText).width + chipSize * 1.8
  const chipX = d.padX + logoW + Math.round(d.logoH * 0.22)
  const chipY = d.headTop + d.logoH / 2
  ctx.strokeStyle = 'rgba(92,232,224,0.5)'
  ctx.lineWidth = 2
  roundRect(ctx, chipX, chipY - chipSize, chipW, chipSize * 2, chipSize)
  ctx.stroke()
  ctx.fillStyle = ACCENT_2
  ctx.fillText(chipText, chipX + chipSize * 0.9, chipY + 2)

  // ----------------------------------------------------------- the headline
  const runs: Run[] = [
    { text: spec.copy.funny, color: INK },
    { text: `| ${spec.tagline}`, color: ACCENT, nowrap: true },
  ]
  const fitted = fitHeadline(ctx, pixel, runs, content, d.headReserve - d.headlineTop, d.headlineSize)
  ctx.font = `700 ${fitted.size}px ${pixel}`
  ctx.textBaseline = 'top'
  fitted.lines.forEach((line, i) => {
    const y = d.headlineTop + i * fitted.size * 1.16
    for (const word of line) {
      ctx.save()
      ctx.shadowColor = word.color === ACCENT ? 'rgba(244,60,224,0.9)' : 'rgba(92,232,224,0.32)'
      ctx.shadowBlur = word.color === ACCENT ? 44 : 34
      ctx.fillStyle = word.color
      ctx.fillText(word.text, d.padX + word.x, y)
      ctx.restore()
    }
  })

  // ---------------------------------------------------- the hero and the cast
  ctx.save()
  ctx.shadowColor = 'rgba(13,8,25,0.8)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 18
  contain(ctx, await image(spec.hero), d.padX, d.charY + d.charH - d.heroSize, d.heroSize, d.heroSize)
  ctx.restore()

  ctx.save()
  ctx.shadowColor = 'rgba(13,8,25,0.85)'
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 26
  const castW = content * d.charW
  contain(ctx, await image(spec.character), d.w - d.padX - castW, d.charY, castW, d.charH, 'right-bottom')
  ctx.restore()

  // ------------------------------------------------------------- the glints
  if (spec.sparkles) {
    const sr = rng(spec.seed ^ 0x5bf03635)
    for (let i = 0; i < 46; i++) {
      const x = sr() * d.w
      // Only over the top half, where the cast is. A glint down among the body
      // copy is a smudge on the type rather than a spark in the air.
      const y = d.headTop + sr() * (d.slot.y - d.headTop - 20)
      const r = 4 + sr() * 16
      const colour = sr() < 0.45 ? ACCENT_2 : sr() < 0.6 ? ACCENT : '#ffffff'
      ctx.save()
      ctx.globalAlpha = 0.35 + sr() * 0.5
      ctx.translate(x, y)
      ctx.rotate(sr() * Math.PI)
      ctx.fillStyle = colour
      ctx.shadowColor = colour
      ctx.shadowBlur = r * 2.4
      // A four-pointed glint: two crossed spindles, which is what a sparkle
      // reads as at this size. A circle just reads as dust.
      ctx.beginPath()
      ctx.moveTo(0, -r)
      ctx.quadraticCurveTo(r * 0.16, -r * 0.16, r, 0)
      ctx.quadraticCurveTo(r * 0.16, r * 0.16, 0, r)
      ctx.quadraticCurveTo(-r * 0.16, r * 0.16, -r, 0)
      ctx.quadraticCurveTo(-r * 0.16, -r * 0.16, 0, -r)
      ctx.fill()
      ctx.restore()
    }
  }

  // ------------------------------------------------------------- the frames
  const captures = await Promise.all(
    rects.map(async (_, i) => {
      const shot = spec.captures[i]
      return shot ? { img: await image(shot.src), fit: shot.fit } : null
    }),
  )

  for (const [i, slot] of rects.entries()) {
    const radius = Math.round(d.w / 32)
    const shot = captures[i]
    const filled = Boolean(shot?.img.naturalWidth)

    /* Where the picture actually landed.
     *
     * `contain` is the only fit that leaves the frame bigger than the picture,
     * and a border drawn round the frame then floats a rounded rectangle of
     * backing on two sides of a screenshot - which looks like the layout failed
     * rather than like a choice. So the frame shrinks onto the picture: the
     * border, the shadow and the word all use the tightened box, and the
     * leftover space simply is not drawn. */
    /* When the word sits beside the picture, the frame gives up part of itself
     * to make room. A wide frame splits left and right, a tall one top and
     * bottom - the other way round in each case letterboxes the picture into a
     * band too thin to read. */
    const said = spec.slotTexts[i]
    const beside = Boolean(said) && spec.slotTextPlace === 'beside'
    const wide = slot.w > slot.h
    const share = 0.62
    const gutter = Math.round(d.w / 70)
    const pictureSlot: Box = !beside ? slot
      : wide
        ? { x: slot.x, y: slot.y, w: Math.round(slot.w * share) - gutter, h: slot.h }
        : { x: slot.x, y: slot.y, w: slot.w, h: Math.round(slot.h * share) - gutter }
    const textBox: Box | null = !beside ? null
      : wide
        ? { x: slot.x + Math.round(slot.w * share), y: slot.y,
            w: slot.w - Math.round(slot.w * share), h: slot.h }
        : { x: slot.x, y: slot.y + Math.round(slot.h * share),
            w: slot.w, h: slot.h - Math.round(slot.h * share) }

    const drawn = shot && filled
      ? fitBounds(shot.img, shot.fit, pictureSlot.x, pictureSlot.y, pictureSlot.w, pictureSlot.h)
      : null
    const rect: Box = drawn && shot?.fit === 'contain' ? drawn : pictureSlot

    /* A degree or two off square, and never the same two degrees twice.
     *
     * Seeded off the panel and the frame's place in it, so a panel tilts the
     * same way every redraw - a jaunty layout that reshuffles on every keystroke
     * is a nervous one. Off by default, because a tilted frame is no longer at
     * the coordinates `slots.json` reports, and pasting a capture in afterwards
     * is the workflow those coordinates exist for. */
    const tilt = spec.jaunty
      // Neighbours lean opposite ways. Three frames all leaning the same
      // degree and a half is a printing error; alternating is an arrangement.
      ? (0.016 + jitter(spec.seed, i) * 0.020) * (i % 2 === 0 ? 1 : -1)
      : 0
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2

    ctx.save()
    if (tilt) {
      ctx.translate(cx, cy)
      ctx.rotate(tilt)
      ctx.translate(-cx, -cy)
    }

    ctx.save()
    ctx.shadowColor = 'rgba(244,60,224,0.26)'
    ctx.shadowBlur = 100
    if (filled) {
      // Something opaque under it first: the shadow needs a solid shape to fall
      // from, and a screenshot with transparency in it would let the sky through.
      ctx.fillStyle = '#150e29'
    } else {
      const fill = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h)
      fill.addColorStop(0, 'rgba(38,26,66,0.94)')
      fill.addColorStop(1, 'rgba(24,17,45,0.94)')
      ctx.fillStyle = fill
    }
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius)
    ctx.fill()
    ctx.restore()

    if (shot && drawn) {
      // Clipped to the frame either way, so the picture takes the frame's
      // rounded corners instead of arriving as a hard rectangle over them.
      ctx.save()
      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius)
      ctx.clip()
      ctx.drawImage(shot.img, drawn.x, drawn.y, drawn.w, drawn.h)
      ctx.restore()
    }

    ctx.strokeStyle = 'rgba(92,232,224,0.45)'
    ctx.lineWidth = 3
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius)
    ctx.stroke()

    // Corner ticks only on an empty frame. They are registration marks for
    // whoever is placing the capture, so once a capture is in they are marking
    // nothing and are just four bright brackets over the picture.
    if (!filled) {
      const t = Math.min(Math.round(d.w / 22), Math.round(rect.h / 3))
      ctx.strokeStyle = ACCENT
      ctx.lineWidth = 4
      const corners: [number, number, number, number][] = [
        [rect.x - 4, rect.y - 4, 1, 1],
        [rect.x + rect.w + 4, rect.y - 4, -1, 1],
        [rect.x - 4, rect.y + rect.h + 4, 1, -1],
        [rect.x + rect.w + 4, rect.y + rect.h + 4, -1, -1],
      ]
      for (const [ctx1, cty, sx, sy] of corners) {
        ctx.beginPath()
        ctx.moveTo(ctx1 + sx * t, cty)
        ctx.lineTo(ctx1, cty)
        ctx.lineTo(ctx1, cty + sy * t)
        ctx.stroke()
      }
    }

    // The word on the picture. Drawn after the frame and its border, so it
    // sits over a capture rather than under one, with a shadow heavy enough to
    // stay readable on a bright screenshot as well as on the empty backing.
    if (said) {
      const box = textBox ?? rect
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      // Only a word over a picture needs to fight the picture. Beside it, the
      // shadow is just a glow that keeps it off the sky.
      ctx.shadowColor = textBox ? 'rgba(8,4,18,0.6)' : 'rgba(8,4,18,0.95)'
      ctx.fillStyle = spec.slotTextColor

      // Shrink until the wrapped word fits the box it was given.
      let size = Math.round(Math.min(box.h * 0.4, box.w * 0.34))
      let lines: string[] = []
      for (; size > 12; size -= 2) {
        ctx.font = `700 ${size}px ${pixel}`
        lines = wrapText((t) => ctx.measureText(t).width, said, box.w * 0.9)
        if (lines.length * size * 1.2 <= box.h * 0.9) break
      }
      ctx.shadowBlur = size * 0.5
      const top = box.y + box.h / 2 - ((lines.length - 1) * size * 1.2) / 2
      lines.forEach((line, n) => ctx.fillText(line, box.x + box.w / 2, top + n * size * 1.2))

      ctx.restore()
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
    }

    // The caption sits above its frame and never inside it, so pasting a
    // capture in never has to cover type.
    if (slot.label) {
      ctx.font = `700 ${Math.round(d.slotLabelH * 0.62)}px ${pixel}`
      ctx.fillStyle = ACCENT_2
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(slot.label, rect.x + 6, rect.y - 12)
      ctx.textBaseline = 'top'
    }

    ctx.restore()
  }

  // ------------------------------------------------------------ the reading
  const scrimTop = d.titleTop - 90
  const scrim = ctx.createLinearGradient(0, scrimTop, 0, d.h)
  scrim.addColorStop(0, 'rgba(13,8,25,0)')
  scrim.addColorStop(0.16, 'rgba(13,8,25,0.86)')
  scrim.addColorStop(1, 'rgba(13,8,25,0.94)')
  ctx.fillStyle = scrim
  ctx.fillRect(0, scrimTop, d.w, d.h - scrimTop)

  ctx.font = `700 ${d.titleSize}px ${SANS}`
  ctx.fillStyle = INK
  wrapText((t) => ctx.measureText(t).width, spec.copy.title, content)
    .forEach((line, i) => ctx.fillText(line, d.padX, d.titleTop + i * d.titleSize * 1.1))

  ctx.font = `400 ${d.bodySize}px ${SANS}`
  ctx.fillStyle = INK_MUTED
  wrapText((t) => ctx.measureText(t).width, spec.copy.body, content)
    .forEach((line, i) => ctx.fillText(line, d.padX, d.bodyTop + i * d.bodySize * 1.42))

  // ------------------------------------------------------------- the colour
  const row = spec.band.slice(0, d.bandCount)
  const cell = (content - d.bandGap * (row.length - 1)) / row.length
  for (let i = 0; i < row.length; i++) {
    const x = d.padX + i * (cell + d.bandGap)
    ctx.fillStyle = 'rgba(52,38,88,0.9)'
    roundRect(ctx, x, d.bandY, cell, d.bandH, Math.round(cell / 5))
    ctx.fill()
    ctx.strokeStyle = LINE
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.save()
    roundRect(ctx, x, d.bandY, cell, d.bandH, Math.round(cell / 5))
    ctx.clip()
    contain(ctx, band[i], x + cell * 0.05, d.bandY + d.bandH * 0.05, cell * 0.9, d.bandH * 0.9)
    ctx.restore()
  }
}
