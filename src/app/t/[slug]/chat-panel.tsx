'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MAX_MESSAGE_LENGTH } from '@/domain/chat/events'
import { reportChatMessage } from '@/domain/moderation/actions'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * What has been said, and a box to say something.
 *
 * Purely presentational: it owns the scroll, the composer and the report form,
 * and nothing else. The channel, the list and the sending all belong to
 * `ChatDock`, which is the one component mounted for the whole session - see
 * the note on `said-store` for why there can only be one of those.
 *
 * That split is what let this move from the lounge's HUD into the rail without
 * being rewritten. It started as a tab beside the emote grid, which was the
 * wrong home for it: the emotes are something you do while standing in the
 * room, and a conversation is something you want to still be reading while you
 * go and write a page.
 */

/**
 * A line as the panel holds it.
 *
 * `id` is nullable and `key` is not, which is the optimistic update written into
 * a type. A line the sender has just typed exists on screen before it exists in
 * the database, so it has a local key from the start and gains its durable id
 * when the action returns. Everything that needs the durable id - the report
 * button, and only the report button - is simply not offered until it arrives,
 * which is a fraction of a second and honest about what it means: you cannot
 * report a message that has not been recorded yet.
 */
export interface ChatLine {
  key: string
  /** The durable message id. Null while the line is still in flight. */
  id: string | null
  body: string
  authorId: string | null
  authorName: string
  createdAt: string
  /** Absent once the server has it. */
  status?: 'sending' | 'failed'
}

/** How close to the bottom still counts as "following the conversation". */
const STICK_PX = 48

export function ChatPanel({
  slug,
  lines,
  selfId,
  onSend,
  onBlock,
  /** Null when the viewer may post. A sentence explaining why not, otherwise. */
  blockedReason,
}: {
  slug: string
  lines: ChatLine[]
  selfId: string
  onSend: (body: string) => void
  /**
   * Stop hearing whoever said a line. Belongs to the dock, not to this panel -
   * see `onBlock` in `chat-store` for why the list's owner has to be the one
   * that does it.
   */
  onBlock: (userId: string) => void
  blockedReason: string | null
}) {
  const t = railDict(useLocale()).chat
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)

  /**
   * Whether to follow new messages down.
   *
   * A ref rather than state because it is written from a scroll handler that
   * fires at pointer rate, and read from a layout effect - neither of which
   * wants a re-render. Sticking to the bottom unconditionally is the bug this
   * avoids: somebody reading back through the morning gets yanked to the end
   * every time anybody types, which makes scrollback useless exactly when it is
   * being used.
   */
  const following = useRef(true)

  const onScroll = useCallback(() => {
    const node = scroller.current
    if (!node) return
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight
    following.current = distance <= STICK_PX
  }, [])

  // Layout effect, not effect: scrolling after paint is a visible jump on every
  // message.
  useLayoutEffect(() => {
    const node = scroller.current
    if (!node || !following.current) return
    node.scrollTop = node.scrollHeight
  }, [lines])

  /**
   * The box, once a command has been sent.
   *
   * Held so `send` can let go of it. See below for the one case that does.
   */
  const composer = useRef<HTMLTextAreaElement>(null)

  function send() {
    const body = draft.trim()
    if (!body || blockedReason) return
    // Cleared before the round trip. The optimistic line is already in the list
    // by the time this returns, so leaving the text in the box would read as
    // the message having been said twice.
    setDraft('')
    onSend(body)

    /**
     * A command hands the keyboard back; a sentence keeps it.
     *
     * The two are different acts that happen to be typed in the same box. After
     * saying something to the room the next thing you usually do is say
     * something else, so the caret stays. After `/xo` or `/thingiverse ball` you
     * are addressing the *world* - the thing you asked for is now standing in
     * front of you and you want to walk to it - and the field held the keyboard
     * anyway, so every command ended in a trip to Escape before WASD did
     * anything. Nobody types a command in order to type another command.
     *
     * Blurring rather than closing the panel: the answer to what you just asked
     * for is a line in this list, and shutting the list is throwing away the
     * receipt. The scene's own key handling already stands down while anything
     * is focused in here (`isTyping`), so letting go is the whole fix.
     */
    if (body.startsWith('/')) composer.current?.blur()
  }

  // Fills whatever the caller gives it. The rail decides how tall a chat column
  // is; this decides only that the scrollback takes the slack and the composer
  // stays put at the bottom.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scroller}
        onScroll={onScroll}
        /**
         * `scrollbar-gutter: stable` because this scroller is 200px wide.
         *
         * The rail's scrollbar is a thin magenta thumb drawn *over* the content
         * box, so in a column this narrow it lands on the last two characters of
         * every line that reaches the edge. Reserving the lane costs 11px of a
         * column that has few to spare and buys back the right-hand margin on
         * every message - and it stops the list from reflowing the moment the
         * conversation grows long enough to need a scrollbar.
         */
        className="flex-1 space-y-2 overflow-y-auto overscroll-contain px-1 py-1 [scrollbar-gutter:stable]"
      >
        {lines.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-ink-muted">
            {t.nothingSaid}
          </p>
        ) : (
          lines.map((line) => (
            <Line
              key={line.key}
              slug={slug}
              line={line}
              mine={line.authorId === selfId}
              onBlock={onBlock}
            />
          ))
        )}
      </div>

      {blockedReason ? (
        <p className="mt-2 rounded-xl border border-line/50 bg-surface-raised/40 px-3 py-2 text-xs leading-relaxed text-ink-muted">
          {blockedReason}
        </p>
      ) : (
        <div className="mt-2 flex items-end gap-2">
          <textarea
            ref={composer}
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            onKeyDown={(event) => {
              /**
               * Return sends, Shift+Return breaks the line.
               *
               * `stopPropagation` on every key, not just these two: the scene
               * listens on the window and `isTyping` already refuses anything
               * from a text box, but this panel floats over a canvas that also
               * reads Escape, and one handler being polite is cheaper than
               * relying on two to stay polite.
               */
              event.stopPropagation()
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder={t.say}
            aria-label={t.message}
            className="max-h-24 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-line bg-surface/70 px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={draft.trim().length === 0}
            className="h-10 shrink-0 rounded-xl bg-accent px-4 text-sm font-medium text-surface transition hover:opacity-90 disabled:opacity-30"
          >
            {t.send}
          </button>
        </div>
      )}
    </div>
  )
}

