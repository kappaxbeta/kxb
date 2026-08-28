'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import {
  BallMark,
  ChallengeMark,
  ChampionMark,
  DoorMark,
  SparkMark,
  TeamsMark,
} from '@/app/t/[slug]/battle/marks'
import { BattleSheet, Field } from '@/app/t/[slug]/battle/sheet'
import {
  DEFAULT_FOOTBALL_SETTINGS,
  MAX_SCORE_LIMIT,
  type BattleMode,
} from '@/domain/battle/events'
import type { BattlefieldView } from '@/domain/battlefields/queries'
import {
  cancelChallenge,
  createChallenge,
  respondToChallenge,
} from '@/domain/challenges/actions'
import type { ChallengeView } from '@/domain/challenges/queries'
import { battleDict } from '@/app/i18n/battle'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { useRefusal } from '@/app/i18n/use-refusal'
import { ErrorNote } from '@/app/components/error-note'

/**
 * The challenge board, as two doors and two lists.
 *
 * Same shape as the match hub (../battle-lobby.tsx). The page used to open with
 * the send form - up to nine controls once football was picked - above the one
 * thing on it that is ever urgent: somebody else's space waiting on an answer.
 * So the form went behind a fuchsia door and the invitations came up under a
 * cyan one, with the count and the pulse that the hub uses for live matches,
 * because an unanswered challenge is the same kind of "something is happening".
 */

/**
 * The four a challenge can be, in the order the picker draws them.
 *
 * Ids and marks, and no words: the label is `dict.modes[id]`, so the lobby, the
 * rail and this picker cannot end up calling one mode three different things.
 * Race is absent on purpose - a race between two spaces has no second side.
 */
const MODES: { id: BattleMode; icon: React.ReactNode }[] = [
  { id: 'team', icon: <TeamsMark /> },
  { id: 'ffa', icon: <SparkMark /> },
  { id: 'one_vs_all', icon: <ChampionMark /> },
  { id: 'football', icon: <BallMark /> },
]

/** The clocks on offer, matching the lobby's. Inside MIN/MAX_MATCH_MINUTES. */
const DURATIONS = [3, 5, 7, 10] as const

