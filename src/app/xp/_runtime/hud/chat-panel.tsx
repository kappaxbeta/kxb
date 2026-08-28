'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { XpChat, XpLine } from '@kxb/xp/host'
import { DEFAULT_HAND, type Hand } from '@/lib/controls/hand'
import { xpDict } from '@/app/i18n/xp'
import { useLocale } from '@/app/i18n/locale-context'

/**
 * Saying something, from inside a level.
 *
 * docs/xp/backlog.md §7b's panel. The three hosts are built and this is the
 * half a person actually touches: a line of text at the bottom left, opened
 * with Enter, closed with Escape.
 *
 * ---------------------------------------------------------------------------
 * Not a copy of the dock's panel, and that is not laziness
 * ---------------------------------------------------------------------------
 * `src/app/t/[slug]/chat-panel.tsx` is a rail: a scrollback you read, a room
 * switcher, a report button per line. None of that survives being put over a
 * game. What a level needs is the opposite shape — the last few lines, fading,
 * over a world you are still looking at — which is the *ticker* this runtime
 * already has for what the level says (`said` in ./hud), and this is its
 * sibling rather than the dock's.
 *
 * So the two panels share a conversation and not a component, and the copy rule
 * in AGENTS.md is not even reached: there was nothing worth copying.
 *
 * ---------------------------------------------------------------------------
 * Closed is the resting state, and the input is what opens
 * ---------------------------------------------------------------------------
 * The lines are drawn whether or not the box is open, because a message
 * arriving while you are playing is the one thing this feature is for and a
 * panel you have to open to discover somebody spoke is a panel nobody opens.
 * What Enter opens is the *box*, and it is closed by default for a reason a
 * game has and a chat app does not: an always-focused text field eats `W`.
 *
 * ---------------------------------------------------------------------------
 * Text somebody else wrote is data, never markup
 * ---------------------------------------------------------------------------
 * §3.2's rule, the same one `src/lib/uploads.ts` argues for SVG. Here it costs
 * nothing — every line below goes in as a JSX child, which React escapes — and
 * it is written down anyway, because the day somebody reaches for
 * `dangerouslySetInnerHTML` to make a mention bold is the day it stops being
 * free.
 */

/**
 * How many lines stay on screen.
 *
 * The ticker's number (`TICKER_LINES`), deliberately: two stacks of text in the
 * same corner of the same screen that scrolled to different depths would read
 * as one broken list. A transcript is the rail's job and the rail is still
 * there — this is what just happened.
 */
const LINES = 5

/** Past this it is not a message, it is a payload. The dock's own limit. */
const MAX_LENGTH = 500

export interface ChatPanelProps {
  /** The host's conversation. Absent is a level with nowhere to say anything. */
  chat: XpChat
  /** Whose id `by` is, when it is ours. */
  me: string
  /**
   * Everybody the room knows about, for turning an id into a name.
   *
   * `XpLine.by` is an id precisely because a roster maps one to the other, and
   * this is that roster — the same `standings` the scoreboard is drawn from, so
   * a name here and a name there cannot disagree. A line whose author is not in
   * it falls back to `XpLine.name`, which is how history stays readable.
   */
  roster: readonly { id: string; name: string }[]
  /** Whether the box is open. Owned by the caller, which also owns the key. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Whether to draw something a thumb can press.
   *
   * A phone has no Enter until a field is already focused, so on touch the
   * thing that opens the box has to be *on the screen* - which is the same
   * conclusion the emote picker reached, and the reason it is a button with a
   * key rather than a key with a button. On a keyboard it stays absent: a
   * control duplicating a key in the corner the HUD already writes in is
   * clutter over somebody's level.
   */
  touch?: boolean
  /**
   * Which thumb steers, so this can stay out of its way.
   *
   * Only consulted on touch - see the corner note in the body. Defaulted rather
   * than required because a desktop has no rig to dodge, and a caller that has
   * not thought about hands is a caller drawing the keyboard layout.
   */
  hand?: Hand
}

