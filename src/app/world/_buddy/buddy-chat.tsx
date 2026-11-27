'use client'

import { useEffect, useRef, useState } from 'react'
import {
  buddySays,
  fetchBuddyBrain,
  sendBuddyHome,
  talkToBuddy,
  useBuddy,
} from '@/app/world/_buddy/buddy-store'
import type { WorldDict } from '@/app/i18n/world'
import { BUDDIES, BUDDY_MAX_INPUT } from '@/domain/buddy/persona'

/**
 * The box you talk to your buddy in.
 *
 * Only there while he is out - calling him is what puts it on the screen, and
 * sending him home takes it away. Small and in the bottom-left corner, where
 * the room's own chat is not: this is a conversation with one pink monster,
 * not with the room, and it should never be mistaken for the place where other
 * people read what you write. Nothing typed here goes anywhere but the model.
 *
 * His answer goes over his head as well as into the log, so you can keep
 * walking and still hear him; the log is for scrolling back.
 *
 * HTML over the canvas, outside it, so a click here never asks for the pointer
 * lock (that listener is on the canvas), and the movement keys stand aside while
 * the input has focus (`isTyping` in the player controls).
 *
 * It folds down to a pill with his name on it, for somebody who wants him
 * walking along without a box in the corner. Folded is not deaf: his answers
 * still go up over his head, and the pill grows a dot when he has said
 * something you have not read in the box. Remembered per browser, as a
 * convenience - storage may be refused, and then it simply opens unfolded.
 */
const FOLDED_KEY = 'kxb.buddy.folded'

function readFolded(): boolean {
  try {
    return window.localStorage.getItem(FOLDED_KEY) === '1'
  } catch {
    return false
  }
}

