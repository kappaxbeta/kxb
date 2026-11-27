/**
 * Hand mode, in one import.
 *
 * Callers want the layer, the chart, the sentences those two need and the types
 * of the things they shout. The alphabet, the reader, the rig and the sparkle
 * are implementation and stay behind this door - a scene that imported `RIG`
 * would be a scene you have to edit when a pinky gets shorter.
 *
 * `HandGlyph` comes out with them because a hand drawn flat is useful anywhere
 * a hand is being *named* rather than held: a settings preview, a tooltip, a
 * row in a list. `HandView` comes out for the same reason with a canvas.
 */

export { type Letter, LETTERS } from '@/app/world/_hand/alphabet'
export { HandChart } from '@/app/world/_hand/chart'
export { type Finger, FIST, OPEN, type Pose } from '@/app/world/_hand/fingers'
export { HandGlyph } from '@/app/world/_hand/hand-glyph'
export { type HandIncoming, HandLayer } from '@/app/world/_hand/hand-layer'
export { HandView } from '@/app/world/_hand/hand-view'
export type { HandLabels } from '@/app/world/_hand/labels'
export { type Phrase, PHRASES, wordingOf } from '@/app/world/_hand/phrases'
export type { Said } from '@/app/world/_hand/signing'
