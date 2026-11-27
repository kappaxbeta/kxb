import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { EventBoxHealth } from '@/domain/events/boxes'

/**
 * The machines running events, and what they are costing.
 *
 * Two questions per box, and they are genuinely different:
 *
 *   - **Is Hetzner running it?** Cheap, always answerable, and says almost
 *     nothing. A box can be `running` with no certificate, no app and no
 *     database - every one of those has happened on a fresh box.
 *   - **Is it serving?** `/api/health` over the real domain, so it exercises
 *     DNS, TLS, Caddy and the app the same way an attendee's browser does.
 *
 * Both are shown, because the gap between them is the diagnosis. Running but
 * not serving, minutes after creation, is a certificate still being issued;
 * hours after creation, it is something to go and look at.
 */
export function EventBoxes({ boxes }: { boxes: EventBoxHealth[] | null }) {
  if (boxes === null) {
    return (
      <section>
        <Heading />
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm">Could not reach the Hetzner API.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check <code className="font-mono text-xs">HCLOUD_TOKEN</code>. An
              event box could be running and unwatched — this section is the
              only thing that would show it.
            </p>
          </CardContent>
        </Card>
      </section>
    )
  }

  if (boxes.length === 0) {
    return (
      <section>
        <Heading />
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm">No event boxes running.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This is the normal state, and it is the one that costs nothing.
              Boxes appear here from{' '}
              <code className="font-mono text-xs">bun run event:up &lt;slug&gt;</code>.
            </p>
          </CardContent>
        </Card>
      </section>
    )
  }

  return (
    <section>
      <Heading />
      <div className="grid gap-4 md:grid-cols-2">
        {boxes.map(({ box, reachable, ms, detail }) => {
          const running = box.status === 'running'

          return (
            <Card key={box.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <Link
                    href={`https://${box.slug}.${process.env.EVENT_ZONE ?? 'kxb.team'}`}
                    className="truncate underline-offset-2 hover:underline"
                  >
                    {box.slug}
                  </Link>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                      reachable
                        ? 'border-emerald-400/40 text-emerald-300'
                        : running
                          ? 'border-amber-400/40 text-amber-300'
                          : 'border-red-400/40 text-red-300'
                    }`}
                  >
                    {reachable ? 'serving' : running ? 'running, not serving' : box.status}
                  </span>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-2 text-sm">
                <Row
                  label="Hardware"
                  value={`${box.serverType} · ${box.cores} ${
                    box.dedicated ? 'dedicated' : 'shared'
                  } vCPU · ${box.memoryGb} GB · ${box.diskGb} GB`}
                />
                <Row label="Address" value={box.ip ?? 'no IPv4'} />
                <Row
                  label="Health"
                  value={reachable ? `200 in ${ms} ms` : (detail ?? 'unreachable')}
                />
                <Row label="Up for" value={formatAge(box.ageHours)} />
                {/*
                  The number that gets forgotten. Shown per box rather than as a
                  total, because the question somebody has when they open this
                  page is "which one of these should not still be here".
                */}
                {box.spentSoFar !== null && (
                  <Row
                    label="Cost so far"
                    value={`€${box.spentSoFar.toFixed(2)} (€${box.hourly?.toFixed(3)}/h)`}
                  />
                )}

                {!reachable && running && box.ageHours < 0.25 && (
                  <p className="pt-1 text-xs text-muted-foreground">
                    Freshly created — Caddy is probably still being issued a
                    certificate. Give it a minute.
                  </p>
                )}

                {!reachable && running && box.ageHours >= 0.25 && (
                  <p className="pt-1 text-xs text-amber-300">
                    Up for {formatAge(box.ageHours)} and still not serving. Try{' '}
                    <code className="font-mono text-xs">
                      ssh root@{box.ip} &apos;cd /opt/app &amp;&amp; docker compose logs
                      --tail 50&apos;
                    </code>
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Bring one home and destroy it with{' '}
        <code className="font-mono text-xs">bun run event:down &lt;slug&gt;</code> — it
        verifies the import before it deletes anything, and asks first.
      </p>
    </section>
  )
}

function Heading() {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h3 className="text-sm font-semibold">Event boxes</h3>
      <p className="text-xs text-muted-foreground">
        Separate deployments on their own machines. Nothing else on this page can
        see them.
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  )
}

/** Hours until a day has passed, then days. Hetzner bills by the hour. */
function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${hours.toFixed(1)} h`
  return `${(hours / 24).toFixed(1)} days`
}
