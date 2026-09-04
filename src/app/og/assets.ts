import 'server-only'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The bytes a card is drawn out of: two faces and five pictures.
 *
 * ---------------------------------------------------------------------------
 * Why files and not URLs
 * ---------------------------------------------------------------------------
 * Satori will fetch an `<img src="https://…">` for you, and doing that here
 * would mean the server making an HTTP request to itself in the middle of
 * rendering a preview for a crawler that is already waiting. Behind a proxy,
 * inside a container, on a box where the public hostname does not resolve from
 * the inside, that request is the thing that fails - and it fails as a card
 * with a hole in it rather than as an error anybody sees. Reading the file off
 * disk cannot fail for a reason that is not "the file is missing".
 *
 * `process.cwd()` is the project root in development and `/app` in the image,
 * which is where the Dockerfile copies `public/` - so one path works in both.
 *
 * ---------------------------------------------------------------------------
 * Why PNG and JPEG and not the WebP the site uses
 * ---------------------------------------------------------------------------
 * The scenes in `public/xo/scenes` are WebP, and satori's image decoder does
 * not read WebP. So `public/og/` holds PNG and JPEG derivatives of them, built
 * once by the script in its README. That folder is the only place this module
 * looks, which is also what keeps a card from quietly growing a 900KB source
 * render as its artwork.
 *
 * ---------------------------------------------------------------------------
 * Read once
 * ---------------------------------------------------------------------------
 * The promise is cached, not the buffer: two cards rendering at the same time
 * on a cold process should queue on one read rather than start two. Nothing
 * here is ever invalidated, because these files only change when the image
 * does, and a deploy is a new process.
 */

const reads = new Map<string, Promise<Buffer>>()

function bytes(relative: string): Promise<Buffer> {
  const cached = reads.get(relative)
  if (cached) return cached

  const read = readFile(join(process.cwd(), relative))
  reads.set(relative, read)
  return read
}

/**
 * The two faces.
 *
 * `pixel` is PixelMillennium, the same file `next/font/local` serves to the
 * site - so a headline in a preview is set in the face the page it points at
 * sets its headline in. It has no Cyrillic, which is why it is reserved for
 * the brand's own words: `kxb.team`, `XO`, `UNIVERSE`. Those are the same in
 * every language and are never translated.
 *
 * `text` is Geist, and it is here for exactly the case the pixel face cannot
 * cover: an invitation rendered in Bulgarian, or a space whose name somebody
 * wrote in Cyrillic. Everything a person could have written goes through it.
 *
 * The file is checked into `public/font` rather than imported from inside
 * `next/dist/compiled/@vercel/og`, where a copy also lives: that path is an
 * implementation detail of the bundler and would take the previews down on an
 * upgrade that moved it, in a way no test would notice.
 */
export const PIXEL_FONT = 'Pixel'
export const TEXT_FONT = 'Geist'

export function pixelFont(): Promise<Buffer> {
  return bytes('public/font/PixelMillennium.ttf')
}

export function textFont(): Promise<Buffer> {
  return bytes('public/font/Geist-Regular.ttf')
}

/** The pictures a card can wear, by the name the art module asks for them by. */
const PICTURES = {
  sky: { file: 'public/og/sky.jpg', type: 'image/jpeg' },
  crew: { file: 'public/og/crew.png', type: 'image/png' },
  duel: { file: 'public/og/duel.png', type: 'image/png' },
  summon: { file: 'public/og/summon.png', type: 'image/png' },
  galaxy: { file: 'public/og/galaxy.png', type: 'image/png' },
} as const

export type PictureName = keyof typeof PICTURES

/**
 * One picture, as something an `<img src>` will take.
 *
 * Base64 rather than a path: satori is not running in a browser and has no
 * document to resolve a relative URL against, so the bytes have to be in the
 * markup.
 */
export async function picture(name: PictureName): Promise<string> {
  const { file, type } = PICTURES[name]
  const data = await bytes(file)
  return `data:${type};base64,${data.toString('base64')}`
}
