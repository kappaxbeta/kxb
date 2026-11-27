# Server authority, and the games it unlocks

Reopening §17's refusal of a dedicated authoritative server: what it buys, what
it has to answer first, and why board games split on hidden information rather
than on turn-taking.

Split out of [xp-backlog.md](backlog.md), which keeps the short entry and
the gating. Section numbers in cross-references are the backlog's unless stated
otherwise.

**This started as a refusal being reopened, and both halves of it are built.**
§4.1 is the scoping, written before any code, with a quoted block at the top of
each answer saying what shipped against it.

**What is *not* built is no longer "a game that uses any of it".** Two on disk
do — `proto-bug` for the secrecy and the vote, `mensch` for the dice — and both
were written against the arbiter rather than around it.

§4.2 was the honest remainder and it is empty. It opened with four: **the table
now keeps a turn** a level can start and everybody can see, a document that
**keeps a secret is refused unless it says it needs an arbiter**, the deck is
**dealt once**, and §7.6's visiting — which §4.3 scoped in the shape §4.1 used
and then built. **All three of §4's arguments are now spent**: secrecy in the
deal, fairness in the arbitrated kill, and integrity in a visit that moves two
saves together with the owner of one of them offline.

What is left of the whole entry is a call site: nothing in the app asks for a
visit yet, because no level wants one — which is the order this entry argued
for, infrastructure first and the game second.

---

## 4. Server authority

**State:** **built** — the entry below is kept as the decision it was, and §4.2
is what is left. Reopens §17. **Size:** its own project. **Gated §5's card
games**, and the gate is open.

§9 has three authority tiers: `self`, `elected`, `server`. Hidden information
fits none of them. `elected` means *one client owns the object and integrates
it* — so in a card game the elected client holds the deck and sees every hand.
That is not a bug in the election; it is what election means. And §17 lists *a
dedicated authoritative server* under **not planned at all**.

**That refusal is being reopened deliberately, and this entry is the record of
it.** What it buys is every game where one player must not see what another
knows: cards, hidden roles, fog of war, sealed bids, simultaneous choice.

### It is also the failsafe under §6

Hidden information is the half that is obvious. The other half is that **§6's
fit-for-all promise is only safe if the device you happen to be on cannot change
the outcome.**

One XP running on a phone, a desktop and a headset means three clients that see
differently, reach differently and are told different things by their own
presentation layer. Under `self` and `elected` authority, that is not merely a
cosmetic difference — the client is the thing deciding, so a device with a wider
camera, a longer reach or a hand-modified build decides differently. "Runs on
anything" and "trust whatever it says" are the same sentence in a
client-authoritative model, and only one of those is wanted.

The consequence is worth stating as a rule, because it changes what a bug in §6
costs: **with outcomes decided server-side, a presentation default that is wrong
on some device is an XP that looks bad there, not one that plays unfairly
there.** That is the difference between a layout to fix next week and a result
somebody disputes — and since §6's whole design is a default derived
automatically for devices the author does not own, being wrong on one of them is
not a hypothetical.

So §4 is not only what unlocks §5's card games. It is what makes it safe to
promise §6 at all, and that is the stronger reason to build it as infrastructure
rather than inside whichever game reaches for it first.

**And a third reason, which is integrity rather than secrecy or fairness:**
§7.6 works through a game where you visit somebody else's world and take
something from it. Two people's state has to change together or not at all, and
one of them is offline. That is a harder guarantee than hiding a card, no
client-authoritative model can fake it, and it is the clearest single argument
for this entry — read it before scoping the work.

What it has to answer before anything is built:

- **Where does the secret live?** The event log is durable and slow, and §9's
  own rule of thumb — *nothing that changes 8 times a second is ever written to
  the event log* — says a hand of cards is fine there and a poker clock is not.
  An edge function holding per-round state is the other shape.
- **What does the client get?** The tier only works if a client is *told what it
  may know* rather than sent everything and asked not to look. That is a
  per-player view of the state, which is a genuinely new thing in this codebase.
- **How does it fail?** §9's known trap applies at full force: a result latched
  locally before the server confirms is a result you can lose. Every outcome
  here is `server`-authority by construction, so every one of them shows as
  pending and reconciles.

Do not fold this into a card-game feature. It is infrastructure, several games
want it, and building it inside the first one that needs it is how it ends up
shaped like poker forever.

---

## 4.1 The three questions, answered

The scoping the entry above asked for, written before any code, because the
expensive mistakes here are all shape mistakes and all three of them are cheap
to make in an afternoon.

It is kept as it was written, with what shipped quoted in above each answer —
so the argument still reads as the decision it was rather than as a description
of what exists. Where the build differed from the plan, the answer says so.

### Where the secret lives: a database function, not an edge function — **built**

