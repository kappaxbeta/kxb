'use client'

import Link from 'next/link'
import { IntroVideo } from '@/app/components/intro-video'
import Logo from '@/app/components/logo'
import { demoDict } from '@/app/i18n/demo'
import { LocaleProvider } from '@/app/i18n/locale-context'
import { type Locale, localePath } from '@/app/i18n/locales'
import { useMemo, useState } from 'react'
import { LoungeScene } from '@/app/world/lounge/lounge-scene'
import { DEMO_HOSTS, planDemoWorld } from '@/domain/lounge/demo-world'

/**
 * The demo, and the invitation standing next to it.
 *
 * A client component because the world is built here rather than fetched: the
 * whole promise of this page is that there is nothing behind it. No workspace
 * is looked up, no projection is run, no row is read, and nothing a visitor
 * does reaches a server. That is what makes it safe to leave open to the
 * internet at a fixed URL, and it is why the block plan is a pure function
 * (see `planDemoWorld`) rather than a seeded world somebody could edit into
 * something the front page then shows to strangers.
 *
 * The scene itself is the real one - the same component the lounge, the public
 * showcase and every battlefield render. A separate "marketing" renderer would
 * be a second thing to keep in step with the product, and would eventually be
 * a demo of software that no longer exists.
 */
export function DemoLounge({
  joinLabel,
  joinHref,
  locale = 'en',
}: {
  locale?: Locale
  joinLabel: string
  /** `/demo/join`, carrying the `?src=` the visitor arrived on. See the page. */
  joinHref: string
}) {
  /**
   * Which half of the product is on show, held here rather than in the scene.
   *
   * The switch is in the banner (see `<DemoBanner>`) because the sentence
   * explaining what battle mode is has to be attached to the control that turns
   * it on - a visitor who flips a toggle in a HUD and suddenly cannot place a
   * block has been given a bug, not a feature. `LoungeScene` follows this prop
   * for the demo and only for the demo; the note on its `mode` state says why.
   *
   * Creative first, because building is the thing the page promises above the
   * fold and the thing somebody arriving from the front page came to try.
   */
  const [mode, setMode] = useState<'creative' | 'battle'>('creative')

  /**
   * Built once and held, not recomputed per render.
   *
   * `planDemoWorld` is a few thousand cells of arithmetic - cheap, but this
   * value is also the identity `LoungeScene` seeds its block map and its spawn
   * height from, so handing it a new array on every render would be handing it
   * a new world.
   */
  const blocks = useMemo(() => planDemoWorld(), [])

  return (
    /*
      No background of its own.

      The canvas clears to transparent - see the note on `<Canvas>` in
      lounge-scene - so whatever is behind it is the sky the world stands in.
      Painting `bg-surface` here put a flat panel between the two and turned the
      scene's feathered edge into a visible rectangle, which is the one thing
      that framing exists to avoid. Left alone, the page's own starfield shows
      through, exactly as it does in the lounge.
    */
    /*
      The world reads its words out of context, and this page is outside the
      workspace shell that usually provides one - so the demo hands its own
      locale down. It already has one: `/de/demo` is German because the URL
      says so, which is the rule public pages go by.
    */
    /* `h-viewport` for the reason the lobby uses it: `dvh` alone is zero pixels
       on anything older than Chrome 108, and this is a public door. */
    <LocaleProvider locale={locale}>
      <div className="h-viewport relative w-screen overflow-hidden">
        <LoungeScene
          // There is no workspace, and nothing in the scene will use this: every
          // caller of a Server Action that takes it is switched off by `demo`.
          // Named for what it is, so it reads as a placeholder in a stack trace
          // rather than as a space somebody might have.
          slug="demo"
          worldName="The demo lounge"
          initialBlocks={blocks}
          initialImages={[]}
          readOnly={false}
          canModerate={false}
          // The banner owns the switch, so the HUD's is off: two controls for one
          // setting, one of which also writes to a workspace that does not exist.
          canSetMode={false}
          mode={mode}
          // Feet on the floor. Flying is how the read-only showcase says "you are
          // a camera, not a person" - here you are a person, standing in a room
          // with two others, and the point being made is that you can walk up to
          // them.
          canFly={false}
          demo
          companions={DEMO_HOSTS}
        />

        <DemoBanner
          joinLabel={joinLabel}
          joinHref={joinHref}
          locale={locale}
          mode={mode}
          onMode={setMode}
        />
      </div>
    </LocaleProvider>
  )
}

/**
 * The one piece of chrome over the world.
 *
 * Two jobs, and it is worth naming both because they pull against each other: it
 * has to say "none of this is saved" before somebody builds for ten minutes and
 * finds out, and it has to offer the way in. Putting them in one card rather
 * than two is what stops the second reading as an interruption - the honest
 * sentence is what earns the button next to it.
 *
 * Dismissible, and it stays dismissed for the rest of the visit. The reason to
 * be here is the room, and a permanent card over the corner of it is a worse
 * advertisement than the room with nothing on it.
 */
