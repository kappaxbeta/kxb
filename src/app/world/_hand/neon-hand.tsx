'use client'

import { useFrame } from '@react-three/fiber'
import { useState } from 'react'
import * as THREE from 'three'

import { isRaised, type Pose } from '@/app/world/_hand/fingers'
import { approach, bendFor, litTips, PALM, RIG } from '@/app/world/_hand/rig'
import type { Drift } from '@/app/world/_hand/sight'
import { createField, type Field, stepField } from '@/app/world/_hand/sparks'

/**
 * The hand you can see: five fingers of light, with sparks off the lit ones.
 *
 * Neon rather than flesh, and that is a decision rather than a way of dodging
 * the modelling. A realistic hand in a room full of round-headed peeps would
 * read as a severed limb floating in the corner of the screen; a hand drawn in
 * the pen's own three colours is obviously *the same magic as the pen*, which
 * is exactly what it is - see `spells.ts`. It also means the pose reads at a
 * glance, because a finger that is up is a different colour from one that is
 * down, and colour survives being small in a corner where shape does not.
 *
 * ## Why the whole hand is built by hand
 *
 * There is no JSX below the root. The five fingers, their fifteen bones, both
 * materials each and the spark cloud are assembled into one `THREE.Group` once,
 * and React is handed the finished thing.
 *
 * That is not an optimisation, it is what the lint rules leave. This repo runs
 * the React Compiler rules, which forbid *modifying* a value that came out of
 * `useState` and forbid reading a ref during render - and a jointed hand needs
 * both: something must hold fifteen `Object3D`s to write rotations to, and
 * something must hand fifteen materials to fifteen meshes while rendering.
 * Threading them through a `<Joint>` component means a child mutating a prop,
 * which is the same rule again. Building the graph once and rendering
 * `<primitive>` sidesteps all of it honestly: render only ever *reads* the
 * root, and every mutation happens inside the frame loop where it belongs.
 *
 * This is the *mesh*, and has to be inside a canvas. `<HandView>` is the one
 * with a canvas around it, for the corner of a HUD and for the chart.
 */

/** Hue of a finger that is up, and of one that is down. See `_ink/palette.ts`. */
const LIT = 300
const DIM = 188

/** The violet a hand turns as a letter lands. */
const STRUCK = 268

/** How quickly a finger opens or closes: fraction of the way there per second. */
const BEND_RATE = 17

/** How quickly a finger changes colour. Slower, so the change reads as a glow. */
const GLOW_RATE = 9

/** How far the glow shell stands out from the core, across the tube only. */
const SHELL = 2.1

/**
 * How far a drifting hand travels, in hand units, from the middle of the frame
 * to the edge of it - across, up, and towards the viewer.
 *
 * Bigger across than up because a picture is wider than it is tall, and modest
 * in depth because depth is the axis a single camera is guessing at: a hand
 * that lunged at the glass every time the detector changed its mind about how
 * far away you are would be unwatchable.
 */
const ROAM: [number, number, number] = [1.5, 0.95, 0.75]

/** How quickly the hand follows: fraction of the way there per second. */
const FLOW = 9

/**
 * How much of your hand's turn the drawn one takes, from 0 to 1.
 *
 * Not all of it, on purpose. The hand is a thing somebody is *reading letters
 * off*, and a hand turned fully edge-on is five tubes in a line whichever
 * alphabet it is holding. Leaning most of the way keeps the gesture - you tilt,
 * it tilts - while leaving the shape legible at the extremes.
 */
const LEAN = 0.82

/** Scratch, so painting a hand does not allocate sixty colours a second. */
const SCRATCH = new THREE.Color()

/** The way the rig's own fingers point, which is what a drift turns. */
const FINGERS_UP = new THREE.Vector3(0, 1, 0)

/* The same bargain for the drift: a frame of following allocates nothing. */
const UP = new THREE.Vector3()
const TURN = new THREE.Quaternion()
const STILL = new THREE.Quaternion()

interface Live {
  /** The finished hand, handed to React once and never replaced. */
  root: THREE.Group
  /** Every joint group, by finger and then by bone. */
  joints: THREE.Object3D[][]
  /** The angle each joint is currently drawn at. */
  angles: number[][]
  /** Core and shell material, per finger. */
  skins: THREE.MeshBasicMaterial[][]
  /** Core and shell for the palm. */
  palm: THREE.MeshBasicMaterial[]
  /** How lit each finger is, from 0 (down) to 1 (up). */
  glows: number[]
  field: Field
  /** Seconds since building, which is what the twinkle runs on. */
  time: number
}

