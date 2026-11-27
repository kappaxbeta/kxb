# Moving spaces onto subdomains

`/t/acme` becomes `acme.kxb.team`. What that actually costs, in the order the
work has to happen, and the three things that will break in ways that are not
obvious from reading the router.

Asked by kappaxbeta on 2026-08-10, alongside the backend-grouping question in
`docs/operations/ddos.md`. The two are **separate decisions** and this document exists to
keep them separate: tenants can be pinned to backends today without touching a
URL (`uri_hash` on the `/t/<slug>` prefix), and subdomains can be adopted
without splitting anything. Doing them together means paying this bill to obtain
a routing benefit that did not require it.

---

## 1. The good news first

**The slug rule is already a valid DNS label.** `slugSchema`
(`src/domain/tenants/commands.ts`) is `^[a-z0-9][a-z0-9-]*[a-z0-9]$`, 2–40
characters, lowercased and trimmed. DNS labels allow the same character set and
up to 63. Every existing slug is already a legal hostname, so there is **no data
migration** — no renames, no collisions to resolve inside the tenant table, no
grandfathered slug that stops working. `spaceSlugFromPath` in
`src/lib/last-space.ts` re-implements the same rule and would become
`spaceSlugFromHost` with the regex unchanged.

That is the single biggest cost this migration usually carries, and here it is
already paid.

---

## 2. The three things that actually break

### 2.1 Cookies are host-only today

There is no `domain:` set on any cookie in `src/`. That means every cookie is
host-only: a cookie set on `kxb.team` **is not sent to `acme.kxb.team`.** On the
day the redirect flips, every signed-in user arrives at their space signed out,
and the sign-in that follows sets a cookie the parent domain cannot see either.

Three cookies need a domain: the Supabase auth chunks (via `cookieOptions` on
`createServerClient` in `src/proxy.ts`), `unkown_last_space`, and
`KEEP_SIGNED_IN_COOKIE`. Setting `domain=.kxb.team` on them fixes sign-in and
keeps single sign-on across spaces working, which is what a workspace product
wants.

It also widens the surface, and this is the part to be deliberate about:

- **Cookie tossing.** Any subdomain can write a cookie for the parent domain.
  A tenant host that ever serves tenant-supplied content can overwrite session
  cookies for *every* tenant. The one place serving tenant bytes today already
  closes this — `/api/uploads/[slug]` sends `Content-Security-Policy:
  default-src 'none'; sandbox` and `X-Content-Type-Options: nosniff`, so an
  uploaded HTML file cannot run as script on its origin. **Before flipping, work
  out whether XP code runs JS on the tenant origin.** If it does, that is the
  blocker, and the answer is a separate content domain rather than a
  parent-domain cookie.
- **`__Host-` prefixes become unavailable** on anything that needs the domain,
  since that prefix requires host-only. Worth knowing before relying on it.
- **Session isolation is now notional.** If the point of the exercise was for
  one space's compromise not to touch another's, a parent-domain cookie hands
  that back. Real isolation means signing in per space, which is a product
  decision, not a routing one.

### 2.2 `NEXT_PUBLIC_APP_URL` is one origin, baked at build time

`src/lib/env.ts` exposes a single `appUrl()`, and `/auth/callback`,
`/auth/confirm`, `/code/[code]` and `(auth)/actions.ts` all build their redirect
targets from it. Every one of those carries a comment saying the same thing:
*not* from `request.nextUrl.origin`, deliberately — a fixed constant cannot be
talked into an open redirect, and a request header can.

Subdomains destroy that property. The destination now depends on which space the
user is signing into, so the redirect host has to be *derived* and then
*validated* — reintroducing exactly the bug class the constant existed to
prevent. The validation has to be an allowlist with a real source of truth: the
slug regex **plus** a tenant that exists **plus** the reserved list from §2.3.
Not the regex alone.

Second half of the problem: the value is baked into the client bundle at build
time (`deploy.sh` builds develop with `NEXT_PUBLIC_APP_URL=https://dev.kxb.team`
compiled in). One image cannot hold per-tenant origins, so anything client-side
that builds an absolute URL has to become relative, or resolve the host at
runtime. Since both replicas must run the same image digest
(`docs/architecture/scaling.md` §3.3), this is not optional.

Supabase's own redirect allowlist needs the same treatment: `site_url` and
`additional_redirect_urls` in `supabase/config.toml` are single origins today
and need wildcard entries, on both the local stack and the self-host.

### 2.3 There is no reserved-name list, and the zone is already occupied

Nothing stops a tenant from claiming a slug that is already a hostname. The
`kxb.team` zone currently holds at least:

- `backend` — the self-hosted Supabase stack
- `dev` — the develop deployment (`DEV_DOMAIN`, defaulted in `compose.yaml`)
- whatever `scripts/event-up.ts` has created, which writes `<slug>.kxb.team`
  records into `EVENT_ZONE` (`kxb.team`) for every event box

