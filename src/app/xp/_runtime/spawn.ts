/**
 * Where somebody arrives.
 *
 * Two things, and the first was a surprise: **nothing read `spawn` marks at
 * all.** `marks.tsx` drew them, `capabilityProblems` counted them - a `match`
 * without two is refused - and the editor let you place and name them, and then
 * every player in every XP arrived at `xp.spawn`, the single point on the
 * document. A `match` could be refused for having only one spawn while both of
 * its two were being ignored.
 *
 * The second is the one task.md asks for: everybody arriving at one point means
 * two people arrive *inside* each other, and the first seconds of a match are
 * spent untangling.
 *
 * ---------------------------------------------------------------------------
 * The slot comes from who you are, not from a roster
 * ---------------------------------------------------------------------------
 * This is the decision worth arguing about. The obvious design hands out
 * positions by join order, which needs a roster - and a roster is not there when
 * you need it: presence arrives over a websocket some milliseconds after the
 * world is built, and the spawn has to be decided on the first frame. Waiting
 * means a visible teleport once the channel connects, which is worse than
 * overlapping.
 *
 * So the slot is a hash of the player's own id. It needs nothing, it is the same
 * on every client without anybody being told, and it is stable - the same person
 * lands in the same place every time, which is the property the lounge's own
 * arrivals already have and the one that makes a spawn feel like a place rather
 * than a lottery. Two people can collide on the same slot; `separate` in
 * `physics.ts` resolves that in one frame, which is exactly the failure this is
 * allowed to have.
 */

import type { Mark, XpWorld } from '@kxb/xp'
import {
  blocked,
  EYE_HEIGHT,
  standingSurface,
  type SolidTest,
  type SurfaceTest,
} from '@kxb/xp/engine'

/** Where somebody stands and which way they look. `xp.spawn`'s shape. */
export interface Arrival {
  x: number
  y: number
  z: number
  facing: number
}

/**
 * How far apart arrivals stand, in cells.
 *
 * `PERSONAL_SPACE` is 0.6 - two player boxes touching - and that is the distance
 * at which people stop overlapping, not the distance at which they stop being in
 * the way. A cell and a quarter is far enough to read as "you are two people"
 * and near enough to keep a grid on the sort of ledge a start line sits on.
 *
 * Kept deliberately tight for that second reason. A spread that puts somebody in
 * mid-air is a worse bug than the one it fixes: two people inside each other
 * push apart on the next frame, and a player spawned over a drop has already
 * lost the run before they touched a key.
 */
export const ARRIVAL_SPACING = 1.25

/**
 * How many stand abreast before a new row starts.
 *
 * Three, so nine people fit in a three-by-three that is two and a half cells
 * across. Beyond nine it keeps adding rows backwards rather than widening,
 * because a spawn is somewhere to stand and a line of twelve is a queue.
 */
const PER_ROW = 3

/**
 * How many slots there are, which is the grid squared.
 *
 * Exported because the *drawing* of a spawn needs the same number - see
 * `Footprint` in ./marks. A picture built from its own idea of how many people
 * fit is a picture that can disagree with where they actually land, which is
 * exactly the disagreement that made a spawn on a small platform look fine.
 */
export const ARRIVAL_SLOTS = PER_ROW * PER_ROW

/** The spawn marks, in document order. */
export function spawnMarks(marks: readonly Mark[]): Mark[] {
  return marks.filter((mark) => mark.kind === 'spawn')
}

/**
 * Which spawn a side arrives at, or null to use the document's own point.
 *
 * **A player with no side does not get a side's spawn.** That is the rule worth
 * defending, and it was wrong in the first draft of this file. Three of the four
 * documents we ship carry two spawn marks, both teamed - and `moving-parts` puts
 * its `xp.spawn` deliberately in the middle between them. Falling back to "the
 * first spawn in the file" moved every teamless player onto red's mark, six
 * cells off the spot the author chose, for no reason a reader of the document
 * could see. Spawn marks are how a level says where a *side* starts; the
 * document's own spawn is what it says about everybody else.
 *
 * With a side, it does fall back rather than fail, because each step is a level
 * somebody is playing right now: their own team's mark, then any mark with no
 * team on it, then the first mark at all. A half-finished level should still put
 * somebody somewhere.
 *
 * ---------------------------------------------------------------------------
 * Several marks that all fit is a choice, not a tie to break by index
 * ---------------------------------------------------------------------------
 * Reported against Proto Bug as *"they spawn all on the same spot"*, and the
 * document was right and this function was not: it places **five** spawn marks
 * around the ship and every player arrived at the first one, because
 * `find` stops at the first match. The other four were drawn in the editor,
 * counted by `capabilityProblems`, and read by nobody.
 *
 * So when more than one mark fits, `id` picks between them the same way it picks
 * a slot within one - a hash, agreed by every client without anybody being told,
 * and stable, so the same person starts in the same place every time. Without an
 * `id` it is still the first, which is what the editor's preview and every test
 * that predates this hand over.
 *
 * A level with one mark per side is untouched, because one candidate is one
 * answer whatever the id is.
 */
