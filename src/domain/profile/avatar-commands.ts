import { z } from 'zod'
import { AVATARS } from '@/domain/lounge/avatars'

/**
 * The roster is the schema.
 *
 * `z.enum` over the allow-list rather than a bounded string, so an unknown
 * animal is rejected at the edge with a real message. It is the only thing
 * standing between a caller and the column now that there is no decider behind
 * it to check again - which is why the validation moved here with the action
 * rather than being dropped along with the aggregate.
 */
export const chooseAvatarSchema = z.object({
  model: z.enum(AVATARS, { message: 'That is not one of the animals' }),
})
