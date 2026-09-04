import 'server-only'
import type { ReactElement } from 'react'
import { picture, type PictureName, PIXEL_FONT } from '@/app/og/assets'
import { INK, SURFACE } from '@/lib/brand'

/**
 * The right-hand half of a card: the picture, and nothing else.
 *
 * ---------------------------------------------------------------------------
 * Why the artwork is a function and not a filename
 * ---------------------------------------------------------------------------
 * Four of the five cards want the same thing - one render, bottom right, over
 * the sky - and the fifth wants a galaxy with two words set into it. Passing a
 * filename to the frame would mean the frame growing a branch for the fifth,
 * and the frame is the one part of this that must stay the same shape for
 * every surface: it owns the margins, the brand row and the button, and those
 * are what make five different pictures read as one set of cards.
 *
 * So the frame takes a finished node and places it. What that node is, is this
 * file's business, and a sixth card is a sixth function here rather than a
 * sixth `if` over there.
 *
 * ---------------------------------------------------------------------------
 * Where the pictures sit
 * ---------------------------------------------------------------------------
 * Centred in a column of their own on the right, and the column is the same
 * one for all five cards - so the picture lands in the same place whether it
 * is a football, a room or a galaxy, which is what makes two of these in a
 * chat window read as two of a set.
 *
 * They fill that column because the transparent margin is trimmed off when the
 * file is built, not because anything here is nudged per picture. Every one of
 * these renders was shot with air around the subject; left in, the subject
 * ends up small and adrift in a large rectangle, and the fix for one framing
 * is the wrong fix for the next. See `public/og/README.md`.
 *
 * Nothing runs off the edge. It is tempting - a picture bled past the crop
 * looks bolder in a 1200x630 preview - and it is wrong here, because the
 * unfurlers that matter crop this to squarer shapes and the first thing they
 * take is the outer edge.
 *
 * They are also drawn *under* nothing: the frame's wash is a gradient that
 * fades out well before the artwork starts, so the picture is never dimmed to
 * make text legible over it. Text has its own half.
 */

/** How much room the artwork gets, and where the text has to stop. */
export const ART_WIDTH = 540

/**
 * One render, centred in the picture column.
 *
 * The height is left off deliberately - satori keeps the aspect ratio from the
 * intrinsic size when only one axis is given, and stating both here would mean
 * this file knowing the pixel dimensions of five files it does not own.
 */
export async function scene(name: Exclude<PictureName, 'sky' | 'galaxy'>): Promise<ReactElement> {
  const src = await picture(name)

  return (
    <div
      style={{
        position: 'absolute',
        right: 20,
        top: 0,
        width: ART_WIDTH,
        height: 630,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/*
        Rounded, and the same radius for all four. Two of these renders are
        cut-outs on transparency, where it changes nothing, and two are full
        frames with a floor running to the edge - which without it reads as a
        screenshot pasted onto the card rather than a picture on it. One rule
        rather than a flag per picture: a corner radius cannot hurt a cut-out,
        so there is nothing for a future picture to have to opt into.
      */}
      <img src={src} width={ART_WIDTH} alt="" style={{ borderRadius: 24 }} />
    </div>
  )
}

/**
 * The channel's own mark: XO inside a galaxy, with the word under it.
 *
 * The galaxy is the one in `public/xo/cosmos` - the same object the channel's
 * pages turn overhead - and XO sits in its core rather than beside it because
 * that is the joke the name is making. `SURFACE` for the letters and not the
 * ink colour: the core of that render is the brightest thing on the card, and
 * light letters on it disappear where dark ones cut.
 *
 * `UNIVERSE` is pixel type and is spaced out under the disc, which is the one
 * piece of typography on any of these cards that is doing a logo's job rather
 * than a sentence's. The negative margin pulls it up into the galaxy's outer
 * haze, where the render has already faded to nearly nothing - without it the
 * word floats in a band of empty sky and the two halves stop being one mark.
 */
export async function universeMark(): Promise<ReactElement> {
  const galaxy = await picture('galaxy')

  return (
    <div
      style={{
        position: 'absolute',
        right: 20,
        top: 0,
        height: 630,
        width: ART_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: 460,
          height: 460,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={galaxy}
          width={460}
          height={460}
          alt=""
          style={{ position: 'absolute', top: 0, left: 0 }}
        />
        <div
          style={{
            display: 'flex',
            marginTop: 26,
            marginRight: 40,
            fontFamily: PIXEL_FONT,
            fontSize: 128,
            color: SURFACE,
            letterSpacing: 2,
            /*
              A light halo, not decoration. Dark letters were placed on the
              core because the core is the brightest thing on the card - and
              the core is not in the middle of that render, so centring the
              word put half of it on a mid-grey arm where it stopped cutting.
              The margins above lean it back toward the bulge; the glow is what
              makes it legible anyway, wherever the disc happens to sit.
            */
            textShadow: `0 0 26px ${INK}, 0 0 60px ${INK}`,
          }}
        >
          XO
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: -56,
          fontFamily: PIXEL_FONT,
          fontSize: 42,
          letterSpacing: 10,
          color: INK,
        }}
      >
        UNIVERSE
      </div>
    </div>
  )
}
