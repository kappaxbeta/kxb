#!/usr/bin/env bun
/**
 * Authors `public/xo/fireworks/*.glb` - a bottle rocket, its fuse lit, and the
 * burst it goes off as.
 *
 *     bun run fireworks
 *
 * Run it after changing any of the numbers below, then re-run
 * `bun run scripts/build-catalogue.ts` and `bun run models:thumbs fireworks`.
 * The output is checked in, exactly as the galaxy's is.
 *
 * ---------------------------------------------------------------------------
 * Why this is written rather than modelled
 * ---------------------------------------------------------------------------
 * The same argument `build-galaxy.ts` opens with, and it applies harder here: a
 * firework rocket is a tube, a pleated paper cone, two sticks and a curl of
 * gold, and every one of those is arithmetic. Modelled in Blender it would be
 * twenty binaries nobody can diff, and the day somebody wants a sixth colour
 * they would have to open Blender. Written, the thing under review is the
 * *shape* - the fan has twelve gores because `GORES` is 12, and a pull request
 * that widens the skirt shows up as a widened skirt.
 *
 * It is also what makes the set coherent. The rocket, the lit rocket and the
 * burst have to agree about where the fuse is and what colour a blue one is,
 * and here they agree because they are three exports of one description
 * (`Firework` below) rather than three files somebody tried to keep in step.
 *
 * ---------------------------------------------------------------------------
 * Why the colours are models and not a setting
 * ---------------------------------------------------------------------------
 * Straight out of the cosmos pack, and unchanged: a placement in a world is a
 * model id, a cell and a scale, so there is nowhere to hang a colour picker.
 * The id carries the colour - `fireworks/rocket_jade` - and the picker somebody
 * already uses to choose a thing is the picker they use to choose a green one.
 *
 * ---------------------------------------------------------------------------
 * Why there are three files per colour and not one with three states
 * ---------------------------------------------------------------------------
 * A thing's state may swap its *model* (see `ThingState.model`), and that is
 * the whole mechanism a lit fuse and a burst hang off. It may not swap a
 * material, and it should not have to: a fuse that glows is a different set of
 * triangles from one that does not, and a burst is not a rocket at all.
 *
 * So each colour ships `rocket`, `rocket_lit` and `burst`, they are a few
 * kilobytes each, and the blueprint in `@/domain/thingiverse/starters` names
 * all three in one machine.
 *
 * ---------------------------------------------------------------------------
 * Which way it points, and how big it is
 * ---------------------------------------------------------------------------
 * Standing, nose up, stick down, resting on y=0 - so `lift` is 0 like every
 * pack but bb10, and a rocket dropped on the floor stands on it. The reference
 * picture has it lying on its side, which is a photograph's business: a thing
 * placed in a room is placed on the ground, and a rocket lying down would need
 * every author who wanted one upright to turn it.
 *
 * Just over one cell tall and a third of one wide, which puts it at about
 * half the height of a peep - a firework you could pick up, rather than a prop
 * the size of a person.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ARRAY_BUFFER, Gltf, type Mesh } from './gltf-write'

const ROOT = path.join(import.meta.dir, '..')
const DIR = path.join(ROOT, 'public', 'xo', 'fireworks')

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * An sRGB hex triple as the linear factor glTF actually wants.
 *
 * Written as hex because that is how a colour gets chosen and compared, and
 * converted because `baseColorFactor` is linear: pasting `0xF0/255` straight in
 * gives a rocket noticeably paler than the swatch it was picked from, which is
 * the kind of wrong that survives review because nothing looks broken.
 */
