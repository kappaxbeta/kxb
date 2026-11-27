'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { requestMachine, retireMachine } from '@/domain/events/actions'
import type { MachineView } from '@/domain/events/machines'
import { ErrorNote } from '@/app/components/error-note'

/**
 * Where this event is running, and the link into it.
 *
 * ----------------------------------------------------------------------------
 * One link, and it moves
 * ----------------------------------------------------------------------------
 * An event lives on kxb.team, may be given a box at `<slug>.kxb.team` for the
 * weekend, and comes home afterwards. The link has to follow it, which is why
 * it is computed from where the machine currently is rather than stored once -
 * a stored link is wrong for two of those three phases, and two different links
 * for one event is exactly the confusion worth designing out.
 */
export function MachinePanel({
  tenantId,
  slug,
  machine,
  guestUrl,
}: {
  tenantId: string
  slug: string
  machine: MachineView | null
  /** The live link, already pointed at wherever the event currently is. */
  guestUrl: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [serverType, setServerType] = useState('ccx23')

  const busy =
    machine?.status === 'requested' ||
    machine?.status === 'provisioning' ||
    machine?.status === 'retiring'

  /** A failed attempt that left a real server behind - so this is a resume. */
  const retrying = machine?.status === 'failed' && machine.serverId !== null

  /**
   * Poll while something is happening, and only then.
   *
   * Provisioning takes about ten minutes and the whole value of this panel is
   * watching it - but an event that is not moving must not have the console
   * refetching forever in a background tab.
   */
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => router.refresh(), 5_000)
    return () => clearInterval(timer)
  }, [busy, router])

  function ask(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error ?? 'That did not work')
      router.refresh()
    })
  }

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface-raised/40 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Where it runs</h3>
        <StatusBadge machine={machine} />
      </div>

      <ErrorNote>{error}</ErrorNote>

      {/* ------------------------------------------------------------------ */}
      {/* The link                                                           */}
      {/* ------------------------------------------------------------------ */}
      {guestUrl ? (
        <div className="space-y-1">
          <p className="text-xs text-ink-muted">
            The link for the calendar invite. It points at{' '}
            {machine?.status === 'ready' ? 'this event’s own box' : 'the main app'}, and
            changes on its own if the event moves.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={guestUrl}
              onFocus={(input) => input.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(guestUrl)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
              className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs transition hover:border-accent"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">
          No guest link yet. One is minted with the event, and again on its box.
        </p>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* The machine                                                        */}
      {/* ------------------------------------------------------------------ */}
      {machine?.status === 'ready' && (
        <dl className="space-y-1 text-xs">
          <Row label="Host" value={`${slug}.kxb.team`} />
          <Row label="Address" value={machine.ip ?? '—'} />
          <Row label="Hardware" value={machine.serverType} />
        </dl>
      )}

      {machine?.stalled && (
        <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Asked for a few minutes ago and nothing has picked it up. That usually
          means no agent is running — check{' '}
          <code className="font-mono">./scripts/event-agent-install.sh --status</code>, or
          run <code className="font-mono">bun run event:agent</code> yourself.
        </p>
      )}

      {machine?.error && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-xs text-red-200">
          {machine.error}
        </pre>
      )}

      {/*
        The expensive failure, said out loud.

        Provisioning creates the server early and can break at any step after
        it, so "failed" usually means there is a real machine out there running
        and billing. Saying only "failed" invites the reasonable conclusion that
        nothing exists and nothing needs doing - which is how a box ran for an
        afternoon with nobody aware of it.
      */}
      {machine?.status === 'failed' && machine.serverId && (
        <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          The server was created before this failed, so it exists and is being billed
          {machine.ip ? ` (${machine.ip})` : ''}. Retrying carries on with that same box
          rather than making a second one — or destroy it below.
        </p>
      )}

      {/*
        The progress log. Only while it matters - once a box is up, the story of
        how it got there is noise on a page somebody opens to find a link.
      */}
      {busy && machine.log && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 font-mono text-xs text-ink-muted">
          {machine.log.trim()}
        </pre>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {(!machine || machine.status === 'gone' || machine.status === 'failed') && (
          <>
            {/*
              Retrying keeps the hardware it already has. Offering the picker
              again would imply the choice is still open, and it is not: the
              server exists, and `event-up` adopts it rather than building a
              second one to the new spec.
            */}
            {retrying ? (
              <span className="rounded-lg border border-line px-3 py-2 font-mono text-xs text-ink-muted">
                {machine.serverType}
              </span>
            ) : (
              <select
                value={serverType}
                onChange={(input) => setServerType(input.target.value)}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-xs"
              >
                <option value="ccx23">ccx23 — 4 dedicated, 16 GB (~€0.16/h)</option>
                <option value="ccx33">ccx33 — 8 dedicated, 32 GB</option>
                <option value="cpx32">cpx32 — 4 shared, 8 GB (~€0.07/h)</option>
              </select>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                ask(() => requestMachine(tenantId, retrying ? machine.serverType : serverType))
              }
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {machine?.status === 'failed' ? 'Retry' : 'Give it its own box'}
            </button>
            <span className="text-xs text-ink-muted">
              {machine?.status === 'failed'
                ? 'Picks up where it stopped. The error above is cleared when it starts.'
                : 'Takes about ten minutes. Billed by the hour until you retire it.'}
            </span>
          </>
        )}

        {(machine?.status === 'ready' || retrying) && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (
                !confirm(
                  'Bring the event home and destroy the box?\n\nEverything built on it is imported first, and the box is only deleted once every event is verified present here.',
                )
              ) {
                return
              }
              ask(() => retireMachine(tenantId))
            }}
            className="rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
          >
            Bring it home and destroy the box
          </button>
        )}
      </div>
    </section>
  )
}

function StatusBadge({ machine }: { machine: MachineView | null }) {
  if (!machine || machine.status === 'gone') {
    return (
      <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">
        on the main app
      </span>
    )
  }

  const styles: Record<string, string> = {
    requested: 'border-sky-400/40 text-sky-300',
    provisioning: 'border-sky-400/40 text-sky-300',
    ready: 'border-emerald-400/40 text-emerald-300',
    retiring: 'border-amber-400/40 text-amber-300',
    failed: 'border-red-400/40 text-red-300',
  }

  const labels: Record<string, string> = {
    requested: 'waiting for an agent',
    provisioning: 'building…',
    ready: 'on its own box',
    retiring: 'coming home…',
    failed: 'failed',
  }

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${styles[machine.status]}`}>
      {labels[machine.status]}
    </span>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-mono">{value}</dd>
    </div>
  )
}
