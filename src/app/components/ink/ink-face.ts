import type { Ink } from '@/app/components/ink/ink-gl'
import { hsl, type RGB } from '@/app/components/ink/ink-palettes'
import type { InkSettings } from '@/app/components/ink/ink-settings'

/**
 * The faces.
 *
 * A neon face that is not there, and then is, somewhere else, in colours it
 * has not worn before - and then is not there again. A cat, a llama, a hippo,
 * a chameleon, or only a pair of eyes with nothing round them. They swim nowhere and push
 * nothing; the others in this folder are animals in water and these are
 * signs switched on in the dark, which is why a face has no body and no
 * heading and only a place, a size and an hour of its own.
 *
 * Each face is a slot with two states and one clock. Hidden, it counts down
 * to its next appearance; visible, it counts up through it, and the counting
 * up is also the fade. When it goes, it leaves the slot with a fresh wait, so
 * two faces on the same page drift apart within a minute rather than blinking
 * together forever.
 *
 * They fade the way the cat in Alice does, which is the whole reason `lights`
 * below returns three numbers instead of one: the grin arrives first and is
 * the last thing left, the eyes come next and go next, and the head, ears,
 * nose and the rest are only there in the middle of the visit. "I've often
 * seen a cat without a grin, but a grin without a cat!" - so the order the
 * parts leave in is the joke, and a single alpha over the whole face would
 * throw it away for one line less code. The llama gets the same joke because
 * there was no reason to write a second one.
 *
 * Some slots have no fixed kind: a surprise draws a new one every time it
 * comes back, so what is on the screen together is never the same set twice.
 *
 * The colours are drawn per appearance rather than from the mode's palette,
 * and that is deliberate: the modes are what the *water* is wearing, and a
 * face that matched it would read as part of the picture instead of as
 * something looking at you through it. Each part of a face sits a step
 * further round the hue circle than the last - see `part` - so a face is a
 * bouquet of tubes rather than one colour, and the whole bouquet turns
 * slowly while it is there.
 *
 * Positions are in height units with y up, as in ./ink-fish. The drawing is
 * ./ink-face-draw.
 */

export type Kind = 'cat' | 'llama' | 'hippo' | 'stare' | 'chameleon'

/** Every kind, for a slot that draws one at random. */
export const KINDS: readonly Kind[] = ['cat', 'llama', 'hippo', 'stare', 'chameleon']

export type Face = {
  kind: Kind
  /** A surprise: the kind is drawn again every time this one comes back. */
  roll: boolean
  /** Where the face is, in height units. */
  x: number
  y: number
  /** Half the width of the head, in height units. */
  size: number
  /** Where on the hue circle this appearance starts. */
  hue: number
  /** Seconds into this appearance, or into this absence. */
  clock: number
  /** How long this appearance lasts, or how long this absence does. */
  span: number
  here: boolean
  /** So two faces do not flicker in step. */
  phase: number
}

export type Faces = {
  set(settings: InkSettings): void
  tick(t: number, dt: number): void
  faces(): readonly Face[]
  /** Bring out every face that is away, now. What the button in the panel does. */
  call(): void
}

/** How big a face is against the creature radius, and how long it stays. */
const SIZE = [2.4, 4.2] as const
const STAY = [5, 9] as const
const GONE = [4, 14] as const
/** How long the fade in and out take, in seconds. */
const FADE = 0.7
/**
 * How far behind the grin each further part of the face lags, in seconds.
 * The head waits two of these, the eyes one, so a face assembles from its
 * smile outwards and comes apart the same way.
 */
const LAG = 0.9

