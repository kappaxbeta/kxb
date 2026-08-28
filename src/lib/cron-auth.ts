import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'

/**
 * Is this request carrying the machine bearer token?
 *
 * One implementation for the seven routes that ask. It was seven copies, six
 * of which compared with `!==` after a length test:
 *
 *   provided.length !== secret.length || provided !== secret
 *
 * That is the shape `/api/health` had already argued against in a comment
 * beside its own `timingSafeEqual` - "`===` on a secret leaks its prefix
 * through timing, and while an attacker would need to be inside the container
 * network to measure it, the fix costs four lines". It cost four lines once and
 * then was not applied to the six routes written after it, which is what a
 * copied guard does. Sharing it is the part that makes the argument stick.
 *
 * The length test stays and is required rather than an optimisation:
 * `timingSafeEqual` throws on buffers of different lengths. Comparing lengths
 * leaks the length, which is a property of a secret nobody chose and everybody
 * can guess.
 *
 * A missing `CRON_SECRET` means no endpoint rather than an open one. `env` is
 * strict, so reading it throws, and the throw is caught here so that a
 * deployment without the variable answers 401 instead of 500 - the same answer
 * it gives to a wrong token, which is also the honest one: there is nothing
 * here that this caller can reach.
 */
export function cronAuthorized(request: Request): boolean {
  const header = request.headers.get('authorization') ?? ''
  const offered = header.replace(/^Bearer\s+/i, '')

  let expected: string
  try {
    expected = env.cronSecret()
  } catch {
    return false
  }

  const a = Buffer.from(offered)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