export function NeonHand({
  pose,
  settle,
  drift,
}: {
  pose: Pose
  /**
   * How far the hand is through being recognised, from 0 to 1.
   *
   * Drawn on the hand itself - the palm brightens and the whole thing turns
   * towards violet - so that "this is about to become a letter" is visible
   * where you are already looking. A progress bar somewhere else would be a
   * thing you have to look away from your own hand to read.
   *
   * A function rather than a number, because it changes every frame and a prop
   * that changes every frame is sixty React renders a second for a value only
   * the frame loop ever wanted. The pose *is* a prop, because a pose changes
   * when a finger moves - a few times a second at most.
   */
  settle?: () => number
  /**
   * Where the hand is being held, when a camera is watching one.
   *
   * A function for the same reason `settle` is one - it changes every frame -
   * and `null` for the far more common case of there being no camera at all, in
   * which case the hand sits exactly where it always sat. That is what makes
   * this safe to add: a chart, a settings preview and a lounge with the camera
   * off are all bit-for-bit the drawing they were before.
   */
  drift?: () => Drift | null
}) {
  const [live] = useState(build)

  useFrame((_, delta) => {
    // A backgrounded tab wakes up owing minutes. Clamped so it wakes up owing a
    // frame instead, which is the difference between the hand catching up and
    // every spark arriving at once as one flat sheet.
    const dt = Math.min(delta, 1 / 20)
    step(live, pose, settle?.() ?? 0, dt)
    flow(live, drift?.() ?? null, dt)
  })

  return <primitive object={live.root} />
}

/**
 * A core material and the additive shell that blooms around it.
 *
 * Neither is ever disposed, and that is deliberate. Disposing them from an
 * effect's cleanup is the obvious thing and it is a bug: React's strict mode
 * mounts, unmounts and mounts again, `useState` keeps its value across that,
 * and the second mount would come up holding a graph the first unmount had
 * already thrown away. The lounge learned this the hard way with a
 * `loseContext` in a cleanup. A hand's worth of tiny materials per mount,
 * holding no textures, is much the cheaper of the two mistakes.
 */
