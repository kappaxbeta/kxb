# Operations

Running the thing: shipping it, defending it, and knowing what happened.

| | |
|---|---|
| deploy.md | How a change reaches production |
| ddos.md | The posture, and what is actually in front of the app |
| [audit.md](audit.md) | What is recorded, and what can be reconstructed afterwards |
| guest-access-audit-2026-08-23.md | The guest-access review: what was fixed, what is still open, as a task list |
| space-security-audit-2026-08-28.md | The user-space review: roles, the tenant stream, definer grants — what was fixed and what is still open |
| [analytics.md](analytics.md) | What is measured, and what is deliberately not |
| [accounts.md](accounts.md) | Accounts, sessions, and how they end |
| [realtime-limits.md](realtime-limits.md) | The Realtime ceilings, how to set them, and what they cost when wrong |
| [capacity.md](capacity.md) | Every ceiling between a crowd and the app — guest sign-in limit, per-space caps, room caps — where each lives and how to raise it |
| [scheduled-jobs.md](scheduled-jobs.md) | The five things that run on a clock, and how you would ever notice one stopped |
| [relay.md](relay.md) | How face video gets through a NAT: the three candidate tiers, what IPv6 changes, and how to stand a relay up (the feature itself is [xo/faces.md](../xo/faces.md)) |

Two boxes carry production: the app on one and self-hosted Supabase on the
other. deploy.md is authoritative on which is which and how each is
reached — do not infer it from a shell history.
