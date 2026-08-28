import 'server-only'
import type { User } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { Client } from '@/es/store'
import type { BackofficeLevel } from '@/domain/backoffice/sections'
import { backofficeSection } from '@/domain/backoffice/sections'
import { requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export interface BackofficeContext {
  user: User
  /** The caller's own session client. Subject to RLS like anyone else's. */
  supabase: Client
  /**
   * Service-role client, for the things RLS cannot reach.
   *
   * Listing every account means reading `auth.users`, which is not exposed to
   * PostgREST at all - no policy can grant it, so the admin API is the only
   * route. Handed out *only* after the gate below has confirmed the caller is
   * an admin, never before.
   */
  admin: Client
}

export interface BackofficeSectionContext extends BackofficeContext {
  /** The section this gate was for. */
  section: string
  /** The level the caller holds on it - 'write' for a superadmin, always. */
  level: BackofficeLevel
}

/**
 * Guard for /backoffice.
 *
 * The check runs as the signed-in user against `is_backoffice_admin()`, which
 * reads the email from the verified JWT. Nothing the request supplies takes
 * part in the decision.
 *
 * A non-admin gets notFound(), not a 403 - the same posture as workspaces. "You
 * are not an admin" is a fact worth not confirming to someone probing for an
 * admin surface.
 */
export async function requireBackofficeAdmin(): Promise<BackofficeContext> {
  const { user, supabase } = await requireUser()

  const { data, error } = await supabase.rpc('is_backoffice_admin')

  if (error) {
    throw new Error(`Failed to check backoffice access: ${error.message}`)
  }
  if (data !== true) {
    notFound()
  }

  return {
    user,
    supabase,
    admin: createAdminClient() as unknown as Client,
  }
}

/**
 * Guard for the backoffice as a whole - anybody with any access at all.
 *
 * The gate on the shared layout, where `requireBackofficeAdmin` used to stand.
 * A superadmin or anybody holding even one section grant passes; the layout
 * then asks `readBackofficeAccess` what to show, and each page re-gates itself
 * with `requireBackofficeSection`. Same `notFound()` posture as the rest.
 *
 * It still hands back the service-role `admin` client, which the layout uses
 * for the nav's badge counts - aggregate numbers, computed in trusted server
 * code, and shown only beside links the caller can already see.
 */
export async function requireBackofficeUser(): Promise<BackofficeContext> {
  const { user, supabase } = await requireUser()

  const { data, error } = await supabase.rpc('is_backoffice_user')

  if (error) {
    throw new Error(`Failed to check backoffice access: ${error.message}`)
  }
  if (data !== true) {
    notFound()
  }

  return {
    user,
    supabase,
    admin: createAdminClient() as unknown as Client,
  }
}

/**
 * Guard for one section of the backoffice, at a level.
 *
 * The finer sibling of `requireBackofficeAdmin`: a superadmin passes everything,
 * and everybody else passes exactly the sections they were granted, at exactly
 * the level they were granted. `backoffice_section_level` is the one authority -
 * SECURITY DEFINER, reading the JWT email - so a page and the RLS on the tables
 * it touches cannot disagree about what this person may do.
 *
 * `need` defaults to 'view', which is what a page wants; an action that changes
 * something passes 'write'. The failure is `notFound()`, not a 403, matching
 * `requireBackofficeAdmin` and the workspace gates: a section you may not see
 * should not confirm it exists.
 *
 * A `superadminOnly` section (managing people) can only ever be reached by a
 * superadmin, whatever the grants table says - the check is belt-and-braces
 * with the SQL, which never writes a grant to it, but it means a hand-inserted
 * row could not open that door either.
 */
export async function requireBackofficeSection(
  section: string,
  need: BackofficeLevel = 'view',
): Promise<BackofficeSectionContext> {
  const { user, supabase } = await requireUser()
  const registered = backofficeSection(section)

  // A superadmin-only section (managing people) asks a different question, and
  // asks it directly: not "what level do you hold" but "are you a superadmin".
  // That is the only answer that opens it, whatever a hand-inserted grant row
  // might otherwise say.
  if (registered?.superadminOnly) {
    const { data, error } = await supabase.rpc('is_backoffice_admin')
    if (error) throw new Error(`Failed to check backoffice access: ${error.message}`)
    if (data !== true) notFound()
    return { user, supabase, admin: createAdminClient() as unknown as Client, section, level: 'write' }
  }

  const { data: level, error } = await supabase.rpc('backoffice_section_level', {
    p_section: section,
  })
  if (error) throw new Error(`Failed to check backoffice access: ${error.message}`)

  const held = level === 'write' || level === 'view' ? level : null
  // 'view' is met by either level; 'write' only by 'write'.
  if (held === null || (need === 'write' && held !== 'write')) {
    notFound()
  }

  return {
    user,
    supabase,
    admin: createAdminClient() as unknown as Client,
    section,
    level: held,
  }
}


/**
 * The account id behind an email address, or a sentence saying why not.
 *
 * Paged through `listUsers` rather than queried, because `auth.users` is not
 * ours to select from - Supabase owns that schema and the admin API is the
 * supported door. Two hundred at a time, stopping at the first short page,
 * which is the last page.
 *
 * Case-insensitive on purpose: an operator typing an address from a support
 * thread is not going to match the capitalisation somebody signed up with, and
 * "no account with that address" for an account that plainly exists is the most
 * confusing possible refusal.
 */
export async function findAccountByEmail(
  admin: Client,
  email: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const needle = email.trim().toLowerCase()
  if (!needle) return { ok: false, error: 'Type an email address.' }

  const perPage = 200

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) return { ok: false, error: `Could not look up the account: ${error.message}` }

    const batch = data?.users ?? []
    const match = batch.find((one) => one.email?.toLowerCase() === needle)
    if (match) return { ok: true, id: match.id }
    if (batch.length < perPage) break
  }

  return { ok: false, error: `No account with the address ${email.trim()}.` }
}
