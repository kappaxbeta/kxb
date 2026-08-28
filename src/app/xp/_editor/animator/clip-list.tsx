import { Clapperboard, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { XpEditorDict } from '@/app/i18n/xp-editor'
import { addClip, type ClipLibrary, copyClip, type Pose, removeClip, showClip } from '@/app/xp/_editor/animator/clip'
import { Panel } from '@/app/xp/_editor/animator/panel'

/**
 * The clips in this working file, and the three things you can do to the list.
 *
 * Out of `animator.tsx`, where it was eighty-one lines of markup that repeated
 * one rule four times without ever naming it: **every change to which clip you
 * are on puts the playhead back to the start.** That is `apply`, which the
 * caller supplies, and it is stated once there instead of in each button.
 *
 * The reason for the rule is that the playhead is a position in *this* clip and
 * two clips are rarely the same length — the alternative is landing four
 * seconds into a two-second wave.
 */
export function ClipList({
  library,
  t,
  rest,
  apply,
}: {
  library: ClipLibrary
  t: XpEditorDict['animator']
  /**
   * The rig's rest pose, or undefined until the model is in memory.
   *
   * `addClip` genuinely needs it - a new clip's first key is a whole pose, and
   * there is nothing to pose until there is a skeleton. Copy does not, but it
   * is disabled on the same value because the question both buttons are really
   * asking is *is there a body yet*, and a rig always has a rest pose.
   */
  rest: Pose | undefined
  /** Stop, change the library, and put the playhead back. */
  apply: (change: (library: ClipLibrary) => ClipLibrary) => void
}) {
  return (
    <Panel title={t.clips} icon={Clapperboard} hint={t.clipsHint}>
      <div className="flex flex-wrap gap-1">
        {library.clips.map((one, at) => (
          <button
            key={at}
            type="button"
            // The one that is already showing is not a change, and running it
            // through `apply` would rewind a clip somebody is watching.
            onClick={() => at !== library.at && apply((current) => showClip(current, at))}
            className={`max-w-full truncate rounded-md border px-2 py-0.5 text-[11px] transition ${
              at === library.at
                ? 'border-accent bg-accent/20 text-foreground'
                : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
            }`}
          >
            {one.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!rest}
          onClick={() => rest && apply((current) => addClip(current, rest))}
        >
          {t.newClip}
        </Button>

        {/*
          A copy, because it is the move people actually make: a run is a walk
          with longer strides and a death is a fall you then push about. Starting
          either from an empty timeline is starting from nothing twice.
        */}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!rest}
          onClick={() => apply(copyClip)}
        >
          {t.copyClip}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          // A library is its clips, so the last one cannot go - the same rule a
          // motion's steps have. Clearing it is what deleting its keys is for.
          disabled={library.clips.length <= 1}
          onClick={() => apply((current) => removeClip(current, current.at))}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>
    </Panel>
  )
}
