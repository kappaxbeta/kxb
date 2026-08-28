'use client'

import {
  ASSIGNS,
  DEFAULT_ASSIGN,
  MAX_DECLARED_PLAYERS,
  MODES,
  modeOf,
  playersOf,
  type XpRules,
  PRESETS,
  SIDES,
  describePreset,
  presetNeeds,
  rulesOf,
  sidesOf,
  teamsOf,
  type Assign,
  type Mode,
  type Preset,
  type Sides,
  type XpDocument,
  FINISHES,
  DEFAULT_FINISH,
  type Finish,
} from '@kxb/xp'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { xpDict } from '@/app/i18n/xp'
import { xpEditorDict, type XpEditorDict } from '@/app/i18n/xp-editor'
import { PanelLabel, Hint } from '@/app/xp/_editor/chrome'

/**
 * Twelve hues, evenly spaced.
 *
 * Even rather than perceptual: the point is that the twelve are *distinguishable
 * from each other* at swatch size, and a wheel divided by twelve manages that
 * while a hand-picked set drifts every time somebody adds one.
 */
const SWATCHES = Array.from({ length: 12 }, (_, index) => index * 30)

/**
 * What game this is, as three controls.
 *
 * A document-level fact rather than a panel of its own: it is two rows and a
 * picker, and a window that holds two rows is a window somebody has to arrange.
 * It lives with the counts and the warnings because those are the other things
 * true of the whole document rather than of whatever is selected.
 *
 * ---------------------------------------------------------------------------
 * A preset the world cannot back up is disabled, not refused
 * ---------------------------------------------------------------------------
 * `parseXp` rejects `football` in a level with no goals, which is correct and
 * late: the editor writes through the parser on every keystroke, so the failure
 * would arrive as a save that silently did nothing. `presetNeeds` gives the same
 * answer *before* the click, so the option can be greyed out with the reason
 * next to it - "needs a goal at each end" - and the author learns what to build
 * rather than that they have done something wrong.
 *
 * ---------------------------------------------------------------------------
 * Empty is a value here, and the fields have to say so
 * ---------------------------------------------------------------------------
 * `scoreLimit` and `timeLimit` are optional, and absent is a third state rather
 * than a synonym for zero: a course is over when somebody finishes it, and the
 * parser refuses a zero limit precisely so that absent is the only way to say
 * "no limit". So these are text inputs with a placeholder saying what empty
 * means, not spinners that start at zero - a spinner would make "no clock" a
 * number nobody can type.
 */

export interface ModeProps {
  document: XpDocument
  onChange: (patch: {
    preset?: Preset
    /** What the level is - a space, a lobby or a battle. See `MODES`. */
    mode?: Mode | null
    sides?: Sides | null
    scoreLimit?: number | null
    timeLimit?: number | null
    respawn?: number | null
    assign?: Assign | null
    playersMin?: number | null
    playersMax?: number | null
  }) => void
  /** Not a rule - what the level looks like as an object. See `@kxb/xp`'s `./finish`. */
  onFinish: (finish: Finish | null) => void
  /** And what colour it is, as a hue. `null` means "you decide". */
  onColour: (hue: number | null) => void
}

