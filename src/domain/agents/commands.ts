import { z } from 'zod'
import type { PlaceId } from '@/domain/world/places'

/**
 * The write side's edge.
 *
 * Thin, because there is very little here worth lying about - an agent spends no
 * coins and holds no balance, so the decider's job is a roster cap and a name,
 * not an economy. The one field that matters is `agentId`, and it is validated
 * as a uuid because it is the seed for the entire schedule: a caller who could
 * pass an arbitrary string could hunt for one whose derived routine parks the
 * animal somewhere it should not be.
 */

const placeSchema = z.enum(['cafe', 'home', 'outdoor', 'lounge'])

/**
 * A name a person typed.
 *
 * Trimmed before the length check, so a name of nothing but spaces is rejected
 * rather than stored as a creature nobody can see the label of. Capped well
 * under what the column allows - this is drawn over an animal's head in 3D, and
 * forty characters is already wider than the animal.
 */
const nameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Give them a name' })
  .max(40, { message: 'That name is too long' })

export const adoptAgentSchema = z.object({
  agentId: z.string().uuid({ message: 'That is not an agent' }),
  name: nameSchema,
  avatar: z.string().min(1).max(32),
  place: placeSchema,
})

export const renameAgentSchema = z.object({
  agentId: z.string().uuid({ message: 'That is not an agent' }),
  name: nameSchema,
})

export const releaseAgentSchema = z.object({
  agentId: z.string().uuid({ message: 'That is not an agent' }),
})

export type AgentCommand =
  | ({ type: 'AdoptAgent' } & {
      agentId: string
      name: string
      avatar: string
      place: PlaceId
    })
  | ({ type: 'RenameAgent' } & { agentId: string; name: string })
  | ({ type: 'ReleaseAgent' } & { agentId: string })
