'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createBattle,
  listSummonableXps,
  type SummonableXp,
} from '@/domain/battle/actions'
import { funnyMatchName } from '@/domain/battle/match-names'
import { useHere, hereNow } from '@/app/world/_stores/here-store'
import { onSummon } from '@/app/t/[slug]/summon-store'
import { createClient } from '@/lib/supabase/client'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'

/**
 * `/battle`, from the words to the arena.
 *
 * Typing `/battle` into the chat rings `summon-store`; this dock draws the
 * menu: the people standing in the room with you, off `here-store`, and the
 * levels a match can be fought on, off the same shelf the wizard reads. Summon
 * creates the match with `createBattle` - the wizard's own action, defaults and
 * all - broadcasts a summons to the people chosen, and walks you into the
 * arena. Everybody named gets the interception this file's other half draws:
 * confirm and they are redirected to the same door, deny and it goes away.
 *
 * ---------------------------------------------------------------------------
 * Its own topic, its own dock
 * ---------------------------------------------------------------------------
 * The summons rides `summon:<tenantId>` - see the 20270108000000 migration for
 * why neither the chat's topic nor the lounge's can carry it. Subscribed here,
 * once, for the whole session, exactly as `<ChatDock>` holds the conversation:
 * an interception that only worked while the rail happened to be open would be
 * a doorbell wired to a light switch.
 *
 * The payload is deliberately thin - who, whither, and for whom - and the
 * summoner's *name* is not in it. The receiver resolves it from their own
 * roster, because everybody being summoned was picked from a room the summoner
 * is standing in; a name sent over the wire would be a second answer to a
 * question the roster already settles, wrong exactly when spoofed.
 *
 * A forged summons is an invitation to a door that will not open: the battle
 * page and `joinBattle` re-check membership at the boundary, so nothing here
 * trusts the packet beyond drawing a sentence and an id to navigate to.
 */

/** The summons on the wire. Compact keys, like every packet in this app. */
interface SummonCall {
  /** The battle to walk into. */
  b: string
  /** What the match is called, for the interception's sentence. */
  m: string
  /** Who is summoning. */
  u: string
  /** Who is summoned. Everybody else on the topic ignores it. */
  to: string[]
}

/** What the interception needs to draw itself. */
interface Invite {
  battleId: string
  matchName: string
  fromId: string
}

