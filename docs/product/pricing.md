# Pricing

Three tiers, and the argument for why each cap sits where it does.

This is the document to read before touching `src/domain/billing/tiers.ts`,
`src/domain/billing/prices.ts`, or any code that asks whether a space may create
one more of something.

It replaces the two-tier model in which `xo` and `xp` were *halves of the
product* and the price bought you which half. They are now *quantities*, and
every paid tier gets some of both.

---

## 1. The table

| | **free** | **€5** | **€12** |
|---|---|---|---|
| seats | 2 | 6 | 12 |
| guests at once | 1 | 3 | 8 |
| **people in the space** | **3** | **9** | **20** |
| xo places | 5 | 20 | 30 |
| xp places | 4 | 4 | 10 |
| xp in the magazine | unlimited | unlimited | unlimited |
| xp projects | 1 | 3 | unlimited |
| matches at once | 5 | 15 | 30 |
| pages | 1 | unlimited | unlimited |
| uploaded images | — | 10 | 100 |

Free held none of the first and one of the second until 2026-09-01. Both moved
for the same reason: a room is how a group with two things going on stops
holding both in one space, and one xp place is a shelf you have to clear before
you can try the next thing. Neither was a wall anybody upgraded over — they were
walls people stopped at. Authoring is where the wall stays: **xp projects is
still 1 on free**, and §4's recommendation about places is unchanged.

Prices are per space per month. A space is billed on its own — one account may
hold a quiet free space for a book club and a €12 space for the thing it is
actually building, and neither has to be the other. That was already true and
does not change; see the note at the top of `tiers.ts`.

---

## 2. What the units mean

These have to be tight, because each one is a number somebody is enforcing in a
`create` path.

**Seat** — a member of the space. A person with an account who belongs here.
The owner occupies one.

**Guest** — a stranger standing in the space *right now*. Three guests means
three at a time; one leaving frees the place, and the same link may bring a
hundred people across an afternoon. Links are not rationed.

This was going to be a cap on outstanding invite tokens, and it should not be —
`guest_limit` already ships as concurrency, with the argument attached: a space
can sit at its guest cap all afternoon and never spend a seat. Concurrency is
also the honest reading of the headline number. "9 people" is then literally
true, rather than 6 members plus 3 doors that might admit nobody or thirty.

If a cap on *links* is wanted as well, that is a second number and a new
mechanism, not this one. See §12.

**Place** — a room that exists, not a room that is loaded right now. This is
settled by the seat caps rather than chosen: 9 people cannot fill 20 rooms, so
the cap cannot be about occupancy. It is a count of rows checked when a room is
created, and it needs no runtime tracking.

Places come in two kinds and **the data already knows which** — a room with
`xpRef === null` is an xo place, and one with an `xpRef` is an xp place
(`RoomView`, `src/domain/rooms/queries.ts`). Two counts over one table.

**Magazine** — the space's own shelf of XPs it has copied in. Unlimited on
every paid tier. See §3.

**Project** — an XP this space can *edit*. The editable surface, not the
playable copy.

**Match at once** — concurrent open battles. Not matches per month. A space at
its cap starts no new match until one finishes.

**Page** — one written page in the space. Free holds one, which is enough to
say what the space is and who is in it. Both paid tiers hold as many as they
like: a page is text in a row, and metering text is not worth the sentence it
takes to explain.

**Uploaded image** — a file somebody sent us, stored under our own origin. Not
the pictures that ship with the product; those are a platform catalogue
(`domain/pictures`) and cost a space nothing.

This is the tightest number on the board and the only one counting *bytes*
rather than rows. `uploads.ts` caps one file at 10 MB and nothing caps how many,
so before this a space could hold a hundred gigabytes and pay €5 for it. It is
also the only feature with a **kill switch** as well as a cap — the `pictures`
flag — because it is the one surface that accepts bytes from strangers and
serves them back from our domain. Off means nobody may upload and the surface
offering it is gone; images already stored keep being served, because nothing
here deletes on a flag. Getting an image *gone* rather than *off* is moderation,
and moderation keeps its own trail.

### The one limit that is not about a space

