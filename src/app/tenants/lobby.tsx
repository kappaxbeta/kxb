'use client'

/**
 * The lobby — the space picker as a game lobby rather than a settings list.
 *
 * THESIS: switching spaces is choosing where to drop in, so the page is built
 * like a locker screen: your peep standing on a lit pad, the spaces as a rail
 * of destinations, and one big Play. The composition is the battle-lobby one;
 * the material is the house material — indigo sky, the two neons, the pixel
 * face — not anyone else's colours.
 *
 * The peep is the real GLB on a live canvas, same trade as the settings
 * picker: one canvas, loading only what you are looking at. The turntable is
 * the page's one authored motion; under reduced motion it holds a
 * three-quarter pose instead.
 *
 * Everything that *decides* stays where it was: creating, subscribing and the
 * promo banners arrive as server-rendered slots, and Play is a plain link to
 * `/t/[slug]` because switching has never been an action, only navigation.
 */

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Suspense,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import { Canvas } from '@react-three/fiber'
import { AvatarModel } from '@/app/world/lounge/_canvas/avatar-model'
import { Spinnable, Stage, XpBody } from '@/app/components/character-stage'
import { PeepPicker } from '@/app/components/peep-picker'
import { chooseAvatar, wearDummy } from '@/domain/profile/avatar-actions'
import { chooseSkin } from '@/domain/skins/actions'
import { skinThumbUrl, type ShopView } from '@/domain/skins/application'
import { fill } from '@/app/i18n/fill'
import { spacesDict } from '@/app/i18n/spaces'
import { useRefusal } from '@/app/i18n/use-refusal'
import type { Locale } from '@/domain/i18n/locale'

export interface LobbySpace {
  id: string
  slug: string
  name: string
  role: string
  tier: string
}

export interface LobbyInvitation {
  tenantId: string
  tenantName: string
  role: string
}

