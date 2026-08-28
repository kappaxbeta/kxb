'use client'

import { useMemo } from 'react'

import { rankOf, suitOf, type Card, type Suit } from '../rules/cards'
import { catchable, seatOf, type Seen } from '../rules/table'
import { backOf, faceOf, shapeOf, type Finish } from '../art/deck'
import { suitList, type Words } from './words'

/**
 * The pieces of the table, drawn.
 *
 * ---------------------------------------------------------------------------
 * Plain DOM, and that is a decision rather than a shortcut
 * ---------------------------------------------------------------------------
 * `@kxb/boxing` draws to a WebGL canvas because a fight is sixty frames a
 * second of two bodies moving through a ring, and there is no arrangement of
 * `<div>`s that is that. A card game is a handful of rectangles that change
 * when somebody presses one.
 *
 * The payoff is not simplicity. It is that **a card is a button**: a real one,
 * that a screen reader announces, that a keyboard reaches with Tab, that a
 * phone's browser knows how to scroll a row of. `docs/xp/server-authority.md`
 * §5 makes exactly this point in passing - *"the phone layout for a card game
 * is not five on-screen buttons"* - and every one of those affordances would
 * have to be rebuilt by hand on a canvas.
 *
 * There is a second reason, which is that this project's Browser pane never
 * fires `requestAnimationFrame`. A canvas game cannot be looked at there at
 * all; this one can.
 *
 * ---------------------------------------------------------------------------
 * Nothing here decides a rule
 * ---------------------------------------------------------------------------
 * Same line the boxing renderer draws. Everything below reads a `Seen` and
 * calls back; which cards are playable comes from `playableIn`, which is the
 * function the authority refuses with. A disabled card here is a *prediction of
 * a refusal* and nothing more - press it anyway and the server says no, which
 * is the arrangement working rather than failing.
 */

/** The size a card is drawn at, in CSS pixels, in each of the three places. */
export const SIZES = { hand: 84, table: 96, seat: 38 } as const

export interface CardProps {
  /** The card, or `undefined` for a face-down one. */
  card?: Card | null
  finish: Finish
  assets: string
  width: number
  className?: string
}

/**
 * One card.
 *
 * Face-down is `undefined` rather than a second component, which is what keeps
 * the callers from having to think about it: a hand renders `card`, the pile
 * renders nothing at all. See `faceOf` for why the margin - which one pack has
 * and the other does not - is subtracted inside the art module.
 */
export function CardFace({ card, finish, assets, width, className = '' }: CardProps) {
  const style = useMemo(
    () => (card === undefined ? backOf(finish, assets, width) : faceOf(card, finish, assets, width)),
    [card, finish, assets, width],
  )
  return <div className={`shrink-0 rounded-[6px] ${className}`} style={style} aria-hidden />
}

/**
 * The outline of a place where a card would be.
 *
 * Drawn rather than taken from a sheet, and that is why it is here: Kenney
 * ships a `card_empty` and KayKit does not, so an atlas cell for it would be a
 * cell one finish has to invent. A dashed border is two lines and is the same
 * in both.
 */
export function CardSlot({ finish, width }: { finish: Finish; width: number }) {
  return (
    <div
      className="shrink-0 rounded-[6px] border-2 border-dashed border-white/15"
      style={{ width, height: width / shapeOf(finish) }}
      aria-hidden
    />
  )
}

/**
 * The draw pile and the card everybody is playing on, side by side.
 *
 * The pile is a *stack* of two backs offset by a pixel or two rather than one,
 * because a single card and a pile of eleven look identical otherwise and the
 * count beneath it is doing all the work. When there is nothing left to draw it
 * becomes the empty outline the pack ships for the purpose.
 */
