'use client'

import { createRoot, extend, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { AvatarClip } from '@/domain/lounge/avatars'
import { DEFAULT_LIGHT, NEON_LIGHT } from '@/domain/studio/scene'
import {
  Ball,
  Block,
  blockY,
  Emote,
  facing,
  Goal,
  GrassPatch,
  Peep,
  Rig,
  rounded,
  Tiny,
  TINY_TILE,
  type Vec3,
} from '@/app/world/shots/pieces'

/**
 * The whole three.js namespace, as JSX elements.
 *
 * `<Canvas>` does this for you on mount; `createRoot` deliberately does not, so
 * an app that only uses a handful of elements can drop the rest. This studio
 * uses `createRoot` for the reason the effect below explains, which makes the
 * catalogue its job - without it the first `<ambientLight>` throws "not part of
 * the THREE namespace", the root never commits, and the page sits at "loading
 * models" with nothing in the console but a stack trace.
 *
 * The catalogue is typed as a map of constructors and the namespace also
 * exports functions and constants, so handing over the whole thing is
 * deliberately wider than the signature allows - which is the point, and why
 * the error is expected rather than ignored.
 */
// @ts-expect-error - the THREE namespace is wider than `Catalogue`, on purpose.
extend(THREE as unknown as Record<string, unknown>)

/**
 * The baked marketing scenes: arranged in code, drawn once each, shot to PNG.
 *
 * The pieces they are built from live in `./pieces`, shared with the backoffice
 * studio, which arranges the same set by hand. Everything below is the fixed
 * set - the shots the landing page actually ships, under names
 * `scripts/shoot-scenes.ts` knows.
 *
 * `frameloop="never"`, and `preserveDrawingBuffer` on the context: without the
 * latter the colour buffer may be thrown away after a draw, and `toDataURL`
 * reads back a transparent rectangle on most drivers. See the note in
 * `./pieces` about why nothing here ticks.
 *
 * The background stays transparent on purpose. These land on the site's own
 * sky - the same reason the in-app canvases have no `<color attach="background">`
 * - so the shot has to end at the geometry, not at a rectangle of sky the page
 * would have to match.
 */

interface SceneSpec {
  /** Delivered pixel size. */
  width: number
  height: number
  camera: { position: Vec3; target: Vec3; fov: number }
  content: React.ReactNode
  /**
   * Whether the shared daylight rig is switched on for this scene.
   *
   * Every shot here is lit by `Rig` unless it says otherwise, which is right
   * for all of them bar one kind: they are places, and a place wants a sun.
   *
   * The heaps are not places. They are objects on a black field lit only by
   * three coloured sources, and the gaps between those colours are the whole
   * effect - so a scene that brings its own rig has to be able to turn the
   * daylight *off*, not merely add to it. Adding to it is what the first
   * attempt did, and the result was a pile lit by a sun with some coloured
   * lights lost inside it.
   */
  lighting?: 'daylight' | 'own'
}

// ---------------------------------------------------------------------------
// The scenes
// ---------------------------------------------------------------------------

/**
 * A player, running at the ball.
 *
 * The two things a chasing animal needs - a heading and a stride - are both
 * derived here from where it is and where the ball is, so a scene only has to
 * say who is on the pitch and where. `time` still comes in per player: one
 * pack, one run cycle, and six animals hitting the same frame of it looks like
 * a chorus line rather than a scramble.
 */
function Chaser({
  model,
  at,
  ball,
  time,
  clip = 'run',
}: {
  model: string
  at: Vec3
  ball: Vec3
  time: number
  clip?: AvatarClip
}) {
  return <Peep model={model} position={at} rotation={facing(at, ball)} clip={clip} time={time} />
}

/**
 * Where the link card is shot from.
 *
 * A constant because the scene aims its animals at it by name: the whole idea
 * of that shot is three faces looking down the lens, and a camera moved without
 * them is three animals looking at where it used to be.
 */
const OG_EYE: Vec3 = [6.9, 3.5, 8.6]

// ---------------------------------------------------------------------------
// The venue, in layers
// ---------------------------------------------------------------------------

/**
 * The footprint the floor gets laid on.
 *
 * A rectangle rather than a shape, because it is the thing the lawn is cut
 * around and the thing the deck fills, and those two have to agree exactly or
 * stage 1 shows a strip of dirt that stage 2 never covers.
 */
const DECK = (x: number, z: number) => Math.abs(x) <= 6 && Math.abs(z) <= 5

/** The ground around the build, which never changes. */
const VENUE_LAWN = (
  <GrassPatch
    cols={19}
    rows={17}
    keep={(x, z) => rounded(19, 17)(x, z) && !DECK(x, z)}
    top="gravel"
  />
)

/**
 * Stage one only: the footprint marked out and nothing standing on it.
 *
 * Dirt rather than more gravel, so the empty plot is legibly *the place the
 * room goes* rather than a gap in the picture. It is the one layer that is
 * replaced instead of added to - the deck lands in exactly these cells, and
 * drawing both would put two tops at one height and let the depth buffer pick.
 */
const VENUE_PLOT = <GrassPatch cols={13} rows={11} top="dirt" />

/** Stage two: the floor, laid. */
const VENUE_DECK = (
  <group>
    {Array.from({ length: 13 }, (_, ix) =>
      Array.from({ length: 11 }, (_, iz) => {
        const x = ix - 6
        const z = iz - 5
        return (
          <Block
            key={`deck${x}:${z}`}
            model={(x + z) % 2 === 0 ? 'stone' : 'stone_dark'}
            position={[x, blockY(0), z]}
          />
        )
      }),
    )}
  </group>
)

/**
 * Stage three: a table per team down both sides, and a stage at the front.
 *
 * Pushed out to the edges of the deck rather than gathered near the middle. An
 * animal is two blocks tall and the floor has to hold five of them with room to
 * walk between - furniture nearer the centre than this turns the shot into a
 * pile, which is what the first pass of it was.
 */
const VENUE_FITOUT = (
  <>
    {[-3, 0, 3].map((z) => (
      <group key={`table${z}`}>
        <Block model="crate" position={[-5, blockY(1), z]} />
        <Block model="computer" position={[-5, blockY(2), z]} rotation={0.5} />
        <Block model="crate" position={[5, blockY(1), z]} />
        <Block model="computer" position={[5, blockY(2), z]} rotation={-0.5} />
      </group>
    ))}
    {[-2, -1, 0, 1, 2].map((x) => (
      <Block key={`stage${x}`} model="wood" position={[x, blockY(1), -4]} />
    ))}
    <Block model="barrel" position={[-3, blockY(1), 4]} />
    <Block model="hay_bale" position={[3, blockY(1), 4]} />
  </>
)

/**
 * Stage four: the wall, and their name on it.
 *
 * The banner is the one place a still can say "your colours" without a logo to
 * put up, so it is drawn in the pack's own coloured blocks rather than left as
 * an empty frame waiting for an asset nobody has uploaded yet. A blank board
 * would read as a wall that has not been finished, which is the opposite of
 * what this stage is claiming.
 */
const VENUE_WALLS = (
  <>
    {[-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((x) => (
      <group key={`wall${x}`}>
        <Block model="bricks_A" position={[x, blockY(1), -6]} />
        <Block model="bricks_A" position={[x, blockY(2), -6]} />
      </group>
    ))}
    {/* One hue across the band rather than alternating primaries. Two colours
        made it a row of toy bricks, which is the one reading this world cannot
        afford here: the claim is "your colours", and a banner has one. */}
    {[-3, -2, -1, 0, 1, 2, 3].map((x) => (
      <Block key={`banner${x}`} model="colored_block_blue" position={[x, blockY(3), -6]} />
    ))}
    <Block model="stone_with_gold" position={[-4, blockY(3), -6]} />
    <Block model="stone_with_gold" position={[4, blockY(3), -6]} />
  </>
)

/** Stage five: the doors open, and the room stops being a room and becomes an event. */
const VENUE_CROWD = (
  <>
    <Peep model="fox" position={[-3.4, 0, 3.2]} rotation={0.6} clip="walk" time={0.4} />
    <Peep model="panda" position={[3.4, 0, 1.2]} rotation={-1.9} clip="idle" time={2.1} />
    <Peep model="penguin" position={[0.2, 0, 4.2]} rotation={2.7} clip="idle" time={1.2} />
    <Peep model="bunny" position={[-4.2, 0, -0.8]} rotation={1.4} clip="dance" time={0.8} />
    <Peep model="tiger" position={[1.8, 0, -2.6]} rotation={-2.4} clip="walk" time={0.65} />
    {/* Two bubbles, not three. A third put a face over the animal behind it and
        turned the middle of the floor into a cluster of speech rather than a
        room with people talking in it. */}
    <Emote id={2} position={[-3.4, 3.0, 3.2]} size={0.85} />
    <Emote id={14} position={[3.4, 3.1, 1.2]} size={0.85} />
  </>
)

/**
 * One camera and one delivered size for all five, because they are one shot.
 *
 * High and well back. The subject is a *room*, and a room is only legible from
 * far enough away to see its edges - the first pass sat at eye level a few
 * cells off the floor, and every stage came back as a close-up of whatever
 * happened to be nearest the lens.
 */
const VENUE_SHOT = {
  width: 1400,
  height: 1000,
  camera: { position: [20, 17.5, 24] as Vec3, target: [0, 0.6, -1] as Vec3, fov: 26 },
}

const VENUE_STAGES: Record<string, SceneSpec> = {
  'venue-1-plot': {
    ...VENUE_SHOT,
    content: (
      <>
        {VENUE_LAWN}
        {VENUE_PLOT}
      </>
    ),
  },
  'venue-2-floor': {
    ...VENUE_SHOT,
    content: (
      <>
        {VENUE_LAWN}
        {VENUE_DECK}
      </>
    ),
  },
  'venue-3-fitout': {
    ...VENUE_SHOT,
    content: (
      <>
        {VENUE_LAWN}
        {VENUE_DECK}
        {VENUE_FITOUT}
      </>
    ),
  },
  'venue-4-branded': {
    ...VENUE_SHOT,
    content: (
      <>
        {VENUE_LAWN}
        {VENUE_DECK}
        {VENUE_FITOUT}
        {VENUE_WALLS}
      </>
    ),
  },
  'venue-5-doors': {
    ...VENUE_SHOT,
    content: (
      <>
        {VENUE_LAWN}
        {VENUE_DECK}
        {VENUE_FITOUT}
        {VENUE_WALLS}
        {VENUE_CROWD}
      </>
    ),
  },
}

/**
 * The heaps, and why they are shot here.
 *
 * ---------------------------------------------------------------------------
 * Why these are shot here and not by `scripts/render-shapes.ts`
 * ---------------------------------------------------------------------------
 * They were, and they looked like what they were: `gltf-raster.ts` is a Lambert
 * rasterizer with no shadow pass and no occlusion term of any kind, so nothing
 * in a heap ever cast onto anything else and nothing darkened where two objects
 * met. A pile of twelve blocks came out as twelve separately-lit blocks
 * occupying the same rectangle - correct, and completely flat.
 *
 * Contact is the whole thing. An object reads as sitting on another object
 * because of the shadow it puts there, and no amount of tuning a light rig
 * without shadows recovers that. So the heaps moved here, where the real
 * renderer is: percentage-closer soft shadows off a 2048 map, the same one the
 * other shots use.
 *
 * The rig itself is `NEON_LIGHT` from the studio's own domain rather than a
 * local one, so the preset an operator picks in the backoffice is the same
 * preset these are baked under.
 */
/**
 * One block in a heap.
 *
 * A thin wrapper over `Block` that exists only to take a tilt. `Block` rotates
 * about Y alone, which is right for a world where everything is placed on a
 * grid - and wrong for a pile, where the single most important thing is that no
 * two neighbours share an angle. A heap of axis-aligned cubes is a wall.
 */
function Heaped({
  model,
  position,
  tilt = [0, 0, 0],
  scale = 1,
}: {
  model: string
  position: Vec3
  tilt?: Vec3
  scale?: number
}) {
  return (
    <group position={position} rotation={tilt} scale={scale}>
      <Block model={model} position={[0, 0, 0]} />
    </group>
  )
}

const SCENES: Record<string, SceneSpec> = {
  /**
   * The three sculptural heaps, for the tops of /play, /create and /share.
   *
   * Same camera and same rig on all three so they read as one set shot in one
   * session, and three different sets of blocks so they do not read as one
   * image reused. What differs is only which objects are in the pile: things
   * you play with, things you build with, things you hand somebody.
   *
   * Blocks are one unit each at `BLOCK_SCALE`, so the positions below are in
   * whole blocks and `blockY` is not used - nothing here is standing on a grid,
   * it is a pile, and the y values are chosen so pieces rest on each other
   * rather than on a floor.
   *
   * The tilts are the composition. No two neighbours share an angle, which is
   * the one rule that separates a heap from a wall, and the pieces near the top
   * lean hardest because that is where the silhouette is doing the work.
   */
  'heap-play': {
    width: 1200,
    height: 1200,
    camera: { position: [7.2, 5.4, 8.4], target: [0, 1.0, 0], fov: 36 },
    lighting: 'own',
    content: (
      <>
        <Rig light={NEON_LIGHT} radius={7} />

        {/* Base: three wide, tilted off square so the pile has no flat front. */}
        <Heaped model="stone" position={[-1.15, -0.9, 0.5]} tilt={[0, 0.34, 0.05]} />
        <Heaped model="bricks_A" position={[0.95, -0.95, -0.45]} tilt={[0.04, -0.22, -0.06]} />
        <Heaped model="crate" position={[0.05, -0.85, 1.75]} tilt={[0.08, 0.76, 0.03]} />

        {/* Middle: the things you knock about. */}
        <Heaped model="barrel" position={[-1.35, 0.15, -0.15]} tilt={[0.05, 0.52, -0.1]} />
        <Heaped model="colored_block_red" position={[0.7, 0.1, 0.85]} tilt={[-0.07, -0.62, 0.09]} />
        <Heaped model="hay_bale" position={[1.85, 0.05, -1.35]} tilt={[0.1, 0.18, 0.12]} />

        {/* Top: smaller, leaning harder, breaking the outline. */}
        <Heaped model="striped_block_yellow" position={[-0.25, 1.15, 0.1]} tilt={[0.12, 0.95, -0.14]} />
        <Heaped model="melon" position={[1.15, 1.1, 0.95]} tilt={[0, -0.4, 0]} scale={0.8} />
        <Heaped model="apple" position={[-1.75, 1.2, 1.25]} tilt={[0.1, 0.66, 0.1]} scale={0.7} />

        {/* The three that float clear, which is what stops the pile reading as
            a lump with a jagged top edge. */}
        <Heaped model="dynamite" position={[0.15, 2.35, -0.3]} tilt={[0.28, 1.2, 0.22]} scale={0.75} />
        <Heaped model="colored_block_blue" position={[2.15, 1.95, 0.7]} tilt={[0.3, -0.85, -0.25]} scale={0.6} />
        <Heaped model="gift" position={[-2.0, 2.5, -0.75]} tilt={[-0.2, 0.42, 0.3]} scale={0.65} />
      </>
    ),
  },

  'heap-create': {
    width: 1200,
    height: 1200,
    camera: { position: [7.2, 5.4, 8.4], target: [0, 1.0, 0], fov: 36 },
    lighting: 'own',
    content: (
      <>
        <Rig light={NEON_LIGHT} radius={7} />

        <Heaped model="dirt_with_grass" position={[-1.2, -0.9, 0.35]} tilt={[0, 0.16, 0.04]} />
        <Heaped model="gravel" position={[0.9, -0.95, -0.6]} tilt={[0.05, -0.38, -0.05]} />
        <Heaped model="wood" position={[0.05, -0.85, 1.7]} tilt={[0.07, 0.64, 0.04]} />

        <Heaped model="metalframe" position={[-1.45, 0.15, -0.35]} tilt={[0.06, 0.48, -0.09]} />
        <Heaped model="prototype" position={[0.8, 0.1, 0.75]} tilt={[-0.08, -0.72, 0.1]} />
        <Heaped model="pipe" position={[1.9, 0.05, -1.4]} tilt={[0.11, 0.88, 0.13]} />

        <Heaped model="computer" position={[-0.35, 1.15, 0.2]} tilt={[0.09, 0.24, -0.11]} scale={0.9} />
        <Heaped model="books_A" position={[1.25, 1.1, 0.9]} tilt={[0.05, -0.55, 0.08]} scale={0.85} />
        <Heaped model="tree" position={[-1.85, 1.35, 1.1]} tilt={[0, 0.33, 0]} scale={0.8} />

        <Heaped model="anvil" position={[0.2, 2.35, -0.4]} tilt={[0.24, 1.05, 0.26]} scale={0.7} />
        <Heaped model="decorative_block_green" position={[2.2, 1.95, 0.6]} tilt={[0.32, -0.9, -0.22]} scale={0.58} />
        <Heaped model="battery" position={[-2.05, 2.5, -0.7]} tilt={[-0.22, 0.58, 0.28]} scale={0.6} />
      </>
    ),
  },

  'heap-share': {
    width: 1200,
    height: 1200,
    camera: { position: [7.2, 5.4, 8.4], target: [0, 1.0, 0], fov: 36 },
    lighting: 'own',
    content: (
      <>
        <Rig light={NEON_LIGHT} radius={7} />

        <Heaped model="stone_dark" position={[-1.15, -0.9, 0.45]} tilt={[0, -0.3, 0.05]} />
        <Heaped model="chest" position={[0.95, -0.95, -0.55]} tilt={[0.04, 0.44, -0.05]} />
        <Heaped model="bricks_B" position={[0.1, -0.85, 1.75]} tilt={[0.07, 0.71, 0.03]} />

        <Heaped model="vault" position={[-1.4, 0.15, -0.25]} tilt={[0.05, 0.58, -0.09]} />
        <Heaped model="gift" position={[0.75, 0.1, 0.8]} tilt={[-0.07, -0.66, 0.1]} />
        <Heaped model="stone_with_gold" position={[1.9, 0.05, -1.4]} tilt={[0.1, 0.22, 0.12]} />

        <Heaped model="decorative_block_blue" position={[-0.3, 1.15, 0.15]} tilt={[0.11, 0.93, -0.13]} />
        <Heaped model="glass" position={[1.3, 1.1, 0.95]} tilt={[0.04, -0.46, 0.07]} scale={0.9} />
        <Heaped model="books_B" position={[-1.9, 1.2, 1.25]} tilt={[0.08, 0.62, 0.09]} scale={0.8} />

        <Heaped model="gift" position={[0.15, 2.35, -0.35]} tilt={[0.26, 1.15, 0.24]} scale={0.65} />
        <Heaped model="stone_with_silver" position={[2.15, 1.95, 0.65]} tilt={[0.3, -0.82, -0.24]} scale={0.58} />
        <Heaped model="battery" position={[-2.0, 2.5, -0.7]} tilt={[-0.2, 0.48, 0.3]} scale={0.6} />
      </>
    ),
  },

  /** The crew: a patch of grass, four animals, faces over three of them. */
  crew: {
    width: 1600,
    height: 900,
    camera: { position: [7.4, 3.6, 8.2], target: [0, 1.1, 0], fov: 34 },
    content: (
      <>
        <GrassPatch cols={13} rows={11} keep={rounded(13, 11)} />
        {/* Something to stand on and something to sit on, so the patch reads as
            a built room rather than as a lawn with animals parked on it. */}
        <Block model="hay_bale" position={[-3.5, blockY(1), -2.5]} />
        <Block model="crate" position={[3.5, blockY(1), -3.5]} />
        <Block model="barrel" position={[4.5, blockY(1), -2.5]} />
        <Block model="books_A" position={[3.5, blockY(2), -3.5]} />

        <Peep model="penguin" position={[0.4, 0, 1.6]} rotation={2.5} clip="idle" time={1.1} />
        <Peep model="fox" position={[-2.2, 0, 0.2]} rotation={1.1} clip="dance" time={0.7} />
        <Peep model="panda" position={[2.4, 0, -0.6]} rotation={-2.2} clip="idle" time={2.4} />
        <Peep model="bunny" position={[-0.6, 0, -2.4]} rotation={0.3} clip="walk" time={0.35} />

        <Emote id={2} position={[0.4, 3.0, 1.6]} />
        <Emote id={27} position={[-2.2, 3.1, 0.2]} />
        <Emote id={14} position={[2.4, 3.2, -0.6]} />
      </>
    ),
  },

  /**
   * Football, one player: somebody killing ten minutes with a ball.
   *
   * Shot from high and far back with a long lens, which is the whole idea - one
   * animal on a pitch built for a crowd. The emptiness is the subject, so the
   * frame keeps it: the pitch runs out of the bottom of the picture and the
   * player sits off-centre with the goal a long way behind them.
   */
  'football-solo': {
    width: 1400,
    height: 1000,
    camera: { position: [7.2, 6.4, 9.6], target: [-0.4, 0.9, -1.2], fov: 30 },
    content: (
      <>
        <GrassPatch cols={17} rows={15} keep={rounded(17, 15)} top="grass" />
        <Goal position={[0, 0, -6.5]} colour="#38bdf8" width={5} height={3} />
        <Ball position={[0.6, 0.42, -0.4]} />
        <Chaser model="penguin" at={[-0.6, 0, 1.4]} ball={[0.6, 0.42, -0.4]} time={0.34} />
        <Emote id={2} position={[-0.6, 2.9, 1.4]} size={0.9} />
      </>
    ),
  },

  /**
   * Football, two players: the challenge, which is the shape most of these
   * games actually take.
   *
   * Camera at a metre and a half, out on the touchline: from down here the two
   * of them are the same height as each other and bigger than the goal, which
   * is what a one-against-one feels like from inside it. The ball is between
   * them and slightly off the ground - neither has it yet.
   */
  'football-duel': {
    width: 1500,
    height: 1000,
    camera: { position: [1.2, 1.8, 9.8], target: [-0.2, 1.35, -0.6], fov: 38 },
    content: (
      <>
        <GrassPatch cols={15} rows={13} keep={rounded(15, 13)} top="grass" />
        <Goal position={[-0.5, 0, -6]} colour="#3b82f6" width={5} height={3} />
        <Ball position={[-0.2, 0.62, -0.2]} />
        <Chaser model="fox" at={[-2.5, 0, 1.0]} ball={[-0.2, 0.42, -0.2]} time={0.28} />
        <Chaser model="tiger" at={[2.4, 0, -1.0]} ball={[-0.2, 0.42, -0.2]} time={0.61} />
        <Emote id={40} position={[-2.5, 2.9, 1.0]} size={0.85} />
        <Emote id={27} position={[2.4, 3.0, -1.0]} size={0.85} />
      </>
    ),
  },

  /**
   * Football, everybody: six animals and one ball, which is the only tactic a
   * break-length game has ever had.
   *
   * High and wide from the corner, because the ball is the story and at eye
   * level six animals stand in front of it. Both goals are behind the pack from
   * here: a goal between the camera and the game is a blue wall across the
   * picture, which is what the first version of this shot was.
   */
  'football-crowd': {
    width: 1600,
    height: 1000,
    camera: { position: [9.8, 6.6, 11.4], target: [-0.6, 0.9, -1.4], fov: 32 },
    content: (
      <>
        <GrassPatch cols={19} rows={17} keep={rounded(19, 17)} top="grass" />
        <Goal position={[0.5, 0, -7.5]} colour="#3b82f6" width={5} height={3} />
        <Ball position={[0, 0.42, 0]} />
        {/* A ring with a hole in it, facing in. The gap is on the camera's side
            so there is a lane through the pack to the ball - a closed circle of
            six from up here is a wall with a rumour of a ball inside it. */}
        <Chaser model="cow" at={[-3.4, 0, 0.4]} ball={[0, 0.42, 0]} time={0.22} />
        <Chaser model="tiger" at={[-1.6, 0, -3.2]} ball={[0, 0.42, 0]} time={0.55} />
        <Chaser model="bunny" at={[2.4, 0, -2.6]} ball={[0, 0.42, 0]} time={0.81} />
        <Chaser model="monkey" at={[3.6, 0, 1.2]} ball={[0, 0.42, 0]} time={0.4} />
        <Chaser model="koala" at={[-0.6, 0, 4.2]} ball={[0, 0.42, 0]} time={0.66} clip="walk" />
        {/* The one who has stopped chasing and is just enjoying it. */}
        <Peep model="deer" position={[-3.4, 0, 3.2]} rotation={2.1} clip="dance" time={0.9} />
        <Emote id={14} position={[-3.4, 2.9, 0.4]} size={0.8} />
        <Emote id={5} position={[2.4, 2.9, -2.6]} size={0.8} />
        <Emote id={2} position={[-3.4, 2.9, 3.2]} size={0.8} />
      </>
    ),
  },

  /**
   * Football, the goal: seen from behind it, over the keeper's shoulder.
   *
   * The one angle in the set that is not a spectator's: behind the goal and off
   * to one side, so the frame is looking back up the pitch through the posts at
   * whoever is arriving. Off to the side rather than dead centre because the
   * mouth of the goal is a tinted plane - stand square behind it and it is a
   * sheet of blue over the entire picture.
   */
  'football-goal': {
    width: 1500,
    height: 1000,
    camera: { position: [-7.6, 2.4, -11.2], target: [-0.6, 1.3, -3.4], fov: 40 },
    content: (
      <>
        <GrassPatch cols={17} rows={19} keep={rounded(17, 19)} top="grass" />
        <Goal position={[0, 0, -7]} colour="#3b82f6" width={5.4} height={3.2} />
        {/* Off the ground and a stride out from the line: this is the moment
            before it goes in, which is a better picture than the moment after. */}
        <Ball position={[-1.2, 1.15, -5.2]} radius={0.42} />
        {/* The keeper, off their line and facing the shot rather than us. */}
        <Chaser model="chick" at={[0.8, 0, -6.2]} ball={[-1.2, 0.42, -5.2]} time={0.45} clip="walk" />
        <Chaser model="panda" at={[-1.4, 0, -1.4]} ball={[-1.2, 0.42, -5.2]} time={0.18} />
        <Chaser model="cat" at={[2.6, 0, 0.8]} ball={[-1.2, 0.42, -5.2]} time={0.72} />
        <Emote id={40} position={[-1.4, 3.0, -1.4]} size={0.85} />
      </>
    ),
  },

  /**
   * The link card: what a stranger sees before they have seen anything else.
   *
   * Authored at 1200x630 because that is the one size Open Graph and X both
   * crop to, and a shot composed at 16:9 and letterboxed into it loses a
   * quarter of its height to bars. Everything that matters sits inside the
   * middle two thirds: the platforms that do not honour the ratio crop from the
   * sides, so an animal near the frame edge is an animal some feeds cut in half.
   *
   * Faces up and towards the camera rather than towards each other. This is the
   * only shot in the set whose job is eye contact - it is seen at thumbnail
   * size, in a timeline, by somebody who was not looking for it.
   */
  'og-hero': {
    width: 1200,
    height: 630,
    camera: { position: OG_EYE, target: [0, 1.35, 0], fov: 32 },
    content: (
      <>
        <GrassPatch cols={13} rows={11} keep={rounded(13, 11)} />
        {/* Pulled a block in from where the crew scene has them: this frame is
            wider than it is tall, and anything past x=4 is in the strip the
            square crops throw away. */}
        {/* Forward and hard left, not back and left: this camera is off to +x,
            so the far corner of the patch projects into the middle of the frame
            and a bale parked there lands on the middle animal's head as a hat.
            Bringing it towards the camera is what moves it sideways. */}
        <Block model="hay_bale" position={[-5.6, blockY(1), 0.4]} />
        <Block model="crate" position={[3.0, blockY(1), -3.5]} />
        <Block model="barrel" position={[3.8, blockY(1), -2.5]} />
        <Block model="books_A" position={[3.0, blockY(2), -3.5]} />

        {/* Turned out of the room and towards the lens - `facing` aims at the
            camera's own position, which is why that is a constant: the three
            rotations and the shot have to keep agreeing. Three of them, not
            four: at this size a fourth is a smudge. */}
        <Peep
          model="fox"
          position={[-2.4, 0, 0.7]}
          rotation={facing([-2.4, 0, 0.7], OG_EYE)}
          clip="dance"
          time={0.7}
        />
        <Peep
          model="penguin"
          position={[0.3, 0, 1.5]}
          rotation={facing([0.3, 0, 1.5], OG_EYE)}
          clip="idle"
          time={1.1}
        />
        <Peep
          model="panda"
          position={[2.7, 0, -0.2]}
          rotation={facing([2.7, 0, -0.2], OG_EYE)}
          clip="walk"
          time={0.4}
        />

        {/* Three cheerful ones. The sheet has plenty that are not - a frown over
            the animal in the middle of the link card is a thumbnail that says
            the opposite of what the card is for. */}
        <Emote id={14} position={[-2.4, 3.5, 0.7]} />
        <Emote id={27} position={[0.3, 3.0, 1.5]} />
        <Emote id={5} position={[2.7, 3.2, -0.2]} />
      </>
    ),
  },

  /**
   * The cafe: a counter, somebody behind it and somebody waiting at it.
   *
   * The one shot in the set with no ball in it, and that is the point - it is
   * aimed at the audience that would scroll past a football clip. Eye level and
   * close, because a cosy room photographed from a crane is a floor plan.
   *
   * Tiny Treats again, so the floor is on the 2-unit grid the pack is authored
   * to - the same reason the house scene lays its own grass rather than using
   * `GrassPatch`, which is bb10 at 1 unit and would put the counter at the
   * wrong height for the animal standing behind it.
   */
  'cafe-counter': {
    width: 1500,
    height: 1000,
    camera: { position: [8.8, 4.6, 11.6], target: [-0.8, 1.1, -0.8], fov: 30 },
    content: (
      <>
        {/*
          Dropped half a unit, and that is not a nudge.

          The kitchen tile is modelled from y=0 *up* to y=0.5, unlike the park
          and house floors, which hang below zero. Laid at y=0 like those, every
          animal in the room stands with its feet half a unit under the tiles -
          which does not read as sunk, it reads as lying down.

          Nine rows deep rather than seven: the storefront is 5.7 units of model
          and needs a floor to stand on, and the customers' side of the counter
          needs room for somebody to be standing in it.
        */}
        {Array.from({ length: 7 }, (_, ix) =>
          Array.from({ length: 9 }, (_, iz) => (
            <Tiny
              key={`${ix}:${iz}`}
              model="kitchen/floor_tiles_kitchen"
              position={[(ix - 3) * TINY_TILE, -0.5, (iz - 4) * TINY_TILE]}
            />
          )),
        )}

        {/* The shop is the backdrop. Its front face lands at z = -3.7, which is
            what everything below is placed in front of. */}
        <Tiny model="cafe/bakery_A" position={[-1.2, 0, -7]} />

        {/* The counter runs across the frame at z = -1.4, so the barista behind
            it is read as being *behind* something rather than beside it. */}
        <Tiny model="cafe/countertop_straight_A_large" position={[-TINY_TILE, 0, -1.4]} />
        <Tiny model="cafe/countertop_straight_A_large" position={[0, 0, -1.4]} />
        <Tiny model="cafe/countertop_straight_A_large" position={[TINY_TILE, 0, -1.4]} />
        <Tiny model="cafe/coffee_machine" position={[-2.2, 1.0, -1.6]} />
        <Tiny model="cafe/cash_register" position={[1.9, 1.0, -1.5]} rotation={2.9} />
        <Tiny model="cafe/coffee_cup_takeaway" position={[0.3, 1.0, -1.1]} />
        <Tiny model="cafe/coffee_cup_takeaway_stacked" position={[-0.6, 1.0, -1.7]} />
        <Tiny model="cafe/cookie_jar" position={[0.9, 1.0, -1.7]} />

        {/* A table out on the customers' side, well clear of anybody standing:
            a counter on its own is a shop, and the point of the room is that
            people stay in it. */}
        <Tiny model="cafe/table_round_A" position={[-4.2, 0, 1.6]} />
        <Tiny model="cafe/chair_A" position={[-4.2, 0, 3.0]} rotation={3.1} />
        <Tiny model="cafe/plant_A" position={[4.4, 0, -1.0]} />

        {/*
          Nobody has their back to the lens.

          The obvious blocking - customer facing the counter, barista facing the
          customer - puts the animal nearest the camera arse-first in the middle
          of the frame, which is what the first two versions of this shot were.
          So both customers are turned about a third of the way back towards the
          camera: it reads as a queue that has just been spoken to, and every
          face in the room is a face.
        */}
        <Peep model="bunny" position={[-0.2, 0, -2.9]} rotation={0.2} clip="idle" time={0.8} />
        <Peep model="deer" position={[2.4, 0, 0.8]} rotation={1.35} clip="idle" time={1.6} />
        <Peep model="cat" position={[1.0, 0, 3.2]} rotation={0.9} clip="idle" time={2.1} />

        <Emote id={5} position={[2.4, 3.1, 0.8]} size={0.85} />
        <Emote id={27} position={[1.0, 3.0, 3.2]} size={0.8} />
      </>
    ),
  },

  /**
   * Two desks: the same room, used for work rather than for a game.
   *
   * Every other shot in the set argues that the space is fun, which is the
   * wrong argument to put in front of somebody deciding where their team should
   * stand all day. So: two computers, two animals, one room, nobody kicking
   * anything.
   *
   * The screens are bb10 `computer` blocks, one block up on a desk of two -
   * they are the palette's own model, so this reads as a room somebody built in
   * the app rather than as furniture the app does not have.
   */
  'desk-duo': {
    width: 1500,
    height: 1000,
    camera: { position: [8.0, 4.2, 10.8], target: [0, 1.4, -1.0], fov: 30 },
    content: (
      <>
        <GrassPatch cols={15} rows={13} keep={rounded(15, 13)} top="gravel" />

        {/* Two desks facing each other across the room, each a stack of two
            crates with a screen on top. */}
        {[-3.2, 3.2].map((x) => (
          <group key={x}>
            <Block model="crate" position={[x, blockY(1), -2.0]} />
            <Block model="crate" position={[x, blockY(2), -2.0]} />
            <Block model="computer" position={[x, blockY(3), -2.0]} rotation={x < 0 ? 0.4 : -0.4} />
          </group>
        ))}
        <Block model="books_A" position={[-4.2, blockY(1), -1.0]} />
        <Block model="battery" position={[4.2, blockY(1), -1.0]} />
        <Block model="glass" position={[0, blockY(1), -4.2]} />
        <Block model="glass" position={[0, blockY(2), -4.2]} />
        <Block model="hay_bale" position={[2.0, blockY(1), 1.8]} />

        {/* Standing at their own screen rather than in front of it, so both
            faces are still turned into the room. */}
        <Peep model="cat" position={[-3.2, 0, -0.7]} rotation={0.35} clip="idle" time={1.3} />
        <Peep model="koala" position={[3.2, 0, -0.7]} rotation={-0.35} clip="idle" time={0.5} />
        {/* The third one, who has wandered in to say something. Off to the side
            rather than between them: dead centre and nearest the lens, they are
            a wall in front of the two animals the shot is about. */}
        <Peep model="monkey" position={[-1.4, 0, 3.2]} rotation={1.3} clip="walk" time={0.6} />

        <Emote id={27} position={[-3.2, 3.0, -0.7]} size={0.8} />
        <Emote id={14} position={[-1.4, 3.0, 3.2]} size={0.8} />
      </>
    ),
  },

  /** Home: the house on its plot, with somebody at the gate. */
  house: {
    width: 1600,
    height: 900,
    camera: { position: [9.6, 5.4, 10.6], target: [0, 1.8, 0], fov: 32 },
    content: (
      <>
        {/* Tiny Treats grass, on its own 2-unit grid rather than the block one:
            the house is authored to this pack's scale, and mixing the two would
            make the doorway the wrong size for the animal standing in it. */}
        {Array.from({ length: 7 }, (_, ix) =>
          Array.from({ length: 7 }, (_, iz) => {
            const x = (ix - 3) * TINY_TILE
            const z = (iz - 3) * TINY_TILE
            if ((x / 7) ** 2 + (z / 7) ** 2 > 1.05) return null
            return (
              <Tiny
                key={`${x}:${z}`}
                model="park/floor_grass_sliced_base"
                position={[x, 0, z]}
              />
            )
          }),
        )}
        <Tiny model="house/house" position={[-0.4, 0, -2.2]} rotation={0.28} />
        <Tiny model="house/tree" position={[4.2, 0, -1.6]} />
        <Tiny model="park/bush_large" position={[-4.4, 0, 0.4]} />
        <Tiny model="house/cobblestones" position={[0.6, 0.02, 2.4]} rotation={0.28} />
        <Tiny model="house/mailbox" position={[2.6, 0, 3.4]} rotation={-0.5} />
        <Tiny model="park/flower_A" position={[-2.4, 0, 2.8]} />
        <Tiny model="park/street_lantern" position={[-3.4, 0, 4.2]} />
        {[-2, 0, 2].map((x) => (
          <Tiny key={x} model="house/fence_straight_long" position={[x - 1.6, 0, 5.4]} />
        ))}
        <Peep model="cat" position={[1.2, 0, 3.0]} rotation={2.3} clip="idle" time={0.9} />
        <Peep model="deer" position={[-1.6, 0, 1.4]} rotation={-0.6} clip="walk" time={0.5} />
        <Emote id={5} position={[1.2, 3.0, 3.0]} size={0.85} />
      </>
    ),
  },

  // -------------------------------------------------------------------------
  // The build sequence
  // -------------------------------------------------------------------------
  // Five shots of one room from one camera, each the previous one plus what
  // gets added next: the plot, the floor, the fit-out, the branding, the doors
  // opening. /events plays them as the organiser answers, so the room in the
  // picture assembles at the speed the brief arrives.
  //
  // Cumulative by construction rather than by hand. The layers below are shared
  // constants and every stage is a strict superset of the one before it, which
  // is the only way a five-frame sequence stays a sequence: an object nudged in
  // stage 4 and not in stage 3 reads, at a cross-fade, as the furniture jumping.
  // The camera and the delivered size are shared for the same reason - these are
  // frames of one shot, not five compositions.
  ...VENUE_STAGES,
}

// ---------------------------------------------------------------------------
// The capture bridge
// ---------------------------------------------------------------------------

/** One captured frame: the pixels, and the size they came out at. */
export interface Capture {
  /** `data:image/png;base64,...` - the canvas cannot hand back anything else. */
  dataUrl: string
  width: number
  height: number
}

declare global {
  interface Window {
    /** Draws one frame and hands back its pixels. */
    shot?: () => Capture
    /** True once every model in the current scene has loaded. */
    shotReady?: boolean
  }
}

/**
 * The capture bridge: draw on demand, and return what was drawn.
 *
 * This used to POST the frame to `/api/shots`, which wrote it into the repo's
 * own `public/`. That made the shutter depend on a route that could only exist
 * in development - a running production server must not be able to write to its
 * own source tree, and in a container there is no source tree to write to. So
 * the one thing standing between this renderer and a server that renders scenes
 * for the product was a debug route.
 *
 * Returning the pixels removes the dependency instead of relaxing it. Whoever
 * asked for the frame decides where it goes: the script below the fold writes a
 * file, the button downloads one, the render worker uploads to Storage. Same
 * capture, three destinations, and no privileged write path anywhere.
 *
 * Synchronous on purpose. There is no longer anything to await, and a promise
 * here would leave every caller unable to tell "the render failed" from "the
 * upload failed".
 */
function Bridge() {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    window.shot = () => {
      gl.render(scene, camera)
      return {
        dataUrl: gl.domElement.toDataURL('image/png'),
        width: gl.domElement.width,
        height: gl.domElement.height,
      }
    }
    return () => {
      delete window.shot
    }
  }, [gl, scene, camera])

  return null
}

