'use client'

import {
  type HeroMotion,
  heroBlocks,
  heroShapes,
  heroStars,
  logoBox,
  type StudioHero,
  textBox,
} from '@/domain/studio/hero'

/**
 * A hero, painted onto a 2D canvas.
 *
 * ---------------------------------------------------------------------------
 * Why a canvas and not the DOM
 * ---------------------------------------------------------------------------
 * The obvious build for this editor is HTML: the landing page's hero already
 * exists as markup, CSS does the type and the drop-shadows for free, and the
 * preview would be the real thing rather than a drawing of it. It falls down at
 * the only two outputs that matter. There is no way to turn a DOM subtree into
 * a PNG without a rasteriser — a dependency that reimplements a browser's layout
 * badly, breaks on `next/font`'s hashed faces, and drops any `filter` it does
 * not know — and there is no way at all to record one as video.
 *
 * A canvas has both for nothing: `toDataURL` is the still and
 * `captureStream` + `MediaRecorder` (see `./record`) is the clip. The cost is
 * that layout is written by hand, which is what `wrap` and `layoutRuns` below
 * are, and it buys the property that matters most in an export tool: the
 * preview and the file are the same code at two sizes, so what you compose is
 * what you get. The scene studio is built the same way for the same reason —
 * its viewport carries the export's aspect ratio rather than the panel's.
 *
 * ---------------------------------------------------------------------------
 * Everything is a fraction
 * ---------------------------------------------------------------------------
 * Nothing here is in pixels. Positions are percentages of the frame and sizes
 * are fractions of its width, so the 960px preview and the 1920px export are
 * the same picture. A single hard-coded pixel value would be a composition that
 * comes out different from the file — which is the exact bug this whole shape
 * is chosen to prevent, so it is worth being strict about.
 */

/** Everything loaded off the network that the painter needs handed to it. */
export interface HeroAssets {
  /** Block renders by model name. A missing one is skipped, not drawn as a hole. */
  blocks: Map<string, CanvasImageSource>
  /** The imported picture, once it has loaded. */
  image: CanvasImageSource | null
  /** The lockup. */
  logo: CanvasImageSource | null
}

const TAU = Math.PI * 2

/** The pixel face, by the family name `hero-stage` registers it under. */
const PIXEL = '"PixelMillennium", ui-monospace, monospace'
const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif'

const neon = (hue: number, alpha: number) => `hsla(${hue}, 92%, 62%, ${alpha})`

// ---------------------------------------------------------------------------
// The entrance
// ---------------------------------------------------------------------------

/**
 * How each element arrives, and in what order. Index 0 goes first.
 *
 * The lockup leads. It is the only thing on the frame that is not part of the
 * composition — it says whose this is — and a logo that arrives last reads as
 * an afterthought stamped on the end of somebody else's animation.
 */
const enum Element {
  Logo = 0,
  Eyebrow = 1,
  Headline = 2,
  Body = 3,
  Cta = 4,
  Image = 5,
  Blocks = 6,
}

interface Arrival {
  alpha: number
  /** Fraction of the frame's height to shift down by while arriving. */
  dy: number
  scale: number
  /** 0 to 1, for the typewriter. Always 1 for the other entrances. */
  reveal: number
}

const SETTLED: Arrival = { alpha: 1, dy: 0, scale: 1, reveal: 1 }

/** Decelerating, so things land rather than stop. */
const easeOut = (p: number) => 1 - (1 - p) ** 3

/**
 * Where one element is in its entrance at time `t`.
 *
 * The stagger is what makes this read as a sequence rather than a wipe: the
 * eyebrow, then the headline, then the sentence, then the picture. Everything
 * has settled by `stagger × 5 + 0.7`, which is why `posterTime` defaults to
 * three seconds — a still taken before then is a photograph of an animation.
 */
