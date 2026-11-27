import { css, palette } from '@/app/components/ink/ink-palettes'
import type { InkSettings } from '@/app/components/ink/ink-settings'
import type { Turtle } from '@/app/components/ink/ink-turtle'

/**
 * How a turtle is drawn.
 *
 * Comic rather than anatomical: a fat outline in the mode's light colour
 * with a glow behind it, a shell that is an ellipse with a few scutes
 * scratched on it, a round head poked out the front, four flippers that
 * sweep back through the stroke and drift forward again on the coast, and a
 * stub of tail. On the shell, a pixel k - the brand's letter, drawn as a
 * five-by-seven bitmap of squares in the deep colour, because a turtle in
 * this pond belongs to somebody.
 *
 * Everything is placed from the position, heading and stroke phase that
 * ./ink-turtle keeps; nothing here is remembered between frames.
 */

/** The letter, five wide and seven tall, top row first. */
const K = [
  0b10000, //
  0b10010,
  0b10100,
  0b11000,
  0b10100,
  0b10010,
  0b10001,
] as const

export function drawTurtles(
  ctx: CanvasRenderingContext2D,
  turtles: readonly Turtle[],
  settings: InkSettings,
  width: number,
  height: number,
  t: number,
) {
  if (turtles.length === 0) return
  const colours = palette(settings.mode)
  const aspect = width / height
  const px = (x: number) => (x / aspect) * width
  const py = (y: number) => (1 - y) * height
  const pr = (r: number) => r * height

  for (const u of turtles) {
    const light = css(colours.patch('light', u.hue + t * 0.006))
    const deep = css(colours.patch('deep', u.hue + 0.35 + t * 0.006))
    const dark = css(colours.patch('dark', u.hue + t * 0.006))
    const r = pr(u.radius)
    // The stroke: flippers back at the beat, forward again over the coast.
    const sweep = Math.exp(-u.stroke * 4) * (1 - Math.exp(-u.stroke * 30))
    const line = Math.max(1.5, r * 0.09)

    ctx.save()
    ctx.translate(px(u.x), py(u.y))
    ctx.rotate(-u.heading)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    // Glow, additive, behind the whole animal.
    ctx.globalCompositeOperation = 'lighter'
    const reach = colours.reach
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * reach)
    glow.addColorStop(0, `rgba(${light}, ${0.12 * colours.aura})`)
    glow.addColorStop(1 / reach, `rgba(${light}, ${0.35 * colours.aura})`)
    glow.addColorStop(Math.min(1, 1 / reach + 0.15), `rgba(${light}, ${0.1 * colours.aura})`)
    glow.addColorStop(1, `rgba(${light}, 0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, 0, r * reach, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'

    // Flippers: front pair long and swept, back pair short. Drawn under
    // the shell so only their outer part shows.
    ctx.strokeStyle = `rgba(${light}, 0.95)`
    ctx.fillStyle = `rgba(${dark}, 0.8)`
    ctx.lineWidth = line
    for (const side of [1, -1]) {
      for (const [ax, len, base] of [
        [r * 0.45, r * 1.15, 0.9],
        [-r * 0.5, r * 0.65, 2.2],
      ] as const) {
        const a = side * (base + sweep * 1.2)
        ctx.save()
        ctx.translate(ax, side * r * 0.55)
        ctx.rotate(-a)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.bezierCurveTo(len * 0.3, -len * 0.28, len * 0.8, -len * 0.22, len, 0)
        ctx.bezierCurveTo(len * 0.8, len * 0.22, len * 0.3, len * 0.28, 0, 0)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
    }

    // Tail and head, also under the shell.
    ctx.beginPath()
    ctx.moveTo(-r * 0.9, 0)
    ctx.lineTo(-r * 1.25, r * 0.12)
    ctx.lineTo(-r * 1.25, -r * 0.12)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(r * 1.1, 0, r * 0.32, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // Two dots for eyes, always: a comic turtle without eyes is a stone.
    ctx.fillStyle = `rgba(${light}, 0.95)`
    for (const side of [1, -1]) {
      ctx.beginPath()
      ctx.arc(r * 1.22, side * r * 0.14, Math.max(1, r * 0.05), 0, Math.PI * 2)
      ctx.fill()
    }

    // The shell.
    ctx.beginPath()
    ctx.ellipse(0, 0, r, r * 0.78, 0, 0, Math.PI * 2)
    const fill = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r)
    fill.addColorStop(0, `rgba(${deep}, ${Math.max(0.35, colours.fill.deep)})`)
    fill.addColorStop(1, `rgba(${dark}, 0.9)`)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = `rgba(${light}, 1)`
    ctx.lineWidth = line * 1.3
    ctx.stroke()

    // Scutes: a ring of lines from an inner hexagon to the rim.
    ctx.lineWidth = Math.max(1, line * 0.5)
    ctx.strokeStyle = `rgba(${light}, 0.55)`
    ctx.beginPath()
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const x = Math.cos(a) * r * 0.42
      const y = Math.sin(a) * r * 0.34
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.34)
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.78)
      ctx.stroke()
    }

    // The pixel k, upright to the turtle, in the middle of the shell.
    const cell = r * 0.09
    ctx.fillStyle = `rgba(${light}, 0.95)`
    for (let row = 0; row < K.length; row++) {
      for (let col = 0; col < 5; col++) {
        if (!(K[row]! & (1 << (4 - col)))) continue
        // Rows run down the turtle's left-right axis so the letter reads
        // when the turtle swims to the right.
        const x = (row - 3) * cell
        const y = (col - 2) * cell
        ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell)
      }
    }

    ctx.restore()
  }
}
