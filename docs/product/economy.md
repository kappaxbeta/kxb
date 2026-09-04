# The economy

Coins, and everything that now costs them.

This is the document to read before touching `src/domain/bank/`,
`src/domain/homestead/events.ts`, or any path that charges for something. It
sits beside `docs/product/pricing.md`, and the split between the two is the
first thing to get right:

Two companion documents, and the split is worth knowing before you go looking:
`docs/operations/economy.md` is every switch an operator holds, and
`docs/product/manual.md` §5 is what a space owner or a player can change. This
one is the *argument* — why each of those works the way it does.

> **Pricing is money. The economy is coins.** Euros buy a *tier*, and a tier is
> a standing allowance. Coins are earned by playing and buy *one more of a
> thing* on top of that allowance. Nothing here is ever charged in euros, and no
> amount of coins moves a space between tiers.

That boundary is load-bearing. The moment a coin can be bought for a euro this
document becomes a payments document, with everything that implies about
refunds, chargebacks, VAT and minors. It cannot be, so it is written down here
as a rule rather than left as an accident of what nobody has built yet.

---

## 1. There is one coin

The coin already exists. It is the café's, it lives in `homestead_read_model`,
and `events.ts` in that folder already made the argument for why a second one
would be a mistake:

> Because there is one lot of play money in this product and a second would be
> a second economy: two balances, two places to earn, and the immediate question
> of whether they exchange.

Everything below spends *that* coin. A shift in the restaurant, a won battle
and an extra blueprint are priced against each other on purpose — "an extra
blueprint costs about three good shifts" is a sentence a player can reason
about, and it is only true because there is one number.

The consequence worth stating: **the café is now the mint.** It was a toy with
its own scoreboard, and it is now the thing that pays for the rest of the
product. Section 11 is about what that means for anyone trying to break it.

---

## 2. The switch that turns all of this on

**`economy` is a feature flag, off by default.**

Off, nothing charges anybody and nothing pays out: battles are free to enter and
pay nothing, doors take no toll, needs cost nothing, and a quota is whatever the
tier says with no way to buy past it. Coins already in a purse stay there and
the café keeps paying them — that predates all of this, and switching the
economy off must not take somebody's savings with it.

It falls back **off**, against the habit of most flags in this product, and the
reason is the same one `pictures` gives: the safe failure is *not to charge*. A
resolver hiccup that briefly makes battles free costs nothing anybody notices. A
resolver hiccup that takes a coin off every player is a refund conversation with
no refund mechanism behind it.

It is also what makes shipping this safe. A space that has never heard of coins
does not start taking them from its members because a deploy went out. A space
opts in, by an operator adding a tenant override.

---

## 3. Three accounts

**The purse** — one per member per space. Already built, already event-sourced,
already protected by a single-stream invariant that makes "you cannot spend what
you do not have" actually true rather than aspirational. Its stream is the
homestead's, derived from `(tenant, user)`.

**The bank** — one per space. Owners spend it; house rules and door charges feed
it; loans come out of it.

**The wallet** — one per *account*, across every space. This is the balance you
still have when you leave a space, and the one the tenant page shows you.

### 3.1 Coins leave a space through one door, and it can be shut

A purse can be withdrawn into the wallet, and the wallet can be deposited back
into a purse. **Both are refused when that space's `economy` flag is off.**

That rule is the reason the wallet is safe to have at all. A space with the
economy switched off is one where nothing is metered and the café still mints —
so its coins are, correctly, play money that does not count. Letting them out
would make the wallet worth exactly as much as the laxest space anybody can
create, which is nothing.

So: **coins earned where the rules do not apply stay where they were earned.**

### 3.2 What this does not solve

The gate stops an *off* space leaking. It does not stop a *lax* one: a space
with the economy on, a generous café and no charges is still a cheaper place to
earn than a strict one, and its coins withdraw at par.

That is a real hole and it is left open deliberately rather than patched with a
number nobody has thought about. The honest fixes are all product decisions — a
withdrawal fee, a cooling-off period, a per-space earning cap, or operator
review of spaces whose `taken` looks nothing like their play. §14 carries it as
an open question, and §13's backoffice view is what would let somebody see it
happening before deciding.

