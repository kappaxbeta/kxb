import { PACKS } from '@kxb/xp/packs'
import { SOUND_PACK, XP_SOUNDS } from '@kxb/xp/sounds'
import { runsInSketch, type XpFlow, type XpSketch } from '@kxb/xp'
import { SKETCH_SDK } from '@/app/xp/_sketch/sdk'

/**
 * The container's document, built as a string for `srcdoc`.
 *
 * ---------------------------------------------------------------------------
 * The containment, in one place
 * ---------------------------------------------------------------------------
 * This string is the whole answer to "how can a stranger's JavaScript run
 * here" - backend.md §1.2's escape hatch, built. Three layers, each of which
 * would be embarrassing to lose in a refactor, so they are all in this one
 * function:
 *
 * 1. **The iframe attribute** (the stage's side): `sandbox="allow-scripts"`
 *    and nothing else. No `allow-same-origin`, so the document runs from an
 *    *opaque origin* - our cookies are not its cookies, our storage is not
 *    its storage, and `window.parent` is a cross-origin wall with exactly one
 *    door, `postMessage`.
 * 2. **The CSP below**: `default-src 'none'`, opened only for inline script
 *    (the sketch itself), our own origin (p5, pack pictures, sounds) and
 *    data/blob (what p5 generates). `connect-src` is our origin only, so a
 *    sketch can fetch our public art and nothing else - it cannot phone home.
 * 3. **The escaping**: the sources are inlined, so `</script` inside one
 *    must not close our tag. Armoured below; the test round-trips a source
 *    written to break out.
 *
 * What the author gets for accepting all that: real JavaScript with a real
 * DOM, `requestAnimationFrame`, WebGL - everything the QuickJS sandbox
 * deliberately has none of, which is what makes a *sketch* possible at all.
 *
 * ---------------------------------------------------------------------------
 * Evaluation order is the format's promise
 * ---------------------------------------------------------------------------
 * Every file in the order written, entry last - `XpSketch.entry` documents
 * it, this function implements it, and the test pins it. Each file gets its
 * own `<script>` tag rather than one concatenation, so a syntax error in
 * one file does not take its neighbours down with it and p5's global-mode
 * functions land on `window` wherever they were declared.
 */

/** `</script` must not close our tag; `<!--` must not open a comment that
 * swallows one. Both survive inside JS strings, where a stray backslash
 * before `/` or `!` changes nothing. */
const armour = (source: string) =>
  source.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')

/** Every take of every shipped sound, as URLs - the SDK cycles them. */
function soundMap(origin: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [name, sound] of Object.entries(XP_SOUNDS)) {
    out[name] = sound.takes.map((take) => `${origin}${SOUND_PACK.path}/${take}${SOUND_PACK.ext}`)
  }
  return out
}

export function sketchSrcdoc(options: {
  sketch: XpSketch
  /** `location.origin` at the stage; a placeholder in tests. */
  origin: string
  me: { id: string; name: string } | null
  keys: readonly { key: string; does: string }[]
  /** The document's `flow`, so the SDK can look phases up by name - only the
   * packed *state* travels at runtime (see `./flow-driver.ts`). */
  flow?: XpFlow | null
  /** What the host decided about this match - `FrameProps.match`'s contract,
   * with its three-state `started` folded in. Becomes `xp.match` inside. */
  match?: { started: boolean | null; timeLimit: number | null; scoreLimit: number | null } | null
  /**
   * The document's `words`, already resolved for *this* reader's language:
   * English sentence → their sentence. Resolved out here because the locale
   * is the platform's fact (a cookie, a provider) and the container gets
   * answers, not questions. Becomes `xp.t(sentence)` inside - which, as the
   * level runtime's own `t` warns, differs per reader: draw it, never
   * compare against it or name a signal by it.
   */
  words?: Record<string, string> | null
}): string {
  const { sketch, origin, me, keys, flow, match, words } = options

  const boot = {
    me: me ? { id: me.id, name: me.name } : null,
    keys: keys.map((one) => ({ key: one.key, does: one.does })),
    thumbs: `${origin}/xp/thumbs`,
    sounds: soundMap(origin),
    flow: flow ?? null,
    match: match ?? null,
    words: words ?? null,
    timeline: sketch.timeline ?? null,
    /**
     * The pack table, resolved to absolute URLs, so `xp.load.model` can turn
     * `proto/Barrel_A` into a fetch without the container ever holding a
     * path of its own - the same rule as thumbs and sounds: the document
     * names keys, the platform turns keys into addresses.
     */
    packs: Object.fromEntries(
      Object.entries(PACKS).map(([id, pack]) => [
        id,
        {
          path: `${origin}${pack.path}`,
          prefix: pack.prefix ?? '',
          ext: pack.ext,
          scale: pack.scale,
        },
      ]),
    ),
    // The carried (non-.js) files, for xp.file - a shader is source the
    // sketch reads, not source the container runs.
    text: Object.fromEntries(
      Object.entries(sketch.files).filter(([path]) => !runsInSketch(path)),
    ),
  }

  /**
   * `<` escaped throughout, which JSON permits inside strings and where every
   * `<` in stringified output lives - so no value can spell `</script` or
   * `<!--` into the tag this lands in.
   */
  const bootJson = JSON.stringify(boot).replace(/</g, '\\u003c')

  const csp = [
    `default-src 'none'`,
    // The sketch itself is inline; p5 comes from us.
    `script-src 'unsafe-inline' ${origin}`,
    `img-src ${origin} data: blob:`,
    `media-src ${origin} data: blob:`,
    // Our public art and nothing else. This is the "cannot phone home" line.
    `connect-src ${origin}`,
    `font-src ${origin} data:`,
    `style-src 'unsafe-inline'`,
  ].join('; ')

  // Only the .js files are evaluated; shaders and other carried text reach
  // the sketch through the boot config, read back with xp.file(path).
  const ordered = Object.entries(sketch.files)
    .filter(([path]) => runsInSketch(path) && path !== sketch.entry)
    .concat([[sketch.entry, sketch.files[sketch.entry] ?? '']])

  const fileTags = ordered
    .map(([path, source]) => `<script>/* ${path} */\n${armour(source)}\n</script>`)
    .join('\n')

  return [
    `<!doctype html><html><head>`,
    `<meta charset="utf-8">`,
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">`,
    // The page behind the canvas, in the scene's own sky rather than white -
    // a sketch that draws nothing on its first frame should not flash.
    `<style>html,body{margin:0;height:100%;overflow:hidden;background:#02000b}canvas{display:block}</style>`,
    `</head><body>`,
    `<script src="${origin}/xp/vendor/p5.min.js"></script>`,
    `<script>window.__XP_BOOT__=${bootJson}</script>`,
    `<script>${SKETCH_SDK}</script>`,
    fileTags,
    `</body></html>`,
  ].join('\n')
}
