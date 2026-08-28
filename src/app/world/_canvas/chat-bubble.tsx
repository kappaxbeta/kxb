'use client'

import { Billboard } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { SAID_DURATION_MS, type SaidState } from '@/app/world/_presence/presence-core'
import { SAID_BLUE, SAID_BLUE_DEEP, SAID_EDGE, SAID_INK } from '@/domain/world/speech'

/**
 * What somebody just said, floating over them.
 *
 * Drawn to a canvas and used as a texture, the same way `Nameplate` is and for
 * the same reason: drei's `<Text>` is troika underneath, troika ships with no
 * font configured, and the usual arrangement fetches one over the network at
 * first render. A speech bubble that arrives blank and fills in a moment later
 * is worse than a nameplate doing it, because the thing it is late for has
 * already scrolled past in the panel.
 *
 * Sits above the emote bubble rather than replacing it. The two are different
 * registers and people use both at once - somebody asks a question and pulls a
 * face at the answer - so stacking them keeps a reply from erasing the reaction
 * that prompted it.
 *
 * ---------------------------------------------------------------------------
 * Why this one is allowed React state and `EmoteBubble` is not
 * ---------------------------------------------------------------------------
 * The emote's whole design note is that it must never re-render: an emote is
 * somebody else's packet arriving, and turning that into state would re-render
 * every avatar in the room each time anybody pulled a face. All it actually
 * needs per frame is one texture offset, which is a frame-loop job.
 *
 * A sentence cannot be a texture offset. There is no sheet of every possible
 * line, so a new message means measuring, wrapping and painting a canvas - real
 * work that must not happen sixty times a second. So the *text* is state,
 * changed once per message, and the pop and fade stay in the frame loop where
 * they belong. Once per sentence is a rate React is for.
 */

/** How long the bubble takes to spring up, in milliseconds. */
const POP_MS = 260

/** How long it spends fading out at the end. */
const FADE_MS = 420

/** Rendered at twice the display size, so it stays sharp on a HiDPI screen. */
const SCALE = 2

const FONT_PX = 26
const LINE_PX = 34
const PAD_X = 22
const PAD_Y = 15

/**
 * The tail, in canvas pixels before `SCALE`.
 *
 * The one thing that turns a rounded rectangle into somebody *speaking*. A box
 * over a head is a label - a name, a health bar, a marker - and the room is
 * already full of those; the spike pointing back down at whoever said it is the
 * whole difference, and it costs three lines of canvas.
 */
const TAIL_W = 26
const TAIL_H = 18

/** Widest the bubble is allowed to get, in canvas pixels before `SCALE`. */
const MAX_WIDTH_PX = 330

/**
 * Most lines drawn before the rest is cut.
 *
 * A bubble is a glance, not a document. Past four lines it stops being a label
 * on a person and starts being weather over the room - and the panel two
 * centimetres away has the whole message in it, which is the honest place to
 * read something this long.
 */
const MAX_LINES = 4

/**
 * How tall one line of text is, in world units. **The knob to turn.**
 *
 * Everything else about the bubble's size follows from it: the canvas is
 * measured in pixels and mapped to the world at `LINE_WORLD_HEIGHT / LINE_PX`,
 * so the padding, the tail and the corner radius all scale with this and the
 * proportions cannot drift.
 *
 * It was effectively 0.067. That was not a decision - the old code multiplied
 * this constant by the *line count* to get the height of the whole plane, so
 * the number described the bubble and the text inside it came out at whatever
 * fraction of that the padding left over. Against an animal that stands about
 * 1.7 units tall, a 0.067 line is four per cent of a body: legible with your
 * nose against it and a grey smudge from anywhere else in the room.
 */
const LINE_WORLD_HEIGHT = 0.2

/** Canvas pixels to world units, so every part of the bubble scales together. */
const WORLD_PER_PX = LINE_WORLD_HEIGHT / LINE_PX

