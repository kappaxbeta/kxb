'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { attempt } from '@/app/components/connection'
import { createBattle } from '@/domain/battle/actions'
import { takeInXp } from '@/domain/magazine/actions'
import { funnyMatchName } from '@/domain/battle/match-names'
import { defaultMatchRules, offerablePresets } from '@/domain/battle/xp-rules'
import { describePreset, type Capability, type Preset, type Finish } from '@kxb/xp'
import {
  type BattleMode,
  DEFAULT_FOOTBALL_SETTINGS,
  MAX_MATCH_MINUTES,
  MAX_PLAYERS,
  MAX_SCORE_LIMIT,
  MIN_MATCH_MINUTES,
  MIN_PLAYERS,
  type XpMatchRules,
} from '@/domain/battle/events'
import {
  ensureTemplateWorld,
  findPublishedWorlds,
  type PublishedWorld,
} from '@/domain/battlefields/actions'
import type { BattlefieldView } from '@/domain/battlefields/queries'
import {
  addWorldToSpace,
  type CatalogueWorld,
  findCatalogueWorlds,
} from '@/domain/worlds/actions'
import { tierPricePerMonth } from '@/domain/billing/tiers'
import {
  DEFAULT_TEMPLATE_ID,
  WORLD_TEMPLATES,
  type WorldTemplateId,
} from '@/domain/lounge/templates'
import { templateMark } from '@/app/world/lounge/_canvas/template-marks'
import {
  BallMark,
  ChampionMark,
  FlagMark,
  MeleeMark,
  SparkMark,
  TeamsMark,
} from '@/app/t/[slug]/battle/marks'
import { battleDict, type BattleDict } from '@/app/i18n/battle'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { worldDict, type WorldDict } from '@/app/i18n/world'
import { DEFAULT_WORLD_SIZE } from '@/domain/lounge/events'
import { xpDict } from '@/app/i18n/xp'
import { useRefusal } from '@/app/i18n/use-refusal'
import { ErrorNote } from '@/app/components/error-note'
import { XpPicker } from '@/app/t/[slug]/battle/xp-picker'
import {
  canLeave,
  furthest,
  type Kind,
  stepAt,
  stepsFor,
} from '@/app/t/[slug]/battle/summon-steps'

/**
 * Setting a match up, four questions at a time.
 *
 * The same three decisions the old inline form asked for - mode, ground, rules -
 * plus the roster it never showed, but asked one screen at a time instead of all
 * at once. What changed is not the domain call at the end (it is byte for byte
 * the one the form made) but who the page is for: the hub's job is now getting
 * somebody into a running match, and the eight controls it used to open with
 * were in the way of that for everybody who only wanted to join one.
 *
 * The steps are also tabs. Anything already answered can be clicked back to, so
 * changing your mind about the mode on the last screen costs one click rather
 * than three Backs - and the strip doubles as the progress readout, which is why
 * there is no separate one.
 */

/**
 * The five, in the order the picker draws them.
 *
 * Ids and marks. The name is `dict.modes[id]` and the line under it is
 * `dict.wizard.modeBlurbs[id]`, so the wizard, the lobby, the challenge picker
 * and the rail cannot end up calling one mode four different things.
 */
const MODES: { id: BattleMode; icon: React.ReactNode }[] = [
  { id: 'ffa', icon: <SparkMark /> },
  { id: 'team', icon: <TeamsMark /> },
  { id: 'one_vs_all', icon: <ChampionMark /> },
  { id: 'football', icon: <BallMark /> },
  { id: 'race', icon: <FlagMark /> },
]

/** The clock lengths offered. The decider accepts anything in this range. */
const DURATIONS = [3, 5, 7, 10] as const

/**
 * An XP, as far as the wizard needs to know about one.
 *
 * Carries the document's own rules, not just its name, because the xp branch
 * shows them instead of asking for them - see `listPlayableXps`.
 */
export interface XpChoice {
  /**
   * What gets written down, and not always a filename.
   *
   * Called `ref` rather than `id` since the list stopped being a directory
   * listing: it is either a document we ship or a version of a project in this
   * space, spelled by `domain/xps/ref.ts`. The wizard never takes it apart -
   * it passes it to `createBattle`, which is the whole point of there being one
   * spelling for both.
   */
  ref: string
  name: string
  blurb: string | null
  /**
   * The level's own picture, or null for one nobody has photographed.
   *
   * Carried because the picker draws cartridges rather than cards, and a
   * cartridge with nothing in its sticker well is a cartridge nobody can pick
   * out of a shelf of eight. Resolved server-side by `domain/xps/covers.ts`.
   */
  cover: string | null
  /**
   * What the level says its cartridge is made of, or null for "it never said".
   *
   * Straight off `PlayableXp` - this list is built by spreading one - so the
   * wizard's shelf shows the same shell the store and the workbench do. Which
   * is the whole point of the field being on the document rather than on a
   * surface.
   */
  finish: Finish | null
  /** The shell's colour, when the level named one. Null lets the shelf derive it. */
  hue: number | null
  /**
   * Where it came from, for the badge on the card.
   *
   * The list is now three lists deep and they mean different things to a host:
   * ours are finished, the space's may be half-built, and the store's belong to
   * somebody else. A card that does not say which is a card that makes "why is
   * this level empty" an unanswerable question.
   */
  source: 'builtin' | 'space' | 'store'
  /**
   * Is it on this space's shelf?
   *
   * Orthogonal to `source`, which is why it is a second field rather than a
   * fourth source: a shelved level may be one of ours, one this space saved, or
   * one it took in from the store. The magazine is a question about *this
   * space*, and the source is a question about where the level came from.
   */
  shelved: boolean
  /** Unpublished — this space's own work in progress. Only ever true for `space`. */
  draft: boolean
  /** freestyle | deathmatch | football | parkour | shooter, from the document. */
  preset: Preset
  scoreLimit: number | null
  /** Seconds, from the document. Not the minutes the xo wizard deals in. */
  timeLimit: number | null
  /**
   * How many people the level says it is for, both halves resolved.
   *
   * Carried so the config step can open on it rather than on a guess - and
   * because `min` is what the ready gate refuses to kick off below, which is a
   * number a host is entitled to see before they invite anybody.
   */
  players: { min: number; max: number }
  capabilities: Capability[]
}

/**
 * Which of the two products this match is.
 *
 * `xo` is the built-in games on a ground the host picks. `xp` is a level
 * somebody made, which brings its own rules with it.
 */

