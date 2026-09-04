import 'server-only'
import type { Client } from '@/es/store'

/**
 * The same money, read down the other axis.
 *
 * `backoffice.ts` answers "who has coins, and how did *they* get them". This
 * answers "what is going on in this space, and who is in it". Both are needed
 * and neither is the other: a person's history crosses spaces, and a space's
 * history crosses people, so a question about one of them asked in the other's
 * table is a question you have to assemble by eye.
 *
 * ---------------------------------------------------------------------------
 * Two lists that point at each other
 * ---------------------------------------------------------------------------
 * The reason this is worth its own file rather than a second shape bolted onto
 * the people query: an investigation is a walk. Somebody's total looks wrong,
 * so you look at their spaces; one of those spaces looks generous, so you look
 * at everybody *in* it; one of those people is where it is all coming from. Two
 * lists that each link into the other is the whole of that, and it only works
 * if both sides are cheap - which is why this reads the same three tables the
 * people query does and joins them here.
 *
 * Service-role only, like everything else on that page: `space_bank_read_model`
 * has no session read policy for a stranger's space, and that is deliberate.
 */

export interface MoneySpaceMember {
  userId: string
  coins: number
  earned: number
}

export interface MoneySpace {
  tenantId: string
  name: string | null
  /**
   * The space's own bank, and what has passed through it.
   *
   * `taken` and `paidOut` rather than only the balance, for the reason the
   * owner's own bank card gives: the pair is what says whether a space built an
   * economy or a sink. A bank sitting at zero having taken nothing and one
   * sitting at zero having taken forty thousand are different spaces.
   */
  bank: { coins: number; taken: number; paidOut: number } | null
  /** Everyone holding a purse here, richest first. */
  members: MoneySpaceMember[]
  /** What its members hold between them. Not the bank - that is the space's. */
  purses: number
}

/**
 * Every space anybody holds a balance in, busiest first.
 *
 * Sorted by what its members hold rather than by its bank, because that is the
 * figure that says how much play money is loose in there - a space with an
 * empty bank and two hundred thousand coins in its purses is the one worth
 * opening, and sorting by the bank would bury it.
 *
 * A space with a bank and no purses is kept: it has taken money from somebody,
 * which is precisely a thing to be able to see.
 */
export async function readMoneySpaces(admin: Client, limit = 100): Promise<MoneySpace[]> {
  const [purses, banks, spaces] = await Promise.all([
    admin
      .from('homestead_read_model')
      .select('user_id, tenant_id, coins, earned')
      .order('coins', { ascending: false })
      .limit(limit * 20),
    admin.from('space_bank_read_model').select('tenant_id, coins, taken, paid_out'),
    admin.from('tenants_read_model').select('id, name'),
  ])

  const names = new Map((spaces.data ?? []).map((row) => [row.id, row.name]))
  const found = new Map<string, MoneySpace>()

  const blank = (tenantId: string): MoneySpace => ({
    tenantId,
    name: names.get(tenantId) ?? null,
    bank: null,
    members: [],
    purses: 0,
  })

  for (const row of purses.data ?? []) {
    const space = found.get(row.tenant_id) ?? blank(row.tenant_id)
    space.members.push({ userId: row.user_id, coins: row.coins, earned: row.earned })
    space.purses += row.coins
    found.set(row.tenant_id, space)
  }

  for (const row of banks.data ?? []) {
    const space = found.get(row.tenant_id) ?? blank(row.tenant_id)
    space.bank = { coins: row.coins, taken: row.taken, paidOut: row.paid_out }
    found.set(row.tenant_id, space)
  }

  return [...found.values()].sort((a, b) => b.purses - a.purses).slice(0, limit)
}
