# Contributing

## Before anything else

```bash
bun install
bun test src packages
```

The suite needs no database, no network and no art. It runs in seconds. If it
is red before you have changed anything, say so in an issue rather than working
around it — with one exception, below.

**Some failures are expected on a fresh clone.** They are asset-integrity tests,
and they are correctly reporting that the 3D models and audio are not in this
repository. See [docs/assets.md](docs/assets.md).

```bash
bun run test:core
```

runs the same suite without those thirteen files. It is what CI runs, and it
must be green — everything else is a regression.

## Running it

```bash
bun run dev      # starts local Supabase in Docker, then Next on :3000
```

Requires [Bun](https://bun.sh) and Docker. Keys are generated per install and
written into `.env.local` for you; there is nothing to copy by hand.

## The checks

```bash
bunx tsgo -p tsconfig.check.json --noEmit   # types
bunx eslint                                 # lint
bun run test:core                           # tests
```

CI runs exactly these three, on every branch.

## House style

The thing that will stand out if you have not read the codebase yet: **comments
explain why, not what, and they are written for the person who will disagree.**
A comment that restates the line below it is noise; a comment recording the
option that was rejected and what it would have cost is the reason this codebase
can be picked up years later. Match the density of the file you are in.

Beyond that:

- **The write side is event-sourced.** Nothing mutates a row. Load a stream,
  fold it, ask a pure `decide()`, append under the version you read. Read
  [docs/architecture/event-sourcing.md](docs/architecture/event-sourcing.md)
  before adding a domain module.
- **Nothing in the middle is authoritative.** Before you make a moving thing
  agree between two browsers, read [docs/architecture/netcode.md](docs/architecture/netcode.md).
  Three different authority models are in use and the choice is deliberate.
- **`packages/xp` is pure.** No React, no three.js, no browser globals. That is
  what makes the engine testable, and it is enforced by lint.
- **Numbers live in code, not prose.** If a doc states a measurement, it says
  where it was taken.
- **Translations are whole phrases, not slots.** German and Bulgarian do not
  take a name and an article apart cleanly. Add the sentence three times rather
  than interpolating.

## Migrations

`supabase/migrations/` is append-only in practice: 188 files, each named for
what it does. Add a new one rather than editing an old one — someone's database
has already run it.

## Where things live

| | |
|---|---|
| `src/es/` | The event-sourcing core. Pure, under 900 lines. |
| `src/domain/` | One directory per aggregate: events, `decide()`, projections, queries. |
| `src/app/` | Routes, Server Actions, and the 3D worlds under `world/`. |
| `packages/xp/` | The level engine: format, character controller, script sandbox. |