---

## 4. Why the purse stays where it is

**The purse** — one per member per space. Already built, already event-sourced,
already protected by a single-stream invariant that makes "you cannot spend what
you do not have" actually true rather than aspirational. Its stream is the
homestead's, derived from `(tenant, user)`.

**The bank** — one per space. New. Owners spend it; house rules feed it; loans
come out of it.

Both are *per space*. A player who belongs to two spaces has two purses and no
way to move coins between them, and that is deliberate rather than unfinished:
a space's economy is tuned by its owner through house rules and prices, and a
coin that could be earned in a lax space and spent in a strict one would make
every owner's settings advisory. It also matches every other read model in this
app, which is tenant-scoped to the last row.

The rail says "Bank" and shows the purse, because to a player standing in a
space "my coins here" is the only balance they think about. The space's own
balance is on the space's settings, where the people who can spend it are.

### 4.1 Why the purse does not move out of the homestead stream

It is tempting to lift the purse into a `bank` aggregate of its own now that
five other features spend from it. It should not move, for one reason: the
single-stream invariant. `coins` is folded from the homestead stream, and
optimistic concurrency on that stream is the only thing standing between two
simultaneous purchases and a balance that goes negative. Moving it means
re-deriving every balance in production from a log that was never written for
the new derivation.

So `src/domain/bank/` is a **front door, not a new home**. It owns the reasons
money moves and the guard on each one; the coins stay where they are.

---

## 5. Where coins come from, and where they go

Every movement carries a `reason`, and the set of reasons is closed. That is
what makes section 10's backoffice view possible at all: a balance that only
goes up and down explains nothing, and "where did this space's coins come from"
is the exact question an operator asks when they suspect somebody is printing
them.

| reason | direction | from → to |
|---|---|---|
| `served` | earned | mint → purse (a café shift) |
| `battle-stake` | spent | purse → the level owner's purse |
| `battle-win` | earned | mint → purse |
| `battle-kill` | earned | mint → purse |
| `battle-loss` | spent | purse → mint |
| `revive` | spent | purse → mint |
| `needs` | spent | purse → the space's bank |
| `quota` | spent | purse → mint |
| `remix` | spent | purse → the original owner's purse (split) |
| `submission` | spent | purse → mint |
| `accepted` | earned | mint → purse |
| `transfer` | either | purse ↔ purse |
| `bank-grant` | either | bank ↔ purse |
| `loan` | earned | bank → purse |
| `voucher` | earned | mint → purse |

"mint" means created or destroyed. Those rows are the ones that change the total
number of coins in the world, and there are deliberately few of them.

---
## 6. The loop: what mints, and what drains

Read this before changing any number in §8 or §11.

**A won match creates coins on purpose.** A two-player round pays the winner 10
and takes 3 from the loser, so 7 coins come into the world that were not there
before. That is not a leak in the design; it *is* the design. Battle is the
faucet.

**And the café has to be reachable.** It stopped being a game a space might
happen to have the moment it became the mint, so it has an address of its own
again — `/t/<slug>/cafe` — rather than living only inside the homestead
cartridge. That route was removed on purpose when the homestead became one
world entered from a shelf, which was right for what the café *was*; a space
without that cartridge then had no way to earn at all, and every "go and earn"
in the product pointed at nothing. **Infrastructure cannot live on a shelf.**

**Needs are the drain.** A healing drink costs about 2 coins. Food costs
something. Those prices are set by the space's owner on a blueprint, and the
coins go to the space's bank rather than being destroyed (§11). So the round you
won pays for the drink that keeps you standing in the next one, and the owner
who priced the drink is holding the takings.

**You start with 100.** The café's own `initialState()` carries 120, and that is
a *tutorial* number — the smallest layout that can complete an order, with
enough left to buy the second thing you will want. It was right while the café
was a self-contained game whose coins bought café furniture.

It is the wrong source now, because the opening balance is a position in an
economy: it pays stakes, tolls, revives and quota extras. So the economy names
it (`OPENING_COINS`) and the café keeps its own for the standalone game. A round
hundred is a hundred battle stakes, fifty healing drinks, or a third of a
submission — enough to find out what things cost, not enough to skip earning any.

