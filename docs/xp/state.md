# State that survives

Where a persistent XP's memory lives — what [xp-scenes.md](scenes.md) §3
already decided, and the four things it does not cover: a scope others may read
but not write, secret state, server ticks, and what a denied write does.

**The word *save* is retired here** — see the box in §7.7 for the three things
it used to name and what each is called instead.

Split out of [xp-backlog.md](backlog.md), which keeps the short entry and
the gating. Section numbers in cross-references are the backlog's unless stated
otherwise.

**What is built:** the table, `xp_store`, with `player` and `space` and not
`global` — [scenes.md](scenes.md) §3's S3 — and the `persistence` port over it
(`src/app/xp/_hosts/store.ts`), which is the first implementation of that port
that outlives a tab. Its four rules were checked against the running database
rather than assumed: an XP's owner reads no `player` row, a player reads their
own, a space member reads and writes the space's row while a stranger sees
nothing, and handing your row to another account is refused.

Three things the port decided, each written where it is made. A key names its
scope out loud — `player:coins`, never `coins` — because a default would guess
in the direction that cannot be taken back. A scope is one row and one fetch,
cached, because a `get` that reached the network could be called sixty times a
second; `put` merges and writes the whole blob, which is what §3.3's
last-write-wins already meant. And a host has a store **only for a saved
project**: a document under `public/xp/xps/` has a slug and no row, so the port
is null rather than a no-op, and `missingCapabilities` refuses a document that
needs what this host has not got.

**And the first caller: where you left off.** Not the sandbox — §7.8 is why: it
is synchronous, and a network write does not answer this frame. A checkpoint is
the right first thing instead, because it is one key in `player` scope and
because the rule for *when to use it* was a product decision rather than a
technical one, asked and answered:

> **A race and a match start everybody at the start. A room puts you back at
> your checkpoint.** A run that began three checkpoints in is not a run, and two
> sides beginning in different places because one of them played yesterday is
> not a match starting. `resumes` reads that off the document — `competition`,
> `match`, or a match preset means no — so the answer is the same for a player
> who has never been here and one who has.

**The stored value carries its scene**, though nothing writes that field yet:
a multi-scene level checkpointed in the third scene has to come back to the
third scene rather than to its coordinates in the first. Scenes are designed and
unbuilt (§0.2), and the field is in the shape now because the alternative is
migrating rows that belong to players, in projects we do not own, written by
documents somebody else wrote.

---

## 7. Persistent worlds

**State:** **decided: a persistent XP instance.** **Size:** a storage decision,
then not much.

An XP that stays up and remembers its state between visits — builds persist,
doors stay open, what happened happened.

**Where that state lives is largely answered already.**
[xp-scenes.md](scenes.md) §3 is the `persistence` port §11 declared and left
unimplemented, and it decided the hard parts: three scopes (`player`, `space`,
`global`), an `xp_store` row rather than the event log — *"a player's coin count
in somebody's arcade game"* has no audit value and folding a stream from the
beginning to answer it is the cost snapshotting exists to avoid — plus a
separate `append` for the outcomes that genuinely want history.

Read that before designing anything here. What follows is what it does **not**
cover.

### 7.1 A scope where others may read but not write

§3.1's table has three rows and, in every one of them, *read by* and *written by*
are the same population. There is no scope for state I own that others may see
and not change: my score on a shared board, my house in a shared town, my ghost
on a track, my nameplate.

**Built, as a third scope rather than a split column.** `shared` — yours to
write, read by every member of the space. The key says so where the author types
it (`shared:score`, never `player:score`), and that is the reason it is a scope
and not a flag: a flag makes "who may read this" something somebody can turn on
over data written when the answer was different, and there is no un-showing it.

The audience is the space's membership — the same population that can already
read the `space` row — so the new thing is not the audience but **ownership
within it**: one row per player, written by that player, read by all of them.
Writing is deliberately absent from the membership branch of the policies; a
member who could write another member's row would make this the `space` scope
with extra steps and a leaderboard anybody can edit. Checked against the running
database: another member reads it, cannot write it, still cannot read the
private row, and a stranger sees neither.

