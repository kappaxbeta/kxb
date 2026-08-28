'use client'

import { useState, useTransition } from 'react'
import {
  grantBackofficeAccess,
  revokeBackofficeAccess,
  revokeSectionGrant,
  setSectionGrant,
} from '@/domain/backoffice/actions'
import type { BackofficePerson } from '@/domain/backoffice/queries'
import { type BackofficeLevel, GRANTABLE_SECTIONS } from '@/domain/backoffice/sections'
import { Pager, TableToolbar, useTableView } from '@/app/ovaloffice/_table/table-view'

/**
 * Who can reach the backoffice, and how much of it.
 *
 * Two kinds of person share this list. A *superadmin* reaches everything and is
 * the only one who edits this page; a *scoped* person holds a level on named
 * sections and nothing else. The distinction is drawn once, at the top of each
 * card, because it changes what the rest of the card even means: a superadmin
 * has no per-section controls to show, because there is nothing to narrow.
 *
 * Access is keyed by email throughout - granted before somebody has ever signed
 * in, when the address exists and the account does not.
 */
export function PeopleRoles({
  people,
  currentEmail,
}: {
  people: BackofficePerson[]
  currentEmail: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const me = currentEmail.toLowerCase()

  // The address and its sections are what an operator scans for.
  const view = useTableView(people, (person) =>
    `${person.email} ${person.note ?? ''} ${person.grants.map((g) => g.section).join(' ')}`,
  )

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error ?? 'That did not work')
    })
  }

  async function addSuperadmin(formData: FormData) {
    const email = String(formData.get('email') ?? '').trim()
    if (!email) return
    setError(null)
    const result = await grantBackofficeAccess(email, String(formData.get('note') ?? ''))
    if (!result.ok) setError(result.error)
  }

  async function addScoped(formData: FormData) {
    const email = String(formData.get('email') ?? '').trim()
    const section = String(formData.get('section') ?? '')
    const level = String(formData.get('level') ?? 'view') as BackofficeLevel
    if (!email || !section) return
    setError(null)
    const result = await setSectionGrant(email, section, level)
    if (!result.ok) setError(result.error)
  }

  return (
    <section className="space-y-4">
      <div className="min-h-5">
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
      </div>

      <TableToolbar view={view} placeholder="Search by email or section…" unit="people" />

      <ul className="space-y-2">
        {view.pageRows.map((person) => (
          <li
            key={person.email}
            className="rounded-lg border border-border bg-secondary px-3 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">
                {person.email}
                {person.email === me && (
                  <span className="ml-2 text-xs text-muted-foreground">you</span>
                )}
              </span>
              {person.superadmin ? (
                <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[11px] text-accent">
                  Superadmin — full access
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  {person.grants.length} section{person.grants.length === 1 ? '' : 's'}
                </span>
              )}
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {new Date(person.createdAt).toLocaleDateString()}
              </span>
              {person.superadmin && (
                <button
                  type="button"
                  disabled={pending || person.email === me}
                  onClick={() => run(() => revokeBackofficeAccess(person.email))}
                  className="text-xs text-muted-foreground transition hover:text-red-500 disabled:opacity-40"
                >
                  Remove
                </button>
              )}
            </div>

            {!person.superadmin && (
              <PersonGrants person={person} pending={pending} run={run} />
            )}
          </li>
        ))}
      </ul>

      <Pager view={view} />

      {/* Adding somebody. Two doors: a scoped grant, which is the common one and
          creates the person by giving them their first section; and the
          superadmin path, kept visually quieter because it hands over
          everything at once. */}
      <div className="grid gap-4 rounded-lg border border-border p-3 sm:grid-cols-2">
        <form action={addScoped} className="space-y-2">
          <p className="text-xs font-medium">Give someone access to a section</p>
          <input
            name="email"
            type="email"
            required
            placeholder="person@example.com"
            autoComplete="off"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <select
              name="section"
              className="flex-1 rounded-lg border border-border bg-card px-2 py-2 text-sm"
            >
              {GRANTABLE_SECTIONS.map((section) => (
                <option key={section.key} value={section.key}>
                  {section.label}
                </option>
              ))}
            </select>
            <select
              name="level"
              defaultValue="view"
              className="rounded-lg border border-border bg-card px-2 py-2 text-sm"
            >
              <option value="view">View</option>
              <option value="write">Write</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-card disabled:opacity-50"
          >
            Grant
          </button>
        </form>

        <form action={addSuperadmin} className="space-y-2">
          <p className="text-xs font-medium">Make someone a superadmin</p>
          <input
            name="email"
            type="email"
            required
            placeholder="person@example.com"
            autoComplete="off"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            name="note"
            placeholder="Why (optional)"
            autoComplete="off"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-card disabled:opacity-50"
          >
            Make superadmin — full access
          </button>
        </form>
      </div>
    </section>
  )
}

/**
 * One scoped person's sections, each a three-way control.
 *
 * None / View / Write in a single select, because they are the three states of
 * one thing - how much of this section this person has - not three separate
 * switches. Choosing "none" is a revoke; the other two are an upsert. The
 * granted sections show first; the rest are reachable through the same select,
 * so adding a section and changing a level are the same gesture.
 */
function PersonGrants({
  person,
  pending,
  run,
}: {
  person: BackofficePerson
  pending: boolean
  run: (action: () => Promise<{ ok: boolean; error?: string }>) => void
}) {
  const held = new Map(person.grants.map((g) => [g.section, g.level]))

  function change(section: string, value: string) {
    if (value === 'none') {
      run(() => revokeSectionGrant(person.email, section))
    } else {
      run(() => setSectionGrant(person.email, section, value as BackofficeLevel))
    }
  }

  return (
    <div className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {GRANTABLE_SECTIONS.map((section) => {
        const level = held.get(section.key) ?? 'none'
        return (
          <label
            key={section.key}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className={level === 'none' ? 'text-muted-foreground' : 'text-foreground'}>
              {section.label}
            </span>
            <select
              value={level}
              disabled={pending}
              onChange={(event) => change(section.key, event.target.value)}
              className={`rounded border border-border bg-card px-1.5 py-1 text-xs disabled:opacity-50 ${
                level === 'none' ? 'text-muted-foreground' : ''
              }`}
            >
              <option value="none">None</option>
              <option value="view">View</option>
              <option value="write">Write</option>
            </select>
          </label>
        )
      })}
    </div>
  )
}
