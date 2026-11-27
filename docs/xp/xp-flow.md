# `flow` — a round a document can describe

**Proposal, now mostly built.** Changes `format.ts`, which
[two-sessions.md](two-sessions.md) calls shared ground, and wants an editor
panel that draws it.

§2 (the block), §3 (roles), §4 (winning) and §6 (the editor) are built — see
[manual.md §6.1c](manual.md) for what the format actually does. §5's `run` scope
and `rounds` are not, and each is still an argument of its own. The sections below are kept as they were written,
because the reasoning is the point; where one differs from what shipped, it says
so under a **Built** note.

---

## 1. The problem, stated from what exists

A match already has phases. They are just not in one place, not named the same
thing, and not writable by a document:

| what | where it lives | who can change it |
|---|---|---|
| playing / over | `match.ts`, from `scoreLimit` and `timeLimit` | nobody — it is derived |
| waiting / running / finished | `race.ts`, from `start` and `finish` marks | nobody |
| a vote is open | the arbiter, opened by the `meet` verb | a rule can *open* one, and nothing else |
| you are out | the arbiter, when `lives` runs out | nobody |
| you are spectating | `spectating.tsx`, implied by being out | nobody |
| whose turn | the arbiter, `turn_start` / `pass` | a rule can `pass` |

Six phase machines, each hard-coded for one mode, and a document that wants a
seventh has to encode it in triggers. The board game did exactly that, and
[round.md](round.md) is what it cost: the turn is three ordered presses that
work because a verb's write lands before the next condition reads it. It is
correct, it is tested, and **nobody could have guessed it from the document**.

So the question is not "can a level have phases" — it has six kinds already.
It is: *can a level say what its own phases are, instead of being one of five
presets.*

**Scope.** `preset` stays for now, and the two this proposal has to serve are
`freestyle` and all-vs-all. A `flow` block is what a level writes *instead of*
leaning on a preset's hard-coded machine, not a new field beside five of them.

