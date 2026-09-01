'use server'

import { displayNameFrom, readUsernames } from '@/domain/profile/username-queries'
import { requireTenant } from '@/lib/tenant'

/**
 * What is in your purse, and who you could hand some of it to.
 *
 * ---------------------------------------------------------------------------
 * A server action rather than a prop
 * ---------------------------------------------------------------------------
 * The rail is a client component four levels below a page that already renders
 * a dozen things, and the purse is wanted in one corner of it. Threading a
 * balance down through the sidebar means every component on the way carries a
 * prop it does not read - and then a second one when the list of people
 * arrives.
 *
 * Read **once, on mount**. Never on a timer: `requireTenant` writes cookies, so
 * a polled server action re-renders the whole page around a live canvas - which
 * is the trap `polled-server-actions` exists to remember. A balance that
 * changes because *you* spent something is re-read by the thing that spent it;
 * a balance that changed because somebody paid you shows up next time the rail
 * opens, which is soon enough for a number nobody is watching.
 *
 * The people are the space's members, not the world's: paying somebody is a
 * fact about a workspace, and the person you want to pay may well be offline.
 */

export type PurseView = {
  coins: number
  /** Everybody else in the space, by id and whatever name they have. */
  people: { id: string; name: string }[]
}

export async function readPurse(
  slug: string,
): Promise<{ ok: true; purse: PurseView } | { ok: false; error: string }> {
  const { supabase, tenant, user } = await requireTenant(slug)

  /*
    The purse row directly, rather than `readHomestead`.

    That one wants a `place` and fetches the props and the ground standing in it
    - three queries to answer a question about one integer. Every other reader
    of this table does the same narrow select.
  */
  const { data: purse, error: purseError } = await supabase
    .from('homestead_read_model')
    .select('coins')
    .eq('tenant_id', tenant.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (purseError) return { ok: false, error: `Could not read your purse: ${purseError.message}` }

  const { data, error } = await supabase
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', tenant.id)
    .neq('user_id', user.id)
    .limit(200)

  if (error) return { ok: false, error: `Could not read the space: ${error.message}` }

  const rows = data ?? []
  // The same two-step every member list here uses: ids from the membership
  // table, names from the profile reader, which knows what to show for somebody
  // who has never set one.
  const names = await readUsernames(supabase, rows.map((row) => row.user_id))

  const people = rows
    .map((row) => ({ id: row.user_id, name: displayNameFrom(names, row.user_id) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    ok: true,
    purse: {
      // A member who has never opened a café has no row and no coins yet. Zero
      // rather than an error: they can still be paid, and the aggregate says so.
      coins: purse?.coins ?? 0,
      people,
    },
  }
}
