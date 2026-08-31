/**
 * Colour for a sketch, without a code editor under it.
 *
 * A copy of `_editor/code/highlight.ts` that owns its own vocabulary, which
 * is the same bargain the whole `/xp` tree strikes with the lounge: copy the
 * component and own it, because the one thing that differs - which names are
 * *given* rather than typed - is baked into the scanner's word test, and a
 * parameter for it would couple two panels that otherwise never meet. The
 * scanner itself is unchanged, and the same contract holds:
 * `tokenise(s).map((t) => t.text).join('') === s` for every `s`.
 *
 * The vocabulary here is what a sketch is handed: the `xp` SDK (see
 * `../sdk.ts`) and the p5 names a sketch defines or calls constantly. p5 has
 * hundreds of globals and listing them all would light half the file blue -
 * the point of the colour is to lift the *given* names out of the author's
 * own, so the list stays at the ones that shape a sketch rather than every
 * `sin` and `lerp`.
 */

export type TokenKind =
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'api'
  | 'member'
  | 'plain'

export interface Token {
  kind: TokenKind
  text: string
}

/** The names a sketch is given, and the hooks p5 calls it by. */
export const SKETCH_API: readonly string[] = [
  // ours
  'xp',
  // p5's lifecycle - the hooks an author defines
  'setup',
  'draw',
  'preload',
  'windowResized',
  'keyPressed',
  'keyReleased',
  'mousePressed',
  'mouseReleased',
  'mouseMoved',
  'mouseDragged',
  'touchStarted',
  'touchEnded',
  // and the handful of p5 facts every sketch leans on
  'createCanvas',
  'resizeCanvas',
  'background',
  'width',
  'height',
  'windowWidth',
  'windowHeight',
  'mouseX',
  'mouseY',
  'keyIsDown',
  'frameCount',
  'deltaTime',
]

const API: ReadonlySet<string> = new Set(SKETCH_API)

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

const NUMBER =
  /(?:0[xXbBoO][0-9a-fA-F_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:[eE][+-]?\d+)?)/y

function isMember(source: string, at: number): boolean {
  let i = at - 1
  while (i >= 0 && /\s/.test(source[i])) i--
  if (i < 0 || source[i] !== '.') return false
  return source[i - 1] !== '.'
}

function wordKind(word: string, source: string, at: number): TokenKind {
  if (isMember(source, at)) return 'member'
  if (KEYWORDS.has(word)) return 'keyword'
  if (API.has(word)) return 'api'
  return 'plain'
}

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

/** The same palette the scripts panel argues for - see the original. */
export const PAINT: Record<TokenKind, string> = {
  comment: 'text-neutral-600 italic',
  string: 'text-emerald-300/90',
  number: 'text-fuchsia-300/80',
  keyword: 'text-violet-300',
  api: 'text-sky-300',
  member: 'text-teal-200/90',
  plain: 'text-neutral-200',
}
