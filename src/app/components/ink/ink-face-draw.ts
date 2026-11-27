import { lights, open, part, type Face } from '@/app/components/ink/ink-face'
import { css } from '@/app/components/ink/ink-palettes'
import type { InkSettings } from '@/app/components/ink/ink-settings'

/**
 * How a face is drawn.
 *
 * Cartoon, in neon: big round eyes with a pupil and a fleck of light in it,
 * chubby cheeks, a smile too wide for the face, and every part a separate
 * tube in its own colour - see `part` in ./ink-face for the colours. Nothing
 * large is filled. A filled face would be a sticker, and what makes this read
 * as neon rather than as clip art is that the water goes on showing through
 * the middle of it; the pupils and their highlights are the one exception,
 * because a cartoon eye without a pupil is a plate.
 *
 * A tube is four passes over the same path, widest and faintest first and a
 * near-white core last: that is the cheap way to a tube of light, and it
 * beats `shadowBlur`, which costs a full-canvas blur per stroke and would
 * show on a page already running a fluid solver behind it.
 *
 * The parts are drawn on their own lights - grin, eyes, the rest - because
 * they are lit separately: see `lights` in ./ink-face for why a face leaves
 * its smile behind. The flicker is small and slow and never reaches zero. A
 * sign that stutters hard is a sign that is broken, and these are meant to
 * be looked at rather than repaired.
 *
 * Everything is laid out in the same up-is-positive space as the rest of
 * this folder, so the axis is flipped once per face rather than every
 * coordinate below being written upside down - which is exactly how the cat
 * first shipped, ears underneath.
 */

type Path = (ctx: CanvasRenderingContext2D, r: number) => void

