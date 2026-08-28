'use client'

import { useState } from 'react'
import { MAIN_SCENE, type XpDocument } from '@kxb/xp'
import type { PlaceTarget } from '@kxb/xp/edit'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { PanelLabel } from '@/app/xp/_editor/chrome'

/**
 * The places this document holds, as a list you can walk into.
 *
 * ---------------------------------------------------------------------------
 * The root is a row, not an absence
 * ---------------------------------------------------------------------------
 * A document's own `world` and `spawn` *are* a scene - the one called `main` -
 * and the list says so rather than starting at the second room. That is not
 * decoration: a level with one place looks like a level with one place, so the
 * question "where am I" has an answer before there is anything to choose
 * between, and adding a second room is visibly adding a *second* rather than
 * discovering that rooms exist.
 *
 * It is also the row that cannot be renamed or removed - the name is what the
 * format calls the root, and a document with no place at all is not a document.
 * The controls are simply not drawn on it, rather than drawn and refused: a
 * disabled button on the first row of every list is a question every author
 * asks once. It *can* be opened, though, because it is where coming back to
 * goes.
 *
 * ---------------------------------------------------------------------------
 * Double-click opens, and the row says which one is open
 * ---------------------------------------------------------------------------
 * Opening a room points the whole editor at it - the viewport draws it, the
 * brush paints into it, the Inspector lists its actors - and the seam that does
 * that is `standing` in ../editor, over `placeIn`. Here that is one prop in and
 * one callback out.
 *
 * The open row is marked rather than merely selected-looking, and it is marked
 * in *words* as well as in colour. Which room a stroke lands in is the single
 * most expensive thing to be wrong about in this editor - a wall painted into
 * the cellar while you believed you were in the lobby is invisible until
 * somebody walks in - so the answer is on screen in a form that survives being
 * glanced at.
 *
 * Rename moved to the button beside it, which it shared with double-click
 * before there was anything else for the gesture to mean. Opening is the thing
 * somebody does twenty times an hour and renaming is the thing they do once.
 *
 * ---------------------------------------------------------------------------
 * And a door, on the rows you are not standing in
 * ---------------------------------------------------------------------------
 * A room you can open is a room you immediately want a way into, and a door is
 * a *pair* of rooms: this one leads out of wherever you are working and into
 * the row it is on. So it is offered on every row except that one - a door out
 * of a room into itself is a tile that does nothing, and `addDoor` refuses it
 * rather than trusting this to remember.
 *
 * The root gets the button too, and that is the half worth having: `main` is
 * the way back, so without it the front room is the one place in a level a door
 * cannot reach.
 */
/**
 * The way into a row's room, from the room being edited.
 *
 * Not drawn on the row you are already in, rather than drawn and refused: a
 * button that is always there and does nothing on one row is a button people
 * press twice before reading it. `addDoor` refuses that case too - this is the
 * half that keeps it off the screen, not the half that keeps it out of the file.
 *
 * Out here rather than inside `Scenes`, because a component declared during a
 * render is a *new* component every render and React throws its state away each
 * time. It has no state today, which is exactly the kind of thing that stops
 * being true quietly.
 */
function Door({
  to,
  standing,
  onDoor,
}: {
  to: string
  standing: PlaceTarget
  onDoor: (to: string) => void
}) {
  const t = xpEditorDict(useLocale()).scenes
  if (standing === (to === MAIN_SCENE ? undefined : to)) return null
  return (
    <button
      type="button"
      onClick={() => onDoor(to)}
      title={t.doorTitle}
      className="rounded border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500 transition-colors hover:border-violet-600 hover:text-violet-300"
    >
      {t.door}
    </button>
  )
}

