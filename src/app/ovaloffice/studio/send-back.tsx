'use client'

import { Undo2 } from 'lucide-react'
import { useState } from 'react'
import { sendBack } from '@/app/ovaloffice/studio/handoff'
import { encodeShot, type ShotSpec } from '@/domain/studio/shot'

/**
 * The way out of the studio, for a shot that came from somewhere.
 *
 * ---------------------------------------------------------------------------
 * Only when somebody is waiting
 * ---------------------------------------------------------------------------
 * The studio is mostly opened for its own sake - you make a shot, you save it,
 * you record it. This button exists only when the address carries a slot,
 * which means a page opened this tab and is still sitting behind it holding a
 * place for the result. See `handoff.ts`.
 *
 * It appears with the exports rather than with the save panel on purpose: it
 * is the same kind of act as "record" or "this frame as a still" - a way of
 * leaving with the document - and not a second, quieter save. Saving writes a
 * row in the space's scenes; this hands the shot to the thing that asked for
 * it, and the two are unrelated. Somebody may well do both.
 *
 * ---------------------------------------------------------------------------
 * Sending does not close the tab
 * ---------------------------------------------------------------------------
 * A press that closed the window would make a mis-click cost every unsaved
 * thing in the editor, and sending twice costs nothing at all - the far side
 * appends versions and keeps them. So the close is offered next to the
 * confirmation and taken by whoever is sure.
 */
export function SendBack({ slot, shot }: { slot: string; shot: ShotSpec }) {
  const [state, setState] = useState<'idle' | 'sent' | 'refused'>('idle')

  return (
    <div className="col-span-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setState(sendBack(slot, encodeShot(shot)) ? 'sent' : 'refused')}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent/60 bg-accent/10 px-4 py-2 text-sm transition hover:bg-accent/20"
      >
        <Undo2 className="size-4" aria-hidden />
        {state === 'sent' ? 'Send again' : 'Send back to the scene'}
      </button>

      {state === 'sent' ? (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          Saved as a new version there.
          <button
            type="button"
            onClick={() => window.close()}
            className="rounded-lg border border-border px-2.5 py-1 text-xs transition hover:bg-secondary"
          >
            Close this tab
          </button>
        </span>
      ) : null}

      {state === 'refused' ? (
        <span className="text-sm text-amber-400">
          This browser is not letting the tabs talk. Copy the link instead and paste it into the
          scene.
        </span>
      ) : null}
    </div>
  )
}