export function Lobby({
  spaces,
  archived,
  invitations,
  avatar,
  asDummy,
  username,
  wardrobe,
  email,
  defaultSlug,
  backHref,
  locale,
  notices,
  footer,
  signOutForm,
}: {
  spaces: LobbySpace[]
  archived: LobbySpace[]
  invitations: LobbyInvitation[]
  avatar: string
  /**
   * Whether the xo half is the plain dummy rather than the animal.
   *
   * The third body a room can draw, and the reason it is a flag beside the
   * animal rather than a value in it: the peep is kept underneath, so taking
   * the dummy off gives back the one you had. See `wearDummy`.
   */
  asDummy: boolean
  username: string
  /** Owned skins, what is worn, and whether the shelf is open. */
  wardrobe: ShopView
  email: string
  /** The space the ✕ returns to and the rail pre-selects. Null hides the ✕. */
  defaultSlug: string | null
  backHref: string | null
  locale: Locale
  /** Promo, grant and checkout banners, server-rendered. */
  notices?: ReactNode
  /** The create form or the subscribe prompt — whichever the seat allows. */
  footer?: ReactNode
  signOutForm: ReactNode
}) {
  const t = spacesDict(locale)
  const router = useRouter()

  const [selected, setSelected] = useState<string | null>(
    defaultSlug ?? spaces[0]?.slug ?? null,
  )
  const [lockerOpen, setLockerOpen] = useState(false)
  /**
   * The XP body's skin, held here for the same reason the peep is: the figure
   * on the stage has to change on the click. `null` is the dummy.
   */
  const [skin, setSkin] = useState<string | null>(wardrobe.chosen)
  const ownedSkins = wardrobe.skins.filter((entry) => wardrobe.owned[entry.id])
  /**
   * And whether the xo half is the dummy rather than the animal.
   *
   * Held here for the reason the skin is - the figure on the stage has to
   * change on the click - and separate from the skin because these are two
   * different bodies in two different worlds that happen to look alike: the
   * dummy standing in the lounge is not the dummy standing in the games.
   */
  const [dummy, setDummy] = useState(asDummy)
  const [codeHelpOpen, setCodeHelpOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selectedSpace = spaces.find((s) => s.slug === selected) ?? null

  /* The rail below the featured card: everywhere else you could go. Filtered
   * by the search box; the featured space never filters itself away. */
  const others = spaces.filter((space) => space.slug !== selected)
  const needle = query.trim().toLowerCase()
  const found = needle
    ? others.filter(
        (space) =>
          space.name.toLowerCase().includes(needle) ||
          space.slug.toLowerCase().includes(needle),
      )
    : others

  /* The peep, optimistically — same contract as the settings picker: the
   * costume changes on click, and a refused save falls back on its own. */
  const refusal = useRefusal()
  const [saved, setSaved] = useState(avatar)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [shown, showOptimistically] = useOptimistic(saved)

  function choose(model: string) {
    if (model === shown && !dummy) return
    setError(null)
    // Picking an animal is taking the dummy off - `chooseAvatar` clears the
    // flag in the same write, and the stage should not wait to show it.
    setDummy(false)
    startTransition(async () => {
      showOptimistically(model)
      const result = await chooseAvatar(model)
      if (result.ok) setSaved(result.model)
      else setError(refusal(result.error))
    })
  }

  /**
   * Standing in the dummy in the rooms, instead of the animal.
   *
   * The peep is kept either way, which is what makes this a switch rather than
   * a twenty-fifth face in the grid: taking it off hands back the animal you
   * already had, and the grid still shows which one that is.
   */
  function wearAsDummy(next: boolean) {
    if (next === dummy) return
    setError(null)
    setDummy(next)
    startTransition(async () => {
      const result = await wearDummy(next)
      if (!result.ok) {
        setDummy(!next)
        setError(refusal(result.error))
      }
    })
  }

  /**
   * Wearing a skin, optimistically, for the reason the peep is: the figure on
   * the stage is the feedback, and a round trip before it moves would make the
   * locker feel broken. A refusal puts the old one back and says why.
   */
  function wearSkin(model: string | null) {
    if (model === skin) return
    const previous = skin
    setError(null)
    setSkin(model)
    startTransition(async () => {
      const result = await chooseSkin(model)
      if (!result.ok) {
        setSkin(previous)
        setError(result.error)
      }
    })
  }

  function joinWithCode(formData: FormData) {
    const code = String(formData.get('code') ?? '').trim()
    if (code) router.push(`/join?c=${encodeURIComponent(code)}`)
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* The room: a floor running to a horizon, behind everything. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 [--box-hue:285]">
        <div className="neon-horizon" style={{ '--box-horizon': '30%' } as React.CSSProperties} />
        <div className="neon-floor !h-[45%]" />
      </div>

      {/* Chrome row: who you are, and the ways out. */}
      <header className="relative z-10 flex items-center gap-3 px-4 py-4 sm:px-8">
        <h1 className="font-pixel text-lg uppercase tracking-normal text-ink sm:text-xl">
          {t.title}
        </h1>
        <p className="hidden min-w-0 truncate text-xs text-ink-muted md:block">
          {fill(t.signedInAs, { email })}
        </p>
        <div className="ml-auto flex items-center gap-2">
          {signOutForm}
          {backHref && (
            <Link
              href={backHref}
              aria-label={t.guest.back}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-muted transition hover:border-accent hover:text-ink"
            >
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </Link>
          )}
        </div>
      </header>

      <div className="relative z-10 flex flex-1 flex-col gap-6 px-4 pb-6 sm:px-8 lg:grid lg:grid-cols-[minmax(21rem,25rem)_1fr] lg:items-stretch">
        {/* ------------------------------------------------------------------
         * The stage: the peep on its pad. First in DOM order on phones so the
         * character greets you; on desktop the grid puts the rail left of it.
         * ---------------------------------------------------------------- */}
        <section
          aria-label={t.lobby.lockerTitle}
          className="relative order-first flex min-h-[38dvh] flex-col items-center justify-end lg:order-last lg:min-h-0"
        >
          <div className="relative h-[34dvh] w-full max-w-xl lg:h-[62dvh]">
            {/* `pan-y` keeps the page scrollable over the stage on touch while
                a horizontal drag still reaches the models. */}
            <Canvas
              camera={{ position: [0, 1.15, 5.6], fov: 35 }}
              style={{ touchAction: 'pan-y' }}
            >
              <ambientLight intensity={1.1} />
              <directionalLight position={[3, 6, 4]} intensity={2.2} />
              <pointLight position={[-2, 0.5, 2]} intensity={12} color="#ff4fa3" />
              <pointLight position={[2, 1, 2]} intensity={10} color="#4fd8ff" />
              <Suspense fallback={null}>
                {/* The -0.55 drop maps the stage floor onto the lower part of
                    the canvas with room for the slabs beneath it — measured
                    off a rendered frame. */}
                <group position={[0, -0.55, 0]}>
                  <Stage />
                  {/* Your xp self: the body every game gives you until skins
                      hang in the locker. */}
                  <Spinnable position={[0.55, 0, 0]} base={-0.45}>
                    <XpBody key={skin ?? 'dummy'} model={skin} />
                  </Spinnable>
                  {/* Your xo self: the animal, at its xp twin's side — half
                      its height, a companion rather than a colleague. Or the
                      dummy, when that is what the rooms are drawing: the
                      stage's job is to show what is standing in them, and a
                      peep here beside a dummy in the lounge would be the
                      locker lying about the room. */}
                  <Spinnable position={[-0.75, 0, 0.1]} base={0.45}>
                    {dummy ? (
                      <group key="dummy" scale={0.6}>
                        <XpBody model={null} />
                      </group>
                    ) : (
                      <group key={shown} scale={0.6}>
                        <AvatarModel model={shown} clip="idle" />
                      </group>
                    )}
                  </Spinnable>
                </group>
              </Suspense>
            </Canvas>
          </div>

          {/* Nameplate: who is standing there, and the door to the locker. */}
          <div className="relative -mt-2 flex flex-col items-center gap-2 pb-2">
            <p className="flex items-baseline gap-2 text-sm font-medium text-ink">
              {username}
              <span className="font-mono text-xs text-ink-muted">
                xo · <span className="capitalize">{dummy ? 'dummy' : shown}</span>
              </span>
              <span className="font-mono text-xs text-ink-muted">
                xp · {wardrobe.skins.find((entry) => entry.id === skin)?.name ?? 'dummy'}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setLockerOpen((open) => !open)}
              aria-expanded={lockerOpen}
              className="rounded-full border border-line px-4 py-1.5 text-xs text-ink-muted transition hover:border-accent hover:text-ink"
            >
              {t.lobby.locker}
            </button>
          </div>

          {/* The locker: the roster, over the stage.
              The positioning lives on a wrapper because `.hud-panel` declares
              `position: relative` unlayered, and unlayered CSS beats a
              Tailwind utility — `absolute` on the panel itself is ignored. */}
          {lockerOpen && (
            <div className="absolute inset-x-0 top-0 z-20 max-h-full overflow-y-auto lg:inset-x-auto lg:right-0 lg:w-[26rem]">
            <div className="hud-panel p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink">{t.lobby.lockerTitle}</h2>
                <button
                  type="button"
                  onClick={() => setLockerOpen(false)}
                  className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted transition hover:border-accent hover:text-ink"
                >
                  {t.lobby.close}
                </button>
              </div>
              {error && (
                <p role="alert" className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs font-medium text-red-500">
                  {error}
                </p>
              )}
              <p className="mb-1.5 text-[0.62rem] font-medium uppercase tracking-[0.18em] text-accent-2">
                xo · the lounge
              </p>
              {/* The animal stays lit while the dummy is on: it is not what you
                  are standing in, it is what you get back. */}
              <PeepPicker selected={shown} onSelect={choose} disabled={isPending} />

              {/*
                The dummy, under the roster rather than in it.

                Not a twenty-fifth face, because it is not an animal and the
                grid is the pack: it is the body you stand in when you are
                nobody, which is what a visitor with no account is already
                standing in and what the rooms' own wardrobe now offers at the
                mirror. A switch keeps the peep underneath it, so turning it
                off gives back the animal still lit in the grid above.
              */}
              <button
                type="button"
                role="switch"
                aria-checked={dummy}
                disabled={isPending}
                onClick={() => wearAsDummy(!dummy)}
                className={`mt-1.5 flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition disabled:opacity-60 ${
                  dummy
                    ? 'border-accent bg-accent/15 font-semibold text-accent'
                    : 'border-line/60 text-ink-muted hover:border-accent/60'
                }`}
              >
                <span>{t.lobby.dummy}</span>
                <span aria-hidden className="font-mono">
                  {dummy ? '✓' : ''}
                </span>
              </button>

              {/*
                The other half of you. The peep is who you are in the lounge and
                the skin is who you are in the games, so the one panel holds
                both - somebody who came here to change how they look should not
                have to know which world the answer lives in.
              */}
              <div className="mt-4 border-t border-line/60 pt-3">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <p className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-accent-2">
                    xp · the games
                  </p>
                  <Link
                    href="/skins"
                    className="text-xs text-accent hover:underline"
                  >
                    {wardrobe.open ? t.lobby.shop : t.lobby.shopClosed}
                  </Link>
                </div>

                <div role="radiogroup" aria-label={t.lobby.skins} className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                  {/* The dummy is a choice, not the absence of one: it is what
                      every player is before a skin, and taking one off has to
                      be as easy as putting it on. */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={skin === null}
                    onClick={() => wearSkin(null)}
                    className={`flex h-14 items-center justify-center rounded-xl border text-[10px] transition ${
                      skin === null
                        ? 'border-accent bg-accent/15 font-semibold text-accent'
                        : 'border-line/60 text-ink-muted hover:border-accent/60'
                    }`}
                  >
                    dummy
                  </button>

                  {ownedSkins.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      role="radio"
                      aria-checked={skin === entry.id}
                      aria-label={entry.name}
                      title={entry.name}
                      onClick={() => wearSkin(entry.id)}
                      className={`flex h-14 items-center justify-center rounded-xl border p-1 transition ${
                        skin === entry.id
                          ? 'border-accent bg-accent/15'
                          : 'border-line/60 hover:border-accent/60'
                      }`}
                    >
                      <Image
                        src={skinThumbUrl(entry.id)}
                        alt=""
                        width={128}
                        height={128}
                        className="h-full w-full object-contain"
                      />
                    </button>
                  ))}
                </div>

                {ownedSkins.length === 0 && (
                  <p className="mt-2 text-xs text-ink-muted">{t.lobby.noSkins}</p>
                )}
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                {isPending ? (
                  t.welcome.saving
                ) : (
                  <>
                    {t.welcome.youAreLead}
                    <span className="capitalize text-ink">{shown}</span>
                    {t.welcome.youAreTail}
                  </>
                )}
              </p>
            </div>
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------------
         * The rail: destinations, and the one big button.
         * ---------------------------------------------------------------- */}
        <section aria-label={t.title} className="hud-panel flex min-h-0 flex-col p-5 sm:p-6">
          {notices}

          {invitations.length > 0 && (
            <div className="mb-4">
              <h2 className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-accent-2">
                {t.invitations}
              </h2>
              <ul className="mt-2 space-y-1.5">
                {invitations.map((invitation) => (
                  <li
                    key={invitation.tenantId}
                    className="flex items-center gap-3 rounded-xl border border-accent/40 bg-surface-raised px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {invitation.tenantName}
                      <span className="ml-2 text-xs text-ink-muted">
                        {fill(t.asRole, { role: invitation.role })}
                      </span>
                    </span>
                    <Link href="/invitations" className="text-sm font-medium text-accent hover:underline">
                      {t.respond}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Where you were last, on top, with Play right under it — the
              ninety-percent path is two glances and one click. */}
          {selectedSpace && (
            <div className="lobby-card lobby-card-selected w-full">
              <span className="block min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-ink">
                  {selectedSpace.name}
                </span>
                <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                  /t/{selectedSpace.slug}
                </span>
              </span>
              <span className="ml-auto shrink-0 rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink-muted">
                {selectedSpace.role} <span className="opacity-60">· {selectedSpace.tier}</span>
              </span>
            </div>
          )}
          <PlayButton space={selectedSpace} label={t.lobby.play} />

          {spaces.length === 0 && (
            <p className="text-sm text-ink-muted">{t.noSpaces}</p>
          )}

          {others.length > 0 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.lobby.search}
              aria-label={t.lobby.search}
              className="mt-4 w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-base text-ink outline-none focus:border-accent sm:text-sm"
            />
          )}

          {/* A whisker of inset padding: the cards wear a ring and a bloom on
              hover, and a scroll container clips both on the card that sits
              flush against its edge. */}
          <div
            className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto px-1 pb-1 pt-1"
            role="radiogroup"
            aria-label={t.title}
          >
            <ul className="space-y-2">
              {found.map((space) => (
                <li key={space.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={false}
                    onClick={() => setSelected(space.slug)}
                    className="lobby-card w-full text-left"
                  >
                    <span className="block min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {space.name}
                      </span>
                      <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                        /t/{space.slug}
                      </span>
                    </span>
                    <span className="ml-auto shrink-0 rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink-muted">
                      {space.role} <span className="opacity-60">· {space.tier}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {archived.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-ink-muted transition hover:text-ink">
                  {t.archived} · {archived.length}
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {archived.map((space) => (
                    <li key={space.id}>
                      <Link
                        href={`/t/${space.slug}`}
                        className="flex items-center gap-3 rounded-xl border border-dashed border-line px-3 py-2 text-ink-muted transition hover:border-accent"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">{space.name}</span>
                        <span className="font-mono text-xs">/t/{space.slug}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {/* The code door, inline: the lobby's "private island code". The ?
              answers what a code even is, in the join page's own words. */}
          {codeHelpOpen && (
            <p id="lobby-code-help" className="mt-4 rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
              {t.join.body}
            </p>
          )}
          <form action={joinWithCode} className={`flex items-center gap-2 ${codeHelpOpen ? 'mt-2' : 'mt-4'}`}>
            <label htmlFor="lobby-code" className="sr-only">
              {t.join.label}
            </label>
            <input
              id="lobby-code"
              name="code"
              maxLength={64}
              placeholder={t.join.placeholder}
              autoComplete="off"
              aria-describedby={codeHelpOpen ? 'lobby-code-help' : undefined}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface-raised px-3 py-2 font-mono text-base uppercase tracking-[0.2em] text-ink outline-none placeholder:normal-case placeholder:tracking-normal focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setCodeHelpOpen((open) => !open)}
              aria-expanded={codeHelpOpen}
              aria-label={t.join.metaTitle}
              title={t.join.metaTitle}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted transition hover:border-accent-2 hover:text-ink"
            >
              <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                <path
                  d="M5.8 6a2.2 2.2 0 1 1 3.1 2c-.7.35-.9.7-.9 1.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <circle cx="8" cy="12" r="0.9" fill="currentColor" />
              </svg>
            </button>
            <button
              type="submit"
              className="rounded-lg border border-line px-4 py-2 text-sm text-ink-muted transition hover:border-accent hover:text-ink"
            >
              {t.join.go}
            </button>
          </form>

          {/* Creating stays one step back once you already have somewhere to
              be: a quiet summary that opens into the real form. With no space
              at all it stands open — it is the whole point of the visit. */}
          {footer &&
            (spaces.length === 0 ? (
              footer
            ) : (
              <details className="mt-3">
                <summary className="cursor-pointer list-none rounded-lg border border-dashed border-line px-4 py-2 text-center text-sm text-ink-muted transition hover:border-accent hover:text-ink">
                  {t.lobby.newSpace}
                </summary>
                <div className="mt-2 rounded-xl border border-dashed border-line p-4">
                  {footer}
                </div>
              </details>
            ))}
        </section>
      </div>
    </div>
  )
}

/**
 * The one loud control. A link, because entering a space is navigation — but
 * dressed as the lobby's Play: the summoning gradient, the pixel face, and
 * the chosen destination named under the word.
 */
function PlayButton({ space, label }: { space: LobbySpace | null; label: string }) {
  if (!space) return null
  return (
    <Link
      href={`/t/${space.slug}`}
      className="summon-cta mt-3 flex flex-col items-center rounded-2xl px-6 py-3.5 text-center"
    >
      <span className="font-pixel text-xl uppercase leading-none">{label}</span>
      <span className="mt-1 max-w-full truncate text-xs font-medium opacity-80">
        {space.name}
      </span>
    </Link>
  )
}
