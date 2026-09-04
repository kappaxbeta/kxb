'use client'

import { Check, ExternalLink, Link2, Loader2, Pin, Save } from 'lucide-react'
import { useState, useTransition } from 'react'
import { Section } from '@/app/ovaloffice/studio/parts'
import { publishPost } from '@/domain/board/actions'
import { publishScene, type SceneScope, updateScene } from '@/domain/scenes/actions'
import { encodeShot, type ShotSpec } from '@/domain/studio/shot'

/**
 * Keeping a scene.
 *
 * Until now a scene was its link and nothing else - see the note at the top of
 * `@/domain/studio/shot`, which argued for that and was right while the only
 * reader was the admin who composed it. It stopped being right the moment a
 * scene could be posted somewhere: a thing other people open needs a name, an
 * author and an address that is not four thousand characters long.
 *
 * ---------------------------------------------------------------------------
 * The link gives way to the row
 * ---------------------------------------------------------------------------
 * An unsaved scene lives in the address bar and works exactly as it always did:
 * the editor writes the encoded document there on a debounce, and that string
 * is what this panel copies into a row when you press the button - so the two
 * are never out of step, because one is made from the other at that moment.
 *
 * What changes at that moment is which of the two the address carries. It used
 * to keep carrying the document, and the row's id lived only in this
 * component's state: a reload came back to a document nothing was behind, this
 * panel came back saying "not kept yet", and the next press kept a second scene
 * beside the first. So the id goes up to the editor through `onSaved` and the
 * address becomes the scene. See the note on `onSaved` in ./shot-editor.
 *
 * Saving still does not *navigate*. The thing you are looking at is the thing
 * that was saved, and taking you to a listing to prove it would lose the
 * playhead, the selection and the framing.
 */
export function SavePanel({
  shot,
  scope,
  /** The row this editor was opened on, if it was opened on one. */
  sceneId,
  initialName,
  initialBlurb,
  initialVisibility,
  canPin = false,
  canPinTop = false,
  onSaved,
}: {
  shot: ShotSpec
  scope: SceneScope
  sceneId?: string | null
  initialName?: string
  initialBlurb?: string
  initialVisibility?: 'private' | 'public'
  /**
   * May this person put a notice on this space's board?
   *
   * Passed in rather than worked out here, because it is the same pair of
   * questions `publishPost` asks - the admin role and whether the space can be
   * written to at all - and the page already has the context that answers them.
   * The action re-checks; this only decides whether the control is drawn.
   */
  canPin?: boolean
  /**
   * May they also make it lead the board?
   *
   * A second flag rather than a role string, because the panel has no business
   * knowing what a role is - it knows two things it may draw. Pinning to the
   * top is the space's call and stays with its admins even now that any member
   * can post a scene; `publishPost` clamps it either way.
   */
  canPinTop?: boolean
  /**
   * The row this panel now writes to, announced upwards.
   *
   * The editor above keeps the document in the address bar, and until this
   * existed a save left that address alone: you saved, the URL still carried
   * four thousand characters of encoded shot, and a reload came back to *that*
   * rather than to the scene. The row was reachable only through this
   * component's own `saved` state, so the reload also forgot it had ever been
   * saved and the next press made a second scene.
   *
   * So the id goes up the moment there is one, and `null` goes up when somebody
   * asks for a copy - which is the same statement in reverse: there is no row
   * behind this document any more.
   */
  onSaved?: (id: string | null) => void
}) {
  const [name, setName] = useState(initialName ?? '')
  const [blurb, setBlurb] = useState(initialBlurb ?? '')
  const [visibility, setVisibility] = useState<'private' | 'public'>(initialVisibility ?? 'private')
  const [saved, setSaved] = useState<string | null>(sceneId ?? null)
  const [note, setNote] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()

  const save = () => {
    setNote(null)
    setFailed(false)

    const document = encodeShot(shot)
    const details = { name, blurb, visibility }

    start(async () => {
      const result = saved
        ? await updateScene({ scope, id: saved, document, details })
        : await publishScene({ scope, document, details })

      if (!result.ok) {
        setFailed(true)
        setNote(result.error)
        return
      }
      setSaved(result.id)
      onSaved?.(result.id)
      setNote(saved ? `Saved over “${name}”.` : `Kept as “${name}”. The address is this scene now.`)
    })
  }

  return (
    <Section
      title="Save"
      summary={saved ? (name.trim() ? `over “${name.trim()}”` : 'kept') : 'not kept yet'}
      open={!saved}
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Name
        <input
          value={name}
          maxLength={60}
          placeholder="Three animals and a crate"
          onChange={(event) => setName(event.target.value)}
          className="rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        What happens in it
        <textarea
          value={blurb}
          rows={2}
          maxLength={280}
          placeholder="Optional, and often better empty."
          onChange={(event) => setBlurb(event.target.value)}
          className="rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
        />
      </label>

      <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={visibility === 'public'}
          onChange={(event) => setVisibility(event.target.checked ? 'public' : 'private')}
          className="accent-accent"
        />
        Anyone with the link can watch it
      </label>

      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || name.trim().length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : saved ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          {saved ? 'Save over it' : 'Save'}
        </button>
        {saved && (
          <button
            type="button"
            onClick={() => {
              // Forgetting the row rather than deleting it: the next save makes
              // a second scene, which is the only way to say "keep both" from
              // an editor whose document is not a file.
              setSaved(null)
              onSaved?.(null)
              setNote('The next save keeps this as a second scene.')
            }}
            className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            Save as a copy
          </button>
        )}
      </div>

      {/*
        What the button will do, before it is pressed.

        The two states of this panel differ in one word on a button - "Save"
        against "Save over it" - and that word is doing more work than a word
        can: whether a press keeps a second scene or replaces one is the whole
        question somebody has when they come back to a document they saved
        yesterday. Said in a sentence instead, beside the control that means it.
      */}
      <p className="text-[11px] text-muted-foreground">
        {saved
          ? 'This document is that scene. Saving replaces it, and a reload comes back here.'
          : 'Nothing is kept yet — this document lives in the address bar until you save it.'}
      </p>

      {/*
        The share link, once there is something to share.
        Only offered when the scene is public, because a link to a private scene
        is a link that 404s for everybody it is sent to - which looks like a
        broken product rather than like a permission, and is the reason the
        checkbox above says what it does in plain words.
      */}
      {saved && (
        <div className="mt-1 flex flex-col gap-1.5 rounded-xl border border-border/70 bg-secondary/40 px-2.5 py-2">
          <p className="text-xs text-muted-foreground">
            {visibility === 'public'
              ? 'Anyone with this link can watch it — no account needed.'
              : 'Tick the box above to get a link you can send.'}
          </p>
          <div className="flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded bg-secondary/60 px-2 py-1 font-mono text-[10px] text-muted-foreground">
              /s/{saved}
            </code>
            <button
              type="button"
              disabled={visibility !== 'public'}
              onClick={async () => {
                await navigator.clipboard.writeText(`${window.location.origin}/s/${saved}`)
                setNote('link copied')
                setFailed(false)
              }}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-40"
            >
              <Link2 className="size-3.5" aria-hidden />
              Copy
            </button>
            <a
              href={`/s/${saved}`}
              target="_blank"
              rel="noreferrer"
              className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              Open
            </a>
          </div>
        </div>
      )}

      {/*
        Pinning, from here rather than from the board.
        The board's composer used to list every scene the space had saved and
        ask you to recognise one by name. This is the same act from the end that
        knows what it means: you are looking at the scene, you have just kept
        it, and the notice is one button and an optional line of text.
      */}
      {canPin && scope.kind === 'space' && (
        <PinToBoard
          key={saved ?? 'unsaved'}
          slug={scope.slug}
          sceneId={saved}
          canPinTop={canPinTop}
        />
      )}

      {note && (
        <p className={`text-xs ${failed ? 'text-amber-400' : 'text-muted-foreground'}`}>{note}</p>
      )}
    </Section>
  )
}

