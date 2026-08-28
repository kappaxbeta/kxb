import { VOCABULARY } from '@/app/xp/_editor/code/completions'

/**
 * Colour for a script, without a code editor under it.
 *
 * `scripts.tsx` argues against CodeMirror and Monaco and that argument stands -
 * this is not one of them and does not become one. It is a scanner over a
 * string that returns runs of text with a name for each, and the panel paints
 * those runs behind a textarea that keeps every key it ever had. No parse tree,
 * no language service, no bundle: the whole thing is this file.
 *
 * ---------------------------------------------------------------------------
 * What the colour is *for*
 * ---------------------------------------------------------------------------
 * The panel's header says a highlighter does not give a script what it needs,
 * and that is still true of the general case - being told a line is wrong beats
 * being told an identifier is an identifier. But two distinctions in a thirty
 * line script are worth a hue each, and neither is decoration:
 *
 * - **A string that is not closed.** The next line joins it, the compile error
 *   lands somewhere else entirely, and in one colour there is nothing to see.
 *   Quoted text in its own colour makes a runaway quote visible as a wash of
 *   green down the rest of the file.
 * - **What was handed in versus what was typed.** `self`, `world`, `log` and
 *   `getEntityByName` are the only four names a script is given
 *   (`script-api.ts`), and a misspelling of one is `undefined` at runtime and
 *   nothing at all in the editor. Coloured, `wolrd.time` stops looking like
 *   `world.time` at a glance.
 *
 * The names are `completions.ts`'s, imported rather than repeated, so the list
 * that the suggestion menu keeps in step with the prelude is the same list that
 * decides what is lit. A method added to the prelude and not to that file fails
 * a test there; it cannot quietly lose its colour here.
 *
 * ---------------------------------------------------------------------------
 * Lossless, which is the only correctness that matters
 * ---------------------------------------------------------------------------
 * The tokens are painted *underneath a textarea holding the same characters*,
 * so if they do not concatenate back to exactly the source, the two layers slip
 * apart and every line after the difference is drawn against the wrong text.
 * That is the property the test asserts on every case, and it is why nothing
 * here trims, normalises or skips: unterminated strings, stray backslashes and
 * a lone `/` at the end of the file are all handled by producing *something*
 * that spans them rather than by giving up.
 */

export type TokenKind =
  /** A `//` to the end of the line, or a slash-star block. */
  | 'comment'
  /** Quoted or backticked, terminated or not. */
  | 'string'
  | 'number'
  /** A word the language reserves. */
  | 'keyword'
  /** One of the names a script is handed, and the hooks it may define. */
  | 'api'
  /** Anything after a dot: `self.x`, `world.roll`. */
  | 'member'
  /** Everything else - the author's own names, punctuation, whitespace. */
  | 'plain'

export interface Token {
  kind: TokenKind
  text: string
}

/**
 * What a script is given, and the hooks it may define.
 *
 * `completions.ts`'s globals list exactly, which is the point of importing it.
 */
const API: ReadonlySet<string> = new Set(VOCABULARY.GLOBALS.map((item) => item.text))

/**
 * The words the language spends.
 *
 * A script is ordinary JavaScript run through QuickJS, so this is the ordinary
 * list. `true`, `false`, `null` and `undefined` are in it as keywords rather
 * than as literals of their own - three colours for four words is a palette
 * nobody reads.
 */
const KEYWORDS: ReadonlySet<string> = new Set([
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally',
  'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null',
  'of', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
  'undefined', 'var', 'void', 'while', 'yield',
])

const IDENT_START = /[A-Za-z_$]/
const IDENT = /[\w$]/
const DIGIT = /[0-9]/

/**
 * A number, in the shapes a script actually writes one.
 *
 * Sticky rather than anchored so it can be run at the caret without slicing the
 * string, and generous rather than exact: `1e-3` and `0x1f` are one token each
 * because splitting them would paint half a number in a second colour, which
 * looks like a mistake in the code rather than in the highlighter.
 */
const NUMBER =
  /(?:0[xXbBoO][0-9a-fA-F_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:[eE][+-]?\d+)?)/y

