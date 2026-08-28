# Known defects

Findings from the audit of 2026-08-07, covering the event-sourcing core, event
spaces, account initialisation with its policies, and battle/tournament logic.

Every entry below was found by reading the code and then **adversarially
verified** against it — a second pass whose job was to refute the claim. Entries
that did not survive that pass are recorded in §5 so they are not re-litigated.

**All thirteen were fixed on 2026-08-07**, except §3.2, which is left open and
says so. Each entry keeps its original description — what the defect *was* is the
part worth keeping, because it is what the code must not drift back into — and
ends with a **Fixed** note saying how. Line numbers are from before the fix and
drift; the described mechanism is the durable part.

---

## 1. Event spaces

### 1.1 Guest bans evict once but never prevent re-entry — HIGH

`src/app/g/[token]/enter.ts:38`

`banGuest` works exactly once. The `evict_on_ban` trigger deletes the guest's
`tenant_guests` and `world_occupancy` rows and they vanish from the room. Then
they click the same public link again: `enterAsGuest` validates `linkProblem`,
capacity, archived and `event_open` — and never asks `is_guest_banned()`. The
function exists only in `20260827000000_guest_bans.sql` and the generated types;
**it has no callers anywhere in `src/`**.

It would not help unchanged anyway. A returning guest is anonymous, so
`signInAnonymously()` mints a brand-new `guest_id`, and the fresh `tenant_guests`
row is inserted through `createAdminClient()`, which bypasses RLS entirely. The
person is back in the room seconds after being thrown out.

This is the exact failure the ban migration was written to prevent — "making a
removal stick".

**Fixed.** `enterAsGuest` now asks `is_guest_banned()` about whatever session is
standing at the door — anonymous or not — before the member shortcut and before
any identity is minted, and refuses with "You cannot enter this space." That is
the check the migration always assumed existed. What it buys is unchanged and
stated there: it stops the same session returning, not somebody who clears their
site data. The recourse against a determined person is still to revoke the link.

### 1.2 A guest link can be reported as working when its insert failed — MEDIUM

`src/domain/events/actions.ts:319`

`mintEventLink` runs `admin.from('guest_links').insert({…})` without inspecting
the returned error, then unconditionally returns `guestLinkUrl(…)`. `createEvent`
returns `{ ok: true, slug, guestUrl }` and the console shows the operator a link
to paste into an announcement. If the insert failed on any transient DB error,
that link 404s for every attendee and the operator gets no signal at all.

Every other insert in the same file checks `const { error }` on the same client.
This one is simply missed.

(A token collision is *not* a realistic trigger — `mintGuestToken` is 256 bits of
CSPRNG. Transient infrastructure errors are.)

**Fixed.** `mintEventLink` checks the error and returns `null`, and both callers
refuse rather than hand out a link with nothing behind it: "the space and its
event were created, but the guest link was not — mint one from the event page".

### 1.3 A failure after `CreateTenant` orphans the space and burns the slug — MEDIUM

`src/domain/events/actions.ts:145` (the try/catch), `:175` (the unguarded call)

`createEvent` claims the slug, then appends `CreateTenant` inside a try/catch
that releases the slug on failure. The next line — `runProjection(admin,
tenantsProjection, tenantId)` — is **outside** that catch. `runProjection`
throws on any checkpoint or handler error (`src/es/projection.ts:38, 61`), so a
transient failure there propagates as an unhandled server-action rejection.

The space now exists with `owner: 'none'` and zero members, and is invisible
everywhere: the events console lists from `event_spaces` (row never inserted),
the access page from `tenants_read_model` (row never projected), and
`requireTenant` 404s everyone before `loadTenantRow`'s self-healing re-projection
can run. Retrying with the same name collides on `tenant_slugs`.

**The fix is not to release the slug.** `tenant_slugs_delete_unused` allows
deletion only while `not tenant_has_events(tenant_id)` — once `CreateTenant`
lands the claim is permanent *by design*, and the operator-role client would be
blocked by RLS anyway. The defect is the unguarded `runProjection`: it should be
caught and reported in the same "created, but…" shape the `event_spaces` insert
already uses, or the backoffice needs a tenants-projection replay path.