Everything above caps a *space*. This one caps a *person*:

**An account may own one free space.** Owning paid spaces is not capped — a
subscription is per space, so a second one is a purchase rather than a
loophole, and "you can buy another" is a complete answer to somebody who has hit
this. It needs no new mechanism; per-space billing already works that way.

**Being a member of other people's spaces is never capped**, and this is the
half worth defending in review. Capping it would mean somebody's own free space
stops them being invited into their friends' spaces — which punishes precisely
the people who bring other people here, to save nothing. A member costs the
space that invited them, and that space is already paying its own seat cap for
the privilege.

It resolves against a `user`-scoped override rather than a `tenant`-scoped one.
`FeatureScope` in `flags/keys.ts` has had both values all along; this is the
first limit that needs the second.

---

## 3. The magazine

The new thing in this model, and the reason the caps are defensible rather than
arbitrary.

Today the path from "an XP exists" to "we are playing it" runs through a public
catalogue and a wizard: `/browse` → summon → room. The magazine puts a shelf in
the middle that belongs to the space.

The verbs below are deliberately plain rather than in either metaphor — see
"Which magazine this is". The arrows are the model; the words on them are what
the test decides.

```
/browse  ──take in──▶  magazine  ──load──▶  place
(the public list)   (this space's)    (a room, playable)
                         │  ▲
                   remix │  │ publish
                         ▼  │
                      project
                   (editable, yours)
```

- **take in** — from the public catalogue into your magazine. Free, unlimited.
- **load** — put a magazine entry into a place. Costs a place.
- **remix** — take a magazine entry and make an editable copy. Costs a project.
- **publish** — put a project into your own magazine, where it can be loaded.
- **matches** load from either a place or straight from the magazine.

### Which "magazine" this is — to be settled by a test

The word carries two readings and they are not decorative. Each one implies a
different set of verbs, and the surface has to be written in one of them:

- **The catalogue reading.** A magazine as a holder of things — the cartridge
  rack sense. You *shelve* or *slot* an XP into it, and it is your collection.
  Exact for anybody who has held a console, invisible to anybody who has not.
- **The publication reading.** A games magazine, the kind you flip through and
  order from. You *order* an XP and it arrives in your space; the magazine is
  the issue you assembled out of everything on offer.

Half a metaphor is worse than none — the reader spends attention resolving it
instead of using the thing — so this is an A/B test rather than a preference.
Two arms, same word, different framing and verbs throughout the surface.

It cannot run yet, for two reasons worth writing down rather than discovering:
the magazine does not exist, so there is nothing to render an arm of; and
`EXPERIMENTS` in `analytics/experiment.ts` has `look` live, with its own
registry arguing that two experiments on one page make every number in both
reports a mixture of four things. Finish that one first.

Whichever wins, "order" is safe to take if the publication arm does: nothing in
the XP domain uses it for money. `claims` is editor locks and `grants` is
permissions, and ordering into a magazine is free and unlimited by design, so it
collides with no commerce word — because there is no commerce here to collide
with.

### Why it is unlimited

Because it is the thing that makes every other cap feel fair instead of mean.

An **ordered** XP costs storage and nothing else. A **loaded** place costs frames
and a Realtime topic. An **editable** project costs edit surface and version
history. Those are three genuinely different costs, and pricing them
differently is legible to a customer in a way that "20 of this, 4 of that"
never is on its own.

An unlimited magazine also means nobody is ever asked to *delete* something to
stay under a cap. They take it out of a place and it is still in the magazine.
That is the same instinct as §6.

---

## 4. Why each rung has exactly one argument

The ladder was rebuilt so that no rung repeats the one below it:

- **free → €5 is seats.** 3 people → 9. Enormous, obvious, and felt in the
  first session rather than in month three. Free now holds one xp place and one
  project too, so this rung buys capacity as well (1 → 4 places, 1 → 3
  projects) — but seats are still the sentence, because the second place is
  worth nothing to somebody who has nobody to play it with.
- **€5 → €12 is build capacity.** 4 xp places → 10, and 3 projects →
  unlimited. This is the cap that is meant to do the arguing, and at this rung
  it is the *only* thing arguing.