**And a flow is a *run*, not a space** — see [§5](#5-a-flow-is-a-run-not-a-space),
which is the constraint the rest of this file has to keep. A level with no flow
is a place people are in, and `steal-a-plant` is the one that proves it has to
stay possible.

---

## 2. The block

```jsonc
{
  "flow": {
    "rounds": 3,                       // absent = one, and "round" is the match
    "start": "deal",                   // the phase a round opens in
    "phases": {
      "deal": {
        "does": [                      // on entering. ordinary verbs
          { "op": "teleport", "target": "everybody", "to": "spawn" },
          { "op": "emit", "event": "find the ball" }
        ],
        "allow": [],                   // no bindings: nobody acts yet
        "next": [{ "on": "dealt", "go": "play" }]
      },
      "play": {
        "allow": ["use", "attack"],    // which of player.keys are live
        "next": [
          { "when": { "of": "world", "prop": "caught", "is": ">=", "value": 1 },
            "go": "round-over" },
          { "after": 120, "go": "round-over" }   // only if this game has a clock
        ]
      },
      "round-over": {
        "does": [{ "op": "score", "amount": 1 }],
        "next": [{ "go": "@next-round" }]   // or "@end"
      }
    },
    "wins": { "of": "world", "prop": "rounds-won", "is": ">=", "value": 2 }
  }
}
```

Five ideas, and each is a thing that exists somewhere already:

- **`does`** is a verb list — the same `Verb[]` a trigger's `do` is. A phase
  entering is an event like any other, so it fires the vocabulary the level
  already speaks.
- **`next`** is a destination and a reason to go there. Three forms, and they
  are not equals — see [below](#a-round-based-flow-has-no-clock). First match
  wins, evaluated in order, exactly as triggers are.

  | | means | new vocabulary |
  |---|---|---|
  | `when` | a `Condition`, on world data | none |
  | `on` | an event a rule emitted | none — `emitted` is already a trigger event, matched on `clock.event` |
  | `after` | seconds | a clock, which is the whole problem |
- **`allow`** names bindings from `player.keys`. Absent means all of them.
  Empty means none — which is how a phase says *watch, do not touch*.
- **`wins`** is a `Condition` on the level's own data. Not a new expression
  language: `addProp target: 'world'` already writes it and `of: 'world'`
  already reads it.
- **`rounds`** makes the whole thing repeat, which is the shape `match.ts` has
  never had — it plays one match and stops.

### What a phase is *not*

It is not a scene. [scenes.md](scenes.md) proposes one document holding several
*places*; a phase is one place in several *states*. A level that changes room
between rounds is both, and they compose: a phase's `does` can `load` a scene.

### A round-based flow has no clock

**This is the correction that shaped the section above.** The first draft had
`after` as an equal partner to `when`, and it is not: a turn-based game has
nothing to time. A round of the board game ends when somebody has moved a piece,
not after twelve seconds, and putting a timer in the block for it would be a
field every table-shaped level sets to a number it then has to defend.

So `on` is the transition a round-based flow actually uses, and it needs no new
vocabulary at all: `emitted` is already a trigger event, `emit` is already a
verb, and `fire` already matches one against the other on `clock.event`. A rule
that finishes a turn says so, and the flow hears it — which is the same shape as
the *ärgern* hearing a collision, rather than a second mechanism beside it.

What follows from that is worth more than the field:

- **`after` is the only thing in `flow` that needs a clock everybody agrees on.**
  Not `flow` itself. A document whose transitions are all `when` and `on` is
  sequenced by writes to the level's data, which the arbiter already orders — so
  it needs no shared timer and, importantly, **no arbiter at all** when it is
  played alone. Open question 1 shrinks to "the games that use `after`".
- **A dead phase is now visible statically.** A phase whose only `next` is an
  `on` for an event no rule in the document emits can never be left, and the
  editor can say so without running anything - the same check that already
  catches a rule matching a tag nothing carries.

---

## 3. Roles, and how others see you — **built**

> **Built** as `rules.perRole`, a *second* block beside the deck rather than a
> richer `roles`, and the deck is why: `roles` is a list because **the list is
> what is dealt** — three of four players being `crew` is three entries, in the
> order they are dealt from — and a map cannot say that. So the counts stay in
> the deck and the meanings sit next to it, keyed by value.
>
> `allow` needed nothing from the network. A client knows its own secret and
> nobody else's, and *what may I press* is the one question answerable from that
> alone — so it is `allowedFor` in `flow.ts`, a filter of a filter, and the
> intersection order is guaranteed by construction rather than by care.
>
> **`seen` needed the arbiter, and the shape of that is the one decision worth
> reading twice.** Deciding whether to draw somebody needs *that person's* role,
> so no client can be trusted with it and none is given it. Instead `deal`
> carries a second map — value to look — and the only party that has ever seen
> the whole deal publishes the **look**, per player, in `xp_arbiter_view`
> (`20261125000000_who_may_be_drawn.sql`). The map goes in keyed by role and
> comes out keyed by player, inside the function, so the row never holds "hidden
> means invisible" next to "who is hidden".
>
> The cost, stated rather than hidden: the room learns that a particular player
> is not drawn. It could hardly not — there is no body to look at. What it never
> learns is which value they hold.
>
> Sending the map with the deck places no new trust anywhere: `deal` is
> first-ask-wins and refused twice, so a client that lied about the looks would
> have had to lie about the deck in the same call, which was always true.

`rules.roles` is a deck the arbiter deals — one opaque value per player, and the
view hands back yours and nobody else's. That is already the hard half.
The missing half is that a role cannot *mean* anything except through
`rules.lethal`, which is one hard-coded question ("do this role's shots count").

Generalised, a role names a set of overrides that apply while it is dealt:

```jsonc
"roles": {
  "hunter": { "allow": ["attack"], "seen": "normal" },
  "hidden": { "allow": ["use"],    "seen": "nobody" }
}
```

`seen` is the "how do others view them" half, and the three values are the ones
the runtime can already draw, because it draws all three today:

| `seen` | drawn as | where that already exists |
|---|---|---|
| `normal` | body, name, team ring | the default |
| `team` | only to your own side | nothing draws this yet — it is the one new case |
| `nobody` | not drawn at all | `disarm` already removes a held thing from the draw list |

**A role's `allow` intersects the phase's, never widens it.** A phase saying
"nobody acts" must not be overridable by a role, or `allow` stops being
readable: you would have to hold two tables in your head to know whether a
button does anything.

---

## 4. Winning, and the script that decides what winning is — **built, and the script turned out not to be needed**

> **`flow.wins` is built** and is exactly what this section proposes: a
> `Condition` on the level's own data, evaluated where a step's `when` is,
> latched so it fires once. It says *that* the run is won and not *who* — the
> condition mentions nobody, and inventing a winner from it would be a result the
> document did not state.
>
> **The `@world.` indirection is built, and it went into a different slot.**
> This section puts it on `prop` and is right to be suspicious of that: naming
> *which property to read* turns a name into an expression, and the thing on the
> other side of it is an entity id sitting in a data field, which nothing in this
> format can write. It is on **`value`** instead, where it means the plainest
> available thing — compare against a number the level is keeping rather than one
> the document typed. `prop` stays a name, `of` stays a subject, and the only
> thing that gained a second form is the number.
>
> **Which is why `onPhase` was not needed.** The whole point of the hook was to
> get a randomly chosen target into the level's data at the start of a round, and
> `roll` already does that: it writes a number into a declared field and asks the
> arbiter for it, so every client agrees. The catch game is a phase whose `does`
> rolls, a `held` rule comparing the thing's own number against `@world.wanted`,
> and a `wins` on what that rule emitted — no script, no `withTag`, no entity ids
> in data, and nothing new in the scripting sandbox.
>
> `of: 'holder'` is therefore also not built, and is not missing: "somebody is
> holding it" is a `held` rule on the thing, which is where the format already
> puts that question.
>
> **And `wins` had to be told about §5 before it could ship safely.** The
> obvious ending - `blue-home >= 4` - counts a field kept in the *space*, so the
> second game is won on its opening frame. `winsProblems` refuses it and names
> the `run` scope, which is the two halves of this file meeting: §4 gave a run an
> ending and §5 is the only place an ending can honestly count.



`wins` above is declarative and covers most of it — first to a score, most
rounds, last standing.

It does not cover the case that motivated this section: **a catch game where the
thing to catch is picked at random when the round starts, and the first to pick
it up wins.** The winning *condition* is fixed (somebody is holding the thing);
what is not known until runtime is *which thing*.

That is a script writing the level's own data, which scripts can already do —
what is missing is a script being able to write it *at the moment a phase
starts*, and a `wins` that can name a thing rather than a number.

```js
// onPhase('deal') — the hook this proposal adds
export function onPhase(name, api) {
  if (name !== 'deal') return
  const props = api.withTag('catchable')
  api.setProp('wanted', props[api.random(props.length)].id, 'world')
  api.emit('find it')
}
```

and

```jsonc
"wins": { "of": "holder", "prop": "@world.wanted" }
```

**The `@world.` indirection is the one genuinely new idea in this file**, and it
is worth being suspicious of: it turns a condition's `prop` from a name into an
expression, which is the first step onto a slope that ends in a language. The
narrow version — a `prop` may be a literal name *or* `@world.<field>`, one level,
no nesting — buys the random-target game and nothing else, which is the right
size for a first cut.

`random` is already there: `randomAt` / `seedFrom` are exported from the engine
precisely so a host can fill in a `TriggerClock.random`, and the scripting
sandbox is handed one. A script picking a target is using machinery that exists.

---

## 5. A flow is a *run*, not a space

The thing the block is handed to the arbiter as: **the ruleset for one match, or
one lobby run.** Not a permanent property of the level.

That distinction is not tidiness, and the document that proves it already ships.
**`steal-a-plant` is a space**: your plants persist, they are visible in the
room, anybody who walks in sees them, and there are no rounds and nothing to
win. **A battle is a run**: it starts, it has rounds, it ends, and what it
counted should be gone afterwards. A design that cannot say which of the two a
level is will eventually write "rounds won" into the same place it keeps
somebody's plants.

### The split the data block is one scope short of

`DATA_SCOPES` is `player`, `space`, `shared` — and all three **persist**. There
is no scope for a number that is true for the length of a match and then is not.
So a `flow` that counted anything today would have to count it in a scope that
outlives the reason it existed.

| scope | lives for | example |
|---|---|---|
| `player` | that account, forever | your best time |
| `space` | the space, forever | the plants on the shelf |
| `shared` | the space, forever, everybody writes | a door somebody opened |
| **`run`** | **this match, and then never** | rounds won, who is caught, the phase itself |

A fourth scope is a smaller change than it looks: `plannedReads` skips it,
`changed` never offers it to the store, and `openingValues` gives it its
declared default every time a run starts — which is the behaviour, not an
optimisation of it. It also answers open question 4 by making the question
disappear: a `run` field does not survive a reload because surviving is what it
is defined not to do.

### `freestyle` is a flow, not the absence of one

Once `flow` exists, `preset: 'freestyle'` is a flow with one phase, everything
allowed, and no `wins` — which is a much better description of what freestyle
*is* than "the preset where none of the five machines run". The same for
all-vs-all: one phase, `wins` on a score. That is what open question 2 is
proposing, and this is the argument for the second answer in it: presets become
templates that write a flow, rather than a sixth machine beside them.

A space with no flow at all stays exactly what it is today. `steal-a-plant`
declares none, nothing starts, nothing ends, and the plants are still there
tomorrow.

### Which place the run happens in

A run says where it is played: `"scene": "arena"`, on the flow or on a phase.
That is [scenes.md](scenes.md)'s table and this proposal has no opinion about
how a scene is loaded — the `load` verb already does it, and a phase's `does`
can call it. What is worth stating is the direction: **the run names the scene,
the scene does not name the run.** One arena hosting three different battle
rulesets is the normal case; a scene that carried its own would make it the
exception.

## 6. The editor — **built**

> **Built**, in three pieces, and each was a different argument. `allow` and the
> start are a list and a choice, so they were a form from the beginning. The
> arrows are a graph and waited for one. And `does` waited on neither and was
> the gap that made the other two hollow — a flow was authorable right up to the
> point where it does anything. It is the rules panel's own verb rows, because a
> phase's `does` *is* a `Verb[]`, and two forms over one growing vocabulary is
> two forms that go out of step.


A flow chart, because that is what the block is — and because the alternative is
a form with a `next` array in it, which is a state machine typed as JSON in a
text field.

```mermaid
flowchart LR
  subgraph panel["the panel"]
    graph["nodes and arrows<br/>drag to connect"]
    node["a phase, selected:<br/>does · allow · next"]
  end
  graph --> node
  node --> verbs["the verb list the<br/>behaviour panel already draws"]
  node --> conds["the condition row the<br/>trigger form already draws"]
```

**Almost none of it is new UI.** A phase's `does` is a verb list and
[behaviour.tsx](../../src/app/xp/_editor/panels/behaviour.tsx) draws one; a `next` is a
condition and it draws those too. What has to be built is the *graph* — nodes,
arrows, and a drag that makes one — plus the two rules that make a graph
trustworthy:

- **A phase nothing reaches is drawn as unreachable**, rather than saved and
  silently never entered. The same class of bug as a rule matching `pickups`
  against a blueprint tagged `pickup`: correct-looking and permanently inert.
- **A phase with no `next` and no `wins` under it is a dead end**, and it should
  say so at the point you draw it rather than when somebody plays it.

---

## 7. What this would let the board game delete

The test of the whole idea. A turn from [round.md](round.md), as a flow — and
note that **not one transition is a timer**:

```jsonc
{
  "flow": {
    "start": "roll",
    "phases": {
      "roll":  { "allow": ["roll"],  "next": [{ "on": "rolled", "go": "move" }] },
      "move":  { "allow": ["use"],   "next": [
        { "on": "six",    "go": "roll" },     // and go again
        { "on": "moved",  "go": "@next-seat" }
      ] },
      "@next-seat": { "does": [{ "op": "pass" }], "next": [{ "go": "roll" }] }
    },
    "wins": { "of": "world", "prop": "@world.mine-home", "is": ">=", "value": 4 }
  }
}
```

| today | with `flow` |
|---|---|
| three ordered presses, working because a verb's write lands before the next condition reads it | two phases, and the ordering is an arrow you can see |
| a press on the die does nothing useful mid-move, and nothing says so | `allow: ["use"]` in `move` — the roll button is simply not live |
| "a six, go again" as a trigger-order trick | an arrow from `move` back to `roll` |
| the turn passed by a verb buried in a piece's rule | a phase, which is where a turn ending belongs |
| "only your own colour" impossible — needs two conditions in one `when` | a phase whose `allow` is scoped by role |

The last row is the one to be honest about: `flow` does not make it free, it
moves it. A role scoping `allow` is a second place the answer could come from,
and it only works because a role is dealt per player. Two conditions in one
`when` is still the smaller, more general fix.

It does **not** replace the `when`-takes-one-condition fix. That is smaller,
independent, and unblocks three things today; this is the larger shape and
should not be used as a reason to defer it.

---

## 8. Open questions

1. **Who owns the phase?** A round with a timer and a shared transition has the
   same problem the dice had, and the answer is probably the same: the arbiter
   holds the current phase and clients render it. That makes `flow` a
   `backend.needs` claim rather than a free block, which is a real cost for a
   single-player level that wants rounds.
2. **What happens to the six machines above?** Either they stay and `flow` is a
   seventh, which is worse, or the presets are reimplemented as flow blocks and
   `preset` becomes a template that writes one. The second is right and is a
   migration, not a feature.
3. **`after` in seconds needs a clock everybody agrees on** - and nothing else
   in the block does, which is why it is the last field to build rather than one
   of the first. `stepMatch` has a per-client clock today, which is fine when
   the answer is only drawn and not fine when it decides a transition. A
   round-based document never asks the question.
4. ~~**Does a phase survive a reload?**~~ Answered by §5: the phase is a `run`
   field, and a `run` field does not survive by definition. What is left of the
   question is whether *rejoining* a match in progress is a thing at all, which
   is the arbiter's to answer and not the format's.
