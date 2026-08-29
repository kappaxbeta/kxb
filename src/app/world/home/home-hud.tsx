'use client'

import { useMemo } from 'react'
import { fill } from '@/app/i18n/fill'
import { homeDict, type HomeDict, homeItemWords } from '@/app/i18n/home'
import { useLocale } from '@/app/i18n/locale-context'
import {
  actionKey,
  ControlsPanel,
  gesture,
  HelpButton,
  key,
  mouse,
  PaletteTile,
  row,
  useControlsPanel,
  wasd,
  type ControlRow,
} from '@/app/world/_hud/hud'
import type { Mode } from '@/app/world/home/home-scene'
import {
  homeProp,
  propsFor,
  propThumbUrl,
  refundOf,
  type Theme,
} from '@kxb/peepz-world/catalog'
import {
  comfort,
  contentsValue,
  type HomeState,
  MAX_COMFORT,
  propAt,
  type Verdict,
} from '@kxb/peepz-world/game'
import type { Exit } from '@kxb/peepz-world/plan'
import type { TileKey } from '@kxb/peepz-world/grid'
import type { DecoratablePlace } from '@kxb/peepz-world/places'

/**
 * Selling the ground under the cursor, when that is a thing you could do.
 *
 * `null` unless the square is bought ground - the house the plan came with is
 * never for sale, and neither is a field nobody owns. Present-but-refused
 * carries the reason, because "that would cut off part of the house" is the
 * one refusal nobody guesses from looking.
 */
export interface GroundSale {
  ok: boolean
  why: string | null
  refund: number
}

/**
 * Everything the player needs to know that the room cannot tell them.
 *
 * Deliberately thin, for the reason the café's is: the furniture is the progress
 * bar, and what it cannot show is the balance, the way out, and why the square
 * under the cursor is red.
 */

/** The house's own readouts. A softened `.hud-chip` - rectangular, because
 *  these hold two lines rather than one. */
const PANEL =
  'rounded-xl border border-[var(--color-line)] bg-[oklch(0.12_0.04_285/0.75)] px-3 py-2 text-[var(--color-ink)] backdrop-blur'

