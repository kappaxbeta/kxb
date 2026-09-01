'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { attempt } from '@/app/components/connection'
import { fill } from '@/app/i18n/fill'
import type { WorkspaceDict } from '@/app/i18n/workspace'
import { Animator } from '@/app/ovaloffice/animator/animator'
import type { AnimationDoc, BakedClip } from '@/domain/animator/clip'
import { ALL_SPECS, type BoneSpec, isRigId, RIGS } from '@/domain/animator/rig'
import {
  renameClip,
  reshapeClip,
  retireClip,
  saveClip,
  setClipVisibility,
} from '@/domain/thingiverse/actions'
import type { ClipView } from '@/domain/thingiverse/queries'

/**
 * The space's clips, and the editor that makes them.
 *
 * One page rather than a list that links to an editor, because the two are read
 * together: what you want while keying a wave is to see the three waves this
 * space already has, and what you want while looking at the list is to open one
 * and change it.
 *
 * ---------------------------------------------------------------------------
 * Where the baking happens, and why it is here
 * ---------------------------------------------------------------------------
 * In the browser, inside `<Animator>`, and handed over already baked. Baking
 * needs the rig's *rest pose*, which is a property of a glTF that only the
 * browser has loaded - a server checking the arithmetic would have to parse a
 * model to re-derive a number the editor is holding. What the server does check
 * is the shape of what arrives (`assertClip`), which is the half that protects
 * the log: a bone track one number short binds happily and then plays garbage.
 */
