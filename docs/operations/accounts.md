# Accounts and access

Four doors create an account, one gate decides who may walk through, and a chain
of trigger-then-cookie-then-event decides where they land. Underneath all of it,
RLS is the only barrier.

Read this before touching sign-up, the welcome wizard, `landingPath`, or any
policy. It is written against `src/domain/access/gate.ts`, `src/app/(auth)/`,
`src/app/auth/`, `src/domain/tenants/last-space.ts`, `src/proxy.ts` and the
policy migrations.

The machinery underneath is in [architecture.md](../architecture/event-sourcing.md); known defects
in this area are in [audit.md](audit.md).

---

## 1. Why RLS is the whole story

`20260729010000_api_grants.sql` grants `usage` on `public` and `all` on every
table, sequence and routine to `anon`, `authenticated` and `service_role`,
including default privileges. Table grants are wide open on purpose, so **RLS
policies are the sole access control** for API roles.

Two consequences follow, and both are used deliberately throughout:

- *RLS on, zero policies* means **service-role only** (`service_role` has
  BYPASSRLS). That is how `stripe_webhook_events` and the `uploads` storage
  bucket are locked down.
- *Absence of a policy for one operation* is an enforcement mechanism, not an
  omission — it is how the event log stays append-only and how `tenant_members`
  stays writable by nothing but its trigger.

---

## 2. The four doors

Everything that decides *may this address get an account* lives in
`src/domain/access/gate.ts`. A gate covering only some of the doors would be
decoration, so all three self-serve paths ask the same question in the same
words, and the fourth is exempt on purpose.

| Door | Where the gate runs | Note |
|---|---|---|
| **Password** (`(auth)/actions.ts:134`) | `mayRegister` **before** `auth.signUp` | Refusal happens before any account exists. Invite spent immediately via `redeemInvite` |
| **Magic link** (`(auth)/actions.ts:201`) | `mayCreateByEmailLink` → the `shouldCreateUser` flag | Only *addressed* invites qualify. An open invite here would mint accounts for as many addresses as somebody cared to type |
| **OAuth** (`auth/callback/route.ts:35`) | **after** `exchangeCodeForSession` | Supabase creates the user during the exchange, so refusal is a fenced deletion — see below |
| **Admin invite** (`access/actions.ts:347`) | none | Deliberately exempt: an admin doing it on purpose *is* the authorisation |

The gate runs entirely through the service role. That is not a shortcut — the
caller has no account yet, so there is no session to check policies against, and
`account_invites` is admin-only precisely so a signed-in member cannot read every
unredeemed token in the system.

**The OAuth asymmetry.** By the time our code can say "no", the row exists. So
refusal is a deletion, and it is fenced twice (`gate.ts:229-248`): the account
must own nothing (no `tenant_members` row anywhere) **and** be less than 60
seconds old. The age check is what stops a returning user being destroyed if the
flags ever come back wrong — a deletion this automatic has to fail in the
harmless direction.

**The magic-link asymmetry.** That path cannot spend an invite, because there is
no account at the moment the mail is sent and burning the invite then breaks the
most ordinary thing a person does with a sign-in email: ask for a second one.
An *addressed* invite can be honoured any number of times without rationing,
because it can only ever produce an account for that one mailbox.

---

## 3. What happens on signup, in order

```
/signup                                  server action, (auth)/actions.ts:134
  → mayRegister                          gate.ts:77, service role
  → auth.signUp                          Supabase
      → trigger on_auth_user_created_username        DB, usernames.sql:221
        → public.user_profiles row, chosen_at NULL
  → redeemInvite                         gate.ts:185
  → (confirm mail → /auth/confirm → verifyOtp → session cookies)
  → /welcome                             landingPath step 3
      → setUsername   (stamps chosen_at) username-actions.ts:56
      → chooseAvatar → finishWelcome → landingPath
  → /onboarding                          landingPath step 4 (no space, tour unseen)
      → createTenant → TenantCreated + MemberJoined  tenants/actions.ts:106
        → trigger sync_tenant_authorization → tenant_members
  → /t/{slug}                            proxy writes LAST_SPACE_COOKIE
                                         requireTenant re-checks tenant_members
```

Three different mechanisms create state here, and knowing which is which is most
of the debugging:

- **A DB trigger** creates the profile row. `handle_new_user_username()` derives
  a handle from the email local part and suffixes `-1`, `-2` on collision.
  **Failures are swallowed on purpose** — an account is never refused over a
  username. It is the only automatic row creation on signup; there is no
  membership trigger on `auth.users`.
- **`chosen_at` NULL means "derived, never confirmed"** — that is the flag that
  keeps owing the user the welcome wizard. `setUsername` stamping it is what
  retires step 3 of `landingPath` forever.
- **Membership is an event**, materialised by the trigger on `public.events`
  described in [architecture.md §4](../architecture/event-sourcing.md). `tenant_members` is what
  RLS and `landingPath` both consult; `tenants_read_model` is a separate,
  TypeScript-projected read model that only the UI cares about.

---

## 4. Where a signed-in user lands

