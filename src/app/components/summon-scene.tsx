'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A summon, assembling once when you scroll to it, and then breathing.
 *
 * ---------------------------------------------------------------------------
 * What it is a picture of
 * ---------------------------------------------------------------------------
 * Fifteen rendered frames shot in the studio off the same models the lounge
 * loads: a speck of green light opens into a ring, and a fox in a dinosaur
 * costume arrives inside it with a crate, two animal heads and a block of hay
 * turning in the air around them.
 *
 * One direction only, small to big, ending on the assembled scene - and then it
 * breathes. It was built the other way round once, as a departure, and the
 * reason that is wrong is worth keeping written down: played backwards it comes
 * to rest on the empty cell, so anybody who scrolls back to this section a
 * minute later finds a lit floor with nothing standing on it. A picture that
 * ends as an empty rectangle reads as a section that failed to load.
 *
 * ---------------------------------------------------------------------------
 * Why a sheet and not fifteen files
 * ---------------------------------------------------------------------------
 * Fifteen `<Image>`s would be fifteen requests, fifteen decodes, and a first
 * play that stutters through whichever of them had not arrived yet. So it is
 * one 4x4 sheet - `public/enter/hero/summon.<hash>.webp`, 155KB for the lot - moved
 * with `background-position`. One request, one decode, and every frame after
 * the first costs a style recalculation and nothing else.
 *
 * Cell zero is the empty one and cell fifteen is the assembled scene, so the
 * element's initial state is its last cell - which is what lets the markup ship
 * the finished picture from the server. Nothing has to run for this to look
 * right before it is scrolled to.
 *
 * ---------------------------------------------------------------------------
 * Once, and only once
 * ---------------------------------------------------------------------------
 * It plays once, when it is first scrolled to, and never again. The float that
 * follows does loop, and the difference is the point: a thing that kept
 * replaying beside a heading is a thing somebody has to scroll past in order to
 * read the heading, where a slow bob is the same order of movement as the
 * drifting blocks in the hero and reads as ambient rather than as an event.
 */

/** Cells in the sheet, and how many across. Cell zero is empty on purpose. */
const FRAMES = 16
const COLS = 4

/**
 * How long it takes.
 *
 * A second and a half, which is slower than a UI transition has any business
 * being and is right here: this is not feedback on something somebody did, it
 * is a thing to watch. Under about a second the ring opens and the scene is
 * simply there, and nobody sees the fox arrive - which is the only moment in it
 * worth having.
 */
const PLAY_MS = 1500

/** Which cell, as a background-position pair. */
function cellPosition(frame: number): string {
  const col = frame % COLS
  const row = Math.floor(frame / COLS)
  const step = 100 / (COLS - 1)
  return `${col * step}% ${row * step}%`
}

export function SummonScene({ alt }: { alt: string }) {
  const ref = useRef<HTMLDivElement>(null)
  /**
   * The assembled frame, which is where this ends and what ships in the HTML.
   *
   * A visitor with no JavaScript, or with a hydration that never arrives, gets
   * the render rather than a blank rectangle where a render should be - which
   * is the failure this ordering exists to make impossible.
   */
  const [frame, setFrame] = useState(FRAMES - 1)
  /**
   * Whether the arrival is over, which is what starts the float.
   *
   * `true` to begin with, so the element that ships from the server is the
   * finished picture already breathing. The observer takes it back to `false`
   * for the length of one arrival, and never touches it again.
   */
  const [landed, setLanded] = useState(true)

  /*
   * Everything below is set up by an effect and *driven* by callbacks - the
   * observer's, and rAF's. Nothing sets state in the effect body itself, which
   * is both the lint rule and the right shape: the frame this element is on is
   * a consequence of somebody scrolling, not of it having mounted.
   */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    /*
     * Nothing rewinds for anybody who asked for nothing to move. The element
     * stays on the assembled cell it was rendered with, and the float is turned
     * off in the stylesheet under the same query - so what they get is the
     * still, which is the whole picture rather than the start of it.
     */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0

    const play = () => {
      /*
       * Back to the empty cell, in the same tick that starts the playhead.
       *
       * One frame of the assembled picture may paint before this lands, and
       * that is the right trade. The alternative is a layout effect that
       * rewinds on mount, which leaves a blank rectangle standing on the page
       * for everybody whose scroll never reaches this section - and the whole
       * reason the sheet ends on the assembled cell is so that never happens.
       */
      setLanded(false)
      setFrame(0)
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / PLAY_MS)
        /* Eased out, so the ring opens quickly and the arrival settles. The
           frames are not evenly spaced in the source either - most of the
           change is at one end - and easing the playhead the same way stops
           the two from cancelling each other out. */
        const eased = 1 - (1 - t) ** 2
        setFrame(Math.round(eased * (FRAMES - 1)))
        if (t < 1) {
          raf = requestAnimationFrame(step)
          return
        }
        raf = 0
        // Hand over to the float, which is CSS from here on.
        setLanded(true)
      }
      raf = requestAnimationFrame(step)
    }

    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        // Once. The observer is the only thing that could start this, so
        // disconnecting it here is the whole of "and never again".
        seen.disconnect()
        play()
      },
      /* A third of it, so it starts when the picture is properly on screen
         rather than when its top edge has crept over the fold - at a lower
         threshold most of the play happens below somebody's chin. */
      { threshold: 0.34 },
    )
    seen.observe(el)

    return () => {
      seen.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="summon-scene">
      {/* The house way to say "this is a room". Reused rather than redrawn -
          see the note on `.neon-floor`. */}
      <span className="neon-floor" />
      <div
        ref={ref}
        /* The float is a class rather than a style, so the keyframes live in
           the stylesheet with every other animation on this site and get the
           same reduced-motion rule as the rest of them. */
        className={`summon-frame${landed ? ' summon-frame-landed' : ''}`}
        /* Described rather than hidden: what it shows - somebody standing in a
           room with the room's own furniture around them - is the claim the
           words beside it are making. */
        role="img"
        aria-label={alt}
        style={{ backgroundPosition: cellPosition(frame) } as React.CSSProperties}
      />
    </div>
  )
}