export function createFaces(ink: Ink, initial: InkSettings): Faces {
  let settings = initial
  const faces: Face[] = []

  /** A slot, starting hidden so nothing pops in the moment the page opens. */
  const spawn = (kind: Kind, roll = false): Face => ({
    kind,
    roll,
    x: 0,
    y: 0,
    size: settings.radius * SIZE[0],
    hue: Math.random(),
    clock: 0,
    span: between(GONE) * Math.random(),
    here: false,
    phase: Math.random() * 100,
  })

  const appear = (face: Face, aspect: number) => {
    if (face.roll) face.kind = KINDS[Math.floor(Math.random() * KINDS.length)]!
    // Never against an edge: half a face at the side of the screen reads as a
    // drawing bug rather than as a visitor.
    face.size = settings.radius * between(SIZE)
    const margin = face.size * { cat: 1.6, llama: 2.2, hippo: 1.9, stare: 1.4, chameleon: 1.9 }[face.kind]
    face.x = margin + Math.random() * Math.max(0.01, aspect - margin * 2)
    face.y = margin + Math.random() * Math.max(0.01, 1 - margin * 2)
    // Anywhere on the circle except close to where it was, so a face that
    // comes back twice comes back in different colours both times.
    face.hue = (face.hue + 0.2 + Math.random() * 0.6) % 1
    face.clock = 0
    face.span = between(STAY)
    face.here = true

    // The water notices. One soft dab in the face's first colour where it
    // is, so the ink carries a bloom of it after the face has gone - which is
    // the only trace any of this leaves.
    ink.ink(face.x / aspect, face.y, part(face, 0, 0), 0.35, face.size * 0.5)
  }

  const count = (kind: Kind) => faces.filter((f) => !f.roll && f.kind === kind).length

  return {
    set(next) {
      settings = next
    },

    faces: () => faces,

    call() {
      const aspect = ink.aspect()
      for (const face of faces) if (!face.here) appear(face, aspect)
    },

    tick(_t, dt) {
      const aspect = ink.aspect()
      for (const [kind, want] of [
        ['cat', settings.cats],
        ['llama', settings.llamas],
        ['hippo', settings.hippos],
        ['stare', settings.stares],
        ['chameleon', settings.chameleons],
      ] as const) {
        while (count(kind) < want) faces.push(spawn(kind))
        while (count(kind) > want) {
          let i = faces.length - 1
          while (i >= 0 && (faces[i]!.roll || faces[i]!.kind !== kind)) i--
          faces.splice(i, 1)
        }
      }
      // And the surprises, which are slots of no fixed kind.
      const rolling = () => faces.filter((f) => f.roll).length
      while (rolling() < settings.mix) faces.push(spawn(KINDS[Math.floor(Math.random() * KINDS.length)]!, true))
      while (rolling() > settings.mix) {
        let i = faces.length - 1
        while (i >= 0 && !faces[i]!.roll) i--
        faces.splice(i, 1)
      }
      if (faces.length === 0 || dt <= 0) return

      for (const face of faces) {
        face.clock += dt
        if (face.clock < face.span) continue
        if (face.here) {
          face.here = false
          face.clock = 0
          face.span = between(GONE)
        } else {
          appear(face, aspect)
        }
      }
    },
  }
}

export type Lights = {
  /** The mouth: first to arrive, last to go. */
  grin: number
  /** The eyes. */
  eyes: number
  /** Everything else: head, ears, nose, whiskers, fluff. */
  head: number
}

/**
 * How lit each part of a face is, 0 to 1.
 *
 * One envelope - up over `FADE`, steady, down over `FADE` - evaluated three
 * times, each one starting later and ending earlier than the last by `LAG`.
 * A visit shorter than the lag simply never grows a head, which is a
 * perfectly good apparition and needs no special case.
 */
export function lights(face: Face): Lights {
  if (!face.here) return { grin: 0, eyes: 0, head: 0 }
  const at = (lag: number) =>
    Math.max(0, Math.min(1, (face.clock - lag) / FADE, (face.span - lag - face.clock) / FADE))
  return { grin: at(0), eyes: at(LAG), head: at(LAG * 2) }
}

/**
 * The colour of one part of a face: the face's own hue, stepped round the
 * circle by `step` for this part and turned slowly by the clock for all of
 * them. Neon means saturated and light rather than bright, so the lightness
 * is fixed and only the hue moves.
 */
export function part(face: Face, step: number, t: number): RGB {
  return hsl(face.hue + step + t * 0.04, 1, 0.62)
}

/**
 * How open a pair of eyes is, 0 to 1: open, with a blink every few seconds
 * that takes a fifth of one. Driven off the clock so it costs nothing to
 * keep and two stares never blink together unless their clocks happen to.
 */
export function open(face: Face): number {
  const every = 3.6 + (face.phase % 1.7)
  const into = (face.clock + face.phase) % every
  const blink = 0.18
  if (into > blink) return 1
  return Math.abs(Math.cos((into / blink) * Math.PI))
}

function between([lo, hi]: readonly [number, number]) {
  return lo + Math.random() * (hi - lo)
}
