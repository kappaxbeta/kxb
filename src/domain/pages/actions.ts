'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { pagesDecider } from '@/domain/pages/aggregate'
import {
  createPageSchema,
  pageIdSchema,
  type PageCommand,
  updatePageContentSchema,
  updatePageStructureSchema,
} from '@/domain/pages/commands'
import { pagesProjection } from '@/domain/pages/projection'
import { hasRoomFor } from '@/domain/billing/quota'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import type { JsonValue } from '@/es/types'
import { requireTenant, writeBlockedReason } from '@/lib/tenant'

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

function toResult<T = void>(error: unknown): ActionResult<T> {
  if (error instanceof DomainError) {
    return { ok: false, error: error.message }
  }
  if (error instanceof ConcurrencyError) {
    return {
      ok: false,
      error: 'That page was modified elsewhere. Please try again.',
    }
  }
  throw error
}

/**
 * The refusal sentence when a space is holding all the pages it may, or null.
 *
 * Its own `requireTenant` rather than a value threaded out of `dispatch`,
 * because `createPage` is the only command that needs it and the shared path
 * should not grow a parameter for one caller. That costs a second context
 * resolution on the one action that creates something, which is the cheaper
 * side of the trade.
 */
async function pagesFull(slug: string): Promise<string | null> {
  const context = await requireTenant(slug)

  const { count, error } = await context.supabase
    .from('pages_read_model')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', context.tenant.id)
    // Deleted pages do not occupy a slot. `listPages` filters the same way, and
    // a cap that counted them would leave somebody unable to make a page
    // because of ones they had already thrown away.
    .eq('deleted', false)

  // Fails open, like everything else that counts against a cap: a broken count
  // must not be what stops somebody writing. See `quota.ts`.
  if (error) return null

  const { allowed, limit } = await hasRoomFor(
    context.supabase,
    context.tenant.id,
    context.tenant.tier,
    'pages',
    count ?? 0,
  )

  if (allowed) return null

  return limit === 1
    ? 'This plan includes one page. Upgrade to add more.'
    : `This space is using all ${limit} of its pages. Delete one, or upgrade for more.`
}

async function dispatch(
  slug: string,
  streamId: string,
  command: PageCommand,
): Promise<ActionResult<void>> {
  const context = await requireTenant(slug)
  const { user, supabase, tenant } = context

  const blocked = writeBlockedReason(context)
  if (blocked) {
    return { ok: false, error: blocked }
  }

  try {
    await executeCommand({
      supabase,
      decider: pagesDecider,
      tenantId: tenant.id,
      streamId,
      command,
      metadata: { actorId: user.id },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, pagesProjection, tenant.id)
  revalidatePath(`/t/${slug}/pages`)
  return { ok: true, data: undefined }
}

export async function createPage(
  slug: string,
  parentId: string | null = null,
  title = 'Untitled',
  position = 0,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createPageSchema.safeParse({ parentId, title, position })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid page input' }
  }

  /**
   * Room for one more page.
   *
   * Here rather than in `dispatch`, which every page command goes through:
   * editing, moving and deleting a page must keep working when a space is over
   * its cap, and a check in the shared path would stop all of them. A space
   * that dropped to free holding forty pages should be able to tidy up - the
   * same instinct as the shelving rules in `docs/product/pricing.md` §6.
   *
   * Not in the decider either, for the reason the room cap gives: a decider
   * folds one page's stream, and a cap is a fact about all of them.
   */
  const capped = await pagesFull(slug)
  if (capped) return { ok: false, error: capped }

  const id = randomUUID()
  const result = await dispatch(slug, id, {
    type: 'CreatePage',
    parentId: parsed.data.parentId ?? null,
    title: parsed.data.title,
    position: parsed.data.position ?? position,
  })

  if (!result.ok) return result
  return { ok: true, data: { id } }
}

export async function updatePageStructure(
  slug: string,
  id: string,
  parentId: string | null,
  title: string,
  position: number,
): Promise<ActionResult<void>> {
  const parsed = updatePageStructureSchema.safeParse({ id, parentId, title, position })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  return dispatch(slug, parsed.data.id, {
    type: 'UpdatePageStructure',
    parentId: parsed.data.parentId,
    title: parsed.data.title,
    position: parsed.data.position,
  })
}

export async function updatePageContent(
  slug: string,
  id: string,
  doc: JsonValue,
): Promise<ActionResult<void>> {
  const parsed = updatePageContentSchema.safeParse({ id, doc })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid document' }
  }

  return dispatch(slug, parsed.data.id, {
    type: 'UpdatePageContent',
    doc: parsed.data.doc,
  })
}

export async function deletePage(
  slug: string,
  id: string,
): Promise<ActionResult<void>> {
  const parsed = pageIdSchema.safeParse({ id })
  if (!parsed.success) return { ok: false, error: 'Invalid page id' }

  return dispatch(slug, parsed.data.id, { type: 'DeletePage' })
}

