'use client'

import { TransformControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { framingAt, type XpTimeline } from '@kxb/xp/movie'
import type { MovieClock } from '@/app/xp/_editor/movie/clock'
import { worldTransform, type EntityWorld } from '@kxb/xp/engine'

/**
 * Handles you can drag, on the two kinds of point a shot has.
 *
 * ---------------------------------------------------------------------------
 * Dragging an actor writes keys, and that is the whole design
 * ---------------------------------------------------------------------------
 * In the level editor a drag moves a thing, because the document holds one
 * position. Here the document holds a position *and* a timeline, so a drag that
 * wrote the entity's own `x` would move the actor at every unkeyed moment - a
 * shot somebody had spent an afternoon on would shift underneath them, and the
 * handles would appear to do nothing wherever a key already existed.
 *
 * So the handle writes keys at the playhead. Scrub, drag, scrub, drag is how a
 * path gets made, and it is the same gesture every editor with a time axis in
 * it uses. `moveActorAt` is the writer, and it marks the edit so one drag is
 * one undo step rather than three per frame.
 *
 * ---------------------------------------------------------------------------
 * And the camera's own points, which are the other thing worth dragging
 * ---------------------------------------------------------------------------
 * A camera is a path through framings, and a framing is two points: where it
 * stands and what it looks at. Both get a handle, because "move the camera a
 * bit left" and "look slightly higher" are different edits and typing six
 * numbers to tell them apart is how nobody ever finds a shot.
 *
 * The target handle is the one that is easy to leave out and is the more useful
 * of the two: it is how a camera is aimed at all, and without it aiming means
 * flying the free camera to a view and re-keying the whole framing.
 *
 * ---------------------------------------------------------------------------
 * The proxy, and why the handle is not on the actor itself
 * ---------------------------------------------------------------------------
 * The actor is drawn out of an instanced buffer or a skinned mesh whose matrix
 * the frame loop overwrites every frame. Attaching a gizmo to it means the loop
 * and the gizmo fighting over one matrix, sixty times a second, and the loop
 * always wins - so the handle would slide back the instant it was let go.
 *
 * A proxy object solves both halves: the loop puts it where the actor is drawn
 * whenever nobody is dragging, and the drag puts it wherever the pointer says
 * while somebody is. `dragging` is the switch, and it is a ref because it is
 * read in the loop and would otherwise be a re-render per frame of a drag.
 */

export type GizmoTarget =
  | { kind: 'actor'; name: string }
  /**
   * Several bodies at once, moved by the same shift.
   *
   * A separate kind rather than `actor` with a list, because what the handle
   * *reports* differs: one body under a gizmo goes to a place, and a group is
   * dragged **by** an amount - each keeps its own offset, which is what
   * "together" means. Two meanings on one callback is how a group would end up
   * collapsed onto a single point.
   */
  | { kind: 'actors'; names: readonly string[] }
  | { kind: 'camera'; name: string; index: number; what: 'position' | 'target' }

export function MovieGizmo({
  target,
  world,
  timeline,
  onMove,
}: {
  target: GizmoTarget | null
  world: { current: EntityWorld }
  timeline: XpTimeline
  /**
   * Where it went - or, for a group, how far it moved.
   *
   * The two readings are why `actors` is its own kind. See the note there.
   */
  onMove: (to: { x: number; y: number; z: number }) => void
}) {
  /**
   * `useState`, not `useRef`.
   *
   * The proxy is read during render - it is handed to `TransformControls` as a
   * prop - and a ref read during render is a value React has not committed yet.
   * A state initialiser gives the same made-once-never-replaced object with
   * none of that, which is the same call the editor's own gizmo makes.
   */
  const [proxy] = useState(() => new THREE.Object3D())
  const dragging = useRef(false)
  /** Where a group's handle was when the drag began. See `onMouseDown`. */
  const from = useRef<THREE.Vector3 | null>(null)
  const { controls } = useThree()

  /**
   * Give the camera back, whatever happens to this gizmo.
   *
   * `TransformControls` disables the orbit controls the moment a handle is
   * grabbed and re-enables them on release - which never happens if the gizmo
   * stops existing in between, and it stops existing whenever the selection
   * changes mid-drag. The symptom is an editor whose camera has silently
   * stopped responding, with nothing on screen to say why.
   */
  useEffect(
    () => () => {
      const orbit = controls as { enabled?: boolean } | null
      if (orbit && 'enabled' in orbit) orbit.enabled = true
    },
    [controls],
  )

  useFrame(() => {
    if (dragging.current || !target) return

    if (target.kind === 'actor') {
      // Where the body is *drawn*, which during playback is wherever the keys
      // have put it - so the handle sits on the actor rather than on the
      // position the document happens to hold.
      for (const [id, name] of world.current.name) {
        if (name !== target.name) continue
        const at = worldTransform(world.current, id)
        if (at) proxy.position.set(at.x, at.y, at.z)
        return
      }
      return
    }

    if (target.kind === 'actors') {
      /*
       * The middle of the selection, which is where a group's handle belongs:
       * on one of them it would look like that one is the thing being moved,
       * and off to a side it would be a handle for nothing.
       */
      const wanted = new Set(target.names)
      let x = 0
      let y = 0
      let z = 0
      let found = 0
      for (const [id, name] of world.current.name) {
        if (!wanted.has(name)) continue
        const at = worldTransform(world.current, id)
        if (!at) continue
        x += at.x
        y += at.y
        z += at.z
        found += 1
      }
      if (found > 0) proxy.position.set(x / found, y / found, z / found)
      return
    }

    const camera = timeline.cameras.find((one) => one.name === target.name)
    const framing = camera?.keys[target.index]
    if (!framing) return
    const point = target.what === 'position' ? framing.position : framing.target
    proxy.position.set(point[0], point[1], point[2])
  })

  if (!target) return null

  return (
    <>
      {/*
        Something to see, on the camera's points.

        An actor is its own marker. A framing is two invisible coordinates, and a
        gizmo floating in mid-air with nothing under it reads as a bug - so the
        point gets a small solid so it is clear the handle is *on* something.
      */}
      <primitive object={proxy}>
        {target.kind === 'camera' ? (
          <mesh>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshBasicMaterial
              color={target.what === 'position' ? '#a78bfa' : '#38bdf8'}
              depthTest={false}
              transparent
              opacity={0.9}
            />
          </mesh>
        ) : null}
      </primitive>

      <TransformControls
        object={proxy}
        mode="translate"
        size={0.7}
        onMouseDown={() => {
          dragging.current = true
          // Where the group started, so every frame of the drag reports the
          // shift *from there* rather than an accumulating one.
          from.current = proxy.position.clone()
        }}
        onMouseUp={() => {
          dragging.current = false
          from.current = null
        }}
        onObjectChange={() => {
          if (target.kind !== 'actors') {
            onMove({ x: proxy.position.x, y: proxy.position.y, z: proxy.position.z })
            return
          }
          const start = from.current
          if (!start) return
          onMove({
            x: proxy.position.x - start.x,
            y: proxy.position.y - start.y,
            z: proxy.position.z - start.z,
          })
        }}
      />
    </>
  )
}

/**
 * Where a camera is at `t`, for drawing the little marker on it.
 *
 * Exported so the panel can offer "the framing nearest the playhead" rather
 * than making somebody pick an index out of a list - which is what a framing
 * *is* to an author: the one they can see.
 */
export function nearestFraming(timeline: XpTimeline, camera: string, t: number): number | null {
  const one = timeline.cameras.find((each) => each.name === camera)
  if (!one || one.keys.length === 0) return null
  let best = 0
  let distance = Infinity
  for (const [index, key] of one.keys.entries()) {
    const gap = Math.abs(key.t - t)
    if (gap < distance) {
      distance = gap
      best = index
    }
  }
  return best
}

/** Unused re-export guard: keeps `framingAt` reachable for the marker preview. */
export const framingOf = framingAt

/**
 * Every camera, drawn where it stands and pointing where it looks.
 *
 * ---------------------------------------------------------------------------
 * Reported as "you can't see where its direction is"
 * ---------------------------------------------------------------------------
 * And that was exactly right: a camera was a name in a list and two triples of
 * numbers. You could fly to a view and press a button, and afterwards the only
 * way to find out where a camera was pointing was to look through it - which
 * takes the viewport away from whatever you were doing.
 *
 * So each one is a **frustum**: four lines from the lens to a rectangle, in the
 * direction it faces. Not a cone and not an arrow, because the shape carries
 * information the others do not - a wide lens is a wide frustum, so `fov` is
 * legible at a glance rather than a number in a field.
 *
 * ---------------------------------------------------------------------------
 * Only in free look
 * ---------------------------------------------------------------------------
 * Looking through a camera means the viewport *is* the shot, and a shot with a
 * wireframe pyramid floating in it is not the shot. It would also draw the
 * camera you are inside, which is a rectangle across the whole screen.
 *
 * The live one is lit and the others are not, so "which of these am I about to
 * cut to" is answerable without reading the panel.
 */
export function CameraGizmos({
  timeline,
  clock,
  live,
  onPick,
}: {
  timeline: XpTimeline
  clock: MovieClock
  /** The camera the cut is on, so it can be drawn differently. */
  live: string | null
  onPick?: (name: string) => void
}) {
  const groups = useRef<Map<string, THREE.Group>>(new Map())

  useFrame(() => {
    const t = clock.at()
    for (const camera of timeline.cameras) {
      const group = groups.current.get(camera.name)
      if (!group) continue
      const framing = framingAt(camera, t)
      group.position.set(framing.position[0], framing.position[1], framing.position[2])
      group.lookAt(framing.target[0], framing.target[1], framing.target[2])
      // The frustum's depth is the fov, so a wide lens looks wide. Scaled on x
      // and y rather than modelled, because the shape is a unit pyramid and the
      // spread is the only thing that changes.
      const spread = Math.tan((framing.fov * Math.PI) / 360)
      group.scale.set(spread, spread, 1)
    }
  })

  return (
    <>
      {timeline.cameras.map((camera) => {
        const lit = camera.name === live
        return (
          <group
            key={camera.name}
            ref={(node) => {
              if (node) groups.current.set(camera.name, node)
              else groups.current.delete(camera.name)
            }}
          >
            {/*
              A pyramid of lines, opening along -z, which is where a three.js
              camera looks. `lookAt` on the group is what aims it, so nothing
              here has to know about angles.
            */}
            <lineSegments>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[FRUSTUM, 3]} />
              </bufferGeometry>
              <lineBasicMaterial
                color={lit ? '#a78bfa' : '#4b5563'}
                depthTest={false}
                transparent
                opacity={lit ? 0.95 : 0.55}
              />
            </lineSegments>

            {/*
              Something solid to click, at the lens. The lines are one pixel
              wide and a raycast against them is a game of patience.
            */}
            <mesh
              onClick={(event) => {
                if (!onPick) return
                event.stopPropagation()
                onPick(camera.name)
              }}
            >
              <sphereGeometry args={[0.18, 10, 10]} />
              <meshBasicMaterial
                color={lit ? '#a78bfa' : '#6b7280'}
                depthTest={false}
                transparent
                opacity={0.9}
              />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

/**
 * A unit frustum, as line segments: the lens to four corners, and the rectangle.
 *
 * Two units deep, which is far enough to read the direction at a glance and
 * short enough not to spear the set. The corners are at ±1 before the group's
 * scale narrows them to the lens's actual spread.
 */
const FRUSTUM = new Float32Array([
  // lens to each corner
  0, 0, 0, 1, 1, -2, 0, 0, 0, -1, 1, -2, 0, 0, 0, -1, -1, -2, 0, 0, 0, 1, -1, -2,
  // and the rectangle at the far end
  1, 1, -2, -1, 1, -2, -1, 1, -2, -1, -1, -2, -1, -1, -2, 1, -1, -2, 1, -1, -2, 1, 1, -2,
])
