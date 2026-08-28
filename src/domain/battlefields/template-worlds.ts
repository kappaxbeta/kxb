import 'server-only'
import { uuidv5 } from '@/lib/uuid'

/**
 * Where a space's copy of a catalogue template lives.
 *
 * Its own module rather than a function in ./actions.ts, because that file is
 * `'use server'` and every export of one must be an async server action - a
 * plain synchronous helper exported from there is a build error, not a style
 * choice.
 *
 * `server-only` because `uuidv5` needs node:crypto. Clients never need this:
 * they send a template id and are told the world id back.
 */

/**
 * Namespace for template-derived world ids. Its own, so a template world and a
 * lounge chunk stream can never hash to the same uuid.
 */
const TEMPLATE_WORLD_NAMESPACE = '4b1e0c93-2a7d-4f16-9c58-7ea3d0b5f281'

/**
 * The world id a space's copy of a template lives at.
 *
 * Derived, not stored, for the reason lib/uuid.ts gives: a lookup table whose
 * only job is remembering a value we could compute is a table that can be
 * missing a row. Deriving it is also what makes `ensureTemplateWorld`
 * idempotent by construction - calling it twice cannot produce two pitches -
 * and lets any caller that knows the tenant and the template name the world
 * without a query.
 */
export function templateWorldId(tenantId: string, templateId: string): string {
  return uuidv5(`${tenantId}:${templateId}`, TEMPLATE_WORLD_NAMESPACE)
}
