'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CONTROLS_SECONDS, followYaw, panelSpot, type HudLine } from '@/app/xp/_runtime/input/vr-hud'

/**
 * The HUD as a thing in the world, for the eyes that cannot see the page.
 *
 * ---------------------------------------------------------------------------
 * Drawn on a canvas, not with a font loader
 * ---------------------------------------------------------------------------
 * The obvious way to put text in a three.js scene is drei's `Text`, which is
 * troika underneath. It is good, and it is the wrong choice *here* for one
 * reason: troika's default font is fetched over the network at first render. A
 * HUD that needs a CDN to tell you your own score is a HUD that is blank on a
 * headset with a bad connection - which is a headset in somebody's living room,
 * which is all of them.
 *
 * A 2D canvas has none of that. It uses the fonts the device already has, draws
 * with the same monospace-and-tracking the DOM HUD uses so the two look like one
 * design, and costs one texture upload on the frames the text actually changes.
 * The cost is that this cannot do glyph-perfect layout - it is a few short lines
 * centred in a rectangle, which is exactly what a panel two metres from
 * somebody's face should be anyway.
 *
 * ---------------------------------------------------------------------------
 * Mounted only while a session is presenting
 * ---------------------------------------------------------------------------
 * Not "when a headset exists" - `headsetAvailable` answers that and it is a
 * different question. A panel hanging in the world of somebody playing on a
 * laptop would be a second HUD nobody asked for, drawn over the one they can
 * already read. `gl.xr.isPresenting` is the fact that matters and it is read
 * per frame, because entering and leaving a session is not a React render.
 */

/** How wide the panel is in metres, at `PANEL_DISTANCE`. */
const PANEL_WIDTH = 1.4
const PANEL_HEIGHT = 0.8

/**
 * Pixels across the canvas behind it.
 *
 * Generous relative to the panel's angular size, because a texture that is
 * merely adequate on a monitor is visibly soft through a headset lens - the
 * lens magnifies, and text is the one thing people notice it on.
 */
const TEXTURE_WIDTH = 1024
const TEXTURE_HEIGHT = Math.round((TEXTURE_WIDTH * PANEL_HEIGHT) / PANEL_WIDTH)

/** Type sizes in canvas pixels, by how much a line wants to be noticed. */
const SIZES: Record<HudLine['tone'], number> = { loud: 96, plain: 46, quiet: 34 }
const COLOURS: Record<HudLine['tone'], string> = {
  loud: 'rgba(255,255,255,0.95)',
  plain: 'rgba(255,255,255,0.8)',
  quiet: 'rgba(255,255,255,0.5)',
}

/**
 * Draw the lines, and say whether anything changed.
 *
 * Split out and returning a boolean so the caller can skip the texture upload on
 * the frames - which is most of them - where the same numbers are still true. At
 * 90 Hz an unconditional upload of a 1024-wide texture is real work to avoid.
 */
