import 'server-only'
import { ImageResponse } from 'next/og'
import type { ReactElement } from 'react'
import { ART_WIDTH } from '@/app/og/art'
import { picture, PIXEL_FONT, pixelFont, TEXT_FONT, textFont } from '@/app/og/assets'
import { CYAN, faviconSvg, INK, PINK, SURFACE } from '@/lib/brand'

/**
 * The frame every preview card is drawn in.
 *
 * ---------------------------------------------------------------------------
 * What was wrong with the one picture it replaces
 * ---------------------------------------------------------------------------
 * Every link into this site unfurled with the same render: three animals on a
 * green floor, on black, with nothing written on it. Three problems, and the
 * ugly one is the least of them.
 *
 * It was silent. A card is read in about a fifth of a second in a chat, and
 * that one asked the reader to get the whole product out of the title beside
 * it - which was the site's own `<title>`, a comma-separated list of six event
 * types, because the root layout's `og:title` is inherited by every route that
 * does not set its own.
 *
 * It was the same everywhere. A link to a story chapter, a link to the front
 * page and a link that is somebody's invitation into a match all arrived
 * looking identical, so the picture carried no information at all past "this
 * is that site".
 *
 * And it was in one language. The front page is published in three; the
 * picture was in none of them, which is the same as being in English.
 *
 * ---------------------------------------------------------------------------
 * The frame
 * ---------------------------------------------------------------------------
 * Left half text, right half picture, over the app's own sky. The split is
 * fixed across all five cards on purpose: what changes between them is the
 * picture and the sentence, and everything else staying put is what makes a
 * second one recognisable as the same site as the first.
 *
 * The wash is a gradient rather than a panel because the sky has to be visible
 * *behind* the words for the card to look like one photograph rather than a
 * caption stuck onto one. It fades out at 76%, well before the artwork starts,
 * so no picture is ever dimmed in order to make text legible.
 *
 * The button is a picture of a button. Nobody can press it - the whole card is
 * one flat PNG - and it is there because the shape reads as "there is
 * something to do on the other side of this" before any of the words do. The
 * words on it come from `words.ts` and are the only strings on a card that are
 * not borrowed from the page it points at.
 */

/**
 * 1200x630.
 *
 * The size every unfurler crops from rather than the size any of them shows:
 * X shows about 2:1, Telegram is close to square on a phone, WhatsApp is
 * squarer still. So the composition keeps its ballast - the brand row, the
 * headline, the button - in the middle band vertically and away from the outer
 * 40 pixels, which is the part that reliably survives all three.
 */
export const OG_SIZE = { width: 1200, height: 630 }

export const OG_CONTENT_TYPE = 'image/png'

export interface CardSpec {
  /** The small line above the headline: a badge, a space's name, a category. */
  eyebrow?: string
  /** The one sentence. Borrowed from the page this card is a preview of. */
  headline: string
  /** The second line, at reading size. Optional - some cards say enough. */
  sub?: string
  /** The label in the pill. */
  button: string
  /** The right-hand half, from `art.tsx`. */
  art: ReactElement
}

/** How wide the words may run before they reach the picture. */
const TEXT_WIDTH = OG_SIZE.width - ART_WIDTH

/**
 * The second line, cut to something a chat window will actually be read.
 *
 * The strings this is handed are page copy - a hero's sub, a channel's
 * tagline - and page copy is written for somebody who has already arrived and
 * is looking at it. Set at 25px in a 640px column, the front page's runs to six
 * lines and pushes the button off its own margin, which is how a card built out
 * of borrowed sentences goes wrong: nothing is mistyped, there is simply too
 * much of it.
 *
 * So it takes whole sentences while they fit and falls back to whole words with
 * an ellipsis when the first sentence is already too long. Cutting mid-word is
 * the one outcome worth writing code to avoid - a truncated sentence reads as
 * an editorial decision, and a truncated word reads as a bug.
 *
 * Not a CSS clamp: satori has no `-webkit-line-clamp`, and a `maxHeight` with
 * hidden overflow would slice a line of type in half horizontally.
 */
const SUB_LIMIT = 130

