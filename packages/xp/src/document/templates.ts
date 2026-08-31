/**
 * Documents to start from.
 *
 * A blank XP is a legal document and a terrible starting point: it has no
 * ground, so the first thing it does is drop you out of the bottom of your own
 * level, and nothing in it demonstrates that marks, rules or capabilities exist
 * at all. The three things a person needs to learn first are the three things an
 * empty file cannot show them.
 *
 * ---------------------------------------------------------------------------
 * Data in a file, not rows
 * ---------------------------------------------------------------------------
 * The same shape `src/domain/lounge/templates.ts` uses for worlds, and the same
 * argument: an id, a name, a blurb, and a pure function returning the thing.
 * Adding a fourth is adding an entry. Nothing here reads a database, so a
 * template cannot be half-migrated, and the test that every one of them parses
 * is the whole verification.
 *
 * ---------------------------------------------------------------------------
 * Every template is *finished*, not a stub
 * ---------------------------------------------------------------------------
 * The tempting shape is a skeleton with a TODO in it. That produces a level
 * somebody has to repair before they can walk around in it, which is the
 * opposite of a starting point - and it means the first thing a new author sees
 * is their own broken document.
 *
 * So each of these is complete: it parses, it declares capabilities the world
 * actually backs up, and you can walk into it and play the thing it says it is.
 * What makes it a template rather than a level is that it is *small* - few
 * enough pieces to read in one screen, and every one of them there to be moved.
 */

import { DEFAULT_MODEL } from '../assets/catalogue'
import type { XpDocument } from './format'
import { parseXp,
  MAIN_SCENE,
} from './format'

export interface XpTemplate {
  id: string
  /** What the picker calls it. */
  name: string
  /** One line, in the same voice the shipped documents use. */
  blurb: string
  /**
   * Which engine the project this starts is written against, when it is not
   * a world at all. Pickers badge it, so somebody choosing between "a room"
   * and "a sketch" can see which one opens a stage and which opens code.
   */
  engine?: 'p5'
  /** The document, built fresh each time so a caller cannot mutate the source. */
  build: (id: string, name: string) => XpDocument
}

/** A floor of `Primitive_Floor` tiles, centred on the origin. */
function floor(cells: number): { model: string; x: number; y: number; z: number; rotation: number; scale: number }[] {
  const tiles = []
  const half = Math.floor(cells / 2)
  for (let x = -half; x <= half; x += 4) {
    for (let z = -half; z <= half; z += 4) {
      tiles.push({ model: DEFAULT_MODEL, x, y: 0, z, rotation: 0, scale: 1 })
    }
  }
  return tiles
}

/**
 * A door, drawn the size it actually works.
 *
 * The same numbers `addDoor` writes - see `DOOR_SHAPE` in ./edit, which carries
 * the reasoning: a trigger reaches half a metre either side of where it stands
 * whatever is drawn on top of it, so a door the size of the floor tile it is
 * made from would promise four cells and fire in one. A quarter each way is
 * exactly one cell, and three tall is a post you can see across a room.
 *
 * Spelled out here rather than imported, because a template is a *file* an
 * author reads and edits - a constant from another module is a number they
 * cannot see the value of, in the one document that exists to be read.
 */
const DOOR = { x: 0.25, y: 3, z: 0.25 }

/**
 * Four walls at `edge`, with a gap where a doorway goes.
 *
 * The gap is the whole reason this exists. A door in these templates is a pad
 * you walk onto, and a pad on an open floor is invisible until you are standing
 * on it - `colour` on an entity only reaches a sign's text, so there is nothing
 * to tint. What makes a doorway readable is the thing every building uses: a
 * hole in a wall, with the pad in it. You see the gap from across the room, you
 * walk at it, and the post standing in it is where you were going anyway.
 *
 * The post matters as much as the gap: it is one cell square because that is
 * exactly how far a trigger reaches, so the gap says "through here" and the
 * post says "through *this* bit of here". A gap on its own would promise four
 * cells of doorway and fire in the middle one.
 */
function walls(
  edge: number,
  along: readonly number[],
  gap: { side: 'north'; at: number },
): { model: string; x: number; y: number; z: number; rotation: number; scale: number }[] {
  const wall = (x: number, z: number, rotation: number) => ({
    model: 'proto/Primitive_Wall',
    x,
    y: 1,
    z,
    rotation,
    scale: 1,
  })
  return [
    // The far side, which is the one the doorway is cut into.
    ...along.filter((x) => x !== gap.at).map((x) => wall(x, edge, 0)),
    ...along.map((x) => wall(x, -edge, 0)),
    ...along.flatMap((z) => [wall(edge, z, 90), wall(-edge, z, 90)]),
  ]
}

/**
 * Parse what a template built, or throw.
 *
 * A template that does not parse is a bug in this file rather than a document
 * somebody typed, so it fails loudly at the moment it is built instead of
 * handing a caller half a level. The tests below build every one of them, which
 * is what makes this a real check rather than a comment.
 */
function must(raw: unknown, template: string): XpDocument {
  const parsed = parseXp(raw)
  if (!parsed.ok) {
    throw new Error(
      `the ${template} template does not parse:\n` +
        parsed.problems.map((problem) => `  ${problem.at}: ${problem.message}`).join('\n'),
    )
  }
  return parsed.document
}

