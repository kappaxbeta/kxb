'use server'

import { revalidatePath } from 'next/cache'
import { describeProblems, parseXp } from '@kxb/xp'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { readBuiltinOverlays, safeBuiltinId } from '@/domain/xps/builtins'
import { requireBackofficeSection } from '@/lib/backoffice'
import type { Json } from '@/lib/supabase/database.types'

/**
 * The three things an operator may say about a level we ship.
 *
 * List it or don't; put a document in over it; take that document back out.
 * Nothing here writes a file - the image is read-only in production and there
 * are two replicas of it, so a surface that wrote to `public/xp/xps/` would
 * work on a laptop, appear to work on one replica, and be gone at the next
 * deploy. `builtin_xps` is the overlay these write instead; see the migration
 * for why that is a table rather than a project row.
 *
 * ---------------------------------------------------------------------------
 * The overlay is live, and the repo is still the source
 * ---------------------------------------------------------------------------
 * Putting a document in here changes what players get *now*, and it does not
 * change what the next build ships. That is deliberate and it is the thing to
 * be honest about on the page: this is the fast path for a fix, not a substitute
 * for committing the file. `revertBuiltin` is what hands the level back to the
 * repo, and until somebody presses it a green deploy will not change what is
 * being served.
 */

export type BuiltinResult = { ok: true } | { ok: false; error: string }

/**
 * Everywhere a level we ship is listed or opened.
 *
 * All four, on every write, because the overlay decides what is on the store
 * shelf, what the battle picker offers, what the play rail draws and what the
 * level's own page says - and an operator who unlists something and then finds
 * it still on `/browse` has no way to tell a cache from a bug.
 *
 * `layout` on the space route because the rail is drawn by the layout rather
 * than the page, and a `page` revalidation leaves it holding the old shelf.
 */
function revalidateShelves(id: string): void {
  revalidatePath('/browse')
  revalidatePath(`/browse/xp/${id}`)
  revalidatePath('/ovaloffice/xps')
  revalidatePath('/t/[slug]', 'layout')
}

/** The id off a form, checked against the alphabet the table and routes share. */
function targetId(formData: FormData): string | null {
  return safeBuiltinId(String(formData.get('id') ?? ''))
}

/**
 * On the shelf, or off it.
 *
 * An upsert rather than an update, because the common case is a level that has
 * never been touched and therefore has no row - "no row" is what "shipped, and
 * listed" is spelled as, and the first thing anybody does here is disagree with
 * it. `document` is deliberately not in the update list: unlisting a level that
 * somebody has overridden must not throw the override away.
 */
