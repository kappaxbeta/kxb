import 'server-only'
import { executeCommand } from '@/es/command'
import { tenantDecider } from '@/domain/tenants/aggregate'
import type { TenantCommand } from '@/domain/tenants/commands'
import { closeObstacles, type CloseObstacles } from '@/domain/account/obstacles'
import type { Client } from '@/es/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { env } from '@/lib/env'
import type { User } from '@supabase/supabase-js'

/**
 * Ending an account, in a system whose log is append-only.
 *
 * ===========================================================================
 * What "delete" has to mean here
 * ===========================================================================
 * The obvious implementation - `auth.admin.deleteUser` - is the wrong one, and
 * the reason is written down in 20261223000000. Every "who did this" column in
 * this schema points at `auth.users`, and thirty-odd read models are *derived
 * from event data* while also holding a foreign key to that table. Deleting the
 * row cascades those rows away; replaying the log then tries to write them back
 * and raises a foreign-key violation against an account that no longer exists,
 * which fails that projection permanently. That is not a hypothetical - it is
 * how the log ended up with holes in it, and it took a migration and a repair
 * function to get out of.
 *
 * So the account is ended the other way round: **everything that makes the row
 * a person is removed, and the row itself stays as an anonymous stub.** After
 * this runs there is no address, no password, no handle, no avatar, no
 * language, no identity to sign in with, and no way back in. What is left is a
 * uuid that some old event rows still point at, which is precisely the thing an
 * append-only log needs and precisely the thing nobody can be identified from.
 *
 * The user-facing promise is exactly that, and the settings copy says it in
 * words: the account is gone, and what you built stays where it is with your
 * name off it.
 *
 * ===========================================================================
 * The order, and why it is this order
 * ===========================================================================
 *   1. **The spaces.** Refuse outright if any space would be stranded (see
 *      `obstacles.ts`), then archive the ones nobody else is in and walk out of
 *      the rest. This is first because it is the only step that can fail for a
 *      reason the person can do something about, and a failure here must leave
 *      the account exactly as it was.
 *   2. **The rows that describe them** - handle, avatar, language. Deleted,
 *      not blanked: these are single-row tables keyed by user id, nothing
 *      replays them, and an absent row is already a state each of them handles.
 *   3. **The account.** Address released, password replaced with a secret
 *      nobody holds, metadata emptied, identities unlinked, sessions revoked,
 *      and finally banned so nothing can sign back in.
 *
 * The account is banned *last* on purpose. Every step before it is done with
 * the person's own credentials or on their behalf, and an account banned
 * halfway through would be an account that cannot finish closing itself.
 */

export type CloseResult =
  | { ok: true }
  | { ok: false; error: string; obstacles?: CloseObstacles }

/**
 * The address a closed account keeps.
 *
 * GoTrue insists on uniqueness, so this has to be per-account rather than a
 * single shared constant, and `.invalid` is the reserved TLD that guarantees it
 * can never be delivered to (RFC 2606). It is not a way of remembering the old
 * address - the old address is what this replaces, and it is gone.
 */
function tombstoneEmail(userId: string): string {
  return `closed-${userId}@account.invalid`
}

