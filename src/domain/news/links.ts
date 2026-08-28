import { z } from 'zod'

/**
 * What an announcement is made of, and what the two ends agree it is.
 *
 * Shared by the backoffice form, the action that writes the row and the card
 * that renders it, so there is one answer to "how long may a headline be" and
 * one to "what counts as a link". The column constraints in the migration
 * repeat the limits rather than replace them: a check constraint is the floor
 * under a bad deploy, and a message somebody can read is this file's job.
 */

/** As tall as the banner is allowed to get, in pixels. See the card. */
export const NEWS_BANNER_HEIGHT = 300

export const headlineSchema = z
  .string()
  .trim()
  .min(1, 'Give it a headline')
  .max(80, 'Keep the headline under 80 characters')

export const bodySchema = z
  .string()
  .trim()
  .max(400, 'Keep it under 400 characters — link to the rest')

/**
 * Somewhere to go.
 *
 * Relative paths and https only. A `javascript:` href in a card rendered inside
 * every space is the obvious hole, and `http:` is refused rather than upgraded
 * because a mixed-content link that silently fails looks like a broken product.
 */
export const linkSchema = z.object({
  label: z.string().trim().min(1, 'A link needs a label').max(40, 'Keep link labels short'),
  href: z
    .string()
    .trim()
    .min(1, 'A link needs an address')
    .max(500)
    .refine(
      (href) => href.startsWith('/') || href.startsWith('https://'),
      'Links must start with / or https://',
    ),
})

export type NewsLink = z.infer<typeof linkSchema>

/**
 * A picture, as a path under /public.
 *
 * The same sentence as the column's check constraint, which is deliberate - the
 * two folders here are the ones the picker lists, and a row that named anything
 * else would be a path the static handler does not serve or, worse, an absolute
 * URL to somebody else's server.
 */
export const imageSchema = z
  .string()
  .trim()
  .regex(/^\/(thumbs|xo)\/[A-Za-z0-9._/-]+$/, 'Pick one of the pictures')
  .refine((path) => !path.includes('..'), 'Pick one of the pictures')

export const newsSchema = z.object({
  headline: headlineSchema,
  body: bodySchema.optional(),
  image: imageSchema.nullish(),
  /** Two is a card; five is a menu. The form stops offering more at four. */
  links: z.array(linkSchema).max(4, 'Four links is plenty'),
  /** Null is every space. See the migration. */
  tenantId: z.uuid().nullish(),
  published: z.boolean(),
})

export type NewsInput = z.infer<typeof newsSchema>

/**
 * Read the stored `links` column back into something a card can render.
 *
 * Not trusted just because it came out of our own database, for the reason
 * `SceneDetail.document` gives: the column is jsonb, the constraint only says
 * "array", and a row written by an older build is an input like any other. A
 * malformed entry is dropped rather than thrown on - one missing link is worth
 * less than the board it would take down.
 */
export function readLinks(value: unknown): NewsLink[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const parsed = linkSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}