That last one matters most: **events already map a space slug to a subdomain.**
It is evidence the naming works, and it is also a live collision — an event box
and a tenant subdomain would be competing for one record, and `event-down`
deleting its record would take the tenant's host with it.

So this migration needs, before anything else: a reserved list (`www`, `api`,
`backend`, `dev`, `mail`, `admin`, `static`, `cdn`, plus every record currently
in the zone), enforced at tenant creation *and* checked against existing tenants
before the flip, and a decision on how event hostnames and tenant hostnames
share one namespace.

---

## 3. TLS

Two options, and the obvious one has a trap.

**Wildcard certificate** for `*.kxb.team` requires a DNS-01 challenge, which
means Caddy needs a DNS provider module with credentials. The trap:
`scripts/event-up.ts` already documents that Hetzner's DNS moved into the Cloud
API and the old `dns.hetzner.com` endpoint is gone. Any Caddy Hetzner module
still pointed at the old API will fail at renewal — that is, months later, in
production, on a certificate that used to work. Verify which API the module
speaks before choosing this.

**On-demand TLS** issues a certificate per hostname on first request. No DNS
plugin, no wildcard, and it fits the tenant-created-yesterday case naturally.
It is **mandatory** to configure the `ask` endpoint: without it, anyone pointing
a CNAME at the box makes us request certificates on their behalf until Let's
Encrypt's rate limit locks issuance — including for real tenants. The ask
endpoint is a cheap app route that answers 200 only for a hostname matching a
live tenant, and it wants to be fast and cached, because it runs inside the TLS
handshake.

On-demand is the better fit here. Wildcard is the better fit only once tenant
counts are high enough that per-host issuance is noise.

---

## 4. The mechanical part

353 occurrences of `/t/` across 124 files. Most are `<Link href={...}>` inside
`src/app/t/[slug]/**` and are relative-by-nature once the slug leaves the path;
the ones that need thought are the absolute links built elsewhere:

- invitations and promo links (`src/app/ovaloffice/**`)
- guest links and the `/code/[code]` entry point
- share links and QR codes (`src/domain/nearby/qr.ts` — QR density is a function
  of URL length, and hostnames are shorter than paths, which helps)
- the `/e/[slug]` event door, which `src/proxy.ts` redirects to by hand
- analytics: `page_views` records paths, so every historical row is `/t/<slug>/…`
  and every new one is not. Either the recorded path keeps carrying the tenant,
  or dashboards split in half at the migration date.

Old URLs must keep working permanently — badges, Discord messages and QR codes
printed on physical things do not get updated. `/t/<slug>/<rest>` → 301 →
`https://<slug>.kxb.team/<rest>`, in `src/proxy.ts`, forever.

---

## 5. Order of work

1. Reserved-name list, enforced on creation, and audit existing tenants and the
   DNS zone for collisions (§2.3). Nothing else is safe before this.
2. Decide the events-vs-tenants namespace question (§2.3).
3. Establish whether XP code executes on the app origin (§2.1). If it does, this
   migration needs a content domain first, and that is its own project.
4. Cookie domains, deployed and verified *before* any host changes — a
   parent-domain cookie is backwards-compatible with path routing, so this ships
   on its own and de-risks the flip.
5. Host derivation and validation for redirect targets, replacing `appUrl()` at
   the four call sites; client-side absolute URLs become relative (§2.2).
6. Supabase redirect allowlist, local and self-host.
7. On-demand TLS with the ask endpoint, on a throwaway hostname first.
8. `spaceSlugFromHost` alongside `spaceSlugFromPath`, both live.
9. Flip one tenant. Then the rest. Permanent redirects from day one.
10. Analytics path decision, before the first flip rather than after.

Steps 1 and 4 are worth doing regardless of whether the rest ever happens: a
reserved list is a missing validation today, and cookie scope is a decision that
is currently being made by default.

---

## 6. Options that keep `/t/<slug>`

Host-only cookies (§2.1) are a good enough reason not to do any of §1–§5. Every
benefit the subdomain was wanted for is available without it, at a fraction of
the cost. In rough order of value:

### 6.1 Group backends by path prefix

The routing goal from `docs/operations/ddos.md` §5.0 needs no hostname. Caddy can pin
`/t/acme/**` to one upstream group and `/t/zeta/**` to another, and no cookie,
redirect target or printed link changes.

One caveat that `docs/architecture/scaling.md` §5.3 currently understates: **`lb_policy
uri_hash` hashes the whole request URI**, so `/t/acme/lounge` and
`/t/acme/battle` land on *different* upstreams. That is not tenant affinity, it
is per-URL affinity. Real tenant affinity means capturing the slug and hashing
that instead — `path_regexp` capture → `request_header X-Tenant {re.…}` →
`lb_policy header X-Tenant` — or an explicit `handle` block per group, which is
uglier but is a mapping we control rather than a hash that silently re-shuffles
when the node set changes. Verify the directive names against the Caddy version
in `compose.yaml` before relying on either.