function Line({
  slug,
  line,
  mine,
  onBlock,
}: {
  slug: string
  line: ChatLine
  mine: boolean
  onBlock: (userId: string) => void
}) {
  const t = railDict(useLocale()).chat
  const [reporting, setReporting] = useState(false)
  /**
   * Whether the confirm strip is open under this line.
   *
   * A block is one tap away and takes effect immediately, which is exactly why
   * it asks first: everything the person has already said leaves the panel the
   * moment it is confirmed, and a mis-tap that silently empties part of a
   * conversation is indistinguishable from the chat losing messages. The
   * confirm names them, so the answer to "which line was that" is on screen.
   */
  const [blocking, setBlocking] = useState(false)

  return (
    <div className="group rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-raised/50">
      <div className="flex items-baseline gap-2">
        <span
          className={`text-xs font-semibold ${mine ? 'text-accent' : 'text-accent-2'}`}
        >
          {line.authorName}
        </span>
        <time className="text-[10px] text-ink-muted/70" dateTime={line.createdAt}>
          {clockOf(line.createdAt)}
        </time>

        {line.status === 'sending' && (
          <span className="text-[10px] text-ink-muted/70">{t.sending}</span>
        )}
        {line.status === 'failed' && (
          <span className="text-[10px] text-red-500">{t.notSent}</span>
        )}

        {/*
          Reporting your own message is not offered. It is not forbidden - the
          action would take it - but a button that lets somebody escalate
          themselves to a moderator is a button that only ever gets pressed by
          mistake or in jest, and either way an admin reads it.

          Nor is it offered before the line has an id: see the note on ChatLine.
        */}
        {!mine && line.id && !reporting && !blocking && (
          <span className="ml-auto flex items-center gap-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            {/*
              Block before report, left to right, because it is the one that
              helps immediately. Reporting is a request that waits for somebody
              else; blocking is the thing you can do about it now.

              `authorId` is checked as well as `id`: a line whose author is
              unknown - one written before the column existed, or by an account
              that has since gone - has nobody to block, and a button that
              cannot work should not be drawn.
            */}
            {line.authorId && (
              <button
                type="button"
                onClick={() => setBlocking(true)}
                className="text-[10px] text-ink-muted/60 transition hover:text-ink"
              >
                {t.block}
              </button>
            )}
            <button
              type="button"
              onClick={() => setReporting(true)}
              className="text-[10px] text-ink-muted/60 transition hover:text-red-500"
            >
              {t.report}
            </button>
          </span>
        )}
      </div>

      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-snug text-ink">
        {line.body}
      </p>

      {blocking && line.authorId && (
        <div className="mt-2 space-y-2 rounded-lg border border-line bg-surface-raised/60 p-2">
          <p className="text-[11px] leading-snug text-ink-muted">
            {fill(t.blockConfirm, { name: line.authorName })}
          </p>
          <p className="text-[10px] leading-snug text-ink-muted/70">{t.blockUndo}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setBlocking(false)
                /*
                 * Not awaited and nothing to wait for: the dock takes their
                 * lines out of the list synchronously, so the panel's own
                 * answer is that they are gone. A spinner here would be a
                 * spinner over an empty space.
                 */
                if (line.authorId) onBlock(line.authorId)
              }}
              className="rounded bg-red-500/90 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-red-500"
            >
              {t.blockYes}
            </button>
            <button
              type="button"
              onClick={() => setBlocking(false)}
              className="rounded px-2 py-1 text-[11px] text-ink-muted transition hover:text-ink"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {reporting && line.id && (
        <ReportForm
          slug={slug}
          messageId={line.id}
          onDone={() => setReporting(false)}
        />
      )}
    </div>
  )
}