Two consequences worth keeping in view. **`get` still reads your own row**, so
reading everybody's is a separate call (`board`) that answers with rows rather
than a value — folding it into `get` would make the port's simplest call mean
two things depending on its key. And §3.2's stranger-readable rules — byte caps,
rate limits, **values are data never markup**, moderatable — are *not* fully due
yet, because a member is not a stranger: the byte ceiling already applies per
row, the overview already lists shared keys for moderation, and the rest becomes
due with `global`, which is still deliberately not in this table.

### 7.2 Secret state is not a save scope, and belongs to §4

*Readable only under a condition* — a hand of cards, a sealed bid, an unexplored
map, a variable loaded live that the client is not entitled to yet.

**This cannot be an `xp_store` row at all**, and the reason is the whole of §4: a
secret the client fetches is not a secret. §3's saves are fetched by the player's
own session, which is exactly right for `player` and exactly wrong for this. It
needs somewhere that decides *what this client may know* and sends only that —
which is §4's per-player view of state, named there as the genuinely new thing in
this codebase.

So it is listed here because it looks like a save, and it is **gated on §4**
rather than on this entry. Do not add a `secret` scope to the saves table; it
would be a scope whose guarantee the storage layer cannot keep.

### 7.3 Stateless rooms are the default, and should stay free

A room that uses none of this uses none of it. Same tri-state as §6's
presentation block, and worth stating for the same reason: **absent is the
common case and must cost nothing** — no row, no fetch, no latency, no privacy
surface. Every XP that exists today is one of these, and a persistence design
that makes them pay for a feature they do not use has picked the wrong default.

### 7.4 Server ticks — the world changing with nobody in it

Not storage. **Compute while no client is present**: crops grow, resources
respawn, a day passes, a market moves.

This is the genuinely new requirement in the entry, because everything else here
is a client acting and this is a world acting. Two things it collides with:

- **§3.3 is last-write-wins.** A tick writing the world while a player writes it
  is precisely where last-write-wins loses data — and unlike two players racing,
  this one happens on a schedule, so it will happen. Either the tick owns the
  fields it moves and players cannot write them, or the row stops being one
  blob. Decide before the first tick ships.
- **§9's ephemeral/durable split assumes a client.** A tick has no session, no
  presence and no realtime channel to be authoritative on — so its authority is
  `server` by construction, which makes this another customer of §4 rather than
  a separate mechanism.

Scope it small first: a tick that runs on a schedule and moves a bounded set of
declared fields is a cron and a reducer. A tick that runs arbitrary document
script server-side is a different project — it puts a stranger's QuickJS on our
compute with no player waiting on it, and the fuel ceiling that makes the
sandbox safe in a browser was sized against a frame, not against a night.

### 7.5 A space-level store — two readings, and one of them touches a boundary

Asked for as "a space overlook save space", and it resolves two ways. Confirm
which before building, because they are not the same size.

**Reading A — an overview. Built.** A space owner seeing
what is stored under their space: which XPs hold saves, how large, and when.
Small, useful, and mostly already required — §3.2 says a `global` store has to be
visible to the backoffice to be moderatable, and this is the owner-facing
version of the same window. The limit §3.4 sets is the whole shape of it: **an
XP's owner cannot read a `player` save.** An overview shows sizes and keys,
never contents.

`xp_store_overview` is that query, and it is a `security definer` function
rather than a select — deliberately, because the two ways of building this are
not equally safe. The table's policy already refuses an owner those rows, which
also refuses an aggregate over them; the alternative is a policy that lets an
owner read player rows plus a promise that the page will only show totals, which
is the arrangement that eventually shows them. So the function returns a count,
a byte total, a last-written timestamp, and field *names* for the space's own
row — never a player's, because "this game stores `lastMessage`" is a sentence
about somebody's play told to the person §3.4 says may not read it.

Checked against the running database: an owner sees `player rows=1 bytes=51
keys=∅` beside `space rows=1 bytes=65 keys={town,weather}`, and a member who is
not an owner or admin sees nothing at all.

