import type { Jelly } from '@/app/components/ink/ink-jelly'
import { css, palette } from '@/app/components/ink/ink-palettes'
import type { InkSettings } from '@/app/components/ink/ink-settings'

/**
 * How a jellyfish is drawn.
 *
 * The bell is a dome: a half-ellipse pointed along the heading, wider and
 * shallower at rest, narrower and taller as it contracts. It gets an aura
 * like a fish's joint does - additive, in the mode's light colour at this
 * one's hue - a bright rim, and a fainter inner dome that reads as the
 * inside of a thing you can see through. The tentacles are the chains from
 * ./ink-jelly drawn as curves, thin, fading toward their tips, with a soft
 * wide stroke under each so they glow the way the body does.
 */

export function drawJellies(
  ctx: CanvasRenderingContext2D,
  jellies: readonly Jelly[],
  settings: InkSettings,
  width: number,
  height: number,
  t: number,
) {
  if (jellies.length === 0) return
  const colours = palette(settings.mode)
  const aspect = width / height
  const px = (x: number) => (x / aspect) * width
  const py = (y: number) => (1 - y) * height
  const pr = (r: number) => r * height

  for (const j of jellies) {
    const light = css(colours.patch('light', j.hue + t * 0.006))
    const deep = css(colours.patch('deep', j.hue + 0.4 + t * 0.006))
    // The contraction: a pulse that peaks just after the beat and relaxes
    // over the rest of the cycle.
    const pulse = Math.exp(-j.beat * 5) * (1 - Math.exp(-j.beat * 40))
    const r = pr(j.radius)
    const w = r * (1 - 0.22 * pulse)
    const h = r * (0.75 + 0.3 * pulse)
    const x = px(j.x)
    const y = py(j.y)

    // Tentacles first, under the bell. Two passes: a wide faint glow, then
    // the line itself, both fading toward the tip.
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const chain of j.tentacles) {
      for (const pass of [0, 1]) {
        ctx.globalCompositeOperation = pass === 0 ? 'lighter' : 'source-over'
        for (let i = 1; i < chain.length; i++) {
          const a = chain[i - 1]!
          const b = chain[i]!
          const fade = 1 - i / chain.length
          ctx.beginPath()
          ctx.moveTo(px(a.x), py(a.y))
          ctx.lineTo(px(b.x), py(b.y))
          if (pass === 0) {
            ctx.strokeStyle = `rgba(${light}, ${0.08 * fade * colours.aura})`
            ctx.lineWidth = Math.max(2, r * 0.18)
          } else {
            ctx.strokeStyle = `rgba(${light}, ${0.55 * fade})`
            ctx.lineWidth = Math.max(0.8, r * 0.035)
          }
          ctx.stroke()
        }
      }
    }

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-j.heading + Math.PI / 2)

    // Aura, additive, from the centre of the bell out past its rim.
    ctx.globalCompositeOperation = 'lighter'
    const reach = colours.reach
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, w * reach)
    glow.addColorStop(0, `rgba(${light}, ${0.1 * colours.aura})`)
    glow.addColorStop(1 / reach, `rgba(${light}, ${0.4 * colours.aura})`)
    glow.addColorStop(Math.min(1, 1 / reach + 0.15), `rgba(${light}, ${0.12 * colours.aura})`)
    glow.addColorStop(1, `rgba(${light}, 0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, 0, w * reach, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'

    // The bell: dome up (the heading is now up), flat rim across the bottom
    // with a soft scallop to it.
    ctx.beginPath()
    ctx.ellipse(0, 0, w, h, 0, Math.PI, Math.PI * 2)
    const scallops = 5
    for (let i = 0; i <= scallops; i++) {
      const u = i / scallops
      const sx = w - u * 2 * w
      ctx.quadraticCurveTo(sx + w / scallops, h * 0.18, sx, 0)
    }
    ctx.closePath()
    const fill = ctx.createLinearGradient(0, -h, 0, 0)
    fill.addColorStop(0, `rgba(${light}, ${colours.fill.light * 0.9})`)
    fill.addColorStop(1, `rgba(${deep}, ${colours.fill.deep * 0.35})`)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = `rgba(${light}, ${Math.max(0.5, colours.ring)})`
    ctx.lineWidth = 1.2
    ctx.stroke()

    // The inner dome, and the four-leaf mark a moon jelly wears.
    ctx.beginPath()
    ctx.ellipse(0, -h * 0.1, w * 0.62, h * 0.62, 0, Math.PI, Math.PI * 2)
    ctx.strokeStyle = `rgba(${light}, 0.3)`
    ctx.lineWidth = 1
    ctx.stroke()
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4
      ctx.beginPath()
      ctx.ellipse(Math.cos(a) * w * 0.2, -h * 0.35 + Math.sin(a) * h * 0.18, w * 0.16, h * 0.1, a, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${deep}, 0.35)`
      ctx.fill()
    }

    ctx.restore()
  }
}
