# @kxb/maumau

Mau-Mau — the German card game, for two to five — built on the XP SDK's ports.

A seven makes the next player draw two and a seven answers a seven, an eight
skips, a nine turns the play around and a jack asks for a suit, but never onto
another jack. Down to one card you say Mau, and if you forget, anybody may catch
you for two.

The design problem worth reading is in [`src/net/`](src/net): **a hand is several
secrets that outlive the deal**, so the deck lives where no player can reach it.
A card game is the case that breaks the netcode's usual answer — everywhere else
in this project the client that owns a thing is trusted with it, and here the
one thing nobody may be trusted with is the thing everybody wants to see. See
[`arbiter.ts`](src/net/arbiter.ts).

The rules are pure and fully tested. `bun test packages/maumau` passes with
nothing downloaded and no database.

## The card art is not in this repository

This repository does not bundle third-party art — see
[docs/assets.md](../../docs/assets.md) for the whole story. Two of the three
finishes draw a pack somebody else made, both **CC0**, neither ours:

| Finish | Pack | Author | Get it from |
|---|---|---|---|
| `kaykit` | Board game bits, from the Complete KayKit Collection | Kay Lousberg | [kaylousberg.itch.io](https://kaylousberg.itch.io/) · [kaylousberg.com](https://www.kaylousberg.com) |
| `pixel` | Playing Cards Pack (1.0) | Kenney | [kenney.nl](https://kenney.nl/) · [kenney.itch.io](https://kenney.itch.io/) |

Both are [CC0](http://creativecommons.org/publicdomain/zero/1.0/): free for
personal, educational and commercial use, no attribution required. Crediting
them is not mandatory and is the decent thing to do anyway — and Kay Lousberg's
free packs are funded by the EXTRA and SOURCE tiers on itch.io, so buying one is
the most direct way to say thank you.

```bash
bun run maumau:assets     # build both atlases from the downloaded packs
bun run maumau:publish    # publish only — no source packs needed
```

Whatever finish is in use, one arrangement is fixed across all of them: **rows
are the four suits in `SUITS` order, columns are A, then 2 to 10, then J, Q, K**,
and a fourteenth column holds the back. `cellOf` is written once and no finish
appears in it. Get the grid wrong and you get a hand that plays correctly and
reads as nonsense.

A finish is deliberately **not** a house rule. `src/rules/house.ts` is pinned by
the authority and refused if a second player disagrees, because a table has to
be playing one game. A finish changes nothing anybody can be refused for: two
players looking at two different card backs are still playing the same hand.

## Licence

The code is MIT, with the rest of this repository. The card art is CC0 and
belongs to its authors above.