That is the whole motivation structure, and it is worth stating as a rule
because every price on this page is downstream of it:

> **You win coins so that there is something to spend them on.** A battle that
> paid nothing would make winning ceremonial. A drink that cost nothing would
> make winning pointless. The gap between 7 a round and 2 a drink is the game.

### 6.1 The loop only closes if both halves are on

`battle` and the needs a space switches on are **separate controls**, and the
economy is a third. Nothing makes them agree, which means the combination that
matters is easy to reach by accident:

| battle | needs | what happens |
|---|---|---|
| on | on | the loop, as designed |
| on | off | **a faucet with no drain** — coins accumulate and buy nothing |
| off | on | a drain with no faucet — the café is the only income |
| off | off | no economy worth the name |

The second row is the one to watch. It is not an exploit and nobody is cheating;
it is a space that switched battle on and never priced anything, and the symptom
is quiet — balances climbing with nowhere to go, and a leaderboard that measures
attendance rather than play.

§13's money view should make it visible: a space whose battle payouts climb while
its bank takes nothing is a space with the drain missing.

### 6.2 Where the coins can actually escape

Minted coins are harmless while they stay in the space that minted them — they
are scorekeeping with a shop attached. The place to be careful is the **door out
to the wallet** (§3.1), because that is where a space's play money becomes an
account's balance everywhere.

The `economy` flag already shuts that door for a space that is not playing by
the rules. What it does not do is meter a space that *is*: a space running
battles with no drain still withdraws at par. That is the open question in §14,
and it is a question about the door rather than about the faucet.

---

## 7. Battle

| | coins |
|---|---|
| entering a battle | **−1**, paid to the owner of the level |
| winning | **+10** |
| a kill | **+1** |
| losing | **−3** |
| reviving | **−1** |

The stake is the only one that is not minted: it moves from the player to
whoever owns the XP being played. That is the whole point of it — it is the
first time authoring a level pays, and it pays per play rather than per sale.

**A level's owner never pays their own stake.** Charging it and refunding it
nets to zero and writes two events; the owner is simply not charged.

**Where the numbers are read from.** From the server, never from the client.
The runtime tells the server *what happened* — a battle started, somebody was
defeated, a battle ended — and it already does: `BattleStarted`,
`PlayerDefeated` and `BattleEnded` are events on the battle stream with a
decider behind them. The prices are constants in `src/domain/bank/prices.ts`,
and no browser-facing schema accepts an amount. This is the same rule
`homestead/events.ts` already states about `cost`, and it is the rule that stops
a modified client from paying itself ten thousand coins for losing.

### 7.1 A match pays out once, and the game is authoritative

Two rules that only became visible once this was built.

**Payouts are claimed before they are made.** Battle settlement follows
`creditWorld`'s shape — asked after *every* command rather than in each of the
four actions that can end a match, because "did that end it" is a question about
the match and not about which button was pressed. That shape is right, and it
means the check runs again on the next command. Crediting a world twice sets a
flag that was already set; paying a winner twice creates ten coins out of
somebody clicking "rematch". So the first caller to insert a row in
`battle_payouts` does the paying and everybody after it does nothing.

A defeat needs no claim, and the difference is worth knowing: it is settled from
the event that was *just appended*, not from the read model.
`battle_participants.defeated` is true after the first knockout and stays true,
so settling off it would fine the same player again on every later command. The
decider writes at most one `PlayerDefeated` per player per match, so the append
is exactly-once by construction.

**Money never decides the match.** Every charge happens after the event that
caused it has already been accepted, and a failed charge does not undo a defeat
or stop a battle starting. The alternative — refusing to record a knockout
because a purse was busy — would let the economy corrupt the game it decorates,
and the player would experience it as the match freezing. A coin that failed to
move is a line in a log; a match that cannot record a defeat is unplayable.

### 7.2 Breaking something that had health

A thing with a `fight` block is a target, and knocking one over in battle mode
pays a coin — the way a knockout does.

The obvious version of that is a coin printer, and it is worth spelling out why:
**a blueprint's price may be zero.** So *summon a free crate, smash it, take a
coin* would be a loop with no cost, no second player, and no match length to
slow it down — strictly worse than the win/loss pair, which at least needs
somebody else in the room.