Every signed-in arrival funnels through `landingPath`
(`src/domain/tenants/last-space.ts:24`), in this order:

1. Guest with a live admission → back to their room.
2. Anonymous with no admission → `/g/left`.
3. `hasChosenUsername` false → `/welcome`. *A landing gate, not a wall* — the
   proxy does not enforce it per request.
4. No last-space cookie **and** tour cookie unseen → `/onboarding`.
5. No cookie → `/tenants` picker.
6. Cookie slug → verify the `tenant_members` row and that the tenant is not
   archived → `/t/{slug}`, else `/tenants`.

There is **no `middleware.ts`** — this repo uses the Next 16 `proxy` convention
(`src/proxy.ts`). The proxy refreshes the session, bounces signed-out users off
protected prefixes, and optimistically writes `LAST_SPACE_COOKIE` for `/t/…`
visits. It is explicitly **not** the authorization boundary; membership is
re-settled in each page and action via `requireTenant` (`proxy.ts:80-85`).

That "optimistically" is load-bearing and currently has a sharp edge — see
[audit.md](audit.md).

---

## 5. The policy vocabulary

Every tenant policy is written in terms of a handful of `SECURITY DEFINER`
helpers. They are definer so they can read the membership tables without being
subject to those tables' own policies — otherwise "you may read `tenant_members`
if you are a member" would consult `tenant_members` to decide, and recurse.

| Helper | Answers |
|---|---|
| `tenant_role(t)` | `owner`/`admin`/`member` from `tenant_members`, else **`guest`** from an unexpired `tenant_guests` row, else NULL |
| `is_tenant_member(t)` | Membership **only** — excludes guests. The write-side predicate |
| `is_tenant_guest(t)` | A live, unexpired admission |
| `tenant_is_unclaimed(t)` | The bootstrap hole — nobody but the caller has ever written to this tenant |
| `has_tenant_invitation(t)` / `invitation_is_mine(…)` | Matches a pending invitation to the caller |
| `stream_tenant(s)` | Pins a stream to one tenant for `append_events` |
| `is_backoffice_admin()` | Caller's JWT email is in `backoffice_admins` (a service-role-written table) |
| `event_open`, `event_guest_may_write`, `event_guest_may_build` | The three-level guest write gate — see events.md §2 |
| `is_guest_banned(t, guest)` | A row in `tenant_bans`. Granted to `anon`, because it must run before an identity exists |

**Guest expiry is enforced inside `tenant_role()`**, not by a reaper. The reaper
is housekeeping; a lapsed pass stops working the moment it lapses.

### The read/write asymmetry

`events_select_tenant` uses `tenant_role()` — so **guests read the whole tenant
log**. Writes use `is_tenant_member` plus narrow, explicitly enumerated guest
branches. This asymmetry was chosen in `20260813000000_guest_links.sql`: for
reading and for realtime it is exactly right, and it is why the guest-hardening
sweep in that migration mechanically rewrote every write policy whose expression
was exactly `tenant_role(tenant_id) IS NOT NULL` into `is_tenant_member(…)`
across 14 read-model tables — then **asserted** that no guest-permissive write
policy remained, failing the migration otherwise.

Battle tables and `projection_checkpoints` were excluded from that sweep on
purpose: guests must project their own battle events.

### Tables where a missing policy *is* the design

| Table | Missing | Why |
|---|---|---|
| `events` | UPDATE, DELETE | The log is append-only |
| `tenant_members`, `tenant_invitations` | all writes | Trigger is the only writer; user-writable membership = self-escalation |
| `guest_links`, `tenant_guests` | all writes | Minting and admission run as service role behind `requireTenant` |
| `world_occupancy` | INSERT, UPDATE | Only via `touch_occupancy()`, which stamps `auth.uid()` itself so nobody can fake a full room |
| `tenant_slugs` | UPDATE | A slug is never re-pointed at another tenant |
| `contact_messages` | every non-admin op | The public form inserts through the service role, which is also the throttle; an open insert policy would be a spam sink |
| `stripe_webhook_events`, `storage.objects` | everything | Service-role only by construction |

Missing without a stated rationale, low risk but worth knowing: `user_profiles`
and `profile_avatars` have no DELETE policy, so a user cannot remove their own
row through PostgREST; `backoffice_admins` has no UPDATE, so notes can only be
re-inserted.

---

## 6. The two places the platform can act as itself

1. **`is_backoffice_admin()` in the events policies**
   (`20260903000000_backoffice_stream_writes.sql`) widens both the SELECT and
   INSERT policies by exactly one OR. An operator may append to any tenant
   stream and read any log — but `actor_id = auth.uid()` is deliberately kept,
   so platform actions are attributed to the operator, never spoofed as the host
   and never anonymous. SELECT had to be widened too, or `RETURNING *` and the
   command retry's re-read would fail.
2. **`command.platform: true`** bypasses `requireRole` in the decider and
   nothing else. Space invariants — last owner, capability ceilings — still
   apply.

Moderation verdicts still need their own side tables; the log records what
happened in a space, not what the platform decided about it.
