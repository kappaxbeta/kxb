import { patchColour, type Fish } from '@/app/components/ink/ink-fish'
import { css, palette } from '@/app/components/ink/ink-palettes'
import type { InkSettings } from '@/app/components/ink/ink-settings'

/**
 * How a fish is drawn.
 *
 * The chain from ./ink-fish, put on a 2D canvas over the water, in the
 * colours the mode's palette gives its patches. Every joint is a circle
 * with an aura - a glow that falls off outside its edge, laid down
 * additively so where two circles overlap they brighten instead of
 * covering. Under the body go the fins: a swept pair off one joint, a tail
 * in two lobes, and on some fish a ridge along the back, all beating with
 * the wag. Then the body itself: each circle filled softly in its patch's
 * colour, so the runs of light and deep read as markings and melt into
 * each other at the seams, and one smooth outline through the sides of all
 * of them, which is what makes a string of circles a fish. A thin ring at
 * each circle's edge keeps the joints visible - in neon it is most of the
 * picture. Eyes only if asked for, at the size asked for, and scattered
 * about it per fish if that is asked for too.
 *
 * The overlay is drawn every frame and cleared every frame; it holds
 * nothing. The water underneath keeps the wake, this keeps the body.
 */

export function drawSchool(
  ctx: CanvasRenderingContext2D,
  fish: readonly Fish[],
  settings: InkSettings,
  width: number,
  height: number,
  t: number,
) {
  if (fish.length === 0) return
  const colours = palette(settings.mode)
  const aspect = width / height
  // Chain space is height units with x scaled by the aspect; the canvas is
  // pixels with y down. One transform does both.
  const px = (x: number) => (x / aspect) * width
  const py = (y: number) => (1 - y) * height
  const pr = (r: number) => r * height

  for (const f of fish) {
    const { form, joints } = f
    const radii = form.profile.map((k) => f.radius * k)
    const tints = joints.map((_, i) => css(patchColour(f, i, t, colours.patch, colours.drift)))
    const light = css(colours.patch('light', f.hueA + t * 0.006))
    const head = joints[0]!
    const headR = radii[0]!
    const beat = Math.sin(f.wag) * 0.25

    // Aura first, additive, one gradient per joint. Dark patches have none.
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < joints.length; i++) {
      if (f.pattern[i] === 'dark') continue
      const j = joints[i]!
      const radius = pr(radii[i]!)
      const x = px(j.x)
      const y = py(j.y)
      const c = tints[i]!
      const a = colours.aura
      const reach = colours.reach
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * reach)
      glow.addColorStop(0, `rgba(${c}, ${0.05 * a})`)
      glow.addColorStop(Math.max(0.01, 1 / reach - 0.08), `rgba(${c}, ${0.16 * a})`)
      glow.addColorStop(1 / reach, `rgba(${c}, ${0.55 * a})`)
      glow.addColorStop(Math.min(1, 1 / reach + 0.12), `rgba(${c}, ${0.18 * a})`)
      glow.addColorStop(1, `rgba(${c}, 0)`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(x, y, radius * reach, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'

    ctx.lineWidth = 1
    ctx.lineJoin = 'round'

    // Pectoral fins: a leaf off each side of one joint, swept back, beating.
    const finJoint = joints[form.finJoint]!
    const finNext = joints[form.finJoint + 1]!
    const finAngle = Math.atan2(finJoint.y - finNext.y, finJoint.x - finNext.x)
    for (const side of [1, -1]) {
      const a = finAngle + side * (form.finSweep + beat * side)
      const len = pr(radii[form.finJoint]! * form.finLength)
      const wide = len * 0.32
      ctx.save()
      ctx.translate(px(finJoint.x), py(finJoint.y))
      ctx.rotate(-a)
      leaf(ctx, len, wide)
      ctx.fillStyle = `rgba(${light}, 0.16)`
      ctx.fill()
      ctx.strokeStyle = `rgba(${light}, 0.45)`
      ctx.stroke()
      ctx.restore()
    }

    // The tail: two lobes off the last joint, opening and closing with the wag.
    const tail = joints[joints.length - 1]!
    const beforeTail = joints[joints.length - 2]!
    const tailAngle = Math.atan2(tail.y - beforeTail.y, tail.x - beforeTail.x)
    const tailLen = pr(headR * form.tailLength)
    const spread = tailLen * form.tailSpread
    ctx.save()
    ctx.translate(px(tail.x), py(tail.y))
    ctx.rotate(-tailAngle)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(tailLen * 0.4, -spread * 0.15, tailLen * 0.7, -spread * (0.5 + beat), tailLen, -spread * (0.9 + beat))
    ctx.quadraticCurveTo(tailLen * 0.55, 0, tailLen, spread * (0.9 - beat))
    ctx.bezierCurveTo(tailLen * 0.7, spread * (0.5 - beat), tailLen * 0.4, spread * 0.15, 0, 0)
    ctx.fillStyle = `rgba(${light}, 0.14)`
    ctx.fill()
    ctx.strokeStyle = `rgba(${light}, 0.45)`
    ctx.stroke()
    ctx.restore()

    // A dorsal ridge, on the fish that have one: a line down the spine over
    // the middle of the body, brightest where the body is widest.
    if (form.dorsal) {
      const from = 2
      const to = Math.max(from + 2, Math.floor(joints.length * 0.7))
      ctx.beginPath()
      ctx.moveTo(px(joints[from]!.x), py(joints[from]!.y))
      for (let i = from + 1; i <= to; i++) ctx.lineTo(px(joints[i]!.x), py(joints[i]!.y))
      ctx.strokeStyle = `rgba(${light}, 0.35)`
      ctx.lineWidth = Math.max(1, pr(headR) * 0.12)
      ctx.stroke()
      ctx.lineWidth = 1
    }

    // The body: every circle filled softly in its patch's colour, tail first
    // so the head sits on top, then a thin ring at each edge.
    for (let i = joints.length - 1; i >= 0; i--) {
      const j = joints[i]!
      const radius = pr(radii[i]!)
      const x = px(j.x)
      const y = py(j.y)
      const c = tints[i]!
      const alpha = colours.fill[f.pattern[i]!]
      const fill = ctx.createRadialGradient(x, y, 0, x, y, radius)
      fill.addColorStop(0, `rgba(${c}, ${alpha})`)
      fill.addColorStop(0.7, `rgba(${c}, ${alpha * 0.8})`)
      fill.addColorStop(1, `rgba(${c}, ${alpha * 0.25})`)
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = `rgba(${c}, ${colours.ring})`
      ctx.stroke()
    }

    // The outline: one point either side of every joint, perpendicular to
    // the spine there, joined by curves round the whole body.
    const left: [number, number][] = []
    const right: [number, number][] = []
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i]!
      const next = joints[Math.min(i + 1, joints.length - 1)]!
      const prev = joints[Math.max(i - 1, 0)]!
      const angle = Math.atan2(prev.y - next.y, prev.x - next.x)
      const r = radii[i]!
      left.push([px(j.x + Math.cos(angle + Math.PI / 2) * r), py(j.y + Math.sin(angle + Math.PI / 2) * r)])
      right.push([px(j.x + Math.cos(angle - Math.PI / 2) * r), py(j.y + Math.sin(angle - Math.PI / 2) * r)])
    }
    const nose: [number, number] = [px(head.x + Math.cos(f.heading) * headR), py(head.y + Math.sin(f.heading) * headR)]
    const end: [number, number] = [px(tail.x), py(tail.y)]
    ctx.beginPath()
    ctx.moveTo(nose[0], nose[1])
    smooth(ctx, [nose, ...left, end])
    smooth(ctx, [end, ...right.slice().reverse(), nose])
    ctx.closePath()
    ctx.strokeStyle = `rgba(${light}, 0.5)`
    ctx.lineWidth = 1.1
    ctx.stroke()

    // Eyes, if asked for: a white ball on each side of the head with a dark
    // pupil looking the way the fish is going - or, with the scatter on and
    // for the fish that drew it, the reverse, a black eye with a pale pupil.
    if (settings.eyes) {
      const scatter = settings.eyeScatter
      const dark = scatter && form.eyeDark
      const ball = dark ? 'rgba(8, 4, 10, 0.95)' : 'rgba(255, 250, 245, 0.95)'
      const pupil = dark ? `rgba(${light}, 0.95)` : 'rgba(8, 4, 10, 0.95)'
      const er = Math.max(1.5, pr(headR) * 0.3 * settings.eyeSize * (scatter ? form.eye : 1))
      for (const side of [1, -1]) {
        const a = f.heading + (side * Math.PI) / 2
        const ex = px(head.x + Math.cos(f.heading) * headR * 0.3 + Math.cos(a) * headR * 0.62)
        const ey = py(head.y + Math.sin(f.heading) * headR * 0.3 + Math.sin(a) * headR * 0.62)
        ctx.beginPath()
        ctx.arc(ex, ey, er, 0, Math.PI * 2)
        ctx.fillStyle = ball
        ctx.fill()
        ctx.strokeStyle = `rgba(${light}, 0.6)`
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(ex + Math.cos(f.heading) * er * 0.35, ey - Math.sin(f.heading) * er * 0.35, er * 0.5, 0, Math.PI * 2)
        ctx.fillStyle = pupil
        ctx.fill()
      }
    }
  }
}

/** A tapered leaf from the origin along +x, `len` long and `wide` across. */
function leaf(ctx: CanvasRenderingContext2D, len: number, wide: number) {
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(len * 0.3, -wide, len * 0.8, -wide * 0.7, len, 0)
  ctx.bezierCurveTo(len * 0.8, wide * 0.7, len * 0.3, wide, 0, 0)
  ctx.closePath()
}

/** Continue the current path through the points with midpoint quadratics. */
function smooth(ctx: CanvasRenderingContext2D, points: readonly [number, number][]) {
  for (let i = 1; i < points.length - 1; i++) {
    const [x0, y0] = points[i]!
    const [x1, y1] = points[i + 1]!
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  const last = points[points.length - 1]!
  ctx.lineTo(last[0], last[1])
}
