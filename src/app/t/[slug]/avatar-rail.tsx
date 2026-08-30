'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { AVATARS, avatarShotUrl } from '@/domain/lounge/avatars'
import { chooseAvatar, chooseSpaceAvatar } from '@/domain/profile/avatar-actions'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Which animal you are, in the rail.
 *
 * ---------------------------------------------------------------------------
 * Why here as well as in settings
 * ---------------------------------------------------------------------------
 * The picker on the settings page is the same choice and it is behind a door
 * guests cannot open: `/t/<slug>/settings/profile` needs a tenant and a
 * membership, and a visitor has neither. So the one group of people most likely
 * to be a row of identical penguins had no way at all to stop being one -
 * reported as *"the peeps choose in guests dont work"*, and also asked for as a
 * thing the room itself should offer.
 *
 * It is not gated on membership here, deliberately, and it is the same argument
 * `unstick-button` makes two panels down: being one of four identical animals
 * is not a thing that should check whether you were invited. The action behind
 * it already refuses to dress anybody but the caller - see `chooseAvatar`,
 * which takes the actor from the session and nothing from the input.
 *
 * ---------------------------------------------------------------------------
 * Stills, not a canvas
 * ---------------------------------------------------------------------------
 * The settings picker renders the real model, which is right on a page you came
 * to on purpose: one canvas, loading only the animal you are looking at. A rail
 * is not that page. It sits open beside a running world for the whole session,
 * and a second WebGL context alongside a level is a cost nobody asked for -
 * so this is the pre-rendered sheet the pack already ships, twenty-four
 * pictures that are pictures.
 */
export function AvatarRail({
  initial,
  hereOnly,
  slug,
  hasSkinShop,
}: {
  initial: string
  /** Whether the animal shown is an override for this space rather than yours. */
  hereOnly: boolean
  slug: string
  /** Whether the skin shop is open - decides if the door to it is drawn. */
  hasSkinShop: boolean
}) {
  const refusal = useRefusal()
  const t = railDict(useLocale()).avatar
  const [chosen, setChosen] = useState(initial)
  const [here, setHere] = useState(hereOnly)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  /**
   * The costume changes on click, not on the answer.
   *
   * `useState` and a manual rollback rather than `useOptimistic`, which is the
   * house rule for rails: nothing revalidates this list, so an optimistic value
   * has nothing to be confirmed against and snaps back the moment the
   * transition ends.
   */
  function pick(animal: string) {
    if (animal === chosen || pending) return
    const was = chosen
    setChosen(animal)
    setError(null)
    start(async () => {
      // Whichever scope the switch is on. Two actions rather than one that
      // branches, because "who am I" and "who am I here" are different
      // questions - see `chooseSpaceAvatar`.
      const result = here ? await chooseSpaceAvatar(slug, animal) : await chooseAvatar(animal)
      if (!result.ok) {
        setChosen(was)
        setError(refusal(result.error))
      }
    })
  }

  return (
    <section>
      <p className="mb-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
        {t.youAre}
      </p>

      <div className="grid grid-cols-6 gap-1 px-1">
        {AVATARS.map((animal) => (
          <button
            key={animal}
            type="button"
            onClick={() => pick(animal)}
            aria-pressed={animal === chosen}
            aria-label={animal}
            title={animal}
            className={`aspect-square overflow-hidden rounded-lg border transition-colors ${
              animal === chosen
                ? 'border-accent bg-accent/15'
                : 'border-line hover:border-ink-muted'
            }`}
          >
            {/*
              Plain `img`, not `next/image`: these are twenty-four small static
              files the pack ships, and routing them through the optimiser buys
              nothing but a request per animal on a panel that draws all of them
              at once.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarShotUrl(animal)}
              alt=""
              loading="lazy"
              className="h-full w-full object-contain"
            />
          </button>
        ))}
      </div>

      {/*
        Which of the two questions this picker is answering.

        A switch rather than two grids, because it is the *same* twenty-four
        animals either way and the only thing that changes is how far the answer
        reaches. Turning it off deletes the override rather than writing your
        profile's animal into it - "unset" and "the same animal on purpose" are
        different states, and only the first one follows you if you change your
        profile later.
      */}
      <label className="mt-2 flex items-center gap-2 px-1 font-mono text-[10px] text-ink-muted">
        <input
          type="checkbox"
          checked={here}
          disabled={pending}
          onChange={(event) => {
            const wants = event.target.checked
            setHere(wants)
            start(async () => {
              const result = wants
                ? await chooseSpaceAvatar(slug, chosen)
                : await chooseSpaceAvatar(slug, null)
              if (!result.ok) {
                setHere(!wants)
                setError(refusal(result.error))
              }
            })
          }}
        />
        {t.justHere}
      </label>

      <p className="mt-1 px-1 font-mono text-[10px] leading-tight text-ink-muted">
        {error ?? (here ? t.onlyHere : t.everywhere)}
      </p>

      {/*
        The door to the skin shop, only while the shop is open - see
        `SidebarFeatures.skinShop`. Offered to guests too, like the animals
        above: the shop lets anybody browse, and refuses buying on its own
        terms rather than being hidden from the people it would refuse.
      */}
      {hasSkinShop && (
        <p className="mt-2 px-1 font-mono text-[10px] leading-tight text-ink-muted">
          <Link href="/skins" className="text-ink underline underline-offset-2">
            {t.skinsLink}
          </Link>{' '}
          — {t.skinsHint}
        </p>
      )}
    </section>
  )
}
