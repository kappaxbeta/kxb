import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EditorClient } from '@/app/xp/_editor/shell/client'
import { SketchEditorClient } from '@/app/xp/_sketch/editor/client'
import { requireXpAccess } from '@/app/xp/gate'
import { describeProblems, parseXp } from '@kxb/xp'
import { builtinOverride, readBuiltinOverlays } from '@/domain/xps/builtins'
import { createClient } from '@/lib/supabase/server'

/**
 * Editing one XP.
 *
 * The document is read and parsed on the server, so a file that does not parse
 * is a page saying why rather than an editor holding something invalid. What
 * the editor then works on is the *parsed* document - defaults filled in,
 * unknown models already refused - which means every edit starts from something
 * the parser has already accepted.
 */

export const metadata: Metadata = {
  title: 'XP · Edit',
  robots: { index: false, follow: false },
}

const XPS = path.join(process.cwd(), 'public', 'xp', 'xps')

/** Only `[a-z0-9-]`, so an id cannot walk out of the directory it names. */
const safeId = (id: string) => (/^[a-z0-9][a-z0-9-]*$/.test(id) ? id : null)

export default async function EditXpPage({ params }: { params: Promise<{ id: string }> }) {
  await requireXpAccess()

  const { id } = await params
  const safe = safeId(id)
  if (!safe) notFound()

  /**
   * What an operator dropped in, when they have - so a second edit starts from
   * the last one rather than from whatever the image happens to hold. Without
   * this the round trip through `/ovaloffice/xps` silently loses a change every
   * other time it is made.
   */
  const override = builtinOverride(await readBuiltinOverlays(await createClient()), safe)

  let raw: unknown = override
  if (!raw) {
    try {
      raw = JSON.parse(await readFile(path.join(XPS, `${safe}.xp.json`), 'utf8'))
    } catch {
      notFound()
    }
  }

  const parsed = override ? { ok: true as const, document: override } : parseXp(raw)
  if (!parsed.ok) {
    return (
      <main className="dark min-h-dvh bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            XP · refused
          </p>
          <h1 className="mt-2 text-2xl font-medium">{safe}.xp.json cannot be edited</h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            It has to parse before it can be opened — an editor holding an invalid document is
            an editor that saves one.
          </p>
          <pre className="mt-6 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 font-mono text-[11px] leading-relaxed text-amber-300">
            {describeProblems(parsed.problems)}
          </pre>
        </div>
      </main>
    )
  }

  // A sketch opens in the project view - a 3D editor pointed at a document
  // with no world would be a stage with nothing on it and Save disabled.
  if (parsed.document.sketch) {
    return <SketchEditorClient id={safe} document={parsed.document} />
  }

  return <EditorClient id={safe} document={parsed.document} />
}