export async function closeAccount(
  supabase: Client,
  user: User,
): Promise<CloseResult> {
  /*
   * A guest has no account to close. `enterAsGuest` mints one per link and the
   * reaper collects it; offering somebody a button that ends a session they
   * were going to lose anyway is a promise about permanence that this is not.
   */
  if (user.is_anonymous) {
    return { ok: false, error: 'A visitor pass is not an account. Close the tab instead.' }
  }

  // ------------------------------------------------------------------ spaces
  const obstacles = await closeObstacles(supabase, user.id)
  if (obstacles.handOver.length > 0) {
    return {
      ok: false,
      error: 'Some spaces would be left with nobody to run them',
      obstacles,
    }
  }

  for (const space of obstacles.archiving) {
    const done = await runTenantCommand(supabase, space.slug, (tenantId) => ({
      tenantId,
      command: { type: 'ArchiveTenant' as const, actorId: user.id },
    }))
    if (!done.ok) return done
  }

  /*
   * Left, not archived: these have other people in them and are none of this
   * person's business any more. An archived space is a space taken away from
   * everybody still standing in it.
   */
  for (const space of obstacles.leaving) {
    const done = await runTenantCommand(supabase, space.slug, (tenantId) => ({
      tenantId,
      command: { type: 'LeaveTenant' as const, actorId: user.id },
    }))
    if (!done.ok) return done
  }

  // ------------------------------------------------------------- description
  const admin = createAdminClient()

  /*
   * Admin rather than the caller's own client, and not because of permissions -
   * they may delete all three of these themselves. It is because the next step
   * takes their session away, and a half-scrubbed account whose deletion failed
   * a policy check would be the worst of both. One key, one outcome.
   *
   * Failures are collected rather than thrown. Three tables that describe
   * somebody must not be able to keep an account alive between them; if one
   * refuses, the account is still closed and the stray row is a uuid pointing
   * at a stub.
   */
  await Promise.allSettled([
    admin.from('user_profiles').delete().eq('user_id', user.id),
    admin.from('profile_avatars').delete().eq('user_id', user.id),
    admin.from('profile_locales').delete().eq('user_id', user.id),
  ])

  // ----------------------------------------------------------------- account
  const { error: scrubbed } = await admin.auth.admin.updateUserById(user.id, {
    email: tombstoneEmail(user.id),
    // Confirmed, so GoTrue does not send a confirmation mail to an address that
    // cannot receive one - and so no "confirm your new address" link exists for
    // a closed account.
    email_confirm: true,
    /*
     * A password nobody has ever seen, rather than none at all. An account with
     * no password is one a magic link could still open; this closes that door
     * without relying on the ban alone to hold it.
     */
    password: crypto.randomUUID() + crypto.randomUUID(),
    user_metadata: {},
    app_metadata: { closed: true },
  })

  if (scrubbed) {
    return { ok: false, error: `Could not close the account: ${scrubbed.message}` }
  }

  /*
   * After the address and the password, never before them: GoTrue refuses to
   * unlink the last identity of an account that would be left with no way to
   * be addressed at all, and a Google-only account is exactly that until the
   * two lines above have run.
   */
  await unlinkIdentities(user.id)

  /*
   * Revoke every refresh token, then ban. The ban is what a sign-in attempt
   * meets; the sign-out is what closes the sessions already open on other
   * devices, which a ban on its own would leave running until their access
   * tokens expired.
   */
  await admin.auth.admin.signOut(user.id, 'global')

  const { error: banned } = await admin.auth.admin.updateUserById(user.id, {
    // A hundred years. GoTrue has no "forever", and a duration long enough to
    // outlive the product is the honest way to say one.
    ban_duration: '876000h',
  })

  if (banned) {
    return { ok: false, error: `Could not close the account: ${banned.message}` }
  }

  /*
   * The record of the deed, carrying no personal data at all - see the comment
   * on `closed_accounts`. Written after the account is actually closed, so the
   * table cannot claim something that did not happen, and ignored on failure:
   * a missing audit row is not a reason to tell somebody their account is still
   * open when it is not.
   */
  await admin.from('closed_accounts').upsert(
    {
      user_id: user.id,
      spaces_left: obstacles.leaving.length,
      spaces_archived: obstacles.archiving.length,
    },
    { onConflict: 'user_id' },
  )

  return { ok: true }
}

/**
 * One command against one space, by slug, with the caller's own client.
 *
 * Not `dispatch` from `tenants/actions.ts`: that one is a Server Action helper
 * that calls `requireTenant` (a redirect on refusal, which is not an outcome
 * this loop can handle) and revalidates paths for a browser that is about to be
 * signed out anyway. This wants the plain command and a returned failure.
 */
async function runTenantCommand(
  supabase: Client,
  slug: string,
  build: (tenantId: string) => { tenantId: string; command: TenantCommand },
): Promise<CloseResult> {
  const { data: found } = await supabase
    .from('tenant_slugs')
    .select('tenant_id')
    .eq('slug', slug)
    .maybeSingle()

  // Gone between the check and the act. Nothing to leave, so nothing to fail.
  if (!found) return { ok: true }

  const { tenantId, command } = build(found.tenant_id)

  try {
    await executeCommand({
      supabase,
      decider: tenantDecider,
      tenantId,
      streamId: tenantId,
      command,
      metadata: { actorId: command.actorId },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { ok: false, error: `Could not leave ${slug}: ${message}` }
  }

  return { ok: true }
}

/**
 * Unlink every sign-in provider from the account.
 *
 * The one thing here that supabase-js does not wrap, and the one thing that
 * cannot be skipped. Banning the row stops a Google sign-in from succeeding,
 * but it stops it by *matching* it: the identity still points at this account,
 * so somebody who closed their account and later signs up again with the same
 * Google address is handed the banned stub rather than a new account, and there
 * is nothing they can do about it. Releasing the address is only half the
 * promise if the identity keeps hold of the other half.
 *
 * GoTrue has an admin endpoint for it and always has; only the client library
 * is missing it, which is why this is a `fetch` rather than a method call.
 * Best-effort throughout - an account with a stubborn identity is still closed,
 * and the alternative is a closure that fails on a technicality.
 */
async function unlinkIdentities(userId: string): Promise<void> {
  const key = env.supabaseServiceRoleKey()
  const base = `${env.supabaseUrl()}/auth/v1/admin/users/${userId}`
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  try {
    const admin = createAdminClient()
    const { data } = await admin.auth.admin.getUserById(userId)
    const identities = data?.user?.identities ?? []

    await Promise.allSettled(
      identities.map((identity) =>
        fetch(`${base}/identities/${identity.identity_id}`, {
          method: 'DELETE',
          headers,
        }),
      ),
    )
  } catch {
    // Deliberately silent. See above: this is the belt, not the braces.
  }
}
