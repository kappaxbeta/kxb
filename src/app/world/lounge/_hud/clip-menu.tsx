'use client'

import type { WorldDict } from '@/app/i18n/world'

/**
 * What this body can do, right now.
 *
 * Opened by `/clip`, and the whole of it is one list: the clips the body you
 * are wearing carries, plus - while you are sitting in something - the ones
 * that thing binds to keys. Picking one plays it. That is the feature.
 *
 * ---------------------------------------------------------------------------
 * Why this is not the emote picker
 * ---------------------------------------------------------------------------
 * They look alike and they answer different questions. An emote is a *bubble*
 * over your head that everybody else sees and nobody's body moves for; this
 * moves the body, and it is local. The two also come from different places: the
 * emote list is ours and never changes, and this list is whatever the body's
 * pack and the chair you are in happen to carry between them.
 *
 * ---------------------------------------------------------------------------
 * Why the keys are shown even though the menu is open
 * ---------------------------------------------------------------------------
 * The menu is the way to *find* a thing's animations; the key is the way to use
 * one while you are playing. Printing the key beside the row is how somebody
 * learns the second from the first, which is the only reason a menu over a
 * key-driven feature is worth drawing at all.
 */
export function ClipMenu({
  clips,
  bound,
  dict,
  onPlay,
  onClose,
}: {
  /** The body's own clips, in the order the rig lists them. */
  clips: readonly string[]
  /** What the thing you are in binds, if you are in one. */
  bound: readonly { key: string; clip: string; label?: string }[]
  dict: WorldDict['things']
  onPlay: (clip: string) => void
  onClose: () => void
}) {
  return (
    <div className="pointer-events-auto absolute bottom-28 left-1/2 max-w-sm -translate-x-1/2 rounded-2xl border border-white/20 bg-black/70 p-3 text-white backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="text-xs font-medium">{dict.clips}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-white/60 hover:text-white"
        >
          {dict.cancel}
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {clips.map((clip) => (
          <button
            key={clip}
            type="button"
            onClick={() => onPlay(clip)}
            className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs capitalize transition hover:bg-white/25"
          >
            {clip}
          </button>
        ))}
      </div>

      {bound.length > 0 && (
        <>
          <p className="mt-3 text-[10px] uppercase tracking-wide text-white/40">
            {dict.inThis}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {bound.map((input) => (
              <button
                key={input.key}
                type="button"
                onClick={() => onPlay(input.clip)}
                className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs transition hover:bg-white/25"
              >
                <span className="rounded border border-white/30 px-1 font-mono text-[10px]">
                  {input.key}
                </span>
                {input.label ?? input.clip}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
