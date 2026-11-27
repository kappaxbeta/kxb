# Large files, and what to do about them

**This is a proposal, partly built.** Steps 1 and 2 are done; step 3 is under
way — `ErrorNote` (`0280571`), the editor's panel trim (`11b870c`), the shared
desk controller (`3824ada`), the walk and turn into the rig (`337ad05`), and
four cuts into `Running`: `collectSaying` (`3d3b0c0`), the phase decision
(`3aa9ec8`), the cooling gate (`b2405e8`) and the downed machine (`9e806ed`). The rest is argued for here and not yet built. Where this
document and the code disagree, the code wins.

Every number below was measured on `develop` at `0280571`, with the commands
shown. Re-run them rather than trusting the figure — that is the point of
printing the command.

## The shape of the problem

```bash
find src packages -type f \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.*' ! -name '*.generated.ts' ! -name 'database.types.ts' -exec wc -l {} + | awk '$1>800 && $2!="total"{c++; s+=$1} END{print c" files, "s" lines"}'
```

**67 files hold 102,425 of the 296,773 hand-written lines.** A third of the
codebase is in 5% of its files.

That on its own is not a fault. `database.types.ts` is 4,614 lines and nobody
should touch it; `i18n/xp-editor.ts` is 2,593 lines of dictionary and is exactly
as readable at 2,593 as it would be split across nine files. Length is a symptom,
and the question is always *of what*.

Here it is of one specific thing, and it is worth naming precisely, because the
obvious fix is the wrong one.

## The actual fault: functions, not files

```bash
# the longest single top-level functions, hand-written only
```

| lines | function | file |
|---:|---|---|
| 5,076 | `Running` | `src/app/xp/_runtime/simulation.tsx:274` |
| 2,807 | `LoungeScene` | `src/app/world/lounge/lounge-scene.tsx:214` |
| 2,121 | `XpScene` | `src/app/xp/_runtime/scene.tsx:124` |
| 1,515 | `BattleRoom` | `src/app/t/[slug]/battle/[battleId]/battle-room.tsx:65` |
| 1,419 | `Editor` | `src/app/xp/_editor/editor.tsx:310` |
| 1,377 | `Animator` | `src/app/xp/_editor/animator/animator.tsx:264` |
| 1,344 | `Together` | `src/app/xp/_runtime/net/together.tsx:107` |
| 1,321 | `SummonWizard` | `src/app/t/[slug]/battle/summon-wizard.tsx:299` |
| 1,212 | `Multiplayer` | `src/app/world/lounge/_canvas/multiplayer.tsx:479` |
| 1,086 | `XpMatchRoom` | `src/app/t/[slug]/battle/[battleId]/xp-match-room.tsx:103` |
| 1,071 | `Player` | `src/app/xp/_runtime/player.tsx:394` |

Compare this with the files that are merely *long*. `inspector.tsx` is 2,019
lines and holds **22 top-level components**, none over 200 lines: `MarkForm`,
`PlacementForm`, `Collider`, `Shape`, `Grip`, `SavePoint`, `Sign`. It is a long
file and a perfectly readable one. Splitting it would produce 22 files, 22 import
blocks, and not one clearer line.

`simulation.tsx` is 5,348 lines and holds **one function of 5,076**, containing
about 120 `useState`/`useRef` declarations and a single `useFrame` callback 1,745
lines long (`3049`–`4794`), followed by 550 lines of JSX.

**Those two files are the same size and have nothing in common.** Any rule that
treats them alike — a file-length lint cap, a "split files over N lines" sweep —
gets the second one wrong by making it nine files that still cannot be read, and
gets the first one wrong by breaking up something that works.

So: *this proposal does not move files.* It has nothing to do with directory
structure, which is already deliberate and already enforced —
`eslint.config.mjs` keeps the browser out of `src/domain`, keeps the app out of
`packages/xp`, and keeps the XP host from borrowing the lounge's components.
That boundary work is done and is not what is wrong.

