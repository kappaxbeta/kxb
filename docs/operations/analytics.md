# Events, funnels and A/B tests

How the analytics work, how to configure them, and how to fire an event from
code.

Three surfaces in the backoffice:

| Where | What it answers |
| --- | --- |
| `/ovaloffice/analytics` | Traffic: how many people, from where, looking at what. |
| `/ovaloffice/experiments` | A/B: which arm of a test gets more click-throughs. |
| `/ovaloffice/experiments/funnels` | Where people stop. |

---

## 1. The one constraint everything else follows from

**A visitor is a daily-rotating salted hash of their address and user agent.**
No cookie identifies anybody, the raw address is never stored, and Monday's hash
for a person is an unrelated string to Tuesday's. (The one analytics cookie is
the *opt-out* in section 2, which holds a choice and no identifier.)

That is a deliberate privacy decision, not an oversight — the cookie banner
promises essential cookies only, and a stable cross-day identifier is a
behavioural profile whether or not a cookie carries it. Three consequences, and
every one of them has to be repeated wherever the numbers are shown:

- **"Unique visitors" is per-day, summed.** Somebody who came on Monday and
  Tuesday counts twice. The reports label the column **visitor-days** rather
  than "visitors" for exactly this reason. Rates always divide by *views*,
  which is a denominator anybody can reason about.
- **Funnels only span one day.** A funnel is a claim about one person doing
  several things, so a day is the longest window it can honestly cover.
  Somebody who read the pricing page on Monday and subscribed on Wednesday is
  **not** in the "subscribed" step. This under-counts conversion and never
  over-counts it.
- **A/B arms are drawn per visit, not per visitor.** There is no cookie holding
  a bucket, so a returning visitor may see the other arm. Sound for comparing
  *rates* between arms; useless for anything per-person.

Widening the window is a change to the banner and the privacy page before it is
a change to the code.

---

## 2. Not counting yourself

**`/notme` is a switch, per browser: count this browser, or do not.**

It exists because the person who builds this site visits it more than anybody,
from more browsers than anybody — several profiles, a phone, a private window,
one person checking whether a change landed — and every one of those visits is a
row that looks exactly like a stranger's.

It follows directly from section 1. Because the visitor hash is deliberately not
linkable across days, **nothing can be subtracted after the fact**: there is no
"that was me" to filter on later, and there was never meant to be. The only
place the distinction can be made is *before the insert*, and the only thing
that survives a browser restart to make it is a cookie.

### Using it

Open `/notme` in each browser you test from and click the button once. No
account needed, and the state is shown in words before it offers the next
action. There is a link to it under the heading on all three analytics
surfaces, because that is where the thought occurs.

The visit that turns counting off is not itself counted — `/notme` is in
`UNTRACKED` in `track.ts`, alongside `/api/` and the backoffice.

### How it works

| | |
| --- | --- |
| Cookie | `unkown_dnt`, value `1`, httpOnly, five years |
| Set by | Two server actions in `app/notme/actions.ts`, nothing else |
| Checked by | `app/api/analytics/route.ts`, **before it reads the request body** |
| Stops | Page views *and* events — both go through that one endpoint |

**A cookie rather than localStorage, and this is the whole point.** The check
has to run where the row is written, which is the server. A value in
localStorage would have to be read by the page and *sent* with the beacon —
which means the browser asking not to be counted, and a client that can ask can
also be wrong silently, when a script fails to load or a page fires the beacon
before it has read anything. A cookie rides along with the request itself, so
the suppression happens in the same place the decision to store is made.

`httpOnly` because no page script has any business reading it. The exact value
`1` is required, so a cookie "deleted" by writing it empty reads as counted
again rather than as a value we do not recognise.

### It is offered to everybody, and that is deliberate

`/notme` is public and the privacy notice links it from both the cookie table
and the Reichweitenmessung section. A cookie whose only effect is that *less*
gets stored, set only by an explicit click and containing no identifier, is the
textbook § 25(2) no. 2 TDDDG "strictly necessary for a service the user
expressly requested" case — it is the opposite of the thing consent banners
exist for. Hiding it would also have made the notice's own claim about analytics
cookies awkward to defend.

