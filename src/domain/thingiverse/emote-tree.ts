/**
 * A menu of clips, in branches.
 *
 * ---------------------------------------------------------------------------
 * What this is for, and why a flat list was not enough
 * ---------------------------------------------------------------------------
 * A space can animate sixty-four clips. Reaching one in a world means a picker,
 * and a picker over sixty-four is a wall - the same problem the emote grid has
 * at ninety-one faces and solves by being a *sheet you scan*, which works for
 * pictures and not for names. Sixty-four words in a grid is a list you read.
 *
 * So: branches. `Dances ▸ Robot`, `Greetings ▸ Wave`, and three keys gets you
 * there. That is the shape every game with more than a handful of emotes
 * arrives at, and the reason is the same one every time - a name has to be read
 * and a *position* can be learned, so a tree somebody built themselves becomes
 * muscle memory in a way an alphabetical list never does.
 *
 * ---------------------------------------------------------------------------
 * Why the tree is one document rather than a row per node
 * ---------------------------------------------------------------------------
 * Because it is edited whole. Dragging `Robot` from `Dances` into `Silly` is
 * one decision that touches two branches, and a per-node event set would write
 * it as a remove and an add - two facts that must both land, in order, or the
 * clip is in neither branch or in both. The whole tree in one event has no such
 * window.
 *
 * It is also *small*: sixty-four leaves and a handful of branches, with a label
 * and a key each. That is a few kilobytes, which is the size at which "carry it
 * whole" stops being a trade and starts being the obvious answer. The same
 * argument `BlueprintReshaped` makes about a spec.
 *
 * ---------------------------------------------------------------------------
 * A leaf names a clip, and the name is not checked
 * ---------------------------------------------------------------------------
 * Deliberately, and for the reason every other clip field in this domain gives:
 * which clips exist depends on the *body*, there are two rigs, and a tree is
 * read in worlds that use either. A leaf pointing at a clip this space has
 * retired plays nothing and the branch still opens - which is a menu with a
 * dead row in it, visible and fixable. Refusing to save the tree because one
 * leaf went stale would lose the other sixty-three.
 */

/** How deep a tree may go, counting the roots as one. */
export const MAX_TREE_DEPTH = 3

/** How many children one branch may hold. */
export const MAX_TREE_CHILDREN = 12

/** How many nodes a whole tree may hold, branches included. */
export const MAX_TREE_NODES = 120

/** How long a node's label may be. A menu row, not a sentence. */
export const MAX_NODE_LABEL = 32

/**
 * One row in the menu.
 *
 * A branch and a leaf are the same shape with `clip` deciding which, rather
 * than two types in a union. That is not laziness: the editor lets you turn one
 * into the other - a branch you gave a clip to becomes a leaf, and a leaf you
 * add a child to becomes a branch - and a union would make that a delete and a
 * create, losing the label and the key somebody had already set.
 *
 * A node with *both* a clip and children is legal and means the obvious thing:
 * opening it plays the clip, and it also has more inside. That is how a
 * `Wave ▸ Wave big / Wave small` behaves in every game that has one.
 */
export interface EmoteNode {
  /**
   * Stable within the tree, for keying the editor's rows.
   *
   * Minted by whoever adds the node and never reused. Not an index, for the
   * reason sockets are not indexes: reordering is the least memorable edit
   * there is, and a React key that changes on a reorder throws away the text
   * cursor of whatever row was being typed in.
   */
  id: string
  label: string
  /**
   * One character, upper case, that reaches this row inside its parent.
   *
   * Optional, because a tree read with a pointer needs none, and a tree of
   * three branches somebody has not bound keys to yet should still be savable.
   * Where it is set it must be unique *among its siblings* - that is the scope
   * a keypress is resolved in, and two rows on one key in one menu is a coin
   * toss nobody can see.
   */
  key?: string
  /** The clip this row plays, or null for a row that only opens. */
  clip: string | null
  children: readonly EmoteNode[]
}

export interface EmoteTree {
  roots: readonly EmoteNode[]
}

/** An empty tree. What a space has before anybody has arranged anything. */
export function freshTree(): EmoteTree {
  return { roots: [] }
}

