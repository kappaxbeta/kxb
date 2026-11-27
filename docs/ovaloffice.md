# The backoffice — `/ovaloffice`

The operator's side of the app: everything that is about *the platform* rather
than about one space. Accounts and spaces, the world catalogue, codes and tiers,
feature flags, reports, and the tools the team uses to make the art that ships
with it.

It lives in the same Next app as everything else, at
<http://localhost:3000/ovaloffice>, and it is not linked from anywhere a normal
member would see.

## Getting in

The seed makes **`admin@kxb.team` / `test123`** a superadmin, so on a local
install you sign in and open `/ovaloffice` — that is all. See "Seeding" in the
[README](../README.md) for where that account comes from.

On a stack without the seed, the first admin has to come from the database,
because only an admin can make an admin:

```sql
insert into public.backoffice_admins (email, note)
values ('you@example.com', 'first admin')
on conflict (email) do nothing;
```

Run it in Supabase Studio's SQL editor (<http://127.0.0.1:54323> locally) after
signing up with that address. Everyone after you is added from **People &
roles**.

## Who may do what

There are two kinds of access, and the difference matters:

- **Superadmins** — a row in `backoffice_admins`. Every section, read and write,
  plus **People & roles**, which is theirs alone.
- **Section grants** — a row in `backoffice_grants`: one email, one section,
  `view` or `write`. `view` reads a section; `write` also acts in it. Somebody
  who only answers contact messages gets `contact: write` and sees nothing else.

The checks are made twice — in the server action and again by row-level security
at the table — so a section that forgot to ask is still refused by the database.
Every write anybody makes in the backoffice lands in the **Audit log**, which
cannot be edited, including by superadmins.

Matching is by the email on the signed-in session, lowercased. Change an
admin's address and they lose access until the row is updated.

## The sections

### Management

| Section | What it is for |
|---|---|
| **Tenants & spaces** (overview) | Every space, its owner, its tier, its member count. The place to answer "why is this space on xo". |
| **Access & applications** | Account applications and invitations, while sign-up is gated. Approve or decline; open registration is a feature flag. |
| **Worlds** | The public world catalogue — the starter worlds and everything people published. Reports against a world land here. |
| **XP review** | Levels people submitted to the shelf, waiting for a yes or a no before anybody else can play them. |
| **Our XPs** | The built-in levels. They are files in the repository; this is where they are switched on, ordered and given a cover. |
| **Studio** | Stage a scene with the real lounge renderer and take stills or short videos of it — for the board, the news and the store. |
| **Scenes** | Saved studio scenes, and which of them are pinned to every space's board as platform news. |
| **Renders** | The queue of scenes being rendered to video by the headless worker, and what came out. |
| **Pictures** | Uploaded images across the platform, for moderation. |
| **Store banners** | The App Store panels, drawn from a config file and a template; render them all in one go. |
| **World builder** | The block editor the starter worlds are made in, without a space around it. |
| **Animator** | Pose the rig and key clips for characters: drag a limb, set a key, play it back. Webcam capture lives under it. |

### Operations

| Section | What it is for |
|---|---|
| **Contact messages** | Everything sent through the contact form, including event bookings. |
| **Codes** | Promo codes, and **granting a tier by email** — the way to put a tester, a friend or yourself on xo or xp without Stripe. |
| **Skins** | The skin catalogue: prices, colourways, what is on the shelf. |
| **Gewinnspiel** | The contest: dates, prizes and entries. |
| **Experiments** | Running A/B experiments and what they have measured. |
| **Reports** | Content reports from members. Upholding one hides the thing; nothing is ever deleted from here. |
| **Money** | Coins and the bank: balances, movements, what was spent where. |
| **Events** | Event spaces — the ones booked for a day with their own ceiling on people. |
| **News** | Platform news posts shown to every space. |
| **Newsletter** | Subscribers and sends. |

### System

| Section | What it is for |
|---|---|
| **Analytics** | Traffic from the app's own cookieless counter: how many came, from where, and which pages they opened. Nothing in it can name a person. |
| **Errors** | Client and server errors the app reported, grouped. |
| **Health** | The boxes, the database and the projection sweep — whether read models are keeping up with the event log. |
| **Performance** | Frame timings rooms reported, when the `perf` flag is on. |
| **Feature flags** | Every global switch, and per-space or per-user overrides. Flipping one here takes effect on the next request. |
| **Pricing** | What each tier costs. These are the numbers Stripe is asked to charge, not copy. |
| **Audit log** | Every backoffice write: who, what, when. Read-only. |
| **People & roles** | Superadmins and section grants. Superadmins only. |

## Recipes

**Put a space on xp.** Codes → *Grant a tier* → the owner's email, `xp`, no end
date. A space's tier is the best grant any of its owners holds, so this lifts
every space that account owns.

**Turn a feature on for one space only.** Feature flags → the flag → add an
override for that space. The global switch stays as it was.

**Let somebody help without giving them everything.** People & roles → add their
email with only the sections they need, `view` first.

**Find out why something happened.** Audit log, filtered by section or by the
person. If it is not there, it was not done from the backoffice.

**Read models look stale.** Health shows the sweep. Locally it only runs when you
call it — see "Seeding" in the README for the one-line command.