export function ClipStudio({
  slug,
  clips,
  t,
  editing,
  skin,
}: {
  slug: string
  clips: ClipView[]
  t: WorkspaceDict['thingiverse']['clips']
  /** The clip being reopened, or null for a new one. */
  editing: { id: string; name: string; doc: unknown } | null
  /** The body this account wears, when it is a skin. See the page. */
  skin: string | null
}) {
  const router = useRouter()
  const [name, setName] = useState(editing?.name ?? '')

  /**
   * Which parts of the body this clip is allowed to drive.
   *
   * All three by default, which is a whole-body animation and replaces the
   * gait. Turning one off *trims the tracks* rather than setting a flag: the
   * runtime decides whether a clip is a layer by looking at what it drives (see
   * `isPartial`), so the honest way to say "this is only the arms" is for the
   * clip to contain only arms.
   *
   * Which also means the choice is not undoable in a saved clip - the legs are
   * gone, not hidden. That is the right trade for the thing this is: keying is
   * where the work is, and re-saving from the same editor session with the box
   * ticked again costs a click.
   */
  const [parts, setParts] = useState<Set<BoneSpec['group']>>(
    () => new Set<BoneSpec['group']>(['torso', 'arms', 'legs']),
  )
  const [saving, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  const mine = clips.filter((clip) => clip.mine)
  const shared = clips.filter((clip) => !clip.mine)

  const onSave = (baked: BakedClip, doc: AnimationDoc) =>
    start(async () => {
      setNote(null)

      /*
       * The clip's name comes from the field beside the button, not from the
       * document's own `name`. They are two different things wearing one word:
       * the document's is what the exported file is called, and this is what
       * the space's shelf calls the clip - which is what a blueprint spells.
       */
      const called = name.trim() || doc.name

      /*
       * Trimmed to the parts somebody ticked, before anything is stored.
       *
       * `bake` has already dropped every bone that never moved, so this only
       * ever removes tracks that *do* something - which is the point: a
       * whole-body pose with the legs unticked becomes an arms-only clip, and
       * an arms-only clip is one the runtime plays over a walk.
       */
      const trimmed: BakedClip = {
        ...baked,
        bones: Object.fromEntries(
          Object.entries(baked.bones).filter(([bone]) => {
            const group = ALL_SPECS[bone]?.group
            // A bone no rig here knows is kept: it belongs to a body this
            // editor did not pose, and dropping it would quietly gut a clip
            // somebody imported.
            return group === undefined || parts.has(group)
          }),
        ),
      }

      const result = await attempt(() =>
        editing
          ? reshapeClip(slug, { id: editing.id, clip: trimmed, doc })
          : saveClip(slug, {
              name: called,
              // Which rig it was keyed on, read off the baked bones rather than
              // asked for: the editor knows, and a picker asking somebody to
              // repeat it is a picker they can get wrong.
              skeleton: rigOf(trimmed),
              clip: trimmed,
              doc,
            }),
      )

      if (!result.ok) {
        setNote(result.error ?? 'Refused')
        return
      }

      setNote(t.saved)
      router.refresh()
    })

  return (
    /*
      `page-bare`: the roster panel goes and the column takes the window.

      The same rule the bench sets, for the same reason and one more of its own.
      A pose editor is a rig in a viewport with a timeline under it, and the
      timeline is the control that suffers first when the column narrows - it is
      the one element here whose usefulness is measured in pixels of width. See
      the block in globals.css.
    */
    <div className="page-bare space-y-6">
      <section className="space-y-3">
        {clips.length === 0 && <p className="text-sm text-ink-muted">{t.none}</p>}

        {[
          [t.yours, mine],
          [t.shared, shared],
        ]
          .filter(([, list]) => (list as ClipView[]).length > 0)
          .map(([label, list]) => (
            <div key={label as string} className="space-y-1">
              <h2 className="text-xs uppercase tracking-[0.14em] text-ink-muted">
                {label as string}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {(list as ClipView[]).map((clip) => (
                  <li
                    key={clip.id}
                    className={`rounded-xl border px-3 py-2 ${
                      editing?.id === clip.id
                        ? 'border-accent/50 bg-accent/10'
                        : 'border-line/60 bg-surface'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <a
                        href={`/t/${slug}/thingiverse/clips?edit=${clip.id}`}
                        className="text-sm text-ink underline decoration-line"
                      >
                        {clip.name}
                      </a>
                      <span className="font-mono text-[10px] text-ink-muted">
                        {fill(t.playsOn, {
                          rig: isRigId(clip.skeleton)
                            ? RIGS[clip.skeleton].label
                            : clip.skeleton,
                        })}
                      </span>
                    </div>

                    {clip.mine && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Small
                          onClick={() =>
                            start(async () => {
                              const next = window.prompt(t.rename, clip.name)
                              if (!next || next.trim() === clip.name) return
                              await attempt(() =>
                                renameClip(slug, { id: clip.id, name: next.trim() }),
                              )
                              router.refresh()
                            })
                          }
                        >
                          {t.rename}
                        </Small>
                        <Small
                          onClick={() =>
                            start(async () => {
                              await attempt(() =>
                                setClipVisibility(slug, {
                                  id: clip.id,
                                  visibility:
                                    clip.visibility === 'public' ? 'private' : 'public',
                                }),
                              )
                              router.refresh()
                            })
                          }
                        >
                          {clip.visibility === 'public' ? t.unshare : t.share}
                        </Small>
                        <Small
                          onClick={() =>
                            start(async () => {
                              await attempt(() => retireClip(slug, clip.id))
                              router.refresh()
                            })
                          }
                        >
                          {t.retire}
                        </Small>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

        {editing && (
          <a
            href={`/t/${slug}/thingiverse/clips`}
            className="inline-block rounded-lg border border-line/60 px-3 py-1.5 text-xs text-ink transition hover:bg-surface-raised"
          >
            {t.newClip}
          </a>
        )}
      </section>

      <fieldset className="flex flex-wrap items-center gap-3 rounded-xl border border-line/60 bg-surface p-3">
        <legend className="px-1 text-xs font-medium text-ink">{t.parts}</legend>
        {(['torso', 'arms', 'legs'] as const).map((group) => (
          <label key={group} className="flex items-center gap-1.5 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={parts.has(group)}
              onChange={(event) =>
                setParts((current) => {
                  const next = new Set(current)
                  if (event.target.checked) next.add(group)
                  else next.delete(group)
                  return next
                })
              }
              className="size-4 accent-accent"
            />
            {t.groups[group]}
          </label>
        ))}
        <span className="w-full text-[11px] text-ink-muted">{t.partsHint}</span>
      </fieldset>

      {/*
        The editor itself, unchanged from the one in the backoffice.

        `key` on the clip being opened, so following a link from the list above
        remounts it: the animator adopts its document when the *model* loads
        (see `onReady`), which happens once, and a second clip arriving as a
        prop into a live editor would be ignored.
      */}
      <Animator
        key={editing?.id ?? 'new'}
        skin={skin}
        shelf={{
          label: t.save,
          saving,
          note,
          name,
          onName: setName,
          onSave,
          initial: editing?.doc,
        }}
      />
    </div>
  )
}

/**
 * Which rig a baked clip was keyed on, read off the bones it drives.
 *
 * The editor knows perfectly well and could pass it; reading it back off the
 * clip is one fewer thing that can be wrong, and it is the value that *matters*
 * - the clip plays on whatever these bone names belong to, whatever anybody
 * meant. A clip that drives nothing at all is called a person's, because that
 * is what the editor opens on and a nameless rig would be worse than a guess.
 */
function rigOf(baked: BakedClip): string {
  return Object.keys(baked.bones).some((bone) => bone.startsWith('leg-')) ? 'peep' : 'dummy'
}

function Small({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-line/60 px-2 py-1 text-[11px] text-ink-muted transition hover:bg-surface-raised hover:text-ink"
    >
      {children}
    </button>
  )
}
