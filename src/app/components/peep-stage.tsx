'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { type EmoteId, emoteTileStyle } from '@/domain/world/emotes'

/**
 * The hero's cast: three peeps on a holographic podium, reacting.
 *
 * The renders come from `public/xo/shots/<avatar>-<angle>.webp`, shot off the
 * same GLBs the lounge loads, so the landing page cannot show an animal the
 * product does not have. Five camera angles exist per animal; the trio mixes
 * front and three-quarter so they read as standing together rather than as
 * three copies of the same portrait.
 *
 * Static images rather than a live canvas on purpose. The lounge is three.js
 * and a few hundred kilobytes of it; making a first-time visitor download that
 * before they know what the site is would trade the thing we are selling for
 * the thing we are selling it with.
 */

type Peep = {
  avatar: string
  /** Which of the five renders to use. */
  angle: 'front' | 'three' | 'side' | 'back' | 'low'
  /** Percent across the stage, and how far up from the horizon. */
  x: number
  /** x on small screens (≤640px), where the stage is narrower. */
  xs: number
  y: number
  ys: number
  /** Relative size. Doubles as depth: smaller reads as further back. */
  scale: number
  /** The neon this one is lit by, as an oklch hue. */
  hue: number,
  flip?: boolean,
  /**
   * What this one is saying, as an index into the real emote sheet.
   *
   * It used to be a string, and the strings were things like "standup in 5" and
   * "who moved the couch" - which advertised a text chat the product does not
   * have. Emotes are the only way to say anything in the lounge, so they are the
   * only thing the hero is allowed to show. Typing it as `EmoteId` and drawing
   * it from the shared atlas means the landing page cannot show a face the app
   * cannot send, for the same reason the renders come from the lounge's GLBs.
   */
  emote: EmoteId
}

/**
 * Three, not a crowd. A crowd needs the whole floor and leaves the stage with
 * nothing to do; three big characters shoulder to shoulder on one podium is
 * the reference's composition, and it puts every face at a size where the
 * expressions actually land. Ordered back-to-front: the middle one stands a
 * step behind, so the outer two overlap it and the podium reads as deep.
 */
const CAST: Peep[] = [
  // The emote indices are positions in `public/xo/emotes48.png`, counted left
  // to right and top to bottom from zero - real tiles from the sheet, because
  // emotes are the only way to say anything in the lounge.
  // x is a percentage of the whole stage, but the podium render spans only the
  // middle ~28rem of it - these values keep all three pairs of feet on the top
  // face, with the front two at its leading edge and the middle one a step up
  // it. Widen the spread and the outer two hang off the rim.
  // `ys` is 26 and not 32 because the podium is not a fixed share of the stage:
  // it is `min(28rem, 84%)`, so on a phone it is shorter than the percentage the
  // desktop value was measured against, and the same 32% left all three hovering
  // a dozen pixels over its top face. 26% puts their feet back on it - the same
  // fraction up the podium (~58%) that `y` puts them at on a wide screen.
  { avatar: 'caterpillar', angle: 'front', x: 50, xs: 50, y: 29, ys: 26,scale: 0.75, hue: 145, emote: 6 }, // heart eyes
  { avatar: 'beaver', angle: 'three', x: 37, xs:30, y: 29, ys: 26, scale: 0.75, hue: 40, emote: 24 }, // YES
  { avatar: 'lion', angle: 'three', x: 63, xs:70, y: 29, ys: 26, scale: 0.75, hue: 85, emote: 48, flip: true }, // LOL
]

/** How long each peep holds the floor before the next one speaks. */
const TURN_MS = 2400

export function PeepStage() {
  const [talking, setTalking] = useState(0)
  /**
   * Paused while a visitor is driving it themselves. Auto-advancing out from
   * under someone who just clicked a peep would take the "interactive" out of
   * the thing the hero is claiming to be.
   */
  const [manual, setManual] = useState(false)

  useEffect(() => {
    if (manual) return
    const id = setInterval(() => setTalking((t) => (t + 1) % CAST.length), TURN_MS)
    return () => clearInterval(id)
  }, [manual])

  return (
    <div className="peep-stage" aria-hidden="true">
      {/* The podium: a real render, not CSS. `scripts/render-stage.ts` draws
          the three slabs with a bloom pass and writes public/xo/stage.png -
          bloom that hugs the projected silhouette is the part border-radius
          and box-shadow could never fake. The render is 810px wide and the
          hero shows it at ~450, so the baked glow never upscales soft. */}
      <span className="holo-stage">
        <Image src="/xo/stage.png" alt="" width={810} height={329} priority />
      </span>
      {CAST.map((peep, i) => (
        <button
          key={peep.avatar}
          type="button"
          className={`${peep.flip && 'scale-x-[-1]'} peep${i === talking ? ' peep-talking' : ''}`}
          style={
            {
              '--x': `${peep.x}%`,
              '--x-mobile': `${peep.xs}%`,
              '--y': `${peep.y}%`,
              '--y-mobile': `${peep.ys}%`,
              '--scale': peep.scale,
              '--hue': peep.hue,
              // Staggered so the idle bob does not move the crowd in lockstep.
              '--delay': `${(i * 0.37).toFixed(2)}s`,
              zIndex: i,
            } as React.CSSProperties
          }
          onMouseEnter={() => {
            setManual(true)
            setTalking(i)
          }}
          onFocus={() => {
            setManual(true)
            setTalking(i)
          }}
          onClick={() => {
            setManual(true)
            setTalking(i)
          }}
          onMouseLeave={() => setManual(false)}
          onBlur={() => setManual(false)}
          tabIndex={-1}
        >
          <span className="peep-bubble">
            {/* Sized off the peep's own scale, so a face floating over someone
                standing at the back is as far away as they are. */}
            <span
              className="peep-emote"
              style={emoteTileStyle(peep.emote, Math.round(20 + peep.scale * 16))}
            />
          </span>
          <Image
            src={`/xo/shots/${peep.avatar}-${peep.angle}.webp`}
            alt=""
            width={512}
            height={512}
            // The front row is the largest thing above the fold; letting it
            // lazy-load would make the hero pop in after the text.
            priority={peep.scale >= 0.9}
            className="peep-img"
          />
          <span className="peep-shadow" />
        </button>
      ))}
    </div>
  )
}