export function spawnFor(marks: readonly Mark[], team?: string, id?: string): Mark | null {
  const spawns = spawnMarks(marks)
  if (spawns.length === 0) return null

  const neutral = spawns.filter((mark) => mark.team === undefined)
  if (team === undefined) return pick(neutral, id)

  const own = spawns.filter((mark) => mark.team === team)
  return pick(own, id) ?? pick(neutral, id) ?? spawns[0]!
}

/**
 * One of several marks that all fit, or null when none do.
 *
 * Seeded apart from the slot hash - the `@` is not decoration - because the two
 * questions are asked of the same string a line apart. One hash used for both
 * would tie them together: everybody at mark two would be in slot two, so a
 * three-mark level would use three of its nine slots and the pile it was meant
 * to break up would come straight back at a smaller size.
 */
function pick(spawns: readonly Mark[], id?: string): Mark | null {
  if (spawns.length === 0) return null
  if (spawns.length === 1 || !id) return spawns[0]!
  return spawns[hash(`${id}@mark`) % spawns.length]!
}

/**
 * A number from an id, spread evenly enough to be a slot.
 *
 * FNV-1a, because it is eight lines and has no dependency. What matters is not
 * cryptographic quality but that two clients agree and that adjacent ids - which
 * is what uuids from the same batch look like - do not land on adjacent slots.
 */
function hash(id: string): number {
  let value = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    value ^= id.charCodeAt(i)
    value = Math.imul(value, 0x01000193)
  }
  return value >>> 0
}

/**
 * Where one arrival stands, relative to a mark, in the mark's own frame.
 *
 * Rows go *backwards* along the mark's facing and columns across it, which is
 * the same arrangement `./race`'s start grid uses and for the same reason: the
 * mark's `facing` is which way you are looking when you arrive, so a second row
 * has to be behind the first rather than in front of it. Arriving in front of
 * somebody would put you in the shot on a spawn nobody has left yet.
 *
 * The first slot is the mark itself, exactly. A level with one player in it
 * spawns them where the author put the mark, not a cell and a quarter off it -
 * which is the thing an author checks by standing on it.
 */
export function arrivalOffset(slot: number): { across: number; back: number } {
  if (slot === 0) return { across: 0, back: 0 }

  const column = slot % PER_ROW
  const row = Math.floor(slot / PER_ROW)

  /**
   * Columns alternate out from the middle: 0, +1, -1.
   *
   * Rather than 0, +1, +2, which would make every row drift to one side and
   * turn a nine-person grid into a wedge hanging off the right of the mark.
   */
  const across = column === 0 ? 0 : column === 1 ? 1 : -1

  return { across: across * ARRIVAL_SPACING, back: row * ARRIVAL_SPACING }
}

/**
 * Where this player arrives.
 *
 * `fallback` is `xp.spawn` and is used whenever the document places no spawn
 * mark, which is most documents. The mark's own `y` is taken as-is: a spawn is a
 * place the author put on a floor, and second-guessing its height with a ground
 * search would move it off the platform they meant.
 *
 * ---------------------------------------------------------------------------
 * The spread has to land on something, and until now it did not
 * ---------------------------------------------------------------------------
 * Reported as *"when I put a spawn on a platform I fall through the platform"*,
 * and the warning was already written twelve lines above `ARRIVAL_SPACING`: **a
 * spread that puts somebody in mid-air is a worse bug than the one it fixes**.
 * Keeping the grid tight was the mitigation and tight is not zero - a mark on a
 * two-cell platform still throws eight of the nine slots over the edge, and the
 * ninth only stays because it is the mark itself.
 *
 * It is also invisible where an author would find it. The editor previews with
 * no id, which is slot zero, which is the mark - so the level looks right in the
 * one place it is checked and drops people the moment a real session gives them
 * an id to hash.
 *
 * So `standable` is asked before a slot is used. It is optional because this
 * function is pure and most of its callers - tests, the editor, anything with no
 * world built yet - have nothing to ask with; without it the behaviour is
 * exactly what it was. With it, the slots are tried in order and **the mark
 * itself is the last resort**, because the author stood there on purpose and a
 * spawn nobody can stand on is a level problem rather than something to solve by
 * moving somebody somewhere they did not choose.
 *
 * **Which mark comes first, and then which slot within it** - see `spawnFor` for
 * the first half. A level that places several marks a player could use is a
 * level that meant them, and both halves are decided from the same id.
 */
