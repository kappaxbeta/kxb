#!/usr/bin/env bun
/**
 * Draws the flat shapes pack, so a level can put a mark on the floor.
 *
 *     bun run xp:shapes
 *
 * Writes `public/xp/packs/shapes/<shape>_<colour>.gltf` and its `.bin`, then
 * `bun run xp:catalogue` measures them and `bun run xp:thumbs shapes` draws the
 * pictures. Checked in, like every other pack - see the note in xp-catalogue.ts
 * about why the list of what we ship is not read off a disk at runtime.
 *
 * ---------------------------------------------------------------------------
 * The one pack we draw ourselves, and why it had to be drawn
 * ---------------------------------------------------------------------------
 * Every other pack in the table is somebody's kit, and the thing they all have
 * in common is that they are *objects*: a chair, a wall, a meeple, a die. None
 * of them is a **mark on the ground**, and a board game is made of those - the
 * ring that says which piece is yours, the arrow that says which way the track
 * runs, the disc that says a field is a field.
 *
 * The mensch table is the case that asked. Its player was a two-metre humanoid
 * walking across a thirty-metre board to stand next to a four-centimetre
 * meeple, which is not a player at a table, it is a giant at one. What that
 * wants is a *cursor*: a ring on the board, moved with the same stick, that
 * encircles the piece it is over. There was no ring to be a cursor with.
 *
 * ---------------------------------------------------------------------------
 * Flat, and that means one face
 * ---------------------------------------------------------------------------
 * These have no thickness at all - one triangle fan or one quad band lying in
 * the XZ plane, `doubleSided` so the face is there from underneath too. The
 * alternative was extruding each of them a couple of centimetres, which buys a
 * real box and a real silhouette and costs the thing they exist for: an
 * extruded ring seen edge-on from a low camera is a wall, and a mark on the
 * floor should disappear when you are level with the floor.
 *
 * The clearance that stops one z-fighting with the tile under it is the pack's
 * `lift` rather than a baked-in offset, because `lift` already multiplies by a
 * placement's own scale and a baked offset would not - a shape scaled to a
 * tenth would sink back into the floor it was drawn a hair above.
 *
 * **A flat model still fills a cell.** Its box is zero cells tall, which rounds
 * to the one cell it lies in, so a shape dropped on a floor tile adds nothing
 * (the tile already fills it) and one dropped in mid-air is a step. That is the
 * honest answer from a grid that cannot represent half a cell, and `collider:
 * 'none'` on the placement is how a document says otherwise.
 *
 * ---------------------------------------------------------------------------
 * Colour is seven files, not a material a document overrides
 * ---------------------------------------------------------------------------
 * Same argument `CatalogueTile` makes for the platformer kit: a `colour` field
 * on the placement is a format change, it makes the renderer learn that some
 * models have a palette, and it makes the pack table - a fact about a directory
 * - lie about what is in it. Seven colours times eleven shapes is seventy-seven
 * tiny files, which is cheaper than any of that.
 *
 * The four player colours are **sampled from the board game kit's own palette
 * texture**, at the UV its meeples use, so a blue ring is the blue of a blue
 * meeple rather than a blue that is nearly it. That is the whole reason the
 * numbers below are what they are and not round.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dir, '..')
const OUT = path.join(ROOT, 'public', 'xp', 'packs', 'shapes')

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/**
 * The palette, as sRGB the way a person writes one.
 *
 * The middle four are measured, not chosen: `boardgame_bits_texture.png`
 * sampled at the UV of `meeple_blue`, `meeple_green`, `meeple_red` and
 * `meeple_yellow`, and `tile_purple` for the fifth. Re-measure rather than
 * adjust if that kit is ever re-exported - a ring that is *nearly* the meeple's
 * blue looks like a mistake in a way that a completely different colour does
 * not.
 *
 * White and black are ours. White is lifted well above the die's `#c0cbcf`
 * because a cursor has to win against the tile under it, and black is not `#000`
 * for the same reason in the other direction: pure black on a dark board is a
 * hole rather than a mark.
 */
const COLOURS: Record<string, string> = {
  white: '#eef1f3',
  black: '#2b2f33',
  blue: '#2475b5',
  green: '#007f53',
  red: '#cd2129',
  yellow: '#f8a54c',
  purple: '#ce26e6',
}

