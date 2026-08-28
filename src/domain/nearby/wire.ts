/**
 * What travels down a data channel, and what to believe of it.
 *
 * Everything here is input from another device. Not another tab, not our own
 * server - a phone somebody handed a QR code to, running whatever it is
 * running. So nothing that arrives is trusted to be the shape it claims, and
 * the parser below is the only place that judgement is made.
 *
 * Kept pure and out of the React tree so it can be tested without two phones,
 * which is the only way any of this gets tested at all.
 */

/** Who is in the room, as everybody agrees. */
export interface Member {
  id: string
  name: string
  avatar: string
}

/**
 * One message.
 *
 * Short keys because `move` repeats: at twelve a second per person, `event`
 * instead of `e` is real bytes on a channel that is also carrying the roster.
 *
 * `f` is who it came *from* originally, not who relayed it. In a star the host
 * forwards other people's traffic, so a receiver that read the sender as the
 * author would draw every guest at the host's position.
 */
export interface Envelope {
  e: string
  p: unknown
  f: string
}

/** The two the mesh itself owns. Everything else is the room's. */
export const HELLO = '__hello'
export const ROSTER = '__roster'

/** Nobody sensible needs more, and a longer one is somebody probing. */
const MAX_ID = 64
const MAX_NAME = 40

export function encode(envelope: Envelope): string {
  return JSON.stringify(envelope)
}

/**
 * Read a frame, or reject it.
 *
 * Null for anything malformed rather than a throw: a bad frame from a flaky
 * link should cost that frame and nothing else, and an exception here would
 * unwind a data-channel handler and take the connection with it.
 */
export function decode(raw: unknown): Envelope | null {
  if (typeof raw !== 'string' || raw.length > 64_000) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null
  const { e, f, p } = parsed as Record<string, unknown>
  if (typeof e !== 'string' || e.length === 0 || e.length > 32) return null
  if (typeof f !== 'string' || f.length === 0 || f.length > MAX_ID) return null

  return { e, f, p }
}

/** A name from a stranger, made safe to draw over a head. */
export function cleanName(value: unknown): string {
  if (typeof value !== 'string') return 'Someone'
  const trimmed = value
    // Control characters and the direction overrides that let a name paint
    // itself over the rest of the interface.
    .replace(/[\u0000-\u001F\u007F-\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .trim()
    .slice(0, MAX_NAME)
  return trimmed.length > 0 ? trimmed : 'Someone'
}

export function cleanMember(value: unknown): Member | null {
  if (typeof value !== 'object' || value === null) return null
  const { id, name, avatar } = value as Record<string, unknown>
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID) return null
  return {
    id,
    name: cleanName(name),
    // The avatar is checked against the catalogue by whoever draws it; here it
    // only has to be a short string rather than a URL somebody chose.
    avatar: typeof avatar === 'string' && avatar.length <= 32 ? avatar : '',
  }
}

/**
 * The roster a host broadcasts, cleaned on the way in.
 *
 * Duplicates by id are dropped rather than merged - two entries for one id is
 * two bodies fighting over one position, and the first one wins because the
 * host listed it first.
 */
export function cleanRoster(value: unknown, limit: number): Member[] {
  if (!Array.isArray(value)) return []
  const out: Member[] = []
  for (const entry of value) {
    const member = cleanMember(entry)
    if (!member) continue
    if (out.some((one) => one.id === member.id)) continue
    out.push(member)
    if (out.length >= limit) break
  }
  return out
}

/**
 * Who a host should forward an inbound frame to.
 *
 * Everybody except where it came from. The host is a hub, so a guest's message
 * reaches the other guests only by being repeated - and repeating it back to
 * its sender is the loop that makes a two-person room melt.
 */
export function forwardTo<T>(links: Map<T, unknown>, from: T): T[] {
  return [...links.keys()].filter((key) => key !== from)
}