export function HomeHud({
  state,
  here,
  mode,
  room,
  locked,
  started,
  ready,
  exit,
  verdict,
  useLabel,
  extendCost,
  groundSale,
  focus,
  selected,
  moving,
  isTouch,
  compact,
  onSelect,
  onRotate,
  onSell,
  onMove,
  onMode,
  onAct,
}: {
  state: HomeState
  here: DecoratablePlace
  mode: Mode
  /** The room under the cursor, which is what the palette is filtered to. */
  room: Theme
  locked: boolean
  started: boolean
  ready: boolean
  /** The journey the square underfoot offers, if any. */
  exit: Exit | null
  /** Why the current click would be refused, when it would be. */
  verdict: Verdict | null
  /** What E would do to the furniture under the crosshair - sit, lie, get up. */
  useLabel: string | null
  /** Price of the square under the cursor, when it is not part of the house yet. */
  extendCost: number | null
  /** Selling the ground under the cursor, when that is possible. */
  groundSale: GroundSale | null
  focus: TileKey | null
  selected: string
  moving: TileKey | null
  isTouch: boolean
  compact: boolean
  onSelect: (id: string) => void
  onRotate: () => void
  onSell: () => void
  onMove: () => void
  onMode: (mode: Mode) => void
  /** E: take the doorway if there is one, otherwise use the furniture. */
  onAct: () => void
}) {
  const t = homeDict(useLocale())
  const cosy = useMemo(() => comfort(state), [state])
  const worth = useMemo(() => contentsValue(state), [state])
  const outdoors = here === 'outdoor'
  const help = useControlsPanel()

  /**
   * On a phone the palette owns the top of the screen, so the readouts stand
   * down while decorating - they are about the house, and you are not looking at
   * the house, you are rearranging it.
   */
  const showStats = !(compact && mode === 'decorate')

  return (
    <>
      {/* --- purse and comfort, top left --- */}
      <div
        className={`pointer-events-none absolute left-[var(--hud-edge-x)] top-[var(--hud-edge-top)] flex flex-col gap-2 ${
          showStats ? '' : 'hidden'
        }`}
      >
        <div className={`${PANEL} flex items-center gap-3`}>
          <span className="text-xl font-semibold tabular-nums text-amber-300">
            {state.coins}
            <span className="ml-1 text-xs font-normal text-amber-200/70">{t.coins}</span>
          </span>
          <span className="h-6 w-px bg-white/15" />
          <Stat label={t.comfort} value={`${cosy}/${MAX_COMFORT}`} />
          {!compact && <Stat label={t.inFurniture} value={worth} />}
        </div>

        {/* Desktop only. It is a sentence explaining the economy, which is
            worth reading once and never again - and on a phone it was 64
            characters of prose sitting on top of the room. */}
        {!compact && (
          <div className={`${PANEL} max-w-64 text-[11px] text-[var(--color-ink-muted)]`}>
            {/* Split on the number so it can keep its colour without the
                sentence being assembled out of three dictionary keys. */}
            {t.economy.split('{n}').map((part, index) => (
              <span key={index}>
                {part}
                {index === 0 && <span className="text-amber-300">{cosy}</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* --- where you are, top right ---
          Desktop only. On a phone the top right is where the help and mode
          controls now live, and the room's name is already the heading of the
          decorate sheet and the subtitle of the controls panel. */}
      {!compact && (
        <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-2">
          <div className="hud-chip">
            <span className="opacity-60">{outdoors ? t.outside : t.inside}</span>
            <span className="text-[var(--color-ink)]">{t.themes[room]}</span>
          </div>
        </div>
      )}

      {/* --- crosshair --- */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 shadow" />

      {/* --- what E would do: leave, or get into the furniture --- */}
      {mode === 'look' && (exit || useLabel) && (
        <div className="pointer-events-auto absolute left-1/2 top-[58%] -translate-x-1/2">
          <button
            type="button"
            onClick={onAct}
            className="rounded-xl border border-amber-300/50 bg-amber-400/20 px-4 py-2 text-sm text-white backdrop-blur transition hover:bg-amber-400/30"
          >
            {!isTouch && (
              <kbd className="mr-2 rounded bg-white/15 px-1.5 py-0.5 text-xs">E</kbd>
            )}
            {/* The doorway wins, because a chair against the front door would
                otherwise trap you in your own house. */}
            {exit ? exit.label : useLabel}
          </button>
        </div>
      )}

      {/* --- why the cursor is red --- */}
      {mode === 'decorate' && verdict && !verdict.ok && (
        <div className="pointer-events-none absolute left-1/2 top-[58%] -translate-x-1/2">
          <div className="rounded-xl border border-red-400/40 bg-red-500/25 px-3 py-1.5 text-sm text-white backdrop-blur">
            {verdict.why}
          </div>
        </div>
      )}

      {mode === 'decorate' && (
        <DecoratePanel
          state={state}
          room={room}
          focus={focus}
          selected={selected}
          moving={moving}
          extendCost={extendCost}
          groundSale={groundSale}
          compact={compact}
          onSelect={onSelect}
          onRotate={onRotate}
          onSell={onSell}
          onMove={onMove}
        />
      )}

      {/* A quiet nudge when the mouse is free: the game is still playable. */}
      {started && !locked && !isTouch && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2">
          <div className={`${PANEL} text-[11px] text-white/60`}>
            {t.mouseHint}
          </div>
        </div>
      )}

      {/*
        Mode, and the way back to the keys.

        The key list that used to live here is in the controls panel now. It was
        eleven lines of permanently-on chrome in the corner of a room the player
        is meant to be looking at, and on a phone it was parked in the middle of
        the screen at `bottom-40` - directly over the view, because the bottom
        corners were already the thumbstick and the action button.

        Which is the whole answer to "the HUD is in the way": on touch this is
        now two round controls at the top edge, and everything they used to say
        is one tap away.
      */}
      <div
        className={
          compact
            ? 'pointer-events-auto absolute right-[var(--hud-edge-x)] top-[var(--hud-edge-top)] z-20 flex items-center gap-2'
            : 'pointer-events-auto absolute right-[var(--hud-edge-x)] top-[100px] z-20 flex items-center gap-2'
        }
      >
        <HelpButton onClick={help.show} />
        <button
          type="button"
          onClick={() => onMode(mode === 'look' ? 'decorate' : 'look')}
          className="hud-chip"
        >
          {mode === 'look' ? t.decorate : t.done}
          {!isTouch && <kbd className="rounded bg-white/15 px-1">Tab</kbd>}
        </button>
      </div>

      {/*
        The controls, which are also the door in.

        While the models are still loading it says so instead of listing keys -
        the keys would be a promise the scene cannot keep yet, and "click to
        come in" on a house that has not finished unpacking is an instruction
        that does nothing.
      */}
      <ControlsPanel
        open={!started || help.open}
        interactive={started}
        isTouch={isTouch}
        rows={ready ? homeControls(isTouch, mode, t) : []}
        intro={
          ready
            ? outdoors
              ? t.theGarden
              : t.themes[room]
            : outdoors
              ? t.growingGarden
              : t.openingHouse
        }
        onClose={help.hide}
      />
    </>
  )
}

/**
 * What the house's controls are.
 *
 * Two lists because the house has two modes: walking around it, and
 * rearranging it. Showing both at once was the old panel's problem - eleven
 * rows, six of which did nothing until you pressed Tab.
 */
function homeControls(isTouch: boolean, mode: Mode, t: HomeDict): ControlRow[] {
  const c = t.controls

  if (isTouch) {
    return mode === 'look'
      ? [
          row([gesture('stick')], c.move),
          row([gesture('pan')], c.dragToLook),
          row([actionKey(c.use)], c.sitSleepLeave),
          row([actionKey(t.decorate)], c.rearrange),
        ]
      : [
          row([gesture('stick')], c.move),
          row([actionKey(c.place)], c.putItDown),
          row([actionKey(c.turn)], c.rotate),
          row([actionKey(c.sell)], c.sellItBack),
          row([actionKey(t.done)], c.stopDecorating),
        ]
  }

  /* `Shift`, `Tab`, `Esc`, `Wheel` and the letters are keycaps - see the note
     at the top of `@/app/i18n/world`. Only the labels beside them translate. */
  return mode === 'look'
    ? [
        row([wasd()], c.move),
        row([key('Shift')], c.run),
        row([key(c.arrows)], c.look),
        row([actionKey('E')], c.sitSleepLeave),
        row([actionKey('Tab')], t.decorate),
        row([key('L')], c.mouseLook),
        row([key('Esc')], c.freeMouse),
      ]
    : [
        row([mouse('left')], c.place),
        row([mouse('right'), actionKey('X')], c.sell),
        row([actionKey('G')], c.pickUpAndMove),
        row([actionKey('R')], c.rotate),
        row([key(c.wheel)], c.changeItem),
        row([actionKey('Tab')], t.done),
      ]
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="flex items-baseline gap-1 text-xs text-white/60">
      <span className="font-medium tabular-nums text-white">{value}</span>
      {label}
    </span>
  )
}

/**
 * The catalogue, filtered to the room under the cursor.
 *
 * Filtering rather than greying out the rest: the pack has a hundred and eighty
 * usable models, and a palette that showed all of them would be a scrolling list
 * nobody reads. What room you are pointing at is the one piece of context that
 * cuts it down to a screenful, and it is context the player already has.
 */
function DecoratePanel({
  state,
  room,
  focus,
  selected,
  moving,
  extendCost,
  groundSale,
  compact,
  onSelect,
  onRotate,
  onSell,
  onMove,
}: {
  state: HomeState
  room: Theme
  focus: TileKey | null
  selected: string
  moving: TileKey | null
  extendCost: number | null
  groundSale: GroundSale | null
  compact: boolean
  onSelect: (id: string) => void
  onRotate: () => void
  onSell: () => void
  onMove: () => void
}) {
  const t = homeDict(useLocale())
  const chosen = homeProp(selected)
  const under = focus ? propAt(state, focus) : undefined
  const held = moving ? state.props.get(moving) : undefined
  const heldDef = held ? homeProp(held.propId) : undefined
  const options = useMemo(() => propsFor(room), [room])

  return (
    <div
      className={
        compact
          ? // A sheet across the top on a phone: the bottom belongs to the
            // thumbstick and the action button, and the middle has to stay clear
            // because that is where you drag to look. It starts below the help
            // and mode chips rather than at the very top, which is the row it
            // would otherwise cover.
            'pointer-events-auto absolute inset-x-2 top-[calc(var(--hud-edge-top)+3.25rem)] z-10 max-h-[38vh] overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[oklch(0.1_0.04_285/0.88)] p-3 text-[var(--color-ink)] backdrop-blur'
          : 'pointer-events-auto absolute bottom-4 left-4 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[oklch(0.1_0.04_285/0.82)] p-3 text-[var(--color-ink)] backdrop-blur'
      }
    >
      <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold">
        {t.themes[room]}
        <span className="text-[11px] font-normal text-white/40">
          {fill(t.panel.things, { n: options.length })}
        </span>
      </h2>

      {heldDef ? (
        <div className="mb-3 rounded-lg border border-amber-300/40 bg-amber-300/10 px-2 py-1.5 text-[11px] text-amber-100">
          {fill(t.panel.carrying, { name: homeItemWords(t, heldDef).name })}
        </div>
      ) : (
        <div className="mb-3 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-white/70">
          {!focus && t.panel.lookAtSquare}
          {focus && extendCost !== null && (
            /* The price keeps its colour, so the split is on `{cost}` and the
               room's name is filled in normally. */
            <>
              {fill(t.panel.bareGround, { room: t.themes[room], cost: '\u0000' })
                .split('\u0000')
                .map((part, index) => (
                  <span key={index}>
                    {part}
                    {index === 0 && (
                      <span
                        className={
                          state.coins >= extendCost ? 'text-amber-300' : 'text-red-300'
                        }
                      >
                        {extendCost}
                      </span>
                    )}
                  </span>
                ))}
            </>
          )}
          {focus && extendCost === null && under && (
            <>{fill(t.panel.somethingHere, { name: homeItemWords(t, under.def).name })}</>
          )}
          {focus && extendCost === null && !under && (
            <>
              {fill(t.panel.emptySquare, {
                name: chosen ? homeItemWords(t, chosen).name : t.panel.something,
              })}
              {/*
                Shrinking is the half of resizing nobody looks for, so the
                square that can go says so rather than waiting to be guessed
                at. Bought ground only: the house the plan came with is never
                for sale, and saying so on every square would be noise.
              */}
              {groundSale?.ok && (
                <> {fill(t.panel.orSellGround, { n: groundSale.refund })}</>
              )}
              {groundSale && !groundSale.ok && (
                <span className="text-white/50"> {groundSale.why}</span>
              )}
            </>
          )}
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-1">
        <PanelButton
          onClick={onMove}
          disabled={!heldDef && !under}
          hint="G"
          tone="plain"
        >
          {heldDef ? t.panel.cancelMove : t.panel.move}
        </PanelButton>
        {/*
          One button for both, because it is one idea: sell what is under the
          cursor. Furniture first, then the ground it was standing on - which
          is the order you would do it in anyway, and the order `doSell`
          resolves them in.
        */}
        <PanelButton
          onClick={onSell}
          disabled={!!heldDef || (!under && !groundSale?.ok)}
          hint="X"
          tone="danger"
        >
          {under
            ? fill(t.panel.sellFor, { n: refundOf(under.def) })
            : groundSale?.ok
              ? fill(t.panel.sellGroundFor, { n: groundSale.refund })
              : t.panel.sell}
        </PanelButton>
        <PanelButton onClick={onRotate} disabled={false} hint="R" tone="plain">
          {t.controls.rotate}
        </PanelButton>
      </div>

      <div className={compact ? 'grid grid-cols-4 gap-1' : 'grid grid-cols-3 gap-1'}>
        {options.map((entry) => {
          const words = homeItemWords(t, entry)
          return (
            <PaletteTile
              key={entry.id}
              src={propThumbUrl(entry.id)}
              name={words.name}
              price={entry.price}
              bonus={entry.comfort}
              active={entry.id === selected}
              affordable={state.coins >= entry.price}
              title={words.blurb ?? words.name}
              onClick={() => onSelect(entry.id)}
            />
          )
        })}
      </div>

      {chosen?.blurb && (
        <p className="mt-3 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-white/60">
          {chosen.blurb}
        </p>
      )}
    </div>
  )
}

/** A panel action, with the key that also does it. */
function PanelButton({
  children,
  onClick,
  disabled,
  hint,
  tone,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled: boolean
  hint: string
  tone: 'plain' | 'good' | 'danger'
}) {
  const tones = {
    plain: 'border-white/15 bg-white/5 hover:bg-white/15',
    good: 'border-emerald-400/40 bg-emerald-400/10 hover:bg-emerald-400/20',
    danger: 'border-red-400/40 bg-red-400/10 hover:bg-red-400/20',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-between gap-1 rounded-lg border px-2 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent ${tones[tone]}`}
    >
      <span className="truncate">{children}</span>
      <kbd className="shrink-0 rounded bg-black/40 px-1 text-white/60">{hint}</kbd>
    </button>
  )
}