/** glTF's `baseColorFactor` is linear; a hex triple is not. */
function linearOf(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return [
    channel(((n >> 16) & 255) / 255),
    channel(((n >> 8) & 255) / 255),
    channel((n & 255) / 255),
    1,
  ]
}

// ---------------------------------------------------------------------------
// Outlines
// ---------------------------------------------------------------------------

/**
 * A point on the ground, in the plane the winding rule is stated in.
 *
 * `u` is x and `v` is **minus** z, which is the one piece of bookkeeping in
 * here worth being explicit about: a polygon wound counter-clockwise in (u, v)
 * is a polygon whose face normal points +Y, and getting that backwards makes
 * every shape in the pack invisible from above and perfect from below.
 *
 * It also puts "forwards" at `v = +1`, so a shape drawn pointing up the page
 * points -Z in the world, which is the direction a placement at `turn: 0` faces.
 */
interface Point {
  u: number
  v: number
}

/** Every shape fits a one-cell square, so the picker's footprints all read `1 x 1`. */
const R = 0.5

function ngon(sides: number, radius: number, phase = Math.PI / 2): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = phase + (i * 2 * Math.PI) / sides
    return { u: Math.cos(angle) * radius, v: Math.sin(angle) * radius }
  })
}

function star(points: number, outer: number, inner: number): Point[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const angle = Math.PI / 2 + (i * Math.PI) / points
    const radius = i % 2 === 0 ? outer : inner
    return { u: Math.cos(angle) * radius, v: Math.sin(angle) * radius }
  })
}

/** A plus sign, wound counter-clockwise from the top-right of the north arm. */
function plus(radius: number, arm: number): Point[] {
  const a = arm
  const r = radius
  return [
    { u: a, v: r }, { u: -a, v: r }, { u: -a, v: a }, { u: -r, v: a },
    { u: -r, v: -a }, { u: -a, v: -a }, { u: -a, v: -r }, { u: a, v: -r },
    { u: a, v: -a }, { u: r, v: -a }, { u: r, v: a }, { u: a, v: a },
  ]
}

/** A shaft with a head on it, pointing forwards. `arm` is half the shaft's width. */
function arrow(radius: number, arm: number): Point[] {
  const r = radius
  return [
    { u: 0, v: r },
    { u: -r, v: 0 },
    { u: -arm, v: 0 },
    { u: -arm, v: -r },
    { u: arm, v: -r },
    { u: arm, v: 0 },
    { u: r, v: 0 },
  ]
}

/** A V, as a centre line the band helper thickens. Open, not closed. */
function vee(radius: number): Point[] {
  return [
    { u: -radius, v: 0 },
    { u: 0, v: radius },
    { u: radius, v: 0 },
  ]
}

// ---------------------------------------------------------------------------
// Triangulation
// ---------------------------------------------------------------------------

interface Mesh {
  /** Interleave-free: x, y, z per vertex, with y flat at zero. */
  positions: number[]
  indices: number[]
}

/**
 * A filled polygon, as a fan from the origin.
 *
 * Only correct for a polygon every point of which the centre can see, which is
 * all eight of the filled shapes here - a star and a plus are both star-shaped
 * about their own middle, which is where the word comes from. A shape that is
 * not gets drawn as a band instead, which is why the chevron is one.
 */
function fan(points: Point[]): Mesh {
  const positions = [0, 0, 0]
  for (const { u, v } of points) positions.push(u, 0, -v)
  const indices: number[] = []
  for (let i = 0; i < points.length; i++) {
    indices.push(0, 1 + i, 1 + ((i + 1) % points.length))
  }
  return { positions, indices }
}

/**
 * The strip between two outlines - a ring, a frame, a chevron.
 *
 * `closed` joins the last pair back to the first. Open is what makes a V a V
 * rather than a triangle with a hole in it.
 */
function band(outer: Point[], inner: Point[], closed = true): Mesh {
  const positions: number[] = []
  for (let i = 0; i < outer.length; i++) {
    positions.push(outer[i].u, 0, -outer[i].v)
    positions.push(inner[i].u, 0, -inner[i].v)
  }
  const indices: number[] = []
  const last = closed ? outer.length : outer.length - 1
  for (let i = 0; i < last; i++) {
    const a = i * 2
    const b = (((i + 1) % outer.length) * 2)
    indices.push(a, a + 1, b + 1)
    indices.push(a, b + 1, b)
  }
  return { positions, indices }
}

