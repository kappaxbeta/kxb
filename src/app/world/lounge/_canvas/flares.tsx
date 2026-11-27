'use client'

import { useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

import { drainFlares, type Flare } from '@/app/world/_stores/flare-store'

/**
 * What a written word throws into the room: a beam, and a rainbow over it.
 *
 * Both are light rather than matter. They are drawn additively with no depth
 * write, which is the difference between "a coloured object in the room" and
 * "the room is lit by this for a second" - and it is also why neither of them
 * collides with, damages or blocks anything. A flare is a drawing; who it hurt
 * would be a different message with a different author (see `flare-store`).
 *
 * The two shapes are the same material with different geometry, which is most
 * of why they belong in one file: a rainbow whose colours ran the other way
 * from the beam's would read as two features by two people.
 */

/** Seconds each kind lives for. A beam is a shot; a rainbow is weather. */
const BEAM_LIFE = 0.85
const ARC_LIFE = 4.5

/** Cells. The beam's reach and thickness, and how far the arc stands out. */
const BEAM_LENGTH = 42
const BEAM_WIDTH = 1.35
const ARC_RADIUS = 13
const ARC_TUBE = 0.5
const ARC_AHEAD = 9

/** Chest height, so a beam leaves the body rather than the floor. */
const CHEST = 1.15

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT = `
precision highp float;

uniform float uFade;
uniform float uShift;
uniform float uSpread;
/** 0 draws the wheel across the shape, 1 along it. */
uniform float uAlong;

varying vec2 vUv;

vec3 wheel(float hue) {
  /* The usual compact HSV-to-RGB. Saturation and value are fixed: this is
     light, and light that is not bright is not light. */
  vec3 k = fract(hue + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0));
  return clamp(abs(k * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

void main() {
  float band = mix(vUv.y, vUv.x, uAlong);
  float across = mix(vUv.x, vUv.y, uAlong);

  /* Soft at both edges, so the shape has no cut line anywhere - a hard edge is
     the one thing that would make this read as a painted plane. */
  float edge = smoothstep(0.0, 0.22, across) * smoothstep(1.0, 0.78, across);

  /* And soft at the far end, so a beam ends in air rather than in a wall. */
  float reach = mix(1.0, smoothstep(1.0, 0.35, band), uAlong);

  vec3 rgb = wheel(fract(band * uSpread + uShift));
  /* Whitened down the middle: every real beam has a core hotter than its
     colour, and it is what stops a rainbow reading as a sticker. */
  rgb = mix(rgb, vec3(1.0), pow(edge, 6.0) * 0.65);

  float bright = edge * reach * uFade;
  gl_FragColor = vec4(rgb * bright, bright);
}
`

/**
 * One material per flare, disposed with it.
 *
 * Sharing one would be cheaper and wrong: every uniform here is per-flare -
 * how far through its life it is, how far the colours have crept round the
 * wheel - and two beams cast half a second apart must not fade together.
 */
function rainbowMaterial(along: number, spread: number) {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uFade: { value: 0 },
      uShift: { value: Math.random() },
      uSpread: { value: spread },
      uAlong: { value: along },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

/**
 * The two uniform writes, out here rather than inline.
 *
 * Not a style choice, and the same one `_canvas/rainbow.tsx` makes for the same
 * reason: a uniform is mutable state on a long-lived object, and this repo's
 * lint refuses a memo value modified anywhere the compiler thinks is render -
 * which includes the body of the hook that made it. A plain function taking the
 * material as an argument is neither, and it is honest about what it is:
 * imperative renderer state, written from a frame callback.
 */
function wind(material: THREE.ShaderMaterial, fade: number, creep: number) {
  material.uniforms.uFade.value = fade
  material.uniforms.uShift.value += creep
}

/**
 * A flare's own little clock, wound out here for the reason `wind` is: it is
 * made by a hook and written every frame, and those two facts may not meet
 * inside a component body.
 */
interface Clock {
  t: number
  over: boolean
}

/** Advance it, and say how far through its life the flare now is. */
function tick(clock: Clock, delta: number, life: number): number {
  clock.t += delta
  return clock.t / life
}

/** True exactly once, on the frame the flare runs out. */
function ended(clock: Clock): boolean {
  if (clock.over) return false
  clock.over = true
  return true
}

/** Which way round Y a horizontal direction points, with +Z as zero. */
function yawOf(towards: { x: number; z: number }): number {
  return Math.atan2(towards.x, towards.z)
}

/**
 * In fast, out slow, and never a jump: the shape of every flash in this app.
 *
 * Written as a curve over the whole life rather than as a fade-in plus a
 * fade-out, because two clamped ramps meeting in the middle is exactly where a
 * seam appears.
 */
function envelope(through: number): number {
  if (through <= 0 || through >= 1) return 0
  const rise = Math.min(1, through / 0.12)
  const fall = Math.pow(1 - through, 2)
  return rise * fall
}

function Beam({ flare, onDone }: { flare: Flare; onDone: () => void }) {
  const material = useMemo(() => rainbowMaterial(0, 1), [])
  // Made once and mutated from the frame loop; nothing renders from it. See the
  // note on `InkState` in world/_ink for why this is a `useState` box.
  // Made once and wound from the frame loop; nothing renders from it.
  const [clock] = useState<Clock>(() => ({ t: 0, over: false }))

  useFrame((_, delta) => {
    const through = tick(clock, delta, BEAM_LIFE)
    // The colours crawl along the beam while it is up, which is what makes a
    // still shape look like something being poured rather than placed.
    wind(material, envelope(through) * 1.6, delta * 0.55)
    if (through < 1 || !ended(clock)) return
    onDone()
  })

  useEffect(() => () => material.dispose(), [material])

  const plane = (
    <mesh position={[0, 0, BEAM_LENGTH / 2]} rotation={[Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[BEAM_WIDTH, BEAM_LENGTH]} />
    </mesh>
  )

  return (
    <group
      position={[flare.from.x, flare.from.y + CHEST, flare.from.z]}
      rotation={[0, yawOf(flare.towards), 0]}
    >
      {/*
        Two planes crossed along the beam's own axis, which is the oldest trick
        there is for making a flat thing look like a shaft of light: from any
        angle you are looking at one of them close to face-on, so the beam never
        thins to a line as you walk round it.
      */}
      {plane}
      <group rotation={[0, 0, Math.PI / 2]}>{plane}</group>
    </group>
  )
}

function Arc({ flare, onDone }: { flare: Flare; onDone: () => void }) {
  const material = useMemo(() => rainbowMaterial(1, 1), [])
  const [clock] = useState<Clock>(() => ({ t: 0, over: false }))

  useFrame((_, delta) => {
    const through = tick(clock, delta, ARC_LIFE)
    wind(material, envelope(through) * 1.25, delta * 0.06)
    if (through < 1 || !ended(clock)) return
    onDone()
  })

  useEffect(() => () => material.dispose(), [material])

  /*
    Standing in front of whoever cast it, across their view rather than along
    it: a rainbow you are looking through the end of is a stripe. Its feet are
    on the floor, which is what gives the room a sense of how big it is.
  */
  const yaw = yawOf(flare.towards)
  return (
    <mesh
      position={[
        flare.from.x + flare.towards.x * ARC_AHEAD,
        flare.from.y,
        flare.from.z + flare.towards.z * ARC_AHEAD,
      ]}
      rotation={[0, yaw, 0]}
      material={material}
    >
      <torusGeometry args={[ARC_RADIUS, ARC_TUBE, 8, 96, Math.PI]} />
    </mesh>
  )
}

interface Alive extends Flare {
  id: number
}

export function Flares() {
  const [alive, setAlive] = useState<Alive[]>([])
  const [ids] = useState(() => ({ next: 0 }))

  /*
    The queue is drained in the frame loop and turned into React state, which is
    a re-render - but only when something was actually cast, which is a handful
    of times a minute in a loud room. The alternative, drawing straight from the
    queue every frame, would mean this component owning every flare's clock and
    every flare's material by hand.
  */
  useFrame(() => {
    const fresh = drainFlares()
    if (fresh.length === 0) return
    setAlive((current) => [...current, ...fresh.map((flare) => ({ ...flare, id: ids.next++ }))])
  })

  const drop = useCallback((id: number) => {
    setAlive((current) => current.filter((flare) => flare.id !== id))
  }, [])

  return (
    <>
      {alive.map((flare) =>
        flare.kind === 'beam' ? (
          <Beam key={flare.id} flare={flare} onDone={() => drop(flare.id)} />
        ) : (
          <Arc key={flare.id} flare={flare} onDone={() => drop(flare.id)} />
        ),
      )}
    </>
  )
}