/**
 * The park template's kick, kept out of the object so the object stays readable.
 *
 * A template is a document with a script *in* it, and a seventy-line string in
 * the middle of a nested literal is a template nobody can see the shape of.
 */
const KICK_SCRIPT = `
/**
 * A ball, and what a kick does to it.
 *
 * The rule beside this one decides *when* - \`pressed key: kick, within: 2.5\`,
 * so only somebody standing next to the ball can kick it - and everything about
 * how hard is here. That split is the whole idea: a rule is a sentence about
 * the game, and how hard you hit a ball is arithmetic.
 *
 * What this does *not* do is move the ball. The blueprint has a \`body\`, so
 * gravity, the lawn and the slope already have their say, and running into it
 * rolls it with nothing written down at all. The one thing the physics cannot
 * know is how hard you meant it, which is the whole of what is left here.
 *
 * The kicker's pace is measured rather than asked for, by remembering where
 * they were last frame: a level has no reading of how fast anybody is going,
 * and one frame of positions is exactly that.
 */
const BASE = 9
const CARRY = 1.7
// Enough of a lift to be a kick rather than a shove along the ground.
const LOFT = 0.3

let wasX = null
let wasZ = null
let pace = 0

function onTick(dt) {
  const player = getEntityByName('player')
  if (player) {
    if (wasX !== null && dt > 0) {
      const moved = Math.sqrt(
        (player.x - wasX) * (player.x - wasX) + (player.z - wasZ) * (player.z - wasZ)
      )
      const speed = moved / dt
      // A jump in position is a teleport rather than a sprint, and reading it
      // as one would fire the ball out of the level.
      pace = speed > 30 ? pace : speed
    }
    wasX = player.x
    wasZ = player.z
  }

  if (self.get('kicked') > 0) {
    self.set('kicked', 0)
    if (player) {
      const dx = self.x - player.x
      const dz = self.z - player.z
      const away = Math.sqrt(dx * dx + dz * dz)
      if (away > 0.001) {
        const power = BASE + pace * CARRY
        // Adds to what it is already doing, so a ball rolling towards you that
        // you meet with a kick goes back faster than one lying still.
        self.push((dx / away) * power, power * LOFT, (dz / away) * power)
        self.material = 'rainbow'
      }
    }
  }

  // Back to its own colours once it has stopped. \`self.speed\` is the body's
  // own reading - the script keeps no velocity of its own any more.
  if (self.speed < 1) self.material = 'own'
}
`

/**
 * The p5 starter's two files, as source.
 *
 * Held here as constants rather than inline so the template entry below reads
 * like the others - and so the code is plain enough to be the first sketch
 * anybody reads. It leans on `window.xp` (see `src/app/xp/_sketch/sdk.ts`
 * for the whole surface): the avatar that syncs itself, a claimed object,
 * a bound key, the roster.
 */
const POND_HELPERS = `// Drawing, kept out of main.js so the project has a second file to find.

function drawPeep(p) {
  var a = p.avatar
  // Boosting glows - and because controls are synced per player, everybody
  // sees everybody's glow, not just their own.
  var glowing = xp.pressed('boost', p)
  noStroke()
  fill(p.you ? color(120, 220, 255, glowing ? 120 : 60) : color(255, 160, 220, glowing ? 100 : 45))
  circle(a.x, a.y, glowing ? 74 : 52)
  fill(p.you ? color(160, 235, 255) : color(255, 190, 230))
  circle(a.x, a.y, 26)
  fill(255, 255, 255, 180)
  textAlign(CENTER)
  textSize(12)
  text(p.name, a.x, a.y - 24)
}

function drawRipple(r) {
  noFill()
  stroke(255, 255, 255, 160 * (1 - r.age))
  strokeWeight(2)
  circle(r.x, r.y, 30 + r.age * 120)
  noStroke()
}

function drawBall(ball) {
  noStroke()
  fill(255, 214, 90, 70)
  circle(ball.x, ball.y, 44)
  fill(255, 214, 90)
  circle(ball.x, ball.y, 22)
}
`

const POND_MAIN = `// Arrows, WASD or the stick to swim - xp.input folds them into one
// axis. E (or the button) to boost. Bump the ball and it is yours.
var ball
var ripples = []

function setup() {
  createCanvas(windowWidth, windowHeight)
  ball = xp.object('ball', { x: 240, y: 200, dx: 0, dy: 0 })
  xp.avatar.x = 80 + random(240)
  xp.avatar.y = 80 + random(240)

  xp.on('join', function (p) { console.log(p.name + ' swam in') })

  // A press is a trigger, and it fires for every player's press - so a
  // boost anywhere in the pond ripples on every screen.
  xp.on('press', function (name, p) {
    if (name === 'boost') ripples.push({ x: p.avatar.x, y: p.avatar.y, age: 0 })
  })
}

function windowResized() { resizeCanvas(windowWidth, windowHeight) }

function draw() {
  background(6, 2, 20)
  swim()
  roll()
  drawBall(ball)
  ripples.forEach(function (r) { r.age += deltaTime / 900 })
  ripples = ripples.filter(function (r) { return r.age < 1 })
  ripples.forEach(drawRipple)
  xp.players.forEach(drawPeep)
}

function swim() {
  var pace = xp.pressed('boost') ? 7 : 3.5
  xp.avatar.x = constrain(xp.avatar.x + xp.input.x * pace, 0, width)
  xp.avatar.y = constrain(xp.avatar.y + xp.input.y * pace, 0, height)
}

function roll() {
  var span = dist(xp.avatar.x, xp.avatar.y, ball.x, ball.y)
  if (span < 36) {
    ball.claim()
    ball.dx = (ball.x - xp.avatar.x) * 0.4
    ball.dy = (ball.y - xp.avatar.y) * 0.4
  }
  if (ball.mine) {
    ball.x += ball.dx
    ball.y += ball.dy
    ball.dx *= 0.98
    ball.dy *= 0.98
    if (ball.x < 20 || ball.x > width - 20) ball.dx = -ball.dx
    if (ball.y < 20 || ball.y > height - 20) ball.dy = -ball.dy
  }
}
`