The rule is arithmetic rather than policing:

> A thing pays **only if it cost more to summon than the kill pays.**

Summoning a 2-coin crate to earn 1 is a coin lost, every time. Free scenery pays
nothing, which is also the right answer for a room of decorative barrels. Same
shape as a knockout paying less than a defeat costs, and for the same reason:
nothing has to detect a farm.

**Who gets it.** The connection that dealt the biggest hit in the frame that
finished it — biggest rather than last, because the order of claims within a
frame is the order packets happened to arrive, which is different on every
machine. A break nobody claimed pays nobody; crediting the driver would mean a
thing paid its own owner for being smashed by a guest.

The driver names the winner in its pulse and the named client claims the coin —
exactly the handover `Pulse.gave` already makes for taking an item off a table,
and for the same reason: the only client that knows a thing reached zero is not
the one who earned something for it.

### 7.3 Paying on a field nobody trusts

`PlayerDefeated.by` is what the victim *believes* finished them. The event's own
note says it is recorded and not trusted — it decides whose name is on a kill
feed, never who wins. Paying a coin on it looks like exactly the mistake that
turns an untrusted field into a thing worth lying about.

What makes it safe is arithmetic, not authority: **a kill pays less than a loss
costs.** Reporting your own defeat and naming a friend moves 1 coin to them and
takes 3 from you; two players colluding are down 2 a round. There is no version
of that which prints coins, so no check is needed to stop it.

That is a constraint on the *prices* rather than on the code, and it is pinned
in `prices.test.ts`. If a kill ever pays more than a loss costs, this becomes a
mint and the field would have to be believed — which it cannot be.

### 7.4 A revive is charged with the defeat

Not from the runtime. Respawning is a *client-side* event — the scene puts you
back on your feet in a frame, with no server round trip near it. Adding one
would mean a server action fired from inside a live canvas, which tears the
React tree down and takes the scene with it.

So in a match with respawn on, being defeated *is* getting back up, and the two
are charged together from the event that already crosses the wire. The
consequence, stated rather than hidden: somebody knocked out four times in a
respawning match pays the revive once, because the decider records one defeat
per player per match. That is a cheaper economy than the table implies, and it
is the right trade — the alternative is a purchase on the hot path.

### 7.5 Going broke

You cannot be charged into a negative balance, so a player at zero who loses
owes three coins that cannot be taken. Two ways out, and both were asked for:

- **A loan from the owner.** The space's bank lends. It is an owner-configured
  amount out of a real balance, so a space that has not banked anything cannot
  lend, and that is correct — it is a real account, not a switch.
- **A voucher**, behind a **valued flag** that is off by default — and the
  amount is the operator's, not a constant. The brief named 10,000, which is a
  hundred times the opening balance: somebody holding one has no reason to care
  what anything costs for a long while, and every price on this page flattens
  while they spend it. That is right for a space running an event and wrong for
  one running an economy, so it is a number per space rather than a number in
  code.

  Claimable **once per space**, and only with a purse of **exactly zero** — a
  voucher is for somebody who cannot play, not a bonus for somebody who can. A
  threshold would be a number nobody could justify, and a player on 3 coins can
  still enter three battles. The claim row is written *before* the coins, like a
  door toll and for the same reason: what is being protected is not a purchase
  but not handing out two.

  With the flag off, the café is the answer — which is why it now has an address
  of its own (§6) and always works.

A debt is **not** carried. A player at zero who loses is charged what they have
and no more, and the shortfall is dropped. The alternative is a negative balance
that has to be paid off before the game becomes fun again, which turns a bad
round into a punishment that lasts. Recording the shortfall in the event keeps
the fact without keeping the debt.

---

## 8. Quotas that coins can lift

The tier gives an allowance. Beyond it, one more costs coins — paid by whoever
is creating the thing, out of their own purse.

**The visibility counters replace `projects`.** Today `TierLimits.projects` is
"XPs this space may edit", one number regardless of who can see it. It becomes
three, because the spec prices them differently and because the three are
already distinguishable in the read model without a new column:

