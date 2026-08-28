import { z } from 'zod'
import {
  BATTLEFIELD_NAME_MAX,
  type BattlefieldVisibility,
} from '@/domain/battlefields/events'

/**
 * Commands against one battlefield.
 *
 * Every one carries `actorId` for the same reason the tenant commands do: who
 * is asking is an input the decider needs, and it is stamped from the session
 * in the action rather than accepted from the browser.
 *
 * Unlike the tenant aggregate, this decider cannot check *roles* - the roster
 * lives on the tenant's stream, not this one, and a decider that had to read
 * another aggregate to decide would not be a decider. So the role check happens
 * in the action (which can ask), and what reaches here is the narrower rule
 * this stream can actually answer: only the space that created a battlefield
 * may change it.
 */

export const battlefieldNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the battlefield a name')
  .max(BATTLEFIELD_NAME_MAX, `Name cannot exceed ${BATTLEFIELD_NAME_MAX} characters`)

export const visibilitySchema = z.enum(['space', 'public'])

export const createBattlefieldSchema = z.object({
  name: battlefieldNameSchema,
  visibility: visibilitySchema.default('space'),
})

export const renameBattlefieldSchema = z.object({
  worldId: z.uuid(),
  name: battlefieldNameSchema,
})

export const setVisibilitySchema = z.object({
  worldId: z.uuid(),
  visibility: visibilitySchema,
})

export const battlefieldIdSchema = z.object({ worldId: z.uuid() })

export type CreateBattlefield = {
  type: 'CreateBattlefield'
  actorId: string
  name: string
  visibility: BattlefieldVisibility
}

export type RenameBattlefield = {
  type: 'RenameBattlefield'
  actorId: string
  name: string
}

export type SetBattlefieldVisibility = {
  type: 'SetBattlefieldVisibility'
  actorId: string
  visibility: BattlefieldVisibility
}

export type ArchiveBattlefield = { type: 'ArchiveBattlefield'; actorId: string }

export type BattlefieldCommand =
  | CreateBattlefield
  | RenameBattlefield
  | SetBattlefieldVisibility
  | ArchiveBattlefield