/**
 * Where the bubble stops growing on the screen as somebody walks away.
 *
 * Past this distance the bubble is scaled up in step with how far off it is, so
 * a line said across the room stays the size it was said at rather than
 * shrinking into an unreadable smudge. Under it nothing happens at all: a
 * bubble two metres from your face does not need help.
 *
 * Capped, and the cap is the point. Uncapped, this is a billboard that grows
 * without limit - somebody talking from the far side of a battlefield ends up
 * with a sentence across the whole viewport, which is a worse failure than the
 * smudge it was fixing.
 */
const READABLE_FROM = 14
const MAX_DISTANCE_GAIN = 1.5

/**
 * The longest prefix of a word that still fits. At least one character.
 *
 * Binary search rather than a character-at-a-time walk: `measureText` is the
 * expensive call here, and a sixty-character URL is six measurements this way
 * against sixty the other. Never returns zero, so the caller that chops a word
 * with it always makes progress.
 */
function longestPrefix(context: CanvasRenderingContext2D, word: string, max: number): number {
  let low = 1
  let high = word.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (context.measureText(word.slice(0, mid)).width <= max) low = mid
    else high = mid - 1
  }
  return low
}

/**
 * Break a message into lines that fit, measuring as we go.
 *
 * Greedy word wrap, plus a hard break for a single "word" that is wider than
 * the bubble will ever be - a pasted URL, or somebody leaning on a key.
 *
 * That case used to be handled by giving up: the word went onto a line of its
 * own *at its full width*, and the bubble was sized from the widest line. A
 * sixty-character URL then painted a canvas 1566px wide, which at this scale is
 * a billboard about four and a half world units across - wider than the room
 * reads, hanging over the head of whoever pasted it. Cutting the word where it
 * runs out of room keeps the bubble inside `MAX_WIDTH_PX` whatever is said in
 * it, which is the only way that constant means anything.
 *
 * Exported for the tests: this is the one piece of the bubble that is a pure
 * function of a string and a width, and it is also the piece with the edge cases
 * worth pinning down.
 */
export function wrap(context: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''

  const flush = () => {
    if (line) {
      lines.push(line)
      line = ''
    }
  }

  for (let word of text.split(/\s+/)) {
    if (!word) continue

    // Chop anything that cannot fit on a line by itself, one full line at a
    // time, until what is left is an ordinary word again.
    while (context.measureText(word).width > max && lines.length <= MAX_LINES) {
      flush()
      const take = longestPrefix(context, word, max)
      lines.push(word.slice(0, take))
      word = word.slice(take)
    }
    if (!word) continue

    const candidate = line ? `${line} ${word}` : word
    if (context.measureText(candidate).width <= max || !line) {
      line = candidate
      continue
    }
    flush()
    line = word
  }

  flush()

  if (lines.length <= MAX_LINES) return lines
  const kept = lines.slice(0, MAX_LINES)
  kept[MAX_LINES - 1] = `${kept[MAX_LINES - 1]?.slice(0, -1) ?? ''}…`
  return kept
}

/**
 * The rounded box and the spike under it, as one path.
 *
 * One path rather than two shapes so the fill and the stroke both run round the
 * outside of the whole bubble. Drawn as two overlapping shapes instead, the
 * stroke draws a line straight across the join - a bubble with a lid on it.
 */
function bubblePath(
  context: CanvasRenderingContext2D,
  width: number,
  boxHeight: number,
  radius: number,
) {
  const tailH = TAIL_H * SCALE
  /*
    The tail narrows on a narrow bubble rather than punching through its side.

    "hi" is about 90 canvas pixels of box between two 40px corners, and a fixed
    52px tail placed a third of the way across starts inside the left round and
    ends inside the right one - which draws a spike out of the curve and a notch
    in the bottom edge. Half the straight run is always a tail that fits.
  */
  const flat = Math.max(0, width - radius * 2)
  const tailW = Math.min(TAIL_W * SCALE, flat / 2)
  // Off-centre by a third of its own width. A tail dead in the middle of the
  // box reads as a diagram of a speech bubble; slightly to the left is how one
  // is drawn.
  const tailX = Math.min(width - radius, Math.max(radius + tailW, width * 0.38))

  context.beginPath()
  context.moveTo(radius, 0)
  context.lineTo(width - radius, 0)
  context.quadraticCurveTo(width, 0, width, radius)
  context.lineTo(width, boxHeight - radius)
  context.quadraticCurveTo(width, boxHeight, width - radius, boxHeight)
  // Out along the bottom edge, down to the point, and back.
  context.lineTo(tailX, boxHeight)
  context.lineTo(tailX - tailW * 0.45, boxHeight + tailH)
  context.lineTo(tailX - tailW, boxHeight)
  context.lineTo(radius, boxHeight)
  context.quadraticCurveTo(0, boxHeight, 0, boxHeight - radius)
  context.lineTo(0, radius)
  context.quadraticCurveTo(0, 0, radius, 0)
  context.closePath()
}

