'use client'

import { useState } from 'react'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * The name of the thing you are building, in the title bar, and a way to change
 * it.
 *
 * ---------------------------------------------------------------------------
 * Why the title bar and not a panel
 * ---------------------------------------------------------------------------
 * It is already the one place on the screen that says what this is, and it was
 * already showing a name — the *document's*, which is a different name from the
 * project's and drifts from it the moment either is set anywhere else. A level
 * whose `name` was never touched after it was made from a starter says "untitled"
 * in the one spot a person looks to find out what they have open.
 *
 * So the caller passes the name that is authoritative where the editor is
 * mounted, and this is where it is changed. A rename is one word typed in the
 * one place the word is already written, which is cheaper to find than any
 * panel it could have gone in.
 *
 * ---------------------------------------------------------------------------
 * A button until it is clicked
 * ---------------------------------------------------------------------------
 * Not a permanently-live input. A text field sitting in a title bar invites a
 * click that was meant to drag the window and swallows the first keystroke of
 * every keyboard shortcut aimed at the viewport — and the editor binds single
 * letters. Click to edit, Enter or blur to keep it, Escape to put it back.
 */
export function EditableTitle({
  name,
  onRename,
  max,
  disabled,
}: {
  name: string
  /**
   * Where the new name goes, and what it ended up being.
   *
   * The answer is the *space's*, not the caller's: a name already taken comes
   * back numbered, so this adopts what it is told rather than what was typed.
   * A refusal is a reason to show, because every one of them is something a
   * person can act on — not the owner, too long, the project moved.
   */
  onRename: (name: string) => Promise<{ ok: true; name: string } | { ok: false; error: string }>
  /** The cap the surface behind this enforces anyway, said early. */
  max?: number
  /** No rename here — the operator route on a file nobody else can see. */
  disabled?: boolean
}) {
  const refusal = useRefusal()
  const t = xpEditorDict(useLocale()).chrome
  /**
   * The draft is seeded by the click that opens the field, not by a render.
   *
   * Which is the whole reason there is no effect here syncing the two: a save
   * landing mid-edit changes `name` underneath, and an effect would retype the
   * field while somebody is in the middle of a word.
   */
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const draft = editing ?? name

  const commit = async (typed: string) => {
    const wanted = typed.trim()
    setEditing(null)
    if (wanted.length === 0 || wanted === name) return

    setBusy(true)
    const result = await onRename(wanted)
    setBusy(false)
    setError(result.ok ? null : refusal(result.error))
  }

  if (editing !== null) {
    return (
      <input
        value={draft}
        onChange={(event) => setEditing(event.target.value)}
        maxLength={max}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        aria-label={t.projectName}
        className="min-w-0 rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-xs text-neutral-100 outline-none focus:border-neutral-500"
        onBlur={(event) => void commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void commit(event.currentTarget.value)
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setEditing(null)
          }
          // The viewport binds single letters. Typing "e" in a name is typing a
          // letter, not reaching for the eraser.
          event.stopPropagation()
        }}
      />
    )
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => {
          setError(null)
          setEditing(name)
        }}
        title={disabled ? name : t.rename}
        className="min-w-0 truncate rounded px-1 text-xs text-neutral-200 transition-colors enabled:hover:bg-neutral-800 disabled:cursor-default"
      >
        {busy ? `${name}…` : name}
      </button>
      {error ? (
        <span
          role="alert"
          className="whitespace-nowrap rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300"
        >
          {error}
        </span>
      ) : null}
    </>
  )
}