export function drawFaces(
  ctx: CanvasRenderingContext2D,
  faces: readonly Face[],
  _settings: InkSettings,
  width: number,
  height: number,
  t: number,
) {
  if (faces.length === 0) return
  const aspect = width / height
  const px = (x: number) => (x / aspect) * width
  const py = (y: number) => (1 - y) * height
  const pr = (r: number) => r * height

  for (const face of faces) {
    const lit = lights(face)
    if (lit.grin <= 0) continue

    // Alive, not faulty: a tenth either side, at a rate that is nothing like
    // the frame rate so it never beats against it.
    const flicker = 0.9 + 0.1 * Math.sin(t * 7.3 + face.phase) * Math.sin(t * 2.1 + face.phase * 1.7)
    const r = pr(face.size)

    ctx.save()
    ctx.translate(px(face.x), py(face.y))
    ctx.scale(1, -1)
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    /** One tube: a path stroked four times in this part's colour at this light. */
    const tube = (path: Path, light: number, step: number) => {
      if (light <= 0) return
      const tint = css(part(face, step, face.clock))
      const alpha = light * flicker
      for (const pass of [
        { width: r * 0.28, colour: `rgba(${tint}, ${0.1 * alpha})` },
        { width: r * 0.13, colour: `rgba(${tint}, ${0.3 * alpha})` },
        { width: Math.max(1, r * 0.05), colour: `rgba(${tint}, ${0.95 * alpha})` },
        { width: Math.max(0.8, r * 0.02), colour: `rgba(255, 255, 255, ${0.85 * alpha})` },
      ]) {
        ctx.lineWidth = pass.width
        ctx.strokeStyle = pass.colour
        path(ctx, r)
        ctx.stroke()
      }
    }

    /** A filled point of light - a pupil, or the fleck in one. */
    const dot = (x: number, y: number, radius: number, light: number, step: number, white = false) => {
      if (light <= 0) return
      const tint = white ? '255, 255, 255' : css(part(face, step, face.clock))
      const alpha = light * flicker
      for (const [scale, a] of [
        [2.2, 0.12],
        [1.4, 0.3],
        [1, 0.95],
      ] as const) {
        ctx.fillStyle = `rgba(${tint}, ${a * alpha})`
        ctx.beginPath()
        ctx.arc(x * r, y * r, radius * r * scale, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    if (face.kind === 'cat') cat(tube, dot, lit)
    else if (face.kind === 'llama') llama(tube, dot, lit)
    else if (face.kind === 'hippo') hippo(tube, dot, lit)
    else if (face.kind === 'chameleon') chameleon(tube, dot, lit)
    else stare(ctx, tube, dot, lit, open(face))

    ctx.restore()
  }
}

type Tube = (path: Path, light: number, step: number) => void
type Dot = (x: number, y: number, radius: number, light: number, step: number, white?: boolean) => void
type Lit = ReturnType<typeof lights>

/* ---------------------------------------------------------------------------
 * The cat
 * ---------------------------------------------------------------------------
 * A chubby head, ears standing off it with a second tube inside each, eyes
 * too big for the face, a button nose, two whiskers a side and a blush on
 * each cheek. The grin is the Cheshire one - wider than the mouth of any
 * cat, hooked up at both ends, and drawn big enough to hold the screen on
 * its own for the better part of a second after the rest has gone.
 */
function cat(tube: Tube, dot: Dot, lit: Lit) {
  tube(catHead, lit.head, 0)
  tube(catEars, lit.head, 0.12)
  tube(catInnerEars, lit.head, 0.25)
  tube(catWhiskers, lit.head, 0.2)
  tube(catCheeks, lit.head, 0.85)
  tube(catNose, lit.head, 0.55)
  tube(catEyes, lit.eyes, 0.38)
  for (const side of [1, -1]) {
    dot(side * 0.38, 0.1, 0.11, lit.eyes, 0.5)
    dot(side * 0.38 + 0.05, 0.16, 0.04, lit.eyes, 0.5, true)
  }
  tube(catGrin, lit.grin, 0.68)
}

function catHead(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  ctx.ellipse(0, -r * 0.05, r, r * 0.88, 0, 0, Math.PI * 2)
}

function catEars(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    ctx.moveTo(side * r * 0.86, r * 0.32)
    ctx.quadraticCurveTo(side * r * 0.9, r * 0.8, side * r * 0.62, r * 1.05)
    ctx.quadraticCurveTo(side * r * 0.4, r * 0.85, side * r * 0.24, r * 0.72)
  }
}

function catInnerEars(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    ctx.moveTo(side * r * 0.72, r * 0.5)
    ctx.quadraticCurveTo(side * r * 0.74, r * 0.78, side * r * 0.6, r * 0.9)
    ctx.quadraticCurveTo(side * r * 0.48, r * 0.76, side * r * 0.4, r * 0.66)
  }
}

function catEyes(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    ctx.moveTo(side * r * 0.38 + r * 0.25, r * 0.1)
    ctx.arc(side * r * 0.38, r * 0.1, r * 0.25, 0, Math.PI * 2)
  }
}

function catNose(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  ctx.moveTo(-r * 0.09, -r * 0.16)
  ctx.quadraticCurveTo(0, -r * 0.13, r * 0.09, -r * 0.16)
  ctx.quadraticCurveTo(r * 0.03, -r * 0.3, 0, -r * 0.3)
  ctx.quadraticCurveTo(-r * 0.03, -r * 0.3, -r * 0.09, -r * 0.16)
}

function catGrin(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  // The two little curves off the nose that a cat's mouth is.
  ctx.moveTo(0, -r * 0.3)
  ctx.quadraticCurveTo(-r * 0.1, -r * 0.46, -r * 0.2, -r * 0.4)
  ctx.moveTo(0, -r * 0.3)
  ctx.quadraticCurveTo(r * 0.1, -r * 0.46, r * 0.2, -r * 0.4)
  // The smile itself, cheek to cheek and hooked up at both ends.
  ctx.moveTo(-r * 0.58, -r * 0.34)
  ctx.quadraticCurveTo(0, -r * 0.82, r * 0.58, -r * 0.34)
  ctx.moveTo(-r * 0.58, -r * 0.34)
  ctx.quadraticCurveTo(-r * 0.52, -r * 0.24, -r * 0.42, -r * 0.27)
  ctx.moveTo(r * 0.58, -r * 0.34)
  ctx.quadraticCurveTo(r * 0.52, -r * 0.24, r * 0.42, -r * 0.27)
}