## What is wrong, in one sentence

The god functions hold a dozen unrelated concerns in one scope, so nothing in
them can be read, tested, or changed in isolation.

`Running` is the clearest case. Reading down its declarations, the concerns are
already visibly separate and already well-named — they simply share one function
body:

- **roster and seating** — `roster`, `seat`, `seats`, `seated`, `reseat`, `seatNow`
- **scoring** — `scores`, `lives`, `standings`, `tally`, `tallied`, `kills`
- **health and damage** — `health`, `whole`, `bars`, `damaged`, `drawnDamage`, `hurt`, `seenHp`, `wasHp`
- **the round** — `round`, `over`, `phase`, `phaseName`, `phaseLeft`, `phaseAge`, `winner`
- **speech** — `said`, `saidId`, `heard`, `shown`, `fromPeers`, `signal`
- **the ball** — `owned`, `following`, and `runBall` next door in `multiplayer.tsx`
- **combat** — `shots`, `recoil`, `swing`, `aim`, `aimed`, `dashUntil`, `shovers`

Each of those is a `use…` hook waiting to be lifted out — `useRoster`,
`useScoring`, `useVitals`, `useRound`, `useSpeech`. The names exist already. The
grouping exists already, in the order the declarations happen to sit in. What
does not exist is a boundary, and without one there is no way to answer "what
touches `health`?" except to read 5,000 lines.

The 1,745-line `useFrame` is the same story per-frame instead of per-render, and
it matters more there: **that body is the only place two of the hardest bugs in
this repo could have been caught by reading.** Both are in memory —
`two-clocks-in-the-xp-runtime` (milliseconds and seconds, both typed `number`,
mixed in one scope so it compiles and only breaks in multiplayer) and
`triggers-fire-against-a-mutating-world` (a pick-up/put-down pair on one key
undoing itself in a single press). Neither is visible in a scope this size.
Both would be obvious in a 60-line `stepTriggers(world, t)` with its own test.

## A correction: two thirds of `simulation.tsx` is prose

Found while looking for a fifth cut, and it changes the sums above rather than
adding to them.

```bash
# code / comment / blank, ignoring tests and generated files
```

| | code | comment | % comment |
|---|---:|---:|---:|
| `simulation.tsx` | 1,925 | 3,110 | **62%** |
| — its `useFrame` | 624 | 957 | 61% |
| — its effect dispatcher | 171 | 261 | 60% |
| `xp/_runtime/scene.tsx` | 960 | 1,199 | 56% |
| `lounge-scene.tsx` | 1,608 | 1,218 | 43% |
| `_editor/panels/inspector.tsx` | 1,422 | 432 | 23% |
| `packages/xp/src/document/flow.ts` | 114 | 282 | 71% |

**`Running` is not a 4,961-line function. It is a 1,774-line function carrying
3,187 lines of documentation**, and the 433-line effect dispatcher that looked
like the last big target is 171 lines of code — its `load` branch is *two* lines
under fifteen of prose explaining why the swap does not happen there.

That prose is not the problem. `flow.ts` is 71% comment and is one of the
clearest files in the repo; the house rule in [docs/README.md](../README.md) —
explain *why*, for the person who will disagree — is being followed, and the
comments are the asset. Measuring them as bulk was the error, and it was this
document's error: the opening section argued that length is a symptom and the
question is always *of what*, then ranked everything by length anyway.

### The ranking, by code

| code | raw | % cmt | function |
|---:|---:|---:|---|
| 1,774 | 4,961 | 65% | `Running` |
| 1,441 | 2,807 | 49% | `LoungeScene` |
| **1,019** | 1,321 | 23% | **`SummonWizard`** |
| **967** | 1,377 | 30% | **`Animator`** (xp editor) |
| 955 | 1,515 | 37% | `BattleRoom` |
| 852 | 2,121 | 60% | `XpScene` |
| 846 | 1,419 | 41% | `Editor` |

