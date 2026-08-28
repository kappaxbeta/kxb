import { networkInterfaces } from 'node:os'
import path from 'node:path'
import type { NextConfig } from 'next'

/**
 * Every address this machine can be reached on, for `allowedDevOrigins`.
 *
 * Next blocks cross-origin requests to dev-only assets, and "cross-origin"
 * means anything that is not the host the server was started with - which is
 * `localhost`. Opening the dev server from a phone on the same wifi is
 * therefore refused, and refused in a way that takes a while to recognise: the
 * HTML arrives and renders, and then the chunks, the sourcemaps and the HMR
 * websocket all fail separately, so it reads as a broken page rather than as a
 * blocked origin.
 *
 * Derived rather than listed, because the alternative is a hard-coded
 * `192.168.x.x` that is correct until the router hands out a different lease -
 * at which point somebody debugs it a second time. This is exactly the set of
 * addresses this machine actually answers on, and nothing else.
 *
 * Dev-only by definition: `allowedDevOrigins` has no effect on a build or on
 * `next start`, so this cannot widen anything in production.
 */
function lanOrigins(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    // A predicate rather than a plain filter: `networkInterfaces()` is typed as
    // a dict of possibly-undefined arrays, and without the narrowing the map
    // below is reaching into something the compiler still thinks may be absent.
    .filter(
      (net): net is NonNullable<typeof net> =>
        net !== undefined && net.family === 'IPv4' && !net.internal,
    )
    .map((net) => net.address)
}

/**
 * `bun run dev-css-classname` only.
 *
 * Routes every .tsx through babel-loader so `scripts/babel-plugin-source-attr.cjs`
 * can stamp each DOM element with the file and line it came from - the answer to
 * "which of the eleven files with `flex items-center gap-2` is this one".
 *
 * Two locks on it, because .tsx skipping SWC is not something to ship by
 * accident: this env var, which only that script sets, and NODE_ENV. The rule
 * itself then carries a `development` condition as a third, so even an exported
 * NEXT_SOURCE_ATTRS cannot leak the transform into `next build`.
 */
const stampSourceAttrs =
  process.env.NEXT_SOURCE_ATTRS === '1' && process.env.NODE_ENV !== 'production'

