'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { BuilderWorld } from '@/domain/builder/world'
import { serialiseWorld } from '@/domain/builder/world'
import { countBlockable, isBlockModel } from '@/domain/worlds/blocks'
import { publishWorld, saveWorld, type WorldScope } from '@/domain/worlds/actions'
import { MAX_WORLD_TAGS, WORLD_TAGS } from '@/domain/worlds/tags'

/**
 * Putting a world somewhere other people can find it.
 *
 * The rest of the editor saves to this browser - a slot in localStorage, a
 * `.json` on your disk, a very long link - and all three are right for what
 * they are for: a working file belongs to the person working on it. This is the
 * other move: the world stops being your file and becomes something a space can
 * pick up and stand in.
 *
 * Which is why publishing is a separate act rather than what Save does. A world
 * you are halfway through is not a world anybody should be choosing from a
 * catalogue, and an editor that published every keystroke would make the
 * catalogue a list of half-built things.
 *
 * ---------------------------------------------------------------------------
 * Save, or fork
 * ---------------------------------------------------------------------------
 * Opening somebody else's world and changing it is the main way anybody will
 * make a second world, so the panel offers both endings and makes which one you
 * get obvious *before* you press anything: your own world offers Save and Save
 * as a fork; somebody else's offers only the fork. There is no case where a
 * button called Save quietly writes to a stranger's row - the action refuses it
 * too, but a refusal you discover after the work is a worse design than a
 * button that was never there.
 */

export interface OpenedWorld {
  id: string
  blurb: string | null
  tags: string[]
  visibility: 'private' | 'public'
  /** Whether this caller may write back to it. Decided on the server; re-checked there. */
  mine: boolean
  /** Who published it, for the line above the buttons. */
  credit: string
}

export function PublishPanel({
  world,
  scope,
  opened,
  shoot,
  onNote,
}: {
  world: BuilderWorld
  scope: WorldScope
  opened: OpenedWorld | null
  /**
   * Take the card picture, from the canvas that is already on screen.
   *
   * A callback rather than a data URL prop, because a picture taken on every
   * render is a `toDataURL` on every keystroke in the blurb field - and what
   * the card should show is the world at the moment somebody decided it was
   * worth publishing, which is exactly when this is called.
   *
   * Returns null before the models have loaded, and the world publishes
   * anyway: a missing picture is a placeholder on a card, not a reason to
   * refuse somebody's work.
   */
  shoot: () => string | null
  onNote: (note: string) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [blurb, setBlurb] = useState(opened?.blurb ?? '')
  const [tags, setTags] = useState<string[]>(opened?.tags ?? [])
  const [visibility, setVisibility] = useState<'private' | 'public'>(
    opened?.visibility ?? 'private',
  )

  // Counted here rather than asked of the server, so the numbers move while you
  // build. This is the honest size of what a space would actually get: the
  // ground included, the furniture left behind. See domain/worlds/blocks.ts.
  const blocks = countBlockable(world)
  const props = world.placements.filter((placement) => !isBlockModel(placement.model)).length

  const home = scope.kind === 'space' ? `/t/${scope.slug}/builder` : '/ovaloffice/builder'

  // Read at the moment of the call, not at render: see `shoot`.
  const detailsWith = (poster: string | null) => ({
    name: world.name,
    blurb,
    tags,
    visibility,
    poster,
  })

  function toggleTag(id: string): void {
    setTags((current) =>
      current.includes(id)
        ? current.filter((tag) => tag !== id)
        : current.length >= MAX_WORLD_TAGS
          ? current
          : [...current, id],
    )
  }

  function publish(forkedFrom: string | null): void {
    startTransition(async () => {
      const result = await publishWorld({
        scope,
        document: serialiseWorld(world),
        details: detailsWith(shoot()),
        forkedFrom,
      })
      if (!result.ok) {
        onNote(result.error)
        return
      }
      onNote(
        forkedFrom
          ? `forked “${world.name}” — it is yours now, and private until you publish it`
          : `published “${world.name}”`,
      )
      // The editor now has a row behind it, so the next Save goes to that row
      // rather than making a second copy. `replace` rather than `push`: this is
      // the same session, not a place to go back from.
      router.replace(`${home}?world=${result.id}`)
    })
  }

  function save(): void {
    if (!opened) return
    startTransition(async () => {
      const result = await saveWorld({
        scope,
        id: opened.id,
        document: serialiseWorld(world),
        details: detailsWith(shoot()),
      })
      onNote(result.ok ? `saved “${world.name}”` : result.error)
    })
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Catalogue
      </h3>

      {opened && (
        <p className="text-xs text-muted-foreground">
          Editing{' '}
          <Link href={`/worlds/${opened.id}`} className="underline hover:text-foreground">
            a published world
          </Link>{' '}
          by {opened.credit}
          {!opened.mine && ' — you can fork it, not overwrite it'}
        </p>
      )}

      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">
          One line about it <span className="opacity-60">optional</span>
        </span>
        <input
          value={blurb}
          onChange={(event) => setBlurb(event.target.value.slice(0, 200))}
          placeholder="A walled arena with three ways in."
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <div>
        <span className="mb-1 block text-xs text-muted-foreground">
          Tags <span className="opacity-60">up to {MAX_WORLD_TAGS}, for the catalogue</span>
        </span>
        <div className="flex flex-wrap gap-1.5">
          {WORLD_TAGS.map((tag) => {
            const on = tags.includes(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                title={tag.hint}
                aria-pressed={on}
                disabled={!on && tags.length >= MAX_WORLD_TAGS}
                className={`rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-30 ${
                  on
                    ? 'border-accent bg-accent/15 text-ink'
                    : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                {tag.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex gap-1.5">
        {(['private', 'public'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setVisibility(option)}
            aria-pressed={visibility === option}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs transition ${
              visibility === option
                ? 'border-accent bg-accent/15 text-ink'
                : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            {option === 'private' ? 'Kept to us' : 'Public'}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground tabular-nums">
        {blocks.toLocaleString()} blocks a space could walk on
        {props > 0 && ` · ${props.toLocaleString()} props stay behind`}
        {blocks === 0 && (
          <span className="ml-1 text-amber-500">
            — nothing here can be stood on, so a space could not use it
          </span>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        {opened?.mine && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        )}

        {opened ? (
          <button
            type="button"
            onClick={() => publish(opened.id)}
            disabled={pending}
            className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-secondary disabled:opacity-40"
          >
            Save as a fork
          </button>
        ) : (
          <button
            type="button"
            onClick={() => publish(null)}
            disabled={pending || world.placements.length === 0}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-40"
          >
            {pending ? 'Publishing…' : 'Publish to the catalogue'}
          </button>
        )}

        <Link
          href="/worlds"
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary"
        >
          Browse worlds
        </Link>
      </div>
    </section>
  )
}
