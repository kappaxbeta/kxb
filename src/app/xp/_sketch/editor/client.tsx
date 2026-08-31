'use client'

import dynamic from 'next/dynamic'
import type { XpDocument } from '@kxb/xp'

/**
 * The project view, loaded only in the browser.
 *
 * The same argument as `_editor/shell/client.tsx`, minus the WebGL: the
 * draft is `localStorage` read in a state initialiser, and the preview is an
 * iframe whose srcdoc is built around `location.origin` - neither exists on
 * a server, and rendering there would mean a flash of the file before the
 * draft replaces it.
 */
const SketchEditor = dynamic(
  () => import('@/app/xp/_sketch/editor/editor').then((m) => m.SketchEditor),
  {
    ssr: false,
    loading: () => (
      <div className="dark flex h-dvh w-full items-center justify-center bg-neutral-950">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-600">
          opening
        </p>
      </div>
    ),
  },
)

export function SketchEditorClient({ id, document }: { id: string; document: XpDocument }) {
  return <SketchEditor id={id} document={document} />
}
