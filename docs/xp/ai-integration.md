# AI integration in the XP creator

Generating levels from a written brief, what that costs, and what it is
deliberately not.

Nothing here is built. This is the argument first, so that a session which
disagrees with it can say where, and so the two-session estimate at the bottom
is something you can check rather than trust.

**This is deliberately last, and it should stay last.** The backlog entry is
[xp-backlog.md](backlog.md) §9, and everything in §1 through §8 is a gate in
front of it — the editor first, then modes and caps, server authority, device
presentation. The reason is in that entry and it is worth repeating here so
nobody starts from this document alone: a generator produces *starting points*,
and a starting point is only worth having if what you do next — open it and
change it — is pleasant. Built before the editor is good, this buys a faster
route to a level nobody enjoys editing, and then the generator looks like the
problem when it is not.

Nothing here rots while it waits; none of it depends on the editor's shape. Two
numbers should be re-checked rather than inherited when it does start, and §4
says which.

---

## 0. The distinction everything rests on

**Claude does not produce meshes, and no amount of prompting changes that.**
Text-to-3D is a different genre of model — Meshy, Tripo, Rodin, Stability — and
this document is not about them. Section 5 covers why they stay out for now.

What Claude is good at is **composition**: choosing from a catalogue that
already exists and arranging it so the arrangement means something. The XP
creator has 1,300-odd models across four packs, a lattice, and an editor with a
vocabulary for placing things in it. The missing piece was never the art. It is
that an empty lattice is the hardest thing to start from, because *a place* is a
shape you recognise long before you can draw one.

That is the same observation [templates.ts](../../packages/xp/src/document/templates.ts)
already acts on. `TEMPLATES` solved it for five fixed shapes. This is the same
solution for the shape somebody actually had in mind.

So: **a brief in, a document out, opened in the editor with a full undo stack
behind it.** A starting point, in exactly the sense the templates are one — not
a finished thing, and not something you fill in.

---

## 1. A program, not a document

The obvious design is to have the model emit an `XpDocument`. It is wrong, and
it is worth being exact about why, because it looks like the simple option and
the failure is not immediate.

`MAX_PLACEMENTS` is 8,000. A filled world serialised as JSON placements runs
past 150,000 output tokens. That is not just expensive — at that size the output
is unreviewable, uneditable by hand, and it breaks silently the day a pack
renames a model.

**The model emits a list of edits instead**, in the vocabulary
[edit.ts](../../packages/xp/src/document/edit.ts) already exposes: `line`, `box`, `outline`,
`place`, `addEntity`. Sixty to a hundred and fifty operations. About 900 output
tokens. Four properties follow from that choice:

**Safety is structural, not checked.** A program cannot describe a world the
editor could not have built, because it is made of the editor's own moves. The
allow-list is `catalogue.ts` applied per operation — the same one the editor
enforces, not a second copy that drifts.

**It is reviewable.** A hundred lines each carrying an intent can be read by a
person. Eight thousand coordinates cannot. This is precisely the argument
`starters.ts` makes in the lounge builder for generating starters rather than
shipping them as files: *the generators are twenty lines each, they say what
they mean.* Same argument, same reason.

**It is editable.** "Make the tower taller" changes one `height` field. It does
not re-roll the world and throw away the parts the user liked, which is the
failure mode that makes most generate-and-regenerate tools exhausting to use.

**It replays deterministically.** Program → `edit.ts` → `XpDocument`, through
the code the editor itself runs. There is no second implementation of what a
placement means, so there is no second implementation to keep in step.

### The `note` field

Every operation carries a short `note` saying what it is for. This looks like
documentation and is not: it forces an intent per stroke, and the difference
between a program written with one and without one is the difference between a
place and blocks in fog. It costs perhaps eighty tokens per operation of
thinking and it is the cheapest quality lever in the design.

### Schema

