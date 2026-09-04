'use client'

import { useEffect, useState, useTransition } from 'react'
import { payFromBank, readBank, type BankView } from '@/domain/bank/bank-actions'

/**
 * What the space has taken, and paying some of it back out.
 *
 * `docs/product/economy.md` §3. Door tolls and needs fill this account; this
 * card is the only way anything leaves it. Without it the bank is a sink with a
 * nicer name — coins go in through doors and never come out, which is exactly
 * what having a bank is supposed to avoid.
 *
 * ---------------------------------------------------------------------------
 * Three numbers, because the balance alone hides the interesting one
 * ---------------------------------------------------------------------------
 * A balance says what is there now. **Taken** and **paid out** say which
 * direction the space is running: one whose takings climb while its payouts
 * stay flat has built a sink, and its members are paying tolls into a room
 * nobody spends. That is the thing an owner should be able to see without
 * anybody explaining it to them, so it is on the card rather than in a report.
 *
 * ---------------------------------------------------------------------------
 * A grant and a loan move coins identically
 * ---------------------------------------------------------------------------
 * And are recorded apart anyway, because "how much has this space lent" is a
 * question with an answer only if the two were ever distinguished. Neither is
 * repaid today; keeping the reason is what makes it possible to decide later.
 */
export function BankCard({ slug }: { slug: string }) {
  const [bank, setBank] = useState<BankView | null>(null)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<'grant' | 'loan'>('grant')
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    let alive = true
    void readBank(slug).then((result) => {
      if (alive && result.ok) setBank(result.bank)
    })
    return () => {
      alive = false
    }
  }, [slug])

  if (!bank) return null

  // Nothing taken and nothing to spend: a space that has never priced anything
  // does not need a till on its settings page. It appears the moment one is.
  if (bank.taken === 0 && bank.coins === 0) return null

  const coins = Number(amount)
  const payable =
    bank.maySpend &&
    to !== '' &&
    Number.isInteger(coins) &&
    coins > 0 &&
    coins <= bank.coins

  return (
    <section className="space-y-3 rounded-2xl border border-line/60 bg-surface/40 p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
          The space bank
        </h2>
        <span className="font-mono text-lg tabular-nums">{bank.coins}</span>
      </header>

      <p className="text-xs text-ink-muted">
        Taken <span className="font-mono tabular-nums text-ink">{bank.taken}</span>,
        paid out <span className="font-mono tabular-nums text-ink">{bank.paidOut}</span>.
        Door charges and anything your rules make people buy land here.
      </p>

      {!bank.maySpend ? (
        // Said rather than drawn empty. Somebody who can see a balance and no
        // buttons should be told it is the owner's till, not left guessing.
        <p className="text-[11px] text-ink-muted">Only the space owner can spend this.</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex gap-1">
            {(['grant', 'loan'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                aria-pressed={kind === option}
                className={`flex-1 rounded-lg border px-2 py-1 text-[10px] uppercase tracking-[0.14em] transition ${
                  kind === option
                    ? 'border-accent/70 bg-accent/10 text-ink'
                    : 'border-line/60 text-ink-muted hover:text-ink'
                }`}
              >
                {option === 'grant' ? 'Pay somebody' : 'Lend'}
              </button>
            ))}
          </div>

          <select
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-full rounded-lg border border-line/60 bg-surface px-1.5 py-1 text-xs text-ink outline-none"
          >
            <option value="">Who</option>
            {bank.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>

          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={bank.coins}
            value={amount}
            placeholder="How much"
            onChange={(event) => setAmount(event.target.value)}
            className="w-full rounded-lg border border-line/60 bg-surface px-1.5 py-1 text-xs tabular-nums text-ink outline-none"
          />

          {note && <p className="text-[11px] text-ink-muted">{note}</p>}

          <button
            type="button"
            // Disabled rather than refused: the balance is on screen, so an
            // amount the bank cannot cover should never be a round trip that
            // comes back saying so.
            disabled={pending || !payable}
            onClick={() =>
              start(async () => {
                setNote(null)
                const result = await payFromBank(slug, { to, amount: coins, kind })
                if (!result.ok) {
                  setNote(result.error)
                  return
                }
                // The action hands back the re-read balance, so there is no
                // second round trip and no window showing a number the server
                // has already moved past.
                setBank(result.bank)
                setAmount('')
                setNote(`${coins} paid out`)
              })
            }
            className="w-full rounded-lg border border-line/60 bg-surface px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink disabled:opacity-40"
          >
            Pay
          </button>
        </div>
      )}
    </section>
  )
}
