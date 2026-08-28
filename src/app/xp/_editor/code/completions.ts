import type { XpDocument } from '@kxb/xp'

/**
 * What can be written at the caret, out of what is actually in scope.
 *
 * The scripts panel is a textarea on purpose - `scripts.tsx` carries that
 * argument, and it stands. This is the half of a code editor that is worth
 * having without one: **the errors people hit in a thirty-line script are a
 * misspelled entity name and a method that does not exist**, not a missing
 * brace, and neither of those is helped by colour.
 *
 * It is a closed list, which is what makes it a suggestion popup rather than a
 * language server. A script is handed exactly four things (`self`, `world`,
 * `log`, `getEntityByName` - see `wrap` in `script-api.ts`), the entity methods
 * are a fixed set defined in the prelude, and the names it can look up are in
 * the document that is open. Nothing here parses anything: it looks at the
 * characters immediately before the caret and decides which of four lists it is
 * in.
 *
 * Pure and separate for the reason `drop-point.ts` and `camera-drag.ts` are:
 * "does typing `self.` after a comment offer methods" is a question a test can
 * answer in a millisecond and a person cannot answer by looking at a canvas.
 */

export type SuggestionKind = 'global' | 'member' | 'name' | 'hook'

export interface Suggestion {
  /** What is shown, and what gets inserted. */
  text: string
  kind: SuggestionKind
  /** A few words, shown greyed beside it. */
  hint: string
}

export interface Completions {
  /** Where the replacement starts - the caret minus whatever prefix was typed. */
  from: number
  items: Suggestion[]
}

/**
 * The four things a script is given, plus the two hooks that make one do
 * anything at all.
 *
 * `onSpawn`, `onTick` and `onTrigger` are in the list because a script with
 * none of them compiles, runs and does nothing - which is the single most
 * likely reason somebody's first script has no effect. Suggesting them is
 * cheaper than the paragraph in the manual that explains it afterwards.
 */
const GLOBALS: Suggestion[] = [
  { text: 'self', kind: 'global', hint: 'this entity' },
  { text: 'world', kind: 'global', hint: 'tick, time, random' },
  { text: 'log', kind: 'global', hint: 'say something in the panel' },
  { text: 'getEntityByName', kind: 'global', hint: 'find another entity' },
  { text: 'onTick', kind: 'hook', hint: 'function onTick(dt) — every frame' },
  { text: 'onSpawn', kind: 'hook', hint: 'function onSpawn() — once, at the start' },
  { text: 'onTrigger', kind: 'hook', hint: 'function onTrigger(event, other)' },
]

/**
 * Everything on an entity handle.
 *
 * Hand-written here and checked against the prelude by a test, rather than
 * derived from it: the prelude is a string of JavaScript, and a regex over
 * somebody's source is a parser with no error reporting. The test is the part
 * that matters - it fails the day a method is added there and not here, which
 * is the only way this list goes stale.
 */
const ENTITY_MEMBERS: Suggestion[] = [
  { text: 'x', kind: 'member', hint: 'number, settable' },
  { text: 'y', kind: 'member', hint: 'number, settable' },
  { text: 'z', kind: 'member', hint: 'number, settable' },
  { text: 'rotation', kind: 'member', hint: 'degrees, settable' },
  { text: 'scale', kind: 'member', hint: 'number, settable' },
  // The lamp, on anything the document gave a `light` block. Zero elsewhere,
  // and writing it there does nothing - a script may work a light, not make one.
  { text: 'intensity', kind: 'member', hint: 'light, settable' },
  { text: 'range', kind: 'member', hint: 'light reach in cells, settable' },
  { text: 'colour', kind: 'member', hint: 'light 0xRRGGBB, settable' },
  { text: 'held', kind: 'member', hint: 'boolean, read-only' },
  { text: 'alive', kind: 'member', hint: 'boolean' },
  { text: 'get', kind: 'member', hint: "get('hp')" },
  { text: 'set', kind: 'member', hint: "set('hp', 10)" },
  { text: 'add', kind: 'member', hint: "add('hp', -1)" },
  { text: 'damage', kind: 'member', hint: 'through the damaged rules' },
  { text: 'heal', kind: 'member', hint: 'adds to hp' },
  { text: 'despawn', kind: 'member', hint: 'take it away' },
  { text: 'spawn', kind: 'member', hint: "spawn('crate', dx, dy, dz)" },
  { text: 'score', kind: 'member', hint: 'a point, credited to this one' },
  { text: 'emit', kind: 'member', hint: "emit('opened')" },
  { text: 'distanceTo', kind: 'member', hint: 'in cells' },
  { text: 'flatDistanceTo', kind: 'member', hint: 'ignoring height' },
  { text: 'moveTo', kind: 'member', hint: 'moveTo(x, y, z)' },
  { text: 'moveBy', kind: 'member', hint: 'moveBy(dx, dy, dz)' },
]