/**
 * Why this message is being reported.
 *
 * A reason is required rather than optional, and that is the difference between
 * a report queue and a complaint counter: an admin reading "this one" fifty
 * times cannot act on any of them. The reporter's own id is not asked for or
 * sent - it is stamped from the session on the server, which is both the only
 * safe way and the reason there is nothing here about who is reporting.
 */
function ReportForm({
  slug,
  messageId,
  onDone,
}: {
  slug: string
  messageId: string
  onDone: () => void
}) {
  const refusal = useRefusal()
  const t = railDict(useLocale()).chat
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  async function submit() {
    setBusy(true)
    setError(null)
    const result = await reportChatMessage(slug, messageId, reason)
    setBusy(false)

    if (!result.ok) {
      setError(refusal(result.error))
      return
    }

    // Left on screen for a moment rather than closed immediately: a form that
    // vanishes is indistinguishable from a form that failed silently, and this
    // is the one action in the panel with no visible consequence afterwards.
    setSent(true)
    setTimeout(onDone, 1600)
  }

  if (sent) {
    return (
      <p className="mt-2 rounded-lg bg-emerald-500/15 px-2 py-1.5 text-[11px] text-emerald-600">
        {t.reported}
      </p>
    )
  }

  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-line/50 bg-surface/70 p-2">
      <input
        ref={input}
        value={reason}
        onChange={(event) => setReason(event.target.value.slice(0, 500))}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter' && reason.trim().length >= 4) submit()
          if (event.key === 'Escape') onDone()
        }}
        placeholder={t.reportPlaceholder}
        aria-label={t.reportLabel}
        className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-ink-muted/70 focus:border-accent focus:outline-none"
      />

      {error && (
        <p role="alert" className="text-[11px] text-red-500">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || reason.trim().length < 4}
          className="rounded-lg bg-red-500/20 px-2.5 py-1 text-[11px] text-red-500 transition hover:bg-red-500/30 disabled:opacity-30"
        >
          {busy ? t.reportSending : t.sendReport}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-2.5 py-1 text-[11px] text-ink-muted transition hover:text-ink"
        >
          {t.cancel}
        </button>
      </div>
    </div>
  )
}

/**
 * The time of day, and nothing more.
 *
 * A chat is read as "just now" or "earlier"; a full date on every line is noise
 * that pushes the words themselves out of the column. The `title` on the
 * element is deliberately not set to the full timestamp either - a tooltip over
 * a 3D scene is a tooltip nobody can reach with the pointer captured.
 */
function clockOf(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