> `20261005000000_xp_arbiter.sql`. One table keyed by the room's topic, RLS on
> and **no policy at all**, so the two `security definer` functions are the only
> door — verified by a direct `select` as `authenticated` returning nothing while
> rows exist. `xp_arbitrate(instance, action, payload)` decides and
> `xp_arbiter_view(instance)` redacts; both answer in `XpVerdict` shape. The
> first rules are `join` and `kill`, and the row is locked `for update` before
> either reads it, because read-then-write is how two kills in one tick both see
> three lives and both write two. `realtimeArbiter` in `_hosts/realtime.ts` is
> the client side, present only when there is a topic to be the authority of.

**A Postgres function over rows the client can never `select`.** The entry above
offered the event log and an edge function as the two shapes. It is neither, and
the reason is that the hardest requirement is not secrecy — it is §7.6's *two
rows changing together or not at all, with one of them offline*. That is a
transaction, and there is exactly one thing in this stack that has transactions.

Taking the alternatives in turn:

- **The event log** stays what it already is: where a *durable outcome* goes.
  §9's rule of thumb holds — a hand of cards would fit in it and a poker clock
  would not — but the deciding argument is not rate, it is that a hand is
  **state, not history**. It is read, mutated and thrown away at the end of the
  round; the log is the wrong shape for anything you intend to overwrite. The
  round's *result* is appended, which is what `append` was separated from `put`
  for in the first place.
- **An edge function holding per-round state** is a second stateful thing to
  operate, and one that loses the round it was holding when it restarts. It is
  also in the wrong place: §7.6's owner is offline, so the state has to be
  actable-on where it lives rather than in a process that happens to be up.

And one hard constraint that removes a whole family of designs before anybody
prototypes one: **nothing here may mint a token.** Production signs its JWTs
with ES256 and there is no shared secret to sign with; locally it is still
HS256. So any design in which a server hands the client a per-round credential
works perfectly on a laptop and fails on the box, which is the worst possible
time to find out. The client's ordinary session is the identity, the function
reads it, and there is no second credential anywhere in this design.

Row-level security is doing real work in that sentence. "The client cannot read
the other hand" should be a property of the table — denied by default, with the
function as the only door — rather than a rule every future query has to
remember. A secret guarded by discipline is one somebody joins the project and
`select *`s.

### What the client gets: a view, and never a broadcast — **built**

> `20261012000000_xp_arbiter_secrets.sql`. One opaque value per player, dealt
> once and refused twice, with `xp_arbiter_view` returning **yours in full and
> everybody else's as a count** — which is the migration where §4.1's rule stops
> being aspirational. Nothing secret goes back through the outcome, including to
> whoever pressed deal. **The deal uses `random()` and not `world.random`**, and
> that is the load-bearing sentence: the seeded stream is `hash(seed, tick,
> index)` and every client holds the seed, so anything dealt from it is
> computable by everybody. Public agreement and secrecy are opposite
> requirements and need opposite sources.

### What the client gets: a view, and never a broadcast

**A redacted per-player view, computed server-side.** Your hand in full,
everybody else's as a count; the part of the board everyone sees, once. The
redaction happens inside the function, so "what this client may know" is one
expression in one place rather than a property that has to hold across every
call site.

The rule that makes it safe is about the transport rather than the data:
**nothing private ever crosses `XpSocket`.** That socket is a broadcast bus —
`send` goes to the topic and `peers` is everybody on it — and there is no such
thing as a private broadcast. Secret state reaches exactly one client, as the
reply to that client's own call. Public deltas keep going over the socket at
`sendHz` like everything else, which is also what keeps this affordable: the
per-player view is asked for at the speed a card game turns, not sixty times a
second.

### Beyond the three questions: what the arbiter knows now

