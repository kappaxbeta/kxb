import { RenderBench } from './render-bench'

export const metadata = { title: 'Render bench', robots: { index: false, follow: false } }

/**
 * The bench a render worker drives.
 *
 * Unlike `/world/shots`, this is *not* `notFound()` in production - rendering
 * scenes on a server is the entire point of it, and the server it runs on is
 * production. What makes that safe is that the page has no authority and no
 * data: it is a canvas and a `window.draw` function, and it draws whatever the
 * caller hands it, in the caller's own browser, on the caller's own CPU. See
 * the long note in `render-bench.tsx`.
 *
 * `noindex` because a blank canvas is not a search result, not because there is
 * anything here to hide.
 */
export default function RenderPage() {
  return <RenderBench />
}
