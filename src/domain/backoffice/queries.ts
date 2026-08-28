import 'server-only'
import type { Client } from '@/es/store'
import type { BackofficeLevel } from '@/domain/backoffice/sections'

/**
 * Read side of the backoffice.
 *
 * Every function here takes an explicitly-named client so the call site says
 * which authority it is using. `admin` is the service role and bypasses RLS;
 * `supabase` is the caller's own session. Mixing them up is how an admin
 * surface quietly becomes a public one, so the parameter names carry it.
 */

export interface BackofficeUser {
  id: string
  email: string
  createdAt: string
  lastSignInAt: string | null
  /** Confirmed accounts have verified their address; the rest are half-signed-up. */
  confirmed: boolean
  /** Which sign-in methods are attached: password, google, apple… */
  providers: string[]
  /**
   * A guest, not an account.
   *
   * Guests enter through a share link and are signed in anonymously (see
   * `src/app/g/[token]/enter.ts`), so they are rows in `auth.users` like
   * everybody else - with no email, no password and an expiry. Counting them
   * as accounts made the headline number answer a question nobody asked: it
   * grew every time somebody clicked a link, and shrank again when the reaper
   * ran.
   *
   * Read from the verified `is_anonymous` flag rather than inferred from a
   * missing email, because "no email" is also what a half-finished OAuth
   * signup looks like.
   */
  anonymous: boolean
}

/**
 * Every account.
 *
 * `auth.users` is not exposed through PostgREST - it lives in the `auth` schema
 * and no policy can reach it - so this uses the admin API rather than a query.
 * That API pages at 1,000 per request, the same ceiling that silently truncated
 * the lounge, so this pages explicitly and stops on a short page.
 *
 * Searching happens here rather than in the database for the same reason: the
 * admin API has no `where`, so filtering has to be done on what it returns.
 * Fine for hundreds of accounts; at tens of thousands this wants a projection
 * of auth.users into the public schema instead.
 */
export async function listUsers(
  admin: Client,
  options: { search?: string; limit?: number } = {},
): Promise<BackofficeUser[]> {
  const { search = '', limit = 2000 } = options
  const needle = search.trim().toLowerCase()

  const users: BackofficeUser[] = []
  const perPage = 200

  for (let page = 1; users.length < limit; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })

    if (error) {
      throw new Error(`Failed to list users: ${error.message}`)
    }

    const batch = data?.users ?? []
    if (batch.length === 0) break

    for (const user of batch) {
      const email = user.email ?? ''
      // A guest has no email to match, so any search excludes them - which is
      // right: searching is how you find one person by address, and a guest
      // does not have one.
      if (needle && !email.toLowerCase().includes(needle)) continue

      users.push({
        id: user.id,
        email,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        confirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
        providers: (user.app_metadata?.providers as string[]) ?? [],
        anonymous: Boolean(user.is_anonymous),
      })
    }

    if (batch.length < perPage) break
  }

  return users
}

export interface BackofficeWorkspace {
  id: string
  slug: string
  name: string
  archived: boolean
  createdAt: string
  memberCount: number
  pendingInvitations: number
  ownerUsername: string | null
}

/**
 * Every workspace, with how many people are in it.
 *
 * Reads the `backoffice_workspaces` view, where the counts are computed by
 * Postgres. Counting in TypeScript would mean fetching every membership row in
 * the system - the exact shape of the bug that truncated the lounge world at
 * 1,000 rows and rendered it full of holes.
 */
export async function listWorkspaces(admin: Client): Promise<BackofficeWorkspace[]> {
  const { data, error } = await admin
    .from('backoffice_workspaces')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    throw new Error(`Failed to list spaces: ${error.message}`)
  }

  /**
   * Postgres cannot prove a view's columns are non-null, so the generated types
   * call every one of them nullable - and they are right to. The hand-written
   * types this replaced simply asserted they were not, which meant a workspace
   * with a missing row would have reached the UI as `undefined` rather than
   * being caught here.
   *
   * A row without an id is not a workspace, so it is dropped rather than
   * rendered as a blank line in an admin table.
   */
  return (data ?? [])
    .filter((row) => row.id !== null && row.slug !== null)
    .map((row) => ({
    id: row.id!,
    slug: row.slug!,
    name: row.name ?? '',
    archived: row.archived ?? false,
    createdAt: row.created_at ?? '',
    memberCount: Number(row.member_count ?? 0),
    pendingInvitations: Number(row.pending_invitations ?? 0),
    ownerUsername: row.owner_username,
  }))
}

