'use client'

import { useEffect, useState } from 'react'
import { useStuck } from '@/lib/stuck-store'
import { useLocale } from '@/app/i18n/locale-context'
import { railDict } from '@/app/i18n/rail'

/**
 * The ways out of being stuck, in the rail's Room tab.
 *
 * The worlds in this product are built by the people standing in them, which
 * makes being stuck an ordinary Tuesday rather than an exotic failure: somebody
 * walls you in while you are talking, you drop into a pit with sides too high to
 * jump, a ball is kicked onto a roof nobody can reach. Until now the only way
 * out of any of it was reloading the page, which is a long way to go to walk
 * again - and which loses the conversation in the rail on the way.
 *
 * Both buttons in one block, because they are one question asked twice: what is
 * stuck, me or the ball. Together in the rail rather than over the world, and
 * that is the useful part - the mouse is captured while you are playing, so
 * *every* in-world button needs you to let go of the pointer first. Being stuck
 * is the moment you have already done that, and the rail is what is under the
 * cursor when you do.
 *
 * Renders nothing when there is no world on screen, so the cost of it sitting
 * permanently in the tab is a null check - the same bargain <SceneDebug> makes
 * two blocks below it.
 */
export function UnstickButton() {
  const t = railDict(useLocale()).stuck
  const stuck = useStuck()
  /**
   * Which button has just been pressed, so it says something back.
   *
   * A flag cleared by a timer rather than a timestamp compared during render:
   * `Date.now()` in a render body is impure, which the house lint rule refuses
   * outright - and rightly, since the value it returns is one React is free to
   * throw away and ask for again.
   */
  const [said, setSaid] = useState<'me' | 'ball' | null>(null)

  useEffect(() => {
    if (!said) return
    const id = setTimeout(() => setSaid(null), 2500)
    return () => clearTimeout(id)
  }, [said])

  if (!stuck) return null

  return (
    <div className="space-y-1.5 border-t border-line/60 pt-3">
      <button
        type="button"
        onClick={() => {
          stuck.unstick()
          setSaid('me')
        }}
        className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px] text-ink-muted transition hover:border-accent/60 hover:text-ink"
      >
        {/*
          Named for the situation rather than for the mechanism. "Teleport to
          spawn" is what it does; "stuck" is the word somebody has in their head
          at the moment they go looking for it.
        */}
        {said === 'me' ? t.done : t.ask}
      </button>

      {/*
        And the ball, directly under it, for the seconds it is worth offering.

        Only while the ball has actually stopped going anywhere - see
        `watchStuck`. A permanent "restart from the centre" would be a button to
        press when you are losing rather than when the game is stuck, which is
        the same line the unstick above holds by not restoring health.
      */}
      {stuck.ball && (
        <button
          type="button"
          onClick={() => {
            stuck.ball?.()
            setSaid('ball')
          }}
          className="w-full rounded-lg border border-amber-300/40 px-2 py-1.5 text-[11px] text-amber-200/90 transition hover:border-amber-300/70 hover:text-amber-100"
        >
          {said === 'ball' ? t.ballDone : t.ballAsk}
        </button>
      )}

      <p className="px-1 text-[10px] leading-snug text-ink-muted/70">
        {stuck.ball ? t.noteWithBall : t.note}
      </p>
    </div>
  )
}