export function Middle({
  seen,
  finish,
  assets,
  words,
  onDraw,
  canDraw,
  busy,
}: {
  seen: Seen
  finish: Finish
  assets: string
  words: Words
  onDraw: () => void
  canDraw: boolean
  busy: boolean
}) {
  const owed = seen.owed
  const label = owed > 0 ? `${words.table.drawOwed} ${owed}` : words.table.draw

  return (
    <div className="flex items-center justify-center gap-6 sm:gap-10">
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onDraw}
          disabled={!canDraw || busy}
          aria-label={label}
          className="relative block rounded-lg transition enabled:hover:-translate-y-1 enabled:active:translate-y-0 disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
          style={{ width: SIZES.table, height: SIZES.table / shapeOf(finish) }}
        >
          {seen.pile > 1 ? (
            <CardFace
              finish={finish}
              assets={assets}
              width={SIZES.table}
              className="absolute left-1 top-1 opacity-60"
            />
          ) : null}
          {seen.pile > 0 ? (
            <CardFace finish={finish} assets={assets} width={SIZES.table} className="absolute left-0 top-0" />
          ) : (
            <div className="absolute left-0 top-0">
              <CardSlot finish={finish} width={SIZES.table} />
            </div>
          )}
        </button>
        <span className="text-[11px] uppercase tracking-wide text-white/45">
          {words.table.pile} · {seen.pile}
        </span>
      </div>

      <div className="flex flex-col items-center gap-2">
        {seen.top ? (
          <CardFace card={seen.top} finish={finish} assets={assets} width={SIZES.table} />
        ) : (
          <CardSlot finish={finish} width={SIZES.table} />
        )}
        {/*
          The wish, beside the card rather than composed into a sentence.

          `follows` deliberately refuses with a fixed phrase that does not name
          the suit - see `../rules/table.ts` - because a sentence built round a
          suit name cannot be translated. This is where the suit is actually
          said, and it needs no grammar around it.
        */}
        <span className="text-[11px] uppercase tracking-wide text-white/45">
          {seen.wish ? (
            <>
              {words.table.wished}{' '}
              <span
                className={`font-semibold ${redSuit(seen.wish) ? 'text-rose-300' : 'text-white'}`}
              >
                <span aria-hidden>{PIP[seen.wish]}</span> {words.suits[seen.wish]}
              </span>
            </>
          ) : (
            <>&nbsp;</>
          )}
        </span>
      </div>
    </div>
  )
}

/** Hearts and diamonds are red. Used only for colour, never for a rule. */
const redSuit = (suit: Suit) => suit === 'hearts' || suit === 'diamonds'

/**
 * The pip, drawn beside the suit's name wherever a wish is shown.
 *
 * Because a wish is the one thing on this table that exists only as a *word*.
 * Every other fact is a picture - the cards say what they are - and a jack's
 * wish is a suit nobody can see, printed in the reader's own language. Two
 * players on one table therefore read *Diamonds* and *Karo* for the same wish,
 * which is correct and looks exactly like a bug: it was reported as one.
 *
 * The pip is the half of the label that does not need translating.
 */
const PIP: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
}

/**
 * Everybody else at the table.
 *
 * Drawn as a back and a number rather than as a fan of unknown cards, which is
 * the honest picture: the *count* is what this client is told and what it is
 * entitled to. A fan of face-down cards would look like information it does not
 * have.
 */
export function Seats({
  seen,
  finish,
  assets,
  words,
  names,
  onCatch,
  busy,
}: {
  seen: Seen
  finish: Finish
  assets: string
  words: Words
  names: (id: string) => string
  onCatch: (who: string) => void
  busy: boolean
}) {
  const turn = seatOf(seen)
  const canCatch = catchable(seen)

  return (
    <div className="flex flex-wrap items-start justify-center gap-3 sm:gap-5">
      {seen.seats
        .filter((seat) => seat !== seen.me)
        .map((seat) => {
          const count = seen.counts[seat] ?? 0
          const theirTurn = turn === seat
          return (
            <div
              key={seat}
              className={`flex min-w-24 flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition ${
                theirTurn ? 'bg-white/10 ring-1 ring-white/30' : 'bg-white/[0.03]'
              }`}
            >
              <div className="flex items-end">
                {count > 0 ? (
                  <CardFace finish={finish} assets={assets} width={SIZES.seat} />
                ) : (
                  <CardSlot finish={finish} width={SIZES.seat} />
                )}
                {count > 1 ? (
                  <CardFace finish={finish} assets={assets} width={SIZES.seat} className="-ml-6" />
                ) : null}
              </div>
              <span className="max-w-28 truncate text-xs font-medium text-white/80">{names(seat)}</span>
              <span className="text-[11px] text-white/45">
                {count === 1 ? words.table.oneCard : `${count} ${words.table.cards}`}
              </span>
              {seen.said.includes(seat) ? (
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                  Mau
                </span>
              ) : null}
              {canCatch.includes(seat) ? (
                <button
                  type="button"
                  onClick={() => onCatch(seat)}
                  disabled={busy}
                  className="rounded-full bg-rose-500/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white transition hover:bg-rose-400 disabled:opacity-50"
                >
                  {words.table.catchThem}
                </button>
              ) : null}
            </div>
          )
        })}
    </div>
  )
}

/**
 * Your hand.
 *
 * A row that scrolls rather than a fan that overlaps beyond a point: a hand
 * grows by two every time somebody plays a seven, and a fan of fifteen cards on
 * a phone is fifteen cards nobody can tap the middle of. The overlap is
 * negative margin only while the row fits.
 */
