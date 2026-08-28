# The pose animator, and how a clip gets from it into a level

A level can carry its own animations. This is the whole route from posing a body
by hand to a clip a document plays, written down because every step of it has a
way of failing *silently* — a wrong rig, a missing track, a name nothing asks
for. None of those throw. They all end with a body standing perfectly still.

## 1. What the animator is

`src/app/xp/_editor/animator/` — drag a body's hands and feet, and it solves the
rest of the limb (`ik.ts`). What you save is a list of **keys**, and a key is a
*whole pose*: every bone that is posed at that moment, with an easing to the
next one. Not a curve per bone. That is the shape a person edits in.

The rig matters more than anything else here. The two skeletons share **no bone
names at all**:

| Rig | Bones |
|---|---|
| `dummy` | `chest`, `upperarml`, `lowerlegr`, … (23) |
| `peepz` | `root`, `body`, `tail`, `leg-back-left`, `leg-back-right`, `leg-front-left`, `leg-front-right` (7) |

So a dummy clip played on a peep is not wrong, it is **empty**: every track binds
to a name the animal does not have. `AnimationDoc.rig` is written into the file
for exactly this reason, and the editor switches the body to match on open rather
than dropping the file onto whatever was on screen.

## 2. What it saves — the `animate.json` question

Two different things, for two different jobs:

- **`<name>.animation.json`** (`download.ts`) — the *library*, in the animator's
  own keyed form. This is what you re-open to keep editing. It is not what a
  level plays.
- **`.glb`** — for anything outside this product that wants the clip.

Neither is what lands in a document. That is the third form, below.

## 3. Baked, not keyed — what a document carries

`bake(doc, rest)` turns the keys into an `XpClip`: **one dense sample a frame,
with the easing already applied**. See the header of `@kxb/xp/clips` for the
argument, which is worth reading once — a keyed clip means every reader has to
agree about what `smooth` means, and the moment two disagree the same level looks
different on two machines. A straight line between two numbers is a thing
everybody agrees about.

```jsonc
"clips": {
  "kick-swing": {
    "rig": "peepz",          // checkable against the body that names it
    "duration": 0.3333,      // always the last time
    "loop": false,
    "times": [0, 0.0417, …], // ascending, starts at zero
    "bones": {               // bone name -> flat x,y,z,w per sample
      "leg-front-right": [0, 0, 0, 1, -0.19081, 0, 0, 0.98163, …]
    },
    "root": [0, 0, 0, 0, 0, 0.18, …]  // three numbers a sample, optional
  }
}
```

### The two rules that are easy to get wrong

**Every track must be exactly as long as `times` says.** `bones` is four numbers
a sample, `root` is three. A track one sample short binds fine and then plays the
whole animation a frame out against every other bone, which reads as a body
coming apart rather than as a file being wrong. `clipIsSquare` is the check.

**At least one bone track.** A clip that only moves the root is **refused** — by
`parseXp` (`bones: 1 to 64 tracks`) and by `setClips`. This is worth knowing
before you try it, because "move the root forward and back" is the obvious first
animation to attempt and it will not save. Give it a leg as well; a lunge with no
leg in it reads as the whole animal sliding anyway.

Bones that never move should be **absent**, not filled with identical
quaternions. On a clip that only waves that is twenty of twenty-three tracks
gone, and a body with nothing bound for its legs leaves them where the rest pose
put them — which is where they were.

## 4. A worked example, which ships

`public/xp/xps/kickabout.xp.json` carries `kick-swing`: nine samples at 24fps, a
third of a second. The root goes forward 0.3 of a cell and comes back — out in
two frames, held for one, five to settle — and `leg-front-right` swings to −46°
and back with it. It parses, it is square, and `xps.test.ts` says so on every
run, which is what makes it an example rather than a snippet.

## 5. Playing one

Three things name a clip, and all three will happily name one that does not
exist:

- `blueprint.pose` — what a body rests in.
- the `animate` verb — `{"op": "animate", "clip": "kick-swing", "target": "self"}`
  from a rule.
- an `AnimationGraph` state.

A clip **in the document** is the one case that can be checked, which is why the
editor's pickers offer document clips alongside the pack's.

### The player's body is the exception

A document clip plays on **entities**. The player's own body is animated from how
it *moves* — the stance machine in `src/app/xp/_runtime/body/motion.ts` — plus the
gestures the host fires, and it does not read `clip` at all. So
`{"op": "animate"}` aimed at the player draws nothing.

Two ways round it, and they are different tools:

1. **Override a name the stance machine already asks for.** Document clips are
   merged *over* the pack's, so a level that ships its own `gesture-positive`
   gets its own — and on a peep that is what `attack` plays. This is how you
   change what a swing looks like.
2. **Put the animation on an entity** and let the player carry or stand by it.

What you cannot do is invent a new stance. `idle`, `walk`, `run`, `air`, `land`,
`dead`, `dance`, `shoot`, `hit` and `attack` are the vocabulary, and which clip
each maps to per rig is `poseFor`.

## 6. Where each piece lives

| File | What it owns |
|---|---|
| `src/app/xp/_editor/animator/animator.tsx` | the panel |
| `src/app/xp/_editor/animator/ik.ts` | solving a limb from a dragged hand |
| `src/app/xp/_editor/animator/clip.ts` | `AnimationDoc`, and `bake` |
| `src/app/xp/_editor/animator/download.ts` | `<name>.animation.json` and the glb |
| `packages/xp/src/document/clips.ts` | `XpClip`, `clipIsSquare` — what a document carries |
| `packages/xp/src/document/edit.ts` | `setClips` — writing the block |
| `src/app/xp/_runtime/body/motion.ts` | which clip a stance plays, per rig |
| `src/app/xp/_runtime/body/skinned.tsx` | binding tracks to a body |