function arrival(element: Element, t: number, motion: HeroMotion): Arrival {
  if (motion.entrance === 'none') return SETTLED

  const start = element * motion.stagger
  const p = Math.min(1, Math.max(0, (t - start) / 0.7))
  if (p >= 1) return SETTLED

  const eased = easeOut(p)
  switch (motion.entrance) {
    case 'fade':
      return { alpha: eased, dy: 0, scale: 1, reveal: 1 }
    case 'rise':
      return { alpha: eased, dy: (1 - eased) * 0.06, scale: 1, reveal: 1 }
    case 'pop':
      // Overshoots and comes back, which is what makes a pop read as a pop
      // rather than as a zoom. The peak is at about p = 0.6.
      return { alpha: eased, dy: 0, scale: 0.82 + eased * 0.22 - Math.sin(p * Math.PI) * 0.04, reveal: 1 }
    case 'type':
      // Only the copy types; a picture cannot be revealed a character at a
      // time, so it falls back to the fade it would otherwise fight with.
      return element === Element.Image
        ? { alpha: eased, dy: 0, scale: 1, reveal: 1 }
        : { alpha: 1, dy: 0, scale: 1, reveal: p }
    default:
      return SETTLED
  }
}

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/** One run of copy in one colour. The headline is two of these. */
interface Run {
  text: string
  colour: string
  glow: boolean
}

interface Piece extends Run {
  x: number
  width: number
}

/**
 * Runs, broken into lines that fit.
 *
 * Word-level, because a pixel face at headline size in a half-width column is
 * going to wrap and breaking mid-word looks like a bug. The colour travels with
 * the word rather than with the line, so "not here to chat | here to play." can
 * change colour in the middle of a line when there is room for it on one, and
 * break at the divider when there is not — which is the same behaviour the
 * landing page gets from an `inline-block` on the second clause.
 */
function layoutRuns(
  ctx: CanvasRenderingContext2D,
  runs: Run[],
  maxWidth: number,
): { pieces: Piece[]; width: number }[] {
  const lines: { pieces: Piece[]; width: number }[] = []
  let line: Piece[] = []
  let x = 0

  const space = ctx.measureText(' ').width

  for (const run of runs) {
    for (const word of run.text.split(/\s+/).filter(Boolean)) {
      const width = ctx.measureText(word).width
      const gap = line.length === 0 ? 0 : space
      if (line.length > 0 && x + gap + width > maxWidth) {
        lines.push({ pieces: line, width: x })
        line = []
        x = 0
      }
      const at = x + (line.length === 0 ? 0 : space)
      line.push({ ...run, text: word, x: at, width })
      x = at + width
    }
  }
  if (line.length > 0) lines.push({ pieces: line, width: x })
  return lines
}

/** The same, for a single colour — the eyebrow and the body sentence. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  return layoutRuns(ctx, [{ text, colour: '', glow: false }], maxWidth).map((line) =>
    line.pieces.map((piece) => piece.text).join(' '),
  )
}

/**
 * As much of a string as the typewriter has got to.
 *
 * Counted over the whole block rather than per line, so the cursor runs through
 * the copy at one speed instead of restarting at every wrap.
 */
function revealed(text: string, reveal: number): string {
  if (reveal >= 1) return text
  return text.slice(0, Math.ceil(text.length * reveal))
}

// ---------------------------------------------------------------------------
// The sky
// ---------------------------------------------------------------------------