```ts
const opSchema = z.object({
  op: z.enum(['line', 'box', 'outline', 'place', 'entity']),
  model: z.string(),                  // checked against the catalogue
  from: cellSchema,
  to: cellSchema.optional(),          // dragged ops only
  height: z.number().int().min(1).optional(),
  note: z.string().max(80),
})

const programSchema = z.object({
  name: z.string().min(1).max(60),
  packs: z.array(z.string()).min(1),
  ops: z.array(opSchema).max(250),
})
```

Structured outputs (`output_config.format` with `zodOutputFormat`) rather than
parsing prose. There is then no bad-JSON retry loop to write, and no second
description of the format kept in step by hand.

---

## 2. Where the code lives

The lint boundary decides this, and it decides it well.

| Piece | Home | Why there |
|---|---|---|
| Schema, `execute(program)` | `packages/xp/src/generate.ts` | Pure. No network, no key. Runs under `bun test packages` alongside the existing tests. |
| Palette, prompt, few-shots | `src/app/xp/_forge/prompt.ts` | Server-only, and changes far more often than the executor does. |
| The Anthropic call, jobs, credits | `src/domain/forge/` | Talks to the outside, which `packages/xp` may not. |

The executor living in `packages/xp` is the part that matters. The riskiest code
here is the thing that turns untrusted model output into a document, and putting
it in the package means it is testable headlessly, with no API key within reach
of it, in the same run as everything else.

---

## 3. The loop

1. **Brief in. Check credit, then write the job — never the other way round.**
2. A job row, claimed by a worker. Copy the shape of
   [renders/jobs.ts](../../src/domain/renders/jobs.ts): four states, `MAX_ATTEMPTS`
   of three, a claim function. That queue works and this is the same problem;
   inventing a second one would be two queues to reason about at 3am.
3. Claude returns a program. Validate. **An operation naming an unknown model is
   dropped, not fatal.** One bad id out of a hundred and forty operations should
   cost a bench, not the world.
4. `execute()` → `XpDocument` → `parseXp` as the final gate. If a generated
   document will not parse, that is a bug in the executor and the job should
   fail loudly — persisting something the runtime will choke on is worse than
   failing.
5. **`bun run xp:shot <id>`.** The software rasteriser draws it through the same
   transform the renderer uses. It already exists, it is headless, it costs
   nothing, and it is exactly the picture the next step needs. This is most of
   why the estimate is two sessions rather than six.
6. The shot goes back as an image: *here is what you built; what is wrong with
   it?* The model returns a **correction program** containing only the operations
   that change. One or two rounds.
7. The document opens in the editor.

Step 6 is what separates a floor with some walls on it from something worth
opening. It is also where the money goes — see §4.

The Browser pane cannot verify any of this; it is always `document.hidden`, so
`requestAnimationFrame` never fires and the canvas stays black. `xp:shot` and
`bun test packages` are the whole verification story, which is a happy accident
of this feature needing exactly the tool that was built for that constraint.

---

## 4. Model, cost, price

**Model: `claude-opus-5` at `effort: 'medium'`.**

Spatial composition is multi-step reasoning — if the lighthouse is north the
quay goes south, so the market belongs between them — and that is exactly where
a cheaper model does not fail *visibly*. It produces symmetrical, tidy, lifeless
layouts. That is a worse failure than an error, because no test catches it and
the person who notices is the customer. Opus 5 is unusually strong at the lower
effort levels, so `medium` is not a compromise made for cost.

Costs assume a ~6,000-token cached system prompt, a ~900-token program, adaptive
thinking, and a `xp:shot` image in the review rounds.

| | one pass | three passes with review |
|---|---|---|
| **Opus 5** | ~$0.13 | **~$0.38 (≈ €0.33)** |
| Sonnet 5 | ~$0.08 | ~$0.23 |
| Haiku 4.5 | ~$0.03 | ~$0.08 |

**Note where the cost actually is: the review loop triples it.** The lever for
spending less is two rounds instead of three, not a smaller model. Reaching for
Haiku here saves eight cents and sells the wrong product.

### The palette, which is a cost lever and a quality lever at once

