import { requireBackofficeSection } from '@/lib/backoffice'
import { probeDependencies, rollup } from '@/domain/health/probe'
import { buildDrift, peerUrls, readReplicas } from '@/domain/health/replicas'
import {
  readDbStats,
  readHealthSeries,
  readRealtimeLimits,
  readSweepHistory,
  type HealthSample,
  type SweepRun,
} from '@/domain/health/queries'
import {
  LIMIT_KEYS,
  LIMIT_LABELS,
  looksLikeSeedRevert,
  realtimeLimitDrift,
  type RealtimeTenantLimits,
} from '@/domain/health/realtime-limits'
import {
  HOST_LABELS,
  latestPerHost,
  loadPerCore,
  memoryUsed,
  readHostSeries,
  swapUsed,
  type HostSample,
} from '@/domain/health/host'
import { errorRate } from '@/domain/health/counters'
import {
  bytes,
  diskStatus,
  duration,
  heapPressure,
  lagStatus,
  loadStatus,
  memoryStatus,
  millis,
  overall,
  percent,
  statusLabel,
  windowTotals,
} from '@/domain/health/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Metric, Pill, ProbeRow, Sparkline, StatusPill } from './parts'
import { AutoRefresh } from './auto-refresh'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

/**
 * Is it up, and was it up.
 *
 * ---------------------------------------------------------------------------
 * Why this page is not just a stat block
 * ---------------------------------------------------------------------------
 * This deployment has three failure modes that every other surface in the app
 * is blind to, and each one is a section here:
 *
 *   1. One replica wedged while the other serves. Caddy balances randomly, so
 *      the site is neither up nor down - it is half-broken, and every existing
 *      check passes. Hence a card per replica rather than one set of numbers.
 *   2. The backend gone. Postgres, auth, realtime and storage live on a
 *      different machine at a different provider, and any of them can fail
 *      alone. Realtime dying means an empty lounge and a perfectly working
 *      site everywhere else.
 *   3. The replicas on different builds. The browser throws ChunkLoadError,
 *      both containers stay healthy, and nothing anywhere reports it. That is
 *      the banner at the top.
 *
 * Everything is probed on load rather than read from a cache, because a cached
 * health page is a page that can tell you things are fine after they stopped
 * being fine. The recorded history underneath is the other half - see the
 * migration for why a page that only probes live is not enough.
 */
