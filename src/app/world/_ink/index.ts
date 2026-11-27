/**
 * The pen, in one import.
 *
 * Callers want `<InkLayer>`, the sentences it needs and the type of the words
 * it shouts; the geometry, the recogniser and the WebGL are implementation and
 * stay behind this door. See `ink-layer.tsx` for how the three fit together.
 *
 * `<GlyphDemo>` and the samples come out with them because a word drawing
 * itself is useful outside the spellbook - the practice page at
 * `/experiment/pen` uses one as the thing you are chasing.
 *
 * `<InkSlate>` and `<InkNote>` are the writing-it-down half: a slate hands back
 * a string (see `note.ts`), and a note plays one back wherever it was kept.
 */

export { GlyphDemo } from '@/app/world/_ink/glyph-demo'
export { type Incoming, InkLayer } from '@/app/world/_ink/ink-layer'
export { InkNote } from '@/app/world/_ink/ink-note'
export { InkPad } from '@/app/world/_ink/ink-pad'
export { InkRoom, type RoomWords } from '@/app/world/_ink/ink-room'
export { InkSlate } from '@/app/world/_ink/ink-slate'
export { type Sample, sampleFor, SAMPLES } from '@/app/world/_ink/samples'
export type { InkLabels } from '@/app/world/_ink/labels'
export { SPELLS, type Word } from '@/app/world/_ink/words'
