/**
 * The shapes a finished thing gets posted in.
 *
 * Named after where they are going rather than after their ratio, because
 * "1080 by 1920" is a number you have to decode and "TikTok" is a decision you
 * have already made. The sizes are the platforms' own upload recommendations,
 * not the smallest thing that would work: every one of these is re-encoded on
 * arrival, and quality lost before the upload is not recoverable after it.
 *
 * Vertical is first and is not an accident. It is the one everybody forgets
 * while composing on a laptop and the one that performs, so it is the default
 * offered rather than the afterthought at the end of the row.
 *
 * ---------------------------------------------------------------------------
 * Why these are not enforced
 * ---------------------------------------------------------------------------
 * The width and height fields stay editable beside them. A preset is a shortcut
 * for the common case, and a studio that only allowed five sizes would be one
 * you could not use for the sixth thing somebody needs - a banner, a sticker, a
 * frame for a slide.
 */

export interface Format {
  label: string
  /** What it is for, when the name alone does not say. */
  hint?: string
  width: number
  height: number
}

export const FORMATS: readonly Format[] = [
  // 9:16. The same frame serves all three, so it is one entry rather than three
  // that would have to be kept identical by hand.
  { label: 'TikTok', hint: 'also Reels and Shorts', width: 1080, height: 1920 },
  { label: 'YouTube', hint: '1080p, 16:9', width: 1920, height: 1080 },
  // 4:5. Takes more of a phone's screen than a square does, which is the whole
  // reason it exists as a separate shape.
  { label: 'Feed', hint: 'portrait 4:5', width: 1080, height: 1350 },
  { label: 'Square', width: 1080, height: 1080 },
  // Smaller than YouTube's on purpose: this is the one to reach for when a take
  // is dropping frames, because the recorder is realtime and pixels are what it
  // runs out of first.
  { label: 'Wide', hint: '720p, lighter to record', width: 1280, height: 720 },
]

/** Which preset a size *is*, if it is one. Lets the panel show which is on. */
export function formatOf(width: number, height: number): Format | undefined {
  return FORMATS.find((format) => format.width === width && format.height === height)
}