/**
 * The steps, per kind.
 *
 * Two lists rather than one with a skipped step, and that is the whole shape of
 * this change. The xo path is byte for byte what it was - mode, ground, rules,
 * roster - because an xo host is inventing a match and needs all four
 * questions. The xp path asks two, because an XP has already answered the other
 * two: the level *is* the ground, and its `rules` block *is* the mode. A shared
 * list with conditional steps would have meant every one of the four screens
 * growing a branch for a case it has no reason to know about.
 */

/**
 * Where a match is fought, before it is a world id.
 *
 * A template is not a world yet - it is a recipe the space may or may not have
 * stood up (see `ensureTemplateWorld`). So the choice is kept as one of three
 * kinds and only resolved to an id at submit, which is also the only moment at
 * which laying a couple of thousand blocks is worth doing.
 */
/*
 * There used to be a fourth kind here, `xp`, on the argument that the question
 * is the same one - where is this fought. It is not, and that was the bug the
 * fork fixes: the other three are grounds that the host then puts a mode and a
 * clock on top of, and an XP is the mode and the clock as well. It now lives on
 * its own branch of the wizard, in `xpId`, and this union is back to being
 * three answers to one question.
 */
export type Where =
  /* The id is the union rather than `string`, so the ground's own words can be
     looked up without a fallback that would never fire. */
  | { kind: 'template'; id: WorldTemplateId }
  | { kind: 'arena'; worldId: string; name: string }
  | { kind: 'lounge' }

/**
 * Football on the pitch, by default, for everybody.
 *
 * The old default was "the lounge", which is whatever the space happens to have
 * built - usually a flat floor with no goals in it, so the first football match
 * anybody set up was unplayable and the fix was three pages away. A named
 * ground that is guaranteed to have a goal at each end is the better default,
 * and it is the same one every space gets.
 */
const DEFAULT_WHERE: Where = { kind: 'template', id: DEFAULT_TEMPLATE_ID }

function sameWhere(a: Where, b: Where): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'template' && b.kind === 'template') return a.id === b.id
  if (a.kind === 'arena' && b.kind === 'arena') return a.worldId === b.worldId
  return true
}

/** The short name the header strip and the recap call the ground. */
function whereName(where: Where, t: BattleDict['wizard'], world: WorldDict): string {
  if (where.kind === 'lounge') return t.theLounge.toLowerCase()
  // An arena's own name is never translated - it is what somebody called it.
  if (where.kind === 'arena') return where.name
  return world.picker.templates[where.id]?.name ?? t.aGround
}

/** One line under the picker saying what was chosen and what it means. */
function describe(
  where: Where,
  arenas: BattlefieldView[],
  t: BattleDict['wizard'],
  world: WorldDict,
): string {
  if (where.kind === 'lounge') return t.loungeNote
  if (where.kind === 'arena') {
    const mine = arenas.some((arena) => arena.worldId === where.worldId)
    return fill(mine ? t.yourArena : t.fromAnotherSpace, { name: where.name })
  }
  /*
    The grounds' own sentences, which the block picker in the lounge already
    keeps a translation of - see `world.picker.templates`. One table for the
    same seven grounds, whichever surface offers them.
  */
  return world.picker.templates[where.id]?.blurb ?? t.standardGround
}

