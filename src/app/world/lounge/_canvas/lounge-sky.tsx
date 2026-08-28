'use client'

import { Grid } from '@react-three/drei'
import { PartyClouds, PartySpots } from '@/app/world/_canvas/party-glow'

/**
 * What a world looks like when nothing is happening in it: the palette, the
 * lighting rig, the fog and the floor.
 *
 * Split out of `lounge-scene.tsx` because it is the one part of that scene with
 * no share in the frame loop. Everything else in there is threaded through the
 * same graph of refs that `useFrame` mutates - the player, the peers, the ball,
 * the dash and kick requests - and lifting any of it out means passing that
 * graph back in a prop at a time. This closes over exactly one value (`party`),
 * which is what makes it worth its own file.
 *
 * Nothing here is state. Both components are pure decoration, so mounting and
 * unmounting them is the whole of turning the look on and off.
 */

/**
 * The palette the world is lit and hazed with.
 *
 * Hex rather than the app's oklch tokens because three.js parses CSS colours
 * but not custom properties, and a value read out of the document at runtime
 * would make the scene's look depend on the stylesheet having loaded. These are
 * the same four colours in the same order the theme uses them: the sky `html`
 * is painted with, the ground standing in it, and the two neons.
 *
 * `SKY` in particular has to stay in step with the `html` background in
 * globals.css - it is the fog, and the fog is what makes the far edge of the
 * world and the page behind it the same colour. It is exported because the
 * scene also sets it as the renderer's clear colour when the shutter fires.
 */
export const SKY = '#0a0616'
export const GROUND = '#0e0a20'
const GRID_CELL = '#241a45'
const GRID_SECTION = '#a78bfa'

/**
 * Fog, lights, and the party's own rig when it is on.
 *
 * Rendered inside `<Canvas>`, above everything that casts into it.
 */
export function LoungeLighting({ party }: { party: boolean }) {
  return (
    <>
      {/*
        Fog in the sky's own colour - the same near-black indigo `html` is
        painted with - so distance dissolves into the page instead of into
        a different black. Thinner than it was: with nothing but stars
        behind it, the far grid should fade out over a street rather than
        over a room.
      */}
      <fogExp2 attach="fog" args={[SKY, 0.018]} />

      {/*
        The party's own weather and lighting rig, mounted only while it is
        on: four sweeping gelled lamps and three lit cloud layers overhead.
        Both are pure decoration with no state of their own, so switching
        the party off unmounts them and the room is exactly as it was.
      */}
      {party && (
        <>
          <PartySpots />
          <PartyClouds />
        </>
      )}

      {/*
        Night lighting, in the palette the rest of the app is painted with.

        Still soft and nearly shadowless - a hard key would give the blocks
        a contrast the rest of the page has nowhere - but the white has come
        out of it. The fill is violet, the sky term is the cold blue of the
        starfield and the ground bounce is the floor's own indigo, so a
        white block reads as lit by this world rather than as a hole in it.
      */}
      <ambientLight intensity={1.05} color="#cbb6ff" />
      <hemisphereLight args={['#8ea8ff', GROUND, 0.9]} />
      <directionalLight position={[30, 50, 20]} intensity={1.2} color="#efe6ff" castShadow />
      {/* The two neons, one from each side. This is the pair the landing
          page's blooms are made of - fuchsia high and behind, cyan low and
          in front - so the world is lit by the same two lamps the page is. */}
      <pointLight position={[-30, 20, -20]} intensity={190} color="#f0abfc" distance={170} />
      <pointLight position={[30, 14, 25]} intensity={150} color="#67e8f9" distance={170} />
    </>
  )
}

/**
 * The floor, and the metre grid drawn on it.
 *
 * `userData.isGround` is load-bearing: the targeting raycast in `<Targeting>`
 * recognises the ground and instanced blocks by it and skips everything else it
 * hits, which is what keeps a cloud from being a placeable surface.
 */
export function CosmicGround() {
  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        userData={{ isGround: true }}
      >
        <planeGeometry args={[512, 512]} />
        {/* A shade lighter than the fog rather than black, so the floor
            separates from the sky by a hair at the horizon instead of the two
            meeting in the same void - which is what tells you the world has a
            ground at all. Rough, so it scatters rather than reflecting a hard
            highlight. */}
        <meshStandardMaterial color={GROUND} roughness={1} metalness={0} />
      </mesh>

      <Grid
        position={[0, 0.002, 0]}
        args={[512, 512]}
        cellSize={1}
        cellThickness={0.5}
        // Violet-on-indigo rather than black-on-black: the metre grid was
        // invisible against the floor, which left nothing under your feet to
        // judge a jump by.
        cellColor={GRID_CELL}
        sectionSize={16}
        sectionThickness={1}
        // Sections are chunk-sized on purpose: the stronger lines are the
        // actual boundaries between event streams, so the grid shows you the
        // aggregate seams while you build.
        sectionColor={GRID_SECTION}
        fadeDistance={70}
        fadeStrength={1.6}
        infiniteGrid
      />
    </>
  )
}
