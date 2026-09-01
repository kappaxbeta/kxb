import { describe, expect, test } from 'bun:test'
import {
  depthOf,
  type EmoteNode,
  type EmoteTree,
  freshNode,
  freshTree,
  MAX_NODE_LABEL,
  MAX_TREE_CHILDREN,
  MAX_TREE_DEPTH,
  reach,
  treeProblems,
  walk,
} from '@/domain/thingiverse/emote-tree'

const node = (id: string, label: string, extra: Partial<EmoteNode> = {}): EmoteNode => ({
  ...freshNode(id),
  label,
  ...extra,
})

/** Dances ▸ Robot, Greetings ▸ Wave. The shape everything below is about. */
const menu: EmoteTree = {
  roots: [
    node('a', 'Dances', {
      key: 'D',
      children: [
        node('a1', 'Robot', { key: 'R', clip: 'robot' }),
        node('a2', 'Shuffle', { key: 'S', clip: 'shuffle' }),
      ],
    }),
    node('b', 'Greetings', {
      key: 'G',
      children: [node('b1', 'Wave', { key: 'W', clip: 'wave' })],
    }),
  ],
}

describe('reaching a row by keys', () => {
  test('two presses find the leaf', () => {
    expect(reach(menu, ['D', 'R'])?.clip).toBe('robot')
  })

  test('one press finds the branch it opens', () => {
    expect(reach(menu, ['G'])?.label).toBe('Greetings')
  })

  test('case does not matter, because q and Q are one key', () => {
    // The same rule a blueprint's `UseInput` follows. A tree that answered only
    // upper case would be a menu that stops working under caps lock.
    expect(reach(menu, ['d', 'r'])?.clip).toBe('robot')
  })

  test('a key nobody bound reaches nothing', () => {
    expect(reach(menu, ['D', 'Z'])).toBeNull()
  })

  test('walking past a leaf reaches nothing rather than the leaf', () => {
    // `D R R` is not "Robot, and then ignore the extra press": it is a sequence
    // that does not name a row, and a menu that swallowed the third press would
    // fire an emote the person had stopped aiming at.
    expect(reach(menu, ['D', 'R', 'R'])).toBeNull()
  })

  test('no keys at all reaches nothing', () => {
    expect(reach(menu, [])).toBeNull()
  })

  test('an unbound row cannot be reached by an empty key', () => {
    const loose: EmoteTree = { roots: [node('x', 'Loose')] }

    expect(reach(loose, [''])).toBeNull()
  })
})

describe('the shape of a tree', () => {
  test('an empty one is legal and has no depth', () => {
    expect(treeProblems(freshTree())).toEqual([])
    expect(depthOf(freshTree())).toBe(0)
  })

  test('walk lists every row, each branch before its children', () => {
    expect(walk(menu).map((one) => one.id)).toEqual(['a', 'a1', 'a2', 'b', 'b1'])
  })

  test('depth counts the roots as one', () => {
    expect(depthOf(menu)).toBe(2)
  })

  test('a well-formed menu has nothing wrong with it', () => {
    expect(treeProblems(menu)).toEqual([])
  })
})

describe('what is refused', () => {
  test('a row with no name', () => {
    expect(treeProblems({ roots: [node('a', '  ')] })).toContain('every row needs a name')
  })

  test('a name past the bound', () => {
    const long = node('a', 'x'.repeat(MAX_NODE_LABEL + 1))

    expect(treeProblems({ roots: [long] })).toContain(
      `a name is at most ${MAX_NODE_LABEL} characters`,
    )
  })

  test('a clip named as an empty string, which is the second spelling of none', () => {
    expect(treeProblems({ roots: [node('a', 'Wave', { clip: '  ' })] })).toContain(
      'a row plays a named clip, or none',
    )
  })

  test('two siblings on one key', () => {
    const clash: EmoteTree = {
      roots: [node('a', 'Dances', { key: 'D' }), node('b', 'Drinks', { key: 'd' })],
    }

    // Upper cased before comparing, so `d` and `D` collide - which is the whole
    // point, since a press cannot tell them apart either.
    expect(treeProblems(clash)).toContain('D is bound twice in one menu')
  })

  test('but the same key in two different menus is fine', () => {
    // `R` opens a branch at the root and plays a clip inside another. Nobody
    // pressing keys is ever choosing between those two - see `reach`.
    const fine: EmoteTree = {
      roots: [
        node('a', 'Rude', { key: 'R' }),
        node('b', 'Dances', { key: 'D', children: [node('b1', 'Robot', { key: 'R' })] }),
      ],
    }

    expect(treeProblems(fine)).toEqual([])
  })

  test('a key that is not one character', () => {
    expect(treeProblems({ roots: [node('a', 'Wave', { key: 'F1' })] })).toContain(
      'a key is one character',
    )
  })

  test('a menu wider than a menu can be read', () => {
    const wide: EmoteTree = {
      roots: Array.from({ length: MAX_TREE_CHILDREN + 1 }, (_, at) => node(`n${at}`, `Row ${at}`)),
    }

    expect(treeProblems(wide)).toContain(
      `a menu shows at most ${MAX_TREE_CHILDREN} rows at once`,
    )
  })

  test('a tree deeper than it may go', () => {
    let deep = node('leaf', 'Leaf')
    for (let at = 0; at <= MAX_TREE_DEPTH; at += 1) {
      deep = node(`n${at}`, `Level ${at}`, { children: [deep] })
    }

    expect(treeProblems({ roots: [deep] })).toContain(
      `a menu goes at most ${MAX_TREE_DEPTH} deep`,
    )
  })

  test('two rows sharing an id, which the editor cannot produce', () => {
    const twins: EmoteTree = { roots: [node('a', 'One'), node('a', 'Two')] }

    expect(treeProblems(twins)).toContain('two rows share an id')
  })

  test('a leaf naming a clip nobody has is NOT refused', () => {
    // The same decision every clip field in this domain makes: which clips exist
    // depends on the body, and refusing the tree would lose the other rows over
    // one that went stale. It plays nothing and the branch still opens.
    expect(treeProblems({ roots: [node('a', 'Ghost', { clip: 'nothing_we_have' })] })).toEqual([])
  })
})