- **private** — `space_policy = 'none'`. Yours, plus anyone you named.
- **team** — `space_policy` is `view` or `edit`. The space can see it.
- **public** — `state = 'published'`. In the catalogue.

### 8.1 A new project's visibility follows the tier

Wiring the counters up surfaced a conflict between two things each right on
their own. A project is **private until its owner says otherwise** — `XpCreated`
records no policy, and that is the safe direction. Free holds **zero** private
projects. Together those say a free space may never create anything, which is
not a plan.

The missing sentence: **on a tier that holds no private projects, a new one is
team-visible.** Free keeps working exactly as it did, its wall stays where it
always was, and "zero private" means what it says — you cannot *hide* one here —
rather than "you cannot make one".

### 8.2 XPs

| | free | xo | xp |
|---|---|---|---|
| private | 0 | 10 | 100 |
| · one more | — | 200 | 50 |
| team | 1 † | 3 † | unlimited |
| · one more | † | † | — |
| public | 10 | 100 | unlimited |
| · one more | 100 | 50 | — |

† **Inferred, not specified.** The brief named team XPs only for the xp tier
("unlimited team xp"). Free and xo keep today's `projects` number so nothing
regresses for a space that already has one. The price of an extra team XP was
never stated and is left unpurchasable rather than invented.

Free holding zero private XPs is not an oversight — it is the tier's story:
**free is public by default, and paying buys privacy.** Worth saying out loud
because it reads as a bug in a table.

Note that on free and xo, public XPs are *cheaper* to exceed than private ones.
That is the right way round: a published level is content the platform wants,
and a private one is storage nobody else benefits from.

### 8.3 Blueprints

| | free | xo | xp |
|---|---|---|---|
| included | 3 | 30 | 100 |
| one more | 60 | 30 | 30 |

### 8.4 Clips

| | free | xo | xp |
|---|---|---|---|
| included | 5 | 20 | 100 |
| one more | 1,000 | 200 | 50 |

### 8.5 Vehicles

No allowance on any tier. Each one costs **10,000** on xp, **20,000** on xo and
**50,000** on free.

Two orders of magnitude above everything else on this page, and priced *upward*
as the tier gets cheaper — a free space pays five times what an xp space does.
Both are deliberate. A vehicle is the most expensive thing in the runtime to
build and the most expensive to have moving in a room, so the price is a real
signal rather than a paywall, and the inversion says the same thing the tiers
already say: this is what you are buying when you pay.

### 8.6 Rooms

| | free | xo | xp |
|---|---|---|---|
| included | 5 | 20 | 30 |
| one more | 500 | 250 | 100 |

**The prices are inferred.** A room was named as purchasable without a number,
so these are placed where a room belongs rather than invented freely: dearer
than a blueprint, because a room is capacity on a shared box and a blueprint is
a row; far cheaper than a vehicle, because a room is what a group needs in order
to have two conversations, and pricing that out of reach is how a space stops
growing.

Selling rooms cuts against an argument this codebase already makes.
`rooms/capacity.ts` says a room cap is a real limit on a real box rather than a
paywall, and a box does not get bigger for coins. That is still true. What makes
selling them safe is the third rung: `xo_place_limit` is a *platform ceiling*
and `resolveLimit` applies it last, so coins can lift a space above its tier and
still cannot lift it above what the installation will tolerate.

The practical consequence, worth checking before a busy release: thirty bought
rooms are thirty realtime channels, and the only thing in front of that is a
ceiling flag nobody has switched on yet.

### 8.7 Menus

Free on every tier, uncapped. An emote menu is one row per space
(`emote-tree-is-one-document`), so there is nothing here to meter.

### 8.8 The rule about what a purchase buys

**What was bought is added, not maxed — and it is still clamped by the ceiling.**
`resolveLimit` has four rungs now: `min(max(tier, override) + bought, ceiling)`.
An override is somebody saying what the cap *is*; a purchase buys one *more*, so
maxing them would make a second blueprint do nothing on a tier that already
included three — a charge for nothing.

The ceiling still applies last, which means **a space can buy more than the
installation will serve and not get it.** That is ugly and it is the right way
round: the alternative is coins that can overwhelm a box, which is a capacity
incident rather than a billing complaint. Anything selling a limit with a
ceiling near it should check what remains before taking the money — §8.6's rooms
are exactly this case.

