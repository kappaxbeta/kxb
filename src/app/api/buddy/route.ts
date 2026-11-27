import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import {
  BUDDY_MAX_INPUT,
  type BuddyTurn,
  buddyOf,
  buddySystem,
  cleanTurns,
  DEFAULT_BUDDY,
} from '@/domain/buddy/persona'
import { getUser } from '@/lib/supabase/server'

/**
 * What the companion says back.
 *
 * A route rather than a server action for the reason `/api/world/ice` gives:
 * an action goes through `requireTenant`, which writes cookies, which makes Next
 * re-render the whole room in reply - and this is called every time somebody
 * says something to a pink monster.
 *
 * ---------------------------------------------------------------------------
 * Signed in, and a little throttled
 * ---------------------------------------------------------------------------
 * Every answer costs money, and "free" is the player's price, not ours. So the
 * door is a session (guests included - they hold a real anonymous account, see
 * `/api/world/ice`) and a per-account allowance per minute. The allowance lives
 * in this process's memory: two replicas means somebody determined gets twice
 * it, which is still a ceiling, and a table would be a migration for a toy.
 *
 * No key configured is a normal answer rather than a crash: the chat box shows
 * Telly asleep, and everything else about the companion still works. That is
 * the state every developer machine starts in.
 */
export const dynamic = 'force-dynamic'

/** The current Opus, at low effort: a chat line, not a problem to solve. */
const MODEL = 'claude-opus-5-5'

/** Answers per account per minute. A conversation, not a script hammering it. */
const PER_MINUTE = 12

const recent = new Map<string, number[]>()

function allowed(userId: string, now: number): boolean {
  const window = (recent.get(userId) ?? []).filter((at) => now - at < 60_000)
  if (window.length >= PER_MINUTE) {
    recent.set(userId, window)
    return false
  }
  window.push(now)
  recent.set(userId, window)
  // Forget the quiet ones now and then, so the map is the people talking.
  if (recent.size > 5_000) {
    for (const [id, times] of recent) {
      if (times.every((at) => now - at >= 60_000)) recent.delete(id)
    }
  }
  return true
}

let client: Anthropic | null = null

function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  client ??= new Anthropic()
  return client
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const api = anthropic()
  if (!api) return NextResponse.json({ error: 'asleep' }, { status: 503 })

  let body: { turns?: unknown; name?: unknown; buddy?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }

  const turns = cleanTurns(body.turns)
  const last = turns[turns.length - 1]
  if (!last || last.role !== 'user') {
    return NextResponse.json({ error: 'nothing said' }, { status: 400 })
  }
  if (last.text.length > BUDDY_MAX_INPUT) {
    return NextResponse.json({ error: 'too long' }, { status: 413 })
  }

  if (!allowed(user.id, Date.now())) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 })
  }

  try {
    const response = await api.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [
        {
          type: 'text',
          text: buddySystem(buddyOf(body.buddy) ?? DEFAULT_BUDDY),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: toMessages(turns, typeof body.name === 'string' ? body.name : null),
    })

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ reply: "Hmm, my screen went fuzzy on that one. Let's talk about something else!" })
    }

    const reply = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join(' ')
      .trim()

    return NextResponse.json({ reply: reply || '…' })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'slow down' }, { status: 429 })
    }
    console.error('[buddy]', error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error)
    return NextResponse.json({ error: 'fuzzy' }, { status: 502 })
  }
}

/**
 * The chat box's turns in the API's words.
 *
 * The player's display name rides on the first line rather than in the system
 * prompt, so the system prompt is the same bytes for everybody and caches.
 */
function toMessages(turns: BuddyTurn[], name: string | null): Anthropic.Beta.BetaMessageParam[] {
  const who = name?.trim().slice(0, 40)
  return turns.map((turn, index) => ({
    role: turn.role === 'user' ? 'user' : 'assistant',
    content: index === 0 && who ? `(${who} says:) ${turn.text}` : turn.text,
  }))
}