function paint(canvas: HTMLCanvasElement, lines: readonly HudLine[]): void {
  const context = canvas.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, canvas.width, canvas.height)

  /**
   * A backing plate, because the world behind it is arbitrary.
   *
   * White text over a bright sky is unreadable and there is no way to know in
   * advance which way somebody will be facing. Rounded and translucent, so it
   * reads as the same object the page's own panels are.
   */
  const radius = 28
  context.fillStyle = 'rgba(10,10,12,0.55)'
  context.beginPath()
  context.roundRect(0, 0, canvas.width, canvas.height, radius)
  context.fill()

  const total = lines.reduce((height, line) => height + SIZES[line.tone] * 1.35, 0)
  let y = (canvas.height - total) / 2

  context.textAlign = 'center'
  context.textBaseline = 'top'
  for (const line of lines) {
    const size = SIZES[line.tone]
    context.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`
    context.fillStyle = COLOURS[line.tone]
    context.fillText(line.text.toUpperCase(), canvas.width / 2, y, canvas.width - 48)
    y += size * 1.35
  }
}

export function VrPanel({
  lines,
  controls,
}: {
  /** What the panel says, from `hudLines`. Empty means nothing to say. */
  lines: readonly HudLine[]
  /**
   * The card shown on arrival, from `controlLines`.
   *
   * Separate from `lines` rather than prepended to them because it has its own
   * lifetime: it is up for `CONTROLS_SECONDS` after the session starts and then
   * never again, and merging the two would mean the HUD's own lines inheriting
   * that timer.
   */
  controls: readonly HudLine[]
}) {
  const gl = useThree((state) => state.gl)

  const canvas = useMemo(() => {
    const made = document.createElement('canvas')
    made.width = TEXTURE_WIDTH
    made.height = TEXTURE_HEIGHT
    return made
  }, [])

  const texture = useMemo(() => {
    const made = new THREE.CanvasTexture(canvas)
    // The panel is viewed nearly head-on and its text is high-contrast, so
    // anisotropy buys nothing; colour space does, or the plate comes out grey.
    made.colorSpace = THREE.SRGBColorSpace
    return made
  }, [canvas])

  useEffect(() => () => texture.dispose(), [texture])

  const group = useRef<THREE.Group>(null)
  /**
   * The plate itself, so the frame can reach its texture through the graph.
   *
   * Not the `texture` binding above, which React's compiler refuses to let a
   * frame callback mutate - and is right to: a value captured at render and
   * written at frame time is the exact shape that has caught three other loops
   * in this runtime. Reading it back off the mesh means the thing being marked
   * dirty is the one three is actually drawing with, which is also the only one
   * that could be a different object than the render thought.
   */
  const plate = useRef<THREE.Mesh>(null)
  /** Which way the panel is facing, which lags the head. See ./vr-hud. */
  const yaw = useRef(0)
  /**
   * Seconds since the session began, or null when there is no session.
   *
   * Null rather than zero so leaving and re-entering shows the card again - a
   * counter that only ever went up would explain the controls to somebody's
   * first session and never to their second, which is the one after they have
   * forgotten.
   */
  const since = useRef<number | null>(null)
  /** What was last painted, so an unchanged frame costs no upload. */
  const painted = useRef('')

  useFrame((state, rawDelta) => {
    const node = group.current
    if (!node) return

    /**
     * Read per frame rather than from a render.
     *
     * Entering a session is a browser event, not a React state change, and there
     * is no render between "the button was pressed" and "the renderer is drawing
     * stereo". A component that waited for one would show the controls card
     * several frames into a session or not at all.
     */
    const presenting = gl.xr.isPresenting === true
    node.visible = presenting
    if (!presenting) {
      since.current = null
      return
    }

    const delta = Math.min(rawDelta, 0.05)
    since.current = (since.current ?? 0) + delta

    /**
     * The head, from the camera the renderer is actually drawing with.
     *
     * `state.camera` is the scene's camera; in a session three drives an
     * `ArrayCamera` from the headset pose and that is the one whose position is
     * the wearer's head. Asking the renderer for it rather than assuming they
     * are the same object is the difference between a panel in front of somebody
     * and a panel in front of where the game thinks they are.
     */
    const head = gl.xr.getCamera?.() ?? state.camera
    const at = head.getWorldPosition(new THREE.Vector3())
    const facing = new THREE.Euler().setFromQuaternion(
      head.getWorldQuaternion(new THREE.Quaternion()),
      'YXZ',
    )

    yaw.current = followYaw(yaw.current, facing.y, delta)
    const spot = panelSpot(at, yaw.current)
    node.position.set(spot.x, spot.y, spot.z)
    // Yaw only. Pitch would slide the panel down the inside of the visor every
    // time the wearer looked at their feet; roll would tilt the horizon, which
    // is the other thing that makes people ill. See ./vr-hud.
    node.rotation.set(0, yaw.current, 0)

    const showing = since.current < CONTROLS_SECONDS && controls.length > 0 ? controls : lines
    const key = showing.map((line) => `${line.tone}:${line.text}`).join('|')
    if (key !== painted.current) {
      painted.current = key
      const material = plate.current?.material
      const map = material instanceof THREE.MeshBasicMaterial ? material.map : null
      if (map?.image instanceof HTMLCanvasElement) {
        paint(map.image, showing)
        map.needsUpdate = true
      }
    }
    // Nothing to say and no card up: the panel is not drawn at all rather than
    // drawn empty, so a level with no score hangs no rectangle in the world.
    node.visible = showing.length > 0
  })

  return (
    <group ref={group} visible={false}>
      <mesh ref={plate}>
        <planeGeometry args={[PANEL_WIDTH, PANEL_HEIGHT]} />
        {/*
          Unlit and see-through. A HUD that took the level's lighting would go
          dark in a tunnel, which is where somebody most needs to read it -
          and `depthWrite` off so the panel never carves a hole in the world
          behind it at the edges of its own transparency.
        */}
        <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