function rgb(hex: number): [number, number, number] {
  const channel = (shift: number): number => {
    const value = ((hex >> shift) & 0xff) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return [channel(16), channel(8), channel(0)]
}

/** One firework, as the four colours that tell it apart from the others. */
interface Firework {
  /** The id, after `fireworks/`. The pictured one is plain `rocket`. */
  name: string
  /** The tube. */
  body: number
  /** The two colours the paper fan alternates between. */
  goreA: number
  goreB: number
  /**
   * What the burst is made of, and what the lit fuse spits.
   *
   * Saturated rather than pale, and it is the emissive that forces it: light a
   * pastel and every channel reaches the top at once, so a pale violet burst
   * comes out white. The colour has to have somewhere left to go.
   */
  spark: number
}

/**
 * The five of them.
 *
 * The first is the one in the reference: orange tube, red and gold fan. The
 * other four are the same rocket in the colours the cosmos pack already uses
 * for its galaxies, because a product with a jade galaxy and a "green" rocket
 * is a product with two vocabularies for one idea.
 */
const FIREWORKS: readonly Firework[] = [
  { name: 'rocket', body: 0xf08a28, goreA: 0xd2372a, goreB: 0xf6b03c, spark: 0xffa510 },
  { name: 'rocket_blue', body: 0x2f6fd0, goreA: 0x1b3f86, goreB: 0x5aa8ea, spark: 0x1f8dff },
  { name: 'rocket_jade', body: 0x2aa25e, goreA: 0x146639, goreB: 0x74d38d, spark: 0x14cf6b },
  { name: 'rocket_rose', body: 0xe0457b, goreA: 0x9c1f4f, goreB: 0xf982a8, spark: 0xff3d84 },
  { name: 'rocket_violet', body: 0x7a4fd0, goreA: 0x4a2a8f, goreB: 0xab8bf2, spark: 0x8a4bff },
]

/** The stick, the fuse and the gold. The same on every one of them. */
const WOOD = 0xc9b18a
const FUSE = 0x3f8f3a
const GOLD = 0xf4c542
/** The tube the rocket is fired out of, which is a prop rather than a colour. */
const TUBE_BODY = 0x8f6b45
const TUBE_RIM = 0x5d452c

// ---------------------------------------------------------------------------
// The shape, as numbers somebody can argue with
// ---------------------------------------------------------------------------

/** How many sides the tube has. Twelve reads as round and stays low-poly. */
const SIDES = 12

/** How many pleats the paper fan has. One per side, so the two rings line up. */
const GORES = 12

/** Where the stick stops and the tube starts, in cells off the ground. */
const BODY_BOTTOM = 0.42
/** Where the tube stops and the fan starts. */
const BODY_TOP = 0.86
/** The tip. */
const TIP = 1.1

/**
 * The tube's radius at each end.
 *
 * Wider at the top, which is the flare in the reference picture and is also
 * what stops the fan looking stuck on: the paper skirt over it is wider still,
 * and a straight tube under a wide skirt reads as two objects.
 */
const BODY_R0 = 0.105
const BODY_R1 = 0.125

/** How far the fan's points and its notches stand out from the middle. */
const FAN_POINT = 0.205
const FAN_NOTCH = 0.16

/**
 * How far the fan's rim hangs below where the tube ends.
 *
 * The overhang is the whole reason the fan reads as *paper wrapped round* the
 * rocket rather than as a cone balanced on it - it is the shadow line under the
 * skirt in the picture.
 */
const FAN_DROP = 0.05

/** The two sticks: how thick, how tall, and how far off the middle they sit. */
const STICK = 0.022
const STICK_TOP = 0.52
const FUSE_TOP = 0.46
const STICK_OFF = 0.035

/** How far off the tube's surface the gold sits. Enough not to z-fight. */
const EMBLEM_LIFT = 0.006

/** The middle of a burst, in cells off the ground it was set off on. */
const BURST_HOVER = 1.35
/** How far its spikes reach, and how fat they are at the root. */
const BURST_REACH = 0.62
const BURST_FAT = 0.055
/**
 * How many of them, and how bright everything in a burst emits.
 *
 * The glow is deliberately modest. Emissive above about two takes every channel
 * to the top with no bloom pass under it, and a scene here has none - so a
 * violet burst at 4 came out white, which is a firework that has lost the one
 * thing it was for. Bright enough to read in a dark room, dim enough to stay
 * the colour the id promises.
 */
const BURST_SPIKES = 28
const BURST_GLOW = 0.85
const SPARK_GLOW = 1.4

/** How long each clip runs, in seconds. */
const PLOP_SECONDS = 0.62
const SWAY_SECONDS = 3.4
const FIZZ_SECONDS = 0.9
const LAUNCH_SECONDS = 1.2
const BURST_SECONDS = 1.6

/** How far a launched rocket gets before the burst takes over, in cells. */
const LAUNCH_RISE = 7

// ---------------------------------------------------------------------------
// Triangles
// ---------------------------------------------------------------------------

type Point = [number, number, number]

/**
 * A flat-shaded mesh, built a face at a time.
 *
 * Every vertex is its own - no sharing between faces - which is what makes the
 * shading flat, and flat is the house style: every pack we ship is faceted, and
 * a smooth-shaded rocket standing next to a faceted crate looks like it came
 * from somewhere else. It costs vertices and there is nothing here where that
 * matters: the whole rocket is under four hundred triangles.
 */
class Faces {
  readonly positions: number[] = []
  readonly normals: number[] = []
  readonly indices: number[] = []

  /** One triangle, wound counter-clockwise as seen from outside. */
  tri(a: Point, b: Point, c: Point): void {
    // The face normal, from the cross product of two edges. Degenerate faces -
    // a cone's apex fan has a few when a radius is zero - are dropped rather
    // than written with a NaN normal, which renders as a black wedge.
    const u: Point = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v: Point = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n: Point = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ]
    const len = Math.hypot(n[0], n[1], n[2])
    if (len < 1e-9) return

    const base = this.positions.length / 3
    for (const point of [a, b, c]) {
      this.positions.push(point[0], point[1], point[2])
      this.normals.push(n[0] / len, n[1] / len, n[2] / len)
    }
    this.indices.push(base, base + 1, base + 2)
  }

  /** Two triangles over four corners, in order round the face. */
  quad(a: Point, b: Point, c: Point, d: Point): void {
    this.tri(a, b, c)
    this.tri(a, c, d)
  }

  mesh(): Mesh {
    return { positions: this.positions, normals: this.normals, indices: this.indices }
  }
}