Three things move. `XpScene` falls from third to sixth and is mostly explanation.
`SummonWizard` and the editor's `Animator` rise, because they are dense — under a
quarter comment in `SummonWizard`'s case, which for this codebase is thin.

**And they are ordinary React.** A four-step form wizard and a keyframe editor
are the two most refactorable things on the list: no entity world, no frame
loop, no arbiter, and both are reachable in a browser. `Running` is still the
largest and still worth cutting, but it is the *hardest* place to work and it
is no longer obviously the first.

`SummonWizard` was taken first on that reasoning (`259633a`): its navigation —
which steps exist, where you are, whether Next is live, how far you have been —
is now `battle/summon-steps.ts` with 16 tests.

**And it was verified by driving it**, which is why it was worth going first. A
throwaway probe page mounted the wizard outside a locale provider — which
`i18n/locale-context` explicitly supports for this — and the real DOM agreed
with every test: five steps with the fork and four without, `Step 1 of 4` with
`kind` gone, Continue dead on an empty name *and* on one that is only spaces,
and every step still clickable after walking to the end and stepping back two.

Everything before it in this document was confirmed by typecheck and unit tests
alone, because `_runtime/` and the scenes cannot be driven in the pane. That is
a real difference in confidence, and it is an argument for spending the next
effort here rather than on the harder half.

## The order to do it in

Cheapest and safest first. Each step lands on its own and is worth having
alone — none of this is a big-bang rewrite, and stopping after any step leaves
the codebase better than it started.

### 1. Duplicated chrome — done for the error strip, open for the rest

The same class strings written out by hand across many files. Objectively
measurable, zero behaviour, no risk.

```bash
# repeated long className strings, outside vendored shadcn
grep -rhoE 'className="[^"{}]{45,}"' src --include='*.tsx' | sort | uniq -c | sort -rn | head -20
```

- **The error strip — done.** `rounded-lg bg-red-500/15 px-3 py-2 text-sm
  text-red-300`, hand-written in 24 files. Two of them had no `role="alert"`.
  That is the argument for extracting it: a refusal a screen reader never
  announces is not a decision anybody made twenty-four times, it is a line
  missed once and then copied, and grep could not find it because the several
  red-*bordered buttons* in the codebase read identically to a search. Now
  `src/app/components/error-note.tsx`; −139 lines, +55.
- **The editor's panel chrome — done** (`11b870c`). 58 section labels across 13 files
  (`font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500`, in six
  spacing variants), and 68 uses of the field-input class in 35 variants that
  share one core and differ only in width and padding. This wants a `FIELD`
  constant composed with `cn()` and a `PanelLabel`, in
  `src/app/xp/_editor/` — **not** in `src/app/components/`, because
  `eslint.config.mjs` deliberately forbids XP from importing the app's shared
  components, and that rule is right. Built as `chrome.tsx`: `PanelLabel` and
  `Hint` are components (one thing repeated, spacing as a prop), while the field
  style is the bare `FIELD` constant composed with `cn()` — because 35 variants
  is not 35 copies of a mistake, and a component taking all of that as props is
  the class list with worse names. The test applied throughout was not *is it
  repeated* but **would changing this in one place be right for every caller**.
  108 call sites; −144 lines.

### 2. The near-clone scenes — done

```bash
# identical blocks of 8+ lines between the two
```

`cafe-scene.tsx` and `home-scene.tsx` shared **347 byte-identical lines**. The
input controller was 99 of them and is now `app/world/_hooks/desk-controls.ts`
(`3824ada`) — pointer lock, the `L` toggle, the `0.002` mouse sensitivity, the
pitch clamp, nine listeners bound and unbound in the same order.

Three differences were real and became parameters: `'build'`/`'decorate'`,
`onInteract`/`onAct`, `onRemove`/`onSell`. **The rest were comments the second
copy had lost** — the house's `auxclick` note drops the half explaining why it
matters, its touch note drops what touch does instead. Nothing was broken by
that, which is the point: the argument for the code existed in one of the two
places that needed it, and nothing could reveal that but reading both together.