/** Everything on `world`. */
const WORLD_MEMBERS: Suggestion[] = [
  { text: 'tick', kind: 'member', hint: 'frames since the start' },
  { text: 'time', kind: 'member', hint: 'seconds, agreed by everybody' },
  { text: 'seed', kind: 'member', hint: "the room's number" },
  { text: 'random', kind: 'member', hint: '[0, 1), and deterministic' },
  { text: 'randomInt', kind: 'member', hint: 'randomInt(1, 6), both ends' },
  { text: 'roll', kind: 'member', hint: 'roll(6) is 1 to 6' },
  { text: 'pick', kind: 'member', hint: 'one of a list' },
]

/** Exported for the test that keeps them in step with the prelude. */
export const VOCABULARY = { GLOBALS, ENTITY_MEMBERS, WORLD_MEMBERS }

/** How many to offer. More than this is a list somebody reads instead of types. */
const MOST = 8

/** `world.ran|` → receiver `world`, prefix `ran`. */
const MEMBER = /([A-Za-z_$][\w$]*)\.([\w$]*)$/
/** `getEntityByName('do|` → the string is a name in this document. */
const BY_NAME = /getEntityByName\(\s*(['"])([^'"]*)$/
/** A bare word being typed. */
const WORD = /([A-Za-z_$][\w$]*)$/

/**
 * Whether the caret is inside a comment or a string, in which case nothing is
 * offered.
 *
 * A line scan rather than a tokeniser, and deliberately only the two cases that
 * matter: `// self.` in a comment should not pop a menu, and a name inside
 * quotes is handled by `BY_NAME` above or not at all. A template literal
 * spanning lines defeats it, which is a trade rather than an oversight - the
 * cost of being wrong here is one unwanted popup that Escape closes.
 */
function inProse(line: string): boolean {
  const comment = line.indexOf('//')
  if (comment >= 0) return true
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'" || c === '`') quote = c
  }
  return quote !== null
}

function matching(items: Suggestion[], prefix: string): Suggestion[] {
  const lower = prefix.toLowerCase()
  return items
    .filter((item) => item.text.toLowerCase().startsWith(lower))
    .slice(0, MOST)
}

/**
 * What to offer at `caret`, and where the replacement starts.
 *
 * Empty items means offer nothing, which is the common case: most of a script
 * is not a name being typed, and a popup that is always open is a popup that
 * covers the line below.
 */
export function completionsFor(
  source: string,
  caret: number,
  document: Pick<XpDocument, 'entities' | 'blueprints'>,
): Completions {
  const before = source.slice(0, caret)
  const line = before.slice(before.lastIndexOf('\n') + 1)

  /**
   * A name being looked up, offered from the document.
   *
   * Checked before `inProse`, and that order is the point: this one is *always*
   * inside a string, and it is the single most valuable suggestion here - a
   * misspelled entity name is a `null` at runtime and nothing at all in the
   * editor.
   */
  const byName = BY_NAME.exec(line)
  if (byName) {
    const prefix = byName[2]
    const named = document.entities
      .map((entity) => entity.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
    const items = matching(
      [...new Set(named)].sort().map((name) => ({
        text: name,
        kind: 'name' as const,
        hint: 'an entity in this level',
      })),
      prefix,
    )
    return { from: caret - prefix.length, items }
  }

  if (inProse(line)) return { from: caret, items: [] }

  const member = MEMBER.exec(line)
  if (member) {
    const [, receiver, prefix] = member
    /**
     * `world` is the only receiver whose members are known by name.
     *
     * Everything else that can be dotted is an entity - `self`, whatever
     * `getEntityByName` returned, the `other` a trigger was given - because
     * those are the only handles the API hands out. So an unknown receiver gets
     * the entity list rather than nothing: being right about `target.x` matters
     * more than being silent about `Math.f`.
     */
    const items = matching(receiver === 'world' ? WORLD_MEMBERS : ENTITY_MEMBERS, prefix)
    return { from: caret - prefix.length, items }
  }

  const word = WORD.exec(line)
  if (word) {
    // Only once there is something to narrow with. Every keystroke on an empty
    // line is not a request for the whole vocabulary.
    const prefix = word[1]
    if (prefix.length < 2) return { from: caret, items: [] }
    return { from: caret - prefix.length, items: matching(GLOBALS, prefix) }
  }

  return { from: caret, items: [] }
}

/** The text after accepting one, and where the caret lands. */
export function accept(
  source: string,
  completions: Completions,
  suggestion: Suggestion,
  caret: number,
): { source: string; caret: number } {
  const head = source.slice(0, completions.from)
  const tail = source.slice(caret)
  return {
    source: `${head}${suggestion.text}${tail}`,
    caret: completions.from + suggestion.text.length,
  }
}