function catWhiskers(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    for (const [lift, droop] of [
      [-0.12, 0.08],
      [-0.3, -0.06],
    ] as const) {
      ctx.moveTo(side * r * 0.62, r * lift)
      ctx.quadraticCurveTo(side * r * 1.05, r * (lift + droop * 0.4), side * r * 1.42, r * (lift + droop))
    }
  }
}

function catCheeks(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    for (const k of [0, 1]) {
      const x = side * r * (0.62 + k * 0.12)
      ctx.moveTo(x, -r * 0.42)
      ctx.quadraticCurveTo(x + side * r * 0.04, -r * 0.34, x, -r * 0.26)
    }
  }
}

/* ---------------------------------------------------------------------------
 * The llama
 * ---------------------------------------------------------------------------
 * A long face with a fluffy crown across the top of it, two banana ears
 * standing up out of the fluff, big eyes with three lashes each, two
 * nostrils and the split lip a llama has, a blush on each cheek, and the
 * same too-wide smile as the cat's, because that is the joke.
 */
function llama(tube: Tube, dot: Dot, lit: Lit) {
  tube(llamaHead, lit.head, 0)
  tube(llamaEars, lit.head, 0.12)
  tube(llamaInnerEars, lit.head, 0.25)
  tube(llamaFluff, lit.head, 0.3)
  tube(llamaCheeks, lit.head, 0.85)
  tube(llamaNose, lit.head, 0.55)
  tube(llamaEyes, lit.eyes, 0.38)
  tube(llamaLashes, lit.eyes, 0.2)
  for (const side of [1, -1]) {
    dot(side * 0.36, 0.28, 0.1, lit.eyes, 0.5)
    dot(side * 0.36 + 0.05, 0.34, 0.035, lit.eyes, 0.5, true)
  }
  tube(llamaGrin, lit.grin, 0.68)
}

function llamaHead(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  // Across the top in four soft bumps: the crown of fluff is part of the
  // outline, not a hat on it.
  ctx.moveTo(-r * 0.62, r * 0.72)
  for (let i = 0; i < 4; i++) {
    const x0 = -r * 0.62 + (i * r * 1.24) / 4
    const x1 = x0 + (r * 1.24) / 4
    ctx.quadraticCurveTo((x0 + x1) / 2, r * 0.98, x1, r * 0.72)
  }
  // Right side down to the muzzle, which bulges, then the chin.
  ctx.quadraticCurveTo(r * 0.7, r * 0.2, r * 0.58, -r * 0.3)
  ctx.quadraticCurveTo(r * 0.62, -r * 0.85, r * 0.42, -r * 1.05)
  ctx.quadraticCurveTo(0, -r * 1.22, -r * 0.42, -r * 1.05)
  ctx.quadraticCurveTo(-r * 0.62, -r * 0.85, -r * 0.58, -r * 0.3)
  ctx.quadraticCurveTo(-r * 0.7, r * 0.2, -r * 0.62, r * 0.72)
}

function llamaEars(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    ctx.moveTo(side * r * 0.5, r * 0.78)
    ctx.quadraticCurveTo(side * r * 0.95, r * 1.2, side * r * 0.72, r * 1.68)
    ctx.quadraticCurveTo(side * r * 0.42, r * 1.3, side * r * 0.22, r * 0.9)
  }
}

function llamaInnerEars(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    ctx.moveTo(side * r * 0.5, r * 0.95)
    ctx.quadraticCurveTo(side * r * 0.76, r * 1.2, side * r * 0.66, r * 1.5)
    ctx.quadraticCurveTo(side * r * 0.5, r * 1.25, side * r * 0.38, r * 1.0)
  }
}

function llamaFluff(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  // A tuft standing up between the ears.
  ctx.moveTo(-r * 0.18, r * 0.92)
  ctx.quadraticCurveTo(-r * 0.14, r * 1.22, r * 0.02, r * 1.12)
  ctx.quadraticCurveTo(r * 0.1, r * 1.32, r * 0.2, r * 1.0)
}

function llamaEyes(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    ctx.moveTo(side * r * 0.36 + r * 0.23, r * 0.28)
    ctx.ellipse(side * r * 0.36, r * 0.28, r * 0.23, r * 0.26, 0, 0, Math.PI * 2)
  }
}