/** A new row, unlabelled and playing nothing. */
export function freshNode(id: string): EmoteNode {
  return { id, label: '', clip: null, children: [] }
}

/** Every node in the tree, roots first, each branch before its children. */
export function walk(tree: EmoteTree): EmoteNode[] {
  const out: EmoteNode[] = []
  const visit = (nodes: readonly EmoteNode[]) => {
    for (const node of nodes) {
      out.push(node)
      visit(node.children)
    }
  }
  visit(tree.roots)
  return out
}

/** How deep the tree actually goes. Zero for an empty one. */
export function depthOf(tree: EmoteTree): number {
  const deep = (nodes: readonly EmoteNode[]): number =>
    nodes.length === 0 ? 0 : 1 + Math.max(...nodes.map((node) => deep(node.children)))
  return deep(tree.roots)
}

/**
 * The row a sequence of keys reaches, or null.
 *
 * The whole point of the tree, and it lives here rather than in the world for
 * the reason every rule in this directory does: it is the same answer whoever
 * is asking, and a second implementation in a scene is a second set of rules
 * that will disagree about an empty key or a repeated one.
 *
 * Case-insensitive, because `q` and `Q` are the same key - the same rule a
 * blueprint's `UseInput` follows, and for the same reason.
 */
export function reach(tree: EmoteTree, keys: readonly string[]): EmoteNode | null {
  let where: readonly EmoteNode[] = tree.roots
  let found: EmoteNode | null = null

  for (const key of keys) {
    const next = where.find(
      (node) => node.key !== undefined && node.key.toUpperCase() === key.toUpperCase(),
    )
    if (!next) return null
    found = next
    where = next.children
  }

  return found
}

/**
 * Whatever is wrong with a tree, said in words.
 *
 * A list rather than a throw, the shape every check in this domain takes: an
 * editor showing a tree wants to mark every bad row at once, and a parser that
 * stops at the first one makes somebody fix a menu one round trip at a time.
 */
export function treeProblems(tree: EmoteTree): string[] {
  const problems: string[] = []
  const nodes = walk(tree)

  if (nodes.length > MAX_TREE_NODES) {
    problems.push(`a menu holds at most ${MAX_TREE_NODES} rows`)
  }

  if (depthOf(tree) > MAX_TREE_DEPTH) {
    problems.push(`a menu goes at most ${MAX_TREE_DEPTH} deep`)
  }

  const ids = new Set<string>()
  for (const node of nodes) {
    if (ids.has(node.id)) {
      // Two rows with one id is an editor that will edit the wrong one, and it
      // is unreachable through the editor - so it means a hand-written document
      // and is worth refusing rather than tolerating.
      problems.push('two rows share an id')
    }
    ids.add(node.id)

    const label = node.label.trim()
    if (label === '') problems.push('every row needs a name')
    if (node.label.length > MAX_NODE_LABEL) {
      problems.push(`a name is at most ${MAX_NODE_LABEL} characters`)
    }

    if (node.clip !== null && node.clip.trim() === '') {
      // Null is "plays nothing" and is the only spelling of it, exactly as it
      // is for `BlueprintSpec.clip`.
      problems.push('a row plays a named clip, or none')
    }

    if (node.key !== undefined && node.key.length !== 1) {
      problems.push('a key is one character')
    }
  }

  // Keys are checked per branch, because that is the scope a press resolves in.
  // A tree where `D` opens Dances and `D` also plays a wave three levels down is
  // not ambiguous to anybody - see `reach`.
  const siblings = [tree.roots, ...nodes.map((node) => node.children)]
  for (const row of siblings) {
    const seen = new Set<string>()
    for (const node of row) {
      if (node.key === undefined) continue
      const key = node.key.toUpperCase()
      if (seen.has(key)) problems.push(`${key} is bound twice in one menu`)
      seen.add(key)
    }
    if (row.length > MAX_TREE_CHILDREN) {
      problems.push(`a menu shows at most ${MAX_TREE_CHILDREN} rows at once`)
    }
  }

  return problems
}