export interface BackofficeAdmin {
  email: string
  note: string | null
  createdAt: string
}

/** Who can reach the backoffice. Read with the caller's session, so RLS applies. */
export async function listAdmins(supabase: Client): Promise<BackofficeAdmin[]> {
  const { data, error } = await supabase
    .from('backoffice_admins')
    .select('email, note, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to list admins: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    email: row.email,
    note: row.note,
    createdAt: row.created_at,
  }))
}

export interface SectionGrant {
  section: string
  level: BackofficeLevel
}

export interface BackofficePerson {
  email: string
  /** A superadmin reaches everything and manages the others; grants is empty. */
  superadmin: boolean
  note: string | null
  /** Scoped access, section by section. Empty for a superadmin. */
  grants: SectionGrant[]
  createdAt: string
}

/**
 * Everybody who can reach the backoffice, superadmins and scoped people alike.
 *
 * Two tables, one roster. `backoffice_admins` are the superadmins - all access,
 * and the note and date come from there; `backoffice_grants` are the scoped
 * people, folded to one row each with their sections listed. An address in both
 * is shown once, as a superadmin, because that is the stronger truth and the
 * grants beneath it change nothing about what they may do.
 *
 * Read with the caller's session so RLS applies - a scoped operator granted the
 * `admins` section for viewing sees the same roster, and a stranger sees an
 * empty one.
 */
export async function listBackofficePeople(supabase: Client): Promise<BackofficePerson[]> {
  const [admins, grants] = await Promise.all([
    supabase.from('backoffice_admins').select('email, note, created_at'),
    supabase.from('backoffice_grants').select('email, section, level, created_at'),
  ])

  if (admins.error) throw new Error(`Failed to list admins: ${admins.error.message}`)
  if (grants.error) throw new Error(`Failed to list grants: ${grants.error.message}`)

  const people = new Map<string, BackofficePerson>()

  for (const row of admins.data ?? []) {
    people.set(row.email, {
      email: row.email,
      superadmin: true,
      note: row.note,
      grants: [],
      createdAt: row.created_at,
    })
  }

  for (const row of grants.data ?? []) {
    const existing = people.get(row.email)
    // A superadmin who also carries explicit grants: the grants are redundant,
    // so they are not shown hanging off the superadmin row where they would
    // read as a limit on access that has none.
    if (existing?.superadmin) continue

    const person =
      existing ??
      (() => {
        const fresh: BackofficePerson = {
          email: row.email,
          superadmin: false,
          note: null,
          grants: [],
          createdAt: row.created_at,
        }
        people.set(row.email, fresh)
        return fresh
      })()

    person.grants.push({ section: row.section, level: row.level as BackofficeLevel })
    // The earliest grant is when this person first got any access.
    if (row.created_at < person.createdAt) person.createdAt = row.created_at
  }

  return [...people.values()].sort((a, b) => {
    // Superadmins first, then by address, so the roster reads as a hierarchy.
    if (a.superadmin !== b.superadmin) return a.superadmin ? -1 : 1
    return a.email.localeCompare(b.email)
  })
}

export interface BackofficeAccess {
  superadmin: boolean
  /** Section key → the level held, for the scoped case. All sections for a
   *  superadmin are implied by `superadmin`, not listed here. */
  sections: Record<string, BackofficeLevel>
}

/**
 * What the signed-in operator may see, for filtering the nav and the dashboard.
 *
 * One read rather than a question per section: the superadmin flag, and the
 * caller's own grant rows. The layout turns this into "which links to show";
 * the pages themselves still call `requireBackofficeSection`, because a nav that
 * hides a link is a courtesy and the gate on the page is the guard.
 */
export async function readBackofficeAccess(
  supabase: Client,
  email: string | null | undefined,
): Promise<BackofficeAccess> {
  const { data: superadmin, error } = await supabase.rpc('is_backoffice_admin')
  if (error) throw new Error(`Failed to read backoffice access: ${error.message}`)

  if (superadmin === true) return { superadmin: true, sections: {} }

  const needle = email?.toLowerCase() ?? ''
  if (!needle) return { superadmin: false, sections: {} }

  const { data, error: grantError } = await supabase
    .from('backoffice_grants')
    .select('section, level')
    .eq('email', needle)

  if (grantError) throw new Error(`Failed to read grants: ${grantError.message}`)

  const sections: Record<string, BackofficeLevel> = {}
  for (const row of data ?? []) sections[row.section] = row.level as BackofficeLevel

  return { superadmin: false, sections }
}
