/**
 * The checked-in interpreter has to be the one the package installs.
 *
 * `scripting.ts` loads the wasm by URL, from `public/`, so nothing in the
 * bundler or the type checker can notice that the copy has gone stale after a
 * dependency bump. This can: it is the only thing standing between a version
 * bump and an interpreter that is silently a release behind - or, if the copy
 * is missing altogether, a 404 that surfaces as "scripts do not run".
 *
 * A byte comparison and not a hash written down somewhere, because the fix for
 * a failure here is `bun run xp:wasm` and a diff, and a recorded hash would be
 * a third thing to keep in step with the other two.
 */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

const INSTALLED = 'node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm'
const SERVED = 'public/quickjs/emscripten-module.wasm'

describe('the QuickJS binary in public/', () => {
  test('is byte for byte the one the package ships', async () => {
    const [installed, served] = await Promise.all([readFile(INSTALLED), readFile(SERVED)])
    // Compared as lengths first: a mismatch on half a megabyte of binary prints
    // an unreadable diff, and "different sizes" is the whole message anyway.
    expect(served.byteLength).toBe(installed.byteLength)
    expect(served.equals(installed)).toBe(true)
  })

  test('is a wasm module and not an HTML error page', async () => {
    // The failure this catches is a `public/` file that got replaced by
    // whatever a proxy or a git-lfs pointer left behind. `\0asm` is the magic
    // number; without it the browser rejects the module with a message about
    // the *fetch*, which sends you looking in the wrong place.
    const served = await readFile(SERVED)
    expect([...served.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d])
  })
})