/**
 * A line thickened about itself - a stroke of constant width.
 *
 * The corner is the whole difficulty, and the obvious version gets it wrong.
 * Offsetting each point along the normal of the *chord through its neighbours*
 * is right in the middle of a straight run and wrong at a bend: at the apex of
 * a V that chord is horizontal, so both edges are pushed straight up and down
 * and the tip comes out as a flat bar. The chevron drew as a lopsided corner
 * that way, which is what a mitre being absent looks like.
 *
 * So a bend takes the proper mitre: the bisector of the two segment normals,
 * lengthened by `1 / cos(half the turn)` so the *edges* stay `width` from the
 * line rather than the corner point staying `width` from it.
 */
function stroke(line: Point[], width: number): Mesh {
  /** The left-hand unit normal of the segment from a to b. */
  const normalOf = (a: Point, b: Point): Point => {
    const du = b.u - a.u
    const dv = b.v - a.v
    const length = Math.hypot(du, dv) || 1
    return { u: -dv / length, v: du / length }
  }

  const offset = (i: number, sign: number): Point => {
    const before = i === 0 ? null : normalOf(line[i - 1], line[i])
    const after = i === line.length - 1 ? null : normalOf(line[i], line[i + 1])

    // An end: one segment, so its own normal, no mitre to work out.
    if (!before || !after) {
      const normal = (before ?? after)!
      return { u: line[i].u + sign * normal.u * width, v: line[i].v + sign * normal.v * width }
    }

    const bisector = { u: before.u + after.u, v: before.v + after.v }
    const length = Math.hypot(bisector.u, bisector.v) || 1
    const unit = { u: bisector.u / length, v: bisector.v / length }
    // `unit · before` is the cosine of half the turn; dividing by it is what
    // keeps the two edges parallel to the segments they belong to.
    const reach = width / Math.max(0.2, unit.u * before.u + unit.v * before.v)
    return { u: line[i].u + sign * unit.u * reach, v: line[i].v + sign * unit.v * reach }
  }

  const outer = line.map((_, i) => offset(i, 1))
  const inner = line.map((_, i) => offset(i, -1))
  return band(outer, inner, false)
}

// ---------------------------------------------------------------------------
// The pack
// ---------------------------------------------------------------------------

/**
 * Every shape, scaled and shifted so its box is exactly one cell and centred.
 *
 * Two things this buys, and neither is cosmetic. **A pack of marks has to be
 * one size**: a triangle drawn on a circle of radius 0.5 is 0.87 across and a
 * square drawn on the same circle is 1.0, so laid on adjacent fields they read
 * as two different sizes of the same idea. **And the origin has to be the
 * middle of what you can see**, because that is the point a placement turns
 * about and the point a body is drawn at - a triangle centred on its
 * circumcircle sits a fifth of a cell forward of the field it is marking.
 *
 * It also catches the one shape that did not fit: the chevron is a stroke, and
 * a stroke pushes *outwards* from the line it thickens, so it measured 1.16
 * cells wide before this and would have overhung its own field.
 */
function fit(mesh: Mesh): Mesh {
  const xs = mesh.positions.filter((_, i) => i % 3 === 0)
  const zs = mesh.positions.filter((_, i) => i % 3 === 2)
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2
  const midZ = (Math.min(...zs) + Math.max(...zs)) / 2
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
  const positions = mesh.positions.map((value, i) =>
    i % 3 === 0 ? (value - midX) / span : i % 3 === 2 ? (value - midZ) / span : value,
  )
  return { positions, indices: mesh.indices }
}