The identical shape exists in `src/domain/tenants/actions.ts:189` for a user's
first space — see §3.3.

**Fixed.** The `runProjection` call is wrapped, and the failure is reported in
the file's own "created, but…" idiom — naming the tenant id to replay and saying
plainly that the slug is gone, so the operator does not retry into a collision
they cannot resolve.

### 1.4 The paid guest cap fails open when its RPC errors — LOW

`src/app/g/[token]/enter.ts:72`

```
const [{ data: limit }, { data: current }] = await Promise.all([…])
```

Only `data` is destructured; the `error` field is discarded. supabase-js returns
`{ data: null, error }` on a Postgres error, and `capacityProblem(null, …)`
means "no cap" — because NULL is genuinely how the SQL function signals *flag
off*. So a statement timeout or exhausted pool makes a billed concurrency
ceiling disappear at exactly the moment the space is busiest. `current ?? 0`
fails open the same way.

The occupancy path makes the same fail-open choice, but *deliberately*, behind an
explicit error check and a comment. Here it is silent, and it defeats something
a customer paid for rather than a cost heuristic.

(A network-level rejection would make `Promise.all` throw and fail closed. This
is about error *responses*.)

**Fixed.** Both RPC errors are captured and the door fails closed, worded as
"could not check whether there is room right now" rather than "this event is
full" — the second would be a lie, and the person would stop trying.

---

## 2. Battle and tournaments

The netcode doc's confirmation pattern was applied to two of these paths already
— race finishes are no longer latched before the server confirms, and errors
raised during play now render outside the panels that close at kickoff. The
findings below are the places the same hardening was never carried across.

### 2.1 `reportGoal` has no roster check — HIGH

`src/domain/battle/actions.ts:376-401`, decider at `aggregate.ts:614-648`

The doc comment above `reportGoal` promises "the roster check below means only
somebody actually in the match can report one at all". No such check exists —
not in the action, not in its `run()` helper, not in `executeCommand`. The
decider's `ReportGoal` branch checks only `status === 'live'`, `isScored(mode)`
and goal-id dedup; it never reads `command.actorId`. `ReportDefeat` and
`ReportFinish` both *do* throw for non-participants.

RLS does not stop it either: `events_insert_tenant` admits anyone with a
`tenant_role`, which includes every member and every admitted guest of the host
space. The dedup is defeated by minting a fresh UUID per call — exactly what the
legitimate client does.

So any spectator, or a losing player, can spam `reportGoal` with `side: 'red'`
until `football.scoreLimit` is reached; `scoredEndingOf` appends `BattleEnded`
with the fabricated winner in the same transaction, and the forged result flows
into friendly counts and tournament brackets.

**Fixed.** The decider now throws `not_a_player` unless `state.participants`
contains `command.actorId` — the check the doc comment always claimed. Thrown
rather than dropped, unlike the two guards above it: a report from outside the
roster is not a mid-frame timing accident. Two tests cover it, including the one
that shows the id dedup was never what kept a spectator out.

### 2.2 `onDefeated` is fire-once with no catch — HIGH

`src/app/t/[slug]/battle/[battleId]/battle-room.tsx:339-349`

```
void reportDefeat(slug, initialBattle.id, by).then((result) => { … })
```

No `.catch`, no retry. The scene calls `onDefeated` exactly once, at the instant
health hits zero, and in elimination modes `canRespawn` is false so the moment
never recurs — no second `takeDamage` can arrive, because attackers skip downed
targets and lava burn is gated on `!dead`.

If the action rejects, the rejection is unhandled, no error is shown, and
`PlayerDefeated` is never appended — while every client already renders the
victim on the floor from the 0-health broadcast. Elimination modes have no clock,
so there is no `CallFullTime` fallback. The match stays `live` indefinitely
unless the downed player finds the menu and forfeits. An exhausted
`ConcurrencyError` takes the same path: `ok: false` sets an error with nothing
able to re-trigger.

