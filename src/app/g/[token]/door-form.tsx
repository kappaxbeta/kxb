'use client'

import Image from 'next/image'
import { Canvas } from '@react-three/fiber'
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { enterAsGuest, type DoorResult } from '@/app/g/[token]/enter'
import { useActionState } from 'react'
import { PeepPicker } from '@/app/components/peep-picker'
import { Spinnable, Stage, XpBody } from '@/app/components/character-stage'
import { AvatarModel } from '@/app/world/lounge/_canvas/avatar-model'
import { GUEST_NAME_MAX } from '@/domain/guests/application'
import { AVATARS, avatarShotUrl, DEFAULT_AVATAR } from '@/domain/lounge/avatars'
import { claimedName } from '@/lib/telegram/webapp'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Name, body, in - as a lobby rather than as a card.
 *
 * THESIS: this is the first screen of the product for somebody who has never
 * seen it, and until now it argued the opposite of what it was selling: a
 * 24rem form box with a flat sticker of an animal in a circle, on a page whose
 * whole promise is that you walk into a room. The lobby already knows how to
 * say that - your peep standing on a lit pad, one loud Play, the destination
 * named under it - so the door is built out of the same parts: `Stage` and
 * `Spinnable` from the character stage, `.hud-panel`, `.summon-cta`, the neon
 * floor. Somebody who walks through this door and lands in `/tenants` a week
 * later should recognise the room they are standing in.
 *
 * It stays one client component, and one `<form>`, because the peep on the pad
 * and the hidden field that submits it are the same fact. The grid is the
 * lobby's: the panel in the narrow column, the stage in the wide one, and on a
 * phone the character first so the page greets you before it asks you
 * anything.
 *
 * The real GLB rather than the still it used to draw. That is a heavier door -
 * three.js and one model before the button is pressed - and it is the right
 * trade here specifically: the very next page loads the same renderer and the
 * same pack, so the cost is paid once either way, and the thing being promised
 * is a 3D room. The still stays as the placeholder underneath, and is only
 * dropped once the model is actually standing there (see `Landed`), so the
 * frames before three.js arrives show an animal rather than an empty plate.
 */

function randomAvatar(): string {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)] ?? DEFAULT_AVATAR
}

/**
 * Nothing, rendered inside the suspended subtree, that reports when it exists.
 *
 * The only honest signal for "the peep is on the pad": it mounts when the
 * model's `useGLTF` has resolved, because until then React has not rendered
 * this branch at all. A canvas-level `onCreated` would fire a beat too early -
 * the renderer is up, the animal is not - and the placeholder would blink off
 * over an empty podium.
 */
function Landed({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    onDone()
  }, [onDone])
  return null
}

