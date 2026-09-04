import { readMoneyPeople, readMovements, readSpaceMovements } from '@/domain/bank/backoffice'
import { readMoneySpaces } from '@/domain/bank/backoffice-spaces'
import { readUsernames } from '@/domain/profile/username-queries'
import { requireBackofficeSection } from '@/lib/backoffice'
import { Movements } from '@/app/ovaloffice/money/movements'
import { PeopleTable } from '@/app/ovaloffice/money/people-table'
import { SpacesTable } from '@/app/ovaloffice/money/spaces-table'

export const dynamic = 'force-dynamic'

/**
 * Where the coins came from.
 *
 * `docs/product/economy.md` §13. Built around **people and movements** rather
 * than around totals, and that is the whole point of it: a balance says what
 * somebody has, and only the movements say how they got it. Every question this
 * page exists to answer - is anybody printing coins, has a space quietly priced
 * every door, is that ranking real - is a question about movements.
 *
 * ---------------------------------------------------------------------------
 * The column to read first is "minted"
 * ---------------------------------------------------------------------------
 * Everything else in this economy nets to zero somewhere: a stake leaves one
 * purse and lands in another, a toll leaves a purse and lands in a bank. Only a
 * handful of reasons create coins, so an economy can only inflate through one
 * of them - which makes a history that is mostly mints the shape worth looking
 * at twice.
 *
 * ---------------------------------------------------------------------------
 * Two lists, because an investigation is a walk
 * ---------------------------------------------------------------------------
 * This was a people list and one person's statement, and it could only be read
 * in one direction. A person's history crosses spaces and a space's crosses
 * people, so half the questions it exists for - which space is generous, who
 * else is in the space this person got rich in - had to be assembled by eye
 * out of a table of ids.
 *
 * So: people and spaces, each linking into the other, and a history that takes
 * either or both. `?person=` alone is somebody's whole history across every
 * space; `?space=` alone is everything that happened in one; both together is
 * the intersection, which is the query somebody actually wants after spotting
 * one odd number in a row. Every line names its space and the other end of the
 * movement, so a statement reads as sentences rather than as signed integers.
 *
 * ---------------------------------------------------------------------------
 * Read narrowly, on purpose
 * ---------------------------------------------------------------------------
 * The movements are read for whatever is selected rather than for everybody,
 * because the log is the source and there is no index that would make "every
 * movement in the product" a query worth running. That is the right shape
 * anyway: this page is used when somebody already has a suspicion. See `sweep`
 * for the window that follows from it, and for what it means when a quiet
 * space reads as empty.
 */
export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; space?: string }>
}) {
  const { person, space } = await searchParams
  const { admin, level } = await requireBackofficeSection('money')

  const [people, spaces] = await Promise.all([readMoneyPeople(admin), readMoneySpaces(admin)])

  /*
    Three questions, one list. Asking by space when a space is named - even
    with a person too - rather than by person with a space filter, because the
    two reads differ only in their predicate and picking the narrower one
    first leaves fewer rows for the second to sift.
  */
  const movements = space
    ? await readSpaceMovements(admin, space, { userId: person })
    : person
      ? await readMovements(admin, person)
      : []

  /*
    Every id that will be drawn as a name: the two lists, whoever is selected,
    and both ends of every movement. One round trip rather than one per table -
    a counterparty is very often somebody who is not in the top hundred, and a
    missing name falls back to a shortened id rather than to nothing.
  */
  const names = await readUsernames(admin, [
    ...people.map((row) => row.userId),
    ...spaces.flatMap((row) => row.members.map((member) => member.userId)),
    ...movements.map((move) => move.owner),
    ...movements.flatMap((move) => (move.counterparty ? [move.counterparty] : [])),
    ...(person ? [person] : []),
  ])

  // The space names, for the movement rows. Read off the list already fetched
  // rather than queried again: a movement in a space with no purses and no
  // bank cannot exist, so every tenant on a line is in there.
  const spaceNames = new Map(spaces.map((row) => [row.tenantId, row.name]))

  const nameOfSpace = (id: string) => spaceNames.get(id) ?? id
  const nameOfPerson = (id: string) => names.get(id) ?? id.slice(0, 8)

  /*
    Reading where the money went and quietly editing a ranking are different
    amounts of trust, so they are different grants on the same section. A
    read-only operator sees every figure on this page and no Hide button.
  */
  const mayHide = level === 'write'

  const heading = space
    ? person
      ? `${nameOfPerson(person)} in ${nameOfSpace(space)}`
      : nameOfSpace(space)
    : person
      ? nameOfPerson(person)
      : null

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="font-pixel text-2xl uppercase">Money</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Balances, and the movements behind them. A total says what somebody
          has; only the movements say how they got it. Coins that were{' '}
          <strong className="text-ink">minted</strong> are the ones with no
          counterparty — everything else moved between two accounts and nets to
          zero, so an economy can only inflate through those.
        </p>
        <p className="max-w-2xl text-sm text-ink-muted">
          Pick a person to follow them across every space, a space to see
          everything that happened in it, or a figure in either table to see one
          person inside one space.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">People</h2>
        <PeopleTable
          people={people}
          names={names}
          selected={person ?? null}
          mayHide={mayHide}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Spaces</h2>
        <SpacesTable spaces={spaces} names={names} selected={space ?? null} />
      </section>

      {heading && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
              {heading} — movements
            </h2>
            {/* The way back out of a two-part filter, which is otherwise a URL
                somebody has to edit by hand. */}
            {person && space && (
              <a
                href={`/ovaloffice/money?person=${person}`}
                className="text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
              >
                every space
              </a>
            )}
            {heading && (
              <a
                href="/ovaloffice/money"
                className="text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
              >
                clear
              </a>
            )}
          </div>
          <Movements
            movements={movements}
            names={names}
            spaceNames={spaceNames}
            onePerson={Boolean(person)}
            oneSpace={Boolean(space)}
          />
        </section>
      )}
    </div>
  )
}
