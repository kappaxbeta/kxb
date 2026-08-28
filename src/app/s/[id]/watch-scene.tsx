'use client'

import { Link2, Pause, Play } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { decodeShot } from '@/domain/studio/shot'

/**
 * The player, and the two things a viewer can do with it.
 *
 * `ssr: false` on the renderer, for the reason the board's card gives: three.js
 * and the whole of `@react-three/fiber` are a megabyte, and a page somebody
 * opened from a message should show the title and the button before it fetches
 * any of that.
 */
const ScenePlayer = dynamic(
  () => import('@/app/world/shots/scene-player').then((module) => module.ScenePlayer),
  { ssr: false, loading: () => null },
)

export function WatchScene({ document: encoded, name }: { document: string; name: string }) {
  // Parsed once. `decodeShot` walks every action and every key, and re-running
  // it on each render would do that sixty times a second during playback.
  const shot = useMemo(() => decodeShot(encoded), [encoded])

  /**
   * Not playing at first, deliberately.
   *
   * A page that starts a WebGL context and a frame loop the instant it opens is
   * a page that costs a stranger's battery before they have decided they want
   * to watch anything. Pressing play is the decision, and it is one tap.
   */
  const [playing, setPlaying] = useState(false)
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-line/60 bg-black"
        style={{ aspectRatio: `${shot.width} / ${shot.height}` }}
      >
        {playing && <ScenePlayer shot={shot} playing className="absolute inset-0" />}

        <button
          type="button"
          onClick={() => setPlaying((on) => !on)}
          aria-label={playing ? `Pause ${name}` : `Play ${name}`}
          className="group absolute inset-0 flex items-center justify-center transition hover:bg-white/5 focus-visible:outline-none"
        >
          {/* Fades out once it is running, so the picture is not permanently
              behind a button - but stays reachable, because it is also how you
              stop it. */}
          <span
            className={`rounded-full bg-black/60 p-4 text-white transition ${
              playing ? 'opacity-0 group-hover:opacity-90 group-focus-visible:opacity-90' : 'opacity-90'
            }`}
          >
            {playing ? <Pause className="size-7" aria-hidden /> : <Play className="size-7" aria-hidden />}
          </span>
        </button>
      </div>

      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(window.location.href)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
        className="flex items-center gap-1.5 self-start rounded-lg border border-line/60 px-3 py-2 text-sm text-ink-muted transition hover:border-accent/60 hover:text-ink"
      >
        <Link2 className="size-4" aria-hidden />
        {copied ? 'Copied' : 'Copy the link'}
      </button>
    </div>
  )
}