/** A point on a circle of `radius` at `height`, `i` of `sides` of the way round. */
function around(i: number, sides: number, radius: number, height: number): Point {
  const angle = (i / sides) * Math.PI * 2
  return [Math.cos(angle) * radius, height, Math.sin(angle) * radius]
}

/** A closed tapered tube: the sides, and a lid at each end. */
function tube(y0: number, y1: number, r0: number, r1: number, sides = SIDES): Faces {
  const faces = new Faces()
  const bottom: Point = [0, y0, 0]
  const top: Point = [0, y1, 0]

  for (let i = 0; i < sides; i += 1) {
    const a0 = around(i, sides, r0, y0)
    const b0 = around(i + 1, sides, r0, y0)
    const a1 = around(i, sides, r1, y1)
    const b1 = around(i + 1, sides, r1, y1)
    faces.quad(a0, b0, b1, a1)
    faces.tri(bottom, b0, a0)
    faces.tri(top, a1, b1)
  }

  return faces
}

/** A box, given its middle in x and z and its two heights. */
function post(x: number, z: number, y0: number, y1: number, half: number): Faces {
  const faces = new Faces()
  const corners: [number, number][] = [
    [x - half, z - half],
    [x + half, z - half],
    [x + half, z + half],
    [x - half, z + half],
  ]

  for (let i = 0; i < 4; i += 1) {
    const [ax, az] = corners[i]
    const [bx, bz] = corners[(i + 1) % 4]
    faces.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az])
  }

  faces.quad(
    [corners[0][0], y1, corners[0][1]],
    [corners[1][0], y1, corners[1][1]],
    [corners[2][0], y1, corners[2][1]],
    [corners[3][0], y1, corners[3][1]],
  )
  faces.quad(
    [corners[3][0], y0, corners[3][1]],
    [corners[2][0], y0, corners[2][1]],
    [corners[1][0], y0, corners[1][1]],
    [corners[0][0], y0, corners[0][1]],
  )

  return faces
}

/**
 * One half of the paper fan: the gores whose index is even, or odd.
 *
 * Two meshes rather than one, because the two colours alternate and a primitive
 * has one material. Each gore is a kite - the tip, a point of the skirt, and
 * the notch either side of it - so the rim comes out as the zigzag the paper
 * makes when it is pleated rather than as a clean circle.
 */
function fan(parity: 0 | 1): Faces {
  const faces = new Faces()
  const tip: Point = [0, TIP, 0]
  const rim = BODY_TOP - FAN_DROP

  for (let i = 0; i < GORES; i += 1) {
    if (i % 2 !== parity) continue

    // Half-steps, so a point sits in the middle of its gore and the notches
    // land on the seams it shares with its neighbours.
    const point = around(i + 0.5, GORES, FAN_POINT, rim)
    const left = around(i, GORES, FAN_NOTCH, rim + FAN_DROP * 0.55)
    const right = around(i + 1, GORES, FAN_NOTCH, rim + FAN_DROP * 0.55)

    faces.tri(tip, left, point)
    faces.tri(tip, point, right)
    // The underside of the skirt, which is what you see standing next to it.
    faces.tri([0, BODY_TOP, 0], point, left)
    faces.tri([0, BODY_TOP, 0], right, point)
  }

  return faces
}