**The screen is the project page**, as a *What players have saved* panel beside
Releases rather than a page of its own — the question "is my game keeping
something about the people who play it" is asked about one game, by the person
looking at that game. It states the limit in words rather than leaving it to be
inferred from an empty column: *you can see how much is stored and when it last
changed; you cannot read what is in a player's own save*. Fetched only for an
owner, because the function refuses everybody else anyway and a round trip whose
answer is always empty is one worth not making.

**Still open: clearing one.** That is a deletion, and what an owner may erase of
somebody else's progress is a question §3.4 points at without answering.

**Reading B — state that spans the XPs in a space.** §3.1's `space` scope is
*"one space, in one XP"* — scoped to both. A shared currency, a carried unlock,
or a hub that remembers what you did in the other three XPs needs the per-XP half
dropped.

**That is defensible inside a space and it is the exact boundary §3.1 drew on
purpose**, so it should be widened deliberately or not at all. The reason given
there is worth quoting because it is the whole argument: scoping to the XP is
*"the difference between a save system and a tracking surface that every game on
the platform can read."* One space is one owner and one membership, so a
space-wide scope does not hand a stranger's XP your history — but it does mean
an XP in that space can read what you did in another one, and members should be
able to know that. Widen to the space; never to the platform.

**Variables carry the same declaration.** "Keep the vars" — an XP saying whether
its variables stay space-wide or are reachable from outside it — is Reading B
seen from the document's side rather than the store's. That is the right place
for it: a scope the author *declares and can see*, not one inferred from which
API a script happened to call. One axis, one decision, stated once in the
document; §7.7 is how it gets shown to a player before they walk in.

### 7.6 Worked example: *Steal the Meme*

Visit somebody else's live world, take something, and it is in yours. Worth
writing down because it is the first ask that exercises every part of this entry
at once, and because it makes §4 concretely necessary rather than theoretically
so.

What it needs, in order of how obvious it is:

- **Their world, loaded as a place you enter.** Their save read by somebody who
  is not its owner — §7.1, and it drags §3.2's stranger-readable rules with it.
- **A write to a save you do not own**, which §7.1 does not cover. It gave
  *others may read, not write*; this is **others may write, but only through
  rules the owner's world defines**. That is not a scope at all — a client that
  can write another player's row can empty it. It is §4.
- **Two rows changing together.** Theirs goes down, yours goes up. §3.3 is
  last-write-wins per row, and last-write-wins across *two* rows means a steal
  that credits you and fails to debit them duplicates the item, while the
  reverse destroys it. **Neither failure is visible** — no error, just a
  wrong number somebody notices a week later. Atomicity across saves is a real
  requirement and jsonb blobs with last-write-wins do not have it.
- **The owner is usually offline.** So this is §7.4 as well: their world has to
  be actable-on with nobody in it, and any consequence (a cooldown, a refill, a
  notification waiting for them) happens without their client.
- **Fairness rules, which are not decoration.** Cooldowns, caps per visit,
  protection after being hit. Every game with this mechanic has them for the same
  reason: without them the strongest player farms the weakest until they leave.
  Those rules are only enforceable where the state is — server-side.

**So the third argument for §4 is integrity, not secrecy.** Poker needs it
because a client must not *see* something; this needs it because two people's
state must change together or not at all, and one of them is not there. That is
the harder guarantee, and it is the one a client-authoritative model cannot fake.

**§4 is built, and this is now the only thing left in it** —
[server-authority.md](server-authority.md) §4.3 scopes exactly this list against
what exists, and three of the items above get shorter for it. The steal is **two
rows in one table**, because `xp_store` is keyed by `(xp_id, scope, account_id)`
and this is one XP; the *write you do not own* needs no new redaction, because
the store's three scopes already say who may read what; and the fairness rules
have a structural home rather than a policy question, because a cooldown is a row
on the owner's store written by somebody who is not the owner and can only be
written inside the transaction. What is genuinely open is one question nothing in
this stack has answered: **may a database function read a published level?** It
is the only way a world with nobody in it enforces its own rules.

