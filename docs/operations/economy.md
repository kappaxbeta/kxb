# The economy: every switch, and who holds it

What an operator can turn on, turn off, and look at. `docs/product/economy.md`
is the argument for why any of it works the way it does; this is the panel.

For what a *space owner* or a *player* can change, see
`docs/product/manual.md` §6.

---

## 1. The master switch

**`economy`** — Feature flags, off by default.

Off, nothing charges anybody and nothing pays out. Battles are free to enter and
pay nothing, doors take no toll, needs cost nothing, and a quota is whatever the
tier says with no way to buy past it.

Coins already in a purse **stay there**, and the café keeps paying them. That is
deliberate: the café predates all of this, and switching the economy off must
not take somebody's savings with it.

It falls back **off**, against the habit of most flags here. The safe failure
for a charging system is not to charge — a resolver blip that briefly makes
battles free costs nothing anybody notices, and one that takes a coin off every
player is a refund conversation with no refund mechanism behind it.

**The intended way in is a tenant override**, one space at a time. Turning it on
globally switches on charging for every space at once, including spaces that
have never heard of it.

### What to check before switching a space on

Ask whether that space has a **drain**. An economy with a faucet and no sink is
the failure mode nobody notices: balances climb, nothing costs anything, and the
leaderboard measures attendance. See §5.

---

## 2. Quotas an operator can raise

Five valued limit flags, all off, all with the tier's own number parked in them:

| flag | caps |
|---|---|
| `private_xp_limit` | XPs visible only to their owner |
| `public_xp_limit` | XPs published to the catalogue |
| `blueprint_limit` | blueprints in the workshop |
| `clip_limit` | animator clips |
| `vehicle_limit` | vehicles |

**Off means the tier decides.** These are *platform ceilings* — the third rung
of `resolveLimit` — and a ceiling clamps everybody, including a comped space.
Switching one on to see what it does can clamp a paying space below what it
bought, which is why each is parked at or above the top tier's number.

**`vehicle_limit` is the odd one.** Every tier includes zero vehicles — each is
bought with coins — so raising it is not "more of what you bought", it is a
*comp*: a space getting vehicles without paying for them. Legitimate for a
partner, a demo or an event, and not the same gesture as the other four.

### The fourth rung

    effective = min(max(tier, override) + bought, ceiling)

What a member **bought with coins** is *added*, not maxed — an override says
what the cap is, a purchase buys one more. And it is added *before* the ceiling,
so a space can buy more than the installation will serve and not get it. That is
the right way round: coins must not be able to overwhelm a box.

---

## 3. Vouchers

**`voucher`** — off, parked at 10,000.

A valued flag, and **the number matters more than the switch**. 10,000 coins is
a hundred times the opening balance: somebody holding one has no reason to care
what anything costs for a long while, and every price in the product flattens
while they spend it. Right for a space running an event, wrong for one running
an economy.

Claimable once per space, and only with a purse of exactly zero.

With it off, the café is the answer — which is why the café has its own address
(`/t/<slug>/cafe`) and always works.

---

## 4. The money view

**Backoffice → Operations → Money.** Two grants: read sees every figure, write
adds the shadow-ban control.

Built around **people and movements**, not totals. A balance says what somebody
has; only the movements say how they got it, and every question this page exists
for is a question about movements.

**Read the `minted` column first.** Everything else in this economy nets to zero
between two accounts — a stake leaves one purse and lands in another, a toll
leaves a purse and lands in a bank. Only a handful of reasons create coins, so
an economy can only inflate through one of them. A history that is mostly mints
is the shape worth a second look.

The reader also catches bugs the product cannot show. The credit half of every
member-to-member transfer was once landing on the sender's own row and being
dropped by the replay guard — sender debited, nobody credited — and nothing in
the app could have surfaced it, because nothing in the app could read a
movement.

### Putting coins back

**Grant** — beside each person, on the same row as the ranking control. Write
grant only.

It exists because a money view that can only watch is half a tool. When the
transfer bug was found, the backoffice could see exactly who had lost what and
could do nothing about it.

**These coins come from nowhere**, and everything about the control is arranged
around admitting that: the reason is required and lands in the audit row beside
the amount, the movement is recorded under `operator` — which is on the mint
list, so it shows in this very view as *created* rather than moved — and it is
bounded by `MAX_PRICE`.

None of that stops a deliberate abuse and it is not pretending to. This is a
write grant held by people who can already publish and take down anybody's work.
**The control is the trail, not the ceiling.**

The space's `economy` flag is deliberately not consulted. A purse damaged while
the economy was on does not stop needing repair because somebody switched it off
afterwards.

### Shadow-banning from the best list

Hides somebody from a space's coin ranking without telling them.

- **Only a ranking is hidden.** Coins, purse, play and the log are untouched.
- **A reason is required**, and the row records who wrote it, beside an audit
  entry like every other operator action.
- **Private spaces only**, enforced at the read. A public leaderboard that
  operators silently edit is a lie told to strangers; a private space's ranking
  is a community's own business. A space that turns public stops honouring its
  hidden rows rather than carrying them across.
- **The hidden player still sees themselves**, at the rank they would have held.
  That is the whole difference between a shadow ban and a ban: a list that
  visibly loses you is a notification, and somebody who knows makes another
  account.

---

## 5. The combination to watch for

`economy`, `battle` and a space's **needs** are three separate controls and
nothing makes them agree.

| battle | needs | what happens |
|---|---|---|
| on | on | the loop, as designed |
| on | off | **a faucet with no drain** — balances climb and buy nothing |
| off | on | a drain with no faucet — the café is the only income |
| off | off | no economy worth the name |

Row two is the one to look for. It is not an exploit and nobody is cheating: it
is a space that switched battle on and never priced anything. The symptom is
quiet, and §4's view is where it shows — battle payouts climbing while the
bank takes nothing.

---

## 6. Two things that are deliberately not switches

**Coins are never bought with euros.** A tier is money; coins are earned by
playing. There is no exchange rate and there must not be one — the moment there
is, this becomes a payments feature with everything that implies about refunds,
chargebacks and minors.

**A won match creates coins on purpose.** A two-player round pays the winner 10
and takes 3 from the loser, so 7 come into the world. That is the faucet, not a
leak. Do not "fix" it without reading `docs/product/economy.md` §6 — the drain
is the other half, and removing the faucet makes winning ceremonial.

---

## 7. Known gaps

- **A lax space withdraws at par.** The `economy` gate stops an *off* space
  leaking coins into personal wallets; nothing meters a generous *on* one.
- **Acceptance rewards have no ceiling.** The reviewer names the amount and it
  is minted. Bounded by `MAX_PRICE` against a slip of the keyboard, and by
  nothing else.
- **Loans are not repaid.** A loan out of the bank is currently a gift with a
  better label; the reason is recorded so repayment can be added later.