Seats double again at €12 (6 → 12, 3 → 8 links), which is deliberate: the axis
somebody noticed first should never flatline when they pay more. But it is not
the reason to buy €12. Building is.

### The xo place cap does almost no work

20 at €5 and 30 at €12, against ceilings of 9 and 20 people. Rooms exist to
spread load — two rooms of eight cost half what one room of sixteen does, which
is the whole argument in `src/domain/rooms/capacity.ts` — and at these seat
counts nobody needs more than three.

So 20-vs-30 argues nothing; it is a number unreachable on both sides of the
line. **Recommendation: make xo places unlimited on both paid tiers**, and let
all the upgrade pressure sit on seats and xp, which is what the caps were
designed to do. One fewer number to explain, and it costs nothing real. Left in
the table above as specified, because it is a pricing call and not a technical
one.

---

## 5. What is *not* capped, and why

**Match modes are not gated by tier.** Not one of them.

The temptation is obvious — free has 3 people, football with 3 is thin, so sell
football. Do not. `MIN_PLAYERS = 2` is the only floor in the app and it is
global (`src/domain/battle/events.ts`); teams at 2 is 1v1 and football at 3 is
2v1, and both run today. Locking a mode that *works* in order to sell seats is
a wall with nothing behind it, and people can tell.

It also could not be honest if we tried. A €12 space with three people present
on a Tuesday has exactly the same thin football, and no amount of money fixes
it. The constraint is who is in the room, not what was paid.

What we do instead is **advise**: "football is better with 6+ — you're 3."
Dismissible, no call to action, shown on every tier. That is being a good host,
not a pricing feature.

If we later decide 1v1 football is bad enough to forbid, that is a fine product
call and `playersNeeded` already maxes against the XP's own rules, so a per-mode
floor slots straight in. Make that change because the match is bad, never
because it sells a seat.

---

## 6. Downgrade: freeze, never delete

A space that drops from €12 to €5 with 10 xp places is over its cap by six.
Nothing is deleted. Ever.

This is the promise the app already makes when a subscription lapses — *nothing
is lost, everything is still here, only writing stops* (`writeBlockedReason`,
`src/lib/tenant.ts`). Applying it per-room rather than per-space is the same
stance at finer grain, not a new one.

### The rules

1. **Over-cap places are shelved, not closed.** They stay in the list, greyed,
   legible at a glance without clicking. Opening one offers the upgrade.
2. **Which ones get shelved: least recently active first.** *Not* list order.
   List order is creation order or a manual sort, and neither means "the ones
   you care about" — the failure mode is a customer who keeps the three rooms
   they built in week one and forgot, while the room they use daily was newest
   and got shelved.
3. **The downgrade offers a choice first.** "Pick the 4 that stay." The
   least-recently-active rule is the fallback for whoever clicks past it.
4. **Shelving is swappable, at any time, without upgrading.** At 4 of 14 you may
   thaw one by shelving another. This is the rule most likely to be dropped as a
   nicety, and it should not be: without it the cap is not "4 places", it is
   "*these* 4 places, forever", which is far harsher than what was sold and
   generates the kind of support mail where the customer is right.

   It costs nothing in upgrade pressure. Somebody swapping every week is the
   person feeling the cap hardest, and they will upgrade because they are tired
   of swapping — a better reason than because they are stuck.
5. **Upgrading thaws automatically**, most recently active first, up to the new
   cap.
6. **Nobody is frozen mid-session.** The rule applies at next entry, not
   instantly. Ejecting people from a running match on the day a card fails
   attaches a bad memory to a billing event, and the sweep in
   `src/domain/battle/sweep.ts` is the existing precedent for letting things end
   before acting on them.

### What this needs from the data

Rooms currently carry no last-activity timestamp — `RoomView` has `createdAt`
and `roundStartedAt` and nothing else usable. Rule 2 needs one.

The shelved state should be **stored, not derived**: a room carries whether it
is shelved, and the cap check counts unshelved rooms against the tier's limit.
Deriving it from "position in a sort, versus the cap" would silently reshuffle
which rooms are live whenever activity changed, which is exactly the surprise
rule 4 exists to prevent.

