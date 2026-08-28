'use client'

import { Cloud, Clouds, Sparkles } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

import { CLOUD_TEXTURE } from '@/app/world/_canvas/cloud-texture'

/**
 * What a body looks like at a party, and what the room around it looks like.
 *
 * Party mode's whole job is to make a room of grey blocks and pastel animals
 * look like somewhere a night is happening, and the cheapest honest way to do
 * that in a voxel scene is *from the bodies*: a coloured light standing where a
 * person is throws its hue onto the floor, the walls and everybody who walks
 * past, which is what a club actually looks like. Tinting the models instead
 * would recolour the animals and leave the room grey.
 *
 * Three parts, in order of how much they cost:
 *
 * - the light, which is what actually lights the room;
 * - the rim, which is the neon edge around the silhouette - a Fresnel term
 *   added to the body's own material in `<AvatarModel rim>`, not drawn here.
 *   It was a flat additive disc behind the body first, and that is exactly
 *   what it looked like: a pale circle stuck to the floor, brightest where a
 *   glow should be weakest. A shader on the model follows the animation, has
 *   no silhouette of its own, and is what makes an edge light rather than a
 *   halo;
 * - the sparkles, which are drei's and cost one buffer.
 *
 * Everybody's hue is a function of their id, so it is stable across a session
 * and across tabs without anybody sending a colour anywhere - the same trick
 * nameplates use to stay consistent. Except for the host, who cycles: see
 * below.
 */

/** How bright, and how far the light reaches. */
const GLOW_INTENSITY = 11
const GLOW_DISTANCE = 9

/** Chest height, so the light is thrown across the floor rather than up. */
const GLOW_HEIGHT = 1.1

/** Degrees per second the host's rainbow turns through. */
const RAINBOW_RATE = 60

/**
 * A stable hue per person, in degrees.
 *
 * The hash is the one ./lounge/companions used for its seed - small, no
 * dependencies, and good enough that two ids beside each other in a roster do
 * not land on the same colour.
 */
export function hueFor(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index++) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0
  }
  return Math.abs(hash) % 360
}

/**
 * Somebody's party colour, as one mutable `THREE.Color` that lives as long as
 * they do.
 *
 * One object rather than a string, and that is the whole design: the rim shader
 * on their model, the point light at their chest and the sparkles around them
 * all hold a *reference* to it, so the host's rainbow is one `setHSL` a frame
 * rather than three uniforms, two materials and a React render.
 *
 * The host cycles through the wheel; everybody else sits on the hue their id
 * hashes to. Whoever turned party mode on is the one person the room should be
 * able to pick out, and a colour nobody else can have is how a scene says that
 * without a label floating over them. Driven off the shared clock, so every
 * client agrees about what colour they are on.
 */
export function usePartyColour(id: string, rainbow = false): THREE.Color {
  const colour = useMemo(() => new THREE.Color().setHSL(hueFor(id) / 360, 0.9, 0.62), [id])

  useFrame((state) => {
    if (!rainbow) return
    colour.setHSL(((state.clock.elapsedTime * RAINBOW_RATE) % 360) / 360, 0.9, 0.6)
  })

  return colour
}

export function PartyGlow({ colour }: { colour: THREE.Color }) {
  const light = useRef<THREE.PointLight>(null)

  /**
   * The light breathes rather than sitting still.
   *
   * A fixed-brightness lamp under a body reads as a spotlight somebody left on;
   * a slow pulse reads as music. Small - a fifth either way - because the point
   * is that the room is alive, not that it is strobing.
   */
  useFrame((state) => {
    if (!light.current) return
    light.current.intensity =
      GLOW_INTENSITY * (0.85 + 0.15 * Math.sin(state.clock.elapsedTime * 2.4))
  })

  return (
    <>
      <pointLight
        ref={light}
        position={[0, GLOW_HEIGHT, 0]}
        intensity={GLOW_INTENSITY}
        distance={GLOW_DISTANCE}
        decay={2}
        // The same object the rim shader holds, so a rainbow turns everything
        // this body owns at once.
        color={colour}
      />

      {/*
        And the sparkle. Few and slow: this is dust catching a light, not a
        firework, and a body trailing forty of them stops reading as a person.
      */}
      <Sparkles
        count={16}
        scale={[1.5, 2.4, 1.5]}
        position={[0, 1, 0]}
        size={4}
        speed={0.4}
        opacity={0.7}
        color={colour}
      />
    </>
  )
}