Two things worth carrying forward:

- `editing` is mirrored into a ref rather than taken as a dependency. Both
  callers already did this with a `modeRef` and it is load-bearing — a mode in
  the dependency array rebinds all nine listeners on every switch, and rebinding
  `pointerlockchange` mid-session loses a lock you already had.
- The refs are **passed in, not returned**. That was `react-hooks/immutability`'s
  call: the frame loop turns the camera with the arrow keys, so it writes `euler`
  too, and the rule refuses to let a caller modify a ref handed back from a
  custom hook. It is right — two writers and one owner is what it exists to catch.

The walk followed (`337ad05`): the forty lines inside each `useFrame` that fold
the arrow keys and the touch drag into the camera, then sum keyboard and
thumbstick, clamp them and scale a diagonal back to walking pace. Both are now
`walkAxes` and `turnCamera` in `app/world/_sim/rig.ts` — which is where they belong,
since that file's header already makes exactly this claim about the geometry.
`WALK_PACE`, `SPRINT_PACE` and the café's private `clampAxis` were third and
fourth copies of things already in there.

**That move is what step 3 looks like when it works**, and it is filed here
rather than under step 3 only because these two happened to be duplicated as
well. `rig.ts` had been the shared ground between two places since the house
arrived and had *no tests*, because the only way to exercise it was to load a
place and walk around. It now has 23, and the ones worth having are the ones
nobody sets up by hand: that every diagonal corner is the same speed as walking
straight (the √2 bug, fixed once in each copy and pinned in neither), that the
scaling is *scaled and not normalised* so a gentle thumbstick stays gentle, and
that a touch drag is spent exactly once rather than re-applied every frame.

**Remaining: 201 shared lines**, now diffuse — shared imports, prop shapes and
JSX across 23 blocks, none larger than 20 lines. That is what two sibling scenes
importing the same modules looks like, and is not worth chasing. The one real
item left is the café's private copy of `placeCamera`, `probeTile` and their
constants, which duplicates the rig's.

Neither scene is verifiable in the Browser pane — both are auth-gated and the
pane has no `rAF`. What the controller change did get: typecheck, zero lint
errors, the full suite, and a throwaway top-level route that made the running
dev server compile both client graphs.

### 3. The god functions

The main event, and the reason for the order: by this point the pattern is
established and the cheap wins are banked.

Do them **one concern at a time**, extracting to a `use…` hook in a sibling file,
running `bun run typecheck:fast` (~12s) and `bun test src packages` (5,805 tests,
~35s) between each. Not one big split.

**Done once, and the plan was wrong about where.** This section first said to
start with `Running`'s *speech* state (`said`, `saidId`, `heard`, `shown`,
`fromPeers`, `signal`) on the grounds that it is self-contained. It is not:
`said` is overloaded — it is both the dice-roll state at `simulation.tsx:1079`
and the general word — `shown` and `heard` are ticker bookkeeping, and the parts
that matter are consumed deep inside the frame callback where a `use…` hook
cannot reach them.

