'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import {
  BallMark,
  ChampionMark,
  CupMark,
  DoorMark,
  FlagMark,
  SparkMark,
  TeamsMark,
} from '@/app/t/[slug]/battle/marks'
import { BattleSheet, Field } from '@/app/t/[slug]/battle/sheet'
import type { BattleMode } from '@/domain/battle/events'
import type { BattlefieldView } from '@/domain/battlefields/queries'
import type { PlayableXp } from '@/domain/xps/playable'
import type { Sides } from '@kxb/xp'
import { createTournament } from '@/domain/tournament/actions'
import type { TournamentView } from '@/domain/tournament/queries'
import { battleDict, type BattleDict } from '@/app/i18n/battle'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { useRefusal } from '@/app/i18n/use-refusal'
import { ErrorNote } from '@/app/components/error-note'

/**
 * The bracket board, as two doors and two lists.
 *
 * Same shape as the match hub (../battle-lobby.tsx) and for the same reason:
 * this page used to open with the setup form - four controls, unfolded - above
 * a grid of cards that all looked alike whether the tournament was signing up,
 * running or finished a fortnight ago. So the form went behind a fuchsia door,
 * the running brackets came up under a cyan one, and everything already decided
 * dropped to a quiet list at the bottom.
 */

/**
 * Every mode a bracket can be fought in.
 *
 * `race` was the one missing, and nothing else was: `createTournament` already
 * wrote `race: DEFAULT_RACE_SETTINGS` when the mode was one, `playMatch`
 * already read it back and handed it to `createBattle`, and `MODE_LABELS`
 * below already had a word for it. The whole path was built and the only thing
 * standing in front of it was this array being four long - so the branch that
 * settles a bracket's race format has never once run.
 *
 * A head-to-head race is what a bracket makes of it: two entrants, no sides -
 * `sidesFor` gives a race none - and the first one home goes through.
 */
const MODES: { id: BattleMode; icon: React.ReactNode }[] = [
  { id: 'ffa', icon: <SparkMark /> },
  { id: 'team', icon: <TeamsMark /> },
  { id: 'one_vs_all', icon: <ChampionMark /> },
  { id: 'football', icon: <BallMark /> },
  { id: 'race', icon: <FlagMark /> },
]

const STATUS_WORDS: Record<TournamentView['status'], keyof BattleDict['bracket']['states']> =
  {
    open: 'signing',
    live: 'running',
    ended: 'finished',
    cancelled: 'calledOff',
  }

/**
 * What a level says it is, in the words the mode picker above uses.
 *
 * The same five words as `modes`, reached through a different spelling: `Sides`
 * writes the champion mode with hyphens and `BattleMode` with an underscore.
 * One table rather than two, so a level and a bracket cannot end up describing
 * the same fight differently.
 */
function sidesWord(sides: Sides, modes: BattleDict['modes']): string {
  return sides === 'one-vs-all' ? modes.one_vs_all : modes[sides]
}

