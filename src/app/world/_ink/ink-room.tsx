'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useMemo, useState } from 'react'
import * as THREE from 'three'

import { extrude, type Wall } from '@/app/world/_ink/extrude'
import { InkSlate } from '@/app/world/_ink/ink-slate'
import { glbOf, saveBlob } from '@/app/world/_ink/ink-model'
import type { InkLabels } from '@/app/world/_ink/labels'
import { readNote } from '@/domain/ink/note'

/**
 * Draw something flat, then walk round it.
 *
 * Every stroke becomes a wall running back from the page (`extrude.ts`), so the
 * drawing seen head-on is exactly what was drawn and everything you gain by
 * moving the camera is depth. Four sliders, because each one answers a
 * different question somebody actually asks of a shape:
 *
 * - **depth** - how far back it goes, which is the whole trick;
 * - **scatter** - whether the strokes sit on one plane or step apart into a
 *   room you can look through;
 * - **intensity** - how hard it burns, which on an additive material is also
 *   how much of the room it lights;
 * - **colour** - one hue knob that turns every stroke together, so a drawing
 *   made in three pen colours stays a drawing rather than becoming a swatch.
 *
 * Disco is the fifth control and is not a slider, because it is not a value: it
 * is the room deciding to do all of it at once.
 *
 * The depth is *shown*, not just applied - the front edge of every wall carries
 * a hot line that fades into the dark as the wall runs back, which is what
 * makes a still frame legible. Without it a deep drawing and a flat one look
 * identical from the front, which is precisely the angle everybody starts at.
 */

export interface RoomWords {
  hint: string
  depth: string
  scatter: string
  intensity: string
  colour: string
  disco: string
  download: string
  clear: string
}

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT = `
precision highp float;

uniform float uHue;
uniform float uShift;
uniform float uIntensity;

varying vec2 vUv;

vec3 wheel(float hue) {
  vec3 k = fract(hue + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0));
  return clamp(abs(k * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

void main() {
  /* 0 on the page, 1 at the far edge of the wall. */
  float back = vUv.y;

  /* The highlight: a hot line where the drawing actually is, falling away into
     the depth behind it. This is what a still frame needs to read as deep. */
  float front = exp(-back * 3.6);
  float glow = 0.22 + front * 0.95;

  vec3 rgb = wheel(fract(uHue + uShift + back * 0.1));
  rgb = mix(rgb, vec3(1.0), pow(front, 6.0) * 0.85);

  float bright = glow * uIntensity;
  gl_FragColor = vec4(rgb * bright, bright);
}
`

/**
 * The two uniform writes, out here rather than inline - the same arrangement
 * `_canvas/rainbow.tsx` argues for: a uniform is mutable state on a
 * long-lived object, and this repo's lint refuses a memo value written to
 * anywhere the compiler believes is render.
 */
function tune(material: THREE.ShaderMaterial, hue: number, intensity: number, creep: number) {
  material.uniforms.uHue.value = hue
  material.uniforms.uIntensity.value = intensity
  material.uniforms.uShift.value += creep
}

/**
 * How to sit the drawing in the frame.
 *
 * The walls are laid out against the *pad* - a stroke in the corner stays in
 * the corner, which is the right rule for a note and the wrong one for a
 * portrait. So the group is scaled and centred on what was actually drawn:
 * relative positions inside the drawing are untouched, and a doodle the size of
 * a stamp fills the room instead of hiding at the back of it.
 *
 * The scale is clamped, because a two-centimetre scribble would otherwise be
 * blown up until its own wobble was the subject.
 */
function frame(walls: Wall[]): { scale: number; x: number; y: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const wall of walls) {
    for (let i = 0; i < wall.positions.length; i += 3) {
      minX = Math.min(minX, wall.positions[i])
      maxX = Math.max(maxX, wall.positions[i])
      minY = Math.min(minY, wall.positions[i + 1])
      maxY = Math.max(maxY, wall.positions[i + 1])
    }
  }

  if (!Number.isFinite(minX)) return { scale: 1, x: 0, y: 0 }

  const width = Math.max(maxX - minX, 0.001)
  const height = Math.max(maxY - minY, 0.001)
  const scale = Math.min(1.7 / width, 1.1 / height, 6)
  return { scale, x: -((minX + maxX) / 2) * scale, y: -((minY + maxY) / 2) * scale }
}