**A purchase is permanent and belongs to the space, not to the buyer.** Somebody
who buys an eleventh blueprint and then leaves does not take the slot with them,
and a space that downgrades keeps what it paid for. The alternative — slots that
evaporate on a tier change — turns every downgrade into a deletion, which
`pricing.md` §7 already refused for exactly the same reason.

---

## 9. What a level costs

An owner puts two prices on their own level, in one panel of the editor:

- **`once`** — what it costs to *play* it, paid a single time.
- **`remix`** — what it costs to *take a copy and change it*.

Both are `0` by default and either can be charged without the other. A level
that is free to play and costs coins to fork is an ordinary thing to want, and
so is the reverse.

### 9.1 A one-time price replaces the stake

A level with `once` set is **bought, not rented**. The first entry charges it to
the owner, and every entry after that is free — *including* the 1-coin per-play
stake every other level takes.

The two models are exclusive on purpose. Being charged a toll on something you
have already bought is how people stop trusting a price, and a product that does
it once will not be believed about the next thing it sells.

Whether somebody has paid is a row in `xp_purchases`, keyed by **account and
level, not by space**: what was bought is the level, and being asked again
because you walked into a different room is the same broken promise in a
different costume.

The receipt is written *after* the coins move. Written first, a failed payment
would hand somebody the level for nothing, with no second chance to charge them
— the row would already say they had paid.

### 9.2 Splitting what it pays

The split is percentual and goes to named accounts. It exists because levels are
already made by more than one person — a world by one, the scripts by another —
and a single payee would mean that arrangement lives in a private message
instead of in the product.

**Shares need not add to 100, and cannot exceed it.** Whatever is unallocated
stays with the owner, so a price with no split is entirely theirs without needing
a row that says so. The ceiling is the load-bearing half: paying out more than
arrived is minting dressed up as a collaboration, and it would be silent,
because each share on its own looks perfectly reasonable.

There is deliberately no rule forcing the shares to total 100. A level whose
owner has given away every point is a level they are paid nothing for — a
mistake rather than a configuration, and the product should not make it easier
to commit by treating it as the tidy case.

---

## 10. Submitting to the catalogue

Submitting costs **300**. Acceptance pays **1,000 or more**, at the reviewer's
discretion.

The fee is a spam control, not a revenue line, and its size is the argument: 300
is a real cost against a queue a human reads, and it is roughly one accepted
submission in three before the fee has paid for itself. **A rejected submission
does not refund**, which is the entire mechanism — a refund on rejection makes
submitting free and the queue unbounded again.

The reward has a floor and no ceiling because "this is good" and "this is
extraordinary" should not pay the same, and only a person can tell the
difference. The amount is recorded on the acceptance so the backoffice can show
who paid what to whom.

---

## 11. House rules and space rules

Two levels, and they are not the same control.

**Space rules** are the owner's, and they are about *needs*. **Two switches, not
one**, and both off by default:

- **`hunger`** — does anybody get hungry here at all?
- **`charged`** — do the things that answer a need cost coins?

They come apart deliberately. A space can run hunger as a pure survival
mechanic with free food — a pressure on attention rather than on a purse — which
is a real thing to want, and especially for a space whose players have no coins
yet. The reverse combination is not expressible and should not be: charging for
food where nobody gets hungry is a shop selling nothing.

`charged` is recorded even while `hunger` is off, where it does nothing.
Normalising it away would mean switching hunger back on lands the space on a
default rather than on the arrangement its owner last chose — a small betrayal
that only shows up months later.

**Owners only**, a step up from the switches beside it, which admins may also
touch. This one makes playing here cost money and can make a player who cannot
pay unable to keep playing; that is a decision about what the space *is*, not a
switch reached for during the day.

A space that switches hunger on is saying its levels may make you hungry, and a
level designer can then place something that feeds you.

**House rules** are the room's, and they are the smaller, local settings a room
carries about how it is played.

