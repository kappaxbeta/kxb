# kxb.team - Operator and User Manual

This manual explains how to run an event on the platform, how guests interact with the world, how the underlying game mechanics (like matches) work, and what things cost once a space is running the coin economy.

---

## 1. How to Operate an Event (For Hosts & Admins)

Operating a space means managing the room capabilities and ensuring performance for your crowd.

- **Creating an Event:** Go to `/ovaloffice/events`. Here you define the event's name, URL, time window (`opens_at` and `closes_at`), and select a base preset (like `hackathon` or `conference`).
- **The Event Window:** Before `opens_at` and after `closes_at`, the event is closed. The room remains standing and readable, but guests cannot make changes, and no new guests can enter. 
- **The Permission Matrix:** As a host, you have day-to-day switches to control what happens in your space.
  - **Capabilities:** What guests can *write* (e.g., `build`, `board`, `chat`, `tasks`).
  - **Surfaces:** Where guests can *go* (e.g., `lounge`, `rooms`, `battle`, `cafe`).
  - If things get out of hand, you can instantly flip a switch (like turning off `build` capabilities) to lock down the room without needing full platform admin access.
- **Room Caps & Overflow:** To prevent the server from crashing, rooms have capacity limits (e.g., 20 people max). If a room is full, new guests are automatically routed to the emptiest available room, or placed in a queue. You never have to manually bounce people.
- **Party Mode:** At any time, you can trigger Party Mode from the Room tab. The neon rail at the top of every page will start cycling, signaling to everyone that something is happening.

---

## 2. How Users Prepare

- **For Guests:** There is **zero preparation required**. Guests do not need to read a manual, download an app, or create an account. 
- **For Organizers:** Send out the guest link (e.g. `/g/[token]`). Set up your rooms and build any specific voxel structures *before* the doors open. 

---

## 3. How Users Use the App (The Guest Experience)

- **Frictionless Entry:** A guest opens the link, types a name, picks an animal avatar, and is standing in the 3D room about five seconds later.
- **Exploration & Play:** Guests can hang out in the chill lounge (chatting, emoting) or head into the arcade side to play Football, Battles, or explore the pinboards and cafes.
- **Overflow Navigation:** If an event is massive, guests will seamlessly be pushed into overflow rooms (e.g. Hall 2, Hall 3) to keep their frame rate and network performance perfectly smooth.

---

## 4. How Matches Work (Arcade Mechanics)

The arcade side of the product is designed for immediate play without waiting for a server to load. Here is how the mechanics actually function during a match:

### Client-Authoritative Networking
There is no central game server calculating physics. Instead, the game dynamically elects one player in the room (the one with the lowest internal User ID) to be the "owner" of the ball or the match state. 
- Their browser calculates the physics and resolves collisions.
- It then broadcasts the true position to everyone else.
- If that player leaves the room or closes their tab, ownership instantly fails over to the next player.

### Football Mechanics
- **Momentum-Based Dribbling:** Kicking the ball doesn't just fire it at a fixed speed. The ball's outgoing speed and angle are directly proportional to how fast you hit it. If you walk, it trickles ahead. If you dash, it flies. 
- **Continuous Goal Sweeping:** Because a dashed ball can travel 34 blocks a second, the game doesn't just check if the ball is *currently* inside a goal. It checks the entire path the ball swept across in the last frame. Fast shots will never accidentally phase through the net.
- **Scoring & Resets:** When the ball crosses the goal plane, the point is awarded to the opposing team. A 10-second kickoff pause triggers automatically so players can return to the center of the pitch.

### Combat & Tournaments
- Damage in battles is self-reported by the clients. The attacker broadcasts a `hit` and the victim's client resolves the damage.
- The physics engine uses custom Epsilon gates and frame coalescing so that idle players don't flood the network with position updates, keeping 20-player matches running perfectly smoothly in the browser.

---

## 5. Coins: what things cost, and how to change them

The economy is off until an operator switches it on for your space. With it on,
coins are earned by playing and spent on the things below — never bought with
money. See `docs/operations/economy.md` for the operator side, and
`docs/product/economy.md` for why any of it works this way.

### 5.1 Where coins come from

- **The café.** A shift is the main way coins are *created*. It is at
  `/t/<slug>/cafe`, it always works, and there is a work icon on your balance
  that goes straight there. You start with 100.
- **Battles.** Winning pays 10, a knockout pays 1. Losing costs 3, and entering
  costs 1 — paid to whoever owns the level, which is the first time authoring a
  level earns anything.
- **Somebody paying you.** Members can hand each other coins, and a space's
  owner can pay out of the space bank.

You cannot be charged into a negative balance. A player at zero who loses is
charged what they have and no more; no debt is carried.

### 5.2 The two balances

- **Your purse** is what you have *in this space*. It is at the top of the rail
  and on the space's front page.
- **Your wallet** is what you have as a *person*, across every space.

Move coins between them from the money card on the space's front page. Coins can
only cross when that space is running the economy — a space with it switched off
keeps its coins, and the card says so rather than hiding the buttons.

### 5.3 What an owner can price

**A room's door.** Rooms tab → the room → *Coins to enter*. Charged once a day
per person, to everybody who walks in — members and admins included, not just
visitors. You are not charged for your own space. The coins go to the space
bank. Blank or `0` is free.

**A level.** Its project page → *Prices*. Two numbers:

- **To play, once** — paid a single time and then never again, *instead of* the
  1-coin stake every other level takes. A level with this set is bought, not
  rented.
- **To remix** — paid each time somebody takes a copy to edit.

Both go to you. Both are `0` — free — until you say otherwise.

**Needs.** If the space has hunger switched on, whatever a level designer puts
out to eat or heal is priced on its blueprint, and those coins go to the space
bank too. Hunger and *charging for it* are two separate switches: a space can
run hunger with free food.

### 5.4 Buying one more than your plan holds

Space settings → *One more than the plan holds*. Extra private levels, published
levels, blueprints, clips, vehicles and rooms, priced per tier.

**You pay from your own purse and the space keeps the slot.** It stays if you
leave, and a downgrade does not take it away.

Rows your plan cannot buy are shown with the reason. "Unlimited" is usually good
news; free showing no private levels is the tier's story rather than a fault —
free is public by default, and paying is what buys privacy.

### 5.5 The space bank

Space settings → *The space bank*. Door charges and anything your rules make
people buy land here. It shows what the space has **taken** and **paid out** as
well as the balance, because that pair is what tells you which direction your
space is running.

Only the owner can spend it, as a payment or a loan.

If your space charges for things and pays nothing back out, you have built a
sink rather than an economy. That is worth noticing before your members do.

### 5.6 Putting a level in the catalogue

Submitting costs **300**, and **a rejection does not refund** — that is what
keeps the queue readable. An accepted level pays **1,000 or more**, at the
reviewer's discretion.