---

## 7. Seats over cap

The same problem with no greying available: you cannot shelve a person.

**Nobody loses access. New joins are blocked until attrition brings the space
under its cap.** A space downgrading from 12 seats to 6 with 9 members keeps all
9, and admits nobody new until it is at 5.

The alternatives are worse in a way that is not close. Forcing the owner to pick
three people to remove is a conversation we would be making them have, on our
schedule, about their friends. Auto-removing by last-seen does it *for* them,
which is worse again.

The cost is a space that sits over its cap indefinitely. That is acceptable: it
is bounded — it can only shrink — and the owner is already paying the tier's
price for a space that no longer grows, which is the pressure doing its job
quietly.

The guest cap needs none of this care, because it enforces itself. It is a
concurrency limit, so it comes back under on its own the moment the room
empties — the door simply turns the fourth stranger away, which it already does
today. Nobody standing inside is ever asked to leave.

---

## 8. Where the upgrade prompt fires

**The prompt goes where the wall is, not where the disappointment is.**

The plan genuinely causes exactly four walls, and the prompt belongs at each:

| Wall | Fires on |
|---|---|
| seat cap | the invite button |
| guest cap | a guest arriving at a full space — shown to the owner, never to the guest |
| xp place cap | "new xp place", and opening a shelved place |
| project cap | remix, and new project |
| one free space per account | creating a second space |

The last one is the only wall whose answer is "buy a plan for the *new* space"
rather than "upgrade this one", and the prompt has to say so. Somebody who
misreads it as "upgrade to make more free spaces" will pay €5 and still be
unable to do the thing they wanted.

Each is truthfully caused by the plan and has an answer the button can actually
deliver. Anything failing either test — thin football being the worked example
in §5 — does not get a prompt.

Three of the four also fire at the owner's own moment of intent, which is where
a prompt lands best. The guest cap is the odd one: the moment belongs to a
stranger at the door, and *they* must never see it. Turning somebody away with a
pitch to a product they are not buying is the worst version of this. The guest
gets the plain answer — the space is full — and the owner is told afterwards
that somebody could not get in.

---

## 9. Grandfathering

Two groups are worse off under this model, and both need old prices kept alive.
The codebase has the pattern already: the retired €20 price still maps to a tier
in `tierForPrice`, deliberately and with the argument written down
(`src/domain/billing/prices.ts`).

**Existing xo customers at €5.** Today's xo card promises *"Unlimited members
and guests"* — that string is in `TIER_DETAILS` and has been sold. The new €5 is
6 seats and 3 links. Their price id must keep mapping to a tier whose seat and
link limits are unbounded.

**Existing xp customers at €10.** The tier becomes €12. They keep €10 with the
€12 limits until they change plan.

**Legacy €20 customers.** Already mapped to the top tier and paying more than
it costs. Unchanged: top tier, unbounded seats, unbounded links.

The mechanism is the same in all three cases — a price id that is *honoured but
not sold* (`isSoldPrice` already draws that distinction), pointing at a limit
set that no checkout can reach. When the last subscription on one is gone, the
branch and its limits go with it.

---

## 10. Adjusting the numbers later

Most of this is already built, and it was built with the right argument
attached. `FEATURES` in `src/domain/flags/keys.ts` holds **valued flags** — a
switch that also carries a number — and two of the numbers in §1 are already
among them:

- `seat_limit`, "people per space", 1..10,000
- `guest_limit`, "guests in a space at once", 1..1,000

Overrides scope to a `tenant` or a `user`, carry a `value_int` and a `note`, and
sit over a global default (`src/domain/flags/queries.ts`). The backoffice
already renders a number input beside the toggle for anything `valued`. And
**off means unlimited**, so "no cap" needs no sentinel number — a convention
worth keeping for every limit added below.

### What is missing is the tier

Today the chain is two rungs: a global default, and a per-tenant override. The
tier takes no part. That is the gap:

