import Link from 'next/link'
import { ClearStore } from '@/app/t/[slug]/settings/space/clear-store'
import type { XpStoreLine } from '@/domain/xps/queries'
import { fill } from '@/app/i18n/fill'
import { settingsDict } from '@/app/i18n/settings'
import type { Locale } from '@/domain/i18n/locale'

/**
 * What this space is holding — its files, and what its games have kept.
 *
 * ---------------------------------------------------------------------------
 * Two figures that are usually confused for one
 * ---------------------------------------------------------------------------
 * The files are what the space *uploaded*: models, pictures, sound, the
 * documents themselves. That is the number the quota is about, and the one an
 * owner can do something about by deleting a project.
 *
 * The saves are what the games *wrote back* — docs/xp/state.md §7.5 Reading A.
 * Nobody uploaded them, they are tiny beside the files, and they are the half
 * an owner has no way of finding out about otherwise. They sit beside each
 * other because "how much of this space is mine and how much is somebody's
 * play" is one question asked twice.
 *
 * ---------------------------------------------------------------------------
 * The line this card does not cross
 * ---------------------------------------------------------------------------
 * §3.4 gives an XP's owner the game and not the people playing it, and the
 * space's owner is no different: sizes, counts and dates for everybody's
 * progress, field names only where the space can already read them — a `space`
 * row it owns, or a `shared` row every member can see anyway. A `player` row's
 * keys are never here, because "this game stores `lastMessage`" is a sentence
 * about somebody's play told to the person who may not read it.
 *
 * Presentational. Everything it needs was fetched by the page, which is also
 * where the owner gate is — `xp_store_overview` refuses everybody else anyway.
 */
export function StorageCard({
  slug,
  held,
  cap,
  lines,
  locale,
}: {
  slug: string
  /** Bytes of files this space holds, counted once per blob. */
  held: number
  /** What it may hold. */
  cap: number
  /** One per XP and scope, ordered by name — `storeOverview`. */
  lines: XpStoreLine[]
  /**
   * Resolved by the page. A server component, so it cannot read the shell's
   * context - and the dates below are formatted in it too, which matters more
   * than the words: a German sentence carrying an American date is one
   * somebody misreads by ten months.
   */
  locale: Locale
}) {
  const t = settingsDict(locale).storage

  const games = new Map<string, { name: string; lines: XpStoreLine[] }>()
  for (const line of lines) {
    const game = games.get(line.xpId) ?? { name: line.xpName, lines: [] }
    game.lines.push(line)
    games.set(line.xpId, game)
  }

  const saves = lines.reduce((sum, line) => sum + line.rows, 0)
  // The most recent write anywhere, which is the "is anything still happening
  // here" answer. `lastWrite` is a timestamptz string, so a string compare is
  // the same order as a date compare and cheaper than parsing every row.
  const last = lines.reduce<string | null>(
    (latest, line) => (latest === null || line.lastWrite > latest ? line.lastWrite : latest),
    null,
  )

  return (
    <section className="rounded-xl border border-line p-6 bg-surface-raised/40 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{t.title}</h2>
        <p className="mt-1 max-w-[62ch] text-sm text-ink-muted">{t.body}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Fact
          label={t.files}
          value={describeSize(held)}
          note={fill(t.ofCap, { cap: describeSize(cap) })}
        />
        <Fact
          label={t.saves}
          value={saves === 0 ? '—' : String(saves)}
          note={
            games.size === 0
              ? t.nothingStored
              : games.size === 1
                ? t.inOneGame
                : fill(t.acrossGames, { n: games.size })
          }
        />
        <Fact
          label={t.lastWritten}
          value={last === null ? '—' : new Date(last).toLocaleDateString(locale)}
          note={last === null ? t.neverWritten : t.byAGame}
        />
      </dl>

      {games.size > 0 && (
        <div className="space-y-4 border-t border-line/60 pt-4">
          {/*
            The limit said out loud rather than left to be inferred from a
            column that is empty for the rows that matter most. Somebody
            reading a byte count of a stranger's save should be told, on the
            same screen, that the count is all they get.
          */}
          <p className="max-w-[62ch] text-sm text-ink-muted">{t.note}</p>

          {[...games].map(([xpId, game]) => (
            <div key={xpId}>
              <h3 className="text-sm font-medium text-ink">
                <Link
                  href={`/t/${slug}/browse/${xpId}`}
                  className="transition hover:text-accent"
                >
                  {game.name}
                </Link>
              </h3>
              <dl className="mt-1 space-y-1">
                {game.lines.map((line) => (
                  <div key={line.scope} className="text-sm">
                    <dt className="text-xs font-medium uppercase tracking-[0.18em] text-ink-muted">
                      {t.scopes[line.scope] ?? line.scope}
                    </dt>
                    <dd className="tabular-nums">
                      {line.rows === 1 ? t.oneSave : fill(t.manySaves, { n: line.rows })} ·{' '}
                      {describeSize(line.bytes)} · {t.lastWrittenOn}{' '}
                      {new Date(line.lastWrite).toLocaleDateString(locale)}
                      {line.keys && line.keys.length > 0 && (
                        <span className="text-ink-muted"> · {line.keys.join(', ')}</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>

              {/*
                Under the figures rather than beside the heading, because the
                figures are what the decision is made from — how many saves,
                whose, and when anybody last played. A control at the top would
                be read before the sentence that says what it costs.
              */}
              <ClearStore
                slug={slug}
                xpId={xpId}
                spaceRows={rowsIn(game.lines, 'space')}
                playerRows={rowsIn(game.lines, 'player')}
                sharedRows={rowsIn(game.lines, 'shared')}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** How many rows one game keeps in one scope, or zero for a scope it has none of. */
function rowsIn(lines: XpStoreLine[], scope: XpStoreLine['scope']): number {
  return lines.find((line) => line.scope === scope)?.rows ?? 0
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-[0.18em] text-ink-muted">{label}</dt>
      <dd className="mt-1 text-lg tabular-nums text-ink">{value}</dd>
      <dd className="mt-0.5 text-xs leading-snug text-ink-muted">{note}</dd>
    </div>
  )
}

function describeSize(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} kB`
}
