import type {
  RealtimeChannel,
  RealtimeChannelOptions,
  SupabaseClient,
} from '@supabase/supabase-js'

/**
 * A channel for `topic` that nobody has subscribed yet, with `bind` already run
 * on it.
 *
 * `RealtimeClient.channel(topic)` **returns the existing channel** when one is
 * registered under that topic, rather than making a new one. And a channel only
 * leaves that list once the server has acknowledged its leave - `removeChannel`
 * is asynchronous, and the usual `void supabase.removeChannel(channel)` in an
 * effect's cleanup does not wait for it. So any re-join of a topic that comes
 * soon after leaving it - a remount, a changed dependency, React's strict-mode
 * double mount in dev - is handed the *old* channel back, already subscribed,
 * and the first `.on('presence', …)` on it throws "cannot add `presence`
 * callbacks for realtime:<topic> after `subscribe()`".
 *
 * Two things close that, and both are needed:
 *
 * - **The stale channel is removed, and awaited, before asking.** Fired and
 *   forgotten would reproduce exactly the race being closed. In the common case
 *   there is nothing to remove and it costs nothing.
 * - **One setup at a time per topic, for the whole tab.** The removal looks for
 *   a channel that is *registered*; a join that overlaps another one is racing
 *   a channel that has not registered yet, and only queueing them closes that.
 *   Module-level, because `createClient()` hands every caller the same browser
 *   client, so the channel list is one list however many callers there are.
 *
 * Only the *setup* is queued - asking for the channel and binding its handlers
 * - not the subscribe. Waiting for a subscription would make a second join hang
 * for as long as the first takes to be admitted, and a channel the policy
 * refuses never completes at all. So `bind` must not subscribe: the caller does
 * that with what this resolves to.
 *
 * Born in the XP host (`app/xp/_hosts/realtime.ts`), which hit this in
 * production; moved here when the lounge hit it too.
 */
export function freshChannel(
  supabase: Channels,
  topic: string,
  options: RealtimeChannelOptions,
  bind: (channel: RealtimeChannel) => void,
): Promise<RealtimeChannel> {
  return afterSetup(topic, async () => {
    const stale = supabase
      .getChannels()
      .find((existing) => existing.topic === `realtime:${topic}`)
    if (stale) await supabase.removeChannel(stale)

    const made = supabase.channel(topic, options)
    bind(made)
    return made
  })
}

/**
 * The three methods used, rather than `SupabaseClient` itself, so a client typed
 * against the generated `Database` is accepted without fighting its generics.
 */
type Channels = Pick<SupabaseClient, 'channel' | 'getChannels' | 'removeChannel'>

const setups = new Map<string, Promise<unknown>>()

/** Run `work` once whatever was setting this topic up has finished. */
function afterSetup<T>(topic: string, work: () => Promise<T>): Promise<T> {
  const previous = setups.get(topic) ?? Promise.resolve()
  // Both arms, so one join that failed does not strand every later one behind
  // a rejected promise.
  const next = previous.then(work, work)
  setups.set(
    topic,
    next.catch(() => {}),
  )
  return next
}