export function SummonDock({
  slug,
  tenantId,
  userId,
}: {
  slug: string
  tenantId: string
  userId: string
}) {
  const t = railDict(useLocale()).summon
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const channelRef = useRef<RealtimeChannel | null>(null)

  const [open, setOpen] = useState(false)
  const [invite, setInvite] = useState<Invite | null>(null)

  /** Who is ticked. Reset each time the menu opens - a summons is not a draft. */
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  /** The shelf, null while it is on its way. */
  const [xps, setXps] = useState<SummonableXp[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const here = useHere()

  /**
   * The wire, held for the whole session.
   *
   * No presence config and no `track()` - a listener, not a body in a room -
   * and `private: true` for the same reason every other topic here passes it:
   * without the flag anybody holding the anon key could sit on the topic.
   */
  useEffect(() => {
    const channel = supabase.channel(`summon:${tenantId}`, {
      config: { private: true },
    })
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'call' }, ({ payload }) => {
        const call = payload as SummonCall
        if (typeof call?.b !== 'string' || !call.b) return
        if (!Array.isArray(call.to)) return
        // Your own summons comes back on other people's screens, not yours -
        // and one not addressed to you is somebody else's doorbell.
        if (call.u === userId || !call.to.includes(userId)) return
        setInvite({
          battleId: call.b,
          matchName: typeof call.m === 'string' ? call.m : '',
          fromId: typeof call.u === 'string' ? call.u : '',
        })
      })
      .subscribe()

    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [supabase, tenantId, userId])

  /** The bell from the chat. Opens fresh and goes to the shelf for the list. */
  useEffect(
    () =>
      onSummon(() => {
        setOpen(true)
        setChosen(new Set())
        setPicked(null)
        setError(null)
        setBusy(false)
        setXps(null)
        void listSummonableXps(slug).then((result) => {
          if (result.ok) setXps(result.xps)
          else {
            setXps([])
            setError(result.error)
          }
        })
      }),
    [slug],
  )

  /**
   * Enter confirms the interception.
   *
   * The one keyboard path, and it exists for the pointer-locked case: a summons
   * lands while somebody is walking the lounge, where there is no cursor to
   * click Confirm with. Enter reaches the window even locked - and a chat
   * composer's own Enter never gets here, because the panel stops propagation
   * on every key it takes.
   */
  useEffect(() => {
    if (!invite) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      router.push(`/t/${slug}/battle/${invite.battleId}`)
      setInvite(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [invite, router, slug])

  function summon() {
    if (!picked || busy) return
    setBusy(true)
    setError(null)

    // The wizard's own defaults: an XP match is mode `ffa` by convention - the
    // level's rules block is the real mode - and the name is the generator's,
    // because a menu in the chat has no room to ask anybody to be funny.
    const name = funnyMatchName()
    void createBattle(
      slug,
      name,
      'ffa',
      undefined,
      undefined,
      undefined,
      picked,
    ).then((result) => {
      if (!result.ok) {
        setBusy(false)
        setError(result.error)
        return
      }

      const call: SummonCall = {
        b: result.battleId,
        m: name,
        u: userId,
        to: [...chosen],
      }
      channelRef.current?.send({ type: 'broadcast', event: 'call', payload: call })

      setOpen(false)
      // Straight into the room, exactly as the wizard walks its host: waiting
      // for the summoned is something you do inside the arena.
      router.push(`/t/${slug}/battle/${result.battleId}`)
    })
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl">
            <h2 className="font-pixel text-lg uppercase tracking-[0.08em] text-accent">
              {t.title}
            </h2>

            {/* Who. The room's roster, minus you - `here-store` never lists you. */}
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t.who}
            </p>
            {here.people.length === 0 ? (
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t.nobodyHere}</p>
            ) : (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {here.people.map((person) => {
                  const on = chosen.has(person.userId)
                  return (
                    <li key={person.userId}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setChosen((current) => {
                            const next = new Set(current)
                            if (next.has(person.userId)) next.delete(person.userId)
                            else next.add(person.userId)
                            return next
                          })
                        }
                        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm transition ${
                          on
                            ? 'border-accent/60 bg-accent/10 text-ink'
                            : 'border-line bg-surface-raised/40 text-ink-muted hover:text-ink'
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`grid size-4 shrink-0 place-items-center rounded border text-[10px] ${
                            on ? 'border-accent bg-accent text-surface' : 'border-line'
                          }`}
                        >
                          {on ? '✓' : ''}
                        </span>
                        {person.name}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {/* What. The same shelf the wizard reads, as names rather than cartridges. */}
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t.what}
            </p>
            {xps === null ? (
              <p className="mt-2 text-sm text-ink-muted">{t.loadingLevels}</p>
            ) : xps.length === 0 ? (
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t.noLevels}</p>
            ) : (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {xps.map((xp) => {
                  const on = picked === xp.ref
                  return (
                    <li key={xp.ref}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPicked(on ? null : xp.ref)}
                        className={`w-full rounded-lg border px-3 py-1.5 text-left transition ${
                          on
                            ? 'border-accent/60 bg-accent/10'
                            : 'border-line bg-surface-raised/40 hover:border-line/80'
                        }`}
                      >
                        <span className={`block text-sm ${on ? 'text-ink' : 'text-ink-muted'}`}>
                          {xp.name}
                        </span>
                        {xp.blurb && (
                          <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted/80">
                            {xp.blurb}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {error && (
              <p role="alert" className="mt-3 text-xs text-red-500">
                {error}
              </p>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-4 py-2 text-sm text-ink-muted transition hover:text-ink"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                disabled={!picked || busy}
                onClick={summon}
                className="summon-cta cta-pixel rounded-full px-6 py-2.5 text-sm transition disabled:cursor-not-allowed"
              >
                {busy ? t.summoning : t.summon}
              </button>
            </div>
          </div>
        </div>
      )}

      {invite && (
        <Interception
          invite={invite}
          onConfirm={() => {
            router.push(`/t/${slug}/battle/${invite.battleId}`)
            setInvite(null)
          }}
          onDeny={() => setInvite(null)}
        />
      )}
    </>
  )
}

/**
 * "You are summoned." Over everything, including a lounge mid-walk.
 *
 * The summoner's name comes off the local roster rather than the wire - see the
 * note at the top - and falls back to the dictionary's "somebody" for the one
 * gap: an invite that lands just as its sender walks out of the room.
 */
function Interception({
  invite,
  onConfirm,
  onDeny,
}: {
  invite: Invite
  onConfirm: () => void
  onDeny: () => void
}) {
  const t = railDict(useLocale()).summon

  const from =
    hereNow().people.find((person) => person.userId === invite.fromId)?.name ?? t.someone

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 text-center shadow-xl">
        <h2 className="font-pixel text-lg uppercase tracking-[0.08em] text-accent">
          {fill(t.inviteTitle, { name: from })}
        </h2>
        {invite.matchName && (
          <p className="mt-2 text-sm text-ink">{invite.matchName}</p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{t.inviteHint}</p>

        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onDeny}
            className="rounded-full border border-line px-5 py-2 text-sm text-ink-muted transition hover:text-ink"
          >
            {t.deny}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="summon-cta cta-pixel rounded-full px-6 py-2.5 text-sm transition"
          >
            {t.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}