export function arrivalSpot(
  marks: readonly Mark[],
  who: {
    id?: string
    team?: string
    /**
     * The room hands sides out one per player, so a side is a chair.
     *
     * `assign: 'order'` and nothing else. See the note on the grid below for why
     * this is the caller's answer rather than something read off the mark.
     */
    seated?: boolean
  },
  fallback: Arrival,
  /**
   * Is there something to stand on here? Absent means do not ask.
   *
   * Takes the spot rather than a cell, so the caller owns what "supported"
   * means - the runtime asks its solid grid about the cell under the feet, and
   * a test could answer from a list. Keeping the rule out here is what lets this
   * file stay pure and testable.
   */
  standable?: (spot: { x: number; y: number; z: number }) => boolean,
): Arrival {
  const mark = spawnFor(marks, who.team, who.id)
  if (!mark) return fallback

  /**
   * No id is slot zero, not a random slot.
   *
   * A level opened in the editor or played alone has one arrival and it belongs
   * on the mark. Hashing an empty string would put the only player in the room
   * a cell and a quarter away from the spot the author is looking at.
   *
   * ---------------------------------------------------------------------------
   * And neither is a seat
   * ---------------------------------------------------------------------------
   * The grid exists for one reason: several people arriving at *one* mark must
   * not stand inside each other. A **seat** is not that mark - `assign: 'order'`
   * hands the sides out one apiece, so a level with four team spawns and four
   * players has one person at each, and spreading them solves a collision that
   * cannot happen.
   *
   * `seated` is the caller's answer rather than something read off the mark, and
   * the first version got that wrong: it keyed on the mark carrying a team,
   * which is true under `assign: 'spread'` as well - where sixty players hash
   * onto two sides and thirty of them *do* share red's mark. The guard in
   * ../teams.test.ts caught it, which is what it was written for. Whether a
   * side is a seat is a fact about the *rules*, not about the mark.
   *
   * It also costs something specific, which is how this was noticed. The board
   * game puts each seat mark *on* that colour's first piece, so you arrive with
   * a piece already selected and your first turn is one press. The scatter put
   * everybody a cell or so off it - past the 0.9 a press reaches - so the first
   * thing every player did was hunt for their own pieces with a ring they had
   * not been told was a cursor yet.
   *
   * Where it is not true - a fifth player at a four-seat table, whom `sideOf`
   * wraps onto blue - two people share a chair. At a table that is two rings in
   * one place, which is visible and sorts itself out the moment either of them
   * moves; it is not the invisible pile the grid was built to prevent.
   */
  const wanted = who.id && !(who.seated && mark.team !== undefined)
    ? hash(who.id) % (PER_ROW * PER_ROW)
    : 0

  // The mark's own frame, turned by `facing`, exactly as ./marks.tsx draws it
  // and ./race crosses it: +x local is across, +z local is the way it faces.
  const radians = (mark.facing * Math.PI) / 180
  const sin = Math.sin(radians)
  const cos = Math.cos(radians)

  const spotFor = (slot: number) => {
    const { across, back } = arrivalOffset(slot)
    return {
      x: mark.x + across * cos - back * sin,
      y: mark.y,
      z: mark.z - across * sin - back * cos,
    }
  }

  /**
   * The slot this player wanted, or the first one they can actually stand on.
   *
   * Zero is checked last on purpose even though it is checked first in effect:
   * it is the mark, so it is where everybody ends up when a platform is too
   * small for a grid - which is a pile rather than a drop, and a pile sorts
   * itself out on the next frame while a drop does not.
   */
  const slot = (() => {
    if (!standable || standable(spotFor(wanted))) return wanted
    for (let step = 1; step < PER_ROW * PER_ROW; step++) {
      const candidate = (wanted + step) % (PER_ROW * PER_ROW)
      if (standable(spotFor(candidate))) return candidate
    }
    return 0
  })()

  const { across, back } = arrivalOffset(slot)

  return {
    x: mark.x + across * cos - back * sin,
    y: mark.y,
    z: mark.z - across * sin - back * cos,
    /**
     * Facing the way the mark does, not the way `xp.spawn` said.
     *
     * The whole reason a spawn has a `facing` at all: an author points it at the
     * thing they want somebody to see when they arrive. Keeping the document's
     * heading here would place people correctly and then turn them all to look
     * at a wall.
     */
    facing: mark.facing,
  }
}

