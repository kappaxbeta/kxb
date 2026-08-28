/**
 * The two fighters this game ships.
 *
 * ---------------------------------------------------------------------------
 * Everything here is measured
 * ---------------------------------------------------------------------------
 * `frame`, `figure.height` and `figure.feet` come from walking the alpha channel
 * of each pack - `bun run scripts/boxing-assets.ts --measure` prints them, and
 * re-running it after a pack is updated is how they stay true. They are not
 * numbers anybody chose, and a hand-tuned one here is a fighter standing in the
 * canvas up to the shin.
 *
 * ---------------------------------------------------------------------------
 * The two packs agree about almost nothing
 * ---------------------------------------------------------------------------
 * Which is the whole reason `Character` exists rather than a constant. The
 * differences, so nobody has to diff two lists to find them:
 *
 * | | Hitman | Boxer |
 * |---|---|---|
 * | cell | 102x67 | 68x61 |
 * | figure | 42px tall, 6px of floor | 40px tall, 4px of floor |
 * | jab | two clips, four frames each | one clip, two frames |
 * | cross | five frames | three |
 * | knockdown | seven | six |
 * | extra | - | `body-hook` |
 *
 * The frame counts are load-bearing - the renderer steps through exactly that
 * many cells - so `scripts/boxing-assets.ts` checks each strip's width against
 * the number below and refuses to build if they disagree. A wrong count here is
 * a boxer who animates into the next clip's pixels, which looks like a glitch
 * and is really a lie in this file.
 *
 * ---------------------------------------------------------------------------
 * `atlas` is a filename, not a path
 * ---------------------------------------------------------------------------
 * The art lives in this package, under `assets/`, and where a *host* serves it
 * from is the host's business - `/boxing/` in this app, something else in
 * somebody's. So the character names the file and `<BoxingGame assets=...>`
 * says where the files are. A `/boxing/hitman.png` in here would be this
 * package knowing one deployment's URL layout, which is the thing the whole
 * arrangement is trying not to do.
 */

import type { Character } from './sprites'

/**
 * The blue corner. The original pack - taller cells, an eight-frame walk, and
 * two jabs so the lead hand alternates.
 */
export const HITMAN: Character = {
  id: 'hitman',
  label: 'Hitman',
  atlas: 'hitman.png',
  frame: { width: 102, height: 67 },
  figure: { height: 42, feet: 6 },
  clips: [
    { name: 'idle', file: 'idle', frames: 6, fit: { kind: 'loop', fps: 8 } },
    { name: 'walkIn', file: 'forward-walk', frames: 8, fit: { kind: 'loop', fps: 12 } },
    { name: 'walkOut', file: 'back-walk', frames: 8, fit: { kind: 'loop', fps: 11 } },
    { name: 'dashIn', file: 'forward-dash', frames: 3, fit: { kind: 'move' } },
    { name: 'dashOut', file: 'back-dash', frames: 3, fit: { kind: 'move' } },
    { name: 'jab', file: 'flicker-jab1', frames: 4, fit: { kind: 'move' } },
    { name: 'jab2', file: 'flicker-jab2', frames: 4, fit: { kind: 'move' } },
    { name: 'cross', file: 'cross', frames: 5, fit: { kind: 'move' } },
    { name: 'hook', file: 'hook', frames: 5, fit: { kind: 'move' } },
    { name: 'uppercut', file: 'uppercut', frames: 5, fit: { kind: 'move' } },
    { name: 'overhand', file: 'overhand', frames: 5, fit: { kind: 'move' } },
    { name: 'block', file: 'block', frames: 2, fit: { kind: 'loop', fps: 4 } },
    { name: 'parry', file: 'parry-1', frames: 2, fit: { kind: 'move' } },
    { name: 'parry2', file: 'parry-2', frames: 2, fit: { kind: 'move' } },
    { name: 'slip', file: 'dodge-1', frames: 4, fit: { kind: 'move' } },
    { name: 'slip2', file: 'dodge-2', frames: 4, fit: { kind: 'move' } },
    { name: 'hurt', file: 'damage-1', frames: 3, fit: { kind: 'move' } },
    { name: 'hurt2', file: 'damage-2', frames: 3, fit: { kind: 'move' } },
    { name: 'stunned', file: 'damage-3', frames: 3, fit: { kind: 'seconds', over: 0.3 } },
    { name: 'down', file: 'knockdown', frames: 7, fit: { kind: 'seconds', over: 0.75 } },
    { name: 'out', file: 'knockout', frames: 5, fit: { kind: 'seconds', over: 0.9 } },
    { name: 'won', file: 'win', frames: 4, fit: { kind: 'loop', fps: 7 } },
  ],
}

