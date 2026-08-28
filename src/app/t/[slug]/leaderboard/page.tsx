import type { Metadata } from 'next'
import Image from 'next/image'
import { streaksProjection } from '@/domain/streaks/projection'
import { type LeaderboardRow, readLeaderboard } from '@/domain/streaks/queries'
import { avatarShotUrl } from '@/domain/lounge/avatars'
import { avatarOf, readProfileAvatars } from '@/domain/profile/avatar-queries'
import { displayNameFrom, readUsernames } from '@/domain/profile/username-queries'
import { runProjection } from '@/es/projection'
import { requireTenant } from '@/lib/tenant'
import { workspaceDict } from '@/app/i18n/workspace'
import { readLocale } from '@/app/i18n/preference'
import { fill } from '@/app/i18n/fill'

/** The tab. `generateMetadata`, because a static export cannot be two languages. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: workspaceDict(await readLocale()).titles.streaks }
}

export const dynamic = 'force-dynamic'

/**
 * The streak leaderboard: who has shown up in this space, ranked by how many
 * days running.
 *
 * The app's first real ranking of people, and it is deliberately the gentle
 * kind. It ranks *turning up*, not winning - the number only ever goes up by
 * being here, there is nobody to beat to earn it, and a cold run is shown lapsed
 * rather than deleted. `battle_scores` refuses to rank wins for the same reason
 * this is happy to rank streaks: one changes how it feels to lose, the other
 * only rewards coming back.
 */
export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const context = await requireTenant(slug)
  const { supabase, tenant, user } = context

  // Catch the read model up first: a member who arrived a minute ago should be
  // on the board when somebody opens it, not one cron sweep later.
  await runProjection(supabase, streaksProjection, tenant.id)

  const rows = await readLeaderboard(supabase, tenant.id)

  // Names and animals for everyone on the board, each in one query rather than
  // one per row - the same batched read the dashboard roster makes.
  const t = workspaceDict(await readLocale()).streaks
  const userIds = rows.map((row) => row.userId)
  const [names, avatars] = await Promise.all([
    readUsernames(supabase, userIds),
    readProfileAvatars(supabase, userIds),
  ])

  return (
    <div className="mt-8 flex flex-col gap-6">
      <header className="border-b border-line/60 pb-5">
        <h1 className="font-pixel text-[clamp(1.35rem,4.6vw,2.25rem)] leading-[1.18] uppercase">
          {t.heading}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-ink-muted">
          {fill(t.body, { space: tenant.name })}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-line/60 bg-surface-raised/40 px-4 py-8 text-center text-sm text-ink-muted">
          {t.empty}
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((row, index) => (
            <Row
              key={row.userId}
              rank={index + 1}
              row={row}
              name={displayNameFrom(names, row.userId)}
              avatar={avatarOf(avatars, row.userId)}
              you={row.userId === user.id}
            />
          ))}
        </ol>
      )}
    </div>
  )
}

/**
 * One place on the board.
 *
 * The reader's own row is lit in the accent so their eye lands on it first -
 * "where am I" is the question a leaderboard is opened to answer. A lapsed run
 * keeps its rank and its best but reads in muted ink with its live count at
 * zero, so the board is honest that the streak has stopped without erasing that
 * it happened.
 */
function Row({
  rank,
  row,
  name,
  avatar,
  you,
}: {
  rank: number
  row: LeaderboardRow
  name: string
  avatar: string
  you: boolean
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
        you
          ? 'border-accent/60 bg-accent/10'
          : 'border-line/50 bg-surface-raised/30'
      }`}
    >
      {/* The place. Tabular so the column of numbers lines up however many
          digits each is. */}
      <span className="w-6 shrink-0 text-center font-pixel text-sm tabular-nums text-ink-muted">
        {rank}
      </span>

      <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line/70 bg-surface">
        <Image
          src={avatarShotUrl(avatar)}
          alt={name}
          fill
          sizes="36px"
          className="scale-110 object-contain p-0.5"
        />
      </span>

      <span className="min-w-0 flex-1 truncate text-sm text-ink" title={name}>
        {name}
        {you && <span className="ml-1.5 text-[11px] text-ink-muted">you</span>}
      </span>

      {/* The best-ever run, when it is taller than the live one - so a lapsed
          streak still shows what it reached, and a live one shows a target
          only once it has one worth naming. */}
      {row.longest > row.streak && (
        <span className="shrink-0 text-[11px] text-ink-muted tabular-nums">
          best {row.longest}
        </span>
      )}

      {/* The streak itself. Lit amber while alive; a hollow dash once cold, so a
          lapsed row reads as "was on a run" rather than "on zero". */}
      {row.alive ? (
        <span className="flex shrink-0 items-baseline gap-1">
          <Flame />
          <span className="font-pixel text-base leading-none tabular-nums text-amber-600">
            {row.streak}
          </span>
        </span>
      ) : (
        <span
          className="shrink-0 text-[11px] text-ink-muted"
          title={`Lapsed — last seen ${row.lastDay}`}
        >
          lapsed
        </span>
      )}
    </li>
  )
}

/** The lit flame, matching the dashboard badge's. */
function Flame() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={15}
      height={15}
      aria-hidden
      className="text-amber-600"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinejoin="round"
    >
      <path d="M8 1.6c.4 2.4 2.2 3.3 3.2 4.9a4.6 4.6 0 1 1-7.9 3.2c0-2 1.1-3 1.9-3.9.5 1 1.2 1.3 1.6 1.1C6 9.4 6.4 6.2 8 1.6Z" />
    </svg>
  )
}
