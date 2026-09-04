import Link from 'next/link'

/**
 * The door wanted paying and the purse could not.
 *
 * `docs/product/economy.md` §11. The only place in this product where being
 * broke closes something, which is why it gets a page rather than a redirect: a
 * silent bounce back to the space would read as a bug, and the one thing
 * somebody in this position needs is to be told what it costs and where coins
 * come from.
 *
 * Deliberately not a paywall's voice. The room is not withholding anything -
 * somebody set a price on it, and the café is open. So: the number, the way to
 * earn it, and the way back out.
 */
export function DoorClosed({
  slug,
  roomName,
  price,
}: {
  slug: string
  roomName: string
  price: number
}) {
  return (
    <div className="mx-auto mt-16 max-w-md space-y-4 text-center">
      <h1 className="font-pixel text-xl uppercase">{roomName}</h1>
      <p className="text-sm text-ink-muted">
        This door costs{' '}
        <strong className="font-mono tabular-nums text-ink">{price}</strong>{' '}
        {price === 1 ? 'coin' : 'coins'} a day, and your purse is short.
      </p>
      <div className="flex items-center justify-center gap-2">
        {/*
          The café first. It is the answer, not the consolation - the one place
          in this product that makes coins rather than moving them.
        */}
        <Link
          href={`/t/${slug}/cafe`}
          className="rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-ink transition hover:bg-accent/20"
        >
          Go and earn
        </Link>
        <Link
          href={`/t/${slug}`}
          className="rounded-lg border border-line/60 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-ink-muted transition hover:text-ink"
        >
          Back
        </Link>
      </div>
    </div>
  )
}
