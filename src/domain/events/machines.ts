import 'server-only'
import type { Client } from '@/es/store'

/**
 * The console's half of the provisioning conversation.
 *
 * Everything here either *asks* for something or *reads* progress. Nothing here
 * touches Hetzner, holds a token, or shells out - that is `scripts/event-agent.ts`,
 * running somewhere with the credentials. See the migration header for why the
 * two are split.
 */

export type MachineStatus =
  | 'requested'
  | 'provisioning'
  | 'ready'
  | 'failed'
  | 'retiring'
  | 'gone'

export interface MachineView {
  tenantId: string
  status: MachineStatus
  serverType: string
  /**
   * Hetzner's id, once there is one - and it matters most when the status is
   * `failed`. Provisioning creates the server early and can break at any step
   * after it, so a failed row very often has a real machine behind it, running
   * and billing. Without this the console cannot say so, and the operator is
   * told "it did not work" about something that is quietly costing money.
   */
  serverId: number | null
  ip: string | null
  guestUrl: string | null
  log: string
  error: string | null
  claimedBy: string | null
  createdAt: string
  updatedAt: string
  /**
   * Has anybody picked this up?
   *
   * A request that sits in `requested` for minutes means no agent is running -
   * which is the single most likely thing to be wrong, and completely invisible
   * from the console without saying so. The threshold is generous because the
   * timer polls every thirty seconds and a busy agent finishes one job first.
   */
  stalled: boolean
}

interface MachineRow {
  tenant_id: string
  status: string
  server_type: string
  server_id: number | null
  ip: string | null
  guest_url: string | null
  log: string
  error: string | null
  claimed_by: string | null
  created_at: string
  updated_at: string
}

const STALLED_AFTER_MS = 3 * 60_000

function toView(row: MachineRow): MachineView {
  const waiting = row.status === 'requested'
  return {
    tenantId: row.tenant_id,
    status: row.status as MachineStatus,
    serverType: row.server_type,
    serverId: row.server_id,
    ip: row.ip,
    guestUrl: row.guest_url,
    log: row.log ?? '',
    error: row.error,
    claimedBy: row.claimed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stalled: waiting && Date.now() - new Date(row.created_at).getTime() > STALLED_AFTER_MS,
  }
}

/** This event's machine, or null if it has never asked for one. */
export async function getMachine(
  admin: Client,
  tenantId: string,
): Promise<MachineView | null> {
  const { data, error } = await admin
    .from('event_machines')
    .select(
      'tenant_id, status, server_type, server_id, ip, guest_url, log, error, claimed_by, created_at, updated_at',
    )
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error || !data) return null
  return toView(data as MachineRow)
}

/** Every machine, for the events list to badge rows with. */
export async function listMachines(admin: Client): Promise<Map<string, MachineView>> {
  const { data } = await admin
    .from('event_machines')
    .select(
      'tenant_id, status, server_type, server_id, ip, guest_url, log, error, claimed_by, created_at, updated_at',
    )

  const out = new Map<string, MachineView>()
  for (const row of data ?? []) out.set(row.tenant_id, toView(row as MachineRow))
  return out
}

/**
 * Where this event actually lives right now.
 *
 * The question the console has to answer before it can show a link, and the
 * reason it is a function rather than a field: an event moves. It starts on
 * kxb.team, may be given a box at `<slug>.kxb.team` for the weekend, and comes
 * back afterwards. A link stored once is wrong for two of those three phases,
 * which is exactly the confusion of having two different links for one event.
 */
export function eventOrigin(
  slug: string,
  machine: MachineView | null,
  mainOrigin: string,
  zone = process.env.EVENT_ZONE ?? 'kxb.team',
): string {
  if (machine && (machine.status === 'ready' || machine.status === 'provisioning')) {
    return `https://${slug}.${zone}`
  }
  return mainOrigin
}