export function TournamentsPanel({
  slug,
  tournaments,
  arenas,
  xps,
  canCreate,
}: {
  slug: string
  tournaments: TournamentView[]
  arenas: BattlefieldView[]
  /**
   * Levels this bracket could be fought inside. Empty when the space is not on
   * xp, which is what makes the fork absent rather than locked.
   */
  xps: PlayableXp[]
  canCreate: boolean
}) {
  const refusal = useRefusal()
  const dict = battleDict(useLocale())
  const t = dict.bracket
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [setting, setSetting] = useState(false)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<BattleMode>('ffa')
  const [worldId, setWorldId] = useState('')
  /**
   * The level this bracket is fought inside, or empty for an arena.
   *
   * One piece of state rather than a "which kind of ground" flag beside two
   * ids: the two are exclusive - the action refuses both - and a flag that can
   * disagree with the ids under it is a third thing to keep in step.
   */
  const [xpRef, setXpRef] = useState('')
  const chosenXp = xps.find((xp) => xp.ref === xpRef)
  const [error, setError] = useState<string | null>(null)
  const onNow = useRef<HTMLElement>(null)

  const running = tournaments.filter(
    (tournament) => tournament.status === 'open' || tournament.status === 'live',
  )
  const past = tournaments.filter(
    (tournament) => tournament.status === 'ended' || tournament.status === 'cancelled',
  )

  const named = name.trim().length > 0
  const grounded = worldId !== '' || xpRef !== ''

  function create() {
    setError(null)
    startTransition(async () => {
      /*
       * A level sends no mode of ours. The document's `rules` block is the
       * shape - `battleModeFor` reads it server-side, where the marks are - and
       * the argument stays `ffa` only because the signature wants one, exactly
       * as the match wizard's xp branch does.
       */
      const result = await createTournament(
        slug,
        name,
        xpRef ? 'ffa' : mode,
        worldId,
        xpRef || undefined,
      )
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      router.push(`/t/${slug}/battle/tournaments/${result.tournamentId}`)
    })
  }

  /** What the meta line calls the ground. Same fallback as the hub's. */
  function arenaName(tournament: TournamentView): string {
    /*
     * A bracket in a level is named by the level, and the fallback matters: a
     * space can fight a bracket in a level it later took down, and "an arena"
     * would then be a wrong word rather than a vague one.
     */
    if (tournament.xpId) {
      return xps.find((xp) => xp.ref === tournament.xpId)?.name ?? t.aLevel
    }
    return (
      arenas.find((arena) => arena.worldId === tournament.worldId)?.name ?? t.anArena
    )
  }

  // Either kind of ground will do now, which is what makes a space with no
  // arenas but a level of its own able to run a bracket at all.
  const canSetUp = canCreate && (arenas.length > 0 || xps.length > 0)

  return (
    <div className="space-y-10">
      <div className={`grid gap-4 ${canCreate ? 'lg:grid-cols-[1.4fr_1fr]' : ''}`}>
        {canCreate &&
          (arenas.length === 0 && xps.length === 0 ? (
            <p className="rounded-2xl border border-line/50 bg-surface-raised/30 p-5 text-sm text-ink-muted sm:p-6">
              {t.needsBattlefield}{' '}
              <Link
                href={`/t/${slug}/battle/battlefields`}
                className="text-ink underline decoration-accent/60 underline-offset-4 transition hover:text-accent"
              >
                {t.buildOne}
              </Link>
              .
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setSetting(true)}
              className="summon-door group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-accent/60 bg-accent/10 p-5 text-left transition hover:border-accent sm:p-6"
            >
              <span
                aria-hidden
                className="summon-bob grid size-12 shrink-0 place-items-center rounded-xl border border-accent/60 text-accent"
              >
                <CupMark />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-semibold">{t.setUp}</span>
                <span className="mt-0.5 block text-sm text-ink-muted">
                  {t.setUpBlurb}
                </span>
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
                running.length > 0 ? 'summon-live' : 'opacity-40'
              }`}
            />
            {running.length > 0
              ? fill(t.onTheBoardCount, { n: running.length })
              : t.nothingOnTheBoard}
          </p>
          <p className="text-sm text-ink-muted">
            {running.length > 0
              ? t.signUpWhileOpen
              : canSetUp
                ? t.noBracket
                : t.noBracketVisitor}
          </p>
          {running.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onNow.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="mt-auto flex items-center justify-center gap-2 rounded-xl border border-accent-2/60 px-4 py-3 text-sm font-medium text-accent-2 transition hover:bg-accent-2/10"
            >
              <DoorMark />
              {t.enterABracket}
            </button>
          )}
        </div>
      </div>

      <section ref={onNow} className="space-y-3 scroll-mt-6">
        <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted">
          {t.onTheBoard}
        </h3>
        {running.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {t.nothingRunning} {canSetUp ? t.setOneUpAbove : ''}
          </p>
        ) : (
          <ul className="space-y-3">
            {running.map((tournament) => (
              <li key={tournament.id}>
                <Link
                  href={`/t/${slug}/battle/tournaments/${tournament.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-line/50 bg-surface-raised/30 px-4 py-3.5 transition hover:border-accent-2/60 hover:bg-surface-raised/60"
                >
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 rounded-full bg-accent-2 ${
                      tournament.status === 'live' ? 'summon-live' : 'opacity-40'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="mr-2 font-semibold">{tournament.name}</span>
                    <span className="font-mono text-xs text-ink-muted">
                      {t.states[STATUS_WORDS[tournament.status]]} ·{' '}
                      {dict.modes[tournament.mode]} · {arenaName(tournament)} ·{' '}
                      {tournament.entrants}{' '}
                      {tournament.entrants === 1 ? t.entrantOne : t.entrantMany}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-accent-2/60 px-4 py-1.5 text-sm text-accent-2 transition group-hover:bg-accent-2/10">
                    {tournament.status === 'live' ? t.watch : t.enterIt}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-1">
          <h3 className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-muted">
            {t.lately}
          </h3>
          <ul>
            {past.map((tournament) => (
              <li
                key={tournament.id}
                className="flex items-baseline justify-between gap-3 border-b border-line/25 py-3 last:border-0"
              >
                <Link
                  href={`/t/${slug}/battle/tournaments/${tournament.id}`}
                  className="truncate hover:underline"
                >
                  {tournament.name}
                </Link>
                <span className="shrink-0 font-mono text-xs text-ink-muted">
                  {t.states[STATUS_WORDS[tournament.status]]} · {tournament.entrants}{' '}
                  {tournament.entrants === 1 ? t.entrantOne : t.entrantMany}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        The error lives on the sheet while the sheet is open, because that is
        where the controls that caused it are. A failure closes nothing.
      */}
      {!setting && <ErrorNote>{error}</ErrorNote>}

      {setting && (
        <BattleSheet
          title={t.setUp}
          subtitle={`${chosenXp ? t.levelsOwn : dict.modes[mode]} · ${
            chosenXp?.name ??
            arenas.find((arena) => arena.worldId === worldId)?.name ??
            t.noGroundYet
          }`}
          mark={<CupMark />}
          cta={pending ? t.settingUp : t.setItUp}
          hint={!named ? t.nameItFirst : !grounded ? t.pickAGround : t.openTheSignUps}
          error={error}
          disabled={!named || !grounded}
          pending={pending}
          onSubmit={create}
          onClose={() => setSetting(false)}
        >
          <Field label={t.nameTheTournament} htmlFor="tournament-name">
            <input
              id="tournament-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t.untitledCup}
              maxLength={60}
              autoFocus
              className="w-full rounded-xl border border-accent/40 bg-surface-raised/40 px-4 py-3 text-lg outline-none transition placeholder:text-ink-muted/60 focus:border-accent"
            />
          </Field>

          {/*
            The mode, only where there is still a question.

            Absent rather than disabled once a level is chosen, which is the
            same choice the match wizard makes and for the reason it gives: an
            XP is not a ground, it is the whole match - mode included - and a
            picker offering to overrule it would be offering something the
            server then ignores.
          */}
          {chosenXp ? (
            <Field label={t.mode}>
              <p className="rounded-xl border border-line/60 bg-surface-raised/40 px-4 py-3 text-sm text-ink-muted">
                <span className="text-ink">{chosenXp.name}</span> {t.bringsItsOwn}{' '}
                {chosenXp.sides
                  ? fill(t.itIs, { sides: sidesWord(chosenXp.sides, dict.modes) })
                  : t.sidesFromMarks}
              </p>
            </Field>
          ) : (
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
          )}

          <Field label={t.foughtOn}>
            <div className="flex flex-wrap gap-2">
              {arenas.map((arena) => {
                const active = worldId === arena.worldId
                return (
                  <button
                    key={arena.worldId}
                    type="button"
                    /* Exclusive: picking one clears the other, because the
                       action refuses a bracket that named both. */
                    onClick={() => {
                      setWorldId(arena.worldId)
                      setXpRef('')
                    }}
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

            {/*
              Levels, under the arenas rather than beside them: an arena is the
              ordinary answer and a level is the one that changes what the rest
              of this form asks. Absent entirely for a space with none, which is
              every space not on xp.
            */}
            {xps.length > 0 && (
              <div className="mt-4 border-t border-line/40 pt-3">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
                  {t.orALevel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {xps.map((xp) => {
                    const active = xpRef === xp.ref
                    return (
                      <button
                        key={xp.ref}
                        type="button"
                        onClick={() => {
                          setXpRef(active ? '' : xp.ref)
                          setWorldId('')
                        }}
                        aria-pressed={active}
                        className={`rounded-lg border px-3 py-2 text-xs transition ${
                          active
                            ? 'border-accent bg-accent/15'
                            : 'border-line/60 hover:bg-surface-raised'
                        }`}
                      >
                        {xp.name}
                        <span className="ml-1.5 font-mono text-[10px] text-ink-muted">
                          {xp.preset}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <p className="mt-2 text-xs text-ink-muted">
              {t.everyRoundHere}
            </p>
          </Field>
        </BattleSheet>
      )}
    </div>
  )
}