export function GuestDoor({
  token,
  spaceName,
  promise,
  signedInAs,
  skin,
}: {
  token: string
  spaceName: string
  /** One sentence on what a visitor may do here. Computed by the page. */
  promise: string
  /**
   * The xp body they will stand in, or null for the dummy.
   *
   * Read on the server from `profile_skins`, and null for everybody without
   * an account - which is who this door is mostly for. Not editable here: the
   * animal is a choice this visit makes and a skin is a thing an account
   * owns, so the door offers the first and only reports the second.
   */
  skin: string | null
  /**
   * The email of somebody who arrived already signed in and is not a member.
   * Null for a stranger, which is almost everybody. The empty string is a
   * signed-in account with no address on it, and still worth the notice.
   */
  signedInAs: string | null
}) {
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

  /** The full roster, hidden until asked for. See the note where it renders. */
  const [pickerOpen, setPickerOpen] = useState(false)

  /** Whether the model is standing on the pad yet. See `Landed`. */
  const [landed, setLanded] = useState(false)
  const markLanded = useCallback(() => setLanded(true), [])

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

  /**
   * The same characters again, only to be drawn under the peep.
   *
   * A mirror rather than a value: the input stays uncontrolled for the reason
   * above, and this is written *from* it on every keystroke instead of driving
   * it. So the nameplate can say who is about to walk in - which is the whole
   * reason the lobby has one - without the field losing the caret behaviour,
   * the autofill or the Telegram suggestion.
   */
  const [typed, setTyped] = useState('')

  useEffect(() => {
    const field = name.current
    if (!field || field.value) return
    const suggestion = claimedName()
    if (!suggestion) return
    field.value = suggestion.slice(0, GUEST_NAME_MAX)
    setTyped(field.value)
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
    <form
      action={formAction}
      className="relative z-10 flex flex-1 flex-col gap-6 px-4 pb-6 sm:px-8 lg:grid lg:grid-cols-[minmax(21rem,26rem)_1fr] lg:items-stretch"
    >
      <input type="hidden" name="avatar" value={avatar} />

      {/* --------------------------------------------------------------------
       * The stage: the body they are about to be, on its pad. First in DOM
       * order on phones so the character greets them; on desktop the grid puts
       * the panel to its left.
       * ------------------------------------------------------------------ */}
      <section
        aria-label="Your peep"
        className="relative order-first flex min-h-[34dvh] flex-col items-center justify-end lg:order-last lg:min-h-0"
      >
        <div className="relative h-[32dvh] w-full max-w-xl lg:h-[60dvh]">
          {/* The placeholder, underneath, standing where the peep will stand
              rather than in the middle - a still that lands centre and then
              jumps left is worse than no still at all. Dropped the moment the
              model is really there, never before, or it blinks off over bare
              slabs. */}
          {!landed && (
            <Image
              key={avatar}
              src={avatarShotUrl(avatar, 'three')}
              alt={avatar}
              width={512}
              height={512}
              priority
              className="absolute bottom-[30%] left-[36%] h-[26%] w-auto -translate-x-1/2 object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
            />
          )}

          {/* `pan-y` keeps the page scrollable over the stage on touch while a
              horizontal drag still reaches the models.

              Every number below is the lobby's, to the decimal: the camera,
              the four lights, the -0.55 drop, and both positions on the pad.
              Deliberately copied rather than re-tuned - the whole point of the
              rework is that the door and the lobby are one room, and a stage
              framed a little differently is exactly how two screens stop
              looking like the same place. */}
          <Canvas
            camera={{ position: [0, 1.15, 5.6], fov: 35 }}
            style={{ touchAction: 'pan-y' }}
          >
            <ambientLight intensity={1.1} />
            <directionalLight position={[3, 6, 4]} intensity={2.2} />
            <pointLight position={[-2, 0.5, 2]} intensity={12} color="#ff4fa3" />
            <pointLight position={[2, 1, 2]} intensity={10} color="#4fd8ff" />
            <group position={[0, -0.55, 0]}>
              <Suspense fallback={null}>
                <Stage />
              </Suspense>

              {/* Their xp self: the body the games give them.
                *
                * The dummy for a stranger, and that is not a placeholder - it
                * is what somebody with no account *is* in there, which is the
                * rule `readLookFor` already writes down for the rooms
                * themselves. Somebody who arrives holding an account gets the
                * skin they chose, because being a visitor in this particular
                * space says nothing about who they are everywhere else.
                */}
              <Suspense fallback={null}>
                <Spinnable position={[0.55, 0, 0]} base={-0.45}>
                  <XpBody key={skin ?? 'dummy'} model={skin} />
                </Spinnable>
              </Suspense>

              {/* Their xo self: the animal they are picking, at its xp twin's
                  side - half its height, a companion rather than a colleague.

                  Its own suspense boundary, so swapping animals does not take
                  the podium or the dummy down with it: the peep suspends on
                  every new `.glb` and nothing else on the pad should flicker
                  for it. */}
              <Suspense fallback={null}>
                <Spinnable position={[-0.75, 0, 0.1]} base={0.45}>
                  <group key={avatar} scale={0.6}>
                    <AvatarModel model={avatar} clip="idle" />
                  </group>
                  <Landed onDone={markLanded} />
                </Spinnable>
              </Suspense>
            </group>
          </Canvas>
        </div>

        {/* Nameplate: who is about to walk in, in the lobby's own words. Both
            halves are named, because both are standing there - and the xp one
            is the only place the door says out loud that a stranger's games
            body is the dummy. Shuffle and Choose sit under it; there is no
            locker here, because the skin is not this door's to change. */}
        <div className="relative -mt-1 flex flex-col items-center gap-2 pb-2">
          <p className="flex flex-wrap items-baseline justify-center gap-x-2 text-sm font-medium">
            <span className={typed ? 'text-ink' : 'text-ink-muted'}>
              {typed || 'Your name'}
            </span>
            <span className="font-mono text-xs text-ink-muted">
              xo · <span className="capitalize">{avatar}</span>
            </span>
            <span className="font-mono text-xs text-ink-muted">
              xp · {skin ? skin.split('/').pop() : 'dummy'}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={shuffle}
              className="rounded-full border border-line px-4 py-1.5 text-xs text-ink-muted transition hover:border-accent hover:text-ink"
            >
              🎲 Shuffle
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen((open) => !open)}
              aria-expanded={pickerOpen}
              className="rounded-full border border-line px-4 py-1.5 text-xs text-ink-muted transition hover:border-accent hover:text-ink"
            >
              Choose
            </button>
          </div>
        </div>

        {/* The roster, over the stage - the lobby's locker, in the one place a
            guest gets to use it. Collapsed by default: twenty-four animals
            above the name field would make the door look like a character
            creator, and most people just want to get in.

            The positioning lives on a wrapper because `.hud-panel` declares
            `position: relative` unlayered, and unlayered CSS beats a Tailwind
            utility - `absolute` on the panel itself is ignored. */}
        {pickerOpen && (
          <div className="absolute inset-x-0 top-0 z-20 max-h-full overflow-y-auto lg:inset-x-auto lg:right-0 lg:w-[26rem]">
            <div className="hud-panel p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink">Pick a body</h2>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted transition hover:border-accent hover:text-ink"
                >
                  Close
                </button>
              </div>
              <PeepPicker selected={avatar} onSelect={setAvatar} />
            </div>
          </div>
        )}
      </section>

      {/* --------------------------------------------------------------------
       * The panel: what this is, one field, and the way in.
       * ------------------------------------------------------------------ */}
      <section className="hud-panel flex min-h-0 flex-col p-5 sm:p-6 lg:self-center">
        <p className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-accent-2">
          You&rsquo;ve been invited to
        </p>
        <h1 className="font-pixel mt-1.5 break-words text-2xl uppercase leading-[1.15] text-ink">
          {spaceName}
        </h1>

        {/* Says what they are about to be able to do, and what they are not.
            Somebody who expects to be able to build and finds they cannot will
            read it as broken rather than as intended - and the reverse is
            worse: telling a hackathon's attendees they cannot build, on the
            door of an event bought so that they could, is the first sentence
            they read and it is a lie. So this is computed from the event's own
            terms rather than written once. See `doorPromise`. */}
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Pick a name and walk in. {promise}{' '}
          You don&rsquo;t need an account.
        </p>

        {/* Said before they fill anything in, because it is the one thing a
            signed-in visitor would otherwise get wrong: this is not a second
            account and it does not touch the one they have. They keep their
            session; in this space they are a guest. */}
        {signedInAs !== null && (
          <p className="mt-3 rounded-xl border border-line bg-surface-raised/60 px-3 py-2 text-xs leading-relaxed text-ink-muted">
            You&rsquo;re signed in{signedInAs ? ` as ${signedInAs}` : ''}. You are not
            a member of this space, so you&rsquo;ll join as a guest, and your own
            account stays exactly as it is.
          </p>
        )}

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
          onChange={(e) => setTyped(e.currentTarget.value)}
          // Autofocus is right here and would be wrong almost anywhere else:
          // this page has one field and the visitor arrived intending to use it.
          autoFocus
          className="mt-5 w-full rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-muted focus:border-accent sm:text-sm"
        />

        {/* The lobby's Play, doing the lobby's job: one loud control with the
            destination named under the word. A button rather than a link
            because walking in is an action - it spends a use off the link. */}
        <button
          type="submit"
          disabled={pending}
          className="summon-cta mt-3 flex flex-col items-center rounded-2xl px-6 py-3.5 text-center"
        >
          <span className="font-pixel text-xl uppercase leading-none">
            {pending ? 'Opening…' : 'Walk in'}
          </span>
          <span className="mt-1 max-w-full truncate text-xs font-medium opacity-80">
            {spaceName}
          </span>
        </button>

        {state && !state.ok && (
          <p role="alert" className="mt-3 text-center text-xs text-red-400">
            {refusal(state.error)}
          </p>
        )}

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
        <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-muted">
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
      </section>
    </form>
  )
}