**Eleven rules and one view**, all over `xp_arbiter_state` keyed by the room
topic: `join` (which pins the match's numbers), `hit`, `revive`, `deal`,
`reset`, `roll`, `turn_start` / `pass`, and `vote_open` / `vote` / `vote_close`.
Between them they cover the three things §4 was opened for — **integrity** (two
numbers moving together under a row lock), **secrecy** (one opaque value per
player, yours in full and everybody else's as a count), and **elimination**
(lives that run out, after which `revive` is refused, whether they ran out to a
gun or to a majority) — and two more that were not in the entry at all, both of
which are the same argument arriving from a different side: **a number no client
chose**, and **an order no client can jump**.

The vote is where "decided somewhere no client can reach" earns its keep twice
over: the majority is measured against who is *standing*, and the deadline is
`now()` on the server. Both are numbers a client would have every reason to
prefer differently.

**`roll` is the one rule that writes nothing.** Every other action here mutates
the row; a dice returns its face and keeps no copy, because what it came up as
is the *level's* business — the verb names a field in the document's own `data`
block and a rule reads it back from there. A second copy in this state would be
a second answer to "what did I roll", and the two would disagree the first time
somebody rolled twice in a round. It is here for the reason `deal` is, one
branch up: `deal` exists so a role cannot be re-rolled and this exists so a face
cannot. `./random` is a seeded stream on purpose — every client reproduces it,
which is right for scenery and exactly wrong for a dice.

**`turn_start` and `pass` close half of the gap the note on `reset` names
below.** The order is `health`'s keys sorted — the server's map rather than each
client's idea of who is in the room, so two clients asking at the same moment
cannot disagree about who goes first — and it is refused once it is running, like
`deal`, because restarting the order is how somebody who does not like being
fourth becomes first. `pass` hands on your own turn and nobody else's. `roll`
refuses out of turn, and **only when turns are actually running**: a level that
never started them is a level with no turns, and refusing every roll in one
would break every game that is not a board game.

What it still does not decide is *when* a turn ends. Rolling a six and going
again is a rule about a game and the arbiter has never been told any of those,
which is the same division every rule here follows: the arbiter decides what a
client may not, and the client decides what only it knows.

⚠️ **`reset` is the one rule with no real defence, and it is worth knowing why.**
Any player still in a match may start the next round, and the only check is that
the round they name is the next one — which makes two people pressing rematch
together idempotent and does nothing about somebody resetting a round they are
losing. The arbiter has never been told what *ends* a match: the clock and the
score limit are the client's, so there is no moment here to check against. The
fix, when it is worth one, is to tell it — `join` already pins `hp`, `damage`
and `lives`, and a `timeLimit` beside them would let this refuse. Unbuilt
because nothing reads a clock server-side yet, and half of that is worse than
none.

This note used to describe two gaps at once — nothing knows whose turn it is,
and nothing knows when a match is over. **The first closed and the second did
not**, and they parted company for a reason worth keeping: an order is a fact
about the room, which the arbiter already holds in `health`, while an ending is
a fact about the *rules*, which live in a document this function has never
read.

**It has been played**, once, headlessly: two signed-in browsers in one room,
one pressing `B`, both seeing the same panel, both voting, one eliminated —
`scripts/xp-two-players.mjs`. That run found two bugs nothing else here could
have, and both are worth knowing about because they share a shape: **the value
the server returned was correct and the client still could not use it.** The
view omitted the open vote, so the panel cleared itself on the next poll; and
the deadline was rendered `+00`, which `Date.parse` reads as NaN, so the
countdown sat at zero and the auto-close never scheduled. Every SQL check passed
throughout — they all read `xp_arbitrate`'s outcome, which was always right.

**It also decides whose shots count.** `join` pins a `lethal` role beside `hp`
and `damage`, and `hit` refuses every claim from a caller who was not dealt it.
That is the one rule in this file that reads a secret to answer a question about
somebody else, and it is here because it cannot be anywhere else: a client sees
its own dealt value and no other, so it can neither tell whether the person in
its crosshair is the bug nor be trusted to say whether its own shot counted.
Proto Bug's first attempt lived in the document — a `dealt` rule that zeroed the
crew's ammunition — and disarmed the crew against the bug as well, which was the
whole of their game.

The other half of that asymmetry needed nothing new: the side with no working
gun votes. A majority of those standing eliminates whoever it names and is not
asked to be right, which is exactly the mechanic §5 wanted and was already
built.

`deal` also cuts the deck before shuffling it, rather than shuffling and dealing
off the top. A ten-card deck holding one bug, shuffled and dealt to three
players, put a bug in the room three times in ten — and with the rule above,
seven rounds in ten had no working gun in them at all.

### What a level can reach, without anybody writing SQL

The entry above and §0.3 of the backlog both spent a revision saying the arbiter
could do things no document could ask for. **That is over**, and it is worth
listing because the gap it leaves is now a short one rather than a category:

| The document says | The arbiter is asked |
|---|---|
| `rules.roles` — the deck, in written order | `deal`, once a round, by every client |
| `rules.lethal` — which dealt value's shots count | `join` pins it; `hit` refuses everybody else |
| `{ op: 'roll', key, sides }` | `roll`, and the face lands in the level's `data` |
| `{ op: 'meet', seconds }` | `vote_open`, with the deadline clamped there |
| `{ op: 'pass' }` | `pass`, and the first one seats the table |
| *nothing* | `turn_start`, which nothing needs to say out loud |

The shape is the same every time and it is the one this file argued for:
**a verb produces an effect and the host asks whatever authority it has**, the
way `load` and `stun` already did. Without an arbiter a `roll` is the tab's own
`Math.random`, which is honest for somebody playing alone and dishonest between
four people at a table — and `needs: arbiter` is the document's way of saying it
cannot tolerate that.

Two of these are not the arbiter's at all and belong in the list anyway, because
a board game needs them in the same breath: `advance` walks a piece along
numbered marks by a number the level rolled, and a `point` mark kind exists so
forty fields can be named without meaning anything to the runtime.

That last row used to be the gap: `turn_start` was reachable from SQL and
nowhere else, so the one level with a turn order in it could never start one.
`20261107000000` closed it from the other side — the verb a level already had
starts them — which is why the row is empty rather than filled with something
new to say. §4.2 has what that cost.

### How it fails: pending, and visible where the play is

Two traps, and this repo has already fallen into both — which is why they are
named here rather than left to §9's general warning.

**A result latched before the round trip is a result you can lose.** Race
finishes did precisely this: latched locally, then reported to a server that no
longer believed the race was live, and the finish evaporated with nothing shown.
Every outcome under this tier is `server`-authority by construction, so every one
of them renders as *pending* and reconciles on the reply. A pending state that is
only in the code and not on the screen is the same bug with better manners.

**A refusal has to be visible where the play is.** The other precedent: battle
errors were set into a panel that closes at kickoff, so the one moment they
mattered was the one moment nobody could see them. A rejected action belongs in
the HUD, during play, next to the thing that was refused.

Three failure classes, and they are not the same message: *refused* — the rules
say no, and the client should show why; *lost* — no reply came, and the client
should retry or show the action as unresolved rather than as done; *stale* — the
round moved on, and the client should re-fetch the view rather than argue.

### The port: a fourth capability, declared and refusable — **built**

> **The boundary is in**, and nothing behind it is. `XpArbiter` (`ask`, `view`),
> `XpVerdict`, the three refusal kinds, `arbiter` in `HOST_CAPABILITIES`, and
> `memoryArbiter()` — one authority several `memoryHost`s share, so a test has
> four clients that cannot decide anything for themselves. The worked example in
> `memory-host.test.ts` is the kill below rather than a card game, and it already
> demonstrates the two properties that matter: two numbers move together or not
> at all, and the credit goes to whoever *asked* rather than to whoever the
> payload named. What is missing is the half that needs a database.

`XpHost` has three slots and a document says which it needs. This is a fourth —
call it something that is not `server`, because `server` is already an authority
tier in §9 and two meanings would collide the way *Rules* and *Behaviour* did.

It is two calls: ask for an outcome, and read what I may know. Both asynchronous,
both replying with a verdict rather than a value, because "the server stored it"
and "the server agreed with you" are different answers and a design that returns
one number cannot say which it meant.

`missingCapabilities` then does the important part for free: **an XP that needs
an arbiter refuses to start on a host that has none.** Without that, a poker game
handed to somebody else's infrastructure runs client-authoritatively and looks
like it works, which is the failure this entire entry exists to prevent.

### What to build first, and it is not a card game — **followed**

> And followed in this order, which is the part worth recording: the kill went
> first — `join` pins the match's numbers, `hit` prices the body and awards the
> point only on the fatal one, a claim renders pending and the HUD names a
> refusal by kind — and `deal` arrived two migrations later, onto a transactional
> half that already worked. §0.3's *all vs all* row is the receipt, including
> what it cost to play: a shot took twenty-five health off another browser
> through the arbiter, and a kill is four hits with no refill.

**The integrity half, without any secrecy in it.** Redaction and transactional
outcomes are separable, they are not equally hard, and only one of them is
blocking things today.

Look at what §0.3 is actually waiting for: *all vs all* and *team counters* are
blocked because "one client's damage has to reach another's, which is neither on
the wire nor in the log". That is a **kill** — an outcome two clients disagree
about, needing one arbiter and a transaction, and containing **no secret
whatsoever**. It is the smallest honest consumer of this infrastructure, three
backlog entries unblock on it, and it can be built and played before the word
"hand" appears anywhere.

So: arbiter, verdict, pending-and-reconcile, one transactional outcome, shipped
in a mode people already asked for. Then per-player views on top of a thing that
already works, and the card games after that. Built the other way round — poker
first — the redaction is what gets designed carefully and the atomicity is what
gets assumed, and §7.6 is the entry that proves atomicity is the harder half.

---

## 4.2 What is left, and none of it is a card game

Four things were found here, all the same way: by reading the built half against
the two documents that actually use it rather than against the plan. **Three are
closed and the fourth is §7.6's**, which nothing has needed yet — so what is
left below is the record of what each turned out to be, kept because in every
case the fix was smaller than the entry and the reason it had gone unnoticed was
the same one: the arbiter was checked against its own rules and never against a
document that had to reach it.

### ✅ The table keeps a turn — startable, and visible

**What it was.** `turn_start` was reachable only from SQL: no verb, no caller,
no field. So `mensch`, the one document with a turn order in its head, ended
each colour's click with `pass` and was answered *nobody is taking turns*, four
times over, for as long as it had existed. And the turn was invisible even to
the client that had just moved it — `xp_arbiter_view` was last restated in
`20261020000000`, three migrations before turns existed, and no outcome carried
one either. A player learned whose turn it was by being refused one, which is
exactly the shape of *the view forgot the vote* one migration earlier.

**Three things closed it, and the first was the design question.**

- **The first `pass` seats the table.** A document that says `pass` means turns,
  because that verb has never meant anything else — so a new verb or a new rules
  field would have been a second way to say what the format already says.
  `turn_start` stays for saying it out loud, and its refusal-on-restart still
  protects both paths: whoever passes first cannot restart the order later to be
  first again.
- **The order is derived rather than stored.** It was an array frozen at seating
  time with the turn as an index into it, so a player who joined afterwards
  waited for a turn that could never come round — which is not an edge case in a
  room, it is what a room is. It is now `health`'s keys sorted, read at each ask,
  with the turn stored as *whose it is*. An index into a list that changes length
  points at somebody else's seat the moment it changes.
- **`turn` is in the view and in the outcome**, so every client sees it a second
  later and the one that passed sees it in the reply. The HUD says *your turn* or
  names whoever has it, under the board.

**Checked against the database, not by reading it**: three players joining out of
order, the table seating itself on a pass, a roll and a pass refused out of turn,
a real face rolled in turn, the turn wrapping from last to first, a player who
joined *after* seating taking their place in the order, `turn_start` still
refused once running, and a rematch clearing the table.

**Half of the stall is closed, and by the rule the room already has.**
`20261113000000`: the order is `health`'s keys *minus anybody the match has
lost*, because that map is the scoreboard and never shrinks — so an eliminated
player was being handed turns they are not allowed to take. A turn parked on
somebody who is out may be moved on by anybody, to the next player after them,
without costing the rescuer their own go.

That is not a new rule: being out is a majority decision the vote carries, and
this only stops the order disagreeing with it. **The other half is still open** —
a player who closes their tab still holds their turn, presence is the client's
rather than this function's, and the honest fix is a `skip` a majority can press
on the machinery that is already here, not a timeout picked out of the air by a
function nobody in the room agreed to.

**And played, in a browser, which is the half SQL cannot reach.** One `E` at the
seat in a room of one puts *your turn* on the screen two seconds later, and in a
room of two the presser's screen reads `<somebody>'s turn` — press, piece,
`pass`, the table seating itself, the answer coming back far enough to be drawn.
`scripts/xp-turn-order.mjs`, beside the vote's script, with two more things
worth keeping: `mensch` is played with the **use key** and not with clicks, and
a `pass` from the seat works because the player's body is at the eye minus
`EYE_HEIGHT`, which puts a piece 1.2 away inside a `within: 2` — `xps.test.ts`
now asserts exactly that, so the level cannot drift out of its own reach
unnoticed.

**What that run did not prove is the other player's screen.** The pointer lock
follows the window the OS has fronted, so two browsers cannot both hold one and
a client that never took the pointer is not a client whose HUD proves anything.
The script hands it back and forth now; it wants a machine that is not running
six dev servers.

### ✅ A level that keeps a secret says it needs somewhere to keep one

`missingCapabilities` is the door §4.1 built so that *an XP that needs an arbiter
refuses to start on a host that has none*. Both games named it — and both named
it on the side of the split that does not refuse: `mensch` as `needs:
['identity']`, `wants: ['network', 'persistence', 'arbiter']`, and `proto-bug`
the same way with `network` in front.

**`wants` degrades, and what it degrades to is different at each end:**

- **`mensch` is defensible and under-specified.** Alone, the dice falls back to
  this tab's `Math.random`, which is honest — nobody is being cheated in a game
  of one. At a table it is four private dice. `wants` cannot say *fine alone,
  not fine with company*, which is the real gap here and is a question about the
  field rather than about the level.
- **`proto-bug` was simply declared wrong, and now says `needs`.** Without an
  arbiter nothing is dealt, so nobody holds `lethal`; and `claim` returns early
  with no arbiter, so no shot reaches anybody at all. It did not degrade to a
  lesser game, it degraded to a room where the two things it is about cannot
  happen.

In this app neither is reachable today — `realtimeArbiter` exists whenever there
is a topic, so a room implies an arbiter and solo play is the only arbiterless
case. It bites on **somebody else's** host, which is the exact scenario §4.1
built the capability for: *a poker game handed to somebody else's infrastructure
runs client-authoritatively and looks like it works*.

**✅ And the parser now refuses the mistake, which is the half worth having.**
`rules.roles`, `rules.lethal` and a `meet` verb are secrets and votes: each is
either decided somewhere no client can reach or it is not happening, so any of
them without `arbiter` in `backend.needs` is a document `parseXp` will not
accept. The message names what forced it — *this level deals roles, which no
client can decide* — because a refusal an author cannot act on is a wall.

**`roll` and `pass` are outside the rule on purpose, and that line is the part
to remember.** A dice from the tab's own random is honest alone and dishonest at
a table, and `wants` cannot say *fine alone, not fine with company* — so
refusing every solo level that rolls would be a worse rule than the silence it
replaced. `mensch` is the document that protects, and the gap it leaves is a
question about the *field* rather than about either level: `wants` has one
meaning where two are wanted.

It is in `parseXp` rather than `rulesProblems` because it is two blocks agreeing
rather than one block being well formed. The editor writes through the parser on
every keystroke, so anything accepted in a panel and refused at load is a save
that silently does nothing — nothing in the editor sets `rules.roles` today, and
whatever panel does will need the same rule the day it is written.

### ✅ Two effects dealt the same deck

`simulation.tsx` called `deal` twice, from two commits a day apart — `001557cd`
on a two-second timer keyed on `round`, and `e0c80cef` behind a ref and a
`players.min` gate. They were not redundant, they were each other's bug: the
older one fired two seconds in with whoever had arrived by then, which is the
deal-at-one-player case the `min` gate exists to prevent, and the newer one never
cleared its ref, so a rematch was played with no roles at all.

**One effect now, with both properties**: the `players.min` gate, and a ref that
remembers *which round* it asked for rather than whether it has ever asked. The
short-deck refusal is kept and said — it is the author's mistake, and the player
standing in a level with no roles in it is the one who needs to know.

### And §7.6's visiting, which is the reason this was built

Two people's state changing together or not at all, with one of them offline.
It is the argument that reopened §17's refusal, it is the only one of the three
that no client-authoritative model can fake, and it is the one nothing has needed
yet. The transaction is there waiting for it.

**§4.3 scopes it**, the way §4.1 scoped the arbiter and before any code: it is
two rows in one table rather than a transaction across saves, it needs none of
the secrecy work because the store's scopes already answer that, and it turns on
one decision nothing here has had to make — **whether a database function may
read a published level**, which is the only way an empty world can enforce its
own rules.

`reset`'s missing defence is the fifth, and it is the ⚠️ in §4.1 rather than a
line here: it needs the arbiter to be told what ends a match, which is a fact
about a document's rules and not about the room.

---

## 4.3 The visit — scoped, then built

The last thing in §4.2, and the one this whole document was opened for:
[state.md](state.md) §7.6's *Steal the Meme* — you enter somebody else's world,
take something, and it is in yours, and they are not online. Scoped here before
any code for the reason §4.1 was scoped that way: the expensive mistakes are
shape mistakes, and every one of them is cheap to make in an afternoon.

### It is smaller than the entry sounds, and the store's key is why

`xp_store` is keyed by `(xp_id, scope, account_id)`. *Steal the Meme* is **one
XP** whose players each hold a `player` row — so a steal is two rows in one
table with one `xp_id` in them, not a transaction across levels or across
spaces. "Two saves changing together" is two rows changing together, in the
database that already has transactions.

### It is not the arbiter's table, and that is the first decision

`xp_arbiter_state` is keyed by the room's **topic** and holds a round: `reset`
empties it, and nothing in it is meant to outlive the match. A steal changes
something durable with nobody in a room at all.

So what carries over from §4.1 is the *shape* and not the table — `security
definer` over rows a client cannot `select`, the lock taken before anything is
read, one answer in `XpVerdict` because *stored it* and *agreed with you* are
different sentences. The visit is a second function over `xp_store`, beside
`xp_store_clear`.

### Where the secret lives: already answered, by the scopes

The half that costs nothing here, and it is worth saying because it is the
opposite of poker. `player` is yours alone, `shared` is yours and visible to the
space, `space` is the space's — all three are policies on the table rather than
redaction in a function, and a visitor may read the last two and never the
first. **§4's secrecy question does not reappear**; only the transaction does.

### ✅ The one expensive decision, answered: the function reads the level

The rules are the owner's world's, they can only be enforced where the state is,
and this function has never read a document. Three shapes, and the first two are
already refused elsewhere in this file:

- **The caller names the amount.** A client that can say *take three* can say
  *take three hundred*. Refused for the same reason `hit` refuses a client's
  claim about damage.
- **Pin it at the join, the way a match does.** `join` works because everybody
  in the room holds the same document and the first arrival pins the numbers.
  **Nobody is in the room here.** There is nothing to pin from and nobody to
  disagree with.
- **The function reads the published version.** ✅ **This is the answer, and it
  is built** — `20261109000000`. `xp_versions` holds `document` as jsonb in this
  database, and `needsOf` already read `document -> backend -> needs` with a JSON
  path from the browse page; `xp_visit` reads `document -> 'visit'` the same way.
  It is what buys in an empty world the property `join` buys in a full one: the
  numbers come from the level rather than from a player.

  **The published version and not the current one**, which is the part that
  would have been a quiet hole: `current_version` moves on every save, so
  reading it would let an author change what visitors may take by saving,
  without publishing, while people are in it. Checked with a draft saying 999
  over a published three — the three is what moved.

If that is the answer, the cheap variant is worth costing at the same time:
**project the visiting rules into columns when a version is published**, so the
function reads a small typed row rather than parsing a document per steal. The
precedent is `xp_play_totals` — built as its own reader precisely because the
column beside it was one nothing ever wrote.

### ✅ The failure this one adds: two people stealing from each other

Everything else here fails the way §4.1 already describes — pending on the
screen, reconciled on the reply, three named refusal kinds. One is new and it is
the classic: **two rows, two locks, two visitors going opposite ways.** Postgres
resolves a deadlock by killing one of them, and what that client sees is a
failure nothing in the game explains.

Take both rows in one `select ... for update` with a deterministic order — by
`id`, since both are in one table — which costs one line on the first day and is
a Heisenbug on any other. **Written that way from the first commit.**

### Fairness rules are the same function's job, not a layer above it

Cooldowns, caps per visit, protection after being hit. §7.6 is right that they
are not decoration — without them the strongest player farms the weakest until
they leave — and there is a structural reason they cannot live anywhere else: a
cooldown is a row on the **owner's** store written by somebody who is not the
owner, which the table's policies forbid outright. They can only be written
where the transaction is.

### The owner is offline, so the consequence is a row rather than a notice

`append` already exists and is already the call for history. *Somebody took your
thing* is an appended entry the owner reads when they come back, not a push to a
client that is not running. No new machinery, and it is the same division the
rest of this file follows: the durable outcome is written where it can be read
later, and nothing waits for anybody to be present.

### ✅ The smallest honest first slice, built

One value moving between two `player` rows of one XP, under one lock, with one
cooldown, answering with a verdict — and **no** caps, no protection window, no
notification. That is `20261109000000` plus the `visit` block in the format, and
it proves the property the entry exists for: two numbers change together or not
at all with nobody watching, and a second attempt inside the cooldown is refused
by the server rather than by the level.

**The level's half is three fields.** `take` names a declared field that is one
row per person — `player` or `shared`, checked at parse time against the data
block *and* against its scope, because taking means one row going down while
another goes up and a `space` field is one row for everybody. `amount` is a whole
number with a cap. `cooldown` is **required**, which is the one judgement in the
block: a level without one is not a simpler version of this feature, it is the
version that ends the game, so writing the field is how an author says they
thought about it.

> **Two of those were wrong for an hour, and `steal-a-plant` is what corrected
> them** — the level that wants this feature, read after the block was written
> rather than before.
>
> `shared` was refused as "a scoreboard". Every shelf in that level is `shared`
> *because it is the only scope in which a visitor can see there is anything to
> take*; a `player` field is invisible to everybody but its owner, so a steal
> against one only means something once entering somebody else's world exists,
> which is §7.6's harder half and is not built. Both are one row per person, so
> the transaction never cared.
>
> And a `visit` block **implied `needs: arbiter`**, which would have stopped that
> level being played alone. A greenhouse nobody can raid is a *lesser* game: it
> is the `roll` case, not the `roles` case. With no arbiter a deal leaves a
> hidden-role game in which nothing can happen, and a visit leaves a level with
> one button that says no.
>
> Both mistakes have one shape — designing against the worked example in
> state.md rather than against the game on disk — which is worth remembering the
> next time this document scopes something before meeting its consumer.

**Checked against the database**, the way the arbiter's rules were: three coins
moving both ways at once, a cooldown refusing with the seconds left, visiting
yourself, an owner with nothing left to take, a level whose published version
has no block, the draft-versus-published case above, and `authenticated` reading
zero rows of `xp_visits` while rows exist in it.

### Nobody chooses who they raid

The call site's one design question — *do they name somebody, or is it random?* —
and the answer is **random, once a cooldown**. It is worth writing down as a
decision rather than a default, because the alternative is what every game with
this mechanic starts with.

**A visitor who can name a target will name the same one.** §7.6 spends a bullet
on the consequence — the strongest player farms the weakest until they leave —
and every cap, cooldown and protection window it lists exists to blunt a choice
this design does not offer at all. A client that cannot say *who* cannot farm
anybody, which is a stronger guarantee than any of the rules that would have had
to hold the line instead.

It is also the version with no interface. Naming somebody means knowing their
name and typing it, and a text field in a level whose pointer is locked is a
panel that takes the camera off whoever is playing. One button, one answer, and
the verdict says who it was so the level can put a name on it from the roster it
already has.

Two things follow, and both are in `20261111000000`:

- **The cooldown is per visitor, not per pair.** A per-pair cooldown is the rule
  you need when the visitor chooses — it stops them coming back — and here it
  would bound nothing at all. So `xp_visits` is keyed by `(xp_id, visitor_id)`,
  with `owner_id` kept as a column because who it was is worth knowing and is
  what the second guard reads.
- **Nobody is raided twice inside one window.** §7.6's *protection after being
  hit*, and with a random pick it is the other half of the same fairness:
  without it, four visitors on one morning all land on the person who left
  plants out overnight.

The pick is `order by random()` over everybody in the level who is not the caller,
holds at least the amount, and is not inside that window. It is not a fair queue
— two raids can land on the same person once the window passes — and it needs no
bookkeeping to be honest, which a queue would.

### ✅ And a level that presses it

`{ "op": "raid" }`, on a gate at the edge of `steal-a-plant`'s garden — the level
this feature was always for, and the one that corrected two of its calls on the
way past. `visit` is its own method on the port rather than an `ask`, because
`ask` and `view` are scoped to a room's topic and a raid has no room; it is
**optional**, because a host can arbitrate a match and have no worlds at all, and
a gate that says *there is nowhere to take anything from here* is better than one
that quietly does nothing.

**Not yet played in a browser, and the reason is the harness rather than the
raid.** `scripts/xp-raid.mjs` gets as far as a room that renders the level, an
arbiter whose view polls `200` with the right identity, and a locked pointer —
and no press ever fires, because a room built by inserting a `rooms_read_model`
row cannot **start a round** (the page says *Room not found*) and the simulation
waits for one. No `xp_visit` is ever attempted, which is the frozen loop and not
the port. The next attempt makes the room through the action rather than through
the projection; everything else in that fixture is reusable.

**The outcome writes back into the level's own field**, which is the one line
here that is not obvious and is not decoration. The store is last-write-wins per
row, so a client still holding the value from before the raid hands it back on
its next write — and the plant comes home an hour later. `roll` set the shape;
this needs it more, because a raid changes a number that this client did not
change itself.

**✅ And the hole this opened was in the store, not in the raid.** A victim in the
room when their shelf is raided holds the old number too — and `xp_store`'s `put`
merged into a client-side cache and wrote **the whole scope's row** back, so any
write to that scope restored every field in it, and the plant came home.

`20261112000000` makes a write touch only its own key: `xp_store_put`, an atomic
merge, `security invoker` so the table's own policies still decide who may write
what. Checked with the case it exists for — a raided shelf stays raided while its
owner saves an unrelated field in the same scope.

**Two writers of one key still race**, and that is deliberate rather than
missed: a level computing `mine + 1` from a stale number overwrites whatever
moved in between, and only a store that knows *add one* from *set to four* can
compose those. That is a change to §3.3's last-write-wins, worth making when a
game needs two people changing one counter at once — which a raid does not,
because it takes from somebody who is not there.

So §4 is now spent end to end: **secrecy** in the deal, **fairness** in the
arbitrated kill, and **integrity** in a plant that leaves one save and arrives in
another with nobody watching.

What it does not need is worth stating too, because each was a real candidate:
no new port (`arbiter` already means *ask for an outcome*), no token (production
signs with ES256 and there is nothing to sign with), no edge function, and no
scheduler.

---

## 5. Board and card games

**State:** splits in two, and not where it looks like it should.
**Size:** open-state games are small; card games are §4 plus a mode.

The instinct is that the hard part is turn-taking. It is not — a turn is a rules
block, and the verbs already sequence things. **The hard part is hidden
information**, which is why these split:

**Buildable now — Mensch ärgere Dich nicht, chess, checkers, backgammon.** No
hidden state; the board is open and every player may see all of it. The one
genuinely new requirement was small and specific: a seeded shared RNG, because
`Math.random` was removed from the sandbox on purpose (§10) — two clients running
the same rules over the same entities have to agree, and random is random.

**Built.** `world.random()`, `world.roll(6)`, `world.randomInt(a, b)` and
`world.pick(list)`, in `packages/xp/src/net/random.ts` and the prelude, seeded from
the room's topic and falling back to the document's id when there is nobody else
there. It is *not* the seeded stream this entry asked for: a value is
`hash(seed, tick, index)`, addressed rather than advanced, because a stream both
clients advance in step is exactly what a client joining mid-match cannot do —
its cursor starts at zero and it rolls differently for the rest of the game
without anything erroring. The index resets each tick, so a disagreement about
how many rolls a frame contained costs one frame instead of the match.
`world.time` set the precedent for how it is injected;
[manual.md](manual.md) has the author-facing half.

**And one of them is on disk.** `mensch.xp.json` — forty shared fields with one
numbering per colour, four seats, no walking, click to act — needed two things
this section had not thought of and neither was random: the `advance` verb,
because `teleport` names one mark statically and "three fields further on"
depends on where the piece is now, and a `point` mark kind, because every
existing kind already had a job and forty `spawn`s would have scattered the
players. → [task.md](../../task.md) §I.7e.

**Its dice is the arbiter's and not `world.roll`**, which is the distinction
this section did not have when it was written. A seeded stream is for *scenery*,
where everybody agreeing matters more than nobody predicting; a dice is the
opposite requirement, and a number every client can reproduce is a number every
client can re-roll until it likes the answer. Both exist and neither is a
substitute for the other. What `mensch` still does not have is a turn the table
keeps — §4.2's first item, and the one thing between it and being playable
between strangers.

**Poker is no longer blocked on §4. It is blocked on a *hand*.** The secrecy
shipped — one opaque value per player, dealt once, yours in full and everybody
else's as a count — and a hidden *role* is exactly one such value, which is why
`proto-bug` fit through the door that exists. A hand is several, drawn from a
pile and discarded to another, both of which outlive the deal and neither of
which `xp_arbiter_state` has a shape for. That is a rule the arbiter does not
have yet rather than infrastructure it lacks, and it is a smaller thing than
this entry has said for three revisions.

A third thing neither of those needs is worth naming: none of these games use
the character controller. A board game is a camera over a table and a turn
order, so it also wants §6's presentation work — the phone layout for a card
game is not five on-screen buttons.

---

