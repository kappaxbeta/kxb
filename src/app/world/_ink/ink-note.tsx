'use client'

import { useCallback } from 'react'

import { type Note, noteSeconds, NOTE_WIDTH, readNote } from '@/domain/ink/note'
import type { Neon } from '@/app/world/_ink/neon'
import { useNeon } from '@/app/world/_ink/use-neon'

/**
 * Somebody's handwriting, played back.
 *
 * It redraws itself at the pace it was written - the pauses are stored with the
 * points (see `note.ts`) - holds for a beat, and starts again. Not a still
 * picture, and that is the whole point of keeping the timing: a note that
 * appears all at once is a picture of handwriting, and one that writes itself
 * is a person saying something.
 *
 * Fits itself into whatever box it is given, letterboxed, so a note drawn on a
 * phone reads the same in a card on a desktop.
 *
 * Draws nothing for a note it cannot parse. That is deliberate and its absence
 * is designed for: a notice is its words, and a card whose picture is a version
 * of this format nobody ships any more should look like a notice with no
 * picture rather than like a broken page.
 */

/** Seconds the finished note is held before it starts over. */
const HOLD = 2.4

/** Seconds it fades out over, once held. */
const FADE = 0.6

export function InkNote({ note, className }: { note: string; className?: string }) {
  const read = readNote(note)
  const still = usesReducedMotion()

  const paint = useCallback(
    (neon: Neon, seconds: number, size: { width: number; height: number }) => {
      if (!read) return
      play(neon, read, seconds, size, still)
    },
    [read, still],
  )

  const canvasRef = useNeon(paint, still)

  if (!read) return null

  return (
    <div className={`relative ${className ?? ''}`}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
    </div>
  )
}

/**
 * Read once, at render, rather than watched.
 *
 * A player is mounted and gone; somebody who changes the system setting while
 * looking at a notice will get the answer they asked for on the next page. The
 * server has no matchMedia at all, which is the other half of the guard.
 */
function usesReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** One frame of the loop, at `seconds` into it. */
function play(
  neon: Neon,
  note: Note,
  seconds: number,
  size: { width: number; height: number },
  still: boolean,
) {
  neon.begin()
  if (size.width === 0 || size.height === 0) return

  const drawing = noteSeconds(note)
  const loop = drawing + HOLD + FADE
  // Under reduced motion the clock does not run: the note is drawn finished.
  const at = still ? drawing : seconds % loop

  const scale = Math.min(size.width / NOTE_WIDTH, size.height / note.height) * 0.92
  const left = (size.width - NOTE_WIDTH * scale) / 2
  const top = (size.height - note.height * scale) / 2

  const fading = Math.max(0, (at - drawing - HOLD) / FADE)
  const energy = Math.max(0, 1 - fading)
  if (energy === 0) return

  /*
    Walked stroke by stroke rather than indexed, because the timing is a running
    total: a note is "these points, at these gaps", and where the hand had got
    to at a given moment is the only question this loop answers.
  */
  let clock = 0
  for (const stroke of note.strokes) {
    const points: { x: number; y: number }[] = []
    for (let i = 0; i < stroke.points.length; i++) {
      clock += stroke.gaps[i] / 1000
      if (clock > at) break
      points.push({
        x: left + stroke.points[i].x * scale,
        y: top + stroke.points[i].y * scale,
      })
    }
    // The beat between strokes; see `noteSeconds`.
    clock += 0.18

    if (points.length < 2) continue
    neon.draw({
      points,
      // No age: a note does not rot while somebody is reading it.
      ages: points.map(() => 0),
      hue: stroke.hue,
      width: 2.4,
      energy,
      life: 1,
    })
  }
}
