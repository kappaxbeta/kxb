/**
 * What makes two crashes the same crash.
 *
 * Pure, and deliberately in its own module with no imports: it runs in the
 * Node runtime from instrumentation.ts, in a Server Action, and in a test, and
 * anything it pulled in would have to survive all three.
 *
 * The grouping is the whole value of the error list. Four hundred rows of
 * "Failed to load space: 8f3a…" are one bug, and a page that lists them
 * separately answers a question nobody asked.
 */

/**
 * Errors that are not errors.
 *
 * `redirect()` and `notFound()` are implemented by throwing, so they arrive at
 * onRequestError looking exactly like a crash. Recording them would bury the
 * real failures under every redirect the app performs, which on this app means
 * every single sign-in.
 *
 * Matched by prefix because Next appends detail to several of them -
 * `NEXT_REDIRECT;replace;/tenants;307` and `NEXT_HTTP_ERROR_FALLBACK;404`.
 */
const CONTROL_FLOW = [
  'NEXT_REDIRECT',
  'NEXT_NOT_FOUND',
  'NEXT_HTTP_ERROR_FALLBACK',
  'DYNAMIC_SERVER_USAGE',
  'BAILOUT_TO_CLIENT_SIDE_RENDERING',
]

/** Is this digest one of the framework's control-flow throws? */
export function isControlFlow(digest: string | null | undefined): boolean {
  if (!digest) return false
  return CONTROL_FLOW.some((prefix) => digest.startsWith(prefix))
}

/**
 * Rub out the parts of a message that differ between two occurrences of one
 * bug: the workspace id, the row id, the timestamp, the retry counter.
 *
 * Order matters. UUIDs before bare hex, or the hex rule eats half of one; hex
 * before digits, or the digit rule turns `8f3a1c` into `8f<n>a<n>c` and two
 * occurrences stop matching for the wrong reason.
 */
export function normaliseMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '<time>')
    .replace(/\b[0-9a-f]{8,}\b/gi, '<hash>')
    .replace(/\d+/g, '<n>')
    .trim()
}

/**
 * FNV-1a, twice, with different offsets.
 *
 * Not a cryptographic hash and does not need to be - nothing here is a secret
 * and nothing is verified against it. What it does need is to be identical in
 * every runtime the reporter runs in, which rules out `node:crypto` (absent on
 * the edge) and makes sixteen lines of arithmetic the simple answer. Two passes
 * because one 32-bit value over a triage list is more collisions than a person
 * looking at the list would forgive.
 */
function hash(text: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    a = Math.imul(a ^ code, 0x01000193)
    b = Math.imul(b ^ code, 0x811c9dc5)
  }

  const hex = (value: number) => (value >>> 0).toString(16).padStart(8, '0')
  return hex(a) + hex(b)
}

export interface Fingerprinted {
  source: string
  digest?: string | null
  route?: string | null
  path?: string | null
  message: string
}

/**
 * The grouping key.
 *
 * Next's digest wins when there is one: it is already a hash of the error, it
 * is stable across both replicas, and it is the only value that also appears in
 * the container logs and on the visitor's screen - so a group keyed by it can
 * be matched to both without anybody re-deriving anything.
 *
 * Everything else falls back to the shape of the failure rather than its
 * text: where it happened and what it said with the variable parts removed.
 * The route is preferred over the path, because `/t/[slug]/lounge` is one place
 * and `/t/acme/lounge` is one visit to it.
 */
export function fingerprintOf(report: Fingerprinted): string {
  if (report.digest && !isControlFlow(report.digest)) {
    return `d:${report.digest}`
  }

  const where = report.route ?? report.path ?? '?'
  return `h:${hash(`${report.source}|${where}|${normaliseMessage(report.message)}`)}`
}
