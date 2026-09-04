import 'server-only'
import { payIntoBank } from '@/domain/bank/deposits'
import { utcDay } from '@/domain/streaks/days'
import type { Client } from '@/es/store'

/**
 * Taking the toll on a door.
 *
 * `docs/product/economy.md` §11. A room can carry a price, set by the space's
 * owner and paid into the space's bank.
 *
 * ---------------------------------------------------------------------------
 * Once a day, and the interval is inferred
 * ---------------------------------------------------------------------------
 * A toll was asked for without saying how often it recurs, and the two obvious
 * readings are both wrong. *Once ever* makes it a ticket rather than a toll and
 * stops feeding the bank after the first week. *Every entry* means a page
 * refresh costs coins - and worse, a reconnect after a dropped websocket does,
 * which would charge people for a bad connection.
 *
 * So it is once per UTC calendar day, per person, per room: refresh-safe,
 * genuinely recurring, and it reuses the day boundary `streaks/days.ts` already
 * argues for rather than inventing a second idea of when a day turns over.
 *
 * ---------------------------------------------------------------------------
 * Everybody pays, and that is the point
 * ---------------------------------------------------------------------------
 * Members and admins included. A room whose regulars walk past the turnstile is
 * not a room with a price on it, it is a room with a price on *visitors* -
 * which is a different feature and a meaner one. The space's owner is the one
 * exception, for the reason nobody is ever charged to pay themselves: the coins
 * would go straight into a bank they already control.
 */

export type TollResult =
  /** Nothing was owed, or it was already paid today. */
  | { ok: true; charged: 0 }
  | { ok: true; charged: number }
  | { ok: false; error: string }

const FREE: TollResult = { ok: true, charged: 0 }

/**
 * Charge whoever is walking in, if they owe anything.
 *
 * Returns `charged: 0` for the ordinary case - a free door, or somebody who has
 * already paid today - so the caller does not have to distinguish "no price"
 * from "already settled". Neither stops anybody.
 *
 * A refusal is a real one: somebody who cannot afford the door does not get in,
 * which is the whole meaning of a toll and the only place in this economy where
 * being broke closes something. The caller decides how to say so.
 */
export async function takeToll(
  supabase: Client,
  tenantId: string,
  room: { id: string; name: string; doorPrice: number },
  visitor: { id: string; ownsSpace: boolean },
): Promise<TollResult> {
  if (room.doorPrice <= 0) return FREE

  // The owner is not charged to walk into their own space - the coins would go
  // straight into a bank they already control, which is two events that net to
  // nothing and a confusing line on their statement.
  if (visitor.ownsSpace) return FREE

  /*
    The claim is written *before* the coins move, which is the opposite of every
    other payment here - and it is right this way round. Everywhere else the
    record follows the payment so a crash loses a movement rather than handing
    something over free. What is being protected here is not a purchase, it is
    *not charging somebody twice*, so the door is marked before the purse is
    opened.

    A crash between the two lets one person through one door free for one day.
    That is the cheapest failure available; the other ordering takes the toll
    twice from somebody whose connection dropped.
  */
  const { data: claimed, error } = await supabase.rpc('room_door_claim', {
    p_room: room.id,
    p_tenant: tenantId,
    p_price: room.doorPrice,
    // The same UTC day boundary the streaks use. Reusing it rather than
    // rolling a second one is the point - two ideas of when a day turns over
    // would put a toll and a streak on different calendars.
    p_day: utcDay(new Date()),
  })

  // A failed claim is not a claim, and here that means nobody is charged. Same
  // direction as everything else on a money path: the recoverable mistake is a
  // free entry, not a charge nobody agreed to.
  if (error || claimed !== true) return FREE

  const paid = await payIntoBank(supabase, tenantId, visitor.id, {
    amount: room.doorPrice,
    reason: 'room-entry',
    what: room.name,
  })

  if (!paid.ok) return { ok: false, error: paid.error }
  return { ok: true, charged: room.doorPrice }
}
