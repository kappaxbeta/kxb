'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  archiveBattlefield,
  createBattlefield,
  setBattlefieldVisibility,
} from '@/domain/battlefields/actions'
import type { BattlefieldView } from '@/domain/battlefields/queries'
import { reportWorld } from '@/domain/moderation/actions'
import { battleDict } from '@/app/i18n/battle'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { useRefusal } from '@/app/i18n/use-refusal'
import { ErrorNote } from '@/app/components/error-note'

const CARD =
  'rounded-xl border border-line bg-surface-raised/40 p-4 transition hover:border-ink-muted/40'

export function BattlefieldsPanel({
  slug,
  mine,
  elsewhere,
  search,
  canManage,
}: {
  slug: string
  mine: BattlefieldView[]
  elsewhere: BattlefieldView[]
  search: string
  /** Owner or admin, and the space can still write. */
  canManage: boolean
}) {
  const refusal = useRefusal()
  const locale = useLocale()
  const t = battleDict(locale).fields
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [term, setTerm] = useState(search)
  const [error, setError] = useState<string | null>(null)

  function create(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createBattlefield(slug, name)
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      setName('')
      // Straight into the editor: a battlefield with no blocks in it is not
      // something anyone wants to look at in a list, and laying the floor is
      // the obvious next thing.
      router.push(`/t/${slug}/battle/battlefields/${result.worldId}/build`)
    })
  }

  function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await run()
      if (!result.ok) setError(refusal(result.error ?? battleDict(locale).fields.thatDidNotWork))
      else router.refresh()
    })
  }

  return (
    <div className="space-y-8">
      <ErrorNote>{error}</ErrorNote>

      {canManage && (
        <form onSubmit={create} className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.namePlaceholder}
            maxLength={60}
            className="min-w-56 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending || name.trim().length === 0}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? t.working : t.create}
          </button>
        </form>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-ink-muted">{t.yours}</h3>

        {mine.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {t.noneYet} {canManage ? t.nameOneAbove : t.adminCanCreate}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {mine.map((field) => (
              <li key={field.worldId} className={CARD}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{field.name}</p>
                    <p className="text-xs text-ink-muted">
                      {field.blockCount === 0
                        ? t.empty
                        : fill(t.blocks, {
                            // A count this page always has - `withBlockCounts`
                            // runs before it renders. `?` rather than a blank
                            // for the shape's other caller, which leaves it null.
                            n: field.blockCount?.toLocaleString(locale) ?? '?',
                          })}
                      {field.visibility === 'public' && ` · ${t.openToOtherSpaces}`}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Link
                    href={`/t/${slug}/battle/battlefields/${field.worldId}/build`}
                    className="rounded-lg border border-line px-2 py-1 hover:bg-surface-raised"
                  >
                    {t.build}
                  </Link>
                  {canManage && (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          act(() =>
                            setBattlefieldVisibility(
                              slug,
                              field.worldId,
                              field.visibility === 'public' ? 'space' : 'public',
                            ),
                          )
                        }
                        className="rounded-lg border border-line px-2 py-1 hover:bg-surface-raised disabled:opacity-50"
                      >
                        {field.visibility === 'public' ? t.makePrivate : t.openToOthers}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          // The blocks survive - archiving only takes it off
                          // the list - but saying so in a confirm would be
                          // longer than the reassurance is worth.
                          if (!confirm(fill(t.retireConfirm, { name: field.name }))) return
                          act(() => archiveBattlefield(slug, field.worldId))
                        }}
                        className="rounded-lg border border-red-400/40 px-2 py-1 text-red-300 hover:bg-red-500/15 disabled:opacity-50"
                      >
                        {t.retire}
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-ink-muted">{t.openToEveryone}</h3>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            // A GET-shaped search: the URL carries the term, so a result list
            // is linkable and the back button behaves.
            router.push(
              term.trim()
                ? `/t/${slug}/battle/battlefields?q=${encodeURIComponent(term.trim())}`
                : `/t/${slug}/battle/battlefields`,
            )
          }}
          className="flex gap-2"
        >
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t.searchPlaceholder}
            className="min-w-56 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-surface-raised"
          >
            {t.search}
          </button>
        </form>

        {elsewhere.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {search ? fill(t.nothingMatching, { term: search }) : t.noneOpened}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {elsewhere.map((field) => (
              <li key={field.worldId} className={CARD}>
                <p className="truncate font-medium">{field.name}</p>
                <p className="text-xs text-ink-muted">
                  {/* The arena is public; the space's name is not necessarily
                      readable, so it may genuinely be unknown here. */}
                  {field.spaceName
                    ? fill(t.fromSpace, { name: field.spaceName })
                    : t.fromAnotherSpace}
                </p>

                {/*
                  Anybody can report, not just admins. An arena opened to every
                  space is one you can be sent into, and needing a role to say
                  "this is not alright" would defeat the point.
                */}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const words = battleDict(locale).fields
                    const reason = prompt(fill(words.reportPrompt, { name: field.name }))
                    if (!reason) return
                    act(async () => {
                      const result = await reportWorld(slug, field.worldId, reason)
                      if (result.ok) alert(words.reportSent)
                      return result
                    })
                  }}
                  className="mt-3 text-xs text-ink-muted underline hover:text-ink disabled:opacity-50"
                >
                  {t.reportThis}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