export function ChallengesPanel({
  slug,
  incoming,
  outgoing,
  arenas,
  hasPrivateArenas,
  canSend,
}: {
  slug: string
  incoming: ChallengeView[]
  outgoing: ChallengeView[]
  /** Only arenas already open to other spaces. */
  arenas: BattlefieldView[]
  hasPrivateArenas: boolean
  canSend: boolean
}) {
  const refusal = useRefusal()
  const dict = battleDict(useLocale())
  const t = dict.challengeBoard
  const f = dict.football
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [sending, setSending] = useState(false)
  const [target, setTarget] = useState('')
  const [mode, setMode] = useState<BattleMode>('team')
  const [worldId, setWorldId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const waiting = useRef<HTMLElement>(null)

  /**
   * Kept whatever the mode, and only *sent* for football.
   *
   * Same reasoning as the lobby's copy: somebody who sets a seven-minute clock,
   * looks at another mode and comes back should find their seven minutes still
   * there.
   */
  const [minutes, setMinutes] = useState<number>(
    DEFAULT_FOOTBALL_SETTINGS.durationMinutes,
  )
  /** Empty means no target, which is ordinary football. */
  const [scoreLimit, setScoreLimit] = useState('')
  const [damage, setDamage] = useState(DEFAULT_FOOTBALL_SETTINGS.damage)
  const [respawn, setRespawn] = useState(DEFAULT_FOOTBALL_SETTINGS.respawn)

  const isFootball = mode === 'football'
  const pendingIncoming = incoming.filter((challenge) => challenge.status === 'pending')
  const named = target.trim().length > 0
  const grounded = worldId !== ''

  function act(run: () => Promise<{ ok: boolean; error?: string; battleId?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await run()
      if (!result.ok) {
        setError(refusal(result.error ?? t.thatDidNotWork))
        return
      }
      // Accepting makes a match, and the match is where you want to be.
      if (result.battleId) router.push(`/t/${slug}/battle/${result.battleId}`)
      else router.refresh()
    })
  }

  function send() {
    const parsedLimit = Number.parseInt(scoreLimit, 10)
    act(() =>
      createChallenge(
        slug,
        target,
        mode,
        worldId,
        undefined,
        isFootball
          ? {
              durationMinutes: minutes,
              // Only when it is a number somebody actually typed. An empty
              // field is "no target", not "first to zero".
              ...(Number.isFinite(parsedLimit) && parsedLimit > 0
                ? { scoreLimit: parsedLimit }
                : {}),
              damage,
              respawn,
            }
          : undefined,
      ),
    )
  }

  return (
    <div className="space-y-10">
      <div className={`grid gap-4 ${canSend ? 'lg:grid-cols-[1.4fr_1fr]' : ''}`}>
        {canSend &&
          (arenas.length === 0 ? (
            <p className="rounded-2xl border border-line/50 bg-surface-raised/30 p-5 text-sm text-ink-muted sm:p-6">
              {hasPrivateArenas ? t.needOpenGround : t.needAGround}{' '}
              <Link
                href={`/t/${slug}/battle/battlefields`}
                className="text-ink underline decoration-accent/60 underline-offset-4 transition hover:text-accent"
              >
                {t.battlefields}
              </Link>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setSending(true)}
              className="summon-door group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-accent/60 bg-accent/10 p-5 text-left transition hover:border-accent sm:p-6"
            >
              <span
                aria-hidden
                className="summon-bob grid size-12 shrink-0 place-items-center rounded-xl border border-accent/60 text-accent"
              >
                <ChallengeMark />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-semibold">{t.challengeASpace}</span>
                <span className="mt-0.5 block text-sm text-ink-muted">{t.challengeBlurb}</span>
              </span>
              <span className="shrink-0 font-mono text-xs uppercase tracking-[0.2em] text-ink-muted transition group-hover:text-ink">
                {t.open}{' '}
                <span className="inline-block transition group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </button>
          ))}

        <div className="flex flex-col gap-3 rounded-2xl border border-accent-2/40 bg-accent-2/5 p-5 sm:p-6">
          <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-accent-2">
            <span
              aria-hidden
              className={`size-1.5 rounded-full bg-accent-2 ${
                pendingIncoming.length > 0 ? 'summon-live' : 'opacity-40'
              }`}
            />
            {pendingIncoming.length > 0
              ? fill(t.waitingCount, { n: pendingIncoming.length })
              : t.nothingWaiting}
          </p>
          <p className="text-sm text-ink-muted">
            {pendingIncoming.length > 0 ? t.someoneAsked : t.nobodyAsked}
          </p>
          {pendingIncoming.length > 0 && (
            <button
              type="button"
              onClick={() =>
                waiting.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="mt-auto flex items-center justify-center gap-2 rounded-xl border border-accent-2/60 px-4 py-3 text-sm font-medium text-accent-2 transition hover:bg-accent-2/10"
            >
              <DoorMark />
              {t.answerThem}
            </button>
          )}
        </div>
      </div>

      {!sending && <ErrorNote>{error}</ErrorNote>}

      <section ref={waiting} className="space-y-3 scroll-mt-6">
        <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted">
          {t.waitingOnYou}
        </h3>
        {pendingIncoming.length === 0 ? (
          <p className="text-sm text-ink-muted">{t.noneWaiting}</p>
        ) : (
          <ul className="space-y-3">
            {pendingIncoming.map((challenge) => (
              <li
                key={challenge.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded-xl border border-line/50 bg-surface-raised/30 px-4 py-3.5 transition hover:border-accent-2/60"
              >
                <span aria-hidden className="summon-live size-1.5 shrink-0 rounded-full bg-accent-2" />
                <span className="min-w-0 flex-1">
                  <span className="mr-2 font-semibold">
                    {challenge.otherSpaceName ?? t.anotherSpace}
                  </span>
                  <span className="font-mono text-xs text-ink-muted">
                    {dict.modes[challenge.mode]} · {challenge.arenaName ?? t.theirArena}
                  </span>
                  {challenge.message && (
                    <span className="mt-1 block text-xs italic text-ink-muted">
                      “{challenge.message}”
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => respondToChallenge(slug, challenge.id, true))}
                    className="rounded-full border border-accent-2/60 px-4 py-1.5 text-sm text-accent-2 transition hover:bg-accent-2/10 disabled:opacity-50"
                  >
                    {t.accept}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => respondToChallenge(slug, challenge.id, false))}
                    className="rounded-full px-3 py-1.5 text-sm text-ink-muted transition hover:text-ink disabled:opacity-50"
                  >
                    {t.decline}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section className="space-y-1">
          <h3 className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-muted">
            {t.sent}
          </h3>
          <ul>
            {outgoing.map((challenge) => (
              <li
                key={challenge.id}
                className="flex items-baseline justify-between gap-3 border-b border-line/25 py-3 last:border-0"
              >
                <span className="truncate">
                  {challenge.otherSpaceName ?? t.aSpace}{' '}
                  <span className="font-mono text-xs text-ink-muted">
                    {dict.modes[challenge.mode]}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3 font-mono text-xs text-ink-muted">
                  {challenge.status === 'accepted' && challenge.battleId ? (
                    <Link
                      href={`/t/${slug}/battle/${challenge.battleId}`}
                      className="text-accent-2 hover:underline"
                    >
                      {t.acceptedGo}
                    </Link>
                  ) : (
                    challenge.status
                  )}
                  {challenge.status === 'pending' && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(() => cancelChallenge(slug, challenge.id))}
                      className="underline transition hover:text-ink disabled:opacity-50"
                    >
                      withdraw
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sending && (
        <BattleSheet
          title={t.challengeASpace}
          subtitle={`${dict.modes[mode]} · ${
            arenas.find((arena) => arena.worldId === worldId)?.name ?? t.noGroundYet
          }`}
          mark={<ChallengeMark />}
          cta={pending ? t.sending : t.sendIt}
          hint={!named ? t.whoAreYouAsking : !grounded ? t.pickAGround : t.theyDecideNext}
          error={error}
          disabled={!named || !grounded}
          pending={pending}
          onSubmit={send}
          onClose={() => setSending(false)}
        >
          <Field label={t.theirAddress} htmlFor="challenge-target">
            <input
              id="challenge-target"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder={t.addressExample}
              autoFocus
              className="w-full rounded-xl border border-accent/40 bg-surface-raised/40 px-4 py-3 text-lg outline-none transition placeholder:text-ink-muted/60 focus:border-accent"
            />
          </Field>

          <Field label={t.mode}>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODES.map((option) => {
                const active = mode === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setMode(option.id)}
                    aria-pressed={active}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-accent bg-accent/15'
                        : 'border-line/60 hover:border-accent/60 hover:bg-surface-raised/50'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`grid size-9 shrink-0 place-items-center rounded-lg border ${
                        active ? 'border-accent text-accent' : 'border-line/60 text-ink-muted'
                      }`}
                    >
                      {option.icon}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {dict.modes[option.id]}
                    </span>
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label={t.foughtOn}>
            <div className="flex flex-wrap gap-2">
              {arenas.map((arena) => {
                const active = worldId === arena.worldId
                return (
                  <button
                    key={arena.worldId}
                    type="button"
                    onClick={() => setWorldId(arena.worldId)}
                    aria-pressed={active}
                    className={`rounded-lg border px-3 py-2 text-xs transition ${
                      active
                        ? 'border-accent bg-accent/15'
                        : 'border-line/60 hover:bg-surface-raised'
                    }`}
                  >
                    {arena.name}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {t.onlyOpenGrounds}
            </p>
          </Field>

          {/*
            Football's settings, asked here rather than when the challenge is
            accepted.

            A football match needs a clock before it can exist at all, so
            somebody has to answer this. Asking the challenger keeps the whole
            match in one description - the other space sees exactly what it is
            agreeing to - and means accepting stays a single button rather than
            a form. It also puts the "needs a clock" error in front of the
            person who can fix it: the decider raises it while the *accepting*
            space is hosting, which is far too late and on the wrong screen.
          */}
          {isFootball && (
            <div className="grid gap-6 rounded-xl border border-line/60 bg-surface-raised/30 p-4 sm:grid-cols-2">
              <div className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                  {fill(f.clock, { n: minutes })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {DURATIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setMinutes(option)}
                      aria-pressed={minutes === option}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        minutes === option
                          ? 'border-accent bg-accent/15'
                          : 'border-line/60 hover:bg-surface-raised'
                      }`}
                    >
                      {fill(f.minutes, { n: option })}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <label htmlFor="challenge-score-limit" className="text-xs text-ink-muted">
                    {f.firstTo}
                  </label>
                  <input
                    id="challenge-score-limit"
                    type="number"
                    min={1}
                    max={MAX_SCORE_LIMIT}
                    value={scoreLimit}
                    onChange={(event) => setScoreLimit(event.target.value)}
                    placeholder="—"
                    className="w-16 rounded-lg border border-line bg-surface px-2 py-1 text-xs"
                  />
                  <span className="text-[10px] text-ink-muted">
                    {f.goalsEndIt}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                  {f.extras}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Toggle on={damage} onClick={() => setDamage(!damage)} label={f.chargesHurt} />
                  <Toggle
                    on={respawn}
                    disabled={!damage}
                    onClick={() => setRespawn(!respawn)}
                    label={f.respawn}
                  />
                </div>
                <p className="text-xs leading-relaxed text-ink-muted">
                  {f.chargesNote}
                </p>
              </div>
            </div>
          )}
        </BattleSheet>
      )}
    </div>
  )
}

/** A rule that is on or off, as a chip rather than a checkbox. Same as the wizard's. */
function Toggle({
  on,
  label,
  onClick,
  disabled,
}: {
  on: boolean
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`rounded-full border px-4 py-2 text-sm transition disabled:opacity-40 ${
        on
          ? 'border-accent bg-accent text-surface'
          : 'border-line/60 text-ink-muted hover:bg-surface-raised'
      }`}
    >
      {label}
    </button>
  )
}