export const TEMPLATES: readonly XpTemplate[] = [
  {
    id: 'room',
    name: 'A room',
    blurb: 'Ground, four walls and somewhere to stand. The smallest thing you can walk around in.',
    build: (id, name) =>
      must(
        {
          format: 'xp/1',
          id,
          name,
          blurb: 'A room to build in.',
          packs: [{ id: 'proto' }],
          capabilities: ['freeplay'],
          spawn: { x: 0, y: 1, z: 0, facing: 0 },
          world: {
            floorY: 0,
            // On, so a half-built level is standable while the walls move
            // around. The first thing anybody does is delete a piece.
            ground: true,
            placements: [
              ...floor(16),
              ...[-10, 10].flatMap((z) =>
                [-8, -4, 0, 4, 8].map((x) => ({
                  model: 'proto/Primitive_Wall',
                  x,
                  y: 1,
                  z,
                  rotation: 0,
                  scale: 1,
                })),
              ),
              ...[-10, 10].flatMap((x) =>
                [-8, -4, 0, 4, 8].map((z) => ({
                  model: 'proto/Primitive_Wall',
                  x,
                  y: 1,
                  z,
                  rotation: 90,
                  scale: 1,
                })),
              ),
            ],
            marks: [],
          },
        },
        'room',
      ),
  },
  /**
   * The second lesson, and the only one that needs a second *place*.
   *
   * A document holds more than one room (docs/xp/scenes.md §1.1) and until this
   * there was nowhere to meet that: every template was one world, so an author
   * would have had to read the format to find out rooms existed at all. This is
   * the smallest thing that shows it - two places, and a way through in both
   * directions, because a room you cannot leave is a room nobody builds a
   * second one of.
   *
   * **The doors are exactly what the editor's own button writes.** `addDoor`
   * makes a blueprint per door, named after the room it goes to, on
   * `Primitive_Floor` with `collider: none` and an `enter` rule that loads the
   * scene - so an author who opens this and an author who presses `+ door` in
   * the Places list are looking at the same thing, and the one they made by
   * hand teaches them to read the one they pressed a button for.
   *
   * `collider: none` is the part that is easy to get wrong and impossible to
   * see: a tile that fills its cell is a doorway you bump into, so the `enter`
   * never fires. It is here so the first door anybody meets is a working one.
   *
   * `main` is a scene name here, in the way back, and that is the whole reason
   * `load` can spell it - a level whose front room no door could reach is the
   * hole `two-rooms.xp.json` shipped with.
   */
  {
    id: 'two-rooms',
    name: 'Two rooms',
    blurb: 'A lobby, a cellar, and a doorway each way. The smallest level that is more than one place.',
    build: (id, name) =>
      must(
        {
          format: 'xp/1',
          id,
          name,
          blurb: 'Two places and the way between them.',
          packs: [{ id: 'proto' }],
          capabilities: ['freeplay'],
          blueprints: {
            // What `addDoor` writes, by hand. See the note above.
            'to-cellar': {
              model: DEFAULT_MODEL,
              collider: 'none',
              triggers: [{ on: 'enter', do: [{ op: 'load', scene: 'cellar' }] }],
            },
            'to-main': {
              model: DEFAULT_MODEL,
              collider: 'none',
              triggers: [{ on: 'enter', do: [{ op: 'load', scene: 'main' }] }],
            },
          },
          // Back from the doorway, facing it: the gap in the far wall is the
          // first thing you see, and walking at it is the first thing that
          // teaches this level has a second room in it.
          spawn: { x: 0, y: 1, z: -4, facing: 0 },
          world: {
            floorY: 0,
            ground: true,
            placements: [...floor(16), ...walls(10, [-8, -4, 0, 4, 8], { side: 'north', at: 0 })],
            marks: [],
          },
          entities: [
            { blueprint: 'to-cellar', name: 'the-way-down', x: 0, y: 0, z: 8, stretch: DOOR },
          ],
          scenes: {
            cellar: {
              name: 'The cellar',
              // Smaller than the lobby, so arriving somewhere else feels like
              // somewhere else rather than like the same room redrawn.
              world: {
                floorY: 0,
                ground: true,
                placements: [...floor(8), ...walls(6, [-4, 0, 4], { side: 'north', at: 0 })],
                marks: [],
              },
              // Facing into the room, with the way back behind you - which is
              // where a door you just came through is.
              spawn: { x: 0, y: 1, z: 0, facing: 0 },
              entities: [
                { blueprint: 'to-main', name: 'the-way-up', x: 0, y: 0, z: -4, stretch: DOOR },
              ],
            },
          },
        },
        'two-rooms',
      ),
  },
  {
    id: 'race',
    name: 'A race',
    blurb: 'A start, a finish and the ground between them. Declares competition, so it can be timed.',
    build: (id, name) =>
      must(
        {
          format: 'xp/1',
          id,
          name,
          blurb: 'A course to time.',
          packs: [{ id: 'proto' }],
          // Both, and the capability is not decoration: `competition` is checked
          // against the marks at parse time, so this document proves the two
          // marks below are really there.
          capabilities: ['freeplay', 'competition'],
          rules: { preset: 'parkour' },
          spawn: { x: -12, y: 1, z: 0, facing: 90 },
          world: {
            floorY: 0,
            ground: true,
            placements: floor(32),
            marks: [
              { kind: 'start', x: -12, y: 1, z: 0, facing: 90, width: 6, height: 4 },
              { kind: 'finish', x: 12, y: 1, z: 0, facing: 90, width: 6, height: 4 },
            ],
          },
        },
        'race',
      ),
  },
  {
    id: 'match',
    name: 'A match',
    blurb: 'Two sides, two spawns, and a floor to fight over. Declares match, so a lobby can schedule it.',
    build: (id, name) =>
      must(
        {
          format: 'xp/1',
          id,
          name,
          blurb: 'A ground for two sides.',
          packs: [{ id: 'proto' }],
          capabilities: ['freeplay', 'match'],
          rules: { preset: 'deathmatch', scoreLimit: 10 },
          spawn: { x: -10, y: 1, z: 0, facing: 90 },
          world: {
            floorY: 0,
            ground: true,
            placements: floor(28),
            // Two spawns with *different teams*, which is what `match` checks
            // and what `teamsOf` reads to decide whether sides can be handed
            // out at all. One shared spawn is not a match, it is a scrum.
            marks: [
              { kind: 'spawn', x: -10, y: 1, z: 0, facing: 90, team: 'red' },
              { kind: 'spawn', x: 10, y: 1, z: 0, facing: 270, team: 'blue' },
            ],
          },
        },
        'match',
      ),
  },
  {
    id: 'capture',
    name: 'Capture the flag',
    blurb:
      'Two bases, two flags, two sides. Walk up to a flag and press to take it; carrying it costs you your gun, being hit drops it and roots you to the spot, and a second key puts it down when you would rather not be carrying it.',
    /**
     * The mode that was not writable until a condition could ask about
     * somebody else.
     *
     * Every piece of this is vocabulary that already existed - `carry` for the
     * pickup, `setProp` for what you are carrying, `score` for the point - and
     * the one thing missing was the base's question: *is the thing that just
     * walked into me carrying our flag?* That is `when.of: 'other'`, and this
     * template is the case it was added for.
     *
     * ---------------------------------------------------------------------------
     * Carrying is a property, not a new idea
     * ---------------------------------------------------------------------------
     * Taking a flag writes `flag` onto whoever took it, and the base reads it.
     * That is deliberate: the engine has no notion of "holding the red flag",
     * and inventing one would have been a second way to say a fact the format
     * can already say. It also means an author can change what counts - two
     * flags, a heavier one, a flag that only some people can carry - by editing
     * numbers rather than by asking for an engine change.
     *
     * ---------------------------------------------------------------------------
     * And carrying costs something, which is what makes it a game
     * ---------------------------------------------------------------------------
     * Taking the flag also takes your gun - `disarm` - and being hit gives it
     * back, drops the flag, and roots you for a second. Without the first, a
     * runner shoots whoever comes to stop them and the run is a straight line;
     * without the second, being stopped costs the runner a moment and the
     * chaser nothing, so trading a hit is always worth it.
     *
     * A gun is in this template *because* of the disarm. It was written without
     * one, which quietly meant the `damaged` rule below could never fire: there
     * was nothing in the level that could hurt anybody.
     *
     * ---------------------------------------------------------------------------
     * What this does not do yet, said here rather than discovered
     * ---------------------------------------------------------------------------
     * The flag stays in your hand after you score, and there is no way for it
     * to walk itself home: a rule can address the entity it is on and whoever
     * set it off, and the flag's journey back is a third thing. So it is a
     * *round* rather than a match: take theirs, run it home, score. That is the
     * part that works end to end, and it is the part worth having before the
     * rest.
     */
    build: (id, name) =>
      must(
        {
          format: 'xp/1',
          id,
          name,
          blurb: 'Take theirs, get it home.',
          packs: [
            { id: 'proto' },
            { id: 'dummy' },
            { id: 'platformer-neutral' },
            { id: 'platformer-red' },
            { id: 'platformer-blue' },
          ],
          capabilities: ['freeplay', 'match'],
          // A limit rather than a preset: none of the five presets is capture,
          // and `freestyle` with a number on it is how the format says "the
          // level decides what scores, and this is when it ends".
          rules: { preset: 'freestyle', scoreLimit: 3 },
          /**
           * The player is the body above, because a rule fires on a blueprint
           * and the built-in dummy has none to hang one from.
           *
           * And it binds one key, which is the flag's whole pickup. The name is
           * the *level's* - the trigger listens for "take the flag" and not for
           * `KeyE` - so somebody rebinding it, or a headset with no E on it,
           * changes the binding and not the rule.
           */
          player: {
            blueprint: 'body',
            /**
             * Two keys, and the second one is what makes carrying a decision you
             * can change your mind about.
             *
             * Being hit was the only way to let go of a flag, so a run was a
             * thing you were committed to until somebody stopped you - no
             * handing it off at a chokepoint, no freeing your hands, no giving
             * up. Reported from the shipped level, and the starter had it too.
             *
             * **A second key rather than the same one twice**, which is not a
             * preference. Rules fire against a world the rules before them have
             * already changed, so one key bound to both take and put-down does
             * whichever the engine reaches first and then undoes it inside the
             * same press. Saying "and only if your hands are empty" needs a
             * second condition, and a trigger has one `when`.
             */
            keys: [
              { key: 'KeyE', does: 'take the flag' },
              { key: 'KeyQ', does: 'drop the flag' },
            ],
            // The gun the mode is about taking away. On a socket, like the
            // shooter's, because that is the only way one is held - `disarm`
            // turns this entity off and `arm` turns it back on, and neither
            // knows anything about this document.
            weapon: { blueprint: 'bat', socket: 'hand' },
            // A bat is not aimed, so the host's own "armed opens in first
            // person" guess is wrong here - it would hide the swing landing,
            // which is the one thing worth seeing in a chase. See `view`'s
            // note in ./format.
            view: 'third',
          },
          spawn: { x: -12, y: 1, z: 0, facing: 90 },
          blueprints: {
            /**
             * The body, and the rule that makes this a game.
             *
             * Being hit lets go of whatever you were carrying, which is the
             * difference between capture the flag and a footrace: without it
             * nobody can stop a run, and the fastest player wins every round
             * unopposed.
             *
             * `unhand` rather than `drop`, and the distinction is the reason
             * that verb exists: a rule addresses the entity it is on and
             * whoever set it off, and the flag in somebody's hand is neither.
             * `drop` names the carried thing; this names the carrier.
             *
             * The flag lands where you fell — the composed transform, not the
             * origin — so it is there to be picked up again by either side,
             * which is the whole shape of a contested flag.
             *
             * The gun comes back in the same breath, and the second on the
             * floor is the rest of the cost: dropping the flag is only half a
             * punishment if you can turn round and pick it straight back up
             * before whoever hit you has crossed the ground between you.
             *
             * Four hits rather than one, which is what makes any of that
             * visible: a body that died to a single shot would never be stunned
             * and never drop anything - it would respawn, and the flag would go
             * home with it in a way nobody could read.
             */
            body: {
              model: 'dummy/Dummy',
              props: { hp: 100 },
              sockets: { hand: { x: 0.32, y: 1.15, z: 0.34 } },
              triggers: [
                {
                  on: 'damaged',
                  do: [
                    { op: 'unhand', target: 'self' },
                    // And the mark goes with it: carrying is a property, so
                    // dropping the flag has to clear the property or a base
                    // would still score for somebody empty-handed.
                    { op: 'setProp', target: 'self', key: 'flag', value: 0 },
                    // Armed unconditionally rather than only when something was
                    // dropped: a rule cannot ask what it just let go of, and
                    // arming somebody who never lost their gun is nothing.
                    { op: 'arm', target: 'self' },
                    { op: 'stun', target: 'self', seconds: 1 },
                  ],
                },
                /**
                 * And the same three things on purpose, which is the whole of
                 * the second key.
                 *
                 * Deliberately the rule above minus the stun: putting the flag
                 * down is the cost paid willingly, so it costs the flag and the
                 * mark and hands the gun back, and roots nobody. The mark has to
                 * go with it for the reason the hit's does - a base reads the
                 * property, and somebody who put the flag down and still counted
                 * as carrying it would score from an empty hand.
                 */
                {
                  on: 'pressed',
                  key: 'drop the flag',
                  do: [
                    { op: 'unhand', target: 'self' },
                    { op: 'setProp', target: 'self', key: 'flag', value: 0 },
                    { op: 'arm', target: 'self' },
                    { op: 'sound', sound: 'drop' },
                  ],
                },
              ],
            },
            /**
             * A bat, and the range is the whole design.
             *
             * ---------------------------------------------------------------
             * Why a bat rather than the pistol this used to carry
             * ---------------------------------------------------------------
             * Capture the flag is a game about *catching somebody*, and a
             * sixty-cell pistol is a game about seeing them. With a gun the
             * runner is stopped from across the field by whoever noticed first,
             * which makes the interesting part - the chase - the part that never
             * happens. Two cells means you have to get there.
             *
             * It also sharpens the rule this template exists to show. "Taking
             * the flag costs you your weapon" is a real cost when the weapon is
             * how you stop the person who took it from you; it is a footnote
             * when you could have shot them from the halfway line anyway.
             *
             * **No new mechanism.** A weapon is a blueprint with `damage` and
             * `range`, and `castRay` already takes both off it and already hits
             * people through the arbiter - so a melee weapon is a ranged one
             * with the range of an arm. That is worth saying because the
             * alternative, a `swing` verb beside `shoot`, would have been a
             * second path to the same arbitrated hit.
             *
             * **The damage is unchanged at twenty-five**, and that is
             * deliberate rather than an oversight. Four hits is the number the
             * template was balanced on and the reason it is written down: a body
             * that died to one swing would never be *seen* to be stunned, and
             * the stun is the mechanic - hitting somebody drops the flag they
             * are carrying and roots them for a second. Stopping the run is the
             * play; killing them is a footnote. Raising it to two swings would
             * have made the thing this template demonstrates harder to watch.
             */
            bat: {
              model: 'proto/Bat',
              collider: 'none',
              tags: ['weapon'],
              props: { damage: 25, range: 2 },
            },
            /**
             * The flag: walk into it and it comes with you.
             *
             * One blueprint per side rather than one shared blueprint, so a
             * runner can tell at a glance which flag they are looking at - the
             * whole point of colouring a capture point. The triggers are the
             * same rule twice because the model is the only thing that differs;
             * splitting the *shape* of the rule out would be a second idea for
             * no document that will ever use it independently.
             *
             * `carry target: 'self'` hangs *this* off whoever walked in, and the
             * `setProp` beside it is what the base will read. Both in one rule,
             * because picking it up and being marked as carrying it are the same
             * moment - two rules could fire apart and leave somebody holding a
             * flag that no base recognises.
             */
            'flag-red': {
              model: 'platformer-red/flag_A_red',
              collider: 'none',
              triggers: [
                {
                  on: 'pressed',
                  key: 'take the flag',
                  /**
                   * Two cells, and the reach is what makes this a pickup.
                   *
                   * A `pressed` rule with no reach is offered to every live
                   * entity, so one press would take whichever of the two flags
                   * the iteration reached first - from anywhere on the field,
                   * including from your own base. Two cells is about an arm and
                   * a step, and it is why the flag no longer needs to be walked
                   * into to be had.
                   */
                  within: 2,
                  do: [
                    { op: 'carry', target: 'self' },
                    { op: 'setProp', target: 'other', key: 'flag', value: 1 },
                    /**
                     * And the gun goes, which is the whole cost of carrying.
                     *
                     * `other`, because the presser is who is now holding it -
                     * the same noun the `setProp` beside it uses. In the same
                     * rule for the same reason those two are: taking the flag
                     * and being unable to shoot are one moment, and two rules
                     * could fire apart and leave somebody running with both.
                     */
                    { op: 'disarm', target: 'other' },
                  ],
                },
              ],
            },
            'flag-blue': {
              model: 'platformer-blue/flag_A_blue',
              collider: 'none',
              triggers: [
                {
                  on: 'pressed',
                  key: 'take the flag',
                  within: 2,
                  do: [
                    { op: 'carry', target: 'self' },
                    { op: 'setProp', target: 'other', key: 'flag', value: 1 },
                    { op: 'disarm', target: 'other' },
                  ],
                },
              ],
            },
            /**
             * The base: the question this whole mode was waiting on.
             *
             * `flag` is set back to zero in the same rule, so standing on your
             * own base does not score once a frame - which is what a rule that
             * only scored would do, and it would look like the mode working
             * until somebody stood still.
             */
            base: {
              model: 'proto/Primitive_Floor',
              collider: 'none',
              triggers: [
                {
                  on: 'enter',
                  when: { of: 'other', prop: 'flag', is: '>=', value: 1 },
                  do: [
                    { op: 'score', amount: 1 },
                    { op: 'setProp', target: 'other', key: 'flag', value: 0 },
                    // And you get your gun back for having got it home. Without
                    // this the only way out of a disarm is being shot, so
                    // scoring would be the move that ended your round.
                    { op: 'arm', target: 'other' },
                  ],
                },
              ],
            },
          },
          entities: [
            { blueprint: 'base', name: 'red-base', x: -12, y: 0.1, z: 0 },
            { blueprint: 'base', name: 'blue-base', x: 12, y: 0.1, z: 0 },
            // Each flag stands at the *other* side's base, which is what makes
            // it a run rather than a stroll.
            { blueprint: 'flag-red', name: 'red-flag', x: -12, y: 0, z: 4 },
            { blueprint: 'flag-blue', name: 'blue-flag', x: 12, y: 0, z: 4 },
          ],
          world: {
            floorY: 0,
            ground: true,
            placements: [
              ...floor(32),
              // Something to break the sightline, so crossing is a decision
              // rather than a straight line.
              ...[-4, 0, 4].map((z) => ({
                model: 'proto/Primitive_Wall',
                x: 0,
                y: 1,
                z: z * 2,
                rotation: 90,
                scale: 1,
              })),
            ],
            marks: [
              { kind: 'spawn', x: -12, y: 1, z: 0, facing: 90, team: 'red' },
              { kind: 'spawn', x: 12, y: 1, z: 0, facing: 270, team: 'blue' },
            ],
          },
        },
        'capture',
      ),
  },
  /**
   * A shot, already cut, so the movie editor opens with something in it.
   *
   * ---------------------------------------------------------------------------
   * Why a template and not a fixture
   * ---------------------------------------------------------------------------
   * Every other way of getting a movie in front of somebody starts with an
   * empty stage and twenty minutes of pressing buttons - which is fine for
   * making one and useless for finding out whether the thing works. This is
   * eight seconds that uses **every kind of action there is**: a walk, a turn,
   * a jump, a clip, and two lines of dialogue, across two cameras with a cut
   * between them. Opening it exercises more of the runtime than any test can,
   * because the part that breaks is the part a test cannot see.
   *
   * It is also a joke, and that is not decoration. A demo where a body slides
   * two metres and stops tells you the code runs; a demo with a punchline tells
   * you whether the *timing* runs, because a beat that lands late is a beat
   * that is not funny and you notice immediately.
   *
   * ---------------------------------------------------------------------------
   * The gag
   * ---------------------------------------------------------------------------
   * The dummy runs up to a crate and vaults it, badly. The fox - who has
   * plainly seen this before - turns to camera while he is still airborne,
   * which is the whole joke: the cut happens on *her* reaction, not on his
   * landing. He gets up insisting he meant it.
   */
  {
    id: 'a-shot',
    name: 'A shot',
    blurb: 'Eight seconds, two cameras and a crate. Somebody vaults it badly.',
    build: (id, name) =>
      must(
        {
          format: 'xp/1',
          id,
          name,
          blurb: 'A movie, already cut.',
          packs: [{ id: 'proto' }, { id: 'dummy' }, { id: 'peepz' }],
          capabilities: ['freeplay'],
          spawn: { x: 0, y: 1, z: 6, facing: 180 },
          blueprints: {
            dummy: { model: 'dummy/Dummy' },
            fox: { model: 'peepz/fox' },
            crate: {
              model: 'proto/Box_A',
              // The film starts because the level does. `spawned` fires once
              // when the world is built - see `stepSpawned`, which is what
              // finally made this trigger usable.
              triggers: [{ on: 'spawned', do: [{ op: 'movie', sequence: 'the-vault' }] }],
            },
          },
          entities: [
            /*
              `y: 1`, which is where the ground actually is.

              A `Primitive_Floor` tile is a cell thick and nothing in the
              catalogue is *centred*, so a model's origin is its base: a tile at
              `y: 0` fills 0 to 1 and its top surface is at 1. Bodies at zero
              stand inside it up to the knee, which is the report "the floor is
              overlapping the people" - and it is why the room template puts its
              walls and its spawn at 1 too.
            */
            { blueprint: 'dummy', name: 'chad', x: -6, y: 1, z: 0, rotation: 90, scale: 1 },
            { blueprint: 'fox', name: 'vera', x: 3, y: 1, z: 1, rotation: 200, scale: 1 },
            // On the floor, like everything else, and big enough to see: a
            // small grey box on a bright floor at this distance is a crate you
            // have to be told is there.
            { blueprint: 'crate', name: 'crate', x: 0, y: 1, z: 0, rotation: 0, scale: 1.4 },
          ],
          world: {
            floorY: 0,
            ground: true,
            placements: floor(16),
            marks: [],
          },
          timeline: {
            duration: 8,
            fps: 30,
            backdrop: { kind: 'colour', colour: '#141026' },
            cameras: [
              {
                name: 'wide',
                ease: true,
                keys: [
                  { t: 0, position: [7, 4.2, 9], target: [-2, 2.2, 0], fov: 42 },
                  { t: 8, position: [9, 4.2, 8], target: [1, 2.2, 0], fov: 42 },
                ],
              },
              {
                // Close, low and on *her*, because the joke is the reaction.
                name: 'vera',
                ease: false,
                keys: [{ t: 0, position: [4.4, 2.5, 4.2], target: [3, 2.1, 1], fov: 34 }],
              },
            ],
            cuts: [
              { t: 0, camera: 'wide' },
              { t: 2.4, camera: 'vera' },
              { t: 4.4, camera: 'wide' },
            ],
            actions: [
              /*
                The beats, and the order they have to be in.

                He arrives at a run - and nothing says so: the stance comes from
                how fast the `move` carries him, which is what `measured` on the
                movie stage is for. Cueing a run by hand would work and would
                hide whether that does.

                The vault is a `jump` and a `move` **over the same seconds**, on
                different axes: one lifts him, the other carries him across the
                crate. `actedAt` folds actions in order and each writes its own
                fields, so the two compose into an arc rather than fighting.

                The first version had him stop short, hop on the spot, and only
                then slide past - so the fall landed a metre after the thing he
                was supposed to have tripped over. It read as clumsy animation
                rather than a joke, which is the report: "the timing with
                slipping is after we walk by the stone".
              */
              { kind: 'move', t: 0, duration: 2, entity: 'chad', x: -1.6, z: 0 },
              { kind: 'jump', t: 2, duration: 1, entity: 'chad', height: 1.6 },
              { kind: 'move', t: 2, duration: 1, entity: 'chad', x: 1.4, z: 0.2 },

              // She turns away while he is still in the air - see the note on
              // the template: the cut lands on her reaction, not his landing.
              { kind: 'turn', t: 2.4, duration: 0.6, entity: 'vera', rotation: 250 },

              // And the landing, which is not a landing. It starts a tenth
              // before he is down, so he is already flailing when he arrives.
              { kind: 'play', t: 2.9, duration: 1.6, entity: 'chad', clip: 'Death_A', loop: false },
              { kind: 'say', t: 3, duration: 2, entity: 'vera', text: 'He does this every time.' },

              { kind: 'say', t: 5, duration: 2.4, entity: 'chad', text: 'I meant to do that.' },
              { kind: 'play', t: 5, duration: 3, entity: 'chad', clip: 'Idle_B', loop: true },
            ],
            tracks: {},
          },
          /*
            The film, as something a *level* can play.

            The `movie` verb names a sequence rather than a shot - a shot is
            where the cameras are, a sequence is what gets watched - so a demo
            without one would be a demo of half the feature. One take, the whole
            eight seconds.
          */
          sequences: {
            'the-vault': { name: 'The vault', takes: [{ scene: MAIN_SCENE, from: 0, to: 8 }] },
          },
        },
        'a-shot',
      ),
  },
  {
    id: 'peepz',
    name: 'A park',
    blurb:
      'You are an animal, with a dash and a kick. A ball, a ramp and somewhere to run about.',
    build: (id, name) =>
      must(
        {
          format: 'xp/1',
          id,
          name,
          blurb: 'A park to build in. E kicks, F dashes.',
          packs: [{ id: 'peepz' }, { id: 'platformer-neutral' }, { id: 'platformer-green' }],
          capabilities: ['freeplay'],
          spawn: { x: 0, y: 1, z: 6, facing: 0 },
          /**
           * The scripts are this template's own rather than the shipped park's.
           *
           * They are the same idea and deliberately not the same file: a
           * template is somewhere to *start*, so the kick here is the whole of
           * the kick and nothing else, where `public/xp/xps/peepz.xp.json` has
           * a park's worth of orchards and critters around it. Sharing them
           * would mean a beginner's first level arriving with four scripts in
           * it, three of which are about things it does not have.
           */
          scripts: { kick: KICK_SCRIPT },
          player: {
            blueprint: 'peep',
            keys: [
              { key: 'KeyE', does: 'kick' },
              { key: 'KeyF', does: 'dash' },
            ],
          },
          blueprints: {
            peep: {
              // A fox: the second skeleton an XP can be, and the one whose
              // clips are called `idle` and `walk`. See `+ peep` in the editor.
              model: 'peepz/fox',
              // No box, because the player is stopped by the character
              // controller's capsule and a body with a collider collides with
              // itself - which reads as being unable to move at all.
              collider: 'none',
              tags: ['player'],
              props: { hp: 100 },
              triggers: [
                { on: 'pressed', key: 'dash', do: [{ op: 'dash', target: 'self', cells: 5 }] },
              ],
            },
            ball: {
              model: 'platformer-neutral/ball',
              collider: 'none',
              /**
               * A body, which is what makes it a ball rather than a picture of
               * one: gravity, the slope and anybody's shoulder now decide where
               * it goes. Walking into it rolls it with no rule and no script -
               * the kick below is only about hitting it *hard*.
               */
              body: { bounce: 0.45, friction: 1.4, roll: 200 },
              props: { kicked: 0 },
              script: 'kick',
              triggers: [
                {
                  // Arm's length, which is what makes it a kick rather than a
                  // button that moves a ball across the level.
                  on: 'pressed',
                  key: 'kick',
                  within: 2.5,
                  do: [{ op: 'setProp', target: 'self', key: 'kicked', value: 1 }],
                },
              ],
            },
          },
          entities: [{ blueprint: 'ball', name: 'ball', x: 0, y: 2, z: 0 }],
          world: {
            floorY: 0,
            // On, so a half-built park is standable while the pieces move
            // around. The first thing anybody does is delete something.
            ground: true,
            placements: [
              // The lawn: nine six-by-six tiles, one cell tall, so the spawn
              // stands on something rather than on the plane underneath.
              ...[-6, 0, 6].flatMap((x) =>
                [-6, 0, 6].map((z) => ({
                  model: 'platformer-green/platform_6x6x1_green',
                  x,
                  y: 0,
                  z,
                  rotation: 0,
                  scale: 1,
                })),
              ),
              { model: 'platformer-green/platform_slope_4x4x4_green', x: 0, y: 1, z: -11, rotation: 0, scale: 1 },
              { model: 'platformer-green/spring_pad_green', x: 6, y: 1, z: 4, rotation: 0, scale: 1 },
              { model: 'platformer-neutral/pillar_1x1x2', x: -5, y: 1, z: 0, rotation: 0, scale: 1 },
              { model: 'platformer-neutral/pillar_1x1x2', x: 5, y: 1, z: 0, rotation: 0, scale: 1 },
            ],
            marks: [{ kind: 'spawn', x: 0, y: 1, z: 6, facing: 0 }],
          },
        },
        'peepz',
      ),
  },
  /**
   * The first sketch, and the only template that is not a world.
   *
   * The same bar as every other entry: *finished*, not a stub. It swims, it
   * boosts, the ball changes hands when you bump it, and a second player who
   * opens the same room appears and moves - so the first thing a sketch
   * author reads demonstrates the avatar, a shared object, a bound key and
   * the roster, which are exactly the four things `window.xp` exists for.
   *
   * Two files on purpose: a project view with one file in it does not teach
   * anybody that there can be two.
   */
  {
    id: 'p5',
    name: 'A p5.js sketch',
    blurb: 'Code that draws its own game. Everybody is a glowing dot; bump the ball to take it.',
    engine: 'p5',
    build: (id, name) =>
      must(
        {
          format: 'xp/1',
          id,
          name,
          blurb: 'A pond of glowing dots, drawn in p5.js.',
          /*
            Both, so a new sketch is reachable from both doors on the day it
            is made: the shelf's *keep it as a room* reads `freeplay` and the
            battle wizard reads `match`. A sketch has no world for the parser
            to check these against, so they are the author's to take off in
            the project view - which is the right direction for a starter,
            since a capability nobody knew to add is a button that never
            appears and never explains itself.
          */
          capabilities: ['freeplay', 'match'],
          player: { keys: [{ key: 'KeyE', does: 'boost' }] },
          sketch: {
            engine: 'p5',
            entry: 'main.js',
            stick: true,
            files: {
              'pond.js': POND_HELPERS,
              'main.js': POND_MAIN,
            },
          },
        },
        'p5',
      ),
  },
]

/** One template by id, or null. */
export function templateById(id: string): XpTemplate | null {
  return TEMPLATES.find((template) => template.id === id) ?? null
}