const nextConfig: NextConfig = {
  // Emits .next/standalone with only the files the server actually needs,
  // which is what the Dockerfile copies for Railway.
  output: 'standalone',

  images: {
    /**
     * How long an optimized image stays fresh in the browser. The default is
     * four hours, which is what `/_next/image` was sending: `max-age=14400,
     * must-revalidate`. A month is a much better fit for what we actually put
     * through the optimizer.
     *
     * Safe because every image reaching `/_next/image` here is a build-time
     * file under `public/` - avatar shots, scene stills, block icons, the
     * marketing screenshots. Nothing mutable goes through it: uploads, event
     * banners and render output are all served by API routes and drawn with a
     * plain `<img>` precisely so they are not optimized (see picture-card.tsx,
     * featured-events.tsx). So there is no version of this that pins a stale
     * user-visible image for a month.
     *
     * The other half of why it is safe is that the URLs already bust
     * themselves: version-skew protection appends `dpl=<commit sha>` to every
     * optimized URL, so a deploy changes the src of every image on the site.
     * The docs warn there is no way to invalidate this cache and to keep the
     * TTL low - that warning is about setups where the same URL can come to
     * mean different bytes, which a per-deploy query param rules out.
     *
     * Kept as a literal expression rather than 2678400 so it is checkable.
     */
    minimumCacheTTL: 60 * 60 * 24 * 31,
  },

  /**
   * The documents `/internDoc` reads, which tracing cannot work out for itself.
   *
   * The tracer follows `import`s, and this route does not import a document -
   * it reads whatever `.md` files it finds under `docs/` at request time. So
   * nothing links them into the graph and standalone would ship without them:
   * the route would work in `next dev`, where the repo is simply on disk, and
   * list nothing at all in production. That is the failure this entry exists to
   * prevent, and it is invisible until somebody opens the page on the box.
   *
   * `.dockerignore` is the other half and neither is sufficient alone - it
   * decides what reaches the build context, and this decides what survives into
   * the runtime image. `docs/marketing` is excluded from the first, so the glob
   * here is already narrowed to about 600KB.
   */
  outputFileTracingIncludes: {
    '/internDoc': ['docs/**/*.md', 'README.md', 'AGENTS.md', 'PRODUCT.md', 'DESIGN.md', 'task.md'],
    '/internDoc/[...slug]': [
      'docs/**/*.md',
      'README.md',
      'AGENTS.md',
      'PRODUCT.md',
      'DESIGN.md',
      'task.md',
    ],
  },

  /**
   * The local network, refused out loud, so the browser stops asking.
   *
   * ---------------------------------------------------------------------------
   * What the prompt actually is
   * ---------------------------------------------------------------------------
   * Chrome's Local Network Access gate - "kxb.team wants to find and connect to
   * devices on your local network". It fires when a page in the public address
   * space reaches for a private or loopback one, and the reach it most often
   * means is not a `fetch`: it is WebRTC gathering *host* candidates, which are
   * the machine's own LAN addresses and are therefore a local-network probe in
   * everything but name. Any embed that fingerprints by enumerating local IPs
   * trips it, which is why it can appear on a page whose own code has no
   * `RTCPeerConnection` in it anywhere - and this app's does not: the only one
   * in the tree is `app/world/nearby/peer-link`, which nothing calls yet.
   *
   * A permissions policy is the mechanism the prompt is built on, so denying the
   * feature is not a workaround for it - it is the supported way to answer the
   * question once, in the response, for the document and every frame inside it.
   * Chrome then refuses quietly instead of asking a visitor to adjudicate a
   * capability the room has no use for.
   *
   * ---------------------------------------------------------------------------
   * The one thing this will collide with
   * ---------------------------------------------------------------------------
   * `world/nearby`, when it is wired. Play-over-a-hotspot is *entirely* host
   * candidates - `peer-link` builds its connection with `iceServers: []` on
   * purpose, so there is no STUN fallback to survive on - and this header is
   * precisely what would stop it gathering any. Wiring that feature means
   * carving its route out of the `source` below, not deleting the entry: the
   * lounge asking for the local network the moment somebody walks into it is
   * the behaviour being removed here, and a room that only asks when you press
   * "play nearby" is the shape worth landing on.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Permissions-Policy', value: 'local-network-access=()' }],
      },

      /**
       * The art packs, cached properly.
       *
       * Next serves everything under `public/` with `public, max-age=0`, which
       * means a returning visitor revalidates *every* file before it may use
       * the copy it already has. Walking into the lounge is around 160 requests
       * under `/xo`, so on a link with a 220ms round trip that is a wall of
       * conditional requests before the room is dressed - and it is why a second
       * visit is barely faster than the first, despite almost nothing coming
       * down the wire. Measured from Germany against kxb.team: a warm-cache load
       * moved 0.04MB and still took over ten seconds.
       *
       * These are the directories where that trade is simply wrong. They hold
       * fixed art - the Kenney block and peep packs, the block thumbnails, the
       * icon and brand files, the sound effects, the webfonts. None of it is
       * user content and none of it is generated per request.
       *
       * `stale-while-revalidate` rather than `immutable` because these files are
       * *stable*, not *versioned*: their URLs do not change when the bytes do
       * (only `/_next/image` gets a `dpl=` query appended per deploy), so an
       * immutable year would pin a replaced model on returning visitors with no
       * way to reach them. A month fresh with a year of background revalidation
       * keeps the common case at zero requests while still letting a changed
       * file propagate on its own.
       *
       * If a pack ever does need to change *now*, rename the file - the palette
       * in `src/domain/lounge/palette.ts` already has to be edited in step with
       * these filenames, and it documents that old ids must keep working.
       */
      {
        source: '/:dir(xo|tinyXO|thumbs|icons|brand|font|audio|enter)/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000, stale-while-revalidate=31536000',
          },
        ],
      },

      /**
       * The same trade for the xp art, which is the larger half of it: 4,459
       * glTF files under `public/xp`, against 1,394 under the world packs.
       *
       * Named as three directories rather than `/xp/:path*` because the fourth
       * one must not be here. `xp/xps` holds the level *documents* - 14 JSON
       * files that are authored and edited, and the one thing under `/xp` whose
       * bytes are expected to change under a URL that does not. A month of
       * freshness on those would mean shipping a fixed level and having players
       * keep the broken one. `packs`, `thumbs` and `shots` are art and stills:
       * they are added to, not rewritten.
       *
       * Nothing here is downloaded up front - 143MB of packs is what the server
       * *has*, not what a device fetches. An HTTP cache only ever keeps what was
       * actually requested, so a level costs a device the few models it really
       * loads (the lounge pulls 3 .glb and 20 .gltf), and costs it those once
       * instead of on every visit.
       *
       * Uploaded xp assets are already right and are not affected: they are
       * served by `api/xp/[xpId]/[...path]` straight from storage, keyed by
       * content hash, and a published one already answers `immutable` - see the
       * note there for why a draft deliberately answers `no-store` instead.
       */
      {
        source: '/xp/:dir(packs|thumbs|shots)/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000, stale-while-revalidate=31536000',
          },
        ],
      },
    ]
  },

  experimental: {
    /**
     * React's `<ViewTransition>`, which the workspace shell uses to hand the
     * middle column over on a navigation - see `t/[slug]/layout.tsx`.
     *
     * The browser's View Transitions API is what does the work, so a browser
     * without it simply swaps the content the way it always did. Nothing here
     * is load-bearing: the flag buys an animation, and its absence costs one.
     */
    viewTransition: true,
  },

  /**
   * The machine's own LAN addresses, plus anything named in `DEV_ORIGINS`.
   *
   * The env var is the escape hatch for the cases the interfaces cannot know
   * about: a tunnel, a container's host alias, a phone reaching this over
   * something other than the local network.
   */
  allowedDevOrigins: [
    ...lanOrigins(),
    ...(process.env.DEV_ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []),
  ],

  /**
   * Type checking and linting are the deploy script's job, not the build's.
   *
   * Both already run in `deploy.sh` - `tsc -p tsconfig.check.json --noEmit` and
   * `eslint`, before a single byte is synced - specifically so a mistake is
   * caught on a developer machine rather than minutes into a container build.
   * Leaving them on here means doing the same work twice, and the second time
   * is the expensive one: the Hetzner box has 2 cores, 3.7GB of RAM and no swap,
   * and `next build` spawns the TypeScript checker as a separate worker *after*
   * the compile has already taken its peak. That worker is what the OOM killer
   * reaches for, and it surfaces as `failed to execute bake: signal: killed`
   * with no mention of memory anywhere in the output.
   *
   * The tradeoff is real and worth stating: `./deploy.sh --skip-checks` now
   * deploys with nothing type-checking it at all. That flag was already a
   * "I know what I am doing" switch; it is a sharper one now.
   */
  typescript: { ignoreBuildErrors: true },

  /**
   * The dev indicator, out of the one corner the app cannot spare.
   *
   * Next parks it bottom-left by default, which is exactly where the workspace
   * rail's floating open/close button sits on a phone - `fixed bottom-4 left-4`
   * in src/app/t/[slug]/sidebar.tsx. The indicator is a shadow-DOM portal
   * painted above everything, so on a phone pointed at the dev server it eats
   * every tap on the one control that opens the navigation, and the rail looks
   * broken while behaving perfectly. It cost an afternoon to find; it is not
   * costing another.
   *
   * Top-left rather than either right-hand corner: bottom-right is the contact
   * and music dock, top-right is the scene mode panel, and the only thing in
   * the top-left is the coordinate readout - a display, not a control, so a
   * badge over it in development costs nothing.
   */
  devIndicators: { position: 'top-left' },

  /**
   * `@kxb/xp` ships TypeScript source, not built JavaScript.
   *
   * A workspace package would normally be compiled before the app that imports
   * it, which means a build step between editing the engine and seeing the
   * change - and the engine is the thing being iterated on hardest. Turbopack
   * compiles it in the same pass as `src/`, so it stays as immediate as a file
   * in the app while keeping the boundary a package boundary rather than a lint
   * rule.
   *
   * The trade is that the package cannot be `npm install`ed by a stranger as it
   * stands. That is fine and deliberate: it is private, and v2's export is where
   * it grows a build (docs/xp/creator.md §12).
   *
   * `@kxb/boxing` is here for the same reason and one more. It is a game built
   * on the engine, and it ships its own renderer - `src/play/`, which is React
   * and three and `'use client'`. A workspace package left out of this list is
   * not compiled, and the way that fails is quiet: the route serves, the page
   * renders its loading state, and nothing at all happens afterwards. No error,
   * no warning, no canvas. A missing entry here looks exactly like a hung
   * promise.
   */
  transpilePackages: ['@kxb/xp', '@kxb/boxing'],

  /**
   * Where the build goes, overridable per process.
   *
   * Two dev servers on one checkout share `.next`, and sharing it is what makes
   * the second one fight the first: same lock, same chunk names, same manifests
   * being rewritten underneath each other. Pointing one of them somewhere else
   * makes them independent, which is what `scripts/shoot-scenes.ts` needs - it
   * wants a server it can start and stop without disturbing the one somebody is
   * already working in.
   *
   * Unset everywhere else, so builds and normal `bun run dev` are unchanged.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  ...(stampSourceAttrs && {
    turbopack: {
      rules: {
        // The glob contains a `/`, so it matches on the project-relative path
        // rather than the bare filename - node_modules and anything outside
        // src/ never reaches Babel. `as` is omitted deliberately: the loader
        // hands back TSX, and leaving the extension alone keeps Turbopack's
        // normal TSX pipeline running on the result.
        './src/**/*.tsx': {
          condition: { all: ['development', { not: 'foreign' }] },
          loaders: [
            {
              loader: 'babel-loader',
              options: {
                // No preset, no config file. Babel parses TSX and prints TSX
                // back with one attribute added; every actual transform is
                // still SWC's job downstream.
                babelrc: false,
                configFile: false,
                sourceMaps: true,
                parserOpts: { plugins: ['typescript', 'jsx'] },
                plugins: [
                  [
                    path.join(process.cwd(), 'scripts/babel-plugin-source-attr.cjs'),
                    { root: process.cwd() },
                  ],
                ],
              },
            },
          ],
        },
      },
    },
  }),
}

export default nextConfig
