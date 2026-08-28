# xp — the creator and its runtime

A game creator and runtime: an engine, a document format, an editor, and the
places a finished XP goes. `xp` is the tier on top of [xo](../xo/README.md) —
and a separate engine from it on purpose, not a layer over it (§1.2, §16.2).

## Read in this order

| | | |
|---|---|---|
| 1 | creator.md | **The plan and the arguments.** Why anything is shaped the way it is. §1.2 (copy, don't import) and §2.0 (backoffice-only) are the two decisions everything hangs on. |
| 2 | [manual.md](manual.md) | **The reference.** The format field by field, every limit with its measurement, capabilities, scripts, hosts, the editor. What the code does *today* — it wins over any plan where they disagree. |
| 3 | [editor-guide.md](editor-guide.md) | The other half of the manual: what to press. |

## Then, by subject

| | |
|---|---|
| backend.md | Where a project lives: the folder, storage, the store, the review queue |
| [round.md](round.md) | A round of the board game, end to end, as flow charts — and which of the four places it runs through decides what |
| scenes.md | **Proposal.** One document holding more than one place — scenes, timelines, saves. Changes `format.ts`, which is shared ground |
| two-sessions.md | Working in here alongside somebody else. The file-level split and the git rules. **Read before starting, not after** |

## What is not built yet

backlog.md is the index — a paragraph and a link each, ordered by
what gates what. The designs behind it:

| | |
|---|---|
| xp-flow.md | **Mostly built** — `flow`: rounds, phases, what a role may do in each, and what wins. The block, the runtime and the editor are in; §8's open questions and the run id are backlog §3a |
| editor.md | The editor's next round, and what "visual scripting" can mean |
| server-authority.md | Reopening §17, and the games it unlocks |
| state.md | State that survives a session |
| devices.md | Mobile, desktop and XR |
| ai-integration.md | Generating levels from a brief. Deliberately last |

backlog.md is now the **only** queue: §0 is the milestone work
still open, §1 onwards is everything that was never in a milestone, and the
whole file is ordered by what gates what.

`task.md` at the repo root is the **record of what was built** — around sixty
finished entries, several of which are the only written explanation of a
decision the code assumes. Read it for archaeology; add nothing open to it.

## Where the code is

| | |
|---|---|
| `packages/xp/` | The engine. Pure — **must not** import the app, React, three, Supabase or any browser global; it talks out through `@kxb/xp/host` |
| `src/app/xp/` | The host: routes, the R3F scene, the editor. **Must not** import the lounge — copy a component in and own it |

Both boundaries are enforced by lint and are not negotiable.

## Checking work

```
bun test packages          # the engine, the rules, the documents
bun run xp:shot <id>       # draw a document with the software rasteriser
bun run xp:bench           # re-measure the limits
bun run xp:arbiter         # play the server-decided rules against the local stack
node scripts/xp-two-players.mjs   # two signed-in browsers in one room (needs puppeteer-core)
```

**The runtime and the editor cannot be watched in the Claude Browser pane** — it
is always `document.hidden`, so `requestAnimationFrame` never fires and a canvas
stays black. That is not a bug to chase. Use `xp:shot` for anything drawn, and
DOM inspection for anything that is not a canvas.

**Two players is `scripts/xp-two-players.mjs`** — headless Chrome with
SwiftShader, and a session cookie per browser so each page has an `auth.uid()`.
One browser *per player*: a background tab is `document.hidden` too, so the
second player's frame loop never runs and they silently never join. It is the
only check here that runs the client, and it earned itself on the first run.
