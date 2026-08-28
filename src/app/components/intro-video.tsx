'use client'

import { Sparkles, Video } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { DEFAULT_LOCALE, type Locale } from '@/app/i18n/locales'

/**
 * The ninety-second recording, and the two ways in to it.
 *
 * A screen recording of somebody actually using the app, offered on the front
 * page and in the demo. It exists because both of those surfaces argue and
 * neither demonstrates: the landing page describes a room in words, and the
 * demo drops a stranger into one with no idea what the rest of the product is.
 * The recording is the only thing on either page that shows the whole shape -
 * a space, a room, the rail, a game - in the order somebody would meet them.
 *
 * Deliberately not autoplaying anywhere. It is ninety seconds with sound over
 * a page whose entire pitch is "you are already in the room", and a video that
 * starts talking at a visitor who came to walk around is an interruption of the
 * thing being advertised. Offered, prominently, and played on a click.
 */

/**
 * The locales a recording has actually been made in.
 *
 * Not every locale: the file is a screen recording of a person talking, so it
 * is made rather than translated, and a missing one is a 404 inside a `<video>`
 * - which fails silently, showing a black box with working controls. Listing
 * them here means `introSrc` can fall back rather than guess, and adding the
 * German recording is this array plus the file.
 */
const INTRO_LOCALES: readonly Locale[] = ['en', 'de']

/** Roughly, in seconds - only ever shown rounded, as a promise about length. */
const INTRO_SECONDS = 91

/**
 * Which recording this visitor gets.
 *
 * Falls back to English rather than hiding the offer: somebody reading the
 * German page is being shown an English-language product either way, and a
 * recording they can follow is worth more than no recording at all.
 */
export function introSrc(locale: Locale): string {
  const made = INTRO_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE
  return `/enter/introduction-${made}.mp4`
}

/** The still behind the player before it is pressed, and its own `<img>` in the card. */
export function introPoster(locale: Locale): string {
  const made = INTRO_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE
  return `/enter/introduction-${made}.poster.webp`
}

export interface IntroVideoDict {
  /** The label on the control: "Watch the tour". */
  watch: string
  dialogTitle: string
  /**
   * The AI-content disclosure, shown under the picture while it plays.
   *
   * Every part of the recording has an AI in it, and the sentence says so: the
   * voice and the script were generated, and the picture - which started as a
   * screen recording of the real app on a real phone - was put through an
   * enhancer afterwards. Naming the footage as recorded *and* enhanced is the
   * distinction worth keeping: the rooms in it exist, and the frames are still
   * not untouched.
   */
  aiNote: string
  close: string
}

/**
 * The offer, in one of two sizes of the same control.
 *
 * One line, an icon and a label, both times - it is a third button in a row of
 * buttons, and a poster card with a thumbnail in it was a different kind of
 * object sitting under two that matched each other. `cta` is the landing
 * page's, sized to the two beside it; `pill` is the demo's, sized to the row of
 * pills in the banner. Only the padding and the type size differ.
 *
 * Both open the same dialog, and the dialog is the native `<dialog>` for the
 * reasons <TourWidget> spells out - focus trap, Escape, top layer, an inert
 * page behind it. That last one matters more here than anywhere: on the demo
 * this opens over a pointer-locked world full of key handlers, and a hand-rolled
 * overlay would leave WASD still driving a body nobody can see.
 */
