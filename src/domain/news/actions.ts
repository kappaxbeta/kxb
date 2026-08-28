'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { type NewsInput, newsSchema } from '@/domain/news/links'
import { requireBackofficeSection } from '@/lib/backoffice'

/**
 * Writing the announcements.
 *
 * Every function here goes through `requireBackofficeSection`, which 404s a
 * non-admin rather than refusing them - the posture the rest of /ovaloffice
 * takes. The row-level policy says the same thing again underneath, so a hand
 * -made request that somehow reached the action still writes nothing.
 *
 * Written through the caller's own session client, not the service-role one.
 * The insert policy pins `author_id` to `auth.uid()`, and a service-role client
 * bypasses policies entirely - which would quietly turn the one column that
 * says who announced this into whatever the caller typed.
 */

export type NewsResult = { ok: true; id: string } | { ok: false; error: string }

const idSchema = z.uuid()

/**
 * Nothing here revalidates a space.
 *
 * A published announcement lands on every board in the product, and there is no
 * list of paths that covers "every space" - `/t/[slug]` is dynamic and rendered
 * per request anyway (`force-dynamic`), so the next person to open a board gets
 * the new row without being told to look. What does need refreshing is the
 * backoffice's own list, which is the one page that shows drafts.
 */
function refresh(): void {
  revalidatePath('/ovaloffice/news')
}

export async function saveNews(input: {
  /** The row being edited, or nothing for a new one. */
  id?: string | null
  news: NewsInput
}): Promise<NewsResult> {
  const parsed = newsSchema.safeParse(input.news)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details' }
  }

  const { supabase, user } = await requireBackofficeSection('news', 'write')

  const row = {
    headline: parsed.data.headline,
    body: parsed.data.body?.trim() ? parsed.data.body : null,
    image: parsed.data.image ?? null,
    // Through `JSON.parse(JSON.stringify(...))` so what lands in the jsonb
    // column is plain data rather than whatever zod handed back - the same care
    // `measure` takes with a scene document, for the same reason.
    links: JSON.parse(JSON.stringify(parsed.data.links)),
    tenant_id: parsed.data.tenantId ?? null,
    published: parsed.data.published,
  }

  if (input.id) {
    if (!idSchema.safeParse(input.id).success) return { ok: false, error: 'No such announcement' }

    const { data, error } = await supabase
      .from('platform_news')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', input.id)
      .select('id')
      .maybeSingle()

    if (error) return { ok: false, error: `Could not save that: ${error.message}` }
    if (!data) return { ok: false, error: 'No such announcement' }

    await recordBackofficeAction({
      actor: user,
      section: 'news',
      action: 'news.update',
      summary: `Edited the announcement "${row.headline}"${row.published ? ' (published)' : ' (draft)'}`,
      detail: { id: data.id, headline: row.headline, published: row.published },
    })

    refresh()
    return { ok: true, id: data.id }
  }

  const { data, error } = await supabase
    .from('platform_news')
    .insert({ ...row, author_id: user.id })
    .select('id')
    .single()

  if (error) return { ok: false, error: `Could not save that: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'news',
    action: 'news.create',
    summary: `Created the announcement "${row.headline}"${row.published ? ' (published)' : ' (draft)'}`,
    detail: { id: data.id, headline: row.headline, published: row.published },
  })

  refresh()
  return { ok: true, id: data.id }
}

/**
 * Take one down.
 *
 * A real delete rather than a flag, because `published` is already the flag:
 * unpublishing is how you recall something you still want, and deleting is for
 * the row you wrote by mistake. Two ways to hide the same thing would leave
 * nobody sure which one they were looking at.
 */
export async function deleteNews(id: string): Promise<NewsResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'No such announcement' }

  const { supabase, user } = await requireBackofficeSection('news', 'write')

  const { error } = await supabase.from('platform_news').delete().eq('id', id)
  if (error) return { ok: false, error: `Could not delete that: ${error.message}` }

  await recordBackofficeAction({
    actor: user,
    section: 'news',
    action: 'news.delete',
    summary: `Deleted an announcement`,
    detail: { id },
  })

  refresh()
  return { ok: true, id }
}