/**
 * The gold curl on the tube: a ribbon that spirals up it, tapering to nothing
 * at each end.
 *
 * A ribbon rather than a texture, and that is the pack's one real constraint:
 * every model here is flat colour with no atlas, so a printed flourish would
 * mean a PNG, a UV set and a sampler for one decoration. Standing the gold a
 * few thousandths off the surface says the same thing with sixty triangles and
 * catches the light as it turns, which a printed one would not.
 */
function emblem(): Faces {
  const faces = new Faces()
  const steps = 18
  // Where on the tube it starts, and how far round it goes. Just under a full
  // turn, so both ends are visible from the same side rather than the tail
  // disappearing round the back.
  const from = -0.55
  const turns = 1.15

  const sample = (t: number): { inner: Point; outer: Point } => {
    const angle = (from + turns * t) * Math.PI * 2
    const y = BODY_BOTTOM + 0.05 + t * (BODY_TOP - BODY_BOTTOM - 0.11)
    const radius = BODY_R0 + (BODY_R1 - BODY_R0) * t + EMBLEM_LIFT
    // Widest a third of the way along and pointed at both ends, which is what
    // makes it read as a flame rather than as a stripe. Wide enough to survive
    // a 96-pixel picker tile: the first cut of this was a third of it, and at
    // thumbnail size a gold flourish became a gold scratch.
    const width = Math.sin(Math.PI * t ** 0.72) * 0.075
    return {
      inner: [Math.cos(angle) * radius, y - width / 2, Math.sin(angle) * radius],
      outer: [Math.cos(angle) * radius, y + width / 2, Math.sin(angle) * radius],
    }
  }

  for (let i = 0; i < steps; i += 1) {
    const a = sample(i / steps)
    const b = sample((i + 1) / steps)
    faces.quad(a.inner, b.inner, b.outer, a.outer)
    // And the back of it, so the curl is not invisible from inside the arc.
    faces.quad(a.outer, b.outer, b.inner, a.inner)
  }

  return faces
}

/**
 * The sparks off a lit fuse: a few specks above the fuse tip.
 *
 * Its own node, because the twinkle in `idle` is a scale on this and nothing
 * else - a rocket whose whole body pulsed would read as breathing.
 */
function fuseSparks(): Faces {
  const faces = new Faces()
  // Below the tube rather than above the fuse's own tip, because the fuse runs
  // up *inside* the rocket: everything above `BODY_BOTTOM` is buried in the
  // body, which is where the first cut of these went and why a lit rocket
  // looked exactly like an unlit one.
  const at: [number, number, number][] = [
    [STICK_OFF, BODY_BOTTOM - 0.05, 0],
    [STICK_OFF + 0.055, BODY_BOTTOM - 0.11, 0.035],
    [STICK_OFF - 0.045, BODY_BOTTOM - 0.14, -0.03],
    [STICK_OFF + 0.02, BODY_BOTTOM - 0.19, -0.05],
  ]
  const size = [0.04, 0.03, 0.025, 0.02]

  at.forEach(([x, y, z], index) => {
    const s = size[index]
    // An octahedron: eight faces, catches the light from every side, and is the
    // cheapest solid that does not read as a cube.
    const points: Point[] = [
      [x + s, y, z], [x - s, y, z],
      [x, y + s, z], [x, y - s, z],
      [x, y, z + s], [x, y, z - s],
    ]
    const [px, nx, py, ny, pz, nz] = points
    faces.tri(px, py, pz); faces.tri(py, nx, pz)
    faces.tri(nx, ny, pz); faces.tri(ny, px, pz)
    faces.tri(py, px, nz); faces.tri(nx, py, nz)
    faces.tri(ny, nx, nz); faces.tri(px, ny, nz)
  })

  return faces
}