/**
 * The weather, for one night only.
 *
 * The lounge's sky is the page's own starfield through a transparent canvas -
 * deliberately empty, because the world is the thing to look at. A party is the
 * one time that is wrong: a room of coloured lights with nothing above it still
 * reads as a room with the lights off, and what sells it is the colour landing
 * on something overhead.
 *
 * `MeshBasicMaterial` on purpose - these are lit by nothing and light nothing,
 * which is what keeps three layers of volumetric sprites cheap, and they drift
 * on their own `speed`.
 *
 * Three fixed colours rather than a cycling one. The bodies below are already
 * each turning the room a different colour, and a sky that cycled too would
 * have the whole scene arriving at one hue every few seconds - which is the
 * moment a party stops being a room and starts being a filter.
 */
export function PartyClouds() {
  const group = useRef<THREE.Group>(null)

  useFrame((state) => {
    const node = group.current
    if (!node) return

    // The whole bank turns very slowly, which is what makes the light overhead
    // move without anything visibly travelling.
    node.rotation.y = state.clock.elapsedTime * 0.02
  })

  return (
    <group ref={group}>
      <Clouds material={THREE.MeshBasicMaterial} texture={CLOUD_TEXTURE}>
        <Cloud
          segments={34}
          bounds={[70, 8, 70]}
          volume={34}
          opacity={0.28}
          speed={0.16}
          color="#e879f9"
          position={[0, 22, 0]}
        />
        <Cloud
          segments={26}
          bounds={[90, 6, 90]}
          volume={26}
          opacity={0.2}
          speed={0.1}
          color="#5eead4"
          position={[-18, 13, -24]}
        />
        <Cloud
          segments={22}
          bounds={[95, 5, 95]}
          volume={22}
          opacity={0.16}
          speed={0.07}
          color="#a78bfa"
          position={[24, 8, 20]}
        />
      </Clouds>
    </group>
  )
}

/** Scratch for aiming a beam, so the frame loop allocates nothing. */
const BEAM_AIM = new THREE.Vector3()

/** How high the lamps hang, how far out they are rigged, and how wide they sweep. */
const SPOT_HEIGHT = 15
const SPOT_RING = 10
const SPOT_SWEEP = 16

/** How bright each lamp burns, and how long its visible beam is. */
const SPOT_INTENSITY = 520
const BEAM_LENGTH = 30
const BEAM_RADIUS = 3.1

/**
 * The neon the lamps are gelled with.
 *
 * Fuchsia, cyan, violet and lime - the app's own accents plus the one that is
 * not in the palette, because a rig in four colours reads as a rig and a rig in
 * the two brand colours reads as a gradient. They are deliberately saturated:
 * a spotlight that washes to white lights the room without colouring it, which
 * is the difference between a party and a car park.
 */
const SPOT_GELS = [
  '#e879f9',
  '#22d3ee',
  '#a78bfa',
  '#a3e635',
  '#fb7185',
  '#38bdf8',
] as const

/**
 * The rig: four gelled lamps sweeping the floor.
 *
 * Each one hangs still and *aims* around a circle, which is what a moving head
 * actually does and what keeps the maths to two sines - moving the lamps
 * themselves would drag their cones through the ceiling. The circles are at
 * different radii, run at different rates and start at different phases, so the
 * four beams cross rather than chasing each other in formation.
 *
 * `<spotLight>` needs its `target` in the scene graph to be aimed at all, which
 * is why each lamp carries an invisible object it points at rather than a bare
 * position: a target that is never added is left at the origin and every beam
 * would stare at the middle of the floor.
 */
