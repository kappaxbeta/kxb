import { describe, expect, test } from 'bun:test'
import {
  type BlueprintPart,
  blueprintProblems,
  freshPart,
  freshSpec,
  MAX_PART_OFFSET,
  MAX_PARTS,
  partProblems,
  seatAt,
  socketsOf,
} from '@/domain/thingiverse/blueprint'

const root = 'bedroom/soccer_ball'
const crate = 'bb10/chest'

/**
 * A composed thing, and where its sockets end up.
 *
 * These are the sums a screenshot cannot check. A socket half a cell out draws
 * as a body sitting slightly wrong on a bench, which reads as a model that was
 * authored badly rather than as arithmetic that is off - so the rotation is
 * asserted in whole numbers, from all four quarters, where being wrong is
 * unambiguous.
 */
describe('sockets on a composed thing', () => {
  test('a socket on the root is already in the thing’s own frame', () => {
    const spec = {
      ...freshSpec(root),
      sockets: [{ name: 'top', at: { x: 0, y: 2, z: 0 }, turn: 0 }],
    }

    expect(socketsOf(spec)).toEqual([{ name: 'top', at: { x: 0, y: 2, z: 0 }, turn: 0 }])
  })

  test('a socket on a part carries its part’s offset', () => {
    const part: BlueprintPart = {
      ...freshPart(crate),
      at: { x: 3, y: 1, z: -2 },
      sockets: [{ name: 'lid', at: { x: 0, y: 1, z: 0 }, turn: 0 }],
    }

    expect(socketsOf({ parts: [part] })).toEqual([
      { name: 'lid', at: { x: 3, y: 2, z: -2 }, turn: 0 },
    ])
  })

  test('a quarter turn on the part turns the socket around it', () => {
    // One cell in front of a crate at the origin. Turned a quarter at a time it
    // walks the four compass points and comes home - which is the property that
    // catches a swapped sign, the way a single rotation never does.
    const walk = [0, 1, 2, 3, 4].map((turn) => {
      const part: BlueprintPart = {
        ...freshPart(crate),
        turn,
        sockets: [{ name: 'front', at: { x: 1, y: 0, z: 0 }, turn: 0 }],
      }
      const [socket] = socketsOf({ parts: [part] })
      return [socket.at.x, socket.at.z]
    })

    expect(walk).toEqual([
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 0],
    ])
  })

  test('the part’s own size scales the socket out with it', () => {
    const part: BlueprintPart = {
      ...freshPart(crate),
      scale: 2,
      sockets: [{ name: 'edge', at: { x: 1, y: 1, z: 0 }, turn: 0 }],
    }

    const [socket] = socketsOf({ parts: [part] })
    // Not just x: a socket that scaled sideways and not upward is a handle that
    // slides down the side of a mug the wider it gets.
    expect(socket.at).toEqual({ x: 2, y: 2, z: 0 })
  })

  test('the root’s sockets come first, so a seat can sit on the thing itself', () => {
    const spec = {
      sockets: [{ name: 'bench', at: { x: 0, y: 0, z: 0 }, turn: 0 }],
      parts: [{ ...freshPart(crate), sockets: [{ name: 'lid', at: { x: 0, y: 0, z: 0 }, turn: 0 }] }],
    }

    expect(socketsOf(spec).map((one) => one.name)).toEqual(['bench', 'lid'])
  })
})

describe('where a seat is', () => {
  const spec = {
    parts: [
      {
        ...freshPart(crate),
        at: { x: 2, y: 0, z: 0 },
        sockets: [{ name: 'perch', at: { x: 0, y: 1, z: 0 }, turn: 0 }],
      },
    ],
  }

  test('with no socket, it is the offset it was typed as', () => {
    expect(seatAt(spec, { x: 1, y: 0, z: 1 })).toEqual({ x: 1, y: 0, z: 1 })
  })

  test('on a socket, the numbers become the nudge off it', () => {
    // Which is how somebody sits *on* a stool rather than inside it.
    expect(seatAt(spec, { x: 0, y: 0.2, z: 0, socket: 'perch' })).toEqual({
      x: 2,
      y: 1.2,
      z: 0,
    })
  })

  test('a socket nobody has drawn puts them at the origin, not nowhere', () => {
    // Visible and fixable, which is the whole point - see `seatAt`. A refusal
    // here would lose every other edit in the panel to a name typed early.
    expect(seatAt(spec, { x: 0, y: 0, z: 0, socket: 'ghost' })).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('what is wrong with the pieces', () => {
  test('a fresh blueprint has no pieces and no complaints', () => {
    const spec = freshSpec(root)

    expect(spec.parts).toBeUndefined()
    expect(partProblems(spec)).toEqual([])
    expect(blueprintProblems(spec)).toEqual([])
  })

  test('a piece naming a model we do not ship is refused', () => {
    const problems = partProblems({ parts: [freshPart('nowhere/nothing')] })

    expect(problems).toEqual(['nowhere/nothing is not a model we ship'])
  })

  test('a piece further out than the bound is refused', () => {
    const part = { ...freshPart(crate), at: { x: MAX_PART_OFFSET + 1, y: 0, z: 0 } }

    expect(partProblems({ parts: [part] })).toContain(
      `a piece must be within ${MAX_PART_OFFSET} cells of the thing`,
    )
  })

  test('a turn between quarters is refused', () => {
    expect(partProblems({ parts: [{ ...freshPart(crate), turn: 0.5 }] })).toContain(
      'a piece turns in quarters',
    )
  })

  test('two sockets with one name are refused, across different pieces', () => {
    // The scope that matters is the whole thing, because that is the scope
    // `socketsOf` flattens into and the scope a seat resolves in.
    const problems = partProblems({
      parts: [
        { ...freshPart(crate), sockets: [{ name: 'seat', at: { x: 0, y: 0, z: 0 }, turn: 0 }] },
        { ...freshPart(crate), sockets: [{ name: 'seat', at: { x: 1, y: 0, z: 0 }, turn: 0 }] },
      ],
    })

    expect(problems).toEqual(['two sockets are called seat'])
  })

  test('an unnamed socket is refused', () => {
    const part = { ...freshPart(crate), sockets: [{ name: '  ', at: { x: 0, y: 0, z: 0 }, turn: 0 }] }

    expect(partProblems({ parts: [part] })).toContain("a socket's name is 1-24 characters")
  })

  test('more pieces than a thing may have is refused', () => {
    const parts = Array.from({ length: MAX_PARTS + 1 }, () => freshPart(crate))

    expect(partProblems({ parts })).toContain(
      `a thing is built out of at most ${MAX_PARTS} extra pieces`,
    )
  })

  test('the whole-spec check runs the piece check too', () => {
    const spec = { ...freshSpec(root), parts: [freshPart('nowhere/nothing')] }

    expect(blueprintProblems(spec)).toContain('nowhere/nothing is not a model we ship')
  })
})