/**
 * An arrival, with its feet on whatever is under them.
 *
 * ---------------------------------------------------------------------------
 * This is the half of "a spawn is a place to stand" the editor cannot do
 * ---------------------------------------------------------------------------
 * `setSpawn` and `setMark` already drop a spawn onto the ground as it is
 * written, and that fix is the right one for a level being built: the number in
 * the document becomes true at the moment somebody is looking at it. What it
 * cannot do is anything about the levels that were **already saved** - opening
 * one does not rewrite it, deliberately, so every document authored before that
 * change still names a height nobody stands at, and the body still arrives in
 * the air. Reported, twice, as exactly that.
 *
 * So the runtime drops it too, on the way past. Not instead of the edit-time
 * correction - a document whose numbers are true is still worth more, because
 * the panel and the stage show them - but underneath it, where a level that was
 * never re-saved gets the same answer.
 *
 * ---------------------------------------------------------------------------
 * The objection `arrivalSpot` raises, and why it does not apply
 * ---------------------------------------------------------------------------
 * That function's own note says a mark's `y` is taken as-is because
 * *second-guessing its height with a ground search would move it off the
 * platform the author meant*, and that is right about a **search**. This is not
 * one: `standingSurface` looks strictly *down* and returns the top of the first
 * solid it meets, so it can only ever agree with gravity. A spawn on a platform
 * finds the platform - it is the first thing under it - and comes back unchanged.
 * A spawn over a hole in a world with no ground plane finds nothing and is left
 * exactly as written, because a half-built level is not a number to overrule.
 *
 * The one visible change is the case this exists for: a spawn with floor a long
 * way beneath it now *starts* on the floor instead of falling to it. Which is
 * the same place either way, one second earlier, and without the second where
 * everybody in the room is drawn hanging over the level.
 *
 * ---------------------------------------------------------------------------
 * A whole cell of slack, because the grid has one
 * ---------------------------------------------------------------------------
 * The correction is only applied to a gap of a **full cell or more**, and that
 * is not a tuned threshold - it is the size of the disagreement the grid already
 * has with the picture. `buildSolids` rounds a placement to whole cells, so the
 * half-height floor prototype that nearly every level is built from *draws* a
 * top at 0.5 and is *solid* to 1. A mark laid on the surface somebody can see is
 * therefore half a cell inside the solid one, and `standingSurface` - which
 * looks down from the cell the feet are in - answers with the floor **below**
 * it. Correcting on any difference at all would quietly move the spawn of every
 * prototyping level built so far down by half a cell.
 *
 * Under a cell is inside the rounding and is left alone: the controller steps up
 * out of it on the first frame, which is what it has always done and what
 * `canStandIn` is written around. A cell or more is somebody standing in the
 * air, which is the thing that was reported.
 */
export function groundedSpot(
  world: Pick<XpWorld, 'ground' | 'floorY'>,
  isSolid: SolidTest,
  at: Arrival,
  /**
   * Where the cells' geometry stops, so this lands somebody where the
   * controller would. Absent is the cell top, as it was.
   */
  topOf?: SurfaceTest,
): Arrival {
  const surface = standingSurface(
    isSolid,
    at.x,
    at.y,
    at.z,
    world.ground ? world.floorY : null,
    topOf,
  )
  // Null is "nothing under this at all", which keeps the height it was given -
  // the same answer the edit layer's `grounded` gives, for the same reason.
  if (surface === null || at.y - surface < 1) return at
  return { ...at, y: surface }
}

