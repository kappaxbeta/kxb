/**
 * Drives `/world/shots` in a headless browser and saves each scene to a PNG.
 *
 *     bun run scripts/shoot-scenes.ts            # every scene
 *     bun run scripts/shoot-scenes.ts crew       # just one
 *
 * Needs a server on http://localhost:3000 (`bun run dev`) to serve the page, and
 * nothing else from it: the frame comes back over the DevTools protocol and this
 * script is what writes the file. It used to arrive by the page POSTing itself
 * to `/api/shots`, which meant the shutter only worked where a route was allowed
 * to write into the repo - see the note on the capture bridge in
 * `src/app/world/shots/shot-studio.tsx`.
 *
 * ---------------------------------------------------------------------------
 * Why a browser at all, when the other two render scripts avoid one
 * ---------------------------------------------------------------------------
 * `render-blocks.ts` and `render-stage.ts` rasterize in software precisely so
 * they do not need one - but what they draw is a single flat-shaded model and a
 * procedural prism. These scenes are the real thing: shadow maps, an emote
 * atlas, skinned-in-spirit glTF clips posed by an AnimationMixer, three.js
 * materials and tone mapping. Reimplementing that is not a file, it is a
 * renderer, and it would be a second renderer whose output would drift from the
 * one the product actually uses.
 *
 * So the scene is drawn by the same three.js the lounge runs, and this is the
 * shutter. Chrome runs headless with SwiftShader, which is slow and pixel-wise
 * fine: the output is a still.
 *
 * The page is driven over the DevTools protocol rather than just opened with
 * `?shoot=1`, because a `bun run` that finishes with no file and no reason is
 * not a tool anybody can fix. This way a scene that fails to load says which
 * one and why. The client itself lives in `./devtools.ts`, shared with the
 * render worker.
 */

import path from 'node:path'
import sharp from 'sharp'
import { launchChrome, openTab, waitFor } from './devtools'

/**
 * `localhost`, not `127.0.0.1`.
 *
 * Next's dev server refuses cross-origin requests for its own dev resources,
 * and it decides what "cross-origin" means by host name: a page served to
 * `127.0.0.1` is blocked from fetching the HMR channel and the client chunks
 * behind it. The HTML still arrives, so the page looks fine and simply never
 * hydrates - no error, no `window.shot`, just a shot that times out. Either add
 * `127.0.0.1` to `allowedDevOrigins`, or ask for the host Next already trusts.
 */
const APP = process.env.SHOOT_APP_URL ?? 'http://localhost:3000'
const PORT = 9333
const PROFILE = path.join(import.meta.dir, '..', '.shoot-profile')

/** Where the encoded frames land. */
const SHOTS_DIR = path.join(import.meta.dir, '..', 'public', 'xo', 'scenes')

/** What a canvas prefixes its bytes with, and the only prefix accepted here. */
const PNG_PREFIX = 'data:image/png;base64,'

/**
 * One frame, as `window.shot()` hands it over.
 *
 * Declared rather than imported. The app's copy lives in a `.tsx` full of R3F
 * components and importing it here would pull three.js into a script whose
 * whole point is that it does not render anything itself. Two fields and a
 * string - if they ever disagree, the `startsWith` below is what says so.
 */
interface Capture {
  dataUrl: string
  width: number
  height: number
}

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** The scenes `/world/shots` knows about. Kept in step by hand; it is a short list. */
const SCENES = [
  // The three sculptural heaps for /play, /create and /share. Lit by their own
  // no-ambient coloured rig rather than by `Rig` - see `NeonHeapRig`.
  'heap-play',
  'heap-create',
  'heap-share',
  'crew',
  'football-solo',
  'football-duel',
  'football-crowd',
  'football-goal',
  'house',
  'og-hero',
  'cafe-counter',
  'desk-duo',
  // The /events build sequence: one room, one camera, five stages of getting
  // built. Shot together and cross-faded on the page, so they are only ever
  // worth re-shooting as a set.
  'venue-1-plot',
  'venue-2-floor',
  'venue-3-fitout',
  'venue-4-branded',
  'venue-5-doors',
]

const wanted = process.argv.slice(2)
const scenes = wanted.length > 0 ? wanted : SCENES

/**
 * Writes the frame the page just handed back, as webp.
 *
 * A canvas can hand back a PNG and nothing else, and a 1600x1000 render of
 * flat-shaded models with a transparent background is about a megabyte of it -
 * six of those is a landing page that costs more than the app it advertises.
 * The same frame as lossy webp is a tenth of that with the alpha intact, which
 * is what the page actually loads, so the PNG never reaches the disk at all: it
 * arrives as base64 over the wire and goes straight into sharp.
 *
 * Here rather than in the app on purpose. This is a script, sharp is a
 * dependency it can have, and nothing it does ends up in the app's bundle.
 */
async function encode(
  scene: string,
  capture: Capture,
): Promise<{ file: string; bytes: number; from: number }> {
  const png = Buffer.from(capture.dataUrl.slice(PNG_PREFIX.length), 'base64')
  const webp = path.join(SHOTS_DIR, `${scene}.webp`)
  const { size } = await sharp(png).webp({ quality: 88, effort: 6 }).toFile(webp)
  return { file: `/xo/scenes/${scene}.webp`, bytes: size, from: png.byteLength }
}

// ---------------------------------------------------------------------------

async function main() {
  const response = await fetch(APP).catch(() => null)
  if (!response) {
    throw new Error(`no dev server at ${APP} - start one with \`bun run dev\``)
  }

  const chrome = await launchChrome({ executable: CHROME, port: PORT, profile: PROFILE })

  try {
    for (const scene of scenes) {
      const tab = await openTab(chrome, `${APP}/world/shots?scene=${scene}`)
      const { page } = tab
      try {
        // Hydration first: until the client bundle has run there is no studio,
        // let alone a scene. Then the models, then the shutter.
        await waitFor(
          page,
          'typeof window.shot === "function"',
          `${scene}: the studio to hydrate`,
          90_000,
        )
        await waitFor(page, 'window.shotReady === true', `${scene}: models to load`)

        const capture = await page.evaluate<Capture>('window.shot()')
        if (!capture?.dataUrl?.startsWith(PNG_PREFIX)) {
          throw new Error(`${scene}: the page returned no frame`)
        }
        const webp = await encode(scene, capture)
        console.log(
          `${scene} -> ${webp.file} (${capture.width}x${capture.height},` +
            ` ${Math.round(webp.bytes / 1024)} kB,` +
            ` from ${Math.round(webp.from / 1024)} kB of PNG)`,
        )
      } finally {
        await tab.close()
      }
    }
  } finally {
    chrome.close()
  }
}

await main()
