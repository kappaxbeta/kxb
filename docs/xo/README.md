# xo — the lounge, the café and home

**`xo` is the product as it has always been.** [tiers.ts](../../src/domain/billing/tiers.ts)
puts it plainly: the lounge, the world lobby, and the places people are in
together. `xp` is the creator suite on top of it — *"Everything in xo, and the
XP suite on top."*

The two are **not layers of one engine**, and that is the decision to know
before touching either. xp/creator.md §1.2 chose *copy, don't
import*, and §16.2 says to assume the lounge and the XP engine never converge:
*"two engines that have drifted for six months do not merge back."* If the XP
engine turns out to be strictly better, the honest move is a deliberate rewrite
decided on evidence — not a gradual convergence that happens because one feature
made them look similar.

So a component copied from the lounge into `src/app/xp` is owned there
afterwards. That is intentional, and the lint boundary enforces it.

## What xo is made of

There is **no `packages/xo`** — unlike the creator, which lives in
`packages/xp` behind a hard import boundary. xo's code is domain modules and
routes:

| Place | `src/domain/` | Roughly |
|---|---|---|
| **The lounge** | `lounge/` | The shared world people stand in: presence, movement, emotes, chat, the palette of blocks it allows |
| **The café** | `cafe/` | A room with a bar, staff and orders |
| **Home** | `homestead/` | Somebody's own place |
| **Worlds** | `worlds/`, `world/`, `builder/` | The lobby, spawns, and the world builder that draws them |
| **Rooms** | `rooms/` | Rooms inside a space, and the chat that follows you between them |

Art lives under `public/xo/` — blocks, scene stills, avatar shots. Note the
trap: `public/xo/proto/` holds assets the *XP* prototype pack uses, so an `xo`
path is not proof something is xo's.

## Where the arguments already are

Nothing about xo is undocumented; it is documented in the subsystem docs rather
than in one place, because that is where the decisions were made:

| Question | Where |
|---|---|
| How presence and movement go over the wire, and why 8 Hz | [architecture/netcode.md](../architecture/netcode.md) |
| What happens when a lot of people arrive | architecture/scaling.md, performancestudy/ |
| How a command becomes events, and which CQRS rules are broken on purpose | [architecture/event-sourcing.md](../architecture/event-sourcing.md) |
| Running an event in a space, on one anonymous link | product/event-spaces.md |
| What an operator and a guest actually do | product/manual.md |
| How a space resolves to a subdomain | architecture/subdomains.md |
| Cameras in a world: how a picture crosses, and what gates it | [faces.md](faces.md), [operations/relay.md](../operations/relay.md) |

**This README is a map, not a manual.** If xo grows a decision that needs
arguing rather than describing — a rewrite against the XP engine, a change to
what the lounge palette guards — it gets its own document in this folder, and
this table gains a row.

## The one number worth knowing here

The lounge palette is **58 blocks**, and it is deliberately not the builder's
1,393 or the creator's 611. Three lists, three questions: the lounge's guards an
immutable event log where a bad model id is permanent, the builder's guards a
marketing render in a JSON file, the creator's guards what a game is made of.
Collapsing any two means one tool inherits the other's ceiling.