Do not put the whole catalogue in the prompt. A curated palette of ~150 models
cuts the prompt from ~25,000 tokens to ~6,000 — and it produces *better* output,
because a model choosing among forty near-identical KayKit names wavers, and the
materials stop being coherent across the level. Fewer, better-labelled choices
is the same reason the lounge palette is 58 blocks rather than 1,308.

Cache it. `cache_control` on the system block, reads at a tenth of the price,
and nothing variable — no date, no user id, no `Date.now()` — above that
breakpoint. The Opus 5 cache minimum is 512 tokens, so 6,000 clears it easily.

### Price: €10 buys 10 generations

At €0.33 each that is €3.30 of cost against €9.60 after Stripe (~1.5% + €0.25),
a little under a two-thirds margin, with no VAT on top while §19 holds. It sits
beside the €5/€10 space tiers, and "a euro a world" is a number nobody has to
work out.

**Selling 25 for the same €10 is the version to refuse.** It leaves about €1.35
on Opus 5, and the pressure that creates — drop to a cheaper model, cut the
review pass — degrades the exact thing being paid for.

### Caps

A loop without a ceiling is the only real cost risk here, and three cheap things
close it:

- `task_budget` on the request. The model sees the countdown and paces itself,
  finishing rather than being cut off. Minimum 20,000 tokens.
- `max_tokens` above it, which the model does not see. The hard stop.
- The credit check before the job exists.

**A failed job writes no spend.** Retries inside `MAX_ATTEMPTS` are our cost,
not the user's — they are our bug.

---

## 5. What this is deliberately not

Stated so nobody plans around them, in the manner of
[xp-creator.md](creator.md) §17.

**No generated scripts.** `setScript` exists and QuickJS is a real sandbox, so
the instinct is that generated scripts are safe and therefore fine. They are
safe. They are still out, for a different reason: a level that is wrong is a
building in the wrong place, and a *script* that is wrong is a game that does
not work, written in a language the person who asked for it did not write and
cannot debug. Those need different review affordances, and the second kind has
not been designed. Levels first, and revisit only when levels are boring.

**No generated art, and no text-to-3D pipeline.** §0 covers why Claude cannot;
the reason not to bolt on Meshy or Tripo *yet* is different. The API call is the
easy part. The work is normalisation — scale, pivot, Y-up, polycount, and above
all material style — and without it the output looks foreign standing next to
KayKit, which is worse than not having the model at all. It is a real entry for
later, on its own, once levels work. It also reopens §16.5, which is currently
answered cleanly because every pack in `public/` is CC0; generated meshes are
not obviously anything.

**No entity behaviour beyond placement.** Putting entities and checkpoints in
the world is composition. Wiring triggers and verbs into a working mode is
authoring, and it has the same wrong-when-it-is-wrong problem as scripts.

**No terrain.** The world is a lattice; §17 already says so and nothing here
changes it.

---

## 6. Before this can start

In this order. The first two are half a session together and they de-risk
everything after them.

1. **Few-shot programs, as a test.** Take two existing `TEMPLATES` entries,
   express them as programs, assert the executor reproduces the same document.
   That validates the entire approach before a single token is spent — and the
   programs it produces *are* the few-shot examples the prompt needs. Do this
   first; if it is awkward, the design is wrong and it is better to find out now.
2. **The curated palette.** ~150 models across `proto` and `platformer` with
   honest labels. Biggest single quality lever, per §4.
3. **A credit ledger.** `credits_purchased` / `credits_spent` as a stream, the
   balance as a projection — which is how everything else here already works.

---

## 7. Open

**Does the brief choose its packs, or is the set fixed?** Letting the model pick
is more flexible and makes the palette cache worse. Leaning toward a fixed set
per generation, chosen by one cheap call before the expensive one.

**Is a correction round billed as a generation?** Leaning no. The three rounds
are one product, and metering them separately teaches people to accept the worse
first draft — which is the opposite of the point.

**Backoffice or creators?** §2.0 of [xp-creator.md](creator.md) says
backoffice-only, and that decision has not expired. The pricing in §4 assumes it
eventually does not hold, which makes this document partly a bet on that
changing. If it does not change, everything above still stands except §4, and
this becomes a tool rather than a product.