### 7.7 Declaring it — and the mechanism already exists

An XP should say what it does with state *before* somebody opens it: does it
save, does saving need an account, may outsiders visit, does its world move
while nobody is there. Shown on the browse page, so a player chooses knowing.

**The browse page exists** — another lane shipped `/t/[slug]/browse` with
project cards while this section was being written, so the flow that reads these
capabilities is real rather than hypothetical. Read it before designing the
disclosure; the card is where this lands.

**Built, and derived from `backend.needs` rather than from a new capability.**
That is the decision this section got wrong the first time, and
`capabilities.ts` supplies the argument against itself: *a capability is a claim
that gets checked*, and "this XP saves" is not checkable against a document —
the parser cannot see a script's future writes, so it would be the football tag
with no goals, discovered by the person whose progress went missing.
`backend.needs` is not a claim about the level, it is a requirement on the host,
and it already has teeth: `XpScene` refuses to open a level whose needs it
cannot meet. Reading the card's line off the same field means the disclosure
cannot say something the runtime disagrees with.

The words live in `describeNeed` beside the port, for the reason
`describeCapability` exists — *"Remembers what you do"*, not `persistence`, and
in one place rather than in a React component where a second phrasing would
drift. `needsOf` reads them out of the version document with a JSON path, the
way `playable.ts` already reads `rules` and `capabilities`: no projection
column, nothing to backfill, one query for the page, and a document written
before the block has none. A level that asks for nothing draws nothing, which is
§7.3 on the card.

> ✅ **Three different things were called a save. Decided: the word is retired.**
>
> | | Called | Where it lives | When it happens | Whose | State |
> |---|---|---|---|---|---|
> | The author's work in progress | **draft** | `localStorage`, per browser | Every edit, automatic | The author's, on this machine | **Exists** — `editor.tsx` |
> | The published document | **version** | Database, content-addressed | Explicit, versioned, publishable | The project's | **Landed**, other lane |
> | What a running game remembers | **the store** | `xp_store` | Runtime, while playing | The player's or the space's | §7, unbuilt |
>
> One word, three mechanisms, three owners, three lifetimes. This repo has
> already paid for this fix once and written down why: the Behaviour panel is
> not called Rules because *"two panels called Rules meaning different things is
> the kind of collision that is free to avoid now and permanent once somebody
> has learned the wrong one."*
>
> **So "save" names none of the three from here on.** Two of the words were
> already right and only had to be *said* rather than assumed; the third is the
> one that was about to be built, which is why it is the one that changes. The
> third row is the store, the table is `xp_store`, and the port's calls are
> `get` / `put` / `append` — which is what [host.ts](../../packages/xp/src/net/host.ts)
> named them before this argument started, without a `save` among them. The
> decision is mostly a matter of not undoing that.
>
> **And `saveToSpace` was never available anyway.** It is a live function in
> `src/app/ovaloffice/studio/hero-editor.tsx`, storing a rendered hero image into
> a space — a fourth meaning, in shipped code, for a name §7.8 proposed for a
> script call. Two panels called Rules is the cheap version of this mistake; the
> expensive version is a name an author learns in the sandbox and then meets
> doing something else in the backoffice. §7.8's call is `store.put`, with the
> scope as an argument, and the rest of that section is unchanged by the rename.
>
> **And the draft-to-version handshake was live code, not a future problem.**
> `editor.tsx` autosaves the draft on every edit and clears that key when a save
> succeeds, which is the join between rows one and two. Raising it turned up
> something worse than the "older content, no signal" this paragraph originally
> described, so the finding is recorded here rather than the question:
>
> **A stale draft could silently overwrite a newer version, and the guard the
> code believed it had did not cover it.** `/api/xp/[xpId]/save` computed
> `expected = project.currentVersion + 1` from its *own* row, so a save always
> landed as the newest version regardless of which version the person editing
> had on screen. Nothing in the request said what the edit was based on. Every
> piece needed to hit it is deliberate: the draft survives a closed tab by
> design, the editing claim expires after ninety seconds by design, and
> `restore()` layers the draft over whatever the page loaded without comparing
> them. Close a laptop on v5, let a colleague save v6 and v7, reopen: v5's
> content saves as v8, no error, nothing on screen.
>
> **Fixed by sending the base version with the save**, which turns it into the
> case the endpoint already handled well — a `base` behind `currentVersion` gets
> the same `savedElsewhere()` refusal as a primary-key conflict, one step
> earlier. Absent is treated as current, so an older client mid-deploy still
> works. `page.tsx` already had the number and already had the right comment
> beside it: it opens on `current` and not `published` because otherwise "the
> next save would silently revert two versions of work."
>
> **What is still open is the editor's half**, and it is a smaller thing now
> that the save cannot lose anything: a draft carries no record of the version
> it was based on, so the badge says `draft` where it could say the draft is
> older than what is on the server, and the refusal arrives at Save rather than
> at open. Worth doing; no longer urgent.