function llamaLashes(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    for (const angle of [0.55, 0.85, 1.15]) {
      const x = side * r * 0.36 + Math.cos(Math.PI / 2 + side * angle) * r * 0.25
      const y = r * 0.28 + Math.sin(Math.PI / 2 + side * angle) * r * 0.27
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(Math.PI / 2 + side * angle) * r * 0.14, y + Math.sin(Math.PI / 2 + side * angle) * r * 0.15)
    }
  }
}

function llamaNose(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  // Two nostrils, and the split lip running down from between them.
  for (const side of [1, -1]) {
    ctx.moveTo(side * r * 0.22, -r * 0.5)
    ctx.quadraticCurveTo(side * r * 0.1, -r * 0.44, side * r * 0.08, -r * 0.58)
  }
  ctx.moveTo(0, -r * 0.6)
  ctx.lineTo(0, -r * 0.8)
}

function llamaGrin(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  ctx.moveTo(-r * 0.46, -r * 0.78)
  ctx.quadraticCurveTo(0, -r * 1.12, r * 0.46, -r * 0.78)
  ctx.moveTo(-r * 0.46, -r * 0.78)
  ctx.quadraticCurveTo(-r * 0.42, -r * 0.68, -r * 0.32, -r * 0.7)
  ctx.moveTo(r * 0.46, -r * 0.78)
  ctx.quadraticCurveTo(r * 0.42, -r * 0.68, r * 0.32, -r * 0.7)
}

function llamaCheeks(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    for (const k of [0, 1]) {
      const x = side * r * (0.4 + k * 0.1)
      ctx.moveTo(x, -r * 0.3)
      ctx.quadraticCurveTo(x + side * r * 0.04, -r * 0.2, x, -r * 0.1)
    }
  }
}

/* ---------------------------------------------------------------------------
 * The hippo
 * ---------------------------------------------------------------------------
 * Almost all muzzle. The eyes and the ears sit up on top of a small dome of
 * head and the rest is one enormous rounded snout, with two nostrils on it
 * you could park in, a blush either side, and the same too-wide smile as the
 * others - plus the two square teeth that stick up out of it, which is the
 * one thing that makes it a hippo and not a bear in a bad mood.
 */
function hippo(tube: Tube, dot: Dot, lit: Lit) {
  tube(hippoHead, lit.head, 0)
  tube(hippoEars, lit.head, 0.12)
  tube(hippoInnerEars, lit.head, 0.25)
  tube(hippoCheeks, lit.head, 0.85)
  tube(hippoNostrils, lit.head, 0.55)
  tube(hippoEyes, lit.eyes, 0.38)
  for (const side of [1, -1]) {
    dot(side * 0.42, 0.5, 0.09, lit.eyes, 0.5)
    dot(side * 0.42 + 0.04, 0.55, 0.03, lit.eyes, 0.5, true)
  }
  tube(hippoTeeth, lit.grin, 0.75)
  tube(hippoGrin, lit.grin, 0.68)
}

function hippoHead(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  // A small dome for the top of the head, then out and down into the snout,
  // which is wider than the head is and takes up most of the face.
  ctx.moveTo(-r * 0.72, r * 0.45)
  ctx.quadraticCurveTo(0, r * 0.98, r * 0.72, r * 0.45)
  ctx.quadraticCurveTo(r * 1.15, r * 0.1, r * 1.05, -r * 0.45)
  ctx.quadraticCurveTo(r * 0.95, -r * 1.05, 0, -r * 1.05)
  ctx.quadraticCurveTo(-r * 0.95, -r * 1.05, -r * 1.05, -r * 0.45)
  ctx.quadraticCurveTo(-r * 1.15, r * 0.1, -r * 0.72, r * 0.45)
}

function hippoEars(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    ctx.moveTo(side * r * 0.62 + r * 0.17, r * 0.78)
    ctx.arc(side * r * 0.62, r * 0.78, r * 0.17, 0, Math.PI * 2)
  }
}

function hippoInnerEars(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    ctx.moveTo(side * r * 0.62 + r * 0.08, r * 0.8)
    ctx.arc(side * r * 0.62, r * 0.8, r * 0.08, 0, Math.PI * 2)
  }
}

