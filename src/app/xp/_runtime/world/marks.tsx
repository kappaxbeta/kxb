'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import type { Mark } from '@kxb/xp'
import { ARRIVAL_SLOTS, arrivalOffset } from '@/app/xp/_runtime/spawn'

/**
 * The facts about a level, drawn.
 *
 * A mark is not a model - it is a *claim*: this is where red scores, this is
 * where a run ends, this is where the away side arrives. `capabilityProblems`
 * checks them at parse time, so a document saying `football` with no goals is
 * refused before anybody is invited.
 *
 * Which left one gap, and it is the reason this file exists: nothing drew them.
 * A goal that is only a row in a JSON file is a goal a player runs past without
 * knowing it was there, and an author who placed one in the wrong place has no
 * way to find that out except by failing to score.
 *
 * ---------------------------------------------------------------------------
 * A frame, not a solid
 * ---------------------------------------------------------------------------
 * Lines rather than a filled plane, for two reasons that point the same way. A
 * goal you cannot see through is a goal you cannot aim at, and a solid at the
 * end of a pitch reads as a *wall* - which is exactly the wrong thing to
 * suggest about the one place a ball is supposed to go.
 *
 * They are also not solid in the simulation. Nothing here collides with
 * anything: a mark is read by the rules, and the rules ask where it is rather
 * than bumping into it.
 */

/**
 * What each kind looks like.
 *
 * The two team colours are the document's own - `#f0abfc` and `#67e8f9` are the
 * pair the lounge has used for red and blue since football existed, and a
 * player who has seen one should not have to learn the other.
 */
const COLOURS: Record<Mark['kind'], string> = {
  red: '#f0abfc',
  blue: '#67e8f9',
  start: '#a3e635',
  finish: '#fbbf24',
  spawn: '#ffffff',
  // Dimmer than the rest on purpose: a board is *made* of these, and forty
  // fields lit like a spawn point would be a level that looks like a warning.
  point: '#94a3b8',
}

export function Marks({
  marks,
  onPick,
  selected,
  footprint,
  coordinates,
}: {
  marks: readonly Mark[]
  /**
   * Which mark was clicked, by its index.
   *
   * Only the editor passes one. In a running level a mark is a fact the rules
   * read, and something you can click in a game is something you expect to do
   * something - so the handler is absent rather than ignored, which also means
   * a shot fired at a goal passes through it.
   */
  onPick?: (index: number) => void
  /** Drawn brighter, so the thing the form is about is the thing you can see. */
  selected?: number | null
  /**
   * Draw the whole arrival grid under a spawn, not just the mark.
   *
   * The editor passes this and a running level does not. It is an authoring
   * question - *does this fit on my platform* - and in play it would be a
   * two-and-a-half cell grid of circles under everybody's feet at kick-off.
   */
  footprint?: boolean
  /**
   * Draw the coordinates too, not only the claims.
   *
   * The editor passes this and a running level does not, and the split is the
   * one the `point` kind was invented for: every other kind is a *claim* worth
   * seeing - this is where red scores, this is where a run ends - and a `point`
   * means nothing to the runtime at all. It is a named place, and a level made
   * of named places is a board.
   *
   * Which is how the board game ended up playing behind 176 translucent grey
   * frames, one per field, stacked over the thing you were trying to look at.
   * They are the right thing to see while you are *placing* them and pure
   * obstruction once somebody is playing on them.
   */
  coordinates?: boolean
}) {
  return (
    <>
      {marks.map((mark, index) =>
        // Skipped inside the map rather than filtered before it, because `index`
        // is the mark's identity: `onPick` hands it back to the editor, which
        // looks it up in the document's own array. A filter would renumber every
        // mark after the first point.
        mark.kind === 'point' && !coordinates ? null : mark.kind === 'spawn' ? (
          <Spawn
            key={index}
            mark={mark}
            onPick={onPick}
            index={index}
            on={selected === index}
            footprint={footprint ?? false}
          />
        ) : (
          <Frame key={index} mark={mark} onPick={onPick} index={index} on={selected === index} />
        ),
      )}
    </>
  )
}

/**
 * What a click on a mark does, for the two shapes that have one.
 *
 * Stopped so the editor's build plane underneath does not also react - a click
 * that selects a goal and lays a wall behind it is one gesture doing two things,
 * which is the same reason the instanced pick stops its own event.
 */
function picker(index: number, onPick?: (index: number) => void) {
  if (!onPick) return undefined
  return (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    onPick(index)
  }
}

/**
 * A goal, a start or a finish: a rectangle standing in the world.
 *
 * Turned by `facing`, because a goal scorable from both sides is not a goal -
 * and a frame drawn without its facing is one an author cannot check.
 */