/**
 * Whether the word starting at `at` is being read off something.
 *
 * Whitespace is skipped, so `world\n  .time` is a member like `world.time` is.
 * A second dot immediately before means `...`, which is a spread and not a
 * lookup - the word after it is the author's own.
 */
function isMember(source: string, at: number): boolean {
  let i = at - 1
  while (i >= 0 && /\s/.test(source[i])) i--
  if (i < 0 || source[i] !== '.') return false
  return source[i - 1] !== '.'
}

function wordKind(word: string, source: string, at: number): TokenKind {
  // Before the other two on purpose: `self.set` reads `set` off an entity, and
  // colouring it as a keyword would be a lie about which `set` it is.
  if (isMember(source, at)) return 'member'
  if (KEYWORDS.has(word)) return 'keyword'
  if (API.has(word)) return 'api'
  return 'plain'
}

/**
 * The source, in runs.
 *
 * `tokenise(s).map((t) => t.text).join('') === s` for every `s`. See the note
 * above for why that is the whole contract.
 */
export function tokenise(source: string): Token[] {
  const out: Token[] = []
  let plain = ''

  const keep = (kind: TokenKind, text: string) => {
    if (plain.length > 0) {
      out.push({ kind: 'plain', text: plain })
      plain = ''
    }
    out.push({ kind, text })
  }

  let i = 0
  while (i < source.length) {
    const c = source[i]
    const next = i + 1 < source.length ? source[i + 1] : ''

    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      const to = end === -1 ? source.length : end
      keep('comment', source.slice(i, to))
      i = to
      continue
    }

    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      // Unclosed: the rest of the file is comment, which is exactly what the
      // language thinks too. Somebody who deleted a `*/` should see it.
      const to = end === -1 ? source.length : end + 2
      keep('comment', source.slice(i, to))
      i = to
      continue
    }

    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < source.length) {
        const d = source[j]
        if (d === '\\') {
          j += 2
          continue
        }
        if (d === c) {
          j++
          break
        }
        // A quote that never closes ends at the line, as it does in the
        // language. A backtick does not - a template literal spans lines, and
        // an unclosed one really does swallow the rest of the file.
        if (d === '\n' && c !== '`') break
        j++
      }
      const to = Math.min(j, source.length)
      keep('string', source.slice(i, to))
      i = to
      continue
    }

    if (DIGIT.test(c) || (c === '.' && next !== '' && DIGIT.test(next))) {
      NUMBER.lastIndex = i
      const match = NUMBER.exec(source)
      // Cannot be null given the guard, but a regex that matched nothing would
      // be an infinite loop rather than a wrong colour, so it is checked.
      if (match && match[0].length > 0) {
        keep('number', match[0])
        i += match[0].length
        continue
      }
    }

    if (IDENT_START.test(c)) {
      let j = i
      while (j < source.length && IDENT.test(source[j])) j++
      const word = source.slice(i, j)
      keep(wordKind(word, source, i), word)
      i = j
      continue
    }

    plain += c
    i++
  }

  if (plain.length > 0) out.push({ kind: 'plain', text: plain })
  return out
}

/**
 * The colour each run is painted in.
 *
 * Rose and amber are missing on purpose. They mean *broken* and *careful*
 * everywhere else in this editor - a script that will not compile, a blueprint
 * already running another one - and spending them here would make an
 * arithmetic-heavy script look alarming and a commented-out block look urgent.
 * The colours that are left are cool ones, which is also why the plain text
 * stays the brightest thing on the panel: the author's own names are what a
 * script is mostly made of, and the highlighting is there to lift four given
 * names *out* of them rather than to bury them.
 *
 * Keyword and number sit next to each other on the wheel, which would be a
 * problem between two kinds of word and is not between a word and a digit.
 */
export const PAINT: Record<TokenKind, string> = {
  comment: 'text-neutral-600 italic',
  string: 'text-emerald-300/90',
  number: 'text-fuchsia-300/80',
  keyword: 'text-violet-300',
  api: 'text-sky-300',
  member: 'text-teal-200/90',
  plain: 'text-neutral-200',
}
