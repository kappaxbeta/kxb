'use client'

import { useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PALETTE, thumbnailUrl } from '@/domain/lounge/palette'
import { aimedCell, cellSpot, pointOn, type Grid } from '@/app/world/lounge/_sim/vr-menu'
import type { VrRay } from '@/app/world/lounge/_scene/scene-types'

/**
 * The chrome, put in the room so a headset can see it.
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * A headset draws what the renderer draws and nothing else. The Creative/Battle
 * switch and the block picker are ordinary DOM outside the Canvas, so the moment
 * somebody puts a headset on they are gone - reported by the user after testing
 * the room in VR, where walking, building and breaking all worked and there was
 * no way to change mode or choose a block.
 *
 * ---------------------------------------------------------------------------
 * It reports, it does not decide
 * ---------------------------------------------------------------------------
 * This component owns geometry and drawing: where the panel hangs, which cell
 * the ray is on, what that cell means. It owns none of the state - `selected`
 * and `mode` live in the scene, and changing either goes through the same
 * `changeMode` and `setSelected` the DOM controls use, because a second way to
 * change mode is a second thing that can disagree about what mode it is.
 *
 * So it publishes *what is under the pointer* into a ref, and the scene's own
 * act handler reads it when the trigger goes. That also means the trigger needs
 * no new binding: it already breaks blocks, and `userData.stopsRay` stops the
 * ray at the panel, so a pull aimed at a button has no world target to act on.
 *
 * ---------------------------------------------------------------------------
 * Body-locked, not face-locked
 * ---------------------------------------------------------------------------
 * The panel follows where you are looking, slowly, and only in yaw. A rectangle
 * welded to the head never moves relative to the eye and fights every
 * vestibular cue the wearer has, which is the most reliable way to make
 * somebody take a headset off. Pitch is deliberately not followed: look down at
 * your feet and the menu stays at the horizon rather than sliding down the
 * inside of the visor.
 */

/** What the pointer is on, for the scene to act on. */
export type VrMenuAim =
  | { kind: 'mode'; mode: 'creative' | 'battle' }
  | { kind: 'block'; model: string }
  | null

/**
 * How many blocks the panel offers.
 *
 * A window onto the palette rather than all of it. The full list is long enough
 * to need a search box in the DOM picker, and a wall of tiles at arm's length is
 * worse than a short one - so this is the first two rows' worth, and finding the
 * rest is a job for a scroll or a category row that nobody has asked for yet.
 */
const COLUMNS = 6
const ROWS = 3
const SHOWN = COLUMNS * ROWS

const BLOCKS: Grid = { width: 0.72, height: 0.36, columns: COLUMNS, rows: ROWS }
const MODES: Grid = { width: 0.72, height: 0.09, columns: 2, rows: 1 }

/** How far in front, and how far down. Metres. */
const DISTANCE = 1.1
const DROP = 0.45

/** Where the two grids sit on the panel, relative to its centre. */
const BLOCKS_Y = -0.06
const MODES_Y = 0.16

/**
 * How long the panel takes to catch up with a turn.
 *
 * Long enough that a glance leaves it behind - which is the point, since a panel
 * that tracked instantly would be the head-welded one this file opens by
 * explaining why not to build - and short enough that it has stopped visibly
 * trailing by the time you have finished turning.
 */
const SETTLE = 0.3

const MODE_NAMES = ['creative', 'battle'] as const