function Frame({
  mark,
  index,
  onPick,
  on,
}: {
  mark: Mark
  index: number
  onPick?: (index: number) => void
  on?: boolean
}) {
  const geometry = useMemo(() => {
    const half = mark.width / 2
    const top = mark.height
    // The uprights and the bar, as a run of line segments. Deliberately open at
    // the bottom: a goal's bottom edge is the floor, and a line drawn along it
    // fights with the floor for the same pixels.
    const points: number[] = [
      -half, 0, 0, -half, top, 0,
      -half, top, 0, half, top, 0,
      half, top, 0, half, 0, 0,
    ]
    const buffer = new THREE.BufferGeometry()
    buffer.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    return buffer
  }, [mark.width, mark.height])

  return (
    <group position={[mark.x, mark.y, mark.z]} rotation={[0, (mark.facing * Math.PI) / 180, 0]}>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color={COLOURS[mark.kind]} toneMapped={false} />
      </lineSegments>
      {/* A pane of the same colour at a tenth opacity: the frame alone
          disappears at a distance, because a line is one pixel wide however far
          away it is. It is also the only part of a frame big enough to click,
          which is why the pick handler is here and not on the lines. */}
      <mesh position={[0, mark.height / 2, 0]} onPointerDown={picker(index, onPick)}>
        <planeGeometry args={[mark.width, mark.height]} />
        <meshBasicMaterial
          color={COLOURS[mark.kind]}
          transparent
          opacity={on ? 0.28 : 0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

/**
 * Where a side arrives: a ring on the floor, and the ground it actually needs.
 *
 * Flat rather than a frame, because a spawn is a *place to stand* and anything
 * standing up at one would be something to walk into. The inner ring is the
 * mark itself - one person's worth of floor, and not the mark's `width`, which
 * a spawn ignores because the format says so.
 *
 * ---------------------------------------------------------------------------
 * The footprint, and the bug it exists to prevent
 * ---------------------------------------------------------------------------
 * A spawn is not one person's worth of floor. `arrivalSpot` spreads arrivals
 * over a three-by-three grid so nobody lands inside anybody, and the picture
 * showed none of that - so *"I put a spawn on a platform and I fall through the
 * platform"* was a level that looked right in the editor and dropped nine
 * players in ten in play.
 *
 * **The circles are read off `arrivalOffset`, not drawn from numbers typed
 * here.** That is the whole point: two descriptions of where people land is how
 * a picture comes to disagree with the placement, which is the failure this is
 * a fix for. Move a slot and the drawing moves with it.
 *
 * The enclosing ring is centred on the grid rather than on the mark, because
 * the grid is not centred on the mark: rows go *backwards* from it, so a circle
 * drawn around the mark would promise floor in front that nobody uses and hide
 * the two and a half cells behind that they do.
 */
function Spawn({
  mark,
  index,
  onPick,
  on,
  footprint,
}: {
  mark: Mark
  index: number
  onPick?: (index: number) => void
  on?: boolean
  footprint: boolean
}) {
  const colour =
    mark.team === 'red' ? COLOURS.red : mark.team === 'blue' ? COLOURS.blue : COLOURS.spawn

  return (
    <group position={[mark.x, mark.y + 0.02, mark.z]} rotation={[-Math.PI / 2, 0, 0]}>
      {footprint && <Footprint colour={colour} facing={mark.facing} />}

      {/*
        A disc you cannot see, only where a mark can be clicked.

        A ring is a shape with a hole in it, and a hole is exactly where a click
        goes through to the floor behind - so selecting a spawn would mean
        hitting a band a centimetre and a half wide. Invisible rather than
        `visible={false}`, which would stop it being hit at all.
      */}
      {onPick ? (
        <mesh onPointerDown={picker(index, onPick)}>
          <circleGeometry args={[0.7, 24]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ) : null}

      <mesh>
        <ringGeometry args={[0.55, 0.7, 32]} />
        <meshBasicMaterial
          // The team's colour when it has one, so two spawns are visibly two
          // sides rather than two identical circles.
          color={colour}
          transparent
          opacity={on ? 1 : 0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

/**
 * The ground a spawn actually needs, as the grid people land on.
 *
 * ---------------------------------------------------------------------------
 * Read off the placement, never typed
 * ---------------------------------------------------------------------------
 * Every circle is `arrivalOffset` asked for a slot. A second set of numbers here
 * would be a picture that can disagree with where people go, and a picture that
 * disagreed with where people go is the whole reason this exists: the spawn was
 * drawn as one ring, so a mark on a two-cell platform looked fine in the editor
 * and dropped nine players in ten.
 *
 * Drawn in the *mark's own frame* - the group above is already rotated flat, so
 * this only has to turn by `facing` - which is the same frame `arrivalSpot`
 * builds in. `back` runs along local -z, the way the mark faces, which is why
 * the grid sits behind the mark rather than around it.
 */
function Footprint({ colour, facing }: { colour: string; facing: number }) {
  const grid = useMemo(() => {
    const slots = Array.from({ length: ARRIVAL_SLOTS }, (_, slot) => arrivalOffset(slot))

    /*
     * The enclosing circle, centred on the grid rather than on the mark.
     *
     * The rows run backwards, so a circle around the mark would promise floor in
     * front that nobody uses and hide the ground behind that they do. Centre and
     * radius are measured off the slots for the same reason the slots are not
     * typed: one description, not two.
     */
    const backs = slots.map((slot) => slot.back)
    const middle = (Math.min(...backs) + Math.max(...backs)) / 2
    const radius = Math.max(
      ...slots.map((slot) => Math.hypot(slot.across, slot.back - middle)),
    )

    return { slots, middle, radius }
  }, [])

  return (
    /*
     * Turned by `facing` about the group's own normal. Negative because the
     * parent has already been laid flat by -90 about x, which flips the
     * handedness of what is left - the same correction `marks.tsx` makes for
     * every other mark it turns.
     */
    <group rotation={[0, 0, -(facing * Math.PI) / 180]}>
      {/* The whole thing, so "does this fit" is one shape to look at. */}
      <mesh position={[0, -grid.middle, 0]}>
        <ringGeometry args={[grid.radius + 0.5, grid.radius + 0.62, 48]} />
        <meshBasicMaterial
          color={colour}
          transparent
          /* Faint, because this is the answer to a question an author asks once
             and then wants out of the way of the level they are building. */
          opacity={0.32}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* And a circle per slot, so it is nine places rather than a vague area. */}
      {grid.slots.map((slot, index) => (
        <mesh key={index} position={[slot.across, -slot.back, 0]}>
          <ringGeometry args={[0.34, 0.42, 20]} />
          <meshBasicMaterial
            color={colour}
            transparent
            opacity={0.32}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}
