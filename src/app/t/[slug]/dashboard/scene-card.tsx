'use client'

import { Clapperboard, Loader2, Pause, Play } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useState, useTransition } from 'react'
import { loadPinnedScene } from '@/domain/board/actions'
import type { BoardScene } from '@/domain/board/queries'
import { decodeShot, type ShotSpec } from '@/domain/studio/shot'

/**
 * A scene on a notice: a picture until you ask for more.
 *
 * ---------------------------------------------------------------------------
 * What this is instead of
 * ---------------------------------------------------------------------------
 * The obvious way to put a moving scene on a board is to record it once and
 * serve an mp4, and it is the wrong trade here. A recording is a file per scene
 * to store and serve, it is fixed at whatever size and length it was taken at,
 * and it goes stale the moment somebody re-saves the scene - so the board would
 * be showing an old cut of a thing that has since been fixed. Recording is also
 * realtime and lossy, which is a cost worth paying once for something you post
 * to X and absurd for a card on a dashboard.
 *
 * So a card is a JPEG that arrived with the row, and pressing play mounts the
 * real renderer on the document as it is right now. The cost is a WebGL context
 * per playing card, which is exactly why nothing plays until it is asked to.
 *
 * ---------------------------------------------------------------------------
 * Three states, and only the first one is free
 * ---------------------------------------------------------------------------
 *   holding - a name and a play button. What every card on the board is.
 *   loading - the document is being fetched. The holding frame stays up.
 *   playing - the canvas is mounted, over the holding frame's own footprint.
 *
 * The holding frame is never unmounted, so the card cannot change size when the
 * scene arrives, and a scene that fails to load falls back to it rather than to
 * a hole.
 */

/**
 * The player, loaded only when a card is played.
 *
 * `ssr: false` and a dynamic import together are what keep three.js and the
 * whole of `@react-three/fiber` out of the dashboard's bundle. A board where
 * nobody presses play should cost what a board of text costs, and a static
 * import would put a megabyte of renderer in the first load of the space's
 * front page.
 */
const ScenePlayer = dynamic(
  () => import('@/app/world/shots/scene-player').then((module) => module.ScenePlayer),
  {
    ssr: false,
    loading: () => null,
  },
)

export function SceneCard({ slug, scene }: { slug: string; scene: BoardScene }) {
  const [shot, setShot] = useState<ShotSpec | null>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()

  const toggle = () => {
    if (shot) {
      setPlaying((on) => !on)
      return
    }

    setFailed(false)
    start(async () => {
      const result = await loadPinnedScene(slug, scene.id)
      if (!result.ok) {
        setFailed(true)
        return
      }
      // Decoded here rather than on the server, so the shot is parsed by exactly
      // the parser the studio writes with - and so what crosses the wire is the
      // same string the studio keeps in its address bar.
      setShot(decodeShot(result.data.document))
      setPlaying(true)
    })
  }

  return (
    // Narrower than the picture card, and deliberately so. A picture is the
    // thing itself and is worth the room; this is a holding frame with nothing
    // in it until somebody presses play, and at 42rem that is 24rem of near
    // black between two paragraphs. 30rem is wide enough to be an invitation
    // and small enough that scrolling past it costs nothing.
    <figure className="group mt-3 max-w-[30rem] overflow-hidden rounded-2xl border border-line/60">
      <div className="relative aspect-video w-full bg-[oklch(0.1_0.035_285)]">
        {/* A holding frame rather than a picture of the scene. There is no
            stored still any more - see 20260904030000_scene_poster_out.sql -
            so what a card promises is a name and a length, and pressing play is
            what draws it.

            The name is *not* repeated here. It is already in the caption a
            centimetre below, and stacking it under a clapperboard behind a play
            button put three things in the middle of an empty rectangle where
            one would do. What is left is a wash in the house indigo and the
            mark of what kind of thing this is. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(80%_120%_at_50%_120%,oklch(0.55_0.25_285/0.28),transparent_70%)]"
        />
        <Clapperboard
          aria-hidden
          className="absolute top-3 left-3 size-4 text-ink-muted/60"
        />

        {/* Over the poster rather than instead of it - see the note above about
            the card never changing size. */}
        {shot && playing && (
          <ScenePlayer shot={shot} playing className="absolute inset-0 [&>canvas]:h-full" />
        )}

        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? `Stop ${scene.name}` : `Play ${scene.name}`}
          className="absolute inset-0 flex items-center justify-center transition hover:bg-black/20 focus-visible:outline-none"
        >
          <span className="rounded-full border border-white/20 bg-black/50 p-3.5 text-white opacity-90 backdrop-blur-sm transition group-hover:scale-105 group-hover:border-white/40 group-hover:opacity-100">
            {pending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : playing ? (
              <Pause className="size-5" aria-hidden />
            ) : (
              <Play className="size-5" aria-hidden />
            )}
          </span>
        </button>
      </div>

      <figcaption className="flex items-baseline gap-2 px-3 py-2 text-xs text-ink-muted">
        <span className="min-w-0 flex-1 truncate">{scene.name}</span>
        {failed ? (
          <span className="shrink-0 text-red-500">no longer here</span>
        ) : (
          <span className="shrink-0 tabular-nums">{scene.seconds}s</span>
        )}
      </figcaption>
    </figure>
  )
}