### What it does not do

- **Per browser, not per account.** That is what a cookie can promise, and it is
  the right unit: a signed-out test profile has no account to hang a preference
  on, and it is exactly the profile whose visits need excluding. Clearing
  cookies undoes it.
- **It is not retroactive.** Rows already written stay. See above — they cannot
  be identified as yours. A clean baseline means truncating `page_views` and
  `analytics_events`, not filtering them.

---

## 3. Firing an event from code

```tsx
'use client'
import { track } from '@/app/components/track'

<button onClick={() => { track('battle_start', { mode: 'football' }); start() }}>
  Start
</button>
```

`track()` never throws, never blocks and never awaits. A button whose handler is
`track(); doTheThing()` does the thing whether or not the beacon lands, and the
request uses `keepalive` so it survives the navigation a click usually causes.

**You do not need to pass the A/B arm.** `track()` reads it off the DOM — the
page stamps `data-variant`, and a button deep inside a page needn't know an
experiment is running above it.

### CTA clicks are already tracked — do not add them by hand

`CtaTracker` in the root layout is one delegated listener keyed on a link's
**destination**. Any same-origin `<a>` pointing at `/demo`, `/signup`,
`/waitlist`, `/events`, `/play`, `/create` or `/share` fires `cta_click`
automatically.

This is on purpose. A `<TrackedLink>` wrapper is the thing a redesign quietly
drops — somebody rebuilds the hero with a plain `<Link>` and the only symptom is
a number that stops going up, which nobody notices. A destination cannot change
without the CTA ceasing to be that CTA.

To tell two links to the same place apart, add `data-cta="hero-demo"`.

---

## 4. Adding a new event

Events are a **closed vocabulary**. Add to `EVENTS` in
[`src/domain/analytics/events.ts`](../../src/domain/analytics/events.ts):

```ts
{ name: 'world_publish', hint: 'A world went into the public catalogue.' },
```

An unregistered name is dropped by the endpoint, not stored. That is worth the
friction: free event names are how an events table stops being queryable inside
a month, because `cta_click`, `ctaClick` and `cta-click` become three rows for
one thing and the funnel counting two of them is wrong in the way nobody
notices — it still returns a number.

### What must never go in `props`

Never anything a person typed, never anything identifying: no names, no email
addresses, no message text, no search terms, no ids of other people. An event
says *what kind of thing happened*; props say *which control it was*.

`sanitiseProps` enforces the shape — at most 6 keys, keys `^[a-z][a-z0-9_]*$`,
values scalar and ≤64 chars, nested objects refused outright. It cannot enforce
the *meaning*, so that part is on whoever adds the call site.

---

## 5. Configuring a funnel

Funnels are declared in `FUNNELS` in the same file. No migration needed — the
steps are passed to SQL as jsonb at query time.

```ts
{
  id: 'stranger-to-space',
  label: 'Stranger → space',
  steps: [
    { label: 'Clicked a CTA',       names: ['cta_click'] },
    { label: 'Opened the demo',     names: ['demo_open'] },
    { label: 'Asked for an account', names: ['demo_join_click', 'signup_start'] },
    { label: 'Signed up',           names: ['signup_complete'] },
  ],
}
```

**A step is satisfied by any of its names.** That is what lets "asked for an
account" mean either of two doors without the funnel growing a branch.

**Each step requires every step above it.** Without that containment a later
step could show more people than an earlier one — the classic broken funnel
chart.

**Order within the day is not required.** The events are fired by pages people
move between freely: somebody who opens the pricing section, wanders into the
demo and comes back to subscribe has done the funnel, in a sequence no ordering
rule would accept.

### Reading the three columns

| Column | Meaning |
| --- | --- |
| Count | Visitor-days who reached this step **and every step above it**. |
| Middle % | Share of the **step above** that got here. **This is the one that says where the leak is.** |
| Right % | Share of everyone who entered the funnel. |

The "biggest drop" badge marks the worst middle-% step. The first step never
qualifies — it has nothing above it to leak from.

---

## 6. Configuring an A/B test