export function Hand({
  seen,
  playable,
  finish,
  assets,
  words,
  onPlay,
  busy,
  yours,
}: {
  seen: Seen
  playable: Card[]
  finish: Finish
  assets: string
  words: Words
  onPlay: (card: Card) => void
  busy: boolean
  yours: boolean
}) {
  return (
    <div className="flex w-full justify-start gap-1.5 overflow-x-auto px-4 pb-3 pt-8 sm:justify-center">
      {seen.hand.map((card, at) => {
        const allowed = playable.includes(card)
        return (
          <button
            key={`${card}-${at}`}
            type="button"
            onClick={() => onPlay(card)}
            disabled={!yours || !allowed || busy}
            title={nameOfCard(card, words)}
            aria-label={nameOfCard(card, words)}
            className={`shrink-0 rounded-lg transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 ${
              allowed && yours
                ? 'hover:-translate-y-3 active:-translate-y-1'
                : 'opacity-40 saturate-50 cursor-not-allowed'
            }`}
            style={{ width: SIZES.hand, height: SIZES.hand / shapeOf(finish) }}
          >
            <CardFace card={card} finish={finish} assets={assets} width={SIZES.hand} />
          </button>
        )
      })}
    </div>
  )
}

/**
 * A card's name, in the reader's language, for the tooltip and the label.
 *
 * Assembled from two words and no grammar, which is the one composition that
 * survives both languages: *"Herz 7"* and *"Hearts 7"* are both what a player
 * would say. `nameOf` in `../rules/cards.ts` is the English-only version and is
 * for logs; this is the one a person reads.
 */
export const nameOfCard = (card: Card, words: Words): string => {
  const suit = suitOf(card)
  const rank = rankOf(card)
  return suit && rank ? `${words.suits[suit]} ${rank}` : card
}

/**
 * The suit picker, shown when a jack is on its way down.
 *
 * A dialog rather than four buttons in the hand, because it is a *second half*
 * of one move: the jack is not played until a suit is named, and `legal`
 * refuses it without one. Cancelling puts the card back, which is what makes
 * tapping a jack by accident survivable.
 */
export function Wish({
  words,
  onPick,
  onCancel,
}: {
  words: Words
  onPick: (suit: Suit) => void
  onCancel: () => void
}) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-neutral-900 p-5 shadow-2xl">
        <h3 className="mb-4 text-center text-sm font-semibold uppercase tracking-widest text-white/70">
          {words.table.wishWhich}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {suitList(words).map(({ suit, label }) => (
            <button
              key={suit}
              type="button"
              onClick={() => onPick(suit)}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition ${
                redSuit(suit)
                  ? 'bg-rose-500/15 text-rose-200 hover:bg-rose-500/30'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {/* The pip, so the button you press and the label everybody else
                  reads are recognisably the same thing. See `PIP`. */}
              <span className="text-xl leading-none" aria-hidden>
                {PIP[suit]}
              </span>
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 w-full rounded-xl px-4 py-2 text-sm text-white/50 transition hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

/**
 * The strip that says whose turn it is, and what just went wrong.
 *
 * One place for both, because they are the same question from the player's
 * side - *can I do something right now, and if not why not* - and two separate
 * strips would mean the refusal appearing above or below the turn depending on
 * which arrived last.
 */
export function Banner({
  seen,
  words,
  names,
  refusal,
  busy,
}: {
  seen: Seen
  words: Words
  names: (id: string) => string
  refusal: { why: string; message: string } | null
  busy: boolean
}) {
  if (refusal) {
    /**
     * `lost` is said differently, and that is the whole reason `XpRefusal` has
     * three values. "The rules said no" and "we never heard back" are different
     * facts, and showing the second as the first tells a player their move was
     * illegal when the truth is that it may well have happened.
     */
    const unresolved = refusal.why === 'lost'
    return (
      <p
        role="status"
        className={`rounded-full px-4 py-1.5 text-sm font-medium ${
          unresolved ? 'bg-amber-400/15 text-amber-200' : 'bg-rose-500/15 text-rose-200'
        }`}
      >
        {refusal.message}
      </p>
    )
  }

  const turn = seatOf(seen)
  const mine = turn === seen.me

  return (
    <p
      role="status"
      className={`rounded-full px-4 py-1.5 text-sm font-medium ${
        mine ? 'bg-emerald-400/15 text-emerald-200' : 'text-white/50'
      }`}
    >
      {busy ? '…' : mine ? words.table.yourTurn : `${words.table.waitingFor} ${names(turn ?? '')}`}
    </p>
  )
}