function DemoBanner({
  joinLabel,
  joinHref,
  locale,
  mode,
  onMode,
}: {
  joinLabel: string
  joinHref: string
  locale: Locale
  mode: 'creative' | 'battle'
  onMode: (mode: 'creative' | 'battle') => void
}) {
  const dict = demoDict(locale)
  const [open, setOpen] = useState(true)
  const fighting = mode === 'battle'

  if (!open) {
    return (
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        {/*
          The way back out, which the dismissal used to take with it.

          The open card offers "What is this?" - and that link was the only one
          on the page pointing at the pitch, so closing the card left a visitor
          standing in a room with no name on it, one button asking them to make
          an account, and nothing that explains what they would be making one
          for. Most people arriving here have come straight from a post to
          `/demo` and have never seen the front page at all.

          The mark rather than a worded link: it is the smallest control that
          reads as "home" without adding a third sentence to a corner that is
          already a switch and a call to action. Top left is not available - the
          lounge's own readout lives there.

          No pill around it. `.logo` already draws its own outlined box and
          scales on hover, so wrapping it the way the two controls beside it are
          wrapped puts a border inside a border.
        */}
        <Link
          href={localePath(locale, '/')}
          aria-label={dict.homeAria}
          className="pointer-events-auto drop-shadow-lg"
        >
          <Logo />
        </Link>
        {/*
          The switch survives the dismissal, as a glyph.

          Dropping it with the card would mean the one visitor most likely to
          want a fight - the one who read the card, closed it and started
          playing - is the one who can no longer start one. It says which mode
          it *goes to* rather than which mode is on, because a lone icon that
          reports state reads as a button that does it.
        */}
        <button
          type="button"
          role="switch"
          aria-checked={fighting}
          aria-label={fighting ? dict.battleOff : dict.battleOn}
          onClick={() => onMode(fighting ? 'creative' : 'battle')}
          className={`pointer-events-auto rounded-full border px-3 py-2 text-sm shadow-lg backdrop-blur-md transition ${
            fighting
              ? 'border-amber-500/60 bg-amber-500/20 text-amber-200'
              : 'border-line bg-surface-raised/80 text-ink-muted hover:text-ink'
          }`}
        >
          {fighting ? '⚔' : '✎'}
        </button>
        <Link
          href={joinHref}
          className="pointer-events-auto rounded-full bg-accent px-5 py-2 text-sm font-medium text-white shadow-lg transition hover:opacity-90"
        >
          {joinLabel}
        </Link>
      </div>
    )
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-4">
      <div className="pointer-events-auto w-full max-w-xl rounded-2xl border border-line bg-surface-raised/80 p-4 text-sm shadow-xl backdrop-blur-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-ink">
              {fighting ? dict.banner.fightingTitle : dict.banner.creativeTitle}
            </p>
            {/*
              The copy changes with the switch, because the two modes are two
              different offers and the banner is the only place either is
              explained. Creative says "build, nothing is kept"; battle says
              which keys swing and who is standing there to be swung at - the
              hosts are the only bodies here, so a demo that turned combat on
              without naming them would be a room where the new buttons appear
              to do nothing.
            */}
            <p className="mt-1 text-ink-muted">
              {fighting ? (
                <>
                  {/* The key glyphs stay as they are: they are what is printed
                      on the keyboard, not words. */}
                  <span className="text-ink">F</span>
                  {dict.banner.fightingLead}
                  <span className="text-ink">Q</span>
                  {dict.banner.fightingMid}
                  {dict.banner.fightingTail}
                </>
              ) : (
                dict.banner.creativeBody
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-ink-muted transition hover:text-ink"
            aria-label={dict.hide}
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/*
            A plain link to a route, not a button with a handler. The click is
            counted by the thing that serves the navigation - see
            /demo/join/route.ts - so it survives a blocked beacon, a middle
            click and a visitor who opens it in a new tab.
          */}
          <Link
            href={joinHref}
            className="rounded-full bg-accent px-5 py-2 font-medium text-white transition hover:opacity-90"
          >
            {joinLabel}
          </Link>
          {/*
            The recording, next to the two links rather than under them.

            This page answers "what does it feel like" by putting somebody in
            the room, and answers "what is the rest of it" not at all - the
            demo is one lounge with two hosts in it, and a visitor standing in
            it has no way to find out that there are spaces, rooms, a rail and
            games behind it. "What is this?" sends them to a page of words for
            that; this shows them, without leaving.

            Second in the row, after the join button and before the way out: the
            order is do it, see it, read about it.
          */}
          <IntroVideo dict={dict.intro} locale={locale} variant="pill" className="text-sm" />
          <Link
            href={localePath(locale, '/')}
            className="rounded-full border border-line px-5 py-2 font-medium text-ink transition hover:bg-surface-raised"
          >
            {dict.whatIsThis}
          </Link>

          {/*
            A switch, and pushed to the far end of the row.

            It is the one control here that changes the world rather than
            leaving it, so it sits apart from the two that navigate away. A
            button carrying `role="switch"` rather than a checkbox: the state it
            reports is "battle mode, on" - one setting with two positions - and
            a button already has the keyboard behaviour, so all the role adds is
            the right word for a screen reader to say.
          */}
          <button
            type="button"
            role="switch"
            aria-checked={fighting}
            onClick={() => onMode(fighting ? 'creative' : 'battle')}
            className="ml-auto flex select-none items-center gap-2 rounded-full px-1 py-1 text-ink-muted transition hover:text-ink"
          >
            <span
              className={`relative h-5 w-9 rounded-full ring-1 transition ${
                fighting ? 'bg-accent ring-accent' : 'bg-surface-raised ring-line'
              }`}
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${
                  fighting ? 'left-[1.125rem]' : 'left-0.5 opacity-60'
                }`}
              />
            </span>
            {fighting ? dict.toggle.on : dict.toggle.off}
          </button>
        </div>
      </div>
    </div>
  )
}