/**
 * The burst: spikes out of a small core, on a fixed scatter.
 *
 * Spikes rather than points, for the reason the galaxy's sparks give: point
 * size is a renderer setting and three draws a point one pixel across at any
 * distance, so a firework made of them would be invisible from across a room.
 *
 * The directions come off a Fibonacci sphere rather than a random scatter, so
 * they are evenly spread with no clumps and no seed to remember - and the same
 * every time this runs, which is what keeps the file out of the diff.
 */
function burst(): Faces {
  const faces = new Faces()
  const golden = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < BURST_SPIKES; i += 1) {
    const y = 1 - (i / (BURST_SPIKES - 1)) * 2
    const ring = Math.sqrt(Math.max(0, 1 - y * y))
    const angle = i * golden
    const dir: Point = [Math.cos(angle) * ring, y, Math.sin(angle) * ring]

    // Two vectors across the spike, so its root is a square rather than a line.
    const up: Point = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
    const side = cross(dir, up)
    const other = cross(dir, side)

    // Longer near the top than the bottom, by a tenth: a real one is still
    // rising as it opens, and a perfectly round burst reads as a ball.
    const reach = BURST_REACH * (1 + dir[1] * 0.1)
    const tip: Point = [dir[0] * reach, BURST_HOVER + dir[1] * reach, dir[2] * reach]
    const root: Point = [
      dir[0] * BURST_FAT,
      BURST_HOVER + dir[1] * BURST_FAT,
      dir[2] * BURST_FAT,
    ]

    const corners: Point[] = [1, -1].flatMap((a) =>
      [1, -1].map(
        (b): Point => [
          root[0] + (side[0] * a + other[0] * b) * BURST_FAT,
          root[1] + (side[1] * a + other[1] * b) * BURST_FAT,
          root[2] + (side[2] * a + other[2] * b) * BURST_FAT,
        ],
      ),
    )
    // Round the square rather than across it: `flatMap` above yields the four
    // corners in the order ++, +-, -+, --, and drawing them in that order gives
    // a bow tie.
    const ring4 = [corners[0], corners[1], corners[3], corners[2]]

    for (let k = 0; k < 4; k += 1) {
      faces.tri(ring4[k], ring4[(k + 1) % 4], tip)
    }
  }

  // A small core, so the middle is not a hole where the spikes meet.
  const core = tube(BURST_HOVER - 0.07, BURST_HOVER + 0.07, 0.075, 0.075, 8)
  faces.positions.push(...core.positions)
  faces.normals.push(...core.normals)
  const offset = (faces.positions.length - core.positions.length) / 3
  faces.indices.push(...core.indices.map((index) => index + offset))

  return faces
}

function cross(a: Point, b: Point): Point {
  const n: Point = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
  const len = Math.hypot(n[0], n[1], n[2]) || 1
  return [n[0] / len, n[1] / len, n[2] / len]
}

/** The tube a rocket is stood in: a short barrel with a dark rim. */
function launchTube(): { body: Faces; rim: Faces } {
  const body = tube(0, 0.26, 0.19, 0.17)
  const rim = new Faces()

  // The rim is a second ring rather than a lip modelled into the barrel: it is
  // one primitive, it is the only part of this prop anybody looks at, and it
  // is what says "the rocket goes in here" without modelling a hole.
  for (let i = 0; i < SIDES; i += 1) {
    const a0 = around(i, SIDES, 0.175, 0.26)
    const b0 = around(i + 1, SIDES, 0.175, 0.26)
    const a1 = around(i, SIDES, 0.2, 0.3)
    const b1 = around(i + 1, SIDES, 0.2, 0.3)
    rim.quad(a0, b0, b1, a1)
    // The flat top of the rim, back in to the mouth of the barrel.
    const a2 = around(i, SIDES, 0.115, 0.3)
    const b2 = around(i + 1, SIDES, 0.115, 0.3)
    rim.quad(a1, b1, b2, a2)
    // And the inside of the mouth, dropping away, so it reads as open.
    const a3 = around(i, SIDES, 0.105, 0.14)
    const b3 = around(i + 1, SIDES, 0.105, 0.14)
    rim.quad(a2, b2, b3, a3)
  }

  return { body, rim }
}

// ---------------------------------------------------------------------------
// The clips
// ---------------------------------------------------------------------------

interface Keys {
  times: number[]
  values: number[]
}

