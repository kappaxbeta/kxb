import { NextResponse } from 'next/server'
import { readBuiltinDocument, readBuiltinOverlays, safeBuiltinId } from '@/domain/xps/builtins'
import { requireBackofficeSection } from '@/lib/backoffice'

/**
 * The document a level is actually serving, as a file to save.
 *
 * ---------------------------------------------------------------------------
 * Why this exists when the shipped one is already a static file
 * ---------------------------------------------------------------------------
 * `/xp/xps/<id>.xp.json` is served straight out of `public/`, and for a level
 * nobody has touched this route hands back exactly those bytes. The difference
 * is the overridden case: the static file is then *stale*, and an operator who
 * downloaded it, edited it and put it back would silently undo whatever the
 * last person put in. So the download reads through the overlay, the same way
 * the editor and the store do.
 *
 * Behind the section gate rather than open, unlike the static file. Not because
 * the bytes are secret - they are next door under `public/` - but because this
 * is a tool on an operator's page, and a URL that is only reachable from there
 * is one less thing to reason about the day a level *is* pulled for a reason.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { admin } = await requireBackofficeSection('xps')

  const id = safeBuiltinId((await params).id)
  if (!id) return new NextResponse('Not found', { status: 404 })

  const document = await readBuiltinDocument(id, await readBuiltinOverlays(admin))
  if (!document) return new NextResponse('Not found', { status: 404 })

  // Two-space JSON, matching what the editor's own Save writes, so a file that
  // goes out of here and comes back produces a diff about the level rather than
  // about whitespace.
  return new NextResponse(JSON.stringify(document, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${id}.xp.json"`,
      // Never cached: the whole point is that it follows the overlay.
      'cache-control': 'no-store',
    },
  })
}