```
effective limit  =  tenant override        (an operator, with a note)
                ??  the tier's limit       (what they bought)   ← the missing rung
                ??  the global default     (the platform's ceiling)
                ??  unlimited
```

The tier slots in as the *default for a space*, and the operator override still
wins over it. Nothing about the existing resolution has to be rewritten; it
grows a rung in the middle.

### Two different things get adjusted, and they must not share a mechanism

**What a tier includes is a pricing change.** It moves the public pricing table,
it has to agree with what Stripe is charging, and §9's grandfathering works by
coupling a *price id* to a *limit set*. Decisions like that are made twice a
year, need to be visible in git history, and want a review. **They stay in
code.** Deploy is one button.

There is a second, harder reason. `tiers.ts` is deliberately pure and importable
from a Client Component — that constraint is written at the top of the file, and
it exists so the landing page can render the pricing table. Move the tier
numbers into the database and the marketing page needs them fetched and threaded
down through every component that names a price. That is the real cost of making
*tier* limits runtime-editable, and it buys very little.

**What this one space gets is an operational decision.** A comp, a partner, a
beta tester, a customer on the phone, an event that needs 200 seats for a
weekend. Made weekly, by an operator, and it must never need a deploy. **That is
the flags system, and it already works.**

### Four rules for the overrides

1. **Overrides raise, never lower.** The effective limit is
   `max(tier, override)`. An override that lowered below the tier is a way to
   sell somebody €12 and hand them €5, which is a support call we would lose and
   probably a refund. A space that is abusing something gets suspended — a
   different mechanism, with its own audit trail — not quietly shrunk.
2. **Overrides are sparse.** Override the one key, never a copy of the table. A
   comped space carrying `{seats: 50}` still tracks every future change to its
   tier on everything else; one carrying a full snapshot of the limits is frozen
   in the shape the product had on the day somebody was generous, and it will
   never see another feature.
3. **Overrides expire.** An event space granted 200 seats for a weekend keeps
   them forever otherwise, long after everyone has forgotten why. `event_spaces`
   already carries `opens_at`/`closes_at` for exactly this reason; a
   feature override should carry an expiry in the same spirit.
4. **Overrides say why.** The `note` column exists. Use it. An unexplained
   `seat_limit = 50` on a €5 space is indistinguishable from a bug, and the
   person who finds it will be someone with no way to ask.

### The limits that still need flags

`seat_limit` and `guest_limit` exist. These do not, and should be added to
`FEATURES` in the same shape — `valued`, `fallback: false`, off meaning
unlimited:

| flag | unit |
|---|---|
| `xp_place_limit` | xp places per space |
| `xo_place_limit` | xo places per space |
| `project_limit` | projects per space |
| `match_limit` | matches at once |

Keep the fallback direction the existing two chose. Both fall back to *no
limit*, and the argument is written out at `seat_limit`: a broken flag lookup
must not be the thing that turns somebody away at a door they were sent a link
to. A brief outage that lifts a cap costs a few seats an admin can see and
correct; one that clamps every space to zero is an incident.

---

## 11. What this changes in the code

**`tiers.ts` stops being a boolean.** Its entire job today is
`includesXp(tier) → tier === 'xp'`. It becomes a limits table, and
`includesXp` becomes `limits(tier).xpPlaces > 0`. Every caller that asks "is
this the expensive tier" has to start asking "how many of these may they have",
which means the call sites move from a gate at the top of a page to a count in a
create path.

**Free is a genuinely new state, not a smaller tier.** Right now the write path
asks one binary question — entitled, or read-only — and a whole space is on one
side or the other (`writeBlockedReason`). A *writable but capped* space is a
third answer, and every path that asks the binary today has to learn it. This
is the largest single piece of work in the model and it is mechanical rather
than subtle.

**The tier names have stopped being true.** `tiers.ts` currently argues that xp
"is the half that costs real money to run and is therefore the half behind the
higher price". That is no longer the design: €5 includes four xp places. The
words `xo` and `xp` now describe two kinds of *place*, which is a good use for
them and one the data already reflects via `xpRef` — but it means the tiers
need names of their own.