/**
 * Whether two arrival spots are the same spot.
 *
 * ---------------------------------------------------------------------------
 * Why a comparison and not `===`
 * ---------------------------------------------------------------------------
 * Arriving is an *event* - "the level started, go and stand there" - and the
 * controller runs it from a `useEffect` whose dependency is the arrival spot.
 * `arrivalSpot` returns a fresh object from a `useMemo`, so the identity of that
 * dependency is only as stable as the memo's own inputs. When any of them
 * changes shape without changing meaning - a `me` that came back from the server
 * as an equal-but-new object, a `camera` three swapped - the effect fires again
 * and the player is put back at the spawn.
 *
 * That is what "I get reset randomly" is. Not a rule, not a fall, not a death:
 * a render, somewhere else, that happened to hand this component a new object
 * describing the same place.
 *
 * The rest of the file already learned this lesson from the other direction -
 * `sendTo` and `reviveAt` are counters *precisely* so a re-render cannot fire
 * them - and arriving was the one placement left keyed on an object. This is the
 * same fix in the shape arriving needs: the question is not "is this a different
 * object" but "is this a different place".
 *
 * Exact equality rather than a tolerance, deliberately. These are numbers copied
 * out of a document and through pure arithmetic, not accumulated by a
 * simulation, so two computations of the same spawn produce the same bits. A
 * tolerance would only add a threshold for an author to fall foul of the day
 * they place two marks very close together.
 */
export function samePlace(
  a: { x: number; y: number; z: number; facing: number },
  b: { x: number; y: number; z: number; facing: number },
): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z && a.facing === b.facing
}

/**
 * Can somebody stand at this spot, in this world?
 *
 * The predicate `arrivalSpot` takes, built where it can be tested. It was an
 * inline closure in `simulation.tsx` and it was half a question - *is there
 * floor under this slot* - which on a level with `world.ground` on answers yes
 * **everywhere**, and therefore rejected nothing at all.
 *
 * Reported as one member landing in a wall every single time while everybody
 * else was fine. That is the signature of a per-player slot rather than a broken
 * level: the row you stand in comes from hashing your id, so a mark with its
 * back row buried in a wall traps exactly the people whose hash lands there. On
 * the level it was reported on, three of the nine slots were inside the north
 * wall and nothing rejected one.
 *
 * ---------------------------------------------------------------------------
 * Two heights, because the floor is thicker than it looks
 * ---------------------------------------------------------------------------
 * The half that took a while to see. `buildSolids` rounds a placement to whole
 * cells, so the 0.5-high floor prototype every prototyping level is built from
 * fills the cell from 0 to 1: its **drawn** top is 0.5 and its **solid** top is
 * 1. A mark laid on the visible surface is therefore half a cell inside the
 * floor, and asking `blocked` at the mark's own height says "inside something"
 * for every slot on such a level, including all the good ones.
 *
 * The controller resolves that on the first frame by stepping up out of the
 * floor - which is why nobody ever noticed - so where a body actually ends up is
 * the top of the cell its feet are in. Unless a wall is there: a wall is four
 * cells tall, a step up is refused, and the body stays buried. Which is the
 * whole bug in one sentence.
 *
 * So the question is asked at both heights a body can end up at, and a slot is
 * usable if **either** is clear. Open floor passes on the second; a wall fails
 * on both, because there is nothing to step up onto.
 */
export function canStandIn(
  world: { ground: boolean; floorY: number },
  isSolid: SolidTest,
  /**
   * Where the cells' geometry stops. Absent is the cell top, as it was.
   *
   * The two-heights dance below is a *consequence* of not having had this: a
   * mark laid on a half-height floor's drawn top is inside the solid cell, so
   * the question had to be asked twice to get a usable answer. With a surface it
   * would be one question - but both heights stay, because a document may still
   * put a mark anywhere and being generous about where somebody can stand is the
   * safe direction.
   */
  topOf?: SurfaceTest,
): (spot: { x: number; y: number; z: number }) => boolean {
  return (spot) => {
    /**
     * Something underfoot: the world's ground plane, or a cell below the feet.
     *
     * The cell *below*, because a spot is where somebody stands rather than a
     * block they stand in - and `world.ground` is a rule in the controller
     * rather than cells in the grid, so a level with it on has to answer yes
     * everywhere at or above `floorY`, which the grid alone would not.
     */
    const supported =
      (world.ground && spot.y >= world.floorY) || isSolid(spot.x, spot.y - 0.5, spot.z)
    if (!supported) return false

    return (
      !blocked(spot.x, spot.y + EYE_HEIGHT, spot.z, isSolid, undefined, topOf) ||
      !blocked(spot.x, Math.floor(spot.y) + 1 + EYE_HEIGHT, spot.z, isSolid, undefined, topOf)
    )
  }
}