export async function setBuiltinPublished(formData: FormData): Promise<BuiltinResult> {
  const { user, admin } = await requireBackofficeSection('xps', 'write')

  const id = targetId(formData)
  if (!id) return { ok: false, error: 'That is not a level id.' }

  const published = formData.get('published') === 'on' || formData.get('published') === 'true'

  const { error } = await admin
    .from('builtin_xps')
    .upsert(
      { id, published, updated_by: user.id, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    )

  if (error) return { ok: false, error: `Could not change that: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'xps',
    action: published ? 'builtin.publish' : 'builtin.unpublish',
    summary: `${published ? 'Listed' : 'Unlisted'} the level we ship: ${id}`,
    detail: { id, published },
  })

  revalidateShelves(id)
  return { ok: true }
}

/** How big a document may be, in bytes, before this refuses to hold it. */
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024

/**
 * Put a document in, live.
 *
 * The file is the one the editor hands back - `Save` on `/xp/<id>/edit` with no
 * host behind it is a download, and this is the other end of that trip. So the
 * two ends have to agree about which level is being edited, which is why a
 * mismatched `id` inside the document is a refusal rather than a rename: the id
 * is the level's address, it is what a room already pinned to it stores, and
 * quietly filing `kickabout.xp.json` under `mensch` would break both.
 *
 * `parseXp` runs before anything is written, and its problems are handed back
 * whole. The alternative - store it and let the store find out - is how an
 * invalid document reaches a page that has to render it.
 */
export async function uploadBuiltinDocument(formData: FormData): Promise<BuiltinResult> {
  const { user, admin } = await requireBackofficeSection('xps', 'write')

  const id = targetId(formData)
  if (!id) return { ok: false, error: 'That is not a level id.' }

  const file = formData.get('document')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose a .xp.json file first.' }
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      error: `That is ${Math.round((file.size / (1024 * 1024)) * 10) / 10} MB, and the limit here is ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.`,
    }
  }

  let raw: unknown
  try {
    raw = JSON.parse(await file.text())
  } catch {
    return { ok: false, error: 'That file is not JSON.' }
  }

  const parsed = parseXp(raw)
  if (!parsed.ok) {
    return { ok: false, error: `It does not parse:\n${describeProblems(parsed.problems)}` }
  }

  if (parsed.document.id !== id) {
    return {
      ok: false,
      error: `That document calls itself “${parsed.document.id}” and this row is “${id}”. Put it in against its own level, or change the id in the editor first.`,
    }
  }

  const { error } = await admin.from('builtin_xps').upsert(
    {
      id,
      // Stored as the *parsed* document rather than the bytes that arrived, so
      // what is served is what the parser accepted - defaults filled in, unknown
      // models already refused - and never a superset of it.
      document: parsed.document as unknown as Json,
      bytes: file.size,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (error) return { ok: false, error: `Could not put that in: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'xps',
    action: 'builtin.override',
    summary: `Put a new document in over the level we ship: ${id}`,
    detail: { id, bytes: file.size, name: parsed.document.name },
  })

  revalidateShelves(id)
  return { ok: true }
}

/**
 * Hand the level back to the repo.
 *
 * `document = null` rather than deleting the row, because the row may also be
 * holding an unlisted switch and dropping it would silently put the level back
 * on the shelf. Clearing the switch is the other button.
 *
 * For a level that was *added* here - one with no file behind it - this is the
 * only way to remove it, and it leaves a row with neither a document nor a file.
 * The list shows those, marked, so they can be seen and cleared.
 */
export async function revertBuiltin(formData: FormData): Promise<BuiltinResult> {
  const { user, admin } = await requireBackofficeSection('xps', 'write')

  const id = targetId(formData)
  if (!id) return { ok: false, error: 'That is not a level id.' }

  const { error } = await admin
    .from('builtin_xps')
    .update({ document: null, bytes: null, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { ok: false, error: `Could not put it back: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'xps',
    action: 'builtin.revert',
    summary: `Went back to the shipped document for ${id}`,
    detail: { id },
  })

  revalidateShelves(id)
  return { ok: true }
}

/**
 * Clear the row entirely - back to "whatever the image says", with nothing
 * remembered.
 *
 * Only offered for a row that is doing nothing: no document, and a level that
 * still ships. Read back rather than trusted from the form, because "delete the
 * row" is the one button here that can lose an override, and a stale page is
 * exactly the situation in which somebody would press it.
 */
export async function clearBuiltinOverlay(formData: FormData): Promise<BuiltinResult> {
  const { user, admin } = await requireBackofficeSection('xps', 'write')

  const id = targetId(formData)
  if (!id) return { ok: false, error: 'That is not a level id.' }

  const overlays = await readBuiltinOverlays(admin)
  const overlay = overlays.get(id)
  if (!overlay) return { ok: true }
  if (overlay.document) {
    return { ok: false, error: 'There is a document in here. Put the shipped one back first.' }
  }

  const { error } = await admin.from('builtin_xps').delete().eq('id', id)
  if (error) return { ok: false, error: `Could not clear that: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'xps',
    action: 'builtin.clear',
    summary: `Cleared the overlay row for ${id}`,
    detail: { id },
  })

  revalidateShelves(id)
  return { ok: true }
}
