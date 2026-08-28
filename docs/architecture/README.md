# Architecture

How the system works underneath — the parts a feature sits on rather than the
features themselves.

| | |
|---|---|
| [event-sourcing.md](event-sourcing.md) | **Start here.** How a command becomes events, how events become read models, and which textbook rules this codebase deliberately breaks. Read before adding a domain module, or before moving a rule between layers |
| [netcode.md](netcode.md) | Presence and movement over the wire: one channel per instance, 8 Hz, and why interpolation makes eight samples look like sixty |
| scaling.md | What happens when a lot of people arrive at once |
| subdomains.md | How a space resolves to a host |
| [renders.md](renders.md) | The render queue: a job, a Chromium worker, and a picture out |
| large-files.md | *Proposal.* Where the 102,425 lines in 67 big files actually are, why a file-length rule gets them backwards, and the order to take them apart in |

Measurements behind the scaling decisions are in
performancestudy/ rather than here — this folder holds
the design, that one holds the numbers and how they were taken.

**The rule that shows up in all of these:** nothing that changes eight times a
second is ever written to the event log. Ephemeral state is realtime and gone;
durable state is a stream. Where a document proposes something new, it says
which side of that line it falls on.
