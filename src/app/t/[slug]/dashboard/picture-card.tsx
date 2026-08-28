'use client'

import { useState } from 'react'

/**
 * A picture on a notice.
 *
 * The other half of what a studio can put on the board. Where a scene is a
 * document that gets rendered on demand - see `SceneCard`, and the long note
 * there about why it is not an mp4 - a picture is already pixels, so this is an
 * `<img>` and nothing else. No renderer, no play button, no state to hold.
 *
 * ---------------------------------------------------------------------------
 * Why the checker, and why the height is capped
 * ---------------------------------------------------------------------------
 * The picture studio exports with a transparent background on purpose: a
 * cut-out standing on the page reads as a place, and a rectangle of sky reads
 * as a screenshot. That means a picture dropped on a dark board would be
 * animals floating on the board's own ground, which is the right look - so
 * there is no plate behind it, only a hairline to say where the picture ends.
 *
 * The cap is because the studio exports at whatever the composer asked for,
 * including 1080x1920. Uncapped, one portrait picture is a screen and a half of
 * scrolling between two notices.
 *
 * ---------------------------------------------------------------------------
 * Not `next/image`
 * ---------------------------------------------------------------------------
 * The source is /api/uploads/<slug>, which is a route that checks the caller's
 * session before it serves a byte. Putting the optimiser in front of it would
 * mean the optimiser fetching it, which is a different caller with a different
 * session - so the check either breaks or has to be re-implemented. The files
 * are already sanitised and re-encoded at upload, and the slug is immutable and
 * served `immutable`, so a browser fetches each one once.
 */
export function PictureCard({ src, by }: { src: string; by: string }) {
  const [gone, setGone] = useState(false)

  // An upload can be deleted out from under a notice, exactly as a scene can.
  // Folding the figure away is the same answer the scene card gives: the notice
  // becomes its words, which is what it was before anybody attached anything.
  if (gone) return null

  return (
    <figure className="mt-3 max-w-[42rem] overflow-hidden rounded-2xl border border-line/60 bg-black/20">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`A picture ${by} made in the studio`}
        loading="lazy"
        decoding="async"
        onError={() => setGone(true)}
        className="mx-auto block max-h-[26rem] w-auto max-w-full object-contain"
      />
    </figure>
  )
}