Declare it in `EXPERIMENTS` in
[`src/domain/analytics/experiment.ts`](../../src/domain/analytics/experiment.ts):

```ts
{
  id: 'look',
  question: 'Which art direction gets more people through to the demo?',
  arms: [
    { id: 'bento', label: 'Bento — neon cards on the starfield' },
    { id: 'dusk',  label: 'Dusk — pastel washes and a block heap' },
  ],
}
```

Keep this list **short**. Two experiments on one page at once means every number
in both reports is a mixture of four things, and nobody has the traffic to read
that. Finish one, delete it, start the next.

### Wiring a page into it

The page resolves an arm and stamps it. Both arms must render **identical
markup** — the difference belongs in CSS under `[data-look=…]`:

```tsx
const { look, variant } = await resolveLook((await searchParams).look)

<div className="bento" data-look={look} data-variant={variant ?? undefined}>
```

Identical markup is the whole design. An A/B test whose arms are two component
trees is a test of two codebases, where the arm that loses is also the arm that
quietly stopped getting copy fixes.

Precedence: **`?look=` in the URL** beats **the staff pin cookie** beats **a
fair draw**. The URL wins over the pin so a pinned admin can still follow
somebody's link and see what it shows.

### The goal event

`GOAL_EVENT` in `experiment-report.ts`, currently `cta_click`. When a second
kind of experiment arrives this becomes a field on `Experiment`.

### Why no winner is shown

No leader is named until **every arm has 200+ views**
(`MINIMUM_VIEWS_PER_ARM`). Two arms forty visits in will always differ and the
difference is noise every time.

The floor is a fixed count rather than a significance test on purpose: printing
a p-value next to forty visits invites exactly the reading it is meant to
prevent. The honest answer at low traffic is "not yet", and a floor says that
without dressing it up as statistics.

### Previewing an arm

The **Preview** button on `/ovaloffice/experiments` sets `kxb_arm`. It is set by
exactly one server action, behind `requireBackofficeAdmin` — a visitor who has
never been through the backoffice never receives one. That is the whole basis on
which it coexists with a banner promising essential cookies only.

Not `httpOnly`, deliberately: it holds no secret. The worst a forged value does
is show its owner the other layout, and `parseVariant` refuses any value that is
not an arm we issued.

---

## 7. Where everything lives

| File | What |
| --- | --- |
| `domain/analytics/events.ts` | Event vocabulary, prop sanitising, funnel definitions |
| `domain/analytics/experiment.ts` | Experiment registry, arm assignment, `experiment:arm` format |
| `domain/analytics/pin.ts` | The staff preview cookie |
| `domain/analytics/opt-out.ts` | The `/notme` cookie: name, lifetime, `isOptedOut` |
| `app/notme/` | The switch itself — page and the two server actions |
| `domain/analytics/track.ts` | Turning a request into a row. Server-only |
| `domain/analytics/experiment-report.ts` | A/B rates, the sample-size floor |
| `domain/analytics/funnel-report.ts` | Step survival and drop-off |
| `app/components/track.ts` | `track()` — the client API |
| `app/components/cta-tracker.tsx` | The delegated CTA listener |
| `app/components/look.ts` | `resolveLook()` — URL / pin / draw |
| `app/api/analytics/route.ts` | The beacon endpoint, page views and events |

Migrations: `20260925000000_analytics_events`, `20260926000000_experiment_report`,
`20260927000000_funnel_report`.

---

## 8. Known gaps

- **Nothing fires most of the vocabulary yet.** `cta_click` is automatic; the
  other seventeen events are declared and unwired, so their funnel steps read
  zero. Adding them is a `track()` call per call site.
- **No per-experiment goal event.** One constant for all of them.
- **No significance test.** A fixed view floor instead — see above.
- **Bots are filtered only by the page-view path rules**, so an event fired by a
  scripted client counts.
- **The opt-out has to be set once per browser**, and is lost with the cookies.
  Nothing reminds you — a browser that quietly rejoined the numbers looks like
  traffic. If a figure jumps for no reason you can name, check `/notme` in the
  browser you were testing from.
