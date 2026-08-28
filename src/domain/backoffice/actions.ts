'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { backofficeSection, GRANTABLE_SECTIONS } from '@/domain/backoffice/sections'
import { requireBackofficeAdmin } from '@/lib/backoffice'

/**
 * Granting and revoking backoffice access.
 *
 * Both run through `requireBackofficeAdmin`, so only an existing admin can
 * change the list - and RLS on `backoffice_admins` enforces the same thing
 * independently, because a Server Action is a public POST endpoint and the
 * guard in front of it is not the only thing that should be standing there.
 */

export type AdminResult = { ok: true } | { ok: false; error: string }

const emailSchema = z.email('Enter a valid email address').toLowerCase()

export async function grantBackofficeAccess(
  email: string,
  note: string,
): Promise<AdminResult> {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email' }
  }

  const { supabase, user } = await requireBackofficeAdmin()

  const { error } = await supabase.from('backoffice_admins').insert({
    email: parsed.data,
    granted_by: user.id,
    note: note.trim() || null,
  })

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'That address already has access' }
    }
    return { ok: false, error: `Could not grant access: ${error.message}` }
  }

  await recordBackofficeAction({
    actor: user,
    section: 'admins',
    action: 'superadmin.grant',
    summary: `Made ${parsed.data} a superadmin`,
    detail: { email: parsed.data, note: note.trim() || null },
  })

  revalidatePath('/ovaloffice')
  return { ok: true }
}

export async function revokeBackofficeAccess(email: string): Promise<AdminResult> {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { ok: false, error: 'Invalid email' }

  const { supabase, user } = await requireBackofficeAdmin()

  // Locking yourself out is a support ticket that needs a database console to
  // resolve, so it is refused rather than confirmed.
  if (parsed.data === user.email?.toLowerCase()) {
    return { ok: false, error: 'You cannot remove your own access' }
  }

  // And the list must never reach zero, or the only way back in is a migration.
  const { count, error: countError } = await supabase
    .from('backoffice_admins')
    .select('email', { count: 'exact', head: true })

  if (countError) {
    return { ok: false, error: `Could not check admins: ${countError.message}` }
  }
  if ((count ?? 0) <= 1) {
    return { ok: false, error: 'There must be at least one backoffice admin' }
  }

  const { error } = await supabase
    .from('backoffice_admins')
    .delete()
    .eq('email', parsed.data)

  if (error) {
    return { ok: false, error: `Could not revoke access: ${error.message}` }
  }

  await recordBackofficeAction({
    actor: user,
    section: 'admins',
    action: 'superadmin.revoke',
    summary: `Removed superadmin ${parsed.data}`,
    detail: { email: parsed.data },
  })

  revalidatePath('/ovaloffice')
  return { ok: true }
}

/**
 * Granting a scoped person one section at a level, or changing the level.
 *
 * An upsert, so setting `write` on a section already held at `view` is the same
 * call as granting it fresh - the roles page offers three states per section
 * (none, view, write) and this is how the middle two are written. Superadmin-
 * only from `requireBackofficeAdmin`, and the RLS on the table says the same:
 * handing out access is the superadmin's power, not something a `write` grant
 * on some section confers.
 *
 * A section that is not grantable - one the registry marks superadmin-only, or
 * one that does not exist - is refused here, so the table never holds a grant
 * the gate would ignore.
 */
export async function setSectionGrant(
  email: string,
  section: string,
  level: 'view' | 'write',
): Promise<AdminResult> {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email' }
  }

  const known = backofficeSection(section)
  if (!known || known.superadminOnly || !GRANTABLE_SECTIONS.includes(known)) {
    return { ok: false, error: 'That is not a section access can be granted to' }
  }
  if (level !== 'view' && level !== 'write') {
    return { ok: false, error: 'Level must be view or write' }
  }

  const { supabase, user } = await requireBackofficeAdmin()

  const { error } = await supabase.from('backoffice_grants').upsert(
    { email: parsed.data, section, level, granted_by: user.id },
    { onConflict: 'email,section' },
  )

  if (error) {
    return { ok: false, error: `Could not set the grant: ${error.message}` }
  }

  await recordBackofficeAction({
    actor: user,
    section: 'admins',
    action: 'grant.set',
    summary: `Granted ${parsed.data} ${level} on ${known.label}`,
    detail: { email: parsed.data, section, level },
  })

  revalidatePath('/ovaloffice')
  return { ok: true }
}

/**
 * Taking a section away from a scoped person.
 *
 * The third state of the roles page's per-section control - back to none. Not
 * usable against a superadmin, because they hold no grant rows to remove; the
 * way to narrow a superadmin is to revoke the superadmin and grant sections
 * back, which is a deliberate two steps rather than a silent demotion.
 */
export async function revokeSectionGrant(email: string, section: string): Promise<AdminResult> {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { ok: false, error: 'Invalid email' }

  const { supabase, user } = await requireBackofficeAdmin()

  const { error } = await supabase
    .from('backoffice_grants')
    .delete()
    .eq('email', parsed.data)
    .eq('section', section)

  if (error) {
    return { ok: false, error: `Could not revoke the grant: ${error.message}` }
  }

  await recordBackofficeAction({
    actor: user,
    section: 'admins',
    action: 'grant.revoke',
    summary: `Revoked ${parsed.data}'s access to ${backofficeSection(section)?.label ?? section}`,
    detail: { email: parsed.data, section },
  })

  revalidatePath('/ovaloffice')
  return { ok: true }
}