function clamp(sub: string): string {
  if (sub.length <= SUB_LIMIT) return sub

  // As many whole sentences as fit. A full stop followed by a space, so the dot
  // in "kxb.team" or in a decimal is not mistaken for the end of one.
  const cut = sub.slice(0, SUB_LIMIT + 1)
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  if (stop > SUB_LIMIT / 2) return sub.slice(0, stop + 1)

  // The first sentence is already too long, so: whole words, and an ellipsis to
  // say so.
  const words = cut.split(' ')
  words.pop()
  return `${words.join(' ')}…`
}

export async function ogCard({ eyebrow, headline, sub, button, art }: CardSpec) {
  const [sky, pixel, text] = await Promise.all([picture('sky'), pixelFont(), textFont()])

  /**
   * The mark, from the same paths the favicon is drawn from.
   *
   * Percent-encoded SVG rather than one of the PNGs in `public`: those are the
   * full lockup at press-kit size, and what belongs at 52 pixels is the tab
   * icon - which `brand.ts` already draws, and already explains why it drops
   * the glow and the italic at this size.
   */
  const mark = `data:image/svg+xml,${encodeURIComponent(faviconSvg(CYAN))}`

  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: OG_SIZE.width,
          height: OG_SIZE.height,
          backgroundColor: SURFACE,
        }}
      >
        <img
          src={sky}
          width={OG_SIZE.width}
          height={OG_SIZE.height}
          alt=""
          style={{ position: 'absolute', top: 0, left: 0 }}
        />

        {/* The wash. Left to right, gone before the picture. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: OG_SIZE.width,
            height: OG_SIZE.height,
            display: 'flex',
            backgroundImage:
              'linear-gradient(100deg, rgba(3,2,14,0.95) 0%, rgba(3,2,14,0.82) 44%, rgba(3,2,14,0) 76%)',
          }}
        />

        {art}

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: TEXT_WIDTH,
            height: OG_SIZE.height,
            padding: '52px 60px',
          }}
        >
          {/* kxb.team, and the shelf it sits on. */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={mark} width={52} height={52} alt="" />
            <div
              style={{
                display: 'flex',
                marginLeft: 16,
                fontFamily: PIXEL_FONT,
                fontSize: 30,
                color: INK,
              }}
            >
              kxb.team
            </div>
            {/*
              The tier the whole world is built on, as a chip. Not decoration:
              "xo" is the word for the thing somebody is being handed a link
              into, and it is the one piece of vocabulary a person meets in a
              chat before they meet it in the product.
            */}
            <div
              style={{
                display: 'flex',
                marginLeft: 14,
                padding: '5px 13px 7px',
                borderRadius: 999,
                border: `2px solid ${CYAN}`,
                fontFamily: PIXEL_FONT,
                fontSize: 21,
                color: CYAN,
              }}
            >
              xo
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {eyebrow ? (
              <div
                style={{
                  display: 'flex',
                  fontFamily: TEXT_FONT,
                  fontSize: 23,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  color: CYAN,
                  marginBottom: 18,
                }}
              >
                {eyebrow}
              </div>
            ) : null}

            {/*
              Pixel first, Geist behind it. The headline is the page's own
              sentence, so it can arrive in Bulgarian - and PixelMillennium has
              no Cyrillic. Satori resolves a missing glyph against the next
              face in the list rather than drawing a box, so a Cyrillic
              headline comes out set in Geist and legible instead of set in
              tofu. The two never mix within one word, because no word in any
              of the three languages mixes scripts.
            */}
            <div
              style={{
                display: 'flex',
                fontFamily: `${PIXEL_FONT}, ${TEXT_FONT}`,
                fontSize: 46,
                lineHeight: 1.28,
                color: INK,
              }}
            >
              {headline}
            </div>

            {sub ? (
              <div
                style={{
                  display: 'flex',
                  marginTop: 20,
                  fontFamily: TEXT_FONT,
                  fontSize: 25,
                  lineHeight: 1.4,
                  color: 'rgba(246,243,254,0.72)',
                }}
              >
                {clamp(sub)}
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex' }}>
            <div
              style={{
                display: 'flex',
                padding: '17px 38px 21px',
                borderRadius: 999,
                backgroundImage: `linear-gradient(90deg, ${PINK} 0%, ${CYAN} 100%)`,
                fontFamily: PIXEL_FONT,
                fontSize: 27,
                color: SURFACE,
              }}
            >
              {button}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: PIXEL_FONT, data: pixel, style: 'normal', weight: 400 },
        { name: TEXT_FONT, data: text, style: 'normal', weight: 400 },
      ],
    },
  )
}