export function ChatPanel({
  chat,
  me,
  roster,
  open,
  onOpenChange,
  touch = false,
  hand = DEFAULT_HAND,
}: ChatPanelProps) {
  const locale = useLocale()
  const t = xpDict(locale).chat
  const [lines, setLines] = useState<readonly XpLine[]>([])
  const [draft, setDraft] = useState('')
  /**
   * A refusal, in front of the person who typed it.
   *
   * `say` throws what the action refused with — chat is off in this space, the
   * space is read-only, you are muted — and those are all sentences somebody can
   * act on. A `say` whose failure only reached the console would be a message
   * that vanished, which is the one outcome that makes people stop typing.
   */
  const [refused, setRefused] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const box = useRef<HTMLInputElement>(null)

  const add = useCallback((line: XpLine) => {
    setLines((current) => [...current, line].slice(-LINES))
  }, [])

  useEffect(() => chat.on(add), [chat, add])

  /**
   * What was said before this level opened, when the host keeps any.
   *
   * `recent` is optional and its absence is a *fact* rather than an empty list —
   * see `XpChat`. Nothing is drawn either way here: an empty panel over a game
   * says "nobody has spoken" quietly enough, and a line explaining that this
   * host keeps no history would be chrome about our own plumbing sitting on top
   * of somebody's level.
   */
  /**
   * Which conversation the scrollback has already been fetched for.
   *
   * Development mounts every effect twice, and without this that is two server
   * round trips and the same history prepended twice — a panel opening on five
   * lines that are each printed once and then once again. The guard is per
   * conversation rather than a bare boolean, so walking into a room with a
   * different one still loads its history.
   */
  const loadedFor = useRef<XpChat | null>(null)

  useEffect(() => {
    if (!chat.recent) return
    if (loadedFor.current === chat) return
    loadedFor.current = chat

    let live = true
    void chat
      .recent()
      .then((history) => {
        if (!live) return
        // Behind whatever has arrived since, rather than replacing it: the
        // subscription is already open, so a line can land while this is in
        // flight and dropping it would be losing the newest message on screen.
        setLines((current) => [...history.slice(-LINES), ...current].slice(-LINES))
      })
      .catch(() => {
        // A scrollback that will not load is a panel that still works. The
        // conversation is live either way, and a refusal about history is not
        // worth taking the level's chat down for.
      })
    return () => {
      live = false
    }
  }, [chat])

  /** Focused when it opens, because opening it is how somebody starts typing. */
  useEffect(() => {
    if (open) box.current?.focus()
  }, [open])

  async function send() {
    const text = draft.trim()
    if (text.length === 0 || sending) return

    setSending(true)
    setRefused(null)
    try {
      await chat.say(text)
      setDraft('')
      /*
       * And closed, so the next `W` walks. A box left open after sending is a
       * box you type the whole next minute of movement into — the same reason
       * every game does this and no chat app does.
       */
      onOpenChange(false)
    } catch (reason) {
      // The draft is deliberately kept. Somebody whose message was refused
      // should be able to read it, fix it, or copy it out.
      setRefused(reason instanceof Error ? reason.message : xpDict(locale).chat.didNotSend)
    } finally {
      setSending(false)
    }
  }

  const nameOf = (line: XpLine) => {
    if (line.by === me) return 'you'
    // The roster first, always: it is who this person is *now*. See `XpLine.name`.
    const here = roster.find((player) => player.id === line.by)
    if (here) return here.name
    return line.name ?? 'someone'
  }

  return (
    <div
      /*
        Above the thumbstick on a phone, beside the HUD's own line on a desktop.

        The stick lives at `bottom-8 left-6` and is thirteen rem of glass in the
        same corner this panel writes in - so at `bottom-12` the
        conversation, the input and the button that opens it were all drawn on
        top of the thing you steer with. The words won the pixels and the stick
        won the touches, which is the worst of both: you could see the chat and
        not press it, and you could press the stick and not see it.

        Lifted clear rather than moved to another corner, because the corners are
        spoken for - jump and the level's own action column on the right, the
        emote picker above those - and because the ticker this sits under is the
        other half of the same conversation.

        **And then lifted again.** 13rem was the stick's exact top edge, which
        is not clear of it - it is touching it, and the button that opens this
        box was the first thing under a thumb reaching for the stick: *"you
        touch it and it opens accidentally"*. The stick has since grown to
        13rem tall as well, so the number here is that plus a thumb's width of
        air. It is deliberately not derived from the stick's classes - they are
        in another component and a shared constant for two numbers in two files
        is harder to read than the sentence explaining them.
      */
      /*
        **And it follows the stick round.** The lift above only clears the stick,
        which is thirteen rem tall; the action rail on the other side runs from
        `bottom-32` to `top-4` and nothing can be lifted clear of that. So this
        stays on the stick's side whichever side that is, and the two strings are
        written out in full because Tailwind reads the source for class names it
        has never run.
      */
      className={`pointer-events-none absolute max-w-[min(90vw,26rem)] p-4 font-mono text-[11px] leading-relaxed ${
        touch && hand === 'left' ? 'right-0 text-right' : 'left-0'
      } ${touch ? '' : 'bottom-12'}`}
      /*
        **And then lifted a third time, past the workspace's drawer tab.**

        The tab that opens the rail on a phone is `fixed top-[62%] left-0` and
        60px tall (see `sidebar.tsx`), so its *top* edge sits `38% + 30px` up
        from the bottom of the screen - which on a tall phone is above the
        16.5rem this had settled on. Measured at 375x812: the tab spans 473-533
        and the button spanned 500-532. The tab is `z-[55]`, so it wins, and the
        left third of "say something" was simply not pressable.

        The number is the tab's top edge, less this panel's own 1rem of bottom
        padding, plus 8px of air. Clearing its *bottom* edge is the mistake to
        make here and it looks like it works: the panel moves, and it is still
        underneath.

        A percentage rather than a fourth fixed number, because the thing being
        cleared is one: the tab is placed by viewport fraction and this is placed
        in rem, so any constant clears it at one screen height and not at the
        next. `max()` keeps whichever is taller - the stick on a short phone,
        the tab on a tall one.

        In `style` rather than a class because it is geometry derived from
        another component's, not a design token; the side stays in classes,
        where Tailwind can see both strings.
      */
      style={touch ? { bottom: 'max(16.5rem, calc(38% + 22px))' } : undefined}
    >
      {lines.map((line, index) => (
        <p
          key={`${line.at}-${index}`}
          className="text-white/80"
          /*
           * Older lines fade, exactly as the level's own ticker does. The list
           * is bounded and this is its only visual difference from a log: the
           * interesting line is the one that just arrived.
           */
          style={{ opacity: 0.35 + (0.65 * (index + 1)) / lines.length }}
        >
          <span className="text-[var(--color-accent)]">{nameOf(line)}</span>{' '}
          <span>{line.text}</span>
        </p>
      ))}

      {refused && <p className="mt-1 text-rose-300/90">{refused}</p>}

      {open && (
        <form
          className="pointer-events-auto mt-1.5 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <input
            ref={box}
            value={draft}
            maxLength={MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            /**
             * Every key stopped here, and this is the whole reason the box is a
             * mode rather than a permanent field.
             *
             * The scene listens on `window` for `V`, `H`, `Z` and the level's
             * own bindings, and the controller reads `WASD` the same way. Typing
             * "why" into an unguarded box fires the view toggle, opens the
             * controls panel and walks the body — so the keystrokes stop at the
             * input, on the capture phase, before anything above can see them.
             *
             * Escape is the exception and is handled rather than swallowed:
             * closing the box is what it should do, and letting it through would
             * also drop the player out of the level on the way past.
             */
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onOpenChange(false)
              }
              event.stopPropagation()
            }}
            placeholder={t.placeholder}
            aria-label={t.label}
            className="w-full rounded-lg border border-white/20 bg-black/60 px-2 py-1 text-white/90 outline-none backdrop-blur placeholder:text-white/30 focus:border-white/40"
          />
          {/*
            A send button on touch and nothing on a keyboard, because a soft
            keyboard's return key submits the form already and a second control
            beside it would be two ways to do one thing in the smallest corner
            of the screen.
          */}
          {touch && (
            <button
              type="submit"
              disabled={sending || draft.trim().length === 0}
              className="shrink-0 rounded-lg border border-white/25 bg-black/50 px-3 py-1 text-white/80 backdrop-blur transition-colors disabled:opacity-40"
            >
              {t.send}
            </button>
          )}
        </form>
      )}

      {touch && !open && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="pointer-events-auto mt-1.5 rounded-lg border border-white/25 bg-black/40 px-3 py-1.5 text-white/80 backdrop-blur"
        >
          {t.placeholder}
        </button>
      )}
    </div>
  )
}