`onGoal` got a 3-attempt retry loop with backoff and a catch; `onFinish` got a
catch plus a re-cross retry. The one report elimination matches depend on to end
never got either.

**Fixed.** `onDefeated` now runs the same 3-attempt loop with backoff that
`onGoal` does, distinguishing a decided refusal (said out loud, dropped) from a
rejection (retried), and ends by telling the room the match may not close on its
own. Safe to repeat: a defeat for somebody already down returns no events.

### 2.3 `playMatch` is broken for two tournament modes the UI offers — HIGH

`src/domain/tournament/actions.ts:230-240`, `:313-315`

`createTournament` accepts every battle mode and the panel offers `football` and
`one_vs_all`. But `playMatch` calls `createBattle(slug, name, state.mode,
state.worldId)` with **no settings** — the parameter is optional in zod, so:

- **Football:** the battle decider throws *"A football match needs a clock"*.
  `TournamentCreated` records no settings, so there is nothing to carry and every
  retry fails identically. Entrants cannot withdraw once live, so no match can
  ever be staged; cancelling is the only exit.
- **`one_vs_all`:** `playMatch` hands out `['red','blue']`, which `isValidSide`
  rejects for that mode. Even when the join is skipped, the battle always ends
  with a `champion`/`challengers` winner, and `recordMatchResult` maps only
  `red → slot.a` and `blue → slot.b` — so `winner` is null and the answer is
  permanently *"That match was a draw — it needs replaying"*.

`startRematch` carries football and race settings across explicitly, with a
comment describing this exact failure. `playMatch` never got the same treatment.

**Fixed**, in two parts. `TournamentCreated` now records the format the bracket
is fought under — filled from the mode's defaults, since the setup form has no
control for it — and `playMatch` hands it to `createBattle`, falling back to the
defaults for brackets created before the field existed. Sides now come from
`sidesFor(mode)` instead of a hardcoded `['red','blue']`, so `one_vs_all` gets
champion and challengers and the modes with no sides get neither.

### 2.4 `recordMatchResult` trusts a side↔slot mapping nothing enforces — HIGH

`src/domain/tournament/actions.ts:241-250`, `:313-315`

`playMatch`'s comment says it "enters *both* entrants onto its roster", but the
code only joins the caller, and only when they are one of the two entrants —
`joinBattle` can only ever join the session user. The other entrant joins through
the battle room like anyone else, and a bracket battle is an ordinary open battle
with no roster restriction, so **any** member of the space can join and pick
either side.

Then `recordMatchResult` maps `red → slot.a`, `blue → slot.b`. Concrete failure:
the host is not an entrant, so nobody is auto-joined; `slot.b` happens to pick
red, `slot.a` picks blue, red wins, and the bracket advances the player who lost.
In ffa a third member can win outright, producing a `winner_id` that is neither
slot — `RecordMatchResult` then throws *"That entrant is not in that match"* with
no way to correct it.

**Fixed.** A `side` winner is now resolved against the battle's own roster —
`battle_participants` for that side, intersected with the two entrants — instead
of the unenforced convention. Exactly one match is the only answer acted on;
both or neither leaves the slot undecided, which §2.5's replay path can now
resolve. Open joining of a bracket battle is unchanged, but it can no longer
advance the wrong player.

### 2.5 A drawn bracket match deadlocks the tournament permanently — HIGH

`src/domain/tournament/actions.ts:223-225`, `aggregate.ts:193-194`

`recordMatchResult` says a draw "has to be replayed, which is what a draw means
in a knockout". There is no replay path. Three gates close together:

- `playMatch` short-circuits and returns the existing, ended, unjoinable battle
  once `slot.battleId` is set;
- the decider's `AttachMatchBattle` silently no-ops when `match.battleId` is set;
- no command detaches or resets a slot — there is no Detach/Replay/Reset in
  `commands.ts`, and the bracket UI does not even surface the draw case.