**A door can charge.** An owner puts a price on a room, and it is paid by
everybody who goes through it — members and admins included, not just strangers.
A room whose regulars walk past the turnstile is not a room with a price on it;
it is a room with a price on *visitors*, which is a different feature and a
meaner one. The space's owner is the one exception, for the reason nobody is
ever charged to pay themselves.

It is its own kind of charge rather than a flavour of a need, because the two
are different bargains: a need is a *consequence* (you got hungry, food costs
something), and a toll is paid before anything has happened to you. It is also
the only charge in this product that can stop somebody getting in at all, which
is why it carries its own reason and why §13's view should make a space that has
quietly priced every door easy to spot.

**It is taken once per UTC day, per person, per room — and that interval is
inferred.** A toll was asked for without saying how often it recurs, and both
obvious readings are wrong: *once ever* makes it a ticket rather than a toll and
stops feeding the bank after the first week, and *every entry* means a page
refresh costs coins — worse, a reconnect after a dropped websocket does, which
charges people for a bad connection. A day is refresh-safe, genuinely recurring,
and reuses the boundary `streaks/days.ts` already argues for rather than
inventing a second idea of when a day turns over.

**The claim is written before the coins move**, which is the opposite of every
other payment here. Everywhere else the record follows the payment so a crash
loses a movement rather than handing something over free. What a toll protects
is not a purchase — it is *not charging somebody twice* — so the door is marked
before the purse is opened. A crash between the two lets one person through one
door free for one day, which is the cheapest failure on offer.

**The money flows to the bank.** Something you eat is priced on a blueprint, the
owner sets that price, and the coins land in the space's bank rather than being
destroyed. That is what makes a space an economy rather than a set of sinks: the
owner who tuned the prices holds the takings and can lend them back.

**And it can all be turned off.** Needs off means nothing costs anything and
nothing starves. This is the switch that matters most, because a hungry player
who cannot afford food is a player who cannot play, and the first space to
discover that should be able to fix it in one click.

---

## 12. Keeping it honest

The café mints coins, and everything above is downstream of that. Four rules:

1. **No browser-facing schema accepts an amount.** Every price is read
   server-side from a constant or a stored row. This is already the rule for
   `CoinsSpent` and it is now the rule for all of it.
2. **Every movement carries a reason from a closed set.** An unexplained
   movement is not possible to write.
3. **Losing a transfer beats printing one.** Debit before credit, always — the
   argument is already written at `CoinsSent` and it now covers battle payouts
   and remix splits too.
4. **Replay must not mint.** Every purse handler is guarded on the stream
   version. An unconditional `+ n` doubles every balance in the app the first
   time somebody rebuilds a projection.

---

## 13. Seeing it

**The rail** shows the purse, **at the top and above every panel**. It used to
live there, moved into the Thingiverse panel to sit "next to the things it
buys", and has come back — because the premise of that move stopped being true.
It was right when a coin bought exactly two things: a seat in the café and
something off the shelf. A coin now pays to enter a battle, opens a door with a
toll on it, buys one more blueprint than the plan holds, and puts a level in
front of a reviewer.

A number that pays for everything does not belong inside one panel. Down there
it was invisible until you opened the shelf — precisely when you least need
telling, because you are about to be shown prices anyway. The moment it matters
is *before* you commit to something.

Not left as a second copy either: a balance drawn in two places is one somebody
checks twice and eventually finds disagreeing with itself.

**The space's front page shows both balances** — what you have here, and what is
in your wallet — side by side with the streak, because those are the two things
at the top that are about *you* rather than about the space. Coins move between
them from that card, when the space's `economy` flag allows it (§3.1); when it
does not, the card says so rather than quietly omitting the buttons. A missing
control is a bug to whoever expected one; a sentence is an explanation.

**And the coins carry a way to earn some.** A work icon on the balance opens the
café. A balance is where somebody notices they are short, and that is the moment
the answer is worth offering — a number with no way out of it is just bad news.
The café is the one place in this product that *makes* coins rather than moving
them (§5), so "go to work" is literally where the money comes from.

**The leaderboard** ranks by coins. It is per space, like everything else.

**The backoffice** gets a money view, and it is built around people rather than
around totals:

1. **A list of people.** Everybody with a balance anywhere.
2. **Their spaces**, and what they hold in each — purse by purse, plus the
   wallet that outlives all of them.
