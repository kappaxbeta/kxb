import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireBackofficeSection } from '@/lib/backoffice'
import {
  perfEnabledAnywhere,
  readClientNames,
  readPerfRooms,
  readRoomSamples,
  type PerfRoom,
} from '@/domain/perf/queries'
import { EVENT_ORDER } from '@/domain/perf/events'
import {
  ceilingShare,
  oneWayGuess,
  projectedDeliveredHz,
  rollUpRoom,
  TENANT_EVENT_CEILING,
} from '@/domain/perf/rollup'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AutoRefresh } from '@/app/ovaloffice/health/auto-refresh'
import {
  ago,
  CeilingBar,
  frameGrade,
  hz,
  Metric,
  ms,
  rttGrade,
  share,
  StatePill,
} from './parts'

export const dynamic = 'force-dynamic'

/**
 * How a live room is running, from inside the browsers standing in it.
 *
 * ---------------------------------------------------------------------------
 * Why this is not part of Health
 * ---------------------------------------------------------------------------
 * Health answers "is the box alive", and a room can be perfectly served by a
 * healthy box and still be unplayable. Everything that makes it so happens
 * where the app process cannot see: on a Realtime channel it does not
 * subscribe to, and in a frame loop it has never run. The only witness is the
 * browser, which is why this page reads rows browsers wrote rather than
 * probing anything.
 *
 * ---------------------------------------------------------------------------
 * The four questions, in the order they are asked
 * ---------------------------------------------------------------------------
 *   1. **Is everyone connected?** Channel state per client, reconnects, how
 *      long since anything arrived, and whether supabase-js has silently
 *      dropped to sending broadcasts over REST.
 *   2. **How much traffic is this room making?** Per client *and* summed,
 *      because they answer different questions - the first says whether one
 *      person is behaving oddly, the second is what meets the tenant ceiling.
 *   3. **Is anyone's frame rate bad?** p50 and p95, never a mean: a steady
 *      50fps and a 60fps that hitches average the same and feel nothing alike.
 *   4. **How long does a change take to land on somebody else's screen?** A
 *      round trip, measured on one clock, and labelled as one.
 *
 * ---------------------------------------------------------------------------
 * The one-way figure, and why it is in small print
 * ---------------------------------------------------------------------------
 * There is no honest one-way measurement to be had here. Two browsers do not
 * share a clock, and `MoveMessage.t` is the sender's `performance.now()` -
 * whose epoch is the moment that tab opened - so subtracting one client's stamp
 * from another's produces a confident, meaningless number. What is measured is
 * a nonce out and the same nonce back, timed on the sender's own clock. The
 * halved figure appears beside it because everybody halves it in their head
 * anyway, and doing it here is the only way to attach the assumption to it: a
 * symmetric path, which mobile uplinks routinely are not.
 *
 * ---------------------------------------------------------------------------
 * Behind the `perf` flag, twice
 * ---------------------------------------------------------------------------
 * The nav hides the link when it is off and this refuses independently, the
 * same pattern `/ovaloffice/renders` keeps: a hidden link is not an access
 * control and people bookmark URLs. What the flag does *not* gate is the data -
 * samples already written stay readable when collection is switched off,
 * because the question after an incident is what the room looked like while it
 * was bad.
 */