export function SummonWizard({
  slug,
  arenas,
  xps,
  hidden = 0,
  placeFree,
  xpOffered,
  xpOnSale,
  onClose,
}: {
  slug: string
  arenas: BattlefieldView[]
  /**
   * The XPs this space may fight inside, or an empty list when it may not.
   *
   * Empty covers two different noes - the operator has not shipped XPs here,
   * and this space is on xo - and deliberately does not distinguish them. That
   * is `xpOffered`'s job, because only one of the two is worth saying out loud.
   */
  xps: XpChoice[]
  /** Projects the picker's cap left out, so the list can say so. */
  hidden?: number
  /**
   * Is there an XP place free?
   *
   * Only the store half reads it. Taking a level in is free and unlimited on
   * every tier; putting one out is the metered act, and a store card that
   * offered "play" while the places were full would be a button whose refusal
   * arrives after the wizard has finished.
   */
  placeFree: boolean
  /**
   * Should the xp card be shown at all, locked or not?
   *
   * True when the installation has XPs but this space's plan does not include
   * them: the card appears with a price on it, because that is a no the reader
   * can do something about. False when the feature is simply not here, and then
   * the whole first step collapses - a wizard that opens by asking a question
   * with one answer is a wizard wasting a click.
   */
  xpOffered: boolean
  /** Whether the xp plan can be bought yet, for the locked card's wording. */
  xpOnSale: boolean
  onClose: () => void
}) {
  const refusal = useRefusal()
  const locale = useLocale()
  const dict = battleDict(locale)
  const presetWords = xpDict(locale).presets
  const t = dict.wizard
  const f = dict.football
  /* The seven grounds' names and blurbs are the block picker's table. */
  const world = worldDict(useLocale())
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [kind, setKind] = useState<Kind>('xo')
  const [at, setAt] = useState(0)
  /**
   * The furthest step answered, so the strip knows which tabs are live.
   *
   * Tracked rather than derived from `at`: stepping back to change the mode must
   * not un-answer the arena, or every visit to an earlier tab would cost the two
   * after it.
   */
  const [reached, setReached] = useState(0)

  /**
   * A name to start from, so the last step is never a blank field.
   *
   * Lazily, and the laziness is the whole of what is worth knowing here:
   * `funnyMatchName` calls `Math.random`, so calling it during a *render* that
   * also happens on the server would put one string in the HTML and a different
   * one in the browser - a hydration mismatch, on the field somebody is about
   * to type in.
   *
   * An initialiser cannot do that, because this wizard is never rendered on the
   * server: the lobby holds `summoning` in state, starting false, so the whole
   * component first exists in response to a click. That is also what makes the
   * name fresh every time it is opened rather than once per page load.
   *
   * It was an effect, which the same reasoning allows and the lint rule about
   * cascading renders does not - and the rule is right about the cost: a mount
   * effect that immediately sets state renders the wizard twice, the first time
   * with an empty field.
   */
  const [name, setName] = useState(funnyMatchName)
  const [mode, setMode] = useState<BattleMode>('ffa')
  const [where, setWhere] = useState<Where>(DEFAULT_WHERE)
  const [error, setError] = useState<string | null>(null)
  /** What the button says while a template world is being stood up. */
  const [stage, setStage] = useState<string | null>(null)

  /**
   * The football settings, kept whatever the mode is.
   *
   * Not cleared when the mode changes away from football: somebody who sets a
   * seven-minute clock, looks at the other modes and comes back should find their
   * seven minutes still there. They are only *sent* for football - see below, and
   * the decider refuses them for anything else.
   */
  const [minutes, setMinutes] = useState<number>(
    DEFAULT_FOOTBALL_SETTINGS.durationMinutes,
  )
  /** Empty means no target, which is ordinary football. */
  const [scoreLimit, setScoreLimit] = useState('')
  const [damage, setDamage] = useState(DEFAULT_FOOTBALL_SETTINGS.damage)
  const [respawn, setRespawn] = useState(DEFAULT_FOOTBALL_SETTINGS.respawn)

  /** Which XP an xp match is fought in. Null until one is picked. */
  const [xpId, setXpId] = useState<string | null>(null)
  const chosenXp = xps.find((entry) => entry.ref === xpId) ?? null

  /** The store row being taken in, so only its own control says so. */
  const [taking, setTaking] = useState<string | null>(null)

  /**
   * Shelve a store level without leaving the wizard.
   *
   * `router.refresh()` rather than local state, because the shelf is what the
   * `magazine` filter and the badge both read, and the page that owns this
   * wizard is the one that fetched it. Refreshing is also what makes the card
   * stop offering a control it no longer needs.
   */
  function takeIn(entry: XpChoice) {
    if (taking) return
    setTaking(entry.ref)

    void attempt(() => takeInXp(slug, entry.ref)).then((result) => {
      setTaking(null)
      if (result.ok) router.refresh()
    })
  }


  /**
   * What this match settled the level's rules to be.
   *
   * Null until an XP is picked, and then the level's own block - see
   * `defaultMatchRules`. State rather than a form read at submit, because the
   * config screen has to be able to say *this is not what the level says* while
   * somebody is looking at it, and it can only do that by comparing.
   *
   * Reset when the level changes, and it has to be: a score limit of twenty
   * carried over from a deathmatch onto a course is a number nobody typed for
   * the level they are now looking at. Done as the seeded-prop pattern the
   * scene uses - compared during render - rather than in an effect, so the
   * config step never draws one level's numbers under another level's name.
   */
  const [xpRules, setXpRules] = useState<XpMatchRules | null>(null)
  const [rulesFor, setRulesFor] = useState<string | null>(null)
  if (rulesFor !== xpId) {
    setRulesFor(xpId)
    setXpRules(chosenXp ? defaultMatchRules(chosenXp) : null)
  }

  /** Every mode this level could be played as. See `offerablePresets`. */
  const offered = chosenXp ? offerablePresets(chosenXp.capabilities) : []

  /** Has anything been changed away from what the document says? */
  const overridden =
    chosenXp !== null &&
    xpRules !== null &&
    JSON.stringify(xpRules) !== JSON.stringify(defaultMatchRules(chosenXp))

  /** One field of the block, changed, leaving the rest alone. */
  function setRule(patch: Partial<XpMatchRules>) {
    setXpRules((current) => (current ? { ...current, ...patch } : current))
  }

  /**
   * A limit somebody typed, or the field cleared.
   *
   * Empty is not zero: an empty score box is "no target", which is the absence
   * of the field rather than a zero the parser would refuse. See `XpMatchRules`.
   */
  function setLimit(field: 'scoreLimit' | 'timeLimit', raw: string) {
    setXpRules((current) => {
      if (!current) return current
      const next = { ...current }
      const value = Number.parseInt(raw, 10)
      if (Number.isFinite(value) && value > 0) next[field] = value
      else delete next[field]
      return next
    })
  }

  /**
   * The whole first step, or none of it.
   *
   * When there is no xp to offer there is no question, and the wizard opens on
   * `mode` exactly as it did before any of this existed. Making the step
   * conditional here rather than everywhere downstream is what keeps `STEPS`
   * honest: the strip, the counter and the Back button all read this one list.
   */
  const canFork = xps.length > 0 || xpOffered
  const STEPS = stepsFor(kind, canFork)

  const isFootball = mode === 'football'
  const isRace = mode === 'race'
  const step = stepAt(STEPS, at)
  const named = name.trim().length > 0
  const canAdvance = canLeave(step, { named, chosen: chosenXp !== null })

  // Escape closes, from anywhere in the sheet - including the search field,
  // which is the one place a person is likely to be typing when they change
  // their mind.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function goTo(next: number) {
    setAt(next)
    setReached((was) => furthest(was, next))
  }

  function summon() {
    setError(null)
    startTransition(async () => {
      const parsedLimit = Number.parseInt(scoreLimit, 10)

      /**
       * Turn the choice into a world id, standing a template up if that is what
       * was picked and the space has not used it before.
       *
       * First time only: `ensureTemplateWorld` returns the existing world on
       * every call after that, so this costs one extra round trip in the steady
       * state and a few seconds of block-laying exactly once.
       */
      let worldId: string | undefined
      // An XP match keeps the host's own space as its world - the roster, the
      // RLS and the scoring all reach for one - and says where it is really
      // played in `xpId`. Which branch of the wizard we are on decides this
      // now, rather than the shape of `where`: the xo path can no longer reach
      // an XP at all, so there is one place it can come from.
      const chosenXpId = kind === 'xp' ? (xpId ?? undefined) : undefined
      if (kind === 'xp') {
        // Nothing to stand up: the level is the ground.
      } else if (where.kind === 'arena') {
        worldId = where.worldId
      } else if (where.kind === 'template') {
        setStage(t.layingGround)
        const ground = await ensureTemplateWorld(slug, where.id)
        setStage(null)
        if (!ground.ok) {
          setError(refusal(ground.error))
          return
        }
        worldId = ground.worldId
      }

      /**
       * An XP match sends no settings and no mode of ours.
       *
       * The document's `rules` block is the mode - see the config step, which
       * shows it rather than offering one - so sending football settings
       * alongside it would be two sources of truth for the same question. The
       * mode argument stays `ffa` because the decider still wants one; what
       * actually governs the match is inside the level.
       */
      const result = await createBattle(
        slug,
        name,
        chosenXpId ? 'ffa' : mode,
        worldId,
        !chosenXpId && isFootball
          ? {
              durationMinutes: minutes,
              // Only when it is a number somebody actually typed. An empty field is
              // "no target", not "first to zero".
              ...(Number.isFinite(parsedLimit) && parsedLimit > 0
                ? { scoreLimit: parsedLimit }
                : {}),
              damage,
              respawn,
            }
          : undefined,
        /**
         * A race takes the clock and the damage switch and nothing else.
         *
         * The same two controls the football settings put on screen, sent under
         * the mode that reads them - the decider refuses either set attached to
         * the wrong mode, which is what keeps a race from carrying a score target
         * nothing will ever count.
         */
        !chosenXpId && isRace ? { durationMinutes: minutes, damage } : undefined,
        chosenXpId,
        /**
         * What the host settled the level's rules to be.
         *
         * Sent whether or not anything was changed, which is deliberate: the
         * block a match stores is what it is *played under*, and leaving it out
         * when it happens to match the document would mean a match created
         * today silently changing behaviour the day its author edits the level.
         * A match is fought under the rules it was set up under - the same
         * promise the version pin already makes.
         */
        chosenXpId ? (xpRules ?? undefined) : undefined,
      )
      if (!result.ok) {
        setError(refusal(result.error))
        return
      }
      // Straight into the room: the host is about to wait for people, and
      // waiting is something you do inside the arena, not on a list page.
      router.push(`/t/${slug}/battle/${result.battleId}`)
    })
  }

  const modeLabel = dict.modes[mode]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      // Only the backdrop itself closes. A click that started inside the sheet
      // and ended on the backdrop - dragging across the slider, most obviously -
      // must not throw four answered questions away.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.heading}
        className="summon-sheet relative my-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-accent/40 bg-surface shadow-2xl"
      >
        <div className="summon-rail2 h-0.5 w-full" />

        <div className="flex items-start gap-3 p-5 sm:p-6">
          <span
            aria-hidden
            className="summon-bob grid size-11 shrink-0 place-items-center rounded-xl border border-accent/50 text-accent"
          >
            <SparkMark />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">{t.heading}</h2>
            <p className="truncate font-mono text-xs text-ink-muted">
              {fill(t.stepOf, { at: at + 1, of: STEPS.length })} ·{' '}
              {kind === 'xp'
                ? `xp · ${chosenXp?.name ?? t.pickALevelFirst}`
                : `${modeLabel.toLowerCase()} · ${whereName(where, t, world)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-ink-muted transition hover:bg-surface-raised hover:text-ink"
          >
            <CrossMark />
          </button>
        </div>

        {/* Columns from the list rather than a fixed four: the two paths are
            five and four steps long, and a hardcoded grid would leave a gap on
            one of them. */}
        <ol
          className="grid gap-2 px-5 sm:px-6"
          style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }}
        >
          {STEPS.map((label, index) => {
            const done = index < at
            const here = index === at
            const open = index <= reached
            return (
              <li key={label}>
                <button
                  type="button"
                  disabled={!open || pending}
                  onClick={() => goTo(index)}
                  aria-current={here ? 'step' : undefined}
                  className="block w-full text-left disabled:cursor-default"
                >
                  <span
                    aria-hidden
                    className={`block h-0.5 w-full rounded-full ${
                      here
                        ? 'summon-step-fill summon-rail'
                        : done
                          ? 'bg-accent-2'
                          : 'bg-line/40'
                    }`}
                  />
                  <span
                    className={`mt-2 block font-mono text-[10px] uppercase tracking-[0.2em] transition ${
                      here
                        ? 'text-ink'
                        : done
                          ? 'text-accent-2'
                          : 'text-ink-muted/60'
                    }`}
                  >
                    {done && '✓ '}
                    {label}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <div className="min-h-[22rem] px-5 py-6 sm:px-6">
          {error && <ErrorNote className="mb-4">{error}</ErrorNote>}

          {/*
            The fork, and the first thing anybody is asked.

            Two cards rather than a toggle, because they are not two settings of
            one thing - they are two products at two prices, and the reader may
            not own the second one. A toggle that silently did nothing when
            flipped would be the worst version of this.
          */}
          {step === 'kind' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setKind('xo')
                  goTo(1)
                }}
                aria-pressed={kind === 'xo'}
                className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition ${
                  kind === 'xo'
                    ? 'border-accent bg-accent/10'
                    : 'border-line hover:border-accent/60 hover:bg-surface-raised'
                }`}
              >
                <span className="font-mono text-sm font-semibold">xo</span>
                <span className="text-sm font-medium">{t.xoTitle}</span>
                <span className="text-sm text-ink-muted">{t.xoBlurb}</span>
              </button>

              {xps.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setKind('xp')
                    goTo(1)
                  }}
                  aria-pressed={kind === 'xp'}
                  className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition ${
                    kind === 'xp'
                      ? 'border-accent bg-accent/10'
                      : 'border-line hover:border-accent/60 hover:bg-surface-raised'
                  }`}
                >
                  <span className="font-mono text-sm font-semibold">xp</span>
                  <span className="text-sm font-medium">{t.xpTitle}</span>
                  <span className="text-sm text-ink-muted">{t.xpBlurb}</span>
                </button>
              ) : (
                /*
                  Locked, and priced.

                  The one place in the app that renders a tier refusal as an
                  offer rather than hiding the surface - see `requireTier`. It
                  earns that because the reader is an owner standing in front of
                  the exact thing they would be buying, which is the only moment
                  an upsell is information rather than an advertisement.
                */
                <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-line p-4 text-left">
                  <span className="font-mono text-sm font-semibold text-ink-muted">
                    xp
                  </span>
                  <span className="text-sm font-medium text-ink-muted">{t.xpTitle}</span>
                  <span className="text-sm text-ink-muted">{t.xpLockedBlurb}</span>
                  {/*
                    An upsell only while there is something to sell. With xp not
                    yet on sale, a link to the billing page would send somebody
                    to a card that says "coming soon" - which is a worse answer
                    than giving them that answer here.
                  */}
                  {xpOnSale ? (
                    <Link
                      href={`/t/${slug}/billing`}
                      className="mt-1 text-sm text-accent hover:underline"
                    >
                      {fill(t.moveToXp, { price: tierPricePerMonth('xp') })}
                    </Link>
                  ) : (
                    <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted/70">
                      {t.comingSoon}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/*
            Pick the level.

            Its own step rather than a section on the arena screen, which is
            where XPs used to live. The arena screen asks "which ground", and an
            XP is not a ground - it is the whole match, mode included. Putting
            it beside three grounds made it look like a fourth, which is exactly
            the confusion the fork exists to remove.
          */}
          {step === 'xp' && (
            <XpPicker
              xps={xps}
              hidden={hidden}
              placeFree={placeFree}
              chosen={xpId}
              onChoose={setXpId}
              taking={taking}
              onTake={takeIn}
              t={t}
            />
          )}

          {step === 'config' && (
            <div className="space-y-5">
              {chosenXp && xpRules ? (
                <div className="space-y-4 rounded-xl border border-line bg-surface-raised p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">{chosenXp.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                      good for {chosenXp.capabilities.join(', ') || 'freeplay'}
                    </p>
                  </div>

                  {/*
                    Every mode this level can actually back up.

                    Derived from what the document *declares* and the parser has
                    already checked against the marks - see `offerablePresets`.
                    A level with no goals never offers football, which is the
                    whole point of a capability being a claim that gets checked:
                    the alternative is twenty people standing on a pitch that
                    cannot be scored on.
                  */}
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                      {t.mode}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {offered.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setRule({ preset })}
                          aria-pressed={xpRules.preset === preset}
                          title={describePreset(preset, presetWords)}
                          className={`rounded-full border px-3 py-1.5 text-xs transition ${
                            xpRules.preset === preset
                              ? 'border-accent bg-accent/15 text-accent'
                              : 'border-line/60 hover:bg-surface'
                          }`}
                        >
                          {preset}
                          {preset === chosenXp.preset && (
                            <span className="ml-1.5 text-[9px] text-ink-muted">
                              {t.levelsOwn}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                      {describePreset(xpRules.preset, presetWords)}.
                      {offered.length < 5 && t.notOffered}
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                        {t.endsAt}
                      </span>
                      <span className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={xpRules.scoreLimit ?? ''}
                          onChange={(event) => setLimit('scoreLimit', event.target.value)}
                          placeholder="—"
                          aria-label={t.scoreTarget}
                          className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-sm"
                        />
                        <span className="text-[11px] text-ink-muted">
                          {t.pointsNote}
                        </span>
                      </span>
                    </label>

                    <label className="block">
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                        {t.clock}
                      </span>
                      <span className="mt-2 flex items-center gap-2">
                        {/*
                          Minutes here, seconds in the document. The conversion
                          happens in this one control rather than anywhere the
                          value travels, because two units for one idea is how a
                          five-minute match becomes a five-second one.
                        */}
                        <input
                          type="number"
                          min={1}
                          value={
                            xpRules.timeLimit !== undefined
                              ? Math.round(xpRules.timeLimit / 60)
                              : ''
                          }
                          onChange={(event) =>
                            setLimit(
                              'timeLimit',
                              event.target.value === ''
                                ? ''
                                : String(Number.parseInt(event.target.value, 10) * 60),
                            )
                          }
                          placeholder="—"
                          aria-label={t.timeLimitLabel}
                          className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-sm"
                        />
                        <span className="text-[11px] text-ink-muted">
                          {t.minNote}
                        </span>
                      </span>
                    </label>
                  </div>

                  {/*
                    The people cap, which is a rules field rather than a room
                    setting - docs/xp/backlog.md §3. `min` is the half that does
                    something: the match will not kick off below it, so a game
                    for four cannot start with two and look broken.
                  */}
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                      {t.people}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <input
                        type="number"
                        min={MIN_PLAYERS}
                        max={Math.min(chosenXp.players.max, MAX_PLAYERS)}
                        value={xpRules.players.min}
                        onChange={(event) =>
                          setRule({
                            players: {
                              ...xpRules.players,
                              min: Number.parseInt(event.target.value, 10) || 1,
                            },
                          })
                        }
                        aria-label={t.fewest}
                        className="w-16 rounded-lg border border-line bg-surface px-2 py-1"
                      />
                      <span className="text-ink-muted">to</span>
                      <input
                        type="number"
                        min={MIN_PLAYERS}
                        max={Math.min(chosenXp.players.max, MAX_PLAYERS)}
                        value={xpRules.players.max}
                        onChange={(event) =>
                          setRule({
                            players: {
                              ...xpRules.players,
                              max: Number.parseInt(event.target.value, 10) || 1,
                            },
                          })
                        }
                        aria-label={t.most}
                        className="w-16 rounded-lg border border-line bg-surface px-2 py-1"
                      />
                      <span className="text-[11px] text-ink-muted">
                        {fill(t.peopleNote, {
                          min: Math.max(MIN_PLAYERS, xpRules.players.min),
                          max: chosenXp.players.max,
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/50 pt-3">
                    <p className="text-[11px] leading-relaxed text-ink-muted">
                      {overridden ? t.thisMatchOnly : t.fromTheLevel}
                    </p>
                    {overridden && (
                      <button
                        type="button"
                        onClick={() => setXpRules(defaultMatchRules(chosenXp))}
                        className="text-xs text-accent hover:underline"
                      >
                        {t.backToLevels}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">{t.pickALevelFirst}</p>
              )}

              <MatchName
                value={name}
                onChange={setName}
                placeholder={
                  chosenXp ? fill(t.levelRun, { name: chosenXp.name }) : t.fridayNight
                }
              />
            </div>
          )}

          {step === 'mode' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {MODES.map((option) => {
                const active = mode === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setMode(option.id)}
                    aria-pressed={active}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                      active
                        ? 'border-accent bg-accent/15'
                        : 'border-line/60 hover:border-accent/60 hover:bg-surface-raised/50'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`grid size-10 shrink-0 place-items-center rounded-lg border ${
                        active ? 'border-accent text-accent' : 'border-line/60 text-ink-muted'
                      }`}
                    >
                      {option.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{dict.modes[option.id]}</span>
                      <span className="mt-0.5 block text-sm text-ink-muted">
                        {t.modeBlurbs[option.id]}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {step === 'arena' && (
            <div className="space-y-4">
              {/*
                Said before the ground is picked, not after the race has started.

                No template comes with a course on it - a start and a finish are
                laid by hand, because where they go *is* the course and no generated
                ground can guess it. Somebody choosing the pitch for a race would
                otherwise find out at the off, with a field of people standing in a
                world that has nothing to run to.
              */}
              {isRace && (
                <p className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
                  A race needs a ground with a start and a finish on it. None of the
                  templates come with one — stand them yourself in the arena editor,
                  or in your lounge, from the block picker&apos;s Marks section.{' '}
                  {/*
                    The other way to get one, which is now the quicker way: the
                    catalogue's courses carry their own start and finish marks,
                    so a space with no course can have one in a click rather
                    than laying a route by hand first.
                  */}
                  <Link
                    href={`/t/${slug}/worlds?tag=parkour`}
                    className="underline underline-offset-2 hover:text-amber-50"
                  >
                    {t.readyMadeCourse}
                  </Link>
                </p>
              )}

              <WherePicker
                slug={slug}
                arenas={arenas}
                value={where}
                onChange={setWhere}
                onConfirm={() => goTo(at + 1)}
                disabled={pending}
              />
            </div>
          )}

          {step === 'rules' && (
            <div className="space-y-6">
              <MatchName
                lead
                value={name}
                onChange={setName}
                placeholder={t.untitledSkirmish}
              />

              {/*
                The football settings.

                Only for football, because no other mode has a clock, a target or an
                opinion about how rough it gets - and the decider refuses these outright
                for the other three, so offering them would be offering something that
                cannot be submitted.
              */}
              {isFootball ? (
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                      {fill(f.clock, { n: minutes })}
                    </p>
                    <input
                      type="range"
                      min={MIN_MATCH_MINUTES}
                      max={MAX_MATCH_MINUTES}
                      step={1}
                      value={minutes}
                      onChange={(event) => setMinutes(Number(event.target.value))}
                      aria-label={t.matchLength}
                      className="w-full accent-[var(--color-accent)]"
                    />
                    <div className="flex flex-wrap gap-2">
                      {DURATIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setMinutes(option)}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            minutes === option
                              ? 'border-accent bg-accent/15'
                              : 'border-line/60 hover:bg-surface-raised'
                          }`}
                        >
                          {option} min
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <label htmlFor="score-limit" className="text-xs text-ink-muted">
                        {f.firstTo}
                      </label>
                      <input
                        id="score-limit"
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
                      <Toggle
                        on={damage}
                        onClick={() => setDamage(!damage)}
                        label={f.chargesHurt}
                      />
                      <Toggle
                        on={respawn}
                        disabled={!damage}
                        onClick={() => setRespawn(!respawn)}
                        label={f.respawn}
                      />
                    </div>
                    <p className="text-[11px] leading-relaxed text-ink-muted">
                      {f.chargesNote}
                    </p>
                  </div>
                </div>
              ) : isRace ? (
                /*
                  The race settings.

                  Two of the four football has, because the other two have no
                  question to ask: the finish line is the target, and coming back
                  at the start is the mode rather than a switch. The clock here is
                  a *limit* - the race is over when the last runner is home, and
                  this is how long it may take before that stops being worth
                  waiting for.
                */
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                      {fill(t.timeLimit, { n: minutes })}
                    </p>
                    <input
                      type="range"
                      min={MIN_MATCH_MINUTES}
                      max={MAX_MATCH_MINUTES}
                      step={1}
                      value={minutes}
                      onChange={(event) => setMinutes(Number(event.target.value))}
                      aria-label={t.timeLimitLabel}
                      className="w-full accent-[var(--color-accent)]"
                    />
                    <div className="flex flex-wrap gap-2">
                      {DURATIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setMinutes(option)}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            minutes === option
                              ? 'border-accent bg-accent/15'
                              : 'border-line/60 hover:bg-surface-raised'
                          }`}
                        >
                          {option} min
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] leading-relaxed text-ink-muted">
                      {t.raceEnds}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                      {f.extras}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Toggle
                        on={damage}
                        onClick={() => setDamage(!damage)}
                        label={f.chargesHurt}
                      />
                    </div>
                    <p className="text-[11px] leading-relaxed text-ink-muted">
                      {t.raceCharges}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">
                  {fill(t.nothingToSet, { mode: modeLabel })}
                </p>
              )}
            </div>
          )}

          {step === 'fighters' && (
            <div className="space-y-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                  {fill(t.roster, { n: MAX_PLAYERS })}
                </p>
                {/*
                  Empty seats, drawn. The number on its own ("holds 16") does not
                  say that the match opens with nobody in it but you, which is the
                  thing a host is about to have to do something about.
                */}
                <ul aria-hidden className="mt-3 flex flex-wrap gap-1.5">
                  {Array.from({ length: MAX_PLAYERS }, (_, index) => (
                    <li
                      key={index}
                      className={`size-6 rounded-md border ${
                        index === 0
                          ? 'border-accent bg-accent/30'
                          : 'border-line/40 bg-surface-raised/30'
                      }`}
                    />
                  ))}
                </ul>
                <p className="mt-3 text-sm text-ink-muted">
                  {t.firstSeat}
                  <span className="text-ink">{t.onNow}</span>
                  {t.firstSeatTail}
                </p>
              </div>

              <dl className="grid gap-px overflow-hidden rounded-xl border border-line/60 bg-line/30 sm:grid-cols-3">
                <Recap label={t.recapMode} value={modeLabel} />
                <Recap label={t.recapArena} value={whereName(where, t, world)} />
                <Recap
                  label={t.recapRules}
                  value={
                    isFootball
                      ? fill(t.recapMinutes, { n: minutes }) +
                        (Number.parseInt(scoreLimit, 10) > 0
                          ? fill(t.recapFirstTo, {
                              score: Number.parseInt(scoreLimit, 10),
                            })
                          : '')
                      : t.lastStanding
                  }
                />
              </dl>

              <p className="text-xs text-ink-muted">
                {describe(where, arenas, t, world)}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line/40 px-5 py-4 sm:px-6">
          {at === 0 ? (
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-ink-muted transition hover:text-ink"
            >
              {t.cancel}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAt(at - 1)}
              disabled={pending}
              className="text-sm text-ink-muted transition hover:text-ink disabled:opacity-50"
            >
              {t.back}
            </button>
          )}

          <span className="ml-auto font-mono text-xs text-ink-muted">
            {pending
              ? (stage ?? t.summoning)
              : step === 'fighters'
                ? t.openTheDoors
                : canAdvance
                  ? fill(t.next, { step: t.steps[STEPS[at + 1] ?? 'fighters'] })
                  : t.nameItFirst}
          </span>

          <button
            type="button"
            disabled={pending || !canAdvance}
            onClick={() => (step === 'fighters' ? summon() : goTo(at + 1))}
            className="summon-cta rounded-xl px-6 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed"
          >
            {step === 'fighters' ? t.summon : t.continue}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * The one field the wizard requires, arriving with an answer already in it.
 *
 * ---------------------------------------------------------------------------
 * Why there is a die beside it
 * ---------------------------------------------------------------------------
 * A prefilled field that cannot be re-rolled is a worse offer than an empty
 * one: the joke lands or it does not, and if it does not, somebody is now
 * deleting 24 characters to get back to where they would have started. One
 * press is cheaper than that and considerably more fun than typing, which is
 * the whole argument for the feature - see `funnyMatchName`.
 *
 * Both steps that ask for a name use this, which is the reason it exists rather
 * than being two inputs: the xo path asks on `rules` and the xp path asks on
 * `config`, and a re-roll that only worked on one of them would be a bug
 * reported as "it does not always do the thing".
 */
function MatchName({
  value,
  onChange,
  placeholder,
  /** The xo path's step opens on this field, so it is drawn as the question. */
  lead = false,
}: {
  value: string
  onChange: (name: string) => void
  placeholder: string
  lead?: boolean
}) {
  const t = battleDict(useLocale()).wizard
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label
          htmlFor="match-name"
          className={
            lead
              ? 'block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted'
              : 'block text-sm font-medium'
          }
        >
          {lead ? t.nameTheMatch : t.whatIsItCalled}
        </label>
        <button
          type="button"
          onClick={() => onChange(funnyMatchName())}
          className="shrink-0 text-xs text-accent transition hover:opacity-80"
        >
          {t.anotherOne}
        </button>
      </div>
      <input
        id="match-name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={lead ? 60 : 80}
        /*
          The xo step opens on this field, so the keyboard is already in the
          right place. `select` rather than a bare focus now that it arrives
          full: the cursor sitting after a name somebody did not choose invites
          24 presses of backspace, and typing over a selection is what anybody
          who wants their own name is about to do anyway.
        */
        autoFocus={lead}
        onFocus={(event) => event.target.select()}
        className={
          lead
            ? 'w-full rounded-xl border border-accent/40 bg-surface-raised/40 px-4 py-3 text-lg outline-none transition placeholder:text-ink-muted/60 focus:border-accent'
            : 'w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent'
        }
      />
    </div>
  )
}

function Recap({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm">{value}</dd>
    </div>
  )
}

/** A rule that is on or off, as a chip rather than a checkbox. */
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

function CrossMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

const OPTION =
  'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition text-left'

/**
 * Where to fight: a standard ground, one of yours, or somebody else's.
 *
 * Three sources in one control, because they answer one question and a person
 * setting up a match does not care which table the answer came from. What
 * changes between them is only how the id is found:
 *
 *   - **Templates** come from a file (domain/lounge/templates.ts) and are
 *     stood up on demand. Every space has the same ones, so this is the only
 *     part of the control that is never empty - which is what lets the pitch be
 *     the default.
 *   - **Yours** are already on the page, passed down by the server.
 *   - **Published** are searched, because the corpus is every public arena on
 *     the platform and the useful answer is a name somebody half-remembers.
 */
function WherePicker({
  slug,
  arenas,
  value,
  onChange,
  onConfirm,
  disabled,
}: {
  slug: string
  arenas: BattlefieldView[]
  value: Where
  onChange: (where: Where) => void
  /**
   * Pressing the one that is already chosen, which means *this one, go on*.
   *
   * The wizard's Next button lives at the bottom of the panel, and on a phone
   * the ground list is most of a screen tall - so choosing an arena meant
   * picking it, scrolling past everything you did not pick, and pressing a
   * button that says the thing you already said. The second press is the
   * confirmation, on the card your thumb is already on.
   *
   * Deliberately not *first* press. One tap advancing would make browsing
   * impossible: you could never look at the second option without committing to
   * it, and this list is exactly where somebody is comparing.
   */
  onConfirm: () => void
  disabled: boolean
}) {
  const refusal = useRefusal()
  const t = battleDict(useLocale()).wizard
  const world = worldDict(useLocale())
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<PublishedWorld[]>([])
  const [searching, setSearching] = useState(false)

  /**
   * The catalogue, searched alongside the published arenas.
   *
   * Its own term and its own state rather than one merged list, because picking
   * from it *does something* - a catalogue world is copied into this space
   * before it can be fought on - and a menu where some rows select and others
   * quietly write to the database is a menu nobody can predict. Two boxes, two
   * headings, and the copy says which is which.
   */
  const [catTerm, setCatTerm] = useState('')
  const [catalogue, setCatalogue] = useState<CatalogueWorld[]>([])
  const [catSearching, setCatSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  const needle = term.trim()
  /** Two characters, so a single letter does not query every arena there is. */
  const searchable = needle.length >= 2

  /**
   * Search as you type, a beat behind.
   *
   * 300ms after the last keystroke, not on every one: the query is an `ilike`
   * across every public arena on the platform, and firing it per character
   * means five round trips to answer one question - with the answers arriving
   * out of order.
   */
  useEffect(() => {
    if (!searchable) return

    let live = true
    const timer = setTimeout(async () => {
      setSearching(true)
      const found = await findPublishedWorlds(slug, needle)
      // The request that comes back after this effect was cleaned up belongs to
      // a term nobody is looking at any more.
      if (!live) return
      setSearching(false)
      setResults(found.ok ? found.worlds : [])
    }, 300)

    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [needle, searchable, slug])

  /**
   * Results belong to the term that fetched them.
   *
   * Filtered at render rather than cleared in the effect: a term shrinking back
   * under two characters should stop showing matches immediately, and doing
   * that by calling `setResults([])` in an effect body means rendering the
   * stale list once first.
   */
  const shown = searchable ? results : []

  const catNeedle = catTerm.trim()
  const catSearchable = catNeedle.length >= 2

  // The same debounce, for the same reason - see the effect above.
  useEffect(() => {
    if (!catSearchable) return

    let live = true
    const timer = setTimeout(async () => {
      setCatSearching(true)
      const found = await findCatalogueWorlds(slug, catNeedle)
      if (!live) return
      setCatSearching(false)
      setCatalogue(found.ok ? found.worlds : [])
    }, 300)

    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [catNeedle, catSearchable, slug])

  const catShown = catSearchable ? catalogue : []

  /**
   * Take a catalogue world and make it this space's arena.
   *
   * The copy is the save - it is exactly what the battlefields page's "Use as a
   * battlefield" button does, and it has to happen before the match can name a
   * world, because a battle's `worldId` is a ground in *this* space. So the
   * choice is a write, and it is the one place in this wizard that is: the row
   * shows what it is doing and refuses to be pressed twice.
   *
   * Selected on success, so picking it is one action rather than a copy
   * followed by hunting for it in the list above.
   */
  function copyFromCatalogue(world: CatalogueWorld) {
    setAddError(null)
    setAdding(world.id)
    void addWorldToSpace(slug, world.id).then((result) => {
      setAdding(null)
      if (!result.ok) {
        setAddError(refusal(result.error))
        return
      }
      onChange({ kind: 'arena', worldId: result.worldId, name: world.name })
    })
  }

  /** One choice. `key` is explicit because these are rendered from three lists. */
  function option(key: string, candidate: Where, label: string, hint?: string) {
    const active = sameWhere(candidate, value)
    return (
      <button
        key={key}
        type="button"
        disabled={disabled}
        onClick={() => (active ? onConfirm() : onChange(candidate))}
        aria-pressed={active}
        className={`${OPTION} ${
          active ? 'border-accent bg-accent/15' : 'border-line/60 hover:bg-surface-raised'
        } disabled:opacity-50`}
      >
        <span className="truncate">{label}</span>
        {hint && <span className="shrink-0 text-[10px] text-ink-muted">{hint}</span>}
      </button>
    )
  }

  return (
    <div className="space-y-5">
      {/*
        The XPs used to be here, above the templates, and they have moved out
        to their own branch of the wizard.

        This screen asks "which ground", and an XP is not a ground - it is the
        whole match, mode included. Listing it as a fourth option beside three
        grounds meant a host picked it and was then asked three more questions
        the level had already answered. See STEPS_BY_KIND.
      */}
      <div className="grid gap-3 sm:grid-cols-2">
        {WORLD_TEMPLATES.map((template) => {
          const candidate: Where = { kind: 'template', id: template.id }
          const active = sameWhere(candidate, value)
          return (
            <button
              key={template.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(candidate)}
              aria-pressed={active}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition disabled:opacity-50 ${
                active
                  ? 'border-accent bg-accent/15'
                  : 'border-line/60 hover:border-accent/60 hover:bg-surface-raised/50'
              }`}
            >
              <span
                aria-hidden
                className={`grid size-10 shrink-0 place-items-center rounded-lg border ${
                  active ? 'border-accent text-accent' : 'border-line/60 text-ink-muted'
                }`}
              >
                {templateMark(template.id)}
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="font-medium">
                    {world.picker.templates[template.id].name}
                  </span>
                  {template.football && (
                    <span className="font-mono text-[10px] text-accent-2">
                      {t.hasGoals}
                    </span>
                  )}
                  {/* The same chip for the other kind of mark: a race needs to
                      know at a glance which grounds it can be run on. */}
                  {template.race && (
                    <span className="font-mono text-[10px] text-accent-2">
                      {t.startAndFinish}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  {fill(world.picker.templates[template.id].blurb, {
                    n: DEFAULT_WORLD_SIZE,
                  })}
                </span>
              </span>
            </button>
          )
        })}

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ kind: 'lounge' })}
          aria-pressed={value.kind === 'lounge'}
          className={`flex items-start gap-3 rounded-xl border p-3 text-left transition disabled:opacity-50 ${
            value.kind === 'lounge'
              ? 'border-accent bg-accent/15'
              : 'border-line/60 hover:border-accent/60 hover:bg-surface-raised/50'
          }`}
        >
          <span
            aria-hidden
            className={`grid size-10 shrink-0 place-items-center rounded-lg border ${
              value.kind === 'lounge'
                ? 'border-accent text-accent'
                : 'border-line/60 text-ink-muted'
            }`}
          >
            <MeleeMark />
          </span>
          <span className="min-w-0">
            <span className="block font-medium">{t.theLounge}</span>
            <span className="mt-0.5 block text-xs text-ink-muted">
              {t.theLoungeBlurb}
            </span>
          </span>
        </button>
      </div>

      {arenas.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
            {t.yours}
          </p>
          <div className="flex flex-wrap gap-2">
            {arenas.map((arena) =>
              option(
                arena.worldId,
                { kind: 'arena', worldId: arena.worldId, name: arena.name },
                arena.name,
              ),
            )}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
          {t.publishedByOthers}
        </p>
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t.searchArenas}
          aria-label={t.searchArenasLabel}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs"
        />

        {searching && <p className="mt-1.5 text-[10px] text-ink-muted">{t.looking}</p>}

        {!searching && searchable && shown.length === 0 && (
          <p className="mt-1.5 text-[10px] text-ink-muted">
            {t.nothingPublished}
          </p>
        )}

        {shown.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {shown.map((world) =>
              option(
                world.worldId,
                { kind: 'arena', worldId: world.worldId, name: world.name },
                world.name,
                world.spaceName ?? t.anotherSpace,
              ),
            )}
          </div>
        )}
      </div>

      {/*
        And the catalogue, which is the discovery page from in here.

        Last, because it is the only one of the four that copies something into
        the space - the three above pick a ground that already exists, this one
        makes it. Said in the copy rather than left to be discovered, since "I
        chose an arena" and "I added a world to our space" are different things
        to have done and only one of them is undoable by pressing something
        else.
      */}
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
          {t.fromCatalogue}
        </p>
        <input
          value={catTerm}
          onChange={(event) => setCatTerm(event.target.value)}
          placeholder={t.searchShared}
          aria-label={t.searchSharedLabel}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs"
        />
        <p className="mt-1.5 text-[10px] text-ink-muted">
          {t.catalogueNote}
        </p>

        {catSearching && (
          <p className="mt-1.5 text-[10px] text-ink-muted">{t.looking}</p>
        )}

        {!catSearching && catSearchable && catShown.length === 0 && (
          <p className="mt-1.5 text-[10px] text-ink-muted">
            {t.nothingShared}
          </p>
        )}

        {catShown.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {catShown.map((world) => (
              <button
                key={world.id}
                type="button"
                disabled={disabled || adding !== null}
                onClick={() => copyFromCatalogue(world)}
                className={`${OPTION} border-line/60 hover:bg-surface-raised disabled:opacity-50`}
              >
                <span className="truncate">{world.name}</span>
                <span className="shrink-0 text-[10px] text-ink-muted">
                  {adding === world.id ? t.copying : (world.spaceName ?? t.sharedWorld)}
                </span>
              </button>
            ))}
          </div>
        )}

        {addError && (
          <p role="alert" className="mt-2 text-[11px] text-red-300">
            {addError}
          </p>
        )}
      </div>
    </div>
  )
}