**[capabilities.ts](../../packages/xp/src/document/capabilities.ts) is that mechanism**, and
it already carries the two things that make it worth using rather than inventing
a tag list beside it:

- ***"A capability is a claim that gets checked."*** Not a label — every
  capability names what the world must actually contain, and
  `capabilityProblems` refuses the document at parse time otherwise. The reason
  is written there and it generalises exactly: an XP tagged `football` with no
  goals fails *at kickoff, in front of everybody*, as "the game is broken"
  rather than in the editor as "this level was never finished." A state
  disclosure that is merely claimed fails the same way, later, and about
  somebody's data.
- **Two directions, already separated.** `backend.needs` points *down* — what an
  XP asks of what it is plugged into, *"an identity, a channel, somewhere to
  write a score."* Capabilities point *up* — what the product may do with it.

**`backend` now exists, and the down direction refuses.** It was a field named
in `host.ts`'s comments and in this section for weeks while no document could
declare it, so `missingCapabilities` was a refusal nothing could reach. The
block is `needs` and `wants`: a missing need stops the level opening, a missing
want lets it open with less, and the runtime says which — `XpScene` compares
what the screen actually offers against `needs` and renders a whole refusal
screen rather than a line on the HUD, for the same reason the editor's
*Open somewhere else* is a whole screen. A loaded 3D scene looks exactly like a
working one until the missing thing is reached, and finding out then is finding
out after the play.

The honest limit today: that screen offers `identity` when somebody is signed in
and `network` and `arbiter` when there is a room, and **no persistence at all** —
`xpStore` is wired into `realtimeHost`, which nothing mounts. So a document
needing a store is refused rather than opened, which is the right answer while
that is true and a wiring job to change.

**That split decides where each half of this goes**, and it is not the obvious
placement:

| Ask | Where | Why |
|---|---|---|
| Saving requires a real account; guests visit read-only | `backend.needs` | It is a requirement the XP places on its host, not a use the product makes of it |
| Open to outside visitors | Capability | A flow — the browse page — reads it to decide what to offer |
| World ticks with nobody in it (§7.4) | Both | Needs a scheduler from the host; and a visitor deserves to know before entering |
| Variables space-wide vs outside-reachable (§7.5) | `backend.needs` | The scope it asks the host to enforce |

**The guest/account line is a good boundary and worth taking for its own sake.**
It bounds §3.4's privacy surface and §3.2's abuse surface in one stroke — a
stranger with no account writes nothing persistent, so there is no personal data
to sweep and no anonymous write path to rate-limit. Read-only visiting is also
exactly what §7.6 wants for the half where you are in somebody else's world.

Two things to honour when adding to `CAPABILITIES`:

- The module's own bar: *"a capability is worth adding when there is a flow that
  would read it — not when a game mode exists."* The browse page is such a flow,
  so these qualify. A capability nothing reads is a tag with extra steps.
- **`describeCapability` already exists**, which means the browse-page half is
  mostly there — the disclosure strings have a home rather than being written
  into a React component.

And the one that has to be checked rather than trusted: an XP declaring it needs
no identity while writing `player` saves must be refused at parse time. That is
the football-without-goals rule applied to state, and it is the whole reason to
put this in `capabilities.ts` instead of next to it.