/** The arrival pop, straight out of the galaxy: a damped overshoot on scale. */
function plopKeys(): Keys {
  const times: number[] = []
  const values: number[] = []
  const steps = Math.round(PLOP_SECONDS * 60)

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const swell = 1 - Math.exp(-4.6 * t) * Math.cos(9.4 * t)
    const squash = 1 - (swell - 1) * 0.8
    times.push(Number((t * PLOP_SECONDS).toFixed(5)))
    values.push(Number(squash.toFixed(5)), Number(swell.toFixed(5)), Number(squash.toFixed(5)))
  }

  values[0] = 0
  values[1] = 0
  values[2] = 0
  return { times, values }
}

/**
 * The idle sway: a slow tip one way and back, about the foot.
 *
 * A rotation rather than a bob, because this thing is standing on a stick: a
 * rocket that floats up and down is a rocket nobody planted. Whole cycles, so
 * the last key equals the first and the loop does not jump.
 */
function swayKeys(degrees: number, seconds: number): Keys {
  const times: number[] = []
  const values: number[] = []
  const steps = 24
  const amount = (degrees * Math.PI) / 180

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const angle = Math.sin(t * Math.PI * 2) * amount
    times.push(Number((t * seconds).toFixed(5)))
    values.push(0, 0, Number(Math.sin(angle / 2).toFixed(6)), Number(Math.cos(angle / 2).toFixed(6)))
  }

  return { times, values }
}

/** The fuse twinkle: the spark cluster jumping about in size, fast. */
function fizzKeys(): Keys {
  const times: number[] = []
  const values: number[] = []
  const steps = 18

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    // Two frequencies that do not divide into each other, so the sparks look
    // like they are catching rather than pulsing.
    const pulse = 0.75 + 0.35 * Math.abs(Math.sin(t * Math.PI * 3)) + 0.2 * Math.sin(t * Math.PI * 8)
    times.push(Number((t * FIZZ_SECONDS).toFixed(5)))
    values.push(Number(pulse.toFixed(4)), Number(pulse.toFixed(4)), Number(pulse.toFixed(4)))
  }

  // Whole cycles both ways: the last key is forced onto the first so the loop
  // is seamless whatever the two frequencies happened to land on.
  values[values.length - 3] = values[0]
  values[values.length - 2] = values[1]
  values[values.length - 1] = values[2]
  return { times, values }
}

/**
 * The launch: up, fast, and gone.
 *
 * Ends at nothing rather than at the top of the rise, and that is the clip
 * doing a job the state machine cannot: a thing is either drawn where it stands
 * or hidden, so without the vanish the last frame of a launch is a rocket
 * sitting seven cells up in the air waiting for the next state.
 *
 * The rise is quadratic - slow off the pad, quickest at the end - which is both
 * what a rocket does and what makes the first quarter-second readable.
 */
function launchKeys(): { rise: Keys; shrink: Keys } {
  const rise: Keys = { times: [], values: [] }
  const shrink: Keys = { times: [], values: [] }
  const steps = Math.round(LAUNCH_SECONDS * 30)

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const time = Number((t * LAUNCH_SECONDS).toFixed(5))

    rise.times.push(time)
    rise.values.push(0, Number((LAUNCH_RISE * t * t).toFixed(4)), 0)

    // It holds its size for four fifths of the way and then goes, which is a
    // rocket getting far away rather than a rocket melting.
    const gone = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2
    shrink.times.push(time)
    shrink.values.push(
      Number(gone.toFixed(4)),
      Number(gone.toFixed(4)),
      Number(gone.toFixed(4)),
    )
  }

  return { rise, shrink }
}

/**
 * The burst: nothing, then everything, then nothing, with a beat of dark.
 *
 * Looped by the runtime, which is right for this one: the state it belongs to
 * lasts about as long as the clip, and a firework that goes off twice while
 * somebody is watching is a firework.
 */
function burstKeys(): { scale: Keys; turn: Keys } {
  const scale: Keys = { times: [], values: [] }
  const turn: Keys = { times: [], values: [] }
  const steps = 24

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const time = Number((t * BURST_SECONDS).toFixed(5))

    // Out hard in the first eighth, then a long slow fall away to nothing, and
    // a flat tail so there is a gap before it goes again.
    const size =
      t < 0.12
        ? (t / 0.12) ** 0.5 * 1.12
        : t < 0.85
          ? 1.12 * (1 - (t - 0.12) / 0.73) ** 1.6
          : 0

    scale.times.push(time)
    scale.values.push(
      Number(Math.max(size, 0.001).toFixed(4)),
      Number(Math.max(size, 0.001).toFixed(4)),
      Number(Math.max(size, 0.001).toFixed(4)),
    )

    // A slow quarter-turn while it opens, so the spikes are not the same
    // silhouette every time round the loop.
    const angle = t * Math.PI * 0.5
    turn.times.push(time)
    turn.values.push(
      0,
      Number(Math.sin(angle / 2).toFixed(6)),
      0,
      Number(Math.cos(angle / 2).toFixed(6)),
    )
  }

  return { scale, turn }
}

