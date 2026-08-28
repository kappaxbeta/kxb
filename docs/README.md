# Documentation

Written to be read by somebody who was not here. Comments and docs in this repo
explain *why*, not what, and they are written for the person who will disagree
with the decision — so a document that only describes behaviour is half-written,
and one that records an argument stays useful after the code changes.

## Where to start

| You want to | Read |
|---|---|
| Understand how the system is built | [architecture/](architecture/) |
| Know how it behaves in the wild | [operations/](operations/) |
| Work on the lounge, café or home | [xo/](xo/) |
| Work on the game creator | [xp/](xp/) |
| Fetch the art | [assets.md](assets.md) |

`xo` and `xp` are the two halves of the product, and they are not layers of one
thing — see [xo/README.md](xo/README.md) for the split.

## The folders

**[architecture/](architecture/)** — how it works underneath.
[Event sourcing and CQRS](architecture/event-sourcing.md) is the one to read
before adding a domain module. [The netcode](architecture/netcode.md) is the
hardest reasoning here: who is authoritative over what, and why the answer is
never "the server". The rest is the render queue and how large files move.

**[operations/](operations/)** — how the running system behaves.
[Known defects](operations/audit.md) is worth reading early and is unusual for a
repository to publish: thirteen findings from reading the code adversarially,
each with the fix and what it bought. Alongside it: how
[accounts](operations/accounts.md) and their four doors work,
[analytics](operations/analytics.md), [capacity](operations/capacity.md) and
where each ceiling lives, [scheduled jobs](operations/scheduled-jobs.md),
[realtime limits](operations/realtime-limits.md), and [the relay](operations/relay.md)
that gets face video through a NAT.

**[xo/](xo/)** — the lounge, the café and home.

**[xp/](xp/)** — the creator and its runtime: an engine, a document format and
an editor. [manual.md](xp/manual.md) is the reference, field by field;
[editor-guide.md](xp/editor-guide.md) is what to press; and the
[feature inventories](xp/user-manual/runtime-features.md) are checklists of what
the engine, the editor and scripts can each actually do.

## Conventions

- **Everything here describes what the code does today.** Plans, proposals and
  design explorations are kept elsewhere: a document that promises behaviour
  nothing implements is worse than no document, because somebody builds against
  it. If you add one, say in its first lines that it is a proposal.
- **Where a document and the code disagree, the code wins** and the document is
  wrong. Fix it rather than arguing with it.
- **Numbers live in code, not in prose.** A count in a comment goes stale
  silently. Where a doc states one, it says where it was measured.

## A note on what is missing

A few references in these documents read as plain text rather than as links.
They point at operational material — the deploy runbook, the DNS layout, the
scaling measurements — that describes one particular set of servers rather than
this software, and is not much use to anybody running it somewhere else.

The [assets](assets.md) are the other absence, and that one is deliberate and
explained.