**Per-action gating, as the complement rather than the alternative.** Rather
than an XP being wholly open or wholly account-only, an individual action can
require an account assigned to a space — walk around and look freely, but
stealing needs membership. That is finer and better: it lets a guest see enough
of a world to want an account, which whole-XP gating does not.

It reuses a boundary that already exists — §3.1's `space` scope is *"every
member of the space"*, so "an account assigned to a space" is a membership test
the platform can already answer, not a new concept.

Two rules for it, both learned here already:

- **Disclose and gate; do not gate instead of disclosing.** The capability above
  says what the world does before you enter; this says no at the moment you
  reach. Doing only the second is a trapdoor — the player learns the rule by
  hitting it. Doing only the first is a promise nothing enforces.
- **A denied action should be visibly unavailable before it is clicked**, and
  when it does fail, the error has to be visible *in play*. §9 says this
  outright — errors in a mode system must surface *"somewhere that is visible
  during play, not in a panel that closes at kickoff"* — and this repo has
  already shipped that bug once, in the battle lobby, where the failure rendered
  into a panel nobody could see once the match had started.

### 7.8 What `store.put` does when there is no account

Asked for as `saveToSpace`; renamed by the box above, which also says why the
old name was not free to take.

The proposal: a script calls it, the user has no account, the session is
interrupted and told an account is needed — surfaced through `log`.

The interrupt half is sound and the machinery exists. §10 makes a point of it:
the QuickJS sandbox *"can be interrupted — `while (true) {}` is cut off after a
fixed number of operations"*, which is one of the three reasons it beat the Web
Worker plan. Cutting a script at a call is strictly easier than cutting a loop.

Three things to get right, and the first one changes the design:

**The answer is known before the script runs.** Whether this player has an
account is true at session start, not discovered at the moment of the call. So
interrupting *at* `store.put` is the latest possible moment to find out, and
it is exactly the trapdoor the rule above warns against — the player learns the
requirement by losing progress to it. The disclosure in §7.7 is the mechanism;
a guest entering an XP whose `backend.needs` includes an identity should be told
at the door, and enter read-only knowingly. **Runtime denial is the backstop for
when that was got wrong, not the way people are meant to find out.**

**It returns a result — and the two failure classes are not the same thing.**
The call should hand something back so an author can react and stop. But *no
account* and *the save failed* deserve different treatment, and collapsing them
loses the useful half:

| | Nature | What a script can do | Shape |
|---|---|---|---|
| **No account** | A permission fact, true since before the script ran, never becomes true mid-session | Nothing — no retry, no fallback | Interrupt |
| **Save failed** | Operational: offline, rate-limited, over quota, conflicting write | Retry, fall back, tell the player, take a different branch | A returned result |

So: a result for what an author can act on, an interrupt for what they cannot.
An author checking the result and returning early is exactly the interrupt they
asked for, chosen rather than imposed.

**But a returned result is one an author can simply not check**, which is easier
to ignore than an exception, not harder. So the player-visible message in the
next paragraph is emitted by the *runtime*, not by the script — otherwise a
missing `if` means the world carries on showing state that was never persisted
while the player watched it work.

**And the sandbox is synchronous, which bounds what the result can say.** That
is not incidental: §10 chose QuickJS over a Web Worker precisely because *"a
sandbox that answers next frame answers too late"* for most of what a script
decides. A network write does not answer this frame either. So a synchronous
result can only carry what is knowable synchronously — refused locally (no
account, over quota, malformed), or accepted for writing. It **cannot** mean the
server stored it, and it must not be named as though it does. Durable
confirmation arrives later, and §9's known trap governs it: a result latched
before the server confirms is a result you can lose, so anything showing as
saved shows as pending until the write returns.

**Built, and the split is in the HUD rather than only in the argument.** The
runtime carries two lists: `broken` for scripts the author wrote and can fix,
and `troubles` for the host failing to do what the level asked. They are drawn
in the same corner, while playing, and separately — because counting them
together put *"could not save that checkpoint"* under a heading reading
`script failures`, which sends an author to read their scripts about somebody
else's network. The no-account case says the thing a player can act on —
*this level saves your progress, sign in to keep it* — rather than the thing
the code knows.