Keeping `xo`/`xp` as internal ids is defensible and cheap: they key the Stripe
prices, the read-model column and `tierForPrice`. What they cannot keep doing is
appear on the pricing table as the names of the plans. See §11.

---

## 12. Open questions

1. **What are the tiers called?** Blocking the copy, not the code. `xo` and `xp`
   are now the names of place kinds; the three plans need their own words.
2. **Are xo places unlimited on paid tiers?** §4 recommends yes. The table
   currently says 20/30 as specified.
3. ~~**Does free get a magazine?**~~ **Settled: yes, unlimited.** A shelved XP
   costs storage only, so metering it buys nothing.

   ~~*Still open underneath it: whether free eventually gets one xp place.*~~
   **Settled: one place and one project.** Zero of both made the XP half of the
   product invisible to anybody who had not paid, which sounds like the point of
   a free tier and is not — an XP is what this platform is *for*, and a plan
   that lets you collect levels forever and open none of them is a demo of a
   shelf. Somebody on free could not find out whether they wanted the thing they
   were being asked to buy. One of each is the smallest number that is still the
   product: one place means a level can be stood in and played, one project
   means a level can be made, and the wall moves to the *second* of either —
   somebody who has already used the first and liked it. The seat cap does the
   rest, since two seats and one guest is not a community whatever it is
   playing.

   What this cost, and it is worth writing down: the gate `xpOpen()` was
   `hasTier(context, 'xp')`, a rung rather than a quantity, and it was already
   wrong before free changed — an `xo` space is written down here as holding
   four xp places and could not open one. It now reads `xpPlaces !== 0`, so this
   table is the only place a tier's XP allowance is stated.
4. **Free's 5 concurrent matches caps nothing.** Three people can sustain one
   match. The number is a ceiling the seat cap already enforces, so it is
   harmless — but it should not appear in the copy as if it were a feature.
5. **How does free relate to `/demo` and `/lobby`?** Both already let strangers
   play with no account. Free at 2 seats is close enough that the difference has
   to be "it is yours and it persists" rather than "you can play" — otherwise
   free reads as a worse demo.
6. **Two experiments are queued behind `look`, in this order.** Both go in
   `EXPERIMENTS` when it finishes, one at a time, for the reason that registry
   already argues.

   **The pricing table.** Whether free existing at all moves sign-ups. This is
   the one with real traffic and a clean metric — the landing page already
   assigns arms server-side, the beacon already reports which one rendered, and
   the funnel report already groups by it. Run this one first: it decides a
   number that is expensive to change later, where the metaphor decides a word
   that is cheap to change.

   **The magazine metaphor.** Catalogue versus publication, as above. Needs the
   magazine to exist first, so it cannot jump the queue even if we wanted it to.
7. **Is a cap on invite *links* wanted as well?** §2 settles the headline number
   as concurrent guests, matching the shipped `guest_limit`. That leaves link
   minting unbounded, which is fine for pricing and possibly not fine for abuse.
   If it is wanted it is a second number, and it belongs with moderation rather
   than with the tier.

---

## 13. Things that will catch you out

**"12 seats" is not "12 people".** Every tier's real headcount is seats plus
guests, and that is the number a customer counts. Copy that says "12 users"
where the space holds 20 will be read as a lie by the person who counted.

**A guest cap is concurrency, not links and not visits.** One link can bring
thirty people across an afternoon and never breach a cap of three. Anybody
implementing "guests over cap" by counting tokens or arrivals has built a
different product — and a stricter one than was sold.

**A limit has three possible sources and the tier is the middle one.** An
operator override beats the tier, the tier beats the global default. Code that
reads the tier's number directly, rather than resolving the chain in §10, will
work perfectly until the first comped customer.

**Places are counted, matches are concurrent, magazine is unbounded.** Three
different kinds of limit in one table. The copy must never flatten them into one
word — "15 matches at once" and "20 places" are not the same kind of claim, and
"5 matches" without "at once" means something we are not selling.

**Downgrade is the path that gets tested last and hurts most.** Every rule in §6
is about a customer who is *already unhappy enough to pay us less*. It is the
worst possible moment to also lose their rooms.