3. **Their transactions**, read from the log: every movement, with the reason
   from section 5 attached and the counterparty named.

The totals per space come along for free, but the transaction reader is the part
that earns this. A balance tells you *what* somebody has; only the movements
tell you *how they got it*, and "is anybody printing coins" is a question about
movements. The shape of a bad answer is a space whose `taken` climbs while its
`paid_out` stays flat, or an account whose earnings are all `served` and all in
one space nobody else has ever stood in.

It is also the thing that catches bugs, which is not a hypothetical: the credit
half of every member-to-member transfer was silently landing on the sender's own
row and being dropped by the replay guard — sender debited, nobody credited —
and nothing in the product could have shown that, because nothing in the product
could read a movement. Fixed on 2026-09-01; see `ownerOf` in
`src/domain/homestead/projection.ts`.

**The best list ranks coins**, and is a different table from the streak board
rather than another column of it. A streak is the gentle ranking — the number
only goes up by being here, and there is nobody to beat. Coins are the one where
somebody can be ahead of you, so the two are not the same page.

**Shadow-banning from the leaderboard.** An operator can drop a player from the
best list without telling them. Two things make this defensible rather than
grubby: it is only ever a *ranking* that is hidden — coins, purse and play are
untouched — and it is recorded in `backoffice_audit` like every other operator
action, so it is a decision with a name on it.

It applies to **private spaces only.** A public leaderboard that operators
silently edit is a lie told to strangers; a private space's ranking is a
community's own business, and hiding a griefer from it is moderation. The
distinction is the whole justification, so it is enforced rather than documented
— **at the read**, in `readBestList`, not on the table. Whether a space is
public changes independently, so a constraint would go stale; a space that turns
public simply stops honouring its hidden rows, which is the safe direction.

**The hidden player still sees themselves**, at the rank they would have held.
That is the entire difference between a shadow ban and a ban: a list that
visibly loses you is a notification, and somebody who knows they have been
hidden makes another account — the moderation would have been worse than doing
nothing, because it taught them what to avoid.

Reading where the money went and quietly editing a ranking are **different
grants** on the same section. A read-only operator sees every figure and no Hide
button. The reason is required, and the row records who wrote it.

---

## 14. Open questions

1. **The price of an extra team XP** was never given. Unpurchasable for now.
2. **Free's private XP allowance is zero**, so there is no "one more" to price.
   Free spaces may never hold a private XP; if that is wrong, it is a number,
   not a design change.
3. **Vouchers are claimed, not played for.** The brief said "play for a
   voucher" and never said what the game was. What shipped is a claim for
   somebody with nothing, behind a flag that is off — which is honest about the
   gap rather than inventing a minigame. If there should be something to *do*
   for it, that is still unbuilt.
4. **Acceptance rewards have no ceiling.** That is intentional but it is also an
   operator who can mint arbitrarily many coins. It should probably be bounded
   by the reviewer's role rather than by their judgement.
5. **A faucet with no drain.** §6.1 — a won match creating 7 coins is the
   design, not a leak, and it is fine as long as there is something to spend
   them on. What is *not* fine is a space that switches battle on and never
   prices a drink, because `battle`, needs and `economy` are three separate
   controls and nothing makes them agree.

   This is a **monitoring** question rather than a numbers one. §13 should make
   it visible: battle payouts climbing while the bank takes nothing.
6. **Minted coins leaving through the wallet.** §6.2 and §3.2. Coins are
   harmless while they stay in the space that minted them — they are
   scorekeeping with a shop attached. The door out is where a space's play money
   becomes an account's balance everywhere, and the `economy` gate only shuts it
   for spaces that are not playing at all.

   The fixes are all product decisions (a withdrawal fee, a cooling-off period,
   a per-space earning cap, operator review) and none should be picked before
   §13 can show whether it is actually happening.
7. **The price of a room is invented.** §8.6. So is the shape of the argument
   for selling rooms at all, which cuts against `rooms/capacity.ts`.
8. **Loans have no repayment.** A loan out of the bank is currently a gift with
   a nicer name. Whether it should be recovered from later winnings is a real
   design question and the answer changes the event.
