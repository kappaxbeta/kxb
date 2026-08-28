'use client'

import dynamic from 'next/dynamic'
import type { XpDocument } from '@kxb/xp'

/**
 * The editor, loaded only in the browser.
 *
 * `ssr: false` is not a workaround here, it is the truth: the editor is a WebGL
 * canvas and a `localStorage` draft, and neither exists on a server. Rendering
 * it there produces markup that is thrown away and replaced, and it forces the
 * draft to be read in an effect - which means one render with the file and a
 * second with the draft, a flash of the wrong world, and a React rule broken on
 * the way.
 *
 * Read in a state initialiser instead, once, in the only place it can be read.
 */
const Editor = dynamic(() => import('@/app/xp/_editor/editor').then((m) => m.Editor), {
  ssr: false,
  // The same height the editor itself takes - see `WindowChrome`. A loading
  // screen that is a hair taller than what replaces it is a page that scrolls
  // for a second and then does not, which reads as a jump.
  loading: () => (
    <div className="dark flex h-viewport-inset w-full items-center justify-center bg-neutral-950">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-600">
        opening
      </p>
    </div>
  ),
})

export function EditorClient({ id, document }: { id: string; document: XpDocument }) {
  return <Editor id={id} document={document} />
}
