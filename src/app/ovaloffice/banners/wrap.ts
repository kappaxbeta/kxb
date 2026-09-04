/**
 * Laying words out on a canvas.
 *
 * The 2D context will draw a string and measure a string and will do nothing at
 * all about a line that is too long, so wrapping is ours to do. Two functions,
 * because the page needs two different things: body copy is one colour and
 * wraps plainly, and the headline is two colours - the joke in ink and the
 * stance in the accent - which has to wrap as one paragraph or the break lands
 * in the wrong place.
 *
 * Measuring goes through a callback rather than a context so the caller sets
 * the font once and neither function has to know what a font is.
 */

export type Measure = (text: string) => number

/** Greedy wrap. Words that are longer than the line get a line to overflow on. */
export function wrapText(measure: Measure, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (line && measure(next) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

/** A stretch of text that is all one colour. */
export interface Run {
  text: string
  color: string
  /** Words in this run never break apart from each other. */
  nowrap?: boolean
}

export interface PlacedWord {
  text: string
  color: string
  x: number
}

/**
 * Wrap a line made of differently coloured pieces.
 *
 * The stance - "| here to play" - is marked `nowrap`, so it travels to the next
 * line whole rather than leaving the bar hanging at the end of one line and the
 * words starting the next. That reads as a typo, and on a store listing a typo
 * in the headline is the only thing anybody notices.
 */
export function layoutRuns(measure: Measure, runs: Run[], maxWidth: number): PlacedWord[][] {
  const space = measure(' ')
  const chunks: { text: string; color: string }[] = []
  for (const run of runs) {
    if (run.nowrap) chunks.push({ text: run.text.trim(), color: run.color })
    else for (const w of run.text.split(/\s+/).filter(Boolean)) chunks.push({ text: w, color: run.color })
  }

  const lines: PlacedWord[][] = []
  let line: PlacedWord[] = []
  let x = 0
  for (const chunk of chunks) {
    const w = measure(chunk.text)
    const advance = line.length ? space + w : w
    if (line.length && x + advance > maxWidth) {
      lines.push(line)
      line = [{ ...chunk, x: 0 }]
      x = w
    } else {
      line.push({ ...chunk, x: line.length ? x + space : 0 })
      x += advance
    }
  }
  if (line.length) lines.push(line)
  return lines
}