/** Saves a capture the way a browser saves anything: as a download. */
function download(name: string, capture: Capture) {
  const link = document.createElement('a')
  link.href = capture.dataUrl
  link.download = `${name}.png`
  link.click()
}

/**
 * Fires once every model and texture in the scene has arrived.
 *
 * Everything the shot needs loads through Suspense - the glTFs through
 * `useGLTF`, the emote sheet through `useLoader` - so "this component mounted"
 * is the same statement as "the scene is complete". That is the whole reason
 * the emote texture was moved onto a suspending loader: a still cannot wait for
 * an image the way a running scene can.
 */
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    window.shotReady = true
    onReady()
    return () => {
      window.shotReady = false
    }
  }, [onReady])
  return null
}

/** Points the camera where the scene wants it, once. */
function Aim({ target }: { target: Vec3 }) {
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    camera.lookAt(...target)
    camera.updateMatrixWorld()
  }, [camera, target])
  return null
}

// ---------------------------------------------------------------------------

export function ShotStudio({
  scene,
  /**
   * Shoot as soon as the scene is complete, rather than waiting for the button.
   *
   * The alternative was driving the page from an automated browser, and an
   * automated browser is exactly the environment this page cannot run in: a tab
   * that is never painted never hydrates, so there is no `window.shot` there to
   * call. Opening the URL in a real browser and having it save itself needs
   * nothing but a window.
   */
  shoot = false,
}: {
  scene?: string
  shoot?: boolean
}) {
  const id = scene && scene in SCENES ? scene : 'crew'
  const spec = SCENES[id]
  const canvas = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('loading models…')

  const ready = useMemo(
    () => () => {
      setStatus('ready')
      if (!shoot) return
      const capture = window.shot?.()
      if (!capture) {
        setStatus('capture failed')
        return
      }
      download(id, capture)
      setStatus(`saved ${id}.png`)
    },
    [shoot, id],
  )

  /**
   * Mounted through `createRoot` rather than `<Canvas>`.
   *
   * `<Canvas>` sizes itself by measuring its container with a ResizeObserver,
   * and a ResizeObserver in a tab that is never painted - an automated pane, a
   * background tab - never fires. The canvas then stays at the DOM default of
   * 300x150 and R3F never builds a root at all, so the page looks broken in
   * exactly the situation this page exists to serve.
   *
   * The size is not something that needs measuring here anyway: it is the size
   * of the image being delivered, which is written down in the scene spec. So
   * this hands it over directly, which removes the observer, the container and
   * the failure mode together.
   */
  useEffect(() => {
    const element = canvas.current
    if (!element) return

    let live = true
    const root = createRoot(element)

    void (async () => {
      await root.configure({
        gl: { preserveDrawingBuffer: true, antialias: true, alpha: true },
        shadows: 'percentage',
        dpr: DPR,
        frameloop: 'never',
        size: { width: spec.width / DPR, height: spec.height / DPR, top: 0, left: 0 },
        camera: { position: spec.camera.position, fov: spec.camera.fov, near: 0.1, far: 200 },
      })
      if (!live) return
      root.render(
        <>
          <Aim target={spec.camera.target} />
          {/* The daylight the baked shots have always been lit by, now named
              in one place so the backoffice studio opens on the same rig.
              A scene that brings its own says so - see `SceneSpec.lighting`. */}
          {spec.lighting !== 'own' && <Rig light={DEFAULT_LIGHT} />}
          <Bridge />
          <Suspense fallback={null}>
            {spec.content}
            <Ready onReady={ready} />
          </Suspense>
        </>,
      )
    })()

    return () => {
      live = false
      root.unmount()
    }
  }, [spec, ready])

  return (
    <main className="min-h-dvh bg-[#0a0616] p-6 text-white">
      <nav className="mb-4 flex gap-3 text-sm">
        {Object.keys(SCENES).map((key) => (
          <a
            key={key}
            href={`?scene=${key}&shoot=${shoot ? '1' : '0'}`}
            className={`rounded-lg border px-3 py-1 ${
              key === id ? 'border-white/60 bg-white/15' : 'border-white/20'
            }`}
          >
            {key}
          </a>
        ))}
        <button
          type="button"
          onClick={() => {
            const capture = window.shot?.()
            if (!capture) {
              setStatus('capture failed')
              return
            }
            download(id, capture)
            setStatus(`saved ${id}.png`)
          }}
          className="rounded-lg border border-white/20 px-3 py-1"
        >
          shoot
        </button>
        <span className="self-center text-white/40">
          {status} — downloads {id}.png. `bun run shoot {id}` writes it into
          public/xo/scenes/ as webp.
        </span>
      </nav>

      {/* Fixed pixel size, not a responsive box: the canvas *is* the
          deliverable, so its dimensions are the image's dimensions. */}
      <canvas
        ref={canvas}
        style={{ width: spec.width / DPR, height: spec.height / DPR }}
        className="rounded-2xl"
      />
    </main>
  )
}

/**
 * Pixel ratio the shots are rendered at.
 *
 * The scene specs give the delivered size, and the canvas is laid out at half
 * of it - so the on-screen preview is a comfortable size and the file that
 * comes out is retina-sharp.
 */
const DPR = 2
