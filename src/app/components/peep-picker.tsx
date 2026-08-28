'use client'

import Image from 'next/image'
import { AVATARS } from '@/domain/lounge/avatars'

/**
 * The whole roster as a grid of faces, one of them yours.
 *
 * Deliberately not the settings page's picker. That one renders the real GLB in
 * a live canvas, which is the right trade when somebody has already arrived,
 * knows what a peep is and came specifically to change theirs. This one runs at
 * the two moments where the opposite is true - the first minute of an account,
 * and the first second inside a workspace - so it uses the same static renders
 * the landing page does: no three.js, no Suspense, no waiting to find out what
 * a beaver looks like. Twenty-four thumbnails also answers "what are my
 * options" in one glance, which one big canvas cannot.
 *
 * Presentational and uncontrolled by design: it holds no selection of its own
 * and saves nothing. Both callers already own that state for their own reasons
 * - one is a wizard step, the other is a window with a Continue button - and a
 * component that both renders the grid and decides what a click means would
 * have to be told which of those it is.
 */
export function PeepPicker({
  selected,
  onSelect,
  disabled = false,
}: {
  selected: string
  onSelect: (avatar: string) => void
  disabled?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Your peep"
      className="grid grid-cols-4 gap-1.5 sm:grid-cols-6"
    >
      {AVATARS.map((avatar) => {
        const isCurrent = avatar === selected
        return (
          <button
            key={avatar}
            type="button"
            role="radio"
            aria-checked={isCurrent}
            aria-label={avatar}
            disabled={disabled}
            onClick={() => onSelect(avatar)}
            className={`group relative flex flex-col items-center gap-0.5 rounded-xl border p-1.5 transition disabled:opacity-60 ${
              isCurrent
                ? 'border-accent bg-accent/15'
                : 'border-line/60 hover:border-accent/60 hover:bg-surface-raised'
            }`}
          >
            <Image
              src={`/xo/shots/${avatar}-front.webp`}
              alt=""
              width={128}
              height={128}
              /* The first row is what a new arrival is looking at while the page
                 settles; the rest can stream in as they scan down. */
              loading={isCurrent ? 'eager' : 'lazy'}
              className="h-12 w-12 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition group-hover:scale-110 sm:h-14 sm:w-14"
            />
            <span
              className={`w-full truncate text-center text-[10px] capitalize ${
                isCurrent ? 'font-semibold text-accent' : 'text-ink-muted'
              }`}
            >
              {avatar}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * The one you have picked, big.
 *
 * A three-quarter render rather than the grid's front-on one: the same reason
 * the settings canvas turns its model off-axis, which is that a head-on shot
 * reads as a mugshot and a three-quarter one reads as a character.
 */
export function PeepPortrait({ avatar }: { avatar: string }) {
  return (
    <Image
      key={avatar}
      src={`/xo/shots/${avatar}-three.webp`}
      alt=""
      width={512}
      height={512}
      priority
      className="peep-portrait h-32 w-32 object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.45)] sm:h-40 sm:w-40"
    />
  )
}