export function Mode({ document, onChange, onFinish, onColour }: ModeProps) {
  const locale = useLocale()
  const t = xpEditorDict(locale).mode
  // The preset blurbs live in `./xp` rather than here: the battle wizard prints
  // the same five sentences, and one table is what stops them drifting.
  const presetWords = xpDict(locale).presets
  const rules = rulesOf(document)
  const teams = teamsOf(document.world.marks)
  /** What the level is now, said or derived. See `sidesOf`. */
  const sides = sidesOf(rules, document.world.marks)

  return (
    <section className="mt-4 border-t border-neutral-900 pt-3">
      <PanelLabel className="mb-1.5">{t.heading}</PanelLabel>

      {/**
        * What the level *is*, above what you do in it.
        *
        * Above rather than beside, because it is the coarser question and the
        * one that changes what the rest of the panel means: a `scoreLimit` in a
        * battle is how a round ends, and the same number in a lobby is a
        * counter that keeps going. Three buttons and a sentence, the same shape
        * the styles below have, so the two axes read as two axes.
        */}
      <PanelLabel className="mb-1 text-neutral-500">{t.modeHeading}</PanelLabel>
      <div className="mb-1 grid grid-cols-3 gap-1.5">
        {MODES.map((one) => (
          <button
            key={one}
            type="button"
            // `space` is what absent means, and `setRules` clears the field when
            // it is asked for - so pressing it takes the level back to saying
            // nothing rather than to saying the default out loud.
            onClick={() => onChange({ mode: one })}
            title={t.modeBlurbs[one]}
            className={`rounded border px-2 py-1.5 text-left text-[11px] transition-colors ${
              modeOf(rules) === one
                ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
            }`}
          >
            {t.modes[one]}
          </button>
        ))}
      </div>
      <p className="mb-3 font-mono text-[10px] leading-relaxed text-neutral-500">
        {t.modeBlurbs[modeOf(rules)]}
      </p>

      {/**
        * What the level looks like on a shelf.
        *
        * Here rather than in a panel of its own for the reason this whole
        * section exists: it is one row of buttons and a fact about the whole
        * document, which is what the mode and the style above it are. It sits
        * under them because it is the least consequential of the three - a
        * finish changes nothing about how the level plays.
        *
        * Pressing the current one clears the field rather than doing nothing,
        * so an author can get back to saying nothing. See `finishDocument`.
        */}
      <PanelLabel className="mb-1 text-neutral-500">{t.finishHeading}</PanelLabel>
      <div className="mb-3 grid grid-cols-4 gap-1.5">
        {FINISHES.map((finish) => {
          const chosen = (document.finish ?? DEFAULT_FINISH) === finish
          return (
            <button
              key={finish}
              type="button"
              onClick={() => onFinish(document.finish === finish ? null : finish)}
              title={t.finishes[finish]}
              className={`rounded border px-2 py-1.5 text-left text-[11px] transition-colors ${
                chosen
                  ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                  : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
              }`}
            >
              {t.finishes[finish]}
            </button>
          )
        })}
      </div>

      {/**
        * And what colour it is.
        *
        * Twelve steps round the wheel rather than a colour input, which is the
        * same argument the finish set makes one level down: everything that
        * draws a cartridge builds its shell, its plate, its edge glow and the
        * shadow under its name from *one* hue. A free colour would have to have
        * the hue taken back out of it, and would let somebody pick a shell so
        * dark the neon on it cannot be seen.
        *
        * `auto` is first and is the default, because it is a real answer:
        * `hueFor` spreads unclaimed levels around the wheel by the golden angle,
        * so a shelf nobody has coloured is already a shelf of colours. Pressing
        * the chosen swatch again returns to it.
        */}
      <PanelLabel className="mb-1 text-neutral-500">{t.colourHeading}</PanelLabel>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onColour(null)}
          aria-pressed={document.hue === undefined}
          className={`rounded border px-2 py-1 text-[11px] transition-colors ${
            document.hue === undefined
              ? 'border-violet-500 bg-violet-500/15 text-violet-200'
              : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
          }`}
        >
          {t.colourAuto}
        </button>

        {SWATCHES.map((hue) => {
          const chosen = document.hue === hue
          return (
            <button
              key={hue}
              type="button"
              onClick={() => onColour(chosen ? null : hue)}
              aria-pressed={chosen}
              aria-label={`${t.colourHeading}: ${hue}`}
              // Drawn in the colour it sets, at the saturation and lightness a
              // plastic shell is tinted with - so the swatch is the cartridge
              // rather than a legend for it.
              style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}
              className={`size-6 rounded border transition-transform ${
                chosen
                  ? 'scale-110 border-violet-300'
                  : 'border-neutral-700 hover:scale-105 hover:border-neutral-500'
              }`}
            />
          )
        })}
      </div>

      <PanelLabel className="mb-1 text-neutral-500">{t.styleHeading}</PanelLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {PRESETS.map((preset) => {
          const needs = presetNeeds(preset)
          const held = needs === null || document.capabilities.includes(needs)
          return (
            <button
              key={preset}
              type="button"
              disabled={!held}
              onClick={() => onChange({ preset })}
              title={held ? describePreset(preset, presetWords) : whyNot(preset, t)}
              className={`rounded border px-2 py-1.5 text-left text-[11px] transition-colors ${
                rules.preset === preset
                  ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                  : held
                    ? 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
                    : 'cursor-not-allowed border-neutral-900 text-neutral-700'
              }`}
            >
              {t.presets[preset]}
            </button>
          )
        })}
      </div>

      {/* The reason, under the grid rather than in a tooltip alone: a disabled
          button somebody cannot press is a question, and the answer should not
          require hovering to find. */}
      {PRESETS.filter((preset) => {
        const needs = presetNeeds(preset)
        return needs !== null && !document.capabilities.includes(needs)
      }).map((preset) => (
        <p key={preset} className="mt-1 font-mono text-[10px] leading-tight text-neutral-600">
          {t.presets[preset]} — {whyNot(preset, t)}
        </p>
      ))}

      <p className="mt-2 font-mono text-[10px] leading-relaxed text-neutral-500">
        {describePreset(rules.preset, presetWords)}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <Limit
          label={t.firstTo}
          value={rules.scoreLimit}
          empty={t.noScoreLimit}
          onChange={(scoreLimit) => onChange({ scoreLimit })}
        />
        <Limit
          label={t.seconds}
          value={rules.timeLimit}
          empty={t.noClock}
          onChange={(timeLimit) => onChange({ timeLimit })}
        />
        {/*
          And how long you lie there, which is the third of the three and had no
          control anywhere.

          `readRules` has carried it for as long as the other two - it is in the
          same three-field loop that copies them - so a level could only ask for
          it by typing JSON. Which mattered more once a death was something you
          could *see*: a body now falls onto its back, and at the default of zero
          it falls and stands straight back up, so the wait is the difference
          between a death and a flicker.
        */}
        <Limit
          label={t.downFor}
          value={rules.respawn}
          empty={t.straightBackUp}
          onChange={(respawn) => onChange({ respawn })}
        />
      </div>

      {/*
        How many the level is for, which is a fact about the *level*.

        Not a setting on the room it is played in - a board game for four is for
        four wherever it is opened - and until now it had no control anywhere, so
        the only way to say it was to type JSON. `min` is what a start button
        reads and `max` is what a door reads, which is why they are two fields
        and not a range: plenty of levels want a floor and no ceiling.
      */}
      <PanelLabel className="mb-1.5 mt-4">{t.players}</PanelLabel>
      <div className="grid grid-cols-2 gap-1.5">
        <Limit
          label={t.needs}
          value={rules.players?.min}
          empty={t.anybody}
          onChange={(playersMin) => onChange({ playersMin })}
        />
        <Limit
          label={t.holds}
          value={rules.players?.max}
          empty={fill(t.upTo, { n: MAX_DECLARED_PLAYERS })}
          onChange={(playersMax) => onChange({ playersMax })}
        />
      </div>
      <p className="mt-1 font-mono text-[10px] leading-relaxed text-neutral-500">
        {seatsSay(rules, teams.length, rules.assign ?? DEFAULT_ASSIGN, t)}
      </p>

      {/*
        Sides, as two questions with the second inside the first.

        *What shape is the fight* is answerable in any level - a free-for-all
        needs nothing placed - so the picker is always here. *How the sides are
        handed out* only means something once there are two of them, which is
        why it stayed behind `teamsOf` where it has always been.
      */}
      <PanelLabel className="mb-1.5 mt-4">{t.sidesHeading}</PanelLabel>
      <div className="grid grid-cols-3 gap-1.5">
        {SIDES.map((option) => {
          /*
            Disabled rather than refused, like the presets above: `setRules`
            returns null for a sided shape in a world with no team spawns, and a
            button that silently does nothing is worse than one that says why.
          */
          const held = option === 'ffa' || teams.length >= 2
          return (
            <button
              key={option}
              type="button"
              disabled={!held}
              /*
                Pressing the one that is already on takes the field away rather
                than rewriting it - which is how a level goes back to meaning
                whatever its marks say, and the only way to express that at all
                (absent here is derived, not a fourth value).
              */
              onClick={() => onChange({ sides: rules.sides === option ? null : option })}
              title={held ? t.sideBlurbs[option] : t.needsTeamNames}
              className={`rounded border px-2 py-1.5 text-[11px] transition-colors ${
                sides === option
                  ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                  : held
                    ? 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
                    : 'cursor-not-allowed border-neutral-900 text-neutral-700'
              }`}
            >
              {t.sides[option]}
            </button>
          )
        })}
      </div>
      <p className="mt-1 font-mono text-[10px] leading-relaxed text-neutral-500">
        {t.sideBlurbs[sides]}
        {/*
          Said out loud, because the difference is invisible and load-bearing:
          a level that never declared one follows its marks, so adding a second
          team spawn later changes what the level *is*. One that was declared
          does not move.
        */}
        {rules.sides === undefined && t.readOffTheMarks}
      </p>

      {teams.length < 2 ? (
        <Hint className="mt-2 leading-tight">{t.nothingToHandOut}</Hint>
      ) : sides === 'one-vs-all' ? (
        <Hint className="mt-2 leading-tight">{t.matchNamesTheOne}</Hint>
      ) : sides === 'ffa' ? (
        <Hint className="mt-2 leading-tight">{t.nobodyOnASide}</Hint>
      ) : (
        <>
          <div className="mt-2 flex gap-1.5">
            {ASSIGNS.map((assign) => (
              <button
                key={assign}
                type="button"
                onClick={() => onChange({ assign })}
                title={t.assign[assign]}
                className={`flex-1 rounded border px-2 py-1.5 text-[11px] transition-colors ${
                  (rules.assign ?? 'spread') === assign
                    ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                    : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
                }`}
              >
                {t.assignNames[assign]}
              </button>
            ))}
          </div>
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-neutral-500">
            {t.assign[rules.assign ?? 'spread']}
          </p>
        </>
      )}
    </section>
  )
}