**`log` is the author's channel, not the player's.** `log` is in the sandbox
scope beside `self`, `world` and `getEntityByName` — it is for whoever wrote the
script, reading the Scripts panel. A player does not see it. So *"via log"* is
right for half the job and cannot be the whole of it: the author gets a log line
saying which call was denied and why, and the player gets something visible in
play saying an account is needed, with the way to get one. Both, or the failure
is invisible to exactly the person it happened to.

If a denial should also be *recorded* — as opposed to shown — that is `append`
on the persistence port rather than `put`, and §3.3 is deliberate that the two
are different calls so recording forever is a thing an author chooses.

Note what this is *not*. §16.2 says to assume the lounge and XP never converge,
and *"two engines that have drifted for six months do not merge back."* A
persistent XP world resembles the lounge and must not become an argument for
merging them — if the XP engine turns out to be strictly better, §16.2 already
says the honest move is a deliberate rewrite decided on evidence, not a gradual
convergence that happens because one feature made them look similar.

---


### 7.9 Growing things — five hours later, without a tick

*Plant something and come back in five hours to a grown plant* (Roblox's **Grow
a Garden** is the shape people have in mind). Farms, cooldowns, refills,
respawning ore, a market that drifts, a day that passes. It reads as the
strongest possible argument for §7.4's server ticks, and it is very nearly the
opposite.

**Nothing ticks. Store the moment, derive the state on read.** A crop keeps
`planted_at`, not `progress`; how grown it is, is a pure function of `now -
planted_at`, computed when somebody looks at it. No job, no schedule, no drift,
nothing running while nobody is there — and a five-hour crop costs exactly the
same as a five-second one, which is not true of anything that ticks.

That also dissolves §7.4's collision rather than solving it: last-write-wins
between a tick and a player is only a problem when there *is* a writer on a
schedule. One that computes instead of writing has no race to lose.

**The clock has to be the server's, and that is the whole of §4's involvement.**
`planted_at` comes from `now()` inside the arbiter, never from the client, and
the ripeness check happens there too. A client that supplies its own timestamps
is a client that plants in the past and harvests immediately — and it is the
first thing anybody tries. This makes growing the *cheapest* customer §4 has:
one timestamp column and one comparison, no secret and no second row.

**What genuinely cannot be derived** — the short list, and the only reason to
build a scheduler at all:

| | |
|---|---|
| **It must happen at the moment, not when next observed** | "Your crop is ready" as a notification, an auction that closes, a leaderboard that has to be right at midnight. Deriving gives the right answer *late*, and late is wrong for all three. |
| **Evolution that is not a function of time** | Usually a mirage. "A random event every hour" *is* derivable once the randomness is addressed by the clock rather than rolled — `hash(seed, hour)`, which is exactly what `world.random` already does with `(seed, tick, index)`. Reach for that before reaching for a ticker. |
| **Two absent people interacting** | Your crop withers because somebody else's goat reached it. Nobody is present and the outcome depends on an ordering, which is §7.6 — arbitrated at the moment of the *action*, still not on a tick. |
| **Anything that compounds without a cap** | Offline production accumulating for a month hands the returning player a number nobody designed. The cap belongs in the derivation, and a derivation is where it is cheap to put. |

**The one real format ask, and it is not the obvious one.** A script cannot read
this clock. `Date` is deleted from the sandbox and `Math.random` throws, both
because two clients have to agree — and wall-clock elapsed is precisely the kind
of number they would disagree about. `world.time` is no help either: it is the
match clock, seconds since *this* instance started, and a plant does not care
when you opened the tab.

So what a script gets is a **value, not a clock**: the store hands over elapsed
seconds already computed by whoever knew the moment, the same way `world.time`
is injected rather than read. `world.since(moment)` reading a real clock would
put non-determinism back into the sandbox through the one door left open, and it
would be the second time somebody has to find out why that door is shut.
