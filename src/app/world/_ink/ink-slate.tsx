'use client'

import { useState } from 'react'

import { InkLayer } from '@/app/world/_ink/ink-layer'
import type { InkLabels } from '@/app/world/_ink/labels'

/**
 * Somewhere to write something you mean to keep.
 *
 * The same pen as everywhere else, with two differences that are the whole
 * point of a separate component: the ink does not fade (`keep`), and every
 * stroke is handed back written down (`onNote`), so whatever is holding this -
 * a notice being posted, an invitation being written - can put the drawing
 * wherever it keeps things.
 *
 * No spells. A slate is not a room: there is nothing here for a magic to light
 * up and nobody for a shout to reach, and a burst that ate somebody's
 * half-written note would be the worst kind of surprise. `spells={[]}` is what
 * says so, and the reader then matches nothing at all.
 *
 * Clearing remounts the layer rather than reaching into it. The pen owns its
 * strokes, its reader and a WebGL context; a `key` is the one way to say "start
 * again" that cannot leave any of the three half-emptied.
 */

const NO_SPELLS: [] = []

export function InkSlate({
  labels,
  onNote,
  clearLabel,
  className,
}: {
  labels: InkLabels
  /** The drawing after every stroke, or null when there is nothing on it. */
  onNote: (note: string | null) => void
  clearLabel: string
  className?: string
}) {
  const [sheet, setSheet] = useState(0)

  return (
    <div
      className={`relative h-48 w-full overflow-hidden rounded-2xl border border-line bg-[#0a0616] ${
        className ?? ''
      }`}
    >
      <InkLayer
        key={sheet}
        active
        keep
        spells={NO_SPELLS}
        labels={labels}
        onWord={() => {}}
        onNote={onNote}
        className="rounded-2xl"
      />

      <button
        type="button"
        onClick={() => {
          setSheet((current) => current + 1)
          onNote(null)
        }}
        className="hud-chip absolute right-2 top-2 z-20"
      >
        {clearLabel}
      </button>
    </div>
  )
}
