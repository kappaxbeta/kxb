import { SKETCH_API } from '@/app/xp/_sketch/editor/highlight'

/**
 * Completions for the sketch code pane.
 *
 * The scripts panel's argument holds here too: a closed vocabulary makes a
 * *menu over a textarea* honest, where a language service would be a code
 * editor smuggled in. The vocabulary is in three rings, offered in this
 * order: what the platform hands a sketch (the SDK and p5's hooks - the
 * same list the highlighter lights, imported so they cannot drift), what
 * the SDK's objects answer to (`.claim`, `.ready`, `.draw` - the names an
 * author reaches for right after a dot), and finally the author's own words,
 * harvested from the whole project so a helper defined in `pond.js`
 * completes in `main.js`.
 */

/** What the SDK's handles and players answer to - offered after a dot too. */
export const SKETCH_MEMBERS: readonly string[] = [
  // window.xp itself
  'me', 'players', 'avatar', 'input', 'phase', 'match', 'timeline',
  'on', 'send', 'emit', 'object', 'pressed', 'tone', 't', 'file',
  'load', 'image', 'model', 'sound', 'imageUrl', 'soundUrl',
  // handles and players
  'claim', 'mine', 'owner', 'ready', 'draw', 'play', 'skin', 'name', 'you',
  'data', 'angle', 'x', 'y',
]

/**
 * The p5 everybody actually types. Bigger than the highlighter's list on
 * purpose: colour is noise at this size, a completion menu is not - it only
 * appears when two typed characters already match.
 */
export const P5_WORDS: readonly string[] = [
  // drawing
  'rect', 'ellipse', 'circle', 'line', 'point', 'triangle', 'quad', 'arc',
  'fill', 'noFill', 'stroke', 'noStroke', 'strokeWeight', 'clear',
  'beginShape', 'endShape', 'vertex', 'curveVertex', 'bezier', 'normal',
  'rectMode', 'ellipseMode', 'angleMode', 'blendMode', 'smooth', 'noSmooth',
  // transform
  'push', 'pop', 'translate', 'rotate', 'rotateX', 'rotateY', 'rotateZ', 'scale',
  // colour
  'color', 'lerpColor', 'colorMode', 'tint', 'noTint',
  // maths
  'random', 'noise', 'map', 'constrain', 'lerp', 'dist', 'abs', 'min', 'max',
  'floor', 'ceil', 'round', 'sin', 'cos', 'tan', 'atan2', 'sqrt', 'pow', 'mag',
  // words and pictures
  'text', 'textSize', 'textAlign', 'textFont', 'image', 'texture', 'textureMode',
  // 3D
  'box', 'sphere', 'plane', 'cylinder', 'cone', 'torus',
  'ambientLight', 'directionalLight', 'pointLight', 'camera', 'perspective',
  'createShader', 'shader', 'resetShader', 'setUniform',
  // time and loop
  'millis', 'frameRate', 'noLoop', 'loop', 'redraw',
  // constants
  'WEBGL', 'PI', 'HALF_PI', 'TWO_PI', 'TRIANGLES', 'CLOSE', 'CENTER', 'CORNER',
  'LEFT', 'RIGHT', 'TOP', 'BOTTOM', 'HSB', 'RGB', 'NORMAL',
  'LEFT_ARROW', 'RIGHT_ARROW', 'UP_ARROW', 'DOWN_ARROW',
]

const WORD_AT_END = /[A-Za-z_$][\w$]*$/
const WORD = /[A-Za-z_$][\w$]{2,}/g

export interface Completion {
  text: string
  /** Given by the platform, or the author's own - the menu tints them apart. */
  given: boolean
}

/**
 * What the menu should offer at this caret, or nothing.
 *
 * Nothing until two typed characters: a menu that opens on every keystroke
 * is a menu somebody turns off in their head. The word being typed is never
 * offered back as itself.
 */
export function completionsFor(
  source: string,
  caret: number,
  projectText: string,
): Completion[] {
  const typed = source.slice(0, caret).match(WORD_AT_END)?.[0]
  if (!typed || typed.length < 2) return []

  const seen = new Set<string>([typed])
  const out: Completion[] = []
  const offer = (text: string, given: boolean) => {
    if (seen.has(text) || !text.startsWith(typed)) return
    seen.add(text)
    out.push({ text, given })
  }

  for (const word of SKETCH_API) offer(word, true)
  for (const word of SKETCH_MEMBERS) offer(word, true)
  for (const word of P5_WORDS) offer(word, true)
  // The author's own names, from every file - a helper written in one file
  // is typed in another, which is most of what a second file is for.
  for (const word of projectText.match(WORD) ?? []) offer(word, false)

  return out.slice(0, 8)
}

/** The source with the chosen word in place of the half-typed one, and where
 * the caret lands after. */
export function accept(
  source: string,
  caret: number,
  chosen: string,
): { source: string; caret: number } {
  const typed = source.slice(0, caret).match(WORD_AT_END)?.[0] ?? ''
  const start = caret - typed.length
  return {
    source: source.slice(0, start) + chosen + source.slice(caret),
    caret: start + chosen.length,
  }
}
