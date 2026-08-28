#!/usr/bin/env bun
/**
 * Copies the QuickJS interpreter into `public/`, where nothing can rewrite it.
 *
 *     bun run xp:wasm
 *
 * Run it after bumping `@jitl/quickjs-wasmfile-release-sync`. The output is
 * checked in, and `src/app/xp/_hosts/wasm-asset.test.ts` fails if the two have
 * drifted - which is the point of the copy being a script rather than a thing
 * somebody remembers.
 *
 * ---------------------------------------------------------------------------
 * Why the binary is copied rather than imported
 * ---------------------------------------------------------------------------
 * Because a `.wasm` that reaches the bundler is a `.wasm` the bundler may
 * decide to inline, and an inlined binary is a very large string literal that
 * the minifier then rewrites. It rewrote the last one into a syntax error - see
 * the note in `src/app/xp/_hosts/scripting.ts`, which is the whole story. A
 * file in `public/` is served as the bytes on disk by every rendering mode
 * there is, and there is no build step in between to have an opinion.
 *
 * A copy rather than a `postinstall`: the Docker build installs dependencies in
 * a stage that has no `public/` in it (see the Dockerfile's `deps`), so an
 * install-time hook would write the file into the wrong layer and the runtime
 * image would ship without it.
 */
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const FROM = 'node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm'
const TO = 'public/quickjs/emscripten-module.wasm'

await mkdir(dirname(TO), { recursive: true })
await copyFile(FROM, TO)
console.log(`${FROM} -> ${TO}`)
