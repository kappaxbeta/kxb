# The relay — how face video gets through a NAT, and what it costs

Face video in the lounge is peer to peer: a picture goes from one browser to
another and is never stored, never written to the log, and never passes through
the app. What follows is about the minority of pairs for whom "directly" is not
possible, and the one piece of infrastructure that rescues them.

**Nothing here is running yet.** The code is deployed and inert: with no relay
configured, `/api/world/ice` answers `{"iceServers": []}` and rooms fall back to
host candidates. That is a working state, not a broken one — it is simply a
smaller set of people who can see each other.

## Three tiers, and only the last one has a bill

A *candidate* is an address a browser might be reachable at. ICE collects them
from both ends, tries every pair, and keeps the first that works.

| Candidate | Rescues | Costs |
|---|---|---|
| **host** — the address the machine thinks it has | two people on one network; two people who both have IPv6 | nothing |
| **srflx** — the address the world sees you at, via STUN | two ordinary home connections behind NAT | one request/response, no media |
| **relay** — a TURN server forwarding the media | symmetric NAT, carrier-grade NAT, networks that drop UDP | every byte, twice |

The tiers are tried in that order and the relay is genuinely last: ICE will use
a direct route whenever it can find one.

### IPv6 changes the shape, not the numbers

With a globally routable address on both ends there is nothing for STUN to
reflect — the host candidate *is* the public address. Home firewalls still block
unsolicited inbound, but ICE already handles that: both ends send connectivity
checks at once and the outbound packet opens the pinhole for the inbound one.

So an IPv6-to-IPv6 pair usually connects with no infrastructure at all. The
catch is that it is **per pair**: one IPv4-only end collapses the pair back to
the table above. German residential IPv6 is good — Telekom and Vodafone Kabel
are dual-stack or DS-Lite, and DS-Lite users have native IPv6 — while mobile
varies and corporate networks are frequently v4-only by policy.

The honest summary: **IPv6 does not remove the relay, it makes the relay
cheap.** Relay cost is proportional to how often it is reached for.

Two things to verify before relying on any of it, neither of which has been
checked:

- **Chrome's mDNS obfuscation.** Without media permission Chrome hides host
  candidates behind `.local` names. Face video always has camera permission by
  the time it gathers, so real candidates should be exposed — but if this is
  wrong, direct IPv6 connection silently never happens and nothing says so.
- **What an IPv6 candidate discloses.** It is a globally routable address of
  that person's *device*, handed to everybody in the room. IPv4 leaks a
  per-household NAT address instead. Privacy extensions (RFC 4941 temporary
  addresses) blunt it, but this belongs in the Datenschutz text rather than in a
  footnote.

## The credential scheme

A relay anybody may use is a bandwidth account anybody may spend, so the
credential cannot be a constant — and specifically must never carry a
`NEXT_PUBLIC_` prefix, which inlines the value into the JavaScript sent to every
visitor.

coturn's `use-auth-secret` avoids storing anything per user: **the username is
the expiry, and the password is its HMAC.**

```
username   = <unix-expiry>:<user-id>
credential = base64(HMAC-SHA1(shared-secret, username))
```

The server verifies both from the secret alone. There is no table of issued
credentials to expire or clean up, a scraped credential is worth an hour, and
revoking every credential at once is one secret rotation.

Minting lives in [`/api/world/ice`](../../src/app/api/world/ice/route.ts); the
parts that need no key are in
[`src/domain/world/turn.ts`](../../src/domain/world/turn.ts) with their tests.

The gate on that route is **signed in, and nothing more**. A relay carries bytes
and has no idea which space they belong to. What it must stop is an anonymous
internet using the box as free transit, and a session cookie stops exactly that
— which room somebody may be in was already decided by the Realtime policy on
the topic, several steps earlier.

The feature the relay serves is documented separately:
[xo/faces.md](../xo/faces.md) covers the switch, how a picture crosses, and what
it does not do yet.

## Standing one up

The box is the app box (see deploy.md); it has native IPv6 and
3478/5349 free. Four steps, none of them done:

**1. DNS.** An A and an AAAA for `turn.kxb.team` at the app box. Hetzner DNS is
in the Cloud API — see the note in memory, `dns.hetzner.com` redirects away.

**2. Firewall.** Both the Hetzner Cloud Firewall and the box's ufw, which
currently allows only 22/80/443:

```bash
ufw allow 3478/udp && ufw allow 3478/tcp && ufw allow 5349/tcp && ufw allow 49160:49200/udp
```

**3. Secrets, in the box's `.env`.** `WORLD_TURN_SECRET` must be byte-identical
to what the app signs with, since one side derives what the other verifies:

```bash
openssl rand -hex 32
```

Then three more. `TURN_PUBLIC_IP` is the box's own address, because a cloud VPS
does not know it and one that advertises a private address hands out a route
nobody can take. `TURN_REALM` is a bare domain — its own variable rather than
`APP_DOMAIN`, which on some boxes carries a scheme, and `https://kxb.team` is a
URL in the field where a domain goes. And `WORLD_ICE_URLS` is the only one the
browser ever sees:

```
TURN_PUBLIC_IP=<the box's public address>
TURN_REALM=kxb.team
WORLD_ICE_URLS=stun:turn.kxb.team:3478,turn:turn.kxb.team:3478
```

Note that `.env*` is gitignored in this repo, so this list is the record — there
is no `.env.example` in git to read them off.

**4. Start it.** The service sits behind a compose profile so an ordinary deploy
never brings it up by accident:

```bash
docker compose --profile turn up -d coturn
```

Config is [`coturn.conf`](../../coturn.conf), which holds no credentials — the
secret, the public address and the realm are passed on the command line from
`.env`.

### What is deliberately not done yet

**TURN over TLS on 443.** The table above says the relay rescues networks that
drop UDP; that is only true over TCP, and the version that survives a genuinely
hostile network is TURNS on 443, because it is indistinguishable from HTTPS.
Port 443 on this box is Caddy's, and coturn needs a certificate Caddy currently
owns. Doing it properly means either sharing Caddy's cert store or giving coturn
its own ACME client. `coturn.conf` listens on 5349 so the TLS path exists; it is
not the firewall-proof one.

## The thing that must not be got wrong

**A TURN server is a proxy that forwards wherever it is asked to.** Left open it
will be asked to forward into the network it is standing in — the app, the
Docker bridge, anything on localhost. This is not hypothetical; open relays are
scanned for and used this way.

The `denied-peer-ip` block in `coturn.conf` is what prevents it, covering every
private and link-local range in both address families. It is not optional and it
is not tidiness. If that file is ever edited, that block is the part to check
twice.

## What it costs

240p video is roughly 200 kbps. A relayed stream costs that **twice** on the box
— once in, once out. Four relayed streams is about 1.6 Mbps sustained, which is
nothing against the app box's traffic allowance.

It only becomes interesting if video ever goes above 240p, or if the mesh grows:
a broadcaster in a mesh sends one copy per person in the room, so the cost of
one more camera is paid by everybody who already had one. That is the ceiling
`MAX_FACES` exists to hold, and the point at which the answer stops being a
relay and starts being an SFU.
