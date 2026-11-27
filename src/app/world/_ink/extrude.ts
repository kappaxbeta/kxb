/**
 * A drawing, stood up.
 *
 * Every stroke becomes a wall: the path is the floor plan, and the wall runs
 * back from it by the depth. That is the cheapest honest way to give a line
 * volume - a tube would need a swept profile and would round off exactly the
 * corners a hand made deliberately - and it has a property no tube has: seen
 * from the front the drawing is *exactly* itself, and everything you gain by
 * moving is depth you can see appearing.
 *
 * Pure arithmetic, in its own file, because the widget around it is a canvas
 * with sliders and this is the only part of it worth a test: how many triangles
 * a stroke makes, where they are, and what happens at the ends.
 *
 * Coordinates come in as note space (see `domain/ink/note.ts`: a thousand
 * across, y down) and leave in a world roughly two units wide with y up, which
 * is what a camera two or three units back frames nicely.
 */

import type { Note, NoteStroke } from '@/domain/ink/note'

/** Note units per world unit. A drawing is two units across. */
const SPAN = 500

export interface Wall {
  /** Triangles, three floats a vertex. */
  positions: Float32Array
  /** Per vertex: how far along the stroke, and how far back into the depth. */
  uvs: Float32Array
  /** The colour the pen drew it in. */
  hue: number
}

export interface ExtrudeOptions {
  /** How far back each wall runs, in world units. */
  depth: number
  /**
   * How far strokes drift apart, in world units.
   *
   * The drawing is flat when this is zero - every wall starts on the same
   * plane, which is what makes the front view identical to the page. Turned up,
   * each stroke steps back by its own amount and the drawing becomes a room you
   * can walk your eye through.
   */
  scatter: number
}

/**
 * A stable per-stroke number in 0..1.
 *
 * Deterministic, because scatter is a slider somebody drags: a stroke that
 * jumped to a new depth on every frame - or every time the component
 * re-rendered - would be a drawing that will not hold still while you look at
 * it.
 */
function drift(index: number): number {
  return ((Math.sin((index + 1) * 12.9898) * 43758.5453) % 1 + 1) % 1
}

function wallOf(stroke: NoteStroke, height: number, back: number, depth: number): Wall | null {
  const points = stroke.points
  if (points.length < 2) return null

  const segments = points.length - 1
  const positions = new Float32Array(segments * 6 * 3)
  const uvs = new Float32Array(segments * 6 * 2)

  // The middle of the page sits at the origin; y is flipped, because a screen
  // counts downwards and a room does not.
  const at = (point: { x: number; y: number }) => ({
    x: (point.x - SPAN) / SPAN,
    y: -(point.y - height / 2) / SPAN,
  })

  let p = 0
  let t = 0
  for (let i = 0; i < segments; i++) {
    const a = at(points[i])
    const b = at(points[i + 1])
    const near = -back
    const far = -back - depth
    const u0 = i / segments
    const u1 = (i + 1) / segments

    // Two triangles, wound so the wall reads the same from either side - the
    // material draws both, because a drawing you can walk behind should not
    // vanish when you do.
    const corners: [number, number, number, number, number][] = [
      [a.x, a.y, near, u0, 0],
      [b.x, b.y, near, u1, 0],
      [b.x, b.y, far, u1, 1],
      [a.x, a.y, near, u0, 0],
      [b.x, b.y, far, u1, 1],
      [a.x, a.y, far, u0, 1],
    ]

    for (const [x, y, z, u, v] of corners) {
      positions[p++] = x
      positions[p++] = y
      positions[p++] = z
      uvs[t++] = u
      uvs[t++] = v
    }
  }

  return { positions, uvs, hue: stroke.hue }
}

export function extrude(note: Note, { depth, scatter }: ExtrudeOptions): Wall[] {
  const walls: Wall[] = []
  note.strokes.forEach((stroke, index) => {
    const wall = wallOf(stroke, note.height, drift(index) * scatter, depth)
    if (wall) walls.push(wall)
  })
  return walls
}

/** How many triangles a note comes to, for anything that wants to say so. */
export function trianglesIn(note: Note): number {
  return note.strokes.reduce((total, stroke) => total + Math.max(stroke.points.length - 1, 0) * 2, 0)
}