export function Scenes({
  document,
  standing,
  onOpen,
  onDoor,
  onAdd,
  onRename,
  onRemove,
}: {
  document: XpDocument
  /** Which room the editor is pointed at. `undefined` is the level's own world. */
  standing: PlaceTarget
  onOpen: (where: PlaceTarget) => void
  /** A way into that room, put down in the one being edited. See `addDoor`. */
  onDoor: (to: string) => void
  onAdd: (name: string) => void
  onRename: (from: string, to: string) => void
  onRemove: (name: string) => void
}) {
  const t = xpEditorDict(useLocale()).scenes
  const [naming, setNaming] = useState('')
  /** Which row is being renamed, and what to. Null is none. */
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null)

  /*
   * Doors are left out on purpose.
   *
   * `scenes` holds two kinds of value - an object is a place in this document,
   * a string is a door to somewhere else - and this list is about places. A
   * door has no world to edit and no spawn to stand on, so a row for one would
   * be a row where every control is meaningless.
   */
  const places = Object.entries(document.scenes ?? {}).filter(
    (entry): entry is [string, Exclude<(typeof entry)[1], string>] => typeof entry[1] !== 'string',
  )

  /** The border and text a row wears, by whether it is the one that is open. */
  const rowClass = (open: boolean) =>
    `flex items-center justify-between gap-2 rounded border px-2 py-1.5 ${
      open ? 'border-violet-500/60 bg-violet-500/5' : 'border-neutral-800'
    }`

  return (
    <section className="mt-4 border-t border-neutral-900 pt-3">
      <PanelLabel className="mb-1.5">{t.heading}</PanelLabel>
      <p className="mb-2 font-mono text-[10px] leading-relaxed text-neutral-500">{t.lead}</p>

      <ul className="space-y-1 font-mono text-[11px]">
        {/* The root, first and always, with nothing to do to it but go there. */}
        <li className={rowClass(standing === undefined)}>
          <button
            type="button"
            onDoubleClick={() => onOpen(undefined)}
            title={standing === undefined ? undefined : t.openIt}
            className={`min-w-0 flex-1 truncate text-left ${
              standing === undefined ? 'text-violet-200' : 'text-neutral-300 hover:text-neutral-100'
            }`}
          >
            {MAIN_SCENE}
          </button>
          <span className="flex shrink-0 items-center gap-1 text-[10px] text-neutral-600">
            {standing === undefined ? t.standingHere : t.theLevelItself}
            <Door to={MAIN_SCENE} standing={standing} onDoor={onDoor} />
          </span>
        </li>

        {places.map(([key, scene]) => {
          const open = standing === key
          return (
            <li key={key} className={rowClass(open)}>
              {editing?.key === key ? (
                <input
                  autoFocus
                  value={editing.text}
                  onChange={(event) => setEditing({ key, text: event.target.value })}
                  onBlur={() => {
                    onRename(key, editing.text.trim())
                    setEditing(null)
                  }}
                  onKeyDown={(event) => {
                    // The form around this would otherwise save the level.
                    if (event.key === 'Enter') event.preventDefault()
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') setEditing(null)
                  }}
                  className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-neutral-200 outline-none"
                />
              ) : (
                <button
                  type="button"
                  onDoubleClick={() => onOpen(key)}
                  title={open ? undefined : t.openIt}
                  className={`min-w-0 flex-1 truncate text-left ${
                    open ? 'text-violet-200' : 'text-neutral-300 hover:text-neutral-100'
                  }`}
                >
                  {key}
                  {scene.name ? (
                    <span className="ml-2 text-[10px] text-neutral-600">{scene.name}</span>
                  ) : null}
                </button>
              )}

              <div className="flex shrink-0 items-center gap-1">
                {open ? (
                  <span className="mr-1 text-[10px] text-violet-300/70">{t.standingHere}</span>
                ) : null}
                <Door to={key} standing={standing} onDoor={onDoor} />
                <button
                  type="button"
                  onClick={() => setEditing({ key, text: key })}
                  className="rounded border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500 transition-colors hover:border-neutral-600 hover:text-neutral-300"
                >
                  {t.rename}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(key)}
                  className="rounded border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500 transition-colors hover:border-rose-700 hover:text-rose-300"
                >
                  {t.remove}
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {/*
        Adding by name, because a scene *is* its name.

        The key is what a `load` verb says and what a flow's `scene` names, so it
        is typed rather than generated - a room called `scene-2` is a room whose
        name tells the next reader nothing.
      */}
      <div className="mt-2 flex gap-1">
        <input
          value={naming}
          onChange={(event) => setNaming(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            onAdd(naming.trim())
            setNaming('')
          }}
          placeholder={t.namePlaceholder}
          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-[11px] text-neutral-200 outline-none placeholder:text-neutral-700 focus:border-neutral-600"
        />
        <button
          type="button"
          onClick={() => {
            onAdd(naming.trim())
            setNaming('')
          }}
          className="rounded border border-neutral-800 px-2 py-1 font-mono text-[11px] text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200"
        >
          {t.add}
        </button>
      </div>
      <p className="mt-1 font-mono text-[10px] leading-relaxed text-neutral-600">{t.nameRule}</p>
    </section>
  )
}