export function PartySpots() {
  const targets = useRef<(THREE.Object3D | null)[]>([])
  const lights = useRef<(THREE.SpotLight | null)[]>([])
  const beams = useRef<(THREE.Group | null)[]>([])

  useFrame((state) => {
    const time = state.clock.elapsedTime

    targets.current.forEach((target, index) => {
      if (!target) return

      /**
       * Two circles at once: a fast one and a slow one, at different rates on
       * each axis, so a lamp traces a wandering figure rather than a circle.
       * Six lamps on six clean circles is a fairground carousel; this is a rig
       * with somebody at the desk.
       */
      const rate = 0.5 + index * 0.17
      const phase = (index / SPOT_GELS.length) * Math.PI * 2
      const radius = SPOT_SWEEP * (0.4 + 0.12 * index)

      target.position.set(
        Math.cos(time * rate + phase) * radius + Math.sin(time * 0.23) * 4,
        0,
        Math.sin(time * rate * 0.7 + phase) * radius + Math.cos(time * 0.19) * 4,
      )

      /**
       * Aimed here rather than through a `target` prop, because the prop is
       * read during render and the object it needs does not exist yet on the
       * first one - which leaves every beam pointed at the world origin, all
       * six stacked on the same spot, for the life of the scene.
       */
      const light = lights.current[index]
      if (light) {
        if (light.target !== target) light.target = target

        // Each lamp breathes on its own clock, so the rig is never all at full
        // and never all down - which is what makes it read as moving light
        // rather than as a room with the brightness turned up.
        light.intensity =
          SPOT_INTENSITY * (0.55 + 0.45 * Math.abs(Math.sin(time * (0.8 + index * 0.13))))
      }

      // The visible shaft. Pointed by turning the group that holds it, which is
      // cheaper and steadier than rebuilding a geometry per frame.
      beams.current[index]?.lookAt(target.getWorldPosition(BEAM_AIM))
    })
  })

  return (
    <>
      {SPOT_GELS.map((gel, index) => {
        const around = (index / SPOT_GELS.length) * Math.PI * 2
        const position: [number, number, number] = [
          Math.cos(around) * SPOT_RING,
          SPOT_HEIGHT,
          Math.sin(around) * SPOT_RING,
        ]

        return (
          <group key={gel}>
            <object3D
              ref={(node) => {
                targets.current[index] = node
              }}
            />

            <spotLight
              ref={(node) => {
                lights.current[index] = node
              }}
              position={position}
              color={gel}
              intensity={SPOT_INTENSITY}
              distance={52}
              angle={0.3}
              penumbra={0.9}
              decay={2}
            />

            {/*
              The beam you can see, which is the difference between a lit room
              and a rig.

              A cone, additively blended and open at the wide end, hung from the
              lamp and turned to face wherever it is aimed. Real volumetrics
              would mean a post-processing pass and a depth prepass for six
              lights; this is one transparent mesh each and, at this opacity,
              indistinguishable from across a room full of moving colour.

              A cone is a `+Y` shape, so it is tipped a quarter turn and pushed
              half its length forward: that puts its point at the lamp and its
              open end down `+Z`, which is the axis `Object3D.lookAt` aims -
              lights and cameras look down `-Z`, everything else down `+Z`, and
              getting that backwards is a rig shining out of the ceiling.
            */}
            <group
              position={position}
              ref={(node) => {
                beams.current[index] = node
              }}
            >
              <mesh
                position={[0, 0, BEAM_LENGTH / 2]}
                rotation={[-Math.PI / 2, 0, 0]}
                userData={{ ignoreRay: true }}
                renderOrder={-2}
              >
                <coneGeometry args={[BEAM_RADIUS, BEAM_LENGTH, 24, 1, true]} />
                <meshBasicMaterial
                  color={gel}
                  transparent
                  opacity={0.07}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </mesh>
            </group>
          </group>
        )
      })}
    </>
  )
}