With `slot.winner` stuck null, `extend()` cannot build the next round, `champion()`
stays null, and the tournament is `live` forever. Cancelling discards every
result.

**Fixed.** A `ReplayMatch` command and `MatchBattleDetached` event let the host
let go of a match's battle so `playMatch` can stage a fresh one; the bracket
panel grows a "Replay it" button beside "Take the result". Guarded on both
sides: the decider refuses a match that already has a winner, since later rounds
are derived from it, and the action refuses one whose battle did produce a
mappable winner — a replay is for an inconclusive match, not an escape from a
defeat. The battle itself is untouched; the bracket just stops pointing at it.

Reachable draws are the **scored and race** routes: a football match level at
full time, an emptied pitch at 0-0, or a race nobody finishes. Elimination modes
cannot draw this way — a defeat is processed one at a time and leaving a live
match is recorded as a defeat precisely to prevent it.

### 2.6 The full-time whistle is latched before it succeeds — MEDIUM

`src/app/t/[slug]/battle/[battleId]/battle-room.tsx:526-538`

`whistled.current = true` is set *before* the request, the promise has no
`.catch`, and the ref is never reset — so each client gets exactly one attempt
per mount, and every failure is silently dropped (`if (result.ok)` discards
concurrency exhaustion along with the expected "somebody else got there first").

The "every client races to whistle" redundancy collapses exactly when it is
needed: a football match whose opponents walked out stays live with one player,
so there is one whistling client. If its single attempt rejects, the match sits
at 0:00 indefinitely — `CallFullTime` is the only way a clocked match ends absent
a score limit, and the server has no timer.

Recovery is real but accidental: any freshly mounted client — a spectator
arriving, a reload — resets the ref and retries. The adjacent `crossFinish` path
had this same latch-before-confirmation bug and it was fixed there with
catch-and-unlatch.

**Fixed.** The whistle unlatches on rejection, so the next tick asks again — the
effect already re-runs every second while the clock ticks. A decided answer,
including somebody else getting there first, still keeps the latch down.

---

## 3. Accounts

### 3.1 `redeemInvite`'s race-loss signal is ignored by both callers — LOW

`src/domain/access/gate.ts:185`, callers at `(auth)/actions.ts:173` and
`auth/callback/route.ts:113`

The conditional update (`.eq('uses', current.uses)`) correctly resolves two
simultaneous redemptions to one winner and returns `false` to the loser — the
docstring says "so the caller can refuse". Neither caller looks at the return
value. Both `await redeemInvite(…)` and discard it, so both accounts survive and
the rationing the conditional update exists to enforce is decided and then never
acted on.

The same window exists sequentially: N people can each pass `mayRegister` and
create unconfirmed accounts before the first redeem lands.

**Fixed.** `Admission` now carries `required` — true only when the door was shut
and the invite is what admitted them — and both callers act on a lost race in
that case: the password path discards the account it just made, the OAuth path
takes the same undo-and-waitlist route a refusal does. Redemption on the password
path is additionally gated on GoTrue returning a non-empty `identities`, so an
already-registered address still gets the enumeration-safe "check your mail" and
never the invite refusal.

### 3.2 A stale last-space cookie diverts new accounts away from `/onboarding` — LOW

`src/proxy.ts:143`, `src/domain/tenants/last-space.ts:112`

The proxy writes `LAST_SPACE_COOKIE` for every signed-in `/t/{slug}` request
*before* any membership check. A brand-new user who clicks a friend's workspace
link right after `/welcome` gets the cookie set and is then bounced by
`requireTenant` — which, being a Server Component, cannot clear it.

From then on `landingPath` short-circuits: the `/onboarding` branch requires
`!slug`, and the membership check for the cookie's slug fails into `/tenants`
without ever clearing the stale value. The first-space creation flow the tour
exists for is skipped for exactly the empty accounts it targets.

Signing out calls `forgetLastSpace()` and restores the routing — but sessions
persist, so a user who never presses Sign out is diverted on every visit.