// ---------------------------------------------------------------------------
// Putting it together
// ---------------------------------------------------------------------------

interface Part {
  name: string
  mesh: Mesh
  /** Flat colour, as sRGB hex. */
  colour: number
  /** How hard it emits, if it does at all. */
  glow?: number
}

interface Clip {
  name: string
  channels: { node: number; path: string; keys: Keys; size: number }[]
}

/**
 * A model: some parts, each its own node, and the clips over them.
 *
 * Node 0 is always the root and every part hangs off it, so a clip that moves
 * the whole thing has one channel and a clip that moves one piece names it.
 */
function build(name: string, parts: readonly Part[], clips: (nodes: number[]) => Clip[]): Buffer {
  const gltf = new Gltf()

  const materials = parts.map((part) => ({
    name: part.name,
    pbrMetallicRoughness: {
      baseColorFactor: [...rgb(part.colour), 1],
      metallicFactor: 0,
      // Not quite 1: a rocket is painted paper and a burst is light, and a
      // little gloss is what stops the flat colours reading as cardboard.
      roughnessFactor: 0.85,
    },
    ...(part.glow === undefined
      ? {}
      : {
          emissiveFactor: rgb(part.colour),
          extensions: { KHR_materials_emissive_strength: { emissiveStrength: part.glow } },
        }),
  }))

  const meshes = parts.map((part, index) => ({
    name: part.name,
    primitives: [
      {
        attributes: {
          POSITION: gltf.floats(part.mesh.positions, 3, ARRAY_BUFFER),
          NORMAL: gltf.floats(part.mesh.normals, 3, ARRAY_BUFFER),
        },
        indices: gltf.indices(part.mesh.indices),
        material: index,
      },
    ],
  }))

  const children = parts.map((_, index) => index + 1)
  const nodes: Record<string, unknown>[] = [
    { name, children },
    ...parts.map((part, index) => ({ name: part.name, mesh: index })),
  ]

  const animations = clips(children).map((clip) => ({
    name: clip.name,
    samplers: clip.channels.map((channel) => ({
      input: gltf.floats(channel.keys.times, 1),
      output: gltf.floats(channel.keys.values, channel.size),
      interpolation: 'LINEAR',
    })),
    channels: clip.channels.map((channel, index) => ({
      sampler: index,
      target: { node: channel.node, path: channel.path },
    })),
  }))

  gltf.json.asset = { version: '2.0', generator: 'unkown.t scripts/build-fireworks.ts' }
  gltf.json.extensionsUsed = ['KHR_materials_emissive_strength']
  gltf.json.materials = materials
  gltf.json.meshes = meshes
  gltf.json.nodes = nodes
  gltf.json.animations = animations
  gltf.json.scene = 0
  gltf.json.scenes = [{ name: 'Scene', nodes: [0] }]

  return gltf.pack()
}

/** The parts every rocket has, lit or not. */
function rocketParts(firework: Firework): Part[] {
  return [
    { name: 'stick', mesh: post(-STICK_OFF, 0, 0, STICK_TOP, STICK).mesh(), colour: WOOD },
    { name: 'fuse', mesh: post(STICK_OFF, 0, 0, FUSE_TOP, STICK * 0.8).mesh(), colour: FUSE },
    {
      name: 'body',
      mesh: tube(BODY_BOTTOM, BODY_TOP, BODY_R0, BODY_R1).mesh(),
      colour: firework.body,
    },
    { name: 'fan_a', mesh: fan(0).mesh(), colour: firework.goreA },
    { name: 'fan_b', mesh: fan(1).mesh(), colour: firework.goreB },
    { name: 'emblem', mesh: emblem().mesh(), colour: GOLD, glow: 1.2 },
  ]
}