/**
 * Put this scene on the space's board.
 *
 * Only offered once the scene is a row, because a notice carries a scene *id*
 * and there is nothing to carry until then. Saving first is one button away and
 * already sitting above this one, so the unsaved state says so rather than
 * silently doing two things behind one click - which would also have to invent
 * a name for a scene somebody had not named.
 *
 * The caption is optional. That is the whole reason `publishPostSchema` grew a
 * refine: from here the scene *is* the notice, and demanding a sentence to go
 * with it is a toll on the common case. Words alone still work from the board's
 * own composer, and empty-with-nothing-attached is still refused.
 */
function PinToBoard({
  slug,
  sceneId,
  canPinTop,
}: {
  slug: string
  sceneId: string | null
  canPinTop: boolean
}) {
  const [caption, setCaption] = useState('')
  const [top, setTop] = useState(false)
  const [done, setDone] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!sceneId) {
    return (
      <p className="mt-1 rounded-xl border border-dashed border-border/70 px-2.5 py-2 text-xs text-muted-foreground">
        Save it to pin it to the board.
      </p>
    )
  }

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-xl border border-border/70 bg-secondary/40 px-2.5 py-2">
      <p className="text-xs text-muted-foreground">Pin it to the board</p>

      <textarea
        value={caption}
        rows={2}
        maxLength={2000}
        placeholder="Say something about it — or don't."
        onChange={(event) => {
          setCaption(event.target.value)
          setDone(false)
        }}
        className="resize-y rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
      />

      {canPinTop && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={top}
            onChange={(event) => setTop(event.target.checked)}
            className="accent-accent"
          />
          Keep it at the top
        </label>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setProblem(null)
            start(async () => {
              const result = await publishPost(slug, caption.trim(), top, sceneId)
              if (!result.ok) {
                setProblem(result.error)
                return
              }
              // The caption is cleared and the scene id is not: pinning the
              // same scene twice is a thing people do deliberately - a second
              // notice when the first has scrolled away - and it should not
              // come back with the old words already in the box.
              setCaption('')
              setDone(true)
            })
          }}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Pin className="size-3.5" aria-hidden />
          )}
          {done ? 'Pin it again' : 'Pin it'}
        </button>

        {done && (
          <a
            href={`/t/${slug}`}
            className="text-xs text-muted-foreground underline underline-offset-2 transition hover:text-foreground"
          >
            on the board
          </a>
        )}
      </div>

      {problem && <p className="text-xs text-amber-400">{problem}</p>}
    </div>
  )
}