/** And the same for the room's own slow turn, for the same reason. */
function turn(group: THREE.Group, by: number) {
  group.rotation.y += by
}

function wallMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uHue: { value: 0 }, uShift: { value: 0 }, uIntensity: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

function Walls({
  walls,
  hue,
  intensity,
  disco,
}: {
  walls: Wall[]
  /** Degrees, as the sliders count. */
  hue: number
  intensity: number
  disco: boolean
}) {
  const material = useMemo(() => wallMaterial(), [])
  const spin = useMemo(() => new THREE.Group(), [])
  const fit = useMemo(() => frame(walls), [walls])

  useFrame((state, delta) => {
    /*
      Disco is three things at once, which is what makes it read as a mode
      rather than as a setting: the wheel turns under the drawing, the whole
      thing pulses, and the room goes round. Off, none of it moves and the
      sliders say exactly what you see.
    */
    const beat = disco ? 1 + 0.3 * Math.sin(state.clock.elapsedTime * 5.5) : 1
    tune(material, hue / 360, intensity * beat, disco ? delta * 0.22 : 0)
    if (disco) turn(spin, delta * 0.35)
  })

  return (
    <primitive object={spin}>
      <group scale={fit.scale} position={[fit.x, fit.y, 0]}>
        {walls.map((wall, index) => (
          <mesh key={index} material={material}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[wall.positions, 3]} />
              <bufferAttribute attach="attributes-uv" args={[wall.uvs, 2]} />
            </bufferGeometry>
          </mesh>
        ))}
      </group>
    </primitive>
  )
}

/** One labelled slider. The four of them are the whole interface. */
function Knob({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-1 items-center gap-2 text-[0.6875rem] uppercase tracking-wide text-ink-muted">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
    </label>
  )
}

export function InkRoom({
  labels,
  words,
  className,
}: {
  labels: InkLabels
  words: RoomWords
  className?: string
}) {
  const [ink, setInk] = useState<string | null>(null)
  const [depth, setDepth] = useState(0.6)
  const [scatter, setScatter] = useState(0.25)
  const [intensity, setIntensity] = useState(1)
  const [hue, setHue] = useState(300)
  const [disco, setDisco] = useState(false)

  const note = useMemo(() => readNote(ink), [ink])
  const walls = useMemo(
    () => (note ? extrude(note, { depth, scatter }) : []),
    [note, depth, scatter],
  )

  return (
    <div className={`flex flex-col gap-3 ${className ?? ''}`}>
      <InkSlate labels={labels} onNote={setInk} clearLabel={words.clear} />

      <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-line bg-[#07040f]">
        <Canvas camera={{ position: [0, 0.5, 2.6], fov: 50 }} dpr={[1, 2]}>
          {/*
            No lights. Every surface here is additive and lights itself, which
            is also why the room is nearly black: what you can see is exactly
            what somebody drew.
          */}
          <Walls walls={walls} hue={hue} intensity={intensity} disco={disco} />
          <gridHelper args={[8, 16, '#2a1f45', '#170f2b']} position={[0, -1.1, 0]} />
          <OrbitControls enablePan={false} minDistance={1.2} maxDistance={6} />
        </Canvas>

        {walls.length === 0 && (
          <p className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-xs text-ink-muted">
            {words.hint}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Knob label={words.depth} value={depth} min={0} max={2} step={0.02} onChange={setDepth} />
        <Knob
          label={words.scatter}
          value={scatter}
          min={0}
          max={1.5}
          step={0.02}
          onChange={setScatter}
        />
        <Knob
          label={words.intensity}
          value={intensity}
          min={0.2}
          max={2.5}
          step={0.05}
          onChange={setIntensity}
        />
        <Knob label={words.colour} value={hue} min={0} max={360} step={1} onChange={setHue} />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDisco((current) => !current)}
          aria-pressed={disco}
          className={`hud-chip ${disco ? 'border-[var(--color-accent)] text-[var(--color-ink)]' : ''}`}
        >
          {words.disco}
        </button>
        <button
          type="button"
          disabled={!note}
          onClick={() => {
            if (!note) return
            void glbOf(note, { depth, scatter }).then((blob) => saveBlob(blob, 'xoinggan.glb'))
          }}
          className="hud-chip disabled:opacity-40"
        >
          {words.download}
        </button>
      </div>
    </div>
  )
}
