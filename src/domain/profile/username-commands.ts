import { z } from 'zod'

/**
 * What a handle is allowed to look like.
 *
 * The same shape is a CHECK constraint on user_profiles - this copy gives a
 * decent error message, that one is the guarantee. Same division of labour as
 * slugSchema in src/domain/tenants/commands.ts, and for the same reason: a
 * client that talks to PostgREST directly never sees this file.
 *
 * Lowercased rather than rejected on case, because `Jane` and `jane` being two
 * different people is a trap rather than a feature - and the uniqueness
 * constraint underneath is on the lowercased value.
 */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'A username needs at least 2 characters')
  .max(32, 'A username cannot exceed 32 characters')
  .regex(
    /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/,
    'Use lowercase letters, numbers, hyphens and underscores (not at the start or end)',
  )

export const setUsernameSchema = z.object({ username: usernameSchema })

/**
 * What to call somebody whose profile row is not there.
 *
 * Every account gets a handle from a trigger on auth.users, so in practice this
 * is only reached for a row that has been deleted out from under a read model,
 * or an account created while that trigger was failing. It returns something
 * stable and obviously-not-chosen rather than 'Someone', so two nameless people
 * in the same lounge are still two different people.
 */
export function fallbackUsername(userId: string): string {
  return `user-${userId.slice(0, 6)}`
}