const DRAWN: Record<string, Mesh> = {
  /** The one this pack was drawn for: a cursor wide enough to encircle a piece. */
  ring: band(ngon(64, R), ngon(64, R * 0.68)),
  disc: fan(ngon(64, R)),
  square: fan(ngon(4, R * Math.SQRT2, Math.PI / 4)),
  frame: band(ngon(4, R * Math.SQRT2, Math.PI / 4), ngon(4, R * Math.SQRT2 * 0.68, Math.PI / 4)),
  triangle: fan(ngon(3, R)),
  diamond: fan(ngon(4, R)),
  hexagon: fan(ngon(6, R)),
  star: fan(star(5, R, R * 0.42)),
  cross: fan(plus(R, R * 0.34)),
  arrow: fan(arrow(R, R * 0.28)),
  chevron: stroke(vee(R), R * 0.22),
}

const SHAPES: Record<string, Mesh> = Object.fromEntries(
  Object.entries(DRAWN).map(([name, mesh]) => [name, fit(mesh)]),
)

/**
 * One file per shape per colour.
 *
 * Positions and indices only: no UVs, because there is no texture, and no
 * normals, because every vertex of every shape here has the same one and the
 * loaders both default to +Y when the attribute is absent. Two accessors
 * instead of three, on seventy-seven files.
 */
function gltf(shape: string, mesh: Mesh, colour: string): { json: string; bin: Buffer } {
  const positions = Float32Array.from(mesh.positions)
  const indices = Uint16Array.from(mesh.indices)
  // Index data starts on a four-byte boundary, which the spec asks for and
  // three's loader is not the only thing that would object to.
  const pad = (4 - ((positions.byteLength + indices.byteLength) % 4)) % 4
  const bin = Buffer.concat([
    Buffer.from(positions.buffer),
    Buffer.from(indices.buffer),
    Buffer.alloc(pad),
  ])

  const xs = mesh.positions.filter((_, i) => i % 3 === 0)
  const zs = mesh.positions.filter((_, i) => i % 3 === 2)

  return {
    bin,
    json: `${JSON.stringify(
      {
        asset: { version: '2.0', generator: 'kxb xp:shapes' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name: shape, mesh: 0 }],
        meshes: [{ name: shape, primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
        materials: [
          {
            name: `${shape}_${colour}`,
            // Both sides, so a mark on the floor is still there from under it -
            // a fixed camera above a board never sees the back, and a follow
            // camera at knee height does.
            doubleSided: true,
            pbrMetallicRoughness: {
              baseColorFactor: linearOf(COLOURS[colour]),
              metallicFactor: 0,
              roughnessFactor: 0.9,
            },
            /**
             * Self-lit, which is what makes these *paint* rather than surfaces.
             *
             * A mark on the floor has one job - to be readable - and a lit
             * material gives that up to whatever the level's lamps happen to be
             * doing. Half the base colour as emissive is the number: the shape
             * keeps its own colour in a dark room instead of going to a grey
             * smudge, and in a bright one it reads as glowing rather than as
             * blown out. A board floating in space is the case that asked, and
             * it is the case every flat mark is in - there is nothing under a
             * decal to bounce light back at it.
             *
             * `baseColorFactor` is left at full, so the two add: the mark takes
             * the room's light *and* brings its own.
             */
            emissiveFactor: linearOf(COLOURS[colour]).slice(0, 3).map((c) => c * 0.5),
          },
        ],
        accessors: [
          {
            bufferView: 0,
            componentType: 5126,
            count: positions.length / 3,
            type: 'VEC3',
            min: [Math.min(...xs), 0, Math.min(...zs)],
            max: [Math.max(...xs), 0, Math.max(...zs)],
          },
          { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
        ],
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
          {
            buffer: 0,
            byteOffset: positions.byteLength,
            byteLength: indices.byteLength,
            target: 34963,
          },
        ],
        buffers: [{ uri: `${shape}_${colour}.bin`, byteLength: bin.byteLength }],
      },
      null,
      1,
    )}\n`,
  }
}

mkdirSync(OUT, { recursive: true })

let written = 0
for (const [shape, mesh] of Object.entries(SHAPES)) {
  for (const colour of Object.keys(COLOURS)) {
    const { json, bin } = gltf(shape, mesh, colour)
    writeFileSync(path.join(OUT, `${shape}_${colour}.gltf`), json)
    writeFileSync(path.join(OUT, `${shape}_${colour}.bin`), bin)
    written++
  }
}

console.log(
  `${written} shapes -> public/xp/packs/shapes\n` +
    'now run: bun run xp:catalogue && bun run xp:thumbs shapes',
)