function writeFolded(folded: boolean) {
  try {
    window.localStorage.setItem(FOLDED_KEY, folded ? '1' : '0')
  } catch {
    // Remembering is a nicety; the fold itself already happened.
  }
}
export function BuddyChat({ labels, name }: { labels: WorldDict['buddy']; name?: string }) {
  const { out, who, turns, thinking, trouble, partial, canFetch, fetching } = useBuddy()
  const buddyName = BUDDIES[who].name
  const named = (line: string) => line.replaceAll('{name}', buddyName)
  const [draft, setDraft] = useState('')
  const log = useRef<HTMLDivElement>(null)

  // Only ever rendered while he is out, which the server never sees - so the
  // stored answer can be read on the first render without a mismatch.
  const [folded, setFolded] = useState(readFolded)
  /** How many turns there were when the box was folded. Later ones are unread. */
  const [seen, setSeen] = useState(0)
  const unread = folded && turns.slice(seen).some((turn) => turn.role === 'buddy')

  const fold = (next: boolean) => {
    setFolded(next)
    setSeen(turns.length)
    writeFolded(next)
  }

  // Leaving the room sends him home: the store outlives the scene, he does not.
  useEffect(() => sendBuddyHome, [])

  // Hello, in the reader's language, every time he arrives.
  useEffect(() => {
    if (out) buddySays(labels.hello.replaceAll('{name}', BUDDIES[who].name))
  }, [out, who, labels.hello])

  // Newest at the bottom, and kept in view as it grows.
  useEffect(() => {
    const node = log.current
    if (node) node.scrollTop = node.scrollHeight
  }, [turns.length, thinking])

  if (!out) return null

  const send = () => {
    if (!draft.trim() || thinking) return
    void talkToBuddy(draft, name)
    setDraft('')
  }

  const problem = trouble ? named(labels[trouble]) : null

  if (folded) {
    return (
      <div className="pointer-events-auto absolute bottom-24 left-4 z-30 flex items-center gap-1 rounded-full border border-fuchsia-400/40 bg-surface/85 p-1 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => fold(false)}
          aria-label={named(labels.unfold)}
          title={named(labels.unfold)}
          aria-expanded={false}
          className="flex items-center gap-2 rounded-full py-1 pl-2 pr-3 text-xs font-semibold text-ink transition hover:bg-fuchsia-500/10"
        >
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full bg-fuchsia-400 ${unread || thinking ? 'animate-pulse ring-2 ring-fuchsia-400/40' : ''}`}
          />
          {buddyName}
          <span aria-hidden className="text-ink-muted">
            ▴
          </span>
        </button>
        <button
          type="button"
          onClick={sendBuddyHome}
          aria-label={named(labels.home)}
          title={named(labels.home)}
          className="rounded-full px-2 py-1 text-sm text-ink-muted transition hover:text-ink"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <section
      aria-label={buddyName}
      className="pointer-events-auto absolute bottom-24 left-4 z-30 flex w-[min(20rem,calc(100%-2rem))] flex-col rounded-2xl border border-fuchsia-400/40 bg-surface/85 p-2 shadow-lg backdrop-blur"
    >
      <header className="flex items-center gap-2 px-1 pb-1">
        <span aria-hidden className="h-2 w-2 rounded-full bg-fuchsia-400" />
        <h2 className="text-xs font-semibold text-ink">{buddyName}</h2>
        <button
          type="button"
          onClick={() => fold(true)}
          aria-label={named(labels.fold)}
          title={named(labels.fold)}
          aria-expanded
          className="ml-auto rounded-lg px-2 text-sm text-ink-muted transition hover:text-ink"
        >
          ▾
        </button>
        <button
          type="button"
          onClick={sendBuddyHome}
          aria-label={named(labels.home)}
          title={named(labels.home)}
          className="rounded-lg px-2 text-sm text-ink-muted transition hover:text-ink"
        >
          ✕
        </button>
      </header>

      {(turns.length > 0 || thinking) && (
        <div
          ref={log}
          className="max-h-40 space-y-1 overflow-y-auto overscroll-contain px-1 py-1 text-sm leading-snug"
        >
          {turns.map((turn, index) => (
            <p
              // Turns are only ever appended or the last one withdrawn, so the
              // index is stable for every line still on screen.
              key={index}
              className={
                turn.role === 'user'
                  ? 'ml-6 rounded-xl bg-surface-raised/70 px-2 py-1 text-ink'
                  : 'mr-6 rounded-xl bg-fuchsia-500/15 px-2 py-1 text-ink'
              }
            >
              {turn.text}
            </p>
          ))}
          {thinking &&
            (partial ? (
              <p className="mr-6 rounded-xl bg-fuchsia-500/15 px-2 py-1 text-ink">{partial}</p>
            ) : (
              <p className="px-2 text-xs text-ink-muted">{named(labels.thinking)}</p>
            ))}
        </div>
      )}

      {problem && (
        <p role="status" className="px-2 py-1 text-xs text-ink-muted">
          {problem}
        </p>
      )}

      {fetching !== null ? (
        <p role="status" className="px-2 py-1 text-xs text-ink-muted">
          {named(labels.fetching).replace('{pct}', String(Math.round(fetching * 100)))}
        </p>
      ) : (
        canFetch && (
          <button
            type="button"
            onClick={() => void fetchBuddyBrain(name)}
            className="mx-1 my-1 rounded-xl border border-fuchsia-400/50 px-3 py-1.5 text-left text-xs text-ink transition hover:bg-fuchsia-500/10"
          >
            {named(labels.fetch)}
          </button>
        )
      )}

      <form
        className="mt-1 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={BUDDY_MAX_INPUT}
          placeholder={named(labels.placeholder)}
          aria-label={named(labels.placeholder)}
          className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface/70 px-3 text-base text-ink placeholder:text-ink-muted/70 focus:border-fuchsia-400 focus:outline-none sm:text-sm"
        />
        <button
          type="submit"
          disabled={!draft.trim() || thinking}
          className="h-9 shrink-0 rounded-xl bg-fuchsia-500 px-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-30"
        >
          {labels.send}
        </button>
      </form>
      <p className="px-2 pt-1 text-[10px] text-ink-muted/80">{labels.hint}</p>
    </section>
  )
}