/** What a preset is missing, in the words an author can act on. */
function whyNot(preset: Preset, t: XpEditorDict['mode']): string {
  switch (presetNeeds(preset)) {
    case 'football':
      return t.needsGoals
    case 'competition':
      return t.needsStartFinish
    case 'match':
      return t.needsSpawns
    default:
      return t.needsSomething
  }
}

/**
 * An optional number, where empty means something.
 *
 * Held as its own string rather than derived from the value on every render,
 * because the two disagree in the moment that matters: clearing the field types
 * an empty string, which is not a number, so a controlled input reading back
 * from the document would put the old number straight back and the field could
 * never be emptied at all.
 */
function Limit({
  label,
  value,
  empty,
  onChange,
}: {
  label: string
  value: number | undefined
  empty: string
  onChange: (value: number | null) => void
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] text-neutral-600">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value === undefined ? '' : String(value)}
        placeholder={empty}
        onChange={(event) => {
          const typed = event.target.value.trim()
          // Empty is `null`, which `setRules` reads as "take it away" - as
          // opposed to `undefined`, which means "leave it alone".
          if (typed === '') {
            onChange(null)
            return
          }
          const parsed = Number(typed)
          // A zero or a negative is refused by the edit layer anyway; ignoring
          // it here means the field simply does not accept the keystroke rather
          // than accepting it and silently doing nothing.
          if (!Number.isFinite(parsed) || parsed <= 0) return
          onChange(parsed)
        }}
        className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:border-neutral-600 focus:outline-none"
      />
    </label>
  )
}

/**
 * What the two numbers and the sides add up to, in a sentence.
 *
 * Worth a line rather than leaving three fields to be read together, because
 * the interesting cases are the ones where they *disagree*: a board with four
 * seats and a `holds` of six is a level that will admit somebody with nowhere to
 * sit, and nothing else on this panel would ever say so.
 */
function seatsSay(
  rules: XpRules,
  teams: number,
  assign: Assign,
  t: XpEditorDict['mode'],
): string {
  const { min, max } = playersOf(rules)
  const one = assign === 'claim' || assign === 'order'
  const said =
    min === max
      ? fill(t.forExactly, { min })
      : rules.players?.min === undefined && rules.players?.max === undefined
        ? t.forAnybody
        : fill(t.forRange, { min, max })

  if (teams < 2 || !one) return said
  if (max > teams) {
    return fill(t.seatsSpare, { said, seats: teams, spare: max - teams })
  }
  return fill(t.seatsExactly, { said, seats: teams })
}