function hippoEyes(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    ctx.moveTo(side * r * 0.42 + r * 0.2, r * 0.5)
    ctx.arc(side * r * 0.42, r * 0.5, r * 0.2, 0, Math.PI * 2)
  }
}

function hippoNostrils(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    ctx.moveTo(side * r * 0.4 + r * 0.15, -r * 0.3)
    ctx.ellipse(side * r * 0.4, -r * 0.3, r * 0.15, r * 0.1, 0, 0, Math.PI * 2)
  }
}

function hippoGrin(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  ctx.moveTo(-r * 0.78, -r * 0.6)
  ctx.quadraticCurveTo(0, -r * 0.98, r * 0.78, -r * 0.6)
  ctx.moveTo(-r * 0.78, -r * 0.6)
  ctx.quadraticCurveTo(-r * 0.74, -r * 0.5, -r * 0.62, -r * 0.52)
  ctx.moveTo(r * 0.78, -r * 0.6)
  ctx.quadraticCurveTo(r * 0.74, -r * 0.5, r * 0.62, -r * 0.52)
}

function hippoTeeth(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  // Two squares standing up from the smile, rounded at the top.
  for (const side of [1, -1]) {
    const x = side * r * 0.3
    const base = -r * 0.82
    ctx.moveTo(x - r * 0.09, base)
    ctx.lineTo(x - r * 0.09, base + r * 0.2)
    ctx.quadraticCurveTo(x, base + r * 0.28, x + r * 0.09, base + r * 0.2)
    ctx.lineTo(x + r * 0.09, base)
  }
}

function hippoCheeks(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    for (const k of [0, 1]) {
      const x = side * r * (0.78 + k * 0.1)
      ctx.moveTo(x, -r * 0.2)
      ctx.quadraticCurveTo(x + side * r * 0.04, -r * 0.08, x, r * 0.04)
    }
  }
}

/* ---------------------------------------------------------------------------
 * The stare
 * ---------------------------------------------------------------------------
 * Two eyes and nothing else: what looks back at you from the far side of a
 * campfire. Almonds, slanted up at the outer corners, a ring inside each,
 * a slit for a pupil, and a blink now and then - which is the whole of what
 * tells you they are eyes and not two lamps. The blink is a vertical squash
 * of the pair, so the lids close from top and bottom together the way a
 * cat's do rather than dropping like a person's.
 *
 * Lit on the grin's envelope, being first in and last out, because a stare
 * with no face has nothing to arrive after.
 */
function stare(ctx: CanvasRenderingContext2D, tube: Tube, dot: Dot, lit: Lit, lids: number) {
  ctx.save()
  ctx.scale(1, Math.max(0.04, lids))
  tube(stareEyes, lit.grin, 0)
  tube(stareRings, lit.grin, 0.3)
  tube(stareSlits, lit.grin, 0.55)
  for (const side of [1, -1]) dot(side * 0.55 + 0.1, 0.12, 0.05, lit.grin, 0.55, true)
  ctx.restore()
}

function stareEyes(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    const x = side * r * 0.55
    ctx.moveTo(x - side * r * 0.42, 0)
    ctx.quadraticCurveTo(x, r * 0.42, x + side * r * 0.42, r * 0.14)
    ctx.quadraticCurveTo(x, -r * 0.34, x - side * r * 0.42, 0)
  }
}

function stareRings(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    ctx.moveTo(side * r * 0.55 + r * 0.16, r * 0.04)
    ctx.arc(side * r * 0.55, r * 0.04, r * 0.16, 0, Math.PI * 2)
  }
}

function stareSlits(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const side of [1, -1]) {
    ctx.moveTo(side * r * 0.55, r * 0.2)
    ctx.quadraticCurveTo(side * r * 0.55 + r * 0.03, r * 0.04, side * r * 0.55, -r * 0.12)
    ctx.quadraticCurveTo(side * r * 0.55 - r * 0.03, r * 0.04, side * r * 0.55, r * 0.2)
  }
}