What worked instead was to ignore the *state* grouping and look for a **decision**
inside the frame: `collectSaying` in `_runtime/net/saying.ts` (`3d3b0c0`), 65 lines
gathering what the level was told from its four sources and splitting it into
what is heard locally versus what goes on the wire. Four inputs, two lists out,
no world touched — so it left as a pure function with 17 tests, and the wire
split (a script's emit must not be broadcast, or every listener fires twice) is
now checkable in a millisecond instead of with two browsers.

**The lesson for the remaining passes:** group by *what a piece decides*, not by
which `useState` calls sit near each other. The state grouping is what the file
looks like; the decisions are what it does.

Then the 1,745-line `useFrame`, in the order the frame already runs: read input →
step bodies → fire triggers → resolve contacts → publish. Each becomes a plain
function taking the world and the delta and returning what changed. **These are
pure and therefore testable**, which is the real prize — `src/app/xp/_runtime/`
already has 32 test files beside it doing exactly this for the parts that were
already extracted (`motion.ts`, `spawn.ts`, `camera.ts`, `teams.ts`).

#### Where three cuts have got to, and what that says

| | |
|---|---|
| `collectSaying` | 65 lines out, 17 tests, in `app/xp/_runtime/` |
| `phaseCountdown` + `stepFrom` | 50 lines out, 16 tests, in `packages/xp/src/document/flow.ts` |
| `throughCooling` | 10 lines out, 9 tests, in `packages/xp/src/world/cooldowns.ts` |
| `stepDowned` | 90 lines out, 17 tests, in `packages/xp/src/world/downed.ts` |
| **`simulation.tsx`** | **5,348 → 5,235** (`Running` itself 5,076 → 4,961) |

**Read the two columns against each other before drawing the obvious
conclusion.** A hundred and thirteen lines is 2% of the file, and at that rate
`Running` is a very long way from being a normal function. But 59 tests now
cover rules that previously had none — the wire split that stops a script's emit firing
twice, the tie-break when two flow steps are both true, a press being dropped
whole rather than half-firing, a stun that must die with the body. Those were
not untested because anyone decided they did not need it. They were untested
because the only way to reach them was two browsers and an authored level.

**The failure mode they share is worth naming: all of them are playable when
wrong.** A stun that outlives a corpse does not throw - you stand up at the
spawn and cannot walk. A flow step taken out of order does not throw - the level
goes somewhere plausible. Nothing in this class shows up in a stack trace, which
is why "we would have noticed" is not an argument here.

Three of the four also **landed in `packages/xp`, not in the host** — the flow
decision belongs beside `FlowStep`, the cooling gate beside the arithmetic it
reads. That is the more interesting result. A good part of what makes `Running`
enormous is not that it does too much for one component, it is that **engine
rules have been accumulating in the host's frame callback** because that is
where the world and the clock happened to be in scope. Each of those has a
correct home that already exists and already has tests.

**So the rate is not the measure, and neither is the line count.** The question
for each candidate is whether it is a decision with a home, and the ones that
are keep turning out to belong in the engine. Four for four so far, and the
files they land in — `flow.ts`, `cooldowns.ts` — already had tests waiting.

If a faster route is wanted, the honest alternative is different in kind rather
than degree: thread the frame's ~120 refs into an explicit context object and
split the 1,706-line `useFrame` into named steps against it. That is one large
mechanical change rather than twenty small ones, it would move thousands of
lines rather than tens, and it is the highest-risk thing in this document —
`src/app/xp/_runtime/` cannot be verified in the browser pane, and the failure
mode of getting a ref wrong is a game that runs and is subtly incorrect. Worth
doing behind the tests the small cuts are accumulating, not before them.

### 4. A guardrail — done

`max-lines-per-function`, **warn**, **800**, comments and blank lines free
(`3d51509`).

Not `max-lines`. The file version is the one this document opened by arguing
against, and `skipComments` is the correction above turned into a setting: a
rule that counted the 62% of `simulation.tsx` which is prose would be an
argument against the house style, and the cheapest way to silence it would be
deleting the paragraph that says why. **A rule that pays people to delete their
reasoning is worse than no rule.**

Six functions are over it, and every one is already named here:

| | | |
|---|---|---|
| `Running` 1687 | `LoungeScene` 1307 | `SummonWizard` 934 |
| `Animator` 872 | `Editor` 839 | `BattleRoom` 836 |

**Six is a to-do list, which is the whole point.** The lesson `eslint.config.mjs`
paid for three times is that a check reporting nine hundred things nobody can
act on is one everybody learns to ignore. `warn` rather than `error` for the
same reason — these six are known and the work is under way. `eslint` still
exits 0, and neither `deploy.sh` nor CI passes `--max-warnings`.

**It ratchets.** Three of the six are within a hundred lines of the limit
because they have just been worked on. As they come down, lower the number. The
point is not to punish the six; it is that the *seventh* gets caught at 801
rather than at five thousand, by which time nobody can tell what it was meant to
do.

## Where this stops, and why

Four of the six the lint rule named are now under it:

| | was | now | |
|---|---:|---:|---|
| `Running` | 1687 | 1687 | |
| `LoungeScene` | 1307 | 1059 | |
| `SummonWizard` | 934 | **774** | cleared |
| `Animator` | 872 | **789** | cleared |
| `Editor` | 839 | **770** | cleared |
| `BattleRoom` | 836 | **738** | cleared |

The two that are left are not more of the same work, and it is worth writing
down why rather than leaving somebody to find out.

### `LoungeScene`: the Canvas block is not a component

What remains of its bulk is 257 lines wrapping the `<Canvas>` — the drop target
and every child that draws. It is the obvious extraction and it is the wrong
one. Counted:

    11 pieces of state · 3 refs · 17 callbacks · 23 props and derivations

**Fifty-four values feed that block.** A component taking fifty-four props is
worse than the lines it replaces: it moves the coupling behind an interface
without reducing it, and adds a second place to look. Fifty-four is not a
refactor waiting to happen, it is the file saying *this is the middle of one
thing*, and the honest reading is that the scene is a scene.

Three cuts did come out of it cleanly — the block edits into `_scene/`, the
touch layer into `_hud/`, the pictures into `_hooks/` — and each was a subject
of its own with its own rules. That is the shape that works here. What is left
after them is wiring, and wiring is the thing that does not move.

### `Running`: the frame callback needs a different technique

Its remaining 1,687 are the effect dispatcher and the input pass, both effectful
orchestration against the entity world rather than decisions with a home. Four
decisions did come out (see above) and the seam is exhausted; what is left needs
the context-object split costed earlier in this document, which is one large
mechanical change rather than twenty small ones.

There are now 42 tests underneath it that did not exist when that was written,
which is the precondition it was waiting on.

### So the rule keeps two names on it

That is the intended behaviour, not a failure. `max-lines-per-function` is a
tripwire for the *seventh* enormous function, and two known names on a warning
list are two names somebody can explain. Lowering the threshold below 1,059
before either of those is dealt with would only add noise to a list that is
currently readable.

## Two things checked at the end

**The whole thing builds.** Thirty-nine commits, two hundred and twenty files
moved between directories, and nothing had ever been through the production
compiler — `bun run dev` is Turbopack and resolves differently enough that a
move which is fine there can fail a build. It does not:

```bash
NEXT_DIST_DIR=.next-verify bun run build     # exit 0, 53 routes
```

`NEXT_DIST_DIR` is the reason that is safe to run beside a dev server:
`next.config.ts` reads it, so the build never touches the `.next` the open tab
is being served from. Delete the directory afterwards — it is ~930 MB.

Worth knowing what that check does *not* cover: `next.config.ts` sets
`typescript: { ignoreBuildErrors: true }`, so a green build says the module
graph resolves and every route bundles, not that the types are sound. That is
`bun run typecheck:fast`, separately, which CI also runs.

**`.next/dev/cache` is 41 GB.** Not caused by any of this and not safe to touch
while a dev server is running, but worth knowing about on a disk that is 79%
full. The safe order is: stop the dev server, `rm -rf .next`, start it again —
the first page load afterwards is slow and everything after it is not.

## What this proposal is not

- **Not a directory restructure.** The `domain` / `app` / `packages` split is
  sound and lint-enforced. Moving files would be churn with no payoff.
- **Not a component-test stack.** There are 5,805 tests and **zero** `.test.tsx`
  — every test here is pure logic, and no `happy-dom` or Testing Library is
  installed. Extracting rendering into components adds no tests. Extracting
  *logic* into pure functions does, using the runner that is already here. That
  is a reason to prefer step 3's hooks and frame-steps over step 1's chrome.
- **Not a rewrite of `packages/xp`.** `parseXp` is 1,123 lines and is a parser;
  parsers are long. It has tests.