export function ChatBubble({
  state,
  /**
   * Where the tail points, not where the bubble is centred.
   *
   * It was the centre, and the difference matters once the bubble has a tail
   * and four possible heights: anchored by its middle, a long message grows
   * *down* into the head of whoever said it. Anchored at the tip, every bubble
   * starts at the same place above the emote and grows upward into empty sky.
   */
  height = 3.6,
}: {
  state: React.RefObject<SaidState>
  height?: number
}) {
  const group = useRef<THREE.Group>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const camera = useThree((state) => state.camera)

  /**
   * The line currently painted.
   *
   * Read out of the ref by the frame loop and promoted to state only when it
   * changes, which is once per message rather than once per frame. `shown`
   * mirrors it so the loop can compare without reading state it may not have
   * committed yet - a `setState` in `useFrame` does not take effect until the
   * next render, and without the mirror this would repaint on every frame in
   * between.
   */
  const [text, setText] = useState<string | null>(null)
  const shown = useRef<string | null>(null)

  const bubble = useMemo(() => {
    if (!text) return null

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return null

    const font = `500 ${FONT_PX * SCALE}px ui-sans-serif, system-ui, sans-serif`
    context.font = font

    const lines = wrap(context, text, MAX_WIDTH_PX * SCALE)
    const widest = Math.max(...lines.map((line) => context.measureText(line).width))

    const boxHeight = lines.length * LINE_PX * SCALE + PAD_Y * 2 * SCALE
    // The margin is for the stroke and the glow, which are drawn *on* the edge
    // of the path and would otherwise be clipped in half by the canvas bounds.
    const margin = 6 * SCALE

    // Measure first, then size the canvas - a resize resets the context, so the
    // font has to be set again afterwards.
    canvas.width = Math.ceil(widest + PAD_X * 2 * SCALE + margin * 2)
    canvas.height = Math.ceil(boxHeight + TAIL_H * SCALE + margin * 2)

    context.font = font
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.translate(margin, margin)

    const width = canvas.width - margin * 2
    const radius = Math.min(20 * SCALE, boxHeight / 2)

    bubblePath(context, width, boxHeight, radius)

    /*
      Blue, and opaque. See `@/domain/world/speech` for why.

      It was the app's raised surface at 88% - the same near-black indigo as the
      HUD, the panels and the nameplate - on the grounds that a bubble should be
      part of the room rather than sitting on top of it. That reasoning holds for
      chrome and is wrong for dialogue: it made a sentence look like another
      label in a room already full of them.

      Opaque rather than translucent now, because the fill is carrying the
      meaning: a blue you can see a wall through is a different blue depending on
      the wall.

      The glow underneath is doing the work `depthTest: false` cannot: with
      occlusion off, a bubble in front of a pale block has no edge at all, and a
      soft dark halo separates it from whatever it is floating over.
    */
    const fill = context.createLinearGradient(0, 0, 0, boxHeight)
    fill.addColorStop(0, SAID_BLUE)
    fill.addColorStop(1, SAID_BLUE_DEEP)

    context.save()
    context.shadowColor = 'rgba(0, 0, 0, 0.55)'
    context.shadowBlur = 10 * SCALE
    context.shadowOffsetY = 2 * SCALE
    context.fillStyle = fill
    context.fill()
    context.restore()

    context.strokeStyle = SAID_EDGE
    context.lineWidth = 2 * SCALE
    context.stroke()

    context.fillStyle = SAID_INK
    lines.forEach((line, index) => {
      context.fillText(
        line,
        width / 2,
        PAD_Y * SCALE + (index + 0.5) * LINE_PX * SCALE,
      )
    })

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    // No mipmaps: the bubble faces the camera and is read at roughly one size.
    texture.minFilter = THREE.LinearFilter
    texture.generateMipmaps = false

    return {
      texture,
      // The plane is the whole canvas - box, tail and the margin the glow
      // needs - mapped through one ratio, so nothing inside it can be out of
      // proportion with anything else.
      worldWidth: (canvas.width / SCALE) * WORLD_PER_PX,
      worldHeight: (canvas.height / SCALE) * WORLD_PER_PX,
    }
  }, [text])

  // One canvas per message means one texture per message, and a room that talks
  // for an hour is a lot of textures to leave on the GPU.
  useEffect(() => () => bubble?.texture.dispose(), [bubble])

  /** Scratch, so the per-frame distance check allocates nothing. */
  const here = useRef(new THREE.Vector3())

  useFrame(() => {
    const node = group.current
    const slot = state.current
    if (!slot) return

    const now = performance.now()
    const live = slot.text !== null && now < slot.until

    if (!live) {
      // Cheapest possible early out for the overwhelmingly common case: nobody
      // in the room is talking, so there is nothing to compute.
      if (shown.current !== null) {
        shown.current = null
        setText(null)
      }
      if (node?.visible) node.visible = false
      return
    }

    if (slot.text !== shown.current) {
      shown.current = slot.text
      setText(slot.text)
      // Nothing else this frame: the canvas does not exist until the render
      // that state schedules, and `node` is still holding the previous line.
      return
    }

    if (!node) return
    node.visible = true

    const age = now - (slot.until - SAID_DURATION_MS)
    const remaining = slot.until - now

    /**
     * Up, past itself, and back - and it arrives from below.
     *
     * The old pop was the emote's: a 140ms scale from 0.6 with a quadratic that
     * barely overshoots. That is the right curve for a face, which is a stamp,
     * and the wrong one for a sentence, which is somebody speaking. This one
     * runs nearly twice as long, breaks 1 at the midpoint and settles back, and
     * rises about a fifth of a line-height on the way - so the bubble reads as
     * lifting off the head that said it rather than as being switched on.
     *
     * `sin(pi * t)` for the overshoot rather than a spring: it is zero at both
     * ends by construction, so the bubble cannot land anywhere but exactly 1,
     * and there is no settling tail to tune.
     */
    const pop = Math.min(1, age / POP_MS)
    const eased = 1 - (1 - pop) ** 3
    const springy = 0.55 + 0.45 * eased + Math.sin(pop * Math.PI) * 0.12

    /**
     * Bigger the further away it is, up to a point. See `READABLE_FROM`.
     *
     * The world position rather than the group's own `position`: this hangs off
     * an avatar that is being moved around the room, so the local offset is a
     * constant 3.6 and says nothing about where the speaker actually is.
     */
    node.getWorldPosition(here.current)
    const distance = here.current.distanceTo(camera.position)
    const gain = Math.min(MAX_DISTANCE_GAIN, Math.max(1, distance / READABLE_FROM))

    node.scale.setScalar(springy * gain)
    node.position.y = height - (1 - eased) * 0.22

    if (material.current) {
      material.current.opacity = Math.min(1, remaining / FADE_MS)
    }
  })

  if (!bubble) return null

  return (
    <group ref={group} position={[0, height, 0]} visible={false}>
      <Billboard>
        {/*
          `depthTest` off, matching the nameplate, the health bar and the emote:
          a sentence swallowed by the wall somebody is standing behind is a
          sentence nobody heard, and seeing the room talk matters more here than
          strict occlusion.

          Lifted by half its own height so the group's origin is the tail's
          point. See the note on `height`.
        */}
        <mesh
          userData={{ ignoreRay: true }}
          renderOrder={25}
          position={[0, bubble.worldHeight / 2, 0]}
        >
          <planeGeometry args={[bubble.worldWidth, bubble.worldHeight]} />
          <meshBasicMaterial
            ref={material}
            map={bubble.texture}
            transparent
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </Billboard>
    </group>
  )
}