function main(): void {
  mkdirSync(DIR, { recursive: true })

  const plop = plopKeys()
  const sway = swayKeys(2.2, SWAY_SECONDS)
  const fizz = fizzKeys()
  const launch = launchKeys()
  const bloom = burstKeys()

  let count = 0
  const write = (name: string, bytes: Buffer): void => {
    writeFileSync(path.join(DIR, `${name}.glb`), bytes)
    console.log(`  ${name.padEnd(20)} ${(bytes.length / 1024).toFixed(1)}K`)
    count += 1
  }

  for (const firework of FIREWORKS) {
    // --- the rocket, waiting ------------------------------------------------
    //
    // `idle` is the name every clip in this pack that plays on its own answers
    // to, because a thing plays one through `actions` and a blueprint carries
    // one list of those for all of its states. So the state machine swaps the
    // *model* and the model decides what "idle" means: standing still, fizzing,
    // or going off. See the note at the top of this file.
    write(
      firework.name,
      build(firework.name, rocketParts(firework), () => [
        { name: 'plop', channels: [{ node: 0, path: 'scale', keys: plop, size: 3 }] },
        { name: 'idle', channels: [{ node: 0, path: 'rotation', keys: sway, size: 4 }] },
        { name: 'sway', channels: [{ node: 0, path: 'rotation', keys: sway, size: 4 }] },
      ]),
    )

    // --- the rocket, lit ----------------------------------------------------
    const litParts: Part[] = [
      ...rocketParts(firework),
      { name: 'sparks', mesh: fuseSparks().mesh(), colour: firework.spark, glow: SPARK_GLOW },
    ]
    write(
      `${firework.name}_lit`,
      build(`${firework.name}_lit`, litParts, (children) => {
        // The sparks are the last part, so the last child node.
        const sparks = children[children.length - 1]
        return [
          {
            name: 'idle',
            channels: [{ node: sparks, path: 'scale', keys: fizz, size: 3 }],
          },
          { name: 'fizz', channels: [{ node: sparks, path: 'scale', keys: fizz, size: 3 }] },
        ]
      }),
    )

    // --- the rocket, gone ---------------------------------------------------
    //
    // Its own model rather than a second clip on the lit one, and the reason is
    // the same one that made the lit fuse a model: a thing plays the clips its
    // `actions` name, and it carries one list of those for every state it has
    // - so a `launch` clip sitting next to `idle` on the lit rocket would need
    // an action that fired the moment the fuse caught. The model is the state.
    write(
      `${firework.name}_flying`,
      build(`${firework.name}_flying`, litParts, () => [
        {
          name: 'idle',
          channels: [
            { node: 0, path: 'translation', keys: launch.rise, size: 3 },
            { node: 0, path: 'scale', keys: launch.shrink, size: 3 },
          ],
        },
        {
          name: 'launch',
          channels: [
            { node: 0, path: 'translation', keys: launch.rise, size: 3 },
            { node: 0, path: 'scale', keys: launch.shrink, size: 3 },
          ],
        },
      ]),
    )

    // --- and the burst ------------------------------------------------------
    const burstName = firework.name.replace('rocket', 'burst')
    write(
      burstName,
      build(
        burstName,
        [{ name: 'burst', mesh: burst().mesh(), colour: firework.spark, glow: BURST_GLOW }],
        () => [
          {
            name: 'idle',
            channels: [
              { node: 0, path: 'scale', keys: bloom.scale, size: 3 },
              { node: 0, path: 'rotation', keys: bloom.turn, size: 4 },
            ],
          },
          {
            name: 'burst',
            channels: [
              { node: 0, path: 'scale', keys: bloom.scale, size: 3 },
              { node: 0, path: 'rotation', keys: bloom.turn, size: 4 },
            ],
          },
        ],
      ),
    )
  }

  // --- the thing you stand one in -------------------------------------------
  const barrel = launchTube()
  write(
    'launch_tube',
    build(
      'launch_tube',
      [
        { name: 'barrel', mesh: barrel.body.mesh(), colour: TUBE_BODY },
        { name: 'rim', mesh: barrel.rim.mesh(), colour: TUBE_RIM },
      ],
      () => [{ name: 'plop', channels: [{ node: 0, path: 'scale', keys: plop, size: 3 }] }],
    ),
  )

  console.log(`\n${count} models -> public/xo/fireworks/`)
}

main()