export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ hours?: string }>
}) {
  const { hours } = await searchParams
  const window = asWindow(hours)

  const { admin } = await requireBackofficeSection('health')

  /**
   * Every measurement at once.
   *
   * The case that decides this is the outage: run in sequence, a page opened
   * while the backend is unreachable takes the sum of every timeout before it
   * renders the very information somebody opened it for.
   */
  const [
    replicas,
    probes,
    dbStats,
    series,
    hostSeries,
    realtimeLimits,
    sweeps,
  ] = await Promise.all([
    readReplicas(),
    probeDependencies(),
    readDbStats(admin),
    readHealthSeries(admin, window),
    readHostSeries(admin, window),
    /**
     * Null on any failure, including the RPC not existing yet, and the card
     * says which. Deliberately not `.catch(() => [])`: an empty array is the
     * `TenantNotFound` state and renders as an alarm, so swallowing an error
     * into one would turn "could not check" into "Realtime is down".
     */
    readRealtimeLimits(admin),
    /**
     * The sweep's own history, over the same window as every other chart here,
     * so the shapes on this page can be read against each other.
     */
    readSweepHistory(admin, window),
  ])

  const hosts = latestPerHost(hostSeries)

  const backend = rollup(probes)
  const builds = buildDrift(replicas)
  const unreachable = replicas.filter((replica) => !replica.reachable)

  // The disk is the same volume on every replica, so the first one that
  // answered speaks for all of them.
  const disk = replicas.find((replica) => replica.snapshot?.disk)?.snapshot?.disk ?? null

  const status = overall([
    backend,
    unreachable.length > 0 ? 'down' : 'ok',
    builds.length > 1 ? 'down' : 'ok',
    diskStatus(disk?.freeBytes ?? null, disk?.totalBytes ?? null),
    ...replicas.map((replica) => lagStatus(replica.snapshot?.eventLoopLagMs ?? null)),
    // The boxes themselves count toward the headline. A database server at 97%
    // memory is a red morning even while every probe above it still answers -
    // that is the half hour before it stops answering.
    ...[...hosts.values()].flatMap((host) => [
      loadStatus(loadPerCore(host)),
      memoryStatus(memoryUsed(host)),
    ]),
  ])

  const replicaNames = [...new Set(series.map((sample) => sample.replica))]
  const totals = windowTotals(series)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Health</h2>
            <StatusPill status={status} label={statusLabel(status)} />
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Probed live on every load, across every replica. The app runs behind
            a random load balancer, so one card per replica — a single set of
            numbers would describe whichever container happened to render this.
          </p>
        </div>
        <AutoRefresh sampledAt={new Date().toISOString()} />
      </div>

      {/*
        The ChunkLoadError banner.
        ...........................................................
        First thing on the page when it fires, because it is the failure that
        looks like nothing else: every health check passes, both containers are
        up, and the browser cannot load the app. Nothing else in this system
        would ever tell you.
      */}
      {builds.length > 1 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-400">
            Replicas are running different builds
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Caddy serves the HTML from one replica and{' '}
            <code className="font-mono text-xs">/_next/static/chunks/*.js</code> from
            the other, so browsers will throw <code className="font-mono text-xs">ChunkLoadError</code>.
            Both containers are healthy and nothing else reports this. Redeploy so
            both run one image.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {replicas
              .filter((replica) => replica.snapshot?.buildId)
              .map((replica) => (
                <Pill key={replica.name}>
                  {replica.name}: {replica.snapshot!.buildId}
                </Pill>
              ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Replicas                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <div className="mb-3 flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">Replicas</h3>
          <p className="text-xs text-muted-foreground">
            {peerUrls().length === 0
              ? 'no peers configured — this process only'
              : `${replicas.length} configured in compose.yaml`}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {replicas.map((replica) => {
            const snapshot = replica.snapshot
            const pressure = heapPressure(
              snapshot?.heapUsedBytes ?? null,
              snapshot?.heapTotalBytes ?? null,
            )
            const lag = lagStatus(snapshot?.eventLoopLagMs ?? null)
            const rate = snapshot ? errorRate(snapshot.counters) : null

            const memoryOf = (sample: HealthSample) => sample.rssBytes
            const lagOf = (sample: HealthSample) => sample.eventLoopLagMs

            return (
              <Card key={replica.name}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm">{replica.name}</span>
                    <StatusPill
                      status={!replica.reachable ? 'down' : (lag ?? 'ok')}
                      label={replica.reachable ? undefined : 'Unreachable'}
                    />
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  {!replica.reachable ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        No answer in {replica.ms} ms.
                      </p>
                      {replica.error && (
                        <p className="font-mono text-[11px] text-red-400">
                          {replica.error}
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <Metric label="Memory" value={bytes(snapshot!.rssBytes)} hint="rss" />
                        <Metric
                          label="Heap"
                          value={percent(pressure)}
                          hint={`${bytes(snapshot!.heapUsedBytes)} used`}
                          status={
                            pressure !== null && pressure > 0.9
                              ? 'slow'
                              : null
                          }
                        />
                        <Metric
                          label="Loop lag"
                          value={millis(snapshot!.eventLoopLagMs)}
                          hint={`p99 ${millis(snapshot!.eventLoopLagP99Ms)}`}
                          status={lag}
                        />
                        <Metric
                          label="Uptime"
                          value={duration(snapshot!.uptimeSeconds)}
                          hint={snapshot!.nodeVersion}
                        />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <Metric
                          label="Requests"
                          value={snapshot!.counters.requests.toLocaleString()}
                          hint="since start"
                        />
                        <Metric
                          label="Errors"
                          value={snapshot!.counters.errors.toLocaleString()}
                          hint={rate === null ? 'no traffic yet' : percent(rate)}
                          status={rate !== null && rate > 0.01 ? 'slow' : null}
                        />
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Build</p>
                          <p className="mt-0.5 truncate font-mono text-xs">
                            {snapshot!.buildId ?? 'dev'}
                          </p>
                        </div>
                      </div>

                      {/* The shape of the last window, if anything recorded it. */}
                      {replicaNames.includes(replica.name) && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="mb-1 text-[11px] text-muted-foreground">
                              Memory, last {window}h
                            </p>
                            <Sparkline
                              className="text-emerald-400/70"
                              title={`Memory for ${replica.name} over the last ${window} hours`}
                              values={seriesFor(series, replica.name, memoryOf)}
                            />
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] text-muted-foreground">
                              Loop lag, last {window}h
                            </p>
                            <Sparkline
                              className="text-amber-400/70"
                              title={`Event loop lag for ${replica.name} over the last ${window} hours`}
                              values={seriesFor(series, replica.name, lagOf)}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Machines                                                           */}
      {/* ------------------------------------------------------------------ */}
      {/*
        The two Linux boxes, which nothing else here can see.
        ...........................................................
        The replica cards above report process memory, which is not the same
        question as whether the box has RAM left - and the database machine has
        no app process on it at all, so until this section existed it was a
        complete blind spot. Realtime being OOM-killed on the Strato box empties
        every lounge while leaving all of the above green.
      */}
      <section>
        <div className="mb-3 flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">Machines</h3>
          <p className="text-xs text-muted-foreground">
            CPU and memory of the hosts, pushed every five minutes by the agent.
          </p>
        </div>

        {hosts.size === 0 ? (
          <Card>
            <CardContent className="space-y-2 pt-6">
              <p className="text-sm">No host readings yet.</p>
              <p className="text-sm text-muted-foreground">
                The app cannot see either box on its own — a small agent on each
                one reads <code className="font-mono text-xs">/proc</code> and posts
                it here. Install it with{' '}
                <code className="font-mono text-xs">./scripts/health-cron.sh install</code>.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {['app', 'db'].map((key) => {
              const host = hosts.get(key)
              if (!host) return null

              const perCore = loadPerCore(host)
              const memory = memoryUsed(host)
              const swap = swapUsed(host)
              const load = loadStatus(perCore)
              const memoryLevel = memoryStatus(memory)

              return (
                <Card key={key}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span className="text-sm">{HOST_LABELS[key] ?? key}</span>
                      <StatusPill status={overall([load, memoryLevel])} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <Metric
                        label="CPU"
                        value={percent(host.cpuBusy)}
                        hint={`${host.cpuCores ?? '—'} cores`}
                        status={
                          host.cpuBusy !== null && host.cpuBusy > 0.9 ? 'slow' : null
                        }
                      />
                      <Metric
                        label="Load"
                        value={host.load1 === null ? '—' : host.load1.toFixed(2)}
                        hint={
                          perCore === null ? '1 min' : `${perCore.toFixed(2)} per core`
                        }
                        status={load}
                      />
                      <Metric
                        label="Memory"
                        value={percent(memory)}
                        hint={`${bytes(host.memAvailableBytes)} free of ${bytes(
                          host.memTotalBytes,
                        )}`}
                        status={memoryLevel}
                      />
                      <Metric
                        label="Disk"
                        value={bytes(host.diskFreeBytes)}
                        hint={`of ${bytes(host.diskTotalBytes)}`}
                        status={diskStatus(host.diskFreeBytes, host.diskTotalBytes)}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>Up {duration(host.uptimeSeconds)}</span>
                      {host.hostname && (
                        <span className="font-mono">{host.hostname}</span>
                      )}
                      {/* Swap is only mentioned when there is any, and only
                          matters once it is being used - a box with swap sitting
                          at zero is a box with nothing to say about swap. */}
                      {swap !== null && swap > 0.01 && (
                        <span className={swap > 0.5 ? 'text-amber-400' : undefined}>
                          Swap {percent(swap)}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-[11px] text-muted-foreground">
                          CPU, last {window}h
                        </p>
                        <Sparkline
                          className="text-rose-400/70"
                          title={`CPU busy on ${HOST_LABELS[key] ?? key} over the last ${window} hours`}
                          values={hostValues(hostSeries, key, (s) => s.cpuBusy)}
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-[11px] text-muted-foreground">
                          Memory used, last {window}h
                        </p>
                        <Sparkline
                          className="text-emerald-400/70"
                          title={`Memory used on ${HOST_LABELS[key] ?? key} over the last ${window} hours`}
                          values={hostValues(hostSeries, key, memoryUsed)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Backend                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="text-sm">Backend</span>
              <StatusPill status={backend} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">
              Supabase runs on a separate machine, so each of these is a network
              hop that can fail alone. Realtime down means an empty lounge and a
              working site everywhere else.
            </p>
            {probes.map((probe) => (
              <ProbeRow
                key={probe.name}
                name={probe.name}
                status={probe.status}
                ms={probe.ms}
                detail={probe.detail}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Database</CardTitle>
          </CardHeader>
          <CardContent>
            {!dbStats ? (
              <p className="text-sm text-muted-foreground">
                Could not read database statistics — see the Postgres probe.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <Metric label="Size" value={bytes(dbStats.sizeBytes)} />
                  <Metric
                    label="Connections"
                    value={`${dbStats.connections}`}
                    hint={`of ${dbStats.maxConnections}`}
                    status={
                      dbStats.maxConnections > 0 &&
                      dbStats.connections / dbStats.maxConnections > 0.8
                        ? 'slow'
                        : null
                    }
                  />
                  <Metric
                    label="Uploads free"
                    value={bytes(disk?.freeBytes ?? null)}
                    hint={disk ? `of ${bytes(disk.totalBytes)}` : 'volume not mounted'}
                    status={diskStatus(disk?.freeBytes ?? null, disk?.totalBytes ?? null)}
                  />
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Largest tables — row counts are planner estimates, not counts.
                  </p>
                  <div className="space-y-1">
                    {dbStats.tables.map((table) => (
                      <div
                        key={table.name}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="truncate font-mono">{table.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {bytes(table.bytes)} · ~{table.rows.toLocaleString()} rows
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* History                                                            */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Recorded history</h3>
            <p className="text-xs text-muted-foreground">
              Written every five minutes by the sampler, per replica.
            </p>
          </div>
          {/* The window as a link rather than client state, matching the
              analytics pages: "the last week of health" should be something
              you can send somebody. */}
          <div className="flex gap-1 rounded-lg border p-1 text-sm">
            {WINDOWS.map((option) => (
              <Link
                key={option}
                href={`/ovaloffice/health?hours=${option}`}
                aria-current={option === window ? 'page' : undefined}
                className={`rounded px-3 py-1 transition ${
                  option === window
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {windowLabel(option)}
              </Link>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            {series.length === 0 ? (
              /*
                Said plainly rather than drawn as an empty chart. Nothing
                installs the sampler automatically, so "no history" is the
                expected state until somebody adds the cron line - and an empty
                graph would read as "no traffic", which is a different and much
                more alarming claim.
              */
              <div className="space-y-2">
                <p className="text-sm">No samples recorded yet.</p>
                <p className="text-sm text-muted-foreground">
                  The live probes above work regardless. To record history, schedule{' '}
                  <code className="font-mono text-xs">POST /api/cron/sample-health</code>{' '}
                  with the <code className="font-mono text-xs">CRON_SECRET</code> bearer
                  token every five minutes on the app host.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Metric
                    label="Requests"
                    value={totals.requests.toLocaleString()}
                    hint={`last ${window}h, all replicas`}
                  />
                  <Metric
                    label="Errors"
                    value={totals.errors.toLocaleString()}
                    hint={totals.rate === null ? 'no traffic' : percent(totals.rate)}
                    status={totals.rate !== null && totals.rate > 0.01 ? 'slow' : null}
                  />
                  <Metric
                    label="Samples"
                    value={series.length.toLocaleString()}
                    hint={`${replicaNames.length} replica${replicaNames.length === 1 ? '' : 's'}`}
                  />
                  <Metric
                    label="Restarts"
                    value={`${countRestarts(series)}`}
                    hint="uptime went backwards"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Database size</p>
                    <Sparkline
                      className="text-sky-400/70"
                      title={`Database size over the last ${window} hours`}
                      values={dedupeByTime(series).map((sample) => sample.dbSizeBytes)}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Connections</p>
                    <Sparkline
                      className="text-violet-400/70"
                      title={`Database connections over the last ${window} hours`}
                      values={dedupeByTime(series).map((sample) => sample.dbConnections)}
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <RealtimeLimitsCard limits={realtimeLimits} />

        <SweepCard runs={sweeps} window={window} />
      </section>
    </div>
  )
}

/**
 * The projection sweep, over time.
 *
 * ---------------------------------------------------------------------------
 * Why a chart and not a status
 * ---------------------------------------------------------------------------
 * The sweep does not fail visibly. It falls behind, and falling behind looks
 * exactly like working right up until somebody notices a read model that is a
 * few minutes stale, then an hour, then a day. The single number that
 * distinguishes the two is `remaining` - pairs that were behind when the run
 * started and were still behind when its deadline arrived - and it is only
 * meaningful *as a series*: one non-zero run is a backlog after a quiet period,
 * twenty in a row is a sweep that no longer fits in a minute.
 *
 * So the live value is the small print here and the shape is the headline,
 * which is the opposite of every other card on this page.
 */
function SweepCard({ runs, window }: { runs: SweepRun[]; window: number }) {
  const latest = runs[0]

  // Newest-first from the query, oldest-first for a chart that reads left to
  // right like every other one on this page.
  const series = [...runs].reverse()

  const stuck = runs.length >= 5 && runs.slice(0, 5).every((run) => run.remaining > 0)
  const anyFailed = runs.some((run) => run.failed > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Projection sweep</CardTitle>
      </CardHeader>
      <CardContent>
        {!latest ? (
          <p className="text-sm text-muted-foreground">
            No runs recorded. The sweep writes a row every minute, so this is
            either a stack where{' '}
            <code className="font-mono text-xs">/api/cron/project</code> is not
            scheduled — see{' '}
            <code className="font-mono text-xs">scripts/app-cron.sh install</code>{' '}
            — or one where it is switched off.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">
                {runs.length} run{runs.length === 1 ? '' : 's'} in {windowLabel(window as Window)}
              </span>
              <StatusPill
                status={stuck ? 'down' : anyFailed ? 'slow' : 'ok'}
                label={
                  stuck
                    ? 'falling behind'
                    : anyFailed
                      ? 'errors in window'
                      : 'keeping up'
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Metric
                label="Remaining"
                value={`${latest.remaining}`}
                hint="behind at deadline"
                status={latest.remaining > 0 ? (stuck ? 'down' : 'slow') : null}
              />
              <Metric label="Applied" value={`${latest.applied}`} hint="last run" />
              <Metric label="Swept" value={`${latest.swept}`} hint={`of ${latest.pending}`} />
              <Metric
                label="Failed"
                value={`${latest.failed}`}
                status={latest.failed > 0 ? 'down' : null}
              />
              <Metric label="Duration" value={millis(latest.ms)} hint="last run" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  Remaining — flat zero is healthy
                </p>
                <Sparkline
                  className="text-amber-400/70"
                  title={`Projection pairs still behind at the deadline, last ${window} hours`}
                  values={series.map((run) => run.remaining)}
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Run duration</p>
                <Sparkline
                  className="text-sky-400/70"
                  title={`How long each sweep took, last ${window} hours`}
                  values={series.map((run) => run.ms)}
                />
              </div>
            </div>

            {stuck ? (
              <p className="text-sm text-red-400">
                Five runs in a row ended with work outstanding. The sweep no
                longer fits in its minute — shorten the interval or give it its
                own process. Raising the batch size makes each run longer, not
                shorter, so it is the wrong lever.
              </p>
            ) : null}

            {latest.errors.length > 0 ? (
              <div className="text-sm text-red-400">
                <p className="mb-1">Last run reported:</p>
                <ul className="list-inside list-disc font-mono text-xs">
                  {latest.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              {latest.spaces} spaces × {latest.projections} projections. Switch it
              off under Feature flags → Projection sweep; that is an installation
              switch, and separate from{' '}
              <code className="font-mono text-[11px]">PROJECTION_SWEEP=off</code>,
              which is how develop is stopped from sweeping production&rsquo;s data.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The Realtime ceilings, and whether they are still what we set.
 *
 * ---------------------------------------------------------------------------
 * Why this is on a health page and not in a runbook
 * ---------------------------------------------------------------------------
 * The limits live in one row of `_realtime.tenants`, and Realtime's own
 * `seeds.exs` deletes and recreates that row on every boot unless
 * `SEED_SELF_HOST` is false. When that protection is lost the numbers drop to
 * the schema defaults, and **the symptom is not an outage**: at the stock 100
 * events/s, a room of ten delivered 8.6% of movement frames. Everybody involved
 * experiences that as the netcode having got worse, which is not a thing anyone
 * greps for, and the site stays green everywhere else.
 *
 * So it belongs beside the other three failure modes this page exists for - the
 * wedged replica, the vanished backend, the mismatched builds. All four are
 * invisible to every other surface in the app.
 */
function RealtimeLimitsCard({ limits }: { limits: RealtimeTenantLimits[] | null }) {
  // Null and empty are different sentences and must not render as one. Null is
  // "the RPC failed or the migration has not been applied"; empty is "there is
  // no tenant row", which is `TenantNotFound` - Realtime refusing connections
  // outright, the worst state on this card. Neither is "fine".
  const unreadable = limits === null
  const missing = limits !== null && limits.length === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Realtime limits</CardTitle>
      </CardHeader>
      <CardContent>
        {unreadable ? (
          <p className="text-sm text-muted-foreground">
            Could not read the Realtime limits. If everything else here is
            healthy, the likely cause is that{' '}
            <code className="font-mono text-xs">health_realtime_limits()</code> has
            not been applied to this database yet.
          </p>
        ) : missing ? (
          <p className="text-sm text-red-400">
            No Realtime tenant row at all. This is <code className="font-mono text-xs">TenantNotFound</code>{' '}
            — Realtime refuses every connection in this state, so the lounge,
            chat and presence are all down. Run{' '}
            <code className="font-mono text-xs">scripts/realtime-limits.sh</code>{' '}
            after restoring the row.
          </p>
        ) : (
          limits.map((tenant) => {
            const drift = realtimeLimitDrift(tenant)
            const seedRevert = looksLikeSeedRevert(drift)

            return (
              <div key={tenant.externalId} className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <Pill>{tenant.externalId}</Pill>
                  <StatusPill
                    status={drift.length === 0 ? 'ok' : seedRevert ? 'down' : 'slow'}
                    label={
                      drift.length === 0
                        ? 'as configured'
                        : seedRevert
                          ? 'reverted to defaults'
                          : `${drift.length} off`
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                  {LIMIT_KEYS.map((key) => {
                    const off = drift.find((d) => d.key === key)
                    return (
                      <Metric
                        key={key}
                        label={LIMIT_LABELS[key]}
                        value={tenant[key].toLocaleString('en-GB')}
                        hint={
                          off
                            ? `expected ${off.expected.toLocaleString('en-GB')}`
                            : undefined
                        }
                        status={off ? (off.lower ? 'down' : 'slow') : null}
                      />
                    )
                  })}
                </div>

                {seedRevert ? (
                  <p className="text-sm text-red-400">
                    Every limit is below what we set, which is the signature of
                    Realtime&rsquo;s seed having run. An UPDATE alone will not hold
                    — it reverts on the next restart. Set{' '}
                    <code className="font-mono text-xs">SEED_SELF_HOST: &quot;false&quot;</code>{' '}
                    in{' '}
                    <code className="font-mono text-xs">
                      /opt/supabase-project/docker-compose.yml
                    </code>{' '}
                    first, then run{' '}
                    <code className="font-mono text-xs">scripts/realtime-limits.sh</code>.
                  </p>
                ) : drift.length > 0 ? (
                  <p className="text-sm text-amber-400">
                    Someone changed these on the box without changing{' '}
                    <code className="font-mono text-xs">EXPECTED_REALTIME_LIMITS</code>.
                    Either run{' '}
                    <code className="font-mono text-xs">scripts/realtime-limits.sh</code>{' '}
                    to put the box back, or update the constant if the box is
                    right.
                  </p>
                ) : null}

                <p className="text-xs text-muted-foreground">
                  Row last created {tenant.updatedAt ?? 'unknown'}. No trigger
                  writes that column, so applying new values does not move it —
                  it is evidence of the seed recreating the row, not of an
                  apply.
                </p>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

/** The windows worth offering, in hours. */
const WINDOWS = [6, 24, 72, 168] as const
type Window = (typeof WINDOWS)[number]

function asWindow(value: string | undefined): Window {
  const parsed = Number(value)
  return (WINDOWS as readonly number[]).includes(parsed) ? (parsed as Window) : 24
}

function windowLabel(hours: Window): string {
  return hours < 48 ? `${hours}h` : `${hours / 24}d`
}

/** One machine's readings, oldest first. */
function hostValues(
  series: HostSample[],
  host: string,
  pick: (sample: HostSample) => number | null,
): (number | null)[] {
  return series.filter((sample) => sample.host === host).map(pick)
}

/** One replica's readings, oldest first. */
function seriesFor(
  series: HealthSample[],
  replica: string,
  pick: (sample: HealthSample) => number | null,
): (number | null)[] {
  return series.filter((sample) => sample.replica === replica).map(pick)
}

/**
 * Backend readings are written onto every replica's row, so a two-replica
 * deployment stores each database size twice. Charting the raw series would
 * draw every point twice and halve the effective window.
 */
function dedupeByTime(series: HealthSample[]): HealthSample[] {
  const seen = new Set<string>()
  return series.filter((sample) => {
    if (seen.has(sample.sampledAt)) return false
    seen.add(sample.sampledAt)
    return true
  })
}

/**
 * How many times a process restarted in the window.
 *
 * Uptime going backwards is the signal - the same one `health_series` uses to
 * decide a counter reset. Worth surfacing because a replica that is quietly
 * being OOM-killed and restarted looks perfectly healthy in every instantaneous
 * reading on this page; the only trace is that its uptime keeps starting over.
 */
function countRestarts(series: HealthSample[]): number {
  const previous = new Map<string, number>()
  let restarts = 0

  for (const sample of series) {
    if (sample.uptimeSeconds === null) continue
    const last = previous.get(sample.replica)
    if (last !== undefined && sample.uptimeSeconds < last) restarts += 1
    previous.set(sample.replica, sample.uptimeSeconds)
  }

  return restarts
}
