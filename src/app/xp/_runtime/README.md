# The XP runtime

What plays a level, as opposed to what edits one (`../_editor/`) or what a level
*is* (`packages/xp`, the engine).

This was ninety-seven files in one directory. The folders below are named for
**what a thing is**, not for what the folder contains — so `body/` is not "files
about bodies", it is where the answer to *how is a person drawn and moved* lives.
A file belongs in exactly one of them, and if two look right the file is probably
doing two jobs.

| | |
|---|---|
| **`body/`** | A person, drawn and animated. Skinning, which clip is playing, the upper-body split so a punch happens while the legs walk, where a hand points, the glow, the face over the head. |
| **`world/`** | The level itself, drawn. Placements as one call per model, the lamps a level put in itself, signs, marks, tracers, the rainbow. |
| **`hud/`** | What the player reads and presses. The panels, the bars over a body, the ring on a cooling key, the thumb controls, and the VR panel that is the HUD for eyes that cannot see the page. |
| **`match/`** | A game in progress and its rules. Sides, the scoreboard, a race and its record, a vote, being out, being hurt. |
| **`net/`** | Anything that exists because there is more than one client. Peer buffers, the session's one send, what the level was told this frame, the room's topic. |
| **`input/`** | A device turned into the actions a level bound. Keyboard, thumb, headset, and the autopilot that drives a course to see whether it can be run. |

## What stayed at the root

The pieces that are the runtime rather than a part of it — `scene.tsx`,
`simulation.tsx`, `player.tsx` — plus the handful every folder reaches for and
none of them owns: `spawn`, `camera`, `level-data`, `standing`, `sound`,
`loading`, and the generated `clips.generated.ts`.

A file at the root should be there because it is used from three of the folders,
not because nobody decided. If one of these grows a home, move it.

## Two notes for anyone moving things

- **`scripts/xp-clips.ts` reads `body/skinned.tsx` by path** to find the clip
  names, because that script has no DOM and cannot import a component. Moving
  that file means editing that script; there is no import for the compiler to
  catch.
- **Tests reach `public/` with `import.meta.dir` and a count of `..`.** A file
  that changes depth changes that count, and the failure is an `ENOENT` at run
  time rather than anything a typecheck sees.
