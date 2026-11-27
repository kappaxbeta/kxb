'use client'

import { useEffect, useState } from 'react'

import { GlyphDemo } from '@/app/world/_ink/glyph-demo'
import { InkLayer } from '@/app/world/_ink/ink-layer'
import type { InkLabels } from '@/app/world/_ink/labels'
import { sampleFor } from '@/app/world/_ink/samples'
import { nextTarget, type Target } from '@/app/world/_ink/target'
import type { Word } from '@/app/world/_ink/words'

/**
 * A pad with the pen on it: somewhere to write that is not a room.
 *
 * The lounge is where the pen is *for*, and it is also the worst place to meet
 * it: you have to be signed in, standing somewhere, with a whole world running
 * behind the glass. So the pen also comes as a card - three hundred pixels with
 * the corners cut, which can be dropped into a page - and that is how somebody
 * who has never seen this finds out what it is.
 *
 * Two modes, and the second is the one worth having. **Free** is a sheet of
 * paper. **Chase** puts a word somewhere on the pad, drawing itself on a loop,
 * and asks you to write it *there* - which turns a gesture you would otherwise
 * try once into twenty attempts nobody had to be talked into. See `target.ts`
 * for where the next one lands.
 *
 * The three words a pad understands are the three that mean something with no
 * room around them. A beam and a rainbow are things that happen *in* a world,
 * and a card that offered them would be promising an effect it has nowhere to
 * put.
 */

/** What a chosen chip looks like: the fuchsia its own hover promises, kept on. */
const LIT = 'border-[var(--color-accent)] text-[var(--color-ink)]'

const PAD_WORDS: Word[] = ['magic', 'shout', 'dance']

export function InkPad({
  labels,
  words,
  className,
}: {
  labels: InkLabels
  /** The chips the mode switch draws. English, and few - see `PenPage`. */
  words: { free: string; chase: string; idle: string; written: string }
  className?: string
}) {
  const [chasing, setChasing] = useState(false)
  const [target, setTarget] = useState<Target | null>(null)
  const [score, setScore] = useState(0)
  const [wrong, setWrong] = useState(false)

  // The "not that one" flash puts itself away. Cleared on unmount too, so a
  // navigation mid-flash does not set state on a page that has gone.
  useEffect(() => {
    if (!wrong) return
    const timer = setTimeout(() => setWrong(false), 600)
    return () => clearTimeout(timer)
  }, [wrong])

  const spelled = (word: Word) => {
    if (!chasing || !target) return
    if (word === target.word) {
      setScore((current) => current + 1)
      setTarget((current) => nextTarget(current))
      return
    }
    setWrong(true)
  }

  const sample = target ? sampleFor(target.word) : undefined

  return (
    /*
      `overflow-hidden` is doing real work here: the magic throws rings the
      width of a room, and inside a card they read as light spilling around
      behind the glass rather than as an effect that has escaped.
    */
    <div
      className={`relative h-[300px] w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0616] shadow-[0_1.5rem_3rem_oklch(0.04_0.02_285/0.6)] ${
        className ?? ''
      }`}
    >
      {/*
        The thing to copy, under the ink rather than over it.

        Faint on purpose: it is a model, not a shape to trace. Somebody who
        writes their own d a little differently should still be told they were
        right - that is the recogniser's whole design - so the ghost is there to
        say *which* word, not where every pixel goes.
      */}
      {target && sample && (
        <div
          className={`pointer-events-none absolute transition-opacity duration-300 ${
            wrong ? 'opacity-80' : 'opacity-35'
          }`}
          style={{
            left: `${target.left}%`,
            top: `${target.top}%`,
            width: `${target.size}%`,
            aspectRatio: `${sample.box.width} / ${sample.box.height}`,
            transform: `translate(-50%, -50%) rotate(${target.tilt}deg)`,
          }}
        >
          <GlyphDemo sample={sample} className="h-full w-full" />
        </div>
      )}

      <InkLayer
        active
        onWord={spelled}
        labels={labels}
        spells={PAD_WORDS}
        className="rounded-[2rem]"
      />

      {/*
        The chrome sits above the glass, and only the buttons take a press -
        everything else here would otherwise eat a stroke that ran under it.

        Inside the pad rather than over the page, which is also what keeps it
        clear of the site's own shell: the floating account bubble lives in the
        page's top-left corner, and a mode switch underneath it is a mode switch
        nobody can press.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            onClick={() => {
              setChasing(false)
              setTarget(null)
            }}
            className={`hud-chip ${chasing ? '' : LIT}`}
          >
            {words.free}
          </button>
          <button
            type="button"
            onClick={() => {
              setChasing(true)
              setScore(0)
              setTarget(nextTarget(null))
            }}
            className={`hud-chip ${chasing ? LIT : ''}`}
          >
            {words.chase}
          </button>
        </div>

        <p className="font-pixel text-[0.625rem] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
          {chasing ? `${score} ${words.written}` : words.idle}
        </p>
      </div>
    </div>
  )
}