function paintSky(ctx: CanvasRenderingContext2D, hero: StudioHero, t: number): void {
  const { width: w, height: h } = hero
  const { sky } = hero

  const gradient = ctx.createLinearGradient(0, 0, 0, h)
  gradient.addColorStop(0, sky.top)
  gradient.addColorStop(1, sky.bottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  if (sky.grid > 0) {
    // A square grid rather than a perspective one: the blocks are shot on a
    // three-quarter camera and the picture in the middle has its own vanishing
    // point, so a second one drawn in the background fights both.
    ctx.save()
    ctx.strokeStyle = `rgba(160, 180, 255, ${sky.grid})`
    ctx.lineWidth = Math.max(1, w * 0.0006)
    const step = w / 16
    ctx.beginPath()
    for (let x = step; x < w; x += step) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
    }
    for (let y = step; y < h; y += step) {
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
    }
    ctx.stroke()
    ctx.restore()
  }

  for (const star of heroStars(hero)) {
    // Slow and out of phase, so the field shimmers instead of blinking.
    const twinkle = 0.65 + 0.35 * Math.sin(t * 1.6 + star.phase)
    ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha * twinkle})`
    ctx.beginPath()
    ctx.arc((star.x / 100) * w, (star.y / 100) * h, (star.radius / 100) * w * 0.12, 0, TAU)
    ctx.fill()
  }

  if (sky.glow > 0) {
    // Behind the copy rather than in the centre of the frame: on a split layout
    // a centred bloom lights the picture and leaves the words in the dark.
    const box = textBox(hero)
    const cx = ((box.x + box.w / 2) / 100) * w
    const cy = ((box.y + box.h / 2) / 100) * h
    const radius = w * 0.55
    const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    bloom.addColorStop(0, `rgba(120, 40, 160, ${sky.glow * 0.55})`)
    bloom.addColorStop(1, 'rgba(120, 40, 160, 0)')
    ctx.fillStyle = bloom
    ctx.fillRect(0, 0, w, h)
  }
}

function paintVignette(ctx: CanvasRenderingContext2D, hero: StudioHero): void {
  if (hero.sky.vignette <= 0) return
  const { width: w, height: h } = hero
  const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, w * 0.75)
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
  gradient.addColorStop(1, `rgba(0, 0, 0, ${hero.sky.vignette})`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)
}

// ---------------------------------------------------------------------------
// Decoration
// ---------------------------------------------------------------------------

function paintShapes(ctx: CanvasRenderingContext2D, hero: StudioHero, t: number): void {
  const { width: w, height: h } = hero

  for (const shape of heroShapes(hero)) {
    const size = w * 0.018 * shape.scale
    const bob = Math.sin(t * 0.9 + shape.delay) * h * 0.006 * hero.blocks.drift
    const x = (shape.x / 100) * w
    const y = (shape.y / 100) * h + bob

    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = neon(shape.hue, 0.9)
    ctx.shadowColor = neon(shape.hue, 0.8)
    ctx.shadowBlur = size * 1.4

    if (shape.kind === 'star') {
      // A four-pointed sparkle rather than a five-pointed star: the concave
      // curve is what makes it read as a glint of light instead of a sheriff's
      // badge, and it is the shape the landing page's `.deco-star` draws.
      ctx.beginPath()
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * TAU - Math.PI / 2
        const b = a + TAU / 8
        ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size)
        ctx.quadraticCurveTo(0, 0, Math.cos(b) * size * 0.28, Math.sin(b) * size * 0.28)
      }
      ctx.closePath()
      ctx.fill()
    } else if (shape.kind === 'heart') {
      ctx.beginPath()
      ctx.moveTo(0, size * 0.85)
      ctx.bezierCurveTo(-size * 1.3, -size * 0.2, -size * 0.5, -size * 1.1, 0, -size * 0.35)
      ctx.bezierCurveTo(size * 0.5, -size * 1.1, size * 1.3, -size * 0.2, 0, size * 0.85)
      ctx.fill()
    } else {
      // Punched rather than drawn as an arc: a crescent is a disc with a disc
      // taken out of it, and `destination-out` is how a canvas says that.
      ctx.beginPath()
      ctx.arc(0, 0, size, 0, TAU)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(size * 0.45, -size * 0.25, size * 0.85, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }
}

function paintBlocks(
  ctx: CanvasRenderingContext2D,
  hero: StudioHero,
  assets: HeroAssets,
  t: number,
  arrived: Arrival,
): void {
  const { width: w, height: h } = hero

  for (const block of heroBlocks(hero)) {
    const render = assets.blocks.get(block.model)
    // Skipped rather than drawn as a placeholder: a block whose PNG has not
    // arrived yet is a block that appears a moment later, and a grey square
    // that appears and then changes is worse than a gap that fills in.
    if (!render) continue

    const size = w * 0.075 * block.scale
    const bob = Math.sin(t * 0.7 + block.delay) * h * 0.012 * hero.blocks.drift
    // A tumble that never completes — it rocks a few degrees either side rather
    // than spinning, because these are renders from one fixed camera and a
    // block turned past its own silhouette stops looking like a solid.
    const tilt = Math.sin(t * 0.45 + block.delay) * 0.12 * block.spin * hero.blocks.drift

    ctx.save()
    ctx.globalAlpha = arrived.alpha
    ctx.translate((block.x / 100) * w, (block.y / 100) * h + bob + arrived.dy * h)
    ctx.rotate(tilt)
    ctx.scale(arrived.scale, arrived.scale)
    ctx.shadowColor = neon(block.hue, 0.55)
    ctx.shadowBlur = size * 0.4
    ctx.drawImage(render, -size / 2, -size / 2, size, size)
    ctx.restore()
  }
}

// ---------------------------------------------------------------------------
// The picture
// ---------------------------------------------------------------------------

function paintImage(
  ctx: CanvasRenderingContext2D,
  hero: StudioHero,
  assets: HeroAssets,
  t: number,
  arrived: Arrival,
): void {
  const spec = hero.image
  if (!spec || !assets.image) return

  const { width: w, height: h } = hero
  const source = assets.image
  // Whatever the file's own aspect is, kept: the scale control sets the width
  // and the height follows, so importing a tall render does not squash it.
  const natural = imageSize(source)
  const drawWidth = spec.scale * w
  const drawHeight = natural.width > 0 ? (drawWidth * natural.height) / natural.width : drawWidth

  const bob = Math.sin(t * 0.6) * h * (spec.float / 100)
  const cx = (spec.x / 100) * w
  const cy = (spec.y / 100) * h + bob + arrived.dy * h

  if (spec.shadow) {
    // An ellipse on the ground under it, not a drop shadow behind it. The
    // renders are cut-outs of a three-quarter view, so what makes one stand on
    // the sky is a contact shadow at its feet.
    ctx.save()
    ctx.globalAlpha = arrived.alpha * 0.45
    ctx.fillStyle = 'rgba(0, 0, 0, 1)'
    ctx.filter = `blur(${drawWidth * 0.03}px)`
    ctx.beginPath()
    ctx.ellipse(cx, cy + drawHeight * 0.42, drawWidth * 0.34, drawHeight * 0.05, 0, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  ctx.globalAlpha = arrived.alpha
  ctx.translate(cx, cy)
  ctx.rotate((spec.rotation * Math.PI) / 180)
  ctx.scale(arrived.scale, arrived.scale)
  ctx.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  ctx.restore()
}

/**
 * The lockup, in its corner.
 *
 * Drawn into the box `logoBox` computes rather than into one worked out here,
 * so the rectangle the blocks are keeping out of is the rectangle the logo
 * actually occupies. The width comes from the box and the height from the
 * file's own aspect — the box's height is the placer's conservative guess, and
 * using it to draw would squash the mark.
 */
function paintLogo(
  ctx: CanvasRenderingContext2D,
  hero: StudioHero,
  assets: HeroAssets,
  arrived: Arrival,
): void {
  const spec = hero.logo
  const box = logoBox(hero)
  if (!spec || !box || !assets.logo) return

  const { width: w, height: h } = hero
  const natural = imageSize(assets.logo)
  const drawWidth = (box.w / 100) * w
  const drawHeight = natural.width > 0 ? (drawWidth * natural.height) / natural.width : drawWidth
  const x = (box.x / 100) * w
  const y = (box.y / 100) * h

  ctx.save()
  ctx.globalAlpha = arrived.alpha * spec.opacity
  // Scaled about its own corner-facing edge rather than its centre, so a `pop`
  // grows it out of the corner instead of out over the margin.
  ctx.translate(x + drawWidth / 2, y + drawHeight / 2)
  ctx.scale(arrived.scale, arrived.scale)
  ctx.drawImage(
    assets.logo,
    -drawWidth / 2,
    -drawHeight / 2 + arrived.dy * h,
    drawWidth,
    drawHeight,
  )
  ctx.restore()
}

/** The intrinsic size of whatever kind of image source this is. */
function imageSize(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight }
  }
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height }
  }
  if (source instanceof HTMLCanvasElement) return { width: source.width, height: source.height }
  return { width: 0, height: 0 }
}

// ---------------------------------------------------------------------------
// The copy
// ---------------------------------------------------------------------------

function paintText(ctx: CanvasRenderingContext2D, hero: StudioHero, t: number): void {
  const { width: w, height: h } = hero
  const { text, layout, motion } = hero
  const box = textBox(hero)

  const left = (box.x / 100) * w
  const maxWidth = (box.w / 100) * w
  const centred = layout === 'centred'
  const anchor = centred ? left + maxWidth / 2 : left

  // Off the width rather than the height, because the column these have to fit
  // in is a fraction of the width — tie them to the height and a 4:5 export
  // sets the headline in a size the column cannot hold.
  const headSize = w * 0.042 * text.size
  const eyebrowSize = w * 0.0115 * text.size
  const bodySize = w * 0.0165 * text.size

  ctx.save()
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  /**
   * The top of the block, worked out by measuring it first.
   *
   * Everything is laid out into a running `y` below, so the block has to be
   * vertically centred in its box before anything is drawn — otherwise a
   * two-line headline pushes the sentence off the bottom on some compositions
   * and leaves a gap on others.
   */
  let y = 0
  const measure = () => {
    let total = 0
    if (text.eyebrow) {
      ctx.font = `${eyebrowSize}px ${PIXEL}`
      total += wrap(ctx, text.eyebrow, maxWidth).length * eyebrowSize * 1.5 + headSize * 0.35
    }
    ctx.font = `${headSize}px ${PIXEL}`
    total += headlineLines(ctx, text, maxWidth).length * headSize * 1.22
    if (text.body) {
      ctx.font = `${bodySize}px ${SANS}`
      total += headSize * 0.35 + wrap(ctx, text.body, maxWidth).length * bodySize * 1.5
    }
    if (hero.cta && hero.cta.label.trim().length > 0) {
      total += bodySize * (CTA_GAP + CTA_HEIGHT)
    }
    return total
  }
  y = (box.y / 100) * h + ((box.h / 100) * h - measure()) / 2

  // ---- eyebrow
  if (text.eyebrow) {
    const arrived = arrival(Element.Eyebrow, t, motion)
    ctx.font = `${eyebrowSize}px ${PIXEL}`
    ctx.globalAlpha = arrived.alpha
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    for (const lineText of wrap(ctx, revealed(text.eyebrow, arrived.reveal), maxWidth)) {
      const width = ctx.measureText(lineText).width
      ctx.fillText(lineText, centred ? anchor - width / 2 : anchor, y + arrived.dy * h + eyebrowSize)
      y += eyebrowSize * 1.5
    }
    y += headSize * 0.35
  }

  // ---- headline
  {
    const arrived = arrival(Element.Headline, t, motion)
    ctx.font = `${headSize}px ${PIXEL}`
    ctx.globalAlpha = arrived.alpha

    // The typewriter counts across both runs, so the reveal crosses the colour
    // change mid-word rather than typing the two clauses in parallel.
    const whole = `${text.headline} ${text.accent ?? ''}`
    const cut = Math.ceil(whole.length * arrived.reveal)
    const runs: Run[] = [
      { text: text.headline.slice(0, cut), colour: text.ink, glow: false },
      {
        text: text.accent ? text.accent.slice(0, Math.max(0, cut - text.headline.length - 1)) : '',
        colour: text.accentColour,
        glow: true,
      },
    ].filter((run) => run.text.length > 0)

    for (const line of layoutRuns(ctx, runs, maxWidth)) {
      const offset = centred ? anchor - line.width / 2 : anchor
      for (const piece of line.pieces) {
        ctx.fillStyle = piece.colour
        // The accent is the only thing in the palette that glows — the same
        // rule `text-accent` follows in globals.css.
        ctx.shadowColor = piece.glow ? piece.colour : 'transparent'
        ctx.shadowBlur = piece.glow ? headSize * 0.5 : 0
        ctx.fillText(piece.text, offset + piece.x, y + arrived.dy * h + headSize)
      }
      y += headSize * 1.22
    }
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
  }

  // ---- body
  if (text.body) {
    const arrived = arrival(Element.Body, t, motion)
    y += headSize * 0.35
    ctx.font = `${bodySize}px ${SANS}`
    ctx.globalAlpha = arrived.alpha
    ctx.fillStyle = 'rgba(233, 230, 245, 0.78)'
    for (const lineText of wrap(ctx, revealed(text.body, arrived.reveal), maxWidth)) {
      const width = ctx.measureText(lineText).width
      ctx.fillText(lineText, centred ? anchor - width / 2 : anchor, y + arrived.dy * h + bodySize)
      y += bodySize * 1.5
    }
  }

  // ---- the buttons
  // A blank label is a field mid-edit, not a pill with nothing in it.
  if (hero.cta && hero.cta.label.trim().length > 0) {
    const arrived = arrival(Element.Cta, t, motion)
    const height = bodySize * CTA_HEIGHT
    y += bodySize * CTA_GAP

    // A shade heavier than the sentence above: this is the one line on the
    // frame that is meant to be read as a thing to do rather than as prose.
    ctx.font = `600 ${bodySize * 0.92}px ${SANS}`
    ctx.globalAlpha = arrived.alpha

    const gap = bodySize * 0.7
    const padX = height * 0.62
    const primaryWidth = ctx.measureText(hero.cta.label).width + padX * 2
    const secondaryWidth = hero.cta.secondary
      ? ctx.measureText(hero.cta.secondary).width + padX * 2
      : 0
    const row = primaryWidth + (secondaryWidth > 0 ? gap + secondaryWidth : 0)

    // Centred as a pair rather than each on its own axis, so the two read as one
    // row of controls — which is the same fix `justify-around` needed on the
    // landing page's own button row.
    const startX = centred ? anchor - row / 2 : anchor
    const top = y + arrived.dy * h

    const drawn = pill(ctx, hero.cta.label, startX, top, height, hero.cta.colour, hero.cta.ink)
    if (hero.cta.secondary) {
      pill(ctx, hero.cta.secondary, startX + drawn + gap, top, height, null, 'rgba(233, 230, 245, 0.9)')
    }
  }

  ctx.restore()
}

/**
 * A pill, drawn around a label.
 *
 * Returns how wide it came out, so the caller can put the next one beside it
 * without measuring the same string twice.
 */
function pill(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  height: number,
  fill: string | null,
  ink: string,
): number {
  const padX = height * 0.62
  const width = ctx.measureText(label).width + padX * 2
  const radius = height / 2

  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  if (fill) {
    // The glow is the button's whole claim to being the live thing on the
    // frame — the same job `.summon-cta` does on the landing page. Only the
    // filled one gets it; a glowing outline reads as two primary buttons.
    ctx.save()
    ctx.shadowColor = fill
    ctx.shadowBlur = height * 0.55
    ctx.fillStyle = fill
    ctx.fill()
    ctx.restore()
  } else {
    ctx.strokeStyle = 'rgba(233, 230, 245, 0.35)'
    ctx.lineWidth = Math.max(1, height * 0.035)
    ctx.stroke()
  }

  ctx.fillStyle = ink
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + padX, y + height / 2)
  ctx.textBaseline = 'alphabetic'

  return width
}

/** How tall the buttons are, and the gap above them. Both off the body size. */
const CTA_HEIGHT = 2.7
const CTA_GAP = 1.6

/** The headline's lines, for measuring. The font must already be set on `ctx`. */
function headlineLines(
  ctx: CanvasRenderingContext2D,
  text: StudioHero['text'],
  maxWidth: number,
): { pieces: Piece[]; width: number }[] {
  const runs: Run[] = [{ text: text.headline, colour: text.ink, glow: false }]
  if (text.accent) runs.push({ text: text.accent, colour: text.accentColour, glow: true })
  return layoutRuns(ctx, runs, maxWidth)
}

// ---------------------------------------------------------------------------

/**
 * One frame.
 *
 * `t` is seconds into the composition — the preview runs it off a clock, the
 * recorder runs it off its own, and a still is taken at `motion.posterTime`.
 * The canvas is expected to already be `hero.width × hero.height`; scaling to
 * fit the panel is the CSS's job, not this function's, so the preview and the
 * export go through identical arithmetic.
 */
export function paintHero(
  ctx: CanvasRenderingContext2D,
  hero: StudioHero,
  assets: HeroAssets,
  t: number,
): void {
  ctx.save()
  ctx.clearRect(0, 0, hero.width, hero.height)
  paintSky(ctx, hero, t)
  paintShapes(ctx, hero, t)
  paintBlocks(ctx, hero, assets, t, arrival(Element.Blocks, t, hero.motion))
  paintImage(ctx, hero, assets, t, arrival(Element.Image, t, hero.motion))
  paintText(ctx, hero, t)
  paintVignette(ctx, hero)
  // Last, and therefore over the vignette. Everything else is composition and
  // may be darkened at the corners; the lockup is the mark and must not be —
  // which matters precisely because it lives in a corner.
  paintLogo(ctx, hero, assets, arrival(Element.Logo, t, hero.motion))
  ctx.restore()
}
