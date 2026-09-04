/**
 * The three.js a WebView can load, copied into `public/`.
 *
 * Same job as `xp:vendor` and the same argument: the sketch and model
 * containers run on their own origin with `default-src 'none'`, so every script
 * they load has to be a file this app serves. A CDN would be one line and a
 * hole in the content policy - and an app that stops working when somebody
 * else's DNS does.
 *
 * Five files rather than a bundle, because three.js is ESM and the module graph
 * is the loader's own: `three.module.min.js` imports `three.core.min.js` beside
 * it, and `GLTFLoader.js` imports two utilities by relative path. Keeping the
 * layout the package already has means nothing is rewritten, so upgrading is
 * `bun run three:vendor` and no patching.
 *
 * The import map in `src/lib/model-page.ts` is what turns `three` and
 * `three/addons/` into these paths inside the container.
 */
import { mkdir, copyFile } from 'node:fs/promises'

const OUT = 'public/xp/vendor/three'

const FILES: [from: string, to: string][] = [
  // The library, and the half of it the module entry re-exports.
  ['node_modules/three/build/three.module.min.js', `${OUT}/three.module.min.js`],
  ['node_modules/three/build/three.core.min.js', `${OUT}/three.core.min.js`],
  // The loader, at the path its own relative imports expect.
  ['node_modules/three/examples/jsm/loaders/GLTFLoader.js', `${OUT}/addons/loaders/GLTFLoader.js`],
  ['node_modules/three/examples/jsm/utils/BufferGeometryUtils.js', `${OUT}/addons/utils/BufferGeometryUtils.js`],
  ['node_modules/three/examples/jsm/utils/SkeletonUtils.js', `${OUT}/addons/utils/SkeletonUtils.js`],
]

for (const [from, to] of FILES) {
  await mkdir(to.slice(0, to.lastIndexOf('/')), { recursive: true })
  await copyFile(from, to)
  console.log(`  ${to}`)
}

console.log(`three vendored into ${OUT}`)
