'use client'

import { Sparkles } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * What the people you are playing with look like when the lights are on.
 *
 * ---------------------------------------------------------------------------
 * The lounge has this, and an XP could not
 * ---------------------------------------------------------------------------
 * `src/app/world/party-glow.tsx` has done this since party mode existed: a
 * coloured light standing where each person is, throwing its hue onto the floor
 * and onto everybody who walks past. A match had none of it. `SkinnedCrowd`
 * placed bodies and stopped there, so a room of four people in an XP was four
 * grey animals, and the same four in the lounge next door were a party.
 *
 * Copied rather than imported, for the rule `docs/xp/README.md` states and lint
 * enforces: `src/app/xp/**` must not import the lounge. What is deliberately
 * identical is `hueFor` and the light - somebody who is blue in the lounge has
 * to be blue in the match, or the colour stops being a way to tell who is who.
 *
 * What is *not* here, and is not an oversight:
 *
 * - **No clouds.** The lounge hangs a sky over the party because its own is
 *   empty. A level brings its own world and its own idea of what is overhead,
 *   and a bank of pink cloud across somebody's platformer is a filter rather
 *   than a party.
 * - **No rim.** The lounge adds a Fresnel edge to the avatar's material through
 *   `<AvatarModel rim>`. Bodies here are `SkeletonUtils` clones of whatever
 *   pack the level named, so the same thing means patching materials nobody in
 *   this file owns. The light is what actually lights the room - the lounge's
 *   own note says so - and the edge can follow it later.
 */

/** How bright, and how far the light reaches. The lounge's numbers. */
const GLOW_INTENSITY = 11
const GLOW_DISTANCE = 9

/** Chest height, so the light is thrown across the floor rather than up. */
const GLOW_HEIGHT = 1.1

/** Degrees per second the host's rainbow turns through. */
const RAINBOW_RATE = 60

/**
 * A stable hue per person, in degrees.
 *
 * The same hash the lounge uses, and it has to be: this is what makes a person
 * one colour wherever they are standing, without anybody sending a colour
 * anywhere. Two ids beside each other in a roster do not land on one hue.
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
 * One object rather than a string, so the light and the sparkles hold a
 * *reference* to it and a rainbow is one `setHSL` a frame rather than two
 * materials and a React render.
 *
 * The host cycles through the wheel and everybody else sits on their own hue,
 * which is how a scene points at whoever turned the lights on without a label
 * floating over them. Off the shared clock, so every client agrees.
 */
export function usePartyColour(id: string, rainbow = false): THREE.Color {
  const colour = useMemo(() => new THREE.Color().setHSL(hueFor(id) / 360, 0.9, 0.62), [id])

  useFrame((state) => {
    if (!rainbow) return
    colour.setHSL(((state.clock.elapsedTime * RAINBOW_RATE) % 360) / 360, 0.9, 0.6)
  })

  return colour
}

/**
 * The light and the dust around one body.
 *
 * Rendered *inside* whatever group is already moving that body, so it goes
 * where they go without this knowing anything about where that is - which is
 * what lets `SkinnedBody` take it as a child and stay a body-placer.
 */
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
 * One co-player's glow, which is a component only so the hook has somewhere to
 * live.
 *
 * `usePartyColour` is a hook and the crowd is a list, so a colour per peer
 * cannot be computed in the loop that draws them. A component per peer is the
 * standard answer and costs nothing here: the crowd is already one component
 * per body.
 */
export function PeerGlow({ id, host }: { id: string; host?: boolean }) {
  return <PartyGlow colour={usePartyColour(id, host)} />
}