function skin(): THREE.MeshBasicMaterial[] {
  return [
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    new THREE.MeshBasicMaterial({
      toneMapped: false,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  ]
}

function build(): Live {
  const root = new THREE.Group()
  const palm = skin()
  const skins = RIG.map(() => skin())
  const joints: THREE.Object3D[][] = []
  const field = createField()

  const slab = new THREE.BoxGeometry(...PALM)
  root.add(new THREE.Mesh(slab, palm[0]))
  const halo = new THREE.Mesh(slab, palm[1])
  halo.scale.set(1.22, 1.1, SHELL)
  root.add(halo)

  for (const [finger, rig] of RIG.entries()) {
    const knuckle = new THREE.Group()
    knuckle.position.set(...rig.root)
    knuckle.rotation.z = rig.splay
    root.add(knuckle)

    const chain: THREE.Object3D[] = []
    let parent: THREE.Object3D = knuckle

    for (const segment of rig.segments) {
      // One group per joint, nested - which is what makes the maths free: a
      // knuckle rotating carries every bone past it, so the frame loop only
      // ever writes one number per joint.
      const bone = new THREE.Group()
      parent.add(bone)
      chain.push(bone)

      const tube = new THREE.CapsuleGeometry(segment.radius, segment.length, 4, 10)
      const core = new THREE.Mesh(tube, skins[finger][0])
      core.position.y = segment.length / 2
      bone.add(core)

      const glow = new THREE.Mesh(tube, skins[finger][1])
      glow.position.y = segment.length / 2
      glow.scale.set(SHELL, 1.06, SHELL)
      bone.add(glow)

      const next = new THREE.Group()
      next.position.y = segment.length
      bone.add(next)
      parent = next
    }
    joints.push(chain)
  }

  const sparks = new THREE.BufferGeometry()
  sparks.setAttribute('position', new THREE.BufferAttribute(field.positions, 3))
  sparks.setAttribute('color', new THREE.BufferAttribute(field.colors, 3))
  const cloud = new THREE.Points(
    sparks,
    new THREE.PointsMaterial({
      size: 0.085,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  )
  // The cloud is thrown from the fingertips and lives in the hand's own space,
  // so it must never be culled by the palm's bounding box.
  cloud.frustumCulled = false
  root.add(cloud)

  return {
    root,
    joints,
    angles: RIG.map((rig) => [...rig.curled]),
    skins,
    palm,
    glows: RIG.map(() => 0),
    field,
    time: 0,
  }
}

function step(live: Live, pose: Pose, settle: number, dt: number): void {
  live.time += dt

  for (const [finger, rig] of RIG.entries()) {
    const up = isRaised(pose, rig.finger)
    const bend = bendFor(rig, up)

    for (const [joint] of rig.segments.entries()) {
      const angle = approach(live.angles[finger][joint], bend[joint], dt, BEND_RATE)
      live.angles[finger][joint] = angle
      // A thumb swings across the palm rather than into it. See `rig.ts`.
      live.joints[finger][joint].rotation[rig.axis] = angle
    }

    const lit = live.glows[finger]
    live.glows[finger] = approach(lit, up ? 1 : 0, dt, GLOW_RATE)
    paint(live.skins[finger], DIM + (LIT - DIM) * lit, 0.3 + 0.22 * lit, lit, settle)
  }

  /*
    The palm is deliberately the dim part.

    It is the only thing on the hand that never says anything - it is the same
    slab whatever you are signing - so at the fingers' brightness it becomes the
    largest, loudest object on screen and the letters read as decoration around
    a box. Kept low, it is what it should be: the dark body the lit fingers
    stand on.
  */
  paint(live.palm, DIM, 0.15, 0.25, settle)

  stepField(live.field, dt, litTips(pose), LIT, live.time)
  const sparks = (live.root.children.at(-1) as THREE.Points).geometry
  sparks.getAttribute('position').needsUpdate = true
  sparks.getAttribute('color').needsUpdate = true
}

/**
 * Follow the hand in front of the camera: where it is, and which way it is held.
 *
 * The whole of "flowing the space" is here, and it is four lines of easing
 * because everything hard about it happened upstream. `sight.ts` already turned
 * MediaPipe's axes into these ones and already mirrored them, so this only has
 * to believe the numbers and take its time about it.
 *
 * ## One axis, and the shortest turn onto it
 *
 * The drift carries the way the fingers point and nothing else - `sight.ts` says
 * why - and the rig points its own fingers `+Y`. So the whole rotation is the
 * shortest turn from one to the other, which is a two-line quaternion and has a
 * property worth having: the shortest turn adds no roll about the axis itself,
 * so the hand arrives leaning the right way and still facing the reader.
 *
 * ## Nothing snaps
 *
 * Position eases and rotation slerps, both at `FLOW`, both frame-rate
 * independent. A detector at thirty frames a second in a badly lit room is
 * jittery in a way no threshold can fix, and easing is what turns that jitter
 * into a hand that is *alive* rather than a hand that is broken. With no drift
 * at all - camera off, or nothing in shot - the target is the middle and the
 * hand swims back to exactly where it hangs in every other part of the app.
 */
function flow(live: Live, drift: Drift | null, dt: number): void {
  const place = live.root.position
  place.x = approach(place.x, (drift?.x ?? 0) * ROAM[0], dt, FLOW)
  place.y = approach(place.y, (drift?.y ?? 0) * ROAM[1], dt, FLOW)
  place.z = approach(place.z, (drift?.near ?? 0) * ROAM[2], dt, FLOW)

  if (drift) {
    // The shortest turn that points the rig's fingers where yours are pointing.
    // Shortest is the whole trick: it introduces no twist of its own, so the
    // hand keeps facing the reader while it leans, points and rolls with you.
    TURN.setFromUnitVectors(FINGERS_UP, UP.fromArray(drift.up).normalize())
    // Most of the way there, never all of it. See `LEAN`.
    TURN.slerp(STILL, 1 - LEAN)
  } else {
    TURN.copy(STILL)
  }
  live.root.quaternion.slerp(TURN, 1 - Math.exp(-FLOW * dt))
}

/**
 * Give a core and its shell a colour.
 *
 * `settle` pulls the hue towards violet and opens the shell up, which is what
 * makes a hand about to be read look like it is being read. Only part of the
 * way, though: a hand that went fully violet would lose the up-finger,
 * down-finger difference at exactly the moment somebody is checking it.
 */
function paint(
  materials: THREE.MeshBasicMaterial[],
  hue: number,
  lightness: number,
  lit: number,
  settle: number,
): void {
  const towards = hue + (STRUCK - hue) * settle * 0.55
  /*
    The fourth argument is not optional in spirit.

    `setHSL` defaults to the renderer's *working* colour space, which is linear -
    so a lightness written as 0.15 is stored as linear 0.15 and leaves the
    renderer at roughly 0.44 on screen. Every number in this file was chosen by
    looking at it, so they are sRGB numbers, and saying so is the difference
    between a palm that sits behind the fingers and one that outshines them.
  */
  SCRATCH.setHSL(
    (((towards % 360) + 360) % 360) / 360,
    1,
    lightness + 0.09 * settle,
    THREE.SRGBColorSpace,
  )
  materials[0].color.copy(SCRATCH)
  materials[1].color.copy(SCRATCH)
  materials[1].opacity = 0.1 + 0.2 * lit + 0.2 * settle
}
