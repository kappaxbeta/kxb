/**
 * MediaPipe's pose landmarker, copied into `public/`.
 *
 * Same argument as `three:vendor` and `xp:vendor`: a CDN would be one line and
 * an app that stops working when somebody else's DNS does. The difference here
 * is that the task is not just code - the landmarker is a wasm runtime *and* a
 * model file, and the model is not in the npm package at all. Google ships it
 * from a bucket, so this script fetches it once and writes it beside the wasm.
 *
 * The output is ignored by git (see `.gitignore`): fifteen megabytes of build
 * output that is a pure function of two URLs and a version number. Run
 * `bun run mocap:vendor` after a fresh clone, or the capture page will tell you
 * to.
 *
 * ---------------------------------------------------------------------------
 * It also runs in `bun run build`, which puts a fetch in the release path
 * ---------------------------------------------------------------------------
 * Because the alternative is a deployed capture page that says "not here": CI
 * builds from a git checkout, and a gitignored file is not in one. So this is
 * the one step of the build that needs the network, and it is worth being
 * explicit that that is a trade rather than an oversight - the other two
 * publish steps read the repo and nothing else.
 *
 * The trade is made bearable by two things. A fetch that fails is *retried*,
 * because the failure that actually happens is a blip rather than a bucket
 * going away. And a fetch that keeps failing stops the build, rather than
 * shipping an image with a page in it that cannot work: a release that fails
 * loudly is a release somebody fixes, and one that ships broken is a bug
 * report from a member three weeks later.
 *
 * If that trade ever stops being worth it, the way out is to commit
 * `pose_landmarker_lite.task` - six megabytes, versioned in its own URL, and
 * the release path goes back to being offline.
 *
 * `FilesetResolver.forVisionTasks` is pointed at `wasm/`, and it picks the simd
 * build or the nosimd one itself - which is why all four files go over rather
 * than the two that this machine happens to load.
 */
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'

const OUT = 'public/mocap'
const WASM = 'node_modules/@mediapipe/tasks-vision/wasm'

const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]

/**
 * The two models the page offers, under the names it asks for them by.
 *
 * `lite` runs on anything and is the one a laptop webcam should use; `full` is
 * visibly steadier in depth - which is the axis a single camera is worst at -
 * and is worth its extra four megabytes on a machine that can keep up.
 */
const MODELS: [name: string, url: string][] = [
  [
    'pose_landmarker_lite.task',
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  ],
  [
    'pose_landmarker_full.task',
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  ],
]

await mkdir(`${OUT}/wasm`, { recursive: true })

for (const file of WASM_FILES) {
  await copyFile(`${WASM}/${file}`, `${OUT}/wasm/${file}`)
  console.log(`  ${OUT}/wasm/${file}`)
}

for (const [name, url] of MODELS) {
  const path = `${OUT}/${name}`
  // Already here and non-empty: the model is versioned in its URL, so a file
  // that exists is the file that URL serves. Re-downloading fifteen megabytes
  // on every `bun install` is the kind of thing that makes people skip a step.
  const have = await stat(path).catch(() => null)
  if (have && have.size > 0) {
    console.log(`  ${path} (already here)`)
    continue
  }

  await writeFile(path, await download(url))
  console.log(`  ${path}`)
}

console.log(`mocap vendored into ${OUT}`)

/**
 * One model, with the retries a build deserves.
 *
 * Three attempts a couple of seconds apart. Not a long backoff: this is inside
 * `next build`, somebody is watching a pipeline, and a bucket that is still
 * refusing after three tries is not going to answer on the fourth either - at
 * which point the right thing is to fail with the URL in the message.
 */
async function download(url: string): Promise<Uint8Array> {
  let last = ''
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`answered ${response.status}`)
      return new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
      console.log(`  ${url} - ${last} (attempt ${attempt} of 3)`)
      if (attempt < 3) await new Promise((wake) => setTimeout(wake, 2000))
    }
  }
  throw new Error(
    `Could not fetch ${url}: ${last}. The capture page needs it; re-run the build, ` +
      'or commit the model if this keeps happening.',
  )
}