/* ---------------------------------------------------------------------------
 * The chameleon
 * ---------------------------------------------------------------------------
 * Side on, and built from corners rather than curves: a wedge of a head with
 * a fold across the snout, a crest standing off the back of it, a block of a
 * body, a row of spikes down the spine and a tail that curls up into a
 * square spiral. One round eye, big, and a little mouth at the tip of the
 * snout. Angular on purpose - the others are all curves, and this one is
 * drawn from a picture of a paper-cut lizard, so its tube bends at corners.
 *
 * The eye and the mouth are what come first and go last here; the head
 * follows; the body and tail are only there in the middle, which for a
 * chameleon is only proper.
 */
function chameleon(tube: Tube, dot: Dot, lit: Lit) {
  tube(chameleonBody, lit.head, 0)
  tube(chameleonTail, lit.head, 0.14)
  tube(chameleonSpikes, lit.head, 0.28)
  tube(chameleonBelly, lit.head, 0.85)
  tube(chameleonHead, lit.eyes, 0.4)
  tube(chameleonCrest, lit.eyes, 0.55)
  tube(chameleonEye, lit.grin, 0.68)
  dot(-0.22, 0.34, 0.06, lit.grin, 0.75)
  dot(-0.19, 0.38, 0.02, lit.grin, 0.75, true)
  tube(chameleonMouth, lit.grin, 0.68)
}

function chameleonHead(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  ctx.moveTo(-r * 1.0, r * 0.1)
  ctx.lineTo(-r * 0.72, r * 0.5)
  ctx.lineTo(r * 0.32, r * 0.62)
  ctx.lineTo(r * 0.3, r * 0.08)
  ctx.closePath()
  // The fold across the snout.
  ctx.moveTo(-r * 0.98, r * 0.12)
  ctx.lineTo(r * 0.28, r * 0.28)
}

function chameleonCrest(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  ctx.moveTo(r * 0.3, r * 0.62)
  ctx.lineTo(r * 0.7, r * 0.8)
  ctx.lineTo(r * 0.95, r * 0.55)
  ctx.lineTo(r * 0.52, r * 0.36)
  ctx.closePath()
}

function chameleonBody(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  ctx.moveTo(-r * 0.6, r * 0.06)
  ctx.lineTo(r * 0.3, r * 0.06)
  ctx.lineTo(r * 0.44, -r * 0.72)
  ctx.lineTo(-r * 0.74, -r * 0.72)
  ctx.closePath()
  // The one scratch on the flank.
  ctx.moveTo(-r * 0.08, -r * 0.22)
  ctx.lineTo(-r * 0.2, -r * 0.46)
}

function chameleonSpikes(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (const [x, y] of [
    [0.34, -0.06],
    [0.4, -0.3],
  ] as const) {
    ctx.moveTo(r * x, r * y)
    ctx.lineTo(r * (x + 0.2), r * (y + 0.06))
    ctx.lineTo(r * (x + 0.04), r * (y - 0.18))
  }
}

function chameleonTail(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  // Out from the rump, then in to the centre by right angles that shrink.
  ctx.moveTo(r * 0.42, -r * 0.6)
  let x = 0.98
  let y = -0.6
  ctx.lineTo(r * x, r * y)
  const turns: [number, number][] = [
    [0.98, -1.05],
    [0.5, -1.05],
    [0.5, -0.72],
    [0.86, -0.72],
    [0.86, -0.94],
    [0.62, -0.94],
    [0.62, -0.82],
    [0.74, -0.82],
  ]
  for (const [tx, ty] of turns) {
    x = tx
    y = ty
    ctx.lineTo(r * x, r * y)
  }
}

function chameleonBelly(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  ctx.moveTo(-r * 0.38, -r * 0.72)
  ctx.quadraticCurveTo(-r * 0.2, -r * 0.4, -r * 0.02, -r * 0.72)
}

function chameleonEye(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  ctx.moveTo(-r * 0.22 + r * 0.13, r * 0.34)
  ctx.arc(-r * 0.22, r * 0.34, r * 0.13, 0, Math.PI * 2)
}

function chameleonMouth(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  ctx.moveTo(-r * 0.72, r * 0.36)
  ctx.quadraticCurveTo(-r * 0.66, r * 0.24, -r * 0.78, r * 0.2)
}