export function IntroVideo({
  dict,
  locale = DEFAULT_LOCALE,
  variant = 'cta',
  className = '',
}: {
  dict: IntroVideoDict
  locale?: Locale
  variant?: 'cta' | 'pill'
  className?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [open, setOpen] = useState(false)

  /**
   * Both halves, every time.
   *
   * `close()` shuts the element; `setOpen(false)` unmounts the `<video>` inside
   * it. The unmount is not tidiness - a closed dialog still holds a playing
   * element, so without it the recording carries on talking over a page it is
   * no longer on top of. It also means the next press starts at the beginning,
   * which is the only sensible place for a ninety-second explanation to start.
   */
  const close = useCallback(() => {
    video.current?.pause()
    dialog.current?.close()
    setOpen(false)
  }, [])

  function openDialog() {
    setOpen(true)
    dialog.current?.showModal()
    /*
      Played from the click rather than with `autoPlay`.

      The press is the gesture that buys the sound: started this way the browser
      lets it play unmuted, which is the whole point of a narrated recording.
      `autoPlay` on a freshly mounted element is not attributed to the click and
      gets muted instead, and a muted explanation is a silent one. Failures are
      swallowed - the controls are right there, and a rejected promise here means
      a policy we cannot argue with, not a bug the visitor should hear about.
    */
    queueMicrotask(() => {
      void video.current?.play().catch(() => {})
    })
  }

  return (
    <>
      {/*
        Outlined rather than filled, in both places.

        It is the third control in a row whose other two are the doors - play,
        and join - and a third solid button would make the row a choice between
        three equals. Drawn as the quiet one it reads as what it is: the thing
        to press when you are not ready to press either of the others.
      */}
      <button
        type="button"
        onClick={openDialog}
        aria-haspopup="dialog"
        className={
          variant === 'cta'
            ? `cta-pixel inline-flex w-full max-w-xs items-center justify-center gap-2.5 rounded-full border border-accent/60 bg-accent/10 px-8 py-3.5 text-lg text-ink transition hover:bg-accent/20 sm:w-auto sm:max-w-none ${className}`
            : `inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent/10 px-5 py-2 font-medium text-ink transition hover:bg-accent/20 ${className}`
        }
      >
        <Video aria-hidden size={variant === 'cta' ? 20 : 16} strokeWidth={1.75} />
        {dict.watch}
        {/* The running time, as a clock rather than a sentence - so it is
            formatted rather than translated, and reads the same on both pages.
            It is the one fact that decides whether somebody presses this now or
            never, and it is small enough to sit inside the label. */}
        <span className="tabular-nums text-ink-muted">{clock(INTRO_SECONDS)}</span>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="intro-dialog-title"
        className="intro-dialog"
        onClose={close}
        // A click that lands on the dialog element itself landed on the
        // backdrop - anything inside hits a child first.
        onClick={(event) => {
          if (event.target === dialog.current) close()
        }}
      >
        {open && (
          <div className="intro-dialog-panel">
            <div className="flex items-center justify-between gap-4 px-1 pb-2">
              <h2 id="intro-dialog-title" className="text-sm font-medium text-ink">
                {dict.dialogTitle}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={dict.close}
                className="rounded-lg border border-line px-2.5 py-1 text-sm text-ink-muted transition hover:text-ink"
              >
                ✕
              </button>
            </div>
            {/*
              `playsInline` so an iPhone plays it in the panel instead of
              throwing it into its own fullscreen player, which would take the
              dialog - and the close button - off the screen entirely.
            */}
            <video
              ref={video}
              className="intro-dialog-video"
              src={introSrc(locale)}
              poster={introPoster(locale)}
              controls
              playsInline
              preload="metadata"
              onEnded={close}
            />

            {/*
              The disclosure, under the picture and inside the panel.

              The Union's transparency rule is the reason it exists and the
              reason it is worded the way it is: content generated by an AI has
              to be marked as such, in a way somebody actually reads, at the
              moment they are looking at it. So it is here rather than on the
              button that opens this - a label on a button is read before the
              video and forgotten during it - and it is text in the page rather
              than a caption burned into a frame, which could be neither
              translated nor corrected without re-encoding ninety seconds.

              It says which part is which, because that is the honest version:
              the voice and the script are generated outright, and the footage
              is a real recording that has been enhanced. Neither half of that
              survives on its own - "AI-generated" alone suggests the rooms were
              invented, and "real footage" alone hides the enhancer.
            */}
            <p className="mt-2 flex items-start gap-1.5 px-1 text-[11px] leading-snug text-ink-muted">
              <Sparkles aria-hidden size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              <span>{dict.aiNote}</span>
            </p>
          </div>
        )}
      </dialog>
    </>
  )
}

/** `91` -> `1:31`. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}