### 6.2 Subdomains as aliases, not homes

`acme.kxb.team` → 301 → `kxb.team/t/acme`. The memorable hostname exists, it
prints on a badge, it goes in an email signature — and the browser ends up on
the canonical origin, so cookies, redirect targets and auth are untouched.

This is most of the perceived benefit for a day of work, and it is reversible.
It buys nothing in isolation terms, but §5.0 of `docs/operations/ddos.md` already concluded
isolation was not what the hostname was really delivering. It also makes the
reserved-name list (§2.3) necessary, which is worth having anyway.

### 6.3 Rate limit per tenant on the path

A per-hostname limit at the edge and a per-path-prefix limit are the same limit
keyed differently. `/t/<slug>/**` is as good a key as `<slug>.kxb.team`, so the
"one tenant's traffic cannot hurt another's" property costs a rule, not a
migration. This is the actual answer to the question that started all of this.

### 6.4 Preferences into the profile

Right on its own merits, and unrelated to hostnames. Seven cookies exist today:

| cookie | can it move to the profile? |
|---|---|
| `unkown_last_space` | yes — a preference, and `resolveLastSpace` re-proves membership anyway |
| `unkown_tour` | yes |
| `kxb.keep` (keep signed in) | no — it governs the session cookie's own lifetime |
| Supabase auth chunks | no — this *is* the credential |
| `unkown_invite`, `unkown_promo` | no — they exist before there is a user |
| `unkown_dnt` (analytics opt-out) | no — must work for signed-out visitors, by definition |
| `kxb_arm` | no — a per-browser arming token |

The rule underneath: **anything that must work before there is a user cannot
live in a profile.** That is also why this does not solve §2.1 — see §6.5.

### 6.5 The handoff, if per-origin cookies are wanted anyway

Syncing state to the profile does not carry a session across hosts. On first
arrival at a tenant host the browser sends no cookie, so the server has no
identity to look a profile up *by*; server-side state cannot substitute for a
missing request credential. The mechanism that does work is a handoff:

```
acme.kxb.team          no cookie here
   → kxb.team/handoff?to=acme          (the origin that does have a session)
   → acme.kxb.team/handoff?t=<one-time reference>
   → 302 to the clean URL, cookie now set on acme.kxb.team
```

Signed out at step 2, the user lands on sign-in instead and comes back through
the same door.

**Nothing needs minting.** Every subdomain talks to the same Supabase project,
so the access and refresh tokens are already valid on every host — it is the
*cookie* that is host-scoped, not the credential. The handoff therefore moves an
existing token pair from one cookie jar into another. `/auth/callback` and
`/auth/confirm` are already this shape (redeem a one-time thing, set cookies,
redirect), and `/code/[code]` is the precedent for why it must be a route
handler: both branches end in a redirect and one has to set a cookie on the way
past, which a Server Component cannot do.

**What the one-time reference has to be.** Not the tokens themselves. A random
opaque handle, stored server-side against the user, the target host and an
expiry of a minute or less, marked consumed on first redemption. It travels in a
URL, and URLs leak — into `Referer`, into history, into logs, and here into
`page_views`, which records paths. So: consume it and 302 to a clean URL in the
same request, keep it out of analytics, and make a leaked one already spent.

**Two failure modes to design for rather than discover.**

*Refresh-token rotation is the serious one.* `supabase/config.toml` sets
`enable_refresh_token_rotation = true` with `refresh_token_reuse_interval = 10`.
Once one refresh token lives in two cookie jars, both hosts rotate it
independently, and a refresh more than ten seconds after the other host's makes
GoTrue see a reused token — which is how token theft looks, so the family is
revoked and the user is signed out, possibly everywhere, at a moment when
nothing was wrong. Two space tabs open across an hour is enough. **A failed
refresh on a tenant host must therefore mean "re-handshake silently", never
"sign out".** Build it that way from the first commit; retrofitting it means
debugging random logouts in production.

*The redirect loop.* Tenant host sees no session → bounces to the main origin →
which also has no session, because the user is genuinely signed out → bounces
back. `src/proxy.ts` already carries a long comment about exactly this class of
loop around `/g/left`, and it survived a long time. The handoff needs a
one-attempt marker so the second arrival renders sign-in instead of bouncing.

Also: `?to=` is an open-redirect parameter. It must be validated against a live
tenant and the reserved list (§2.3), which is the same requirement §2.2 raises,
for the same reason.

**What this does and does not buy.** It gives isolated *cookies*: no cookie
tossing, `__Host-` prefixes stay available, and XSS on one tenant host cannot
read another's jar. It does **not** give an isolated *credential* — one Supabase
project means a token lifted from any host is fully valid on every other. Real
credential isolation needs a separate GoTrue per group, which is variant A in
`docs/operations/ddos.md` §5.0, with variant A's price attached.

So this is the right build if the goal is per-origin cookies. It is not a
shortcut around §2.1, and it is not isolation on its own.
