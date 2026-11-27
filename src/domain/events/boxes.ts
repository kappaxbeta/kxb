import 'server-only'

/**
 * The machines running events right now.
 *
 * An event box is a whole second deployment - its own Postgres, its own
 * Realtime, its own Caddy - standing on a machine that did not exist last week
 * and will not exist next week. That is exactly the shape of thing the health
 * page was built for: `/ovaloffice/health` exists because this deployment has
 * failure modes nothing else reports, and "the hackathon's box filled its disk
 * on Saturday afternoon" is the newest of them.
 *
 * It is also the only place the *money* is visible. A box nobody remembered to
 * destroy bills quietly at €0.16 an hour until somebody opens the Hetzner
 * console, and nobody opens the Hetzner console. Showing the age and the
 * running cost beside the health is what makes a forgotten box obvious.
 *
 * Read straight from the Hetzner API rather than from a table of our own,
 * because a table would be a second answer to "what is running" and the wrong
 * one exactly when it matters - after a box was destroyed by hand, or created
 * by a run that died before it could record anything. The cloud provider is the
 * source of truth about which machines exist.
 */

const CLOUD_API = 'https://api.hetzner.cloud/v1'

export interface EventBox {
  id: number
  /** `event-<slug>`, the name event-up gives it. */
  name: string
  /** The event's slug, and its subdomain. */
  slug: string
  ip: string | null
  /** running | off | starting | ... straight from Hetzner. */
  status: string
  serverType: string
  cores: number
  memoryGb: number
  diskGb: number
  /** Dedicated vCPU, or shared with the rest of the rack. */
  dedicated: boolean
  createdAt: string
  /** Hours since it was created. Hetzner bills by the hour. */
  ageHours: number
  /** Gross € per hour in this location, or null if the API did not say. */
  hourly: number | null
  /** What it has cost so far, which is the number that gets forgotten. */
  spentSoFar: number | null
}

export interface EventBoxHealth {
  box: EventBox
  /** Did `https://<slug>.<zone>/api/health` answer 200? */
  reachable: boolean
  ms: number
  detail: string | null
}

interface HetznerServer {
  id: number
  name: string
  status: string
  created: string
  labels: Record<string, string>
  public_net: { ipv4: { ip: string } | null }
  server_type: {
    name: string
    cores: number
    memory: number
    disk: number
    cpu_type: string
    prices: { location: string; price_hourly: { gross: string } }[]
  }
  datacenter: { location: { name: string } }
}

/**
 * Every box `event-up` has stood up, by its label rather than its name.
 *
 * `role=event` is set at creation. Filtering on the label rather than on an
 * `event-` name prefix means somebody renaming a box in the console does not
 * make it vanish from this page - and a box that has vanished from this page is
 * a box nobody is watching.
 *
 * Returns an empty list rather than throwing when the token is absent, because
 * most installations of this codebase will never provision a box and the health
 * page must not break for them. A token that is present but *wrong* does throw:
 * that is a real misconfiguration and silently reporting "no boxes" would hide
 * a running event.
 */
export async function listEventBoxes(): Promise<EventBox[]> {
  const token = process.env.HCLOUD_TOKEN
  if (!token) return []

  const response = await fetch(`${CLOUD_API}/servers?label_selector=role%3Devent`, {
    headers: { Authorization: `Bearer ${token}` },
    // Never cached. The whole value of this section is that it is true right
    // now, and a box that was destroyed two minutes ago must stop appearing.
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Hetzner returned ${response.status} listing event boxes`)
  }

  const { servers } = (await response.json()) as { servers: HetznerServer[] }
  const now = Date.now()

  return servers.map((server) => {
    const location = server.datacenter?.location?.name
    const price = server.server_type.prices.find((entry) => entry.location === location)
    const hourly = price ? Number(price.price_hourly.gross) : null
    const ageHours = (now - new Date(server.created).getTime()) / 3_600_000

    return {
      id: server.id,
      name: server.name,
      // The label is authoritative; the name is only a fallback for a box
      // created before labels were set.
      slug: server.labels.event ?? server.name.replace(/^event-/, ''),
      ip: server.public_net.ipv4?.ip ?? null,
      status: server.status,
      serverType: server.server_type.name,
      cores: server.server_type.cores,
      memoryGb: server.server_type.memory,
      diskGb: server.server_type.disk,
      dedicated: server.server_type.cpu_type === 'dedicated',
      createdAt: server.created,
      ageHours,
      hourly,
      spentSoFar: hourly === null ? null : hourly * ageHours,
    }
  })
}

/**
 * Is the event actually serving?
 *
 * The box being "running" in Hetzner's sense says only that a machine is
 * powered on. It says nothing about whether Caddy got its certificate, whether
 * the app built, or whether Postgres came up - and every one of those has
 * failed on a fresh box while the API cheerfully reported `running`. So this
 * asks the app.
 *
 * `/api/health` and not the front page, because the front page is a full render
 * and a slow one is not the same as a broken one.
 */
export async function probeEventBox(
  box: EventBox,
  zone = process.env.EVENT_ZONE ?? 'kxb.team',
): Promise<EventBoxHealth> {
  const started = Date.now()
  const url = `https://${box.slug}.${zone}/api/health`

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      // Short: this runs on the health page, and a box that is down should not
      // hold the whole page hostage. A fresh box takes a minute or two to get
      // its certificate, and during that window "not reachable yet" is the
      // honest answer rather than something to wait for.
      signal: AbortSignal.timeout(5_000),
    })

    return {
      box,
      reachable: response.ok,
      ms: Date.now() - started,
      detail: response.ok ? null : `HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      box,
      reachable: false,
      ms: Date.now() - started,
      detail: error instanceof Error ? error.message : 'unreachable',
    }
  }
}

/** Every box, probed in parallel. */
export async function readEventBoxes(): Promise<EventBoxHealth[]> {
  const boxes = await listEventBoxes()
  return Promise.all(boxes.map((box) => probeEventBox(box)))
}

/**
 * The Realtime headroom this box was provisioned with, as a sentence.
 *
 * Not read from the box - that would need a database connection to a machine
 * this page has no credentials for. It is what `event-up` sets, so it is what
 * the box has unless somebody changed it by hand.
 */
export function provisionedBudget(): number {
  return Number(process.env.EVENT_REALTIME_EVENTS_PER_SEC ?? 20_000)
}