/**
 * The red corner. The second pack - smaller cells, fewer frames per punch, and
 * a body hook the other one has not got.
 *
 * The single two-frame jab is why `CLIP_FOR` lists alternates in preference
 * order rather than requiring them: `jab2` is simply absent here and `frameOf`
 * falls through to `jab` without knowing which character it is drawing.
 */
export const BOXER: Character = {
  id: 'boxer',
  label: 'Boxer',
  atlas: 'boxer.png',
  frame: { width: 68, height: 61 },
  figure: { height: 40, feet: 4 },
  clips: [
    { name: 'idle', file: 'idle', frames: 6, fit: { kind: 'loop', fps: 8 } },
    { name: 'walkIn', file: 'forward-walk', frames: 8, fit: { kind: 'loop', fps: 12 } },
    { name: 'walkOut', file: 'back-walk', frames: 8, fit: { kind: 'loop', fps: 11 } },
    { name: 'dashIn', file: 'forward-dash', frames: 3, fit: { kind: 'move' } },
    { name: 'dashOut', file: 'back-dash', frames: 3, fit: { kind: 'move' } },
    { name: 'jab', file: 'jab', frames: 2, fit: { kind: 'move' } },
    { name: 'cross', file: 'cross', frames: 3, fit: { kind: 'move' } },
    { name: 'hook', file: 'hook', frames: 4, fit: { kind: 'move' } },
    { name: 'bodyHook', file: 'body-hook', frames: 4, fit: { kind: 'move' } },
    { name: 'uppercut', file: 'uppercut', frames: 4, fit: { kind: 'move' } },
    { name: 'overhand', file: 'overhand', frames: 4, fit: { kind: 'move' } },
    { name: 'block', file: 'block', frames: 2, fit: { kind: 'loop', fps: 4 } },
    { name: 'parry', file: 'parry-1', frames: 2, fit: { kind: 'move' } },
    { name: 'parry2', file: 'parry-2', frames: 2, fit: { kind: 'move' } },
    { name: 'slip', file: 'dodge-1', frames: 4, fit: { kind: 'move' } },
    { name: 'slip2', file: 'dodge-2', frames: 4, fit: { kind: 'move' } },
    { name: 'hurt', file: 'damage-1', frames: 3, fit: { kind: 'move' } },
    { name: 'hurt2', file: 'damage-2', frames: 3, fit: { kind: 'move' } },
    { name: 'stunned', file: 'damage-3', frames: 3, fit: { kind: 'seconds', over: 0.3 } },
    { name: 'down', file: 'knockdown', frames: 6, fit: { kind: 'seconds', over: 0.75 } },
    { name: 'out', file: 'knockout', frames: 4, fit: { kind: 'seconds', over: 0.9 } },
    { name: 'won', file: 'win', frames: 4, fit: { kind: 'loop', fps: 7 } },
  ],
}

export const CHARACTERS = [BOXER, HITMAN] as const

/**
 * Who stands in which corner.
 *
 * Fixed rather than chosen, for this proof of concept. The corner you get is
 * decided by player id (see `../net/session.ts`), so a fixed mapping is what
 * makes the two fighters visibly different without a lobby to pick in - and the
 * rules do not read this at all, so swapping them changes nothing but the
 * pixels.
 */
export const characterFor = (corner: 'red' | 'blue'): Character =>
  corner === 'red' ? BOXER : HITMAN

export const characterById = (id: string): Character | undefined =>
  CHARACTERS.find((character) => character.id === id)