**Left open**, deliberately, and it is the one thing on this page that is. The
cookie is written by the proxy and read by a Server Component that cannot clear
it, so every fix is a real decision rather than a repair: check membership in the
proxy (a DB read on every `/t/` request, and the proxy is explicitly not the
authorization boundary), clear it from a Route Handler, or let `/tenants` write
it back. The failure is a person landing on the picker instead of the tour, which
is worth less than picking the wrong one of those.

### 3.3 A projection failure strands a user's first space — LOW

`src/domain/tenants/actions.ts:189`

The same unguarded `runProjection` as §1.3, on the self-serve path.
`TenantCreated` + `MemberJoined` land and the trigger writes `tenant_members`
synchronously, then `runProjection` throws outside the try/catch. The user sees
an error; no `tenants_read_model` row exists; retrying the form hits the
`tenant_slugs` unique violation and says *"The URL is already taken"*, and
releasing the slug is impossible because `tenant_has_events` is now true.

`landingPath` sends them to `/tenants`, where `listMyTenants` silently drops
memberships with no projected row — its comment says "the projection catches up
and it appears on the next load", but nothing on `/tenants` runs
`tenantsProjection`. The only self-heal is `loadTenant`'s read-miss
re-projection, reachable only by visiting the space they cannot see.

**Fixed**, and the opposite way round from §1.3, which is the point. Here the
action ends by redirecting to `/t/{slug}`, and `loadTenantRow` re-projects on a
read miss — so arriving *is* the repair. The projection failure is caught and
swallowed, and the person is sent into the space they now own. §1.3 has no such
landing, which is why it reports instead.

---

## 4. What is still worth doing

The fixes above are each local to their call site. Two of them are the same
defect twice, and that is the part not yet addressed.

**A shared dispatcher.** §1.3 and §3.3 are one bug in two places, and §1.2 is its
sibling. Every domain repeats `executeCommand → runProjection → revalidatePath`
through its own private `dispatch()` helper, and the projection call is unguarded
in more than one of them. Each was fixed where it stood — reporting in one case,
swallowing in the other, because the right answer genuinely differs by whether
the action lands somewhere that self-heals. A shared dispatcher that made "the
command committed but the read model did not" an explicit, named outcome would
stop the next one being written. See [architecture.md §7](../architecture/event-sourcing.md).

**Bracket battles are still open to anyone.** §2.4's wrong-winner half is fixed
by reading the roster, but nothing restricts `JoinBattle` on a tournament match
to its two entrants. A third member can still join and, in ffa, win — which now
leaves the slot undecided and replayable rather than permanently wedged, but is
still not what a bracket match should allow.

**The whistle has no server-side backstop.** §2.6 retries properly now, but
`CallFullTime` still depends on some client being on the page when the clock runs
out. A match everybody closed the tab on stays live. The log cannot notice time
passing, so this needs something outside it.

---

## 5. Claims that did not survive verification

Recorded so they are not found and re-argued.

- **"An invite is burned against the obfuscated user when signing up with an
  already-registered email."** No invite is burned: `last_redeemed_by` is a FK to
  `auth.users`, so the update fails and rolls back atomically, leaving `uses`
  unchanged. What the submitter sees is the standard enumeration-protection
  response. (True residue: `redeemInvite`'s failure was swallowed, so the audit
  trail lost the attempt silently — a smaller version of §3.1, and closed by the
  same fix, which now skips redemption entirely for an obfuscated user.)
- **"The OAuth callback treats any never-signed-in account as newly created."**
  `looksNewlyCreated`'s null check never fires: GoTrue stamps `last_sign_in_at`
  during the code exchange itself (verified empirically against this project's
  local gotrue). An admin-invited account signing in with Google shows a large
  created→signed-in gap and never reaches the waitlist gate or the fenced
  deletion. Only the intentional, documented 5-second window remains.

One claim — an inline `::uuid` cast in the events insert path — could not be
checked, because its verification agent hit a spend limit mid-run. It is
**unverified in either direction** and is not listed above.
