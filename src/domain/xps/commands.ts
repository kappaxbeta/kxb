import { z } from 'zod'
import { MAX_PRICE } from '@/domain/bank/prices'
import { FINISHES, HUES, type Finish } from '@kxb/xp'
import {
  XP_BLURB_MAX,
  XP_NAME_MAX,
  type XpRight,
  type XpSpacePolicy,
} from '@/domain/xps/events'

/**
 * Commands against one project.
 *
 * Every one carries `actorId`, stamped from the session in the action rather
 * than accepted from the browser, for the same reason the tenant and
 * battlefield commands do: who is asking is an input the decider needs.
 *
 * ---------------------------------------------------------------------------
 * What this decider can and cannot check
 * ---------------------------------------------------------------------------
 * It knows who owns the project and who it has been shared with, because both
 * are on this stream. So the *ownership* half of docs/xp/backend.md §7.4 is
 * decided here and cannot be got wrong by a caller.
 *
 * It does not know the space's roster, the subscription, or the tier - those
 * live on the tenant's stream and in `subscriptions_read_model`, and a decider
 * that had to read another aggregate to decide would not be a decider. So
 * `canWrite`, `tierAtLeast` and "is this person even in the space" stay in the
 * action, which can ask. That is the same split `battlefields/commands.ts`
 * describes, and the reason the permission ladder is one TypeScript function
 * rather than a policy: half its inputs are not facts the database has.
 *
 * The consequence worth naming: **an action that forgets to check the tier will
 * be allowed by this decider.** The database's `xps_insert` policy catches a
 * non-member, and nothing catches an `xo` space except the action. That is why
 * the ladder is one function and not a habit.
 */

export const xpNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the project a name')
  .max(XP_NAME_MAX, `A name cannot be longer than ${XP_NAME_MAX} characters`)

export const xpBlurbSchema = z
  .string()
  .trim()
  .max(XP_BLURB_MAX, `A blurb cannot be longer than ${XP_BLURB_MAX} characters`)

export const spacePolicySchema = z.enum(['none', 'view', 'edit'])
export const rightSchema = z.enum(['view', 'edit'])

export const createXpSchema = z.object({
  name: xpNameSchema,
  template: z.string().trim().max(64).optional(),
  /**
   * How the cartridge should look, chosen before the level exists.
   *
   * Both optional and both refused rather than clamped, matching the parser -
   * see `readFinish` and `readHue`. `z.coerce` on the hue because it arrives
   * out of a `FormData`, where everything is a string.
   */
  finish: z.enum(FINISHES).optional(),
  hue: z.coerce.number().int().min(0).max(HUES - 1).optional(),
})

export const renameXpSchema = z.object({
  xpId: z.uuid(),
  name: xpNameSchema,
  blurb: xpBlurbSchema.optional(),
})

export const shareXpSchema = z.object({
  xpId: z.uuid(),
  account: z.uuid(),
  right: rightSchema,
})

export const setXpAccessSchema = z.object({
  xpId: z.uuid(),
  spacePolicy: spacePolicySchema,
})

export const rollBackXpSchema = z.object({
  xpId: z.uuid(),
  to: z.number().int().positive(),
})

export const submitXpSchema = z.object({
  xpId: z.uuid(),
  note: z.string().trim().max(500).optional(),
})

/**
 * A reason is required, not optional, on both of the events somebody else reads.
 *
 * A rejection and a removal are the two moments this system does something to
 * a person's work that they did not ask for. "Rejected" with no reason is the
 * kind of message that produces a support email rather than a fix, and making
 * the field required is the cheapest way to ensure there is always something to
 * show them.
 */
export const reasonSchema = z
  .string()
  .trim()
  .min(1, 'Say why — the person who made this will read it')
  .max(500)

export type CreateXp = {
  type: 'CreateXp'
  actorId: string
  name: string
  template?: string
  /** What the create form said the cartridge should look like. See `XpCreated`. */
  finish?: Finish
  hue?: number
  /** Set only when this project arrived from another space. */
  movedFrom?: string
  /** Set only when this project was duplicated from another. */
  copiedFrom?: string
}

export type RenameXp = {
  type: 'RenameXp'
  actorId: string
  name: string
  blurb?: string
}

export type SaveXpVersion = {
  type: 'SaveXpVersion'
  actorId: string
  bytes: number
  files: number
  cover?: string
}

export type SetXpAccess = {
  type: 'SetXpAccess'
  actorId: string
  spacePolicy: XpSpacePolicy
}

/**
 * What this level costs, set by its owner. See `XpPriced`.
 *
 * Both prices in one command, because they are one decision made in one panel -
 * and because a command that could set `once` without saying anything about
 * `remix` would need a way to mean "leave that alone", which is a third state
 * per field for no benefit.
 *
 * The numbers are bounded in the decider rather than here. A price is the one
 * thing on this level a purse is later charged, so the guard belongs where the
 * invariant is - next to the shares, which have their own arithmetic.
 */
/**
 * What a browser may say about a price.
 *
 * The two numbers and the shares. The bounds are here *and* in the decider, the
 * overlap this file's header describes: the schema refuses a malformed shape
 * with a readable message, and the decider refuses an implausible one next to
 * the invariant it protects - shares that add past the whole would pay out more
 * than came in, and that check belongs where the arithmetic is.
 */
export const priceXpSchema = z.object({
  xpId: z.uuid(),
  once: z.number().int('A price is a whole number of coins').min(0).max(MAX_PRICE),
  remix: z.number().int('A price is a whole number of coins').min(0).max(MAX_PRICE),
})

export type PriceXp = {
  type: 'PriceXp'
  actorId: string
  once: number
  remix: number
  split?: Record<string, number>
}

export type ShareXp = { type: 'ShareXp'; actorId: string; account: string; right: XpRight }
export type UnshareXp = { type: 'UnshareXp'; actorId: string; account: string }
export type TransferXp = { type: 'TransferXp'; actorId: string; to: string }
export type MoveXpOut = { type: 'MoveXpOut'; actorId: string; to: string }

/**
 * The space's owner, taking it out of their space.
 *
 * `actorId` here is the space owner rather than the project owner, which is the
 * one command where those differ and the decider has to allow it anyway - it
 * cannot check who owns the *space*, so the action does, and what reaches here
 * is "somebody with the right to remove has asked".
 */
export type RemoveXp = { type: 'RemoveXp'; actorId: string; reason: string }

export type SubmitXp = { type: 'SubmitXp'; actorId: string; note?: string }
export type WithdrawXp = { type: 'WithdrawXp'; actorId: string }
export type PublishXp = { type: 'PublishXp'; actorId: string }
export type RejectXp = { type: 'RejectXp'; actorId: string; reason: string }
export type UnpublishXp = { type: 'UnpublishXp'; actorId: string; reason: string }

/** Put an earlier, already-approved release back. The owner's, not the platform's. */
export type RollBackXp = { type: 'RollBackXp'; actorId: string; to: number }
export type ArchiveXp = { type: 'ArchiveXp'; actorId: string }

export type XpCommand =
  | CreateXp
  | RenameXp
  | SaveXpVersion
  | SetXpAccess
  | PriceXp
  | ShareXp
  | UnshareXp
  | TransferXp
  | MoveXpOut
  | RemoveXp
  | SubmitXp
  | WithdrawXp
  | PublishXp
  | RejectXp
  | UnpublishXp
  | RollBackXp
  | ArchiveXp