export function VrMenu({
  ray,
  onAim,
  selected,
  mode,
}: {
  ray: React.RefObject<VrRay>
  /**
   * Called when what is under the pointer changes.
   *
   * A callback rather than a ref to write into, which was the first shape and
   * which React's compiler refuses: a prop-held ref written from a frame is a
   * value captured at render and mutated afterwards, and the rule is pointing at
   * something real - the writer should own the buffer. So the scene owns the
   * ref, this owns the answer, and the handoff is a call.
   *
   * Only on a change, not every frame. It is a ref write either way, but ninety
   * identical calls a second is ninety chances for somebody later to put
   * something expensive behind it.
   */
  onAim: (aim: VrMenuAim) => void
  selected: string
  mode: 'creative' | 'battle'
}) {
  const gl = useThree((state) => state.gl)
  const models = useMemo(() => PALETTE.slice(0, SHOWN), [])
  /**
   * One texture per tile, loaded once.
   *
   * `useTexture` with an array suspends until all of them are in, which is right
   * here: a menu that filled in tile by tile in front of somebody's face would
   * read as broken, and they are small thumbnails the DOM picker has usually
   * warmed already.
   */
  const thumbs = useTexture(models.map((model) => thumbnailUrl(model)))

  /**
  /** The last thing reported, so an unchanged frame says nothing. */
  const mine = useRef<VrMenuAim>(null)
  const told = useRef(onAim)
  useEffect(() => {
    told.current = onAim
  }, [onAim])
  const panel = useRef<THREE.Group>(null)
  const cursor = useRef<THREE.Mesh>(null)
  const yaw = useRef(0)

  /**
   * Say what is under the pointer, when it has changed.
   *
   * Compared by shape rather than by identity: the objects are rebuilt every
   * frame, so `!==` would report a change on every one of them and undo the
   * point of comparing at all.
   */
  const report = (next: VrMenuAim) => {
    const before = mine.current
    const same =
      before === next ||
      (before !== null &&
        next !== null &&
        before.kind === next.kind &&
        (before.kind === 'mode'
          ? before.mode === (next as { mode: string }).mode
          : before.model === (next as { model: string }).model))
    if (same) return
    mine.current = next
    told.current(next)
  }

  useFrame((state, rawDelta) => {
    const node = panel.current
    if (!node) return

    const presenting = gl.xr.isPresenting === true
    node.visible = presenting
    if (!presenting) {
      // Nothing under a pointer that does not exist. Left set, the scene would
      // act on the menu the next time somebody clicked on a monitor.
      report(null)
      return
    }

    const delta = Math.min(rawDelta, 0.05)

    /**
     * The head, from the camera the renderer is drawing with.
     *
     * In a session three drives an `ArrayCamera` from the headset pose, and that
     * is the one whose position is the wearer's head - asking the renderer for
     * it rather than assuming it is `state.camera` is the difference between a
     * menu in front of somebody and a menu in front of where the game thinks
     * they are.
     */
    const head = gl.xr.getCamera?.() ?? state.camera
    const at = head.getWorldPosition(new THREE.Vector3())
    const facing = new THREE.Euler().setFromQuaternion(
      head.getWorldQuaternion(new THREE.Quaternion()),
      'YXZ',
    )

    // Yaw only, and lagged. See the note at the top.
    const turn = Math.PI * 2
    const shortest = ((((facing.y - yaw.current) % turn) + turn * 1.5) % turn) - Math.PI
    yaw.current += shortest * (1 - Math.exp(-delta / SETTLE))

    // A camera looks down -z, which is why this is -sin/-cos where the document
    // side of this codebase uses +. Getting it backwards hangs the menu behind
    // the wearer, where it is invisible and looks exactly like one that failed
    // to mount.
    node.position.set(
      at.x - Math.sin(yaw.current) * DISTANCE,
      at.y - DROP,
      at.z - Math.cos(yaw.current) * DISTANCE,
    )
    node.rotation.set(0, yaw.current, 0)

    const pointer = ray.current
    if (!pointer?.active) {
      report(null)
      if (cursor.current) cursor.current.visible = false
      return
    }

    /**
     * The ray, in the panel's own space.
     *
     * The one line of three.js the pure half deliberately does not do -
     * `worldToLocal` on a point, and the same matrix without translation on the
     * direction, because a direction is not a place and translating it would
     * bend the ray towards the origin.
     */
    node.updateMatrixWorld()
    const inverse = new THREE.Matrix4().copy(node.matrixWorld).invert()
    const origin = pointer.origin.clone().applyMatrix4(inverse)
    const direction = pointer.direction
      .clone()
      .transformDirection(inverse)
      .normalize()

    const onBlocks = pointOn(
      { x: origin.x, y: origin.y - BLOCKS_Y, z: origin.z },
      direction,
      BLOCKS,
    )
    const onModes = pointOn({ x: origin.x, y: origin.y - MODES_Y, z: origin.z }, direction, MODES)

    if (onModes) {
      const cell = aimedCell({ x: origin.x, y: origin.y - MODES_Y, z: origin.z }, direction, MODES)
      report(cell === null ? null : { kind: 'mode', mode: MODE_NAMES[cell] })
      if (cursor.current) {
        cursor.current.visible = true
        cursor.current.position.set(onModes.x, onModes.y + MODES_Y, 0.006)
      }
      return
    }

    if (onBlocks) {
      const cell = aimedCell({ x: origin.x, y: origin.y - BLOCKS_Y, z: origin.z }, direction, BLOCKS)
      const model = cell === null ? undefined : models[cell]
      report(model ? { kind: 'block', model } : null)
      if (cursor.current) {
        cursor.current.visible = true
        // Follows the point rather than snapping to the tile: a highlight that
        // jumps between cells reads as sluggish next to one that tracks a hand.
        cursor.current.position.set(onBlocks.x, onBlocks.y + BLOCKS_Y, 0.006)
      }
      return
    }

    report(null)
    if (cursor.current) cursor.current.visible = false
  })

  const tile = { width: BLOCKS.width / COLUMNS, height: BLOCKS.height / ROWS }

  return (
    <group ref={panel} visible={false}>
      {/*
        The backing plate. Translucent and unlit: a menu that took the room's
        lighting would go dark in a cellar, which is where somebody is most
        likely to be choosing a torch. `stopsRay` is what keeps the trigger that
        picks a tile from also breaking the wall behind it - see ./building.
      */}
      <mesh userData={{ stopsRay: true }}>
        <planeGeometry args={[0.78, 0.48]} />
        <meshBasicMaterial color="#0a0a0c" transparent opacity={0.72} depthWrite={false} />
      </mesh>

      {MODE_NAMES.map((name, index) => {
        const spot = cellSpot(index, MODES)
        return (
          <mesh
            key={name}
            position={[spot.x, spot.y + MODES_Y, 0.002]}
            userData={{ stopsRay: true }}
          >
            <planeGeometry args={[MODES.width / 2 - 0.01, MODES.height - 0.01]} />
            {/* The one that is on is brighter. Colour rather than a label,
                because a word rendered small at a metre is a smudge, and these
                two already have colours everywhere else in the product. */}
            <meshBasicMaterial
              color={name === 'battle' ? '#f0abfc' : '#67e8f9'}
              transparent
              opacity={mode === name ? 0.95 : 0.28}
              depthWrite={false}
            />
          </mesh>
        )
      })}

      {models.map((model, index) => {
        const spot = cellSpot(index, BLOCKS)
        return (
          <mesh
            key={model}
            position={[spot.x, spot.y + BLOCKS_Y, 0.002]}
            userData={{ stopsRay: true }}
          >
            <planeGeometry args={[tile.width - 0.008, tile.height - 0.008]} />
            <meshBasicMaterial
              map={thumbs[index]}
              transparent
              // The chosen block is full strength and the rest are dimmed, so
              // the current choice is findable without reading anything.
              opacity={model === selected ? 1 : 0.55}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        )
      })}

      {/* The pointer's own dot, in front of everything and ignored by the ray
          that draws it - or it would occlude the tile it is sitting on. */}
      <mesh ref={cursor} visible={false} userData={{ ignoreRay: true }}>
        <circleGeometry args={[0.008, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </group>
  )
}