export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; minutes?: string }>
}) {
  const { room, minutes } = await searchParams
  const period = asPeriod(minutes)

  const { admin } = await requireBackofficeSection('performance')

  /**
   * Refuses independently of the nav, the same pattern `/ovaloffice/renders`
   * keeps: a hidden link is not an access control and people bookmark URLs.
   *
   * The same question the nav asks - see `perfEnabledAnywhere`. Not
   * `resolveFeatures(supabase).perf`, which answers for the platform and would
   * 404 this page for an operator who had turned collection on for exactly one
   * space, which is the way it is meant to be used.
   */
  if (!(await perfEnabledAnywhere(admin))) notFound()

  const rooms = await readPerfRooms(admin, period)

  /**
   * Whichever room was asked for, or the one heard from most recently.
   *
   * Defaulting rather than showing an empty right-hand side: an operator who
   * opened this page has one room in mind and the busiest recent one is nearly
   * always it. A `?room=` naming something with no samples in the window falls
   * through to the same default rather than showing a blank detail pane for a
   * topic that has gone quiet.
   */
  const selected =
    rooms.find((candidate) => candidate.topic === room) ?? rooms[0] ?? null

  const samples = selected ? await readRoomSamples(admin, selected.topic, period) : []
  const rollup = samples.length > 0 ? rollUpRoom(samples) : null
  const names = rollup
    ? await readClientNames(admin, rollup.clients.map((client) => client.userId))
    : new Map<string, string>()

  const now = new Date().getTime()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Performance</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Live xo rooms — the lounge, the extra rooms, and battle arenas — as
            measured by the browsers standing in them. Nothing here is probed
            from the server: a frame rate and a Realtime channel are things only
            a client can see. Nothing is collected unless the{' '}
            <Link href="/ovaloffice/feature-flags" className="underline">
              perf flag
            </Link>{' '}
            is on; on, it measures every space&rsquo;s rooms, and a tenant
            override narrows it to one when the question is about one. Whether
            players are shown their own readings is a separate switch each space
            holds, and does not affect what is recorded here.
          </p>
        </div>
        <AutoRefresh sampledAt={new Date().toISOString()} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Window</span>
        {PERIODS.map((option) => (
          <Link
            key={option}
            href={{
              pathname: '/ovaloffice/performance',
              query: { minutes: option, ...(selected ? { room: selected.topic } : {}) },
            }}
            className={`rounded-full border px-3 py-1 font-mono ${
              option === period
                ? 'border-foreground/30 bg-foreground/10 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {option}m
          </Link>
        ))}
      </div>

      {rooms.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-8 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Nothing has been measured.</p>
            <p className="max-w-2xl">
              The flag resolved on for you, which is what let you open this page
              — but a room only writes a row while somebody is standing in it,
              and only if the flag also resolves on for that space. Check{' '}
              <code className="font-mono text-xs">perf</code> on{' '}
              <Link href="/ovaloffice/feature-flags" className="underline">
                Feature Flags
              </Link>{' '}
              is on globally, or has an override for the space you are watching,
              then open its lounge. The first row lands after fifteen seconds.
            </p>
            <p className="max-w-2xl">
              A room that has gone empty drops off this list once its last
              window ages out of the window above — widen it to see rooms that
              were busy earlier.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <RoomList rooms={rooms} selected={selected} period={period} now={now} />

          {!selected || !rollup ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No windows in the last {period} minutes for this room.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Summary room={selected} rollup={rollup} now={now} />
              <Traffic rollup={rollup} />
              <Clients rollup={rollup} names={names} now={now} />
            </div>
          )}
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Rows are kept for three days and then pruned. Turning the flag off stops
        collection and leaves everything already recorded in place — which is the
        point: the question after a bad afternoon is what the room looked like
        during it.
      </p>
    </div>
  )
}

/** The rooms with samples in the window, most recently heard from first. */
function RoomList({
  rooms,
  selected,
  period,
  now,
}: {
  rooms: PerfRoom[]
  selected: PerfRoom | null
  period: number
  now: number
}) {
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-sm">Rooms</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rooms.map((room) => {
          const active = room.topic === selected?.topic
          return (
            <Link
              key={room.topic}
              href={{
                pathname: '/ovaloffice/performance',
                query: { room: room.topic, minutes: period },
              }}
              className={`block rounded-lg border px-3 py-2 ${
                active
                  ? 'border-foreground/30 bg-foreground/5'
                  : 'border-transparent hover:bg-muted/40'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {room.tenantName ?? 'Unknown space'}
                </span>
                <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {room.roomKind}
                </span>
              </div>
              <p
                className="truncate font-mono text-[11px] text-muted-foreground"
                title={room.topic}
              >
                {room.topic}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>
                  {room.clients} {room.clients === 1 ? 'client' : 'clients'}
                </span>
                <span className="tabular-nums">{hz(room.deliveredHz)} in</span>
                <span title={room.lastSeen}>{ago(room.lastSeen, now)}</span>
                {room.unhealthy > 0 && (
                  <span className="text-red-400">{room.unhealthy} not connected</span>
                )}
                {room.restFallback && <span className="text-amber-400">REST</span>}
              </div>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}

/** The four questions, answered at the top in one row each. */
function Summary({
  room,
  rollup,
  now,
}: {
  room: PerfRoom
  rollup: NonNullable<ReturnType<typeof rollUpRoom>>
  now: number
}) {
  const worstFrame = rollup.clients.reduce<number | null>(
    (worst, client) =>
      client.worstFrameP95Ms === null
        ? worst
        : Math.max(worst ?? 0, client.worstFrameP95Ms),
    null,
  )
  const worstRtt = rollup.clients.reduce<number | null>(
    (worst, client) =>
      client.worstRttP95Ms === null ? worst : Math.max(worst ?? 0, client.worstRttP95Ms),
    null,
  )
  const medianRtt = rollup.clients
    .map((client) => client.rttP50Ms)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)[
    Math.floor(
      rollup.clients.filter((client) => client.rttP50Ms !== null).length / 2,
    )
  ] ?? null

  const oneWay = oneWayGuess(medianRtt)
  const ceiling = ceilingShare(rollup.deliveredHz)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-2 text-sm">
          <span>{room.tenantName ?? 'Unknown space'}</span>
          <span className="font-mono text-xs font-normal text-muted-foreground">
            {room.topic}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Connected"
            value={`${rollup.clients.length - rollup.unhealthy} / ${rollup.clients.length}`}
            grade={rollup.unhealthy > 0 ? 'bad' : 'good'}
            hint={
              rollup.restFallback
                ? 'One or more clients fell back to REST'
                : 'Clients whose latest window was subscribed'
            }
          />
          <Metric
            label="Room traffic"
            value={hz(rollup.deliveredHz)}
            grade={ceiling > 0.8 ? 'bad' : ceiling > 0.4 ? 'warn' : 'good'}
            hint={`delivered · ${hz(rollup.sentHz)} sent · ${share(ceiling)} of the ${TENANT_EVENT_CEILING}/s tenant ceiling`}
          />
          <Metric
            label="Worst frame p95"
            value={ms(worstFrame)}
            grade={frameGrade(worstFrame)}
            hint="The client having the hardest time, not the average one"
          />
          <Metric
            label="Round trip"
            value={ms(medianRtt)}
            grade={rttGrade(medianRtt)}
            hint={`p95 ${ms(worstRtt)} · ~${ms(oneWay)} one way if the path is symmetric`}
          />
        </div>

        <div className="space-y-2">
          <CeilingBar share={ceiling} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {rollup.clients.length} clients, {rollup.peers + 1} bodies at the
            room&rsquo;s busiest, last heard from{' '}
            <span title={room.lastSeen}>{ago(room.lastSeen, now)}</span>. Fan-out
            is quadratic: at this send rate a room of{' '}
            <span className="tabular-nums">{rollup.clients.length * 4}</span>{' '}
            would deliver about{' '}
            <span className="tabular-nums">
              {hz(
                projectedDeliveredHz(
                  rollup.clients.length > 0 ? rollup.sentHz / rollup.clients.length : 0,
                  rollup.clients.length * 4,
                ),
              )}
            </span>
            . That is arithmetic on today&rsquo;s numbers, not a measurement.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/** What the traffic is made of. */
function Traffic({ rollup }: { rollup: NonNullable<ReturnType<typeof rollUpRoom>> }) {
  const known = new Map(rollup.byEvent.map((rate) => [rate.event, rate]))
  const ordered = [
    ...EVENT_ORDER.filter((event) => known.has(event)).map(
      (event) => known.get(event)!,
    ),
    ...rollup.byEvent.filter((rate) => !EVENT_ORDER.includes(rate.event as never)),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Throughput by event</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Summed across every client in the room, which is what reaches the
          tenant&rsquo;s ceiling — a per-client rate would describe a twenty
          player room as no busier than a two player one. Delivered is larger
          than sent by roughly the room size, because every broadcast is fanned
          out to everybody else on the channel. <code className="font-mono">ping</code>{' '}
          is this page&rsquo;s own probe, counted like anything else rather than
          hidden inside the numbers it reports. <code className="font-mono">chat</code>{' '}
          crosses its own topic and is counted here anyway: the people in the
          room are making it.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="pb-2 font-normal">Event</th>
                <th className="pb-2 text-right font-normal">Sent</th>
                <th className="pb-2 text-right font-normal">Delivered</th>
                <th className="pb-2 text-right font-normal">Per client sent</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((rate) => (
                <tr key={rate.event} className="border-b border-border/40 last:border-0">
                  <td className="py-1.5 font-mono text-xs">{rate.event}</td>
                  <td className="py-1.5 text-right tabular-nums">{hz(rate.sentHz)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {hz(rate.deliveredHz)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {hz(
                      rollup.clients.length > 0
                        ? rate.sentHz / rollup.clients.length
                        : 0,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

/** One row per client, because a room's average describes nobody in it. */
function Clients({
  rollup,
  names,
  now,
}: {
  rollup: NonNullable<ReturnType<typeof rollUpRoom>>
  names: Map<string, string>
  now: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Clients</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          One row per tab, not per person: two tabs are two frame rates and two
          sockets, and the room&rsquo;s traffic is the sum of both. Jitter and
          delay are read straight off the interpolation buffer that draws remote
          bodies — they are its own estimate of the worst peer&rsquo;s link, and
          the delay is how far in the past that peer is being drawn.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="pb-2 font-normal">Client</th>
                <th className="pb-2 font-normal">Channel</th>
                <th className="pb-2 text-right font-normal">Sent</th>
                <th className="pb-2 text-right font-normal">In</th>
                <th className="pb-2 text-right font-normal">fps</th>
                <th className="pb-2 text-right font-normal">Frame p95</th>
                <th className="pb-2 text-right font-normal">Round trip</th>
                <th className="pb-2 text-right font-normal">Peer link</th>
              </tr>
            </thead>
            <tbody>
              {rollup.clients.map((client) => (
                <tr key={client.conn} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3">
                    <p className="font-medium">
                      {names.get(client.userId) ?? client.userId.slice(0, 8)}
                    </p>
                    <p
                      className="font-mono text-[11px] text-muted-foreground"
                      title={`${client.conn} · ${client.samples} windows`}
                    >
                      {client.conn.slice(0, 8)} · {ago(client.lastSeen, now)}
                    </p>
                  </td>
                  <td className="py-2 pr-3">
                    <StatePill state={client.channelState} />
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {client.reconnects > 0 && `${client.reconnects} reconnects · `}
                      {client.quietMs === null
                        ? 'nothing received'
                        : `quiet ${ms(client.quietMs)}`}
                      {client.restFallback && ' · REST fallback'}
                    </p>
                  </td>
                  <td className="py-2 text-right tabular-nums">{hz(client.sentHz)}</td>
                  <td className="py-2 text-right tabular-nums">{hz(client.recvHz)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {/*
                      A hidden tab drew nothing, and that is not zero frames a
                      second. Printing 0 here would read as a room that died
                      when it is a browser nobody is looking at.
                    */}
                    {client.hiddenShare > 0.5
                      ? 'hidden'
                      : client.fps === null
                        ? '—'
                        : Math.round(client.fps)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    <span className={frameGrade(client.worstFrameP95Ms) === 'bad' ? 'text-red-400' : ''}>
                      {ms(client.worstFrameP95Ms)}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    <span className={rttGrade(client.rttP50Ms) === 'bad' ? 'text-red-400' : ''}>
                      {ms(client.rttP50Ms)}
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      {client.rttSamples === 0
                        ? 'no echo'
                        : `${client.rttSamples} trips${client.rttLost > 0 ? ` · ${client.rttLost} lost` : ''}`}
                    </p>
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {client.linkJitterMs === null ? (
                      '—'
                    ) : (
                      <>
                        <span>±{ms(client.linkJitterMs)}</span>
                        <p className="text-[11px]">
                          drawn {ms(client.linkDelayMs)} behind
                        </p>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * The windows worth offering, in minutes.
 *
 * Much shorter than the health page's hours, and that is the difference between
 * the two: this measures something that is happening now, in a room somebody is
 * standing in, and rows are pruned after three days. A week-long window would
 * be a way of averaging a hundred different rooms into one number.
 */
const PERIODS = [5, 15, 60, 240] as const
type Period = (typeof PERIODS)[number]

function asPeriod(value: string | undefined): Period {
  const parsed = Number(value)
  return (PERIODS as readonly number[]).includes(parsed) ? (parsed as Period) : 15
}
