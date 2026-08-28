'use client'

import Image from 'next/image'
import { useActionState, useEffect, useRef, useState } from 'react'
import { enterAsGuest, type DoorResult } from '@/app/g/[token]/enter'
import { GUEST_NAME_MAX } from '@/domain/guests/application'
import { AVATARS, avatarShotUrl, DEFAULT_AVATAR } from '@/domain/lounge/avatars'
import { claimedName } from '@/lib/telegram/webapp'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Name, body, in.
 *
 * A client component because the action can fail in ways worth showing - a
 * link spent in the seconds since the page rendered, or a room that filled up -
 * and those deserve different words, which is why `enterAsGuest` returns the
 * sentence rather than a boolean. On success it redirects and this never
 * re-renders, so there is no success state to write.
 *
 * The avatar matters more here than it does for a member. A member picks one
 * once and is known by their handle thereafter; a room of guests who all
 * skipped the choice is a room of identical penguins, and the nameplate is the
 * only thing telling them apart. So the choice is offered at the door rather
 * than buried in a settings page a guest has no access to - and it starts
 * shuffled, so skipping it still produces a room of different animals.
 */

function randomAvatar(): string {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)] ?? DEFAULT_AVATAR
}

export function DoorForm({ token }: { token: string }) {
  const refusal = useRefusal()
  const [state, formAction, pending] = useActionState<DoorResult | null, FormData>(
    async (_previous, formData) => enterAsGuest(token, formData),
    null,
  )

  /**
   * Seeded at random rather than at the default - but *after* mount.
   *
   * A fixed starting avatar means everybody who does not care is the same
   * animal, which is the exact outcome the picker exists to avoid, and the
   * people who do not care are the majority. Random by default means the lazy
   * path already produces a varied room.
   *
   * ---------------------------------------------------------------------------
   * Why it cannot be rolled in the initialiser
   * ---------------------------------------------------------------------------
   * This is a client component and Next still renders it on the server. A lazy
   * `useState(() => randomAvatar())` therefore rolls *twice* - once into the
   * HTML and once during hydration - and the two disagree about nine times in
   * ten. React reports it as a hydration mismatch naming the two animals:
   *
   *     - alt="bee"          (the server's roll)
   *     + alt="caterpillar"  (the client's)
   *
   * and then, as the message says, does not patch it up. So the picture and the
   * value submitted with the form could be two different animals.
   *
   * Rolling in an effect makes the first paint deterministic - everybody's HTML
   * says the default - and shuffles a frame later, on the client, where random
   * is allowed to be random. The visible cost is one frame of the default
   * avatar, which is the same trade the name field below already makes for the
   * same reason.
   */
  const [avatar, setAvatar] = useState<string>(DEFAULT_AVATAR)

  /**
   * Rolled once, and never over a choice.
   *
   * The dependency array is empty *and* the guard is on `pickerOpen` being
   * untouched, because a re-run would silently replace an animal somebody
   * picked on purpose.
   */
  const rolled = useRef(false)
  useEffect(() => {
    if (rolled.current) return
    rolled.current = true
    setAvatar(randomAvatar())
  }, [])

  /** The full grid, hidden until asked for. See the note where it renders. */
  const [pickerOpen, setPickerOpen] = useState(false)

  /**
   * The name field, filled in for somebody who arrived from Telegram.
   *
   * Written through a ref rather than made a controlled input, and that is the
   * whole design: this is a *suggestion*, and the moment it becomes state the
   * component owns, it starts fighting the person typing over it.
   *
   * Three rules follow from it being only a suggestion. It is applied after
   * mount, because the answer is in a URL fragment the server never saw. It is
   * applied *once*. And it does not overwrite anything - a field with
   * characters in it belongs to whoever typed them, which also covers the
   * browser's own autofill getting there first.
   *
   * The name is Telegram's word and nothing checks it. That is fine for what it
   * does: the worst case is that somebody edits a name they were going to type
   * anyway, and it saves a keyboard appearing on a phone for a room they have
   * already decided to walk into.
   */
  const name = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const field = name.current
    if (!field || field.value) return
    const suggestion = claimedName()
    if (!suggestion) return
    field.value = suggestion.slice(0, GUEST_NAME_MAX)
    // Selected rather than left with a caret at the end, so the first keystroke
    // replaces it. Somebody who wants to be someone else in here should not
    // have to hold backspace to do it.
    field.select()
  }, [])

  /** Roll again, never landing on the one already showing. */
  const shuffle = () => {
    setAvatar((current) => {
      if (AVATARS.length < 2) return current
      let next = current
      // A shuffle button that can return what you are already looking at feels
      // broken rather than random - you press it and nothing happens.
      while (next === current) next = randomAvatar()
      return next
    })
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* The body, and the two ways to change it. */}
      <div className="flex flex-col items-center gap-2">
        <div className="relative size-24 overflow-hidden rounded-full border border-line bg-surface">
          {/* A render, not the model. `avatarUrl` is the `.glb` the lounge
              loads, and next/image drew exactly nothing from it - which is how
              this door reached kxb.team with an empty circle on it. */}
          <Image
            src={avatarShotUrl(avatar)}
            alt={avatar}
            fill
            sizes="96px"
            className="object-contain p-1"
            priority
          />
        </div>

        <input type="hidden" name="avatar" value={avatar} />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={shuffle}
            className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink-muted transition hover:border-accent hover:text-accent"
          >
            🎲 Shuffle
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            aria-expanded={pickerOpen}
            className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink-muted transition hover:border-accent hover:text-accent"
          >
            Choose
          </button>
        </div>

        {/* Collapsed by default: twenty-four animals above the name field would
            make the door look like a character creator, and most people just
            want to get in. */}
        {pickerOpen && (
          <div className="grid max-h-40 grid-cols-6 gap-1 overflow-y-auto rounded-lg border border-line bg-surface p-2">
            {AVATARS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setAvatar(option)}
                aria-label={option}
                aria-pressed={option === avatar}
                className={`relative size-9 rounded-md border transition ${
                  option === avatar
                    ? 'border-accent bg-surface-raised'
                    : 'border-transparent hover:border-line'
                }`}
              >
                <Image
                  src={avatarShotUrl(option)}
                  alt={option}
                  fill
                  sizes="36px"
                  className="object-contain p-0.5"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <label htmlFor="guest-name" className="sr-only">
          Your name
        </label>
        <input
          id="guest-name"
          ref={name}
          name="name"
          type="text"
          autoComplete="off"
          maxLength={GUEST_NAME_MAX}
          placeholder="Your name"
          // Autofocus is right here and would be wrong almost anywhere else:
          // this page has one field and the visitor arrived intending to use it.
          autoFocus
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
        />

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? 'Letting you in…' : 'Walk in'}
        </button>

        {/*
          A guest never sees the sign-up form, so this is the only place the
          house rules can be put in front of them - and § 3.2 of the terms says
          walking in is what accepts them, which is only true if they were
          shown. Deliberately one quiet line rather than the member notice: a
          guest is here for the next ten minutes and free of charge, and a wall
          of legal text at a door is how a door stops being walked through.

          English only, like the rest of this form. The guest door is not part
          of the translated public site; it is reached by link.
        */}
        <p className="text-center text-[11px] leading-relaxed text-ink-muted">
          By walking in you accept the{' '}
          <a href="/agb/en" target="_blank" rel="noreferrer" className="hover:text-accent hover:underline">
            house rules
          </a>{' '}
          and the{' '}
          <a
            href="/datenschutz/en"
            target="_blank"
            rel="noreferrer"
            className="hover:text-accent hover:underline"
          >
            privacy policy
          </a>
          .
        </p>
      </div>

      {state && !state.ok && (
        <p role="alert" className="text-center text-xs text-red-400">
          {refusal(state.error)}
        </p>
      )}
    </form>
  )
}
