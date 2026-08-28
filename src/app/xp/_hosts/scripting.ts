'use client'

import { engineFor, type ScriptEngine } from '@kxb/xp/script'
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  type QuickJSWASMModule,
} from 'quickjs-emscripten-core'
import releaseSync from '@jitl/quickjs-wasmfile-release-sync'

/**
 * Where the interpreter's wasm is, said out loud.
 *
 * A path under `public/` rather than an import, so the binary never enters the
 * module graph - see the note below for why that is the whole point. Absolute
 * from the root because this is loaded from `/xp/:id`, `/t/:slug/studio/xp/:id`
 * and the render worker alike, and a relative URL would mean three answers.
 *
 * `scripts/xp-wasm.ts` copies it here and `xp-wasm.test.ts` fails if the copy
 * and the installed package have drifted, which is what makes a version bump
 * loud instead of silent.
 */
const WASM_URL = '/quickjs/emscripten-module.wasm'

const variant = newVariant(releaseSync, { wasmLocation: WASM_URL })

/**
 * The interpreter a script runs in, chosen here rather than in the engine.
 *
 * `@kxb/xp/script` imports QuickJS's *API* and no QuickJS: which build is a
 * host's decision, for the same reason the transport is (see ./local). There are
 * several, and they are not interchangeable - one fetches a `.wasm` beside the
 * module, one is compiled for Cloudflare's runtime, one has the binary inlined
 * as base64. A package that picked would pick wrong for somebody.
 *
 * ---------------------------------------------------------------------------
 * A `.wasm` file, and not the single-file build it used to be
 * ---------------------------------------------------------------------------
 * This was the inlined build, for a reason that read well: the alternative has
 * to *find* its binary, and the way it finds it is `import.meta.url` - so the
 * bundler has to emit the asset, the server has to serve it with the right type,
 * and every one of Next's rendering modes has to agree about where it went.
 * Inlined, there is nothing to find, and the cost was 590 KB in a chunk that
 * only `/xp` loads.
 *
 * What that argument missed is that inlining does not avoid the risk, it moves
 * it. The binary inlined is a 590 KB *string literal*, and a string that large
 * goes through the minifier on every build. Turbopack's re-serialises it and
 * emits `\0` in front of a digit - an octal escape, which is a syntax error
 * inside the template literal the package wraps it in. Measured: 73 of them,
 * `node --check` refuses the chunk, and with `turbopackMinify: false` there are
 * none.
 *
 * The failure that produced is the reason this is worth a paragraph. The chunk
 * still *served* - 200, byte-identical through the CDN - it simply never
 * parsed, so it never registered its module, so the `import()` waiting on that
 * module never settled and never rejected. `scriptEngine()` hung, the `catch`
 * below never ran, and the HUD sat on "N scripts loading" forever. Dev does not
 * minify, so it only ever happened once it was deployed.
 *
 * So: `wasmLocation` above, pointing at a file in `public/`. The binary is not
 * in the module graph at all now, which is what makes it unminifiable rather
 * than merely minified-correctly-today. The three risks the old note listed are
 * answered by saying the path out loud instead of deriving it - nothing is
 * emitted, nothing is guessed, and `public/` is the one place every rendering
 * mode already agrees about. It is also the smaller download the old note
 * wanted, cached on its own.
 *
 * ---------------------------------------------------------------------------
 * Loaded once, shared by every XP
 * ---------------------------------------------------------------------------
 * Compiling the wasm is the expensive part and it produces one interpreter with
 * no state of its own; the per-document state is a runtime and a context, and
 * those are made and freed by `open` and `close`. So the promise is memoised
 * rather than the result: two components mounting at once must not start two
 * compiles, and a compile that failed should be retryable rather than a
 * permanently poisoned module.
 */
let pending: Promise<ScriptEngine> | null = null

export function scriptEngine(): Promise<ScriptEngine> {
  if (!pending) {
    pending = newQuickJSWASMModuleFromVariant(variant)
      .then((wasm: QuickJSWASMModule) => engineFor(wasm))
      .catch((reason: unknown) => {
        // Cleared so the next caller tries again. A network hiccup on the chunk
        // that carries the interpreter should not mean scripts are off until
        // the tab is reloaded.
        pending = null
        throw reason
      })
  }
  return pending
}
