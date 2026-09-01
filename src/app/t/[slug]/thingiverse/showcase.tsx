'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { fill } from '@/app/i18n/fill'
import type { WorkspaceDict } from '@/app/i18n/workspace'
import { AVATARS, AVATAR_CLIPS, type AvatarClip, avatarShotUrl } from '@/domain/lounge/avatars'
import { BodyStage } from '@/app/world/_canvas/body-stage'
import { chooseAvatar } from '@/domain/profile/avatar-actions'
import { skinThumbUrl } from '@/domain/skins/application'
import { wearSkinInLounge } from '@/domain/skins/actions'

/**
 * Who you are, at the top of the thingiverse.
 *
 * ---------------------------------------------------------------------------
 * Why a body is the first thing on a page about furniture
 * ---------------------------------------------------------------------------
 * Because everything under it is measured against one. A seat is where a body
 * stands, a clip is what a body does, and a held item hangs off a body's hand -
 * so the question "which body" is upstream of every door on this page, and it
 * is the one question the thingiverse never used to answer. It also happens to
 * be the thing people most want to look at, which is why it is large.
 *
 * ---------------------------------------------------------------------------
 * The arrows are the two bodies, not a carousel of one
 * ---------------------------------------------------------------------------
 * An account has two and keeps both: a peep - one of twenty-four animals - and
 * an XP body, which is a skin you own. `in_lounge` decides which one a world
 * draws, and it is a *mode* rather than a costume: changing it never touches
 * the other, which is the whole reason a Knight stopped turning up in the
 * lounge. See `readXpBody`.
 *
 * So left and right move between the two, and what they do is throw that
 * switch. Not a carousel through twenty-four animals, which is what an arrow
 * beside a picture usually means and would be wrong twice: it would make the
 * peep and the skin two entries in one list when they are two different kinds
 * of thing, and it would write a new animal to your profile on every press.
 * Choosing the animal is its own row underneath, where the twenty-four are.
 *
 * With no skin owned there is one body and the arrows say so by not being
 * there - an arrow that leads to an empty shop window is a worse invitation
 * than the shop's own link, which is right beside it.
 */
export function Showcase({
  slug,
  avatar,
  skin,
  inLounge,
  hasShop,
  t,
}: {
  slug: string
  /** The animal this account wears here. See `readAvatarHere`. */
  avatar: string
  /** The XP body it owns, or null for an account that has bought nothing. */
  skin: string | null
  /** Which of the two a world draws for this player. */
  inLounge: boolean
  hasShop: boolean
  t: WorkspaceDict['thingiverse']['you']
}) {
  const router = useRouter()
  const [wearing, setWearing] = useState(inLounge && skin !== null)
  const [chosen, setChosen] = useState(avatar)
  const [picking, setPicking] = useState(false)
  /**
   * What the body is doing while you look at it.
   *
   * Idle to begin with, because that is what a body looks like when nobody has
   * asked it for anything - and because a preview that starts dancing is a
   * preview that has answered a question nobody asked.
   */
  const [clip, setClip] = useState<AvatarClip>(AVATAR_CLIPS.idle)
  const [pending, start] = useTransition()

  const both = skin !== null
  const showingSkin = wearing && both

  /**
   * Throwing the switch, optimistically.
   *
   * The picture changes on the press and the write follows. It is a single
   * boolean on one row with no consequence anybody else can see, and the panel
   * is a *mirror* - a mirror that waits half a second before showing you the
   * other body is a mirror people press twice.
   *
   * The rollback is the whole reason this is not `useOptimistic`: this state
   * has to survive the action failing, and it has to be readable by the picker
   * below it in the same render.
   */
  const swap = (next: boolean) => {
    if (!both) return
    const was = wearing
    setWearing(next)
    start(async () => {
      const result = await wearSkinInLounge(next)
      if (!result.ok) {
        setWearing(was)
        return
      }
      router.refresh()
    })
  }

  const wear = (animal: string) => {
    const was = chosen
    setChosen(animal)
    start(async () => {
      const result = await chooseAvatar(animal)
      if (!result.ok) {
        setChosen(was)
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-line/60 bg-surface/60 p-4 sm:p-6">
      {/*
        Centred rather than hugging the left edge.

        On a 1500px screen this band is wider than anything that can honestly go
        in it - one body and three lines - so left-aligned it read as a picture
        with a paragraph and then two thirds of nothing. Centring makes the pair
        the composition instead of the start of one, and `max-w-3xl` is what
        stops the two halves drifting apart on a monitor.
      */}
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
        {/*
          The stage.

          A canvas now, with the still underneath it - which is a change of mind
          about the *argument* rather than about the cost. The old note here was
          right that a WebGL context on a page whose three doors all lead to
          other contexts is a context paid for twice, and wrong about what is
          being shown: a peep is a walk, a run and a dance, and a still is the
          one frame that shows none of them. Somebody choosing a body is
          choosing how it moves.

          The picture is still what arrives first and what stays if the canvas
          never comes - see `BodyStage`, which draws it as its own floor rather
          than as a loading state.
        */}
        <div className="flex items-center gap-2">
          <Arrow
            side="left"
            label={t.otherBody}
            shown={both}
            onClick={() => swap(!wearing)}
          />

          <div className="relative size-44 shrink-0 sm:size-56">
            <BodyStage
              skin={showingSkin ? skin : null}
              avatar={chosen}
              clip={clip}
              fallback={
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={showingSkin ? skinThumbUrl(skin) : avatarShotUrl(chosen, 'three')}
                    alt=""
                    className="size-full rounded-2xl bg-surface-raised object-contain"
                  />
                </>
              }
            />
          </div>

          <Arrow
            side="right"
            label={t.otherBody}
            shown={both}
            onClick={() => swap(!wearing)}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-2 text-center sm:max-w-[34ch] sm:text-left">
          <p className="font-pixel text-xl uppercase leading-none text-ink">
            {showingSkin ? (skin?.split('/').pop() ?? '') : chosen}
          </p>
          <p className="text-xs leading-relaxed text-ink-muted">
            {showingSkin ? t.xpBody : both ? t.peepBody : t.onlyBody}
          </p>

          {/*
            What it can do, as four words you can press.

            The lounge's four rather than the rig's hundred and thirty-nine:
            these are the clips *both* bodies have, and `SkinModel` translates
            each of them into the rig's own vocabulary - so the row says the
            same thing whichever body is standing there. A list that changed
            length when you pressed the arrow would read as two different
            controls.

            Not translated, and that is the same decision the emote names take:
            these are the clip's own names, they appear as `idle` and `walk` in
            a blueprint's fields, and a row that said "Gehen" here would leave
            somebody looking for that word in a dropdown that does not have it.
          */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
            {Object.values(AVATAR_CLIPS).map((one) => (
              <button
                key={one}
                type="button"
                onClick={() => setClip(one)}
                aria-pressed={clip === one}
                className={`rounded-full border px-2.5 py-1 font-mono text-[10px] transition ${
                  clip === one
                    ? 'border-accent/60 bg-accent/15 text-accent'
                    : 'border-line/60 text-ink-muted hover:bg-surface-raised'
                }`}
              >
                {one}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <button
              type="button"
              onClick={() => setPicking((was) => !was)}
              aria-expanded={picking}
              className="rounded-lg border border-line/60 px-3 py-1.5 text-xs text-ink transition hover:bg-surface-raised"
            >
              {t.changePeep}
            </button>
            {hasShop && (
              /*
                The shop, beside the picker rather than instead of it. They are
                two different acts - one dresses you out of what you have, the
                other is where more comes from - and a page that offered only
                the second would be a wardrobe that sells but does not open.
              */
              <Link
                href={`/t/${slug}/skins`}
                className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-ink transition hover:border-accent/70"
              >
                {t.shop}
              </Link>
            )}
            {pending && <span className="text-[11px] text-ink-muted">{t.saving}</span>}
          </div>
        </div>
      </div>

      {/*
        The twenty-four, folded away.

        Open on demand rather than always, because this is a page about things
        rather than about animals: the picture above answers "who am I" for
        everybody, and only the person who wants to be somebody else needs the
        grid. Twenty-four tiles permanently above the doors would make the
        wardrobe the subject of the thingiverse.
      */}
      {picking && (
        <div className="mt-4 border-t border-line/50 pt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            {fill(t.pickPeep, { n: String(AVATARS.length) })}
          </p>
          <ul className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-12">
            {AVATARS.map((animal) => (
              <li key={animal}>
                <button
                  type="button"
                  onClick={() => wear(animal)}
                  title={animal}
                  aria-pressed={chosen === animal}
                  className={`w-full rounded-lg border p-0.5 transition ${
                    chosen === animal
                      ? 'border-accent bg-accent/20'
                      : 'border-line/50 hover:border-accent/50 hover:bg-surface-raised'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarShotUrl(animal)}
                    alt={animal}
                    loading="lazy"
                    className="aspect-square w-full rounded bg-surface-raised object-contain"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/**
 * One of the two arrows.
 *
 * Drawn as an SVG rather than as `‹` or an arrow character, because a glyph
 * standing in for a control inherits the text face's weight and optical centre
 * and lands a pixel or two off in every browser. It is also the only icon on
 * this surface, so there is nothing for it to be inconsistent with except
 * itself.
 *
 * `shown` rather than `disabled`: with one body there is nowhere to go, and a
 * greyed arrow is a promise of a second body this account does not have. The
 * space it leaves is held, so the picture does not jump sideways the moment
 * somebody buys one.
 */
function Arrow({
  side,
  label,
  shown,
  onClick,
}: {
  side: 'left' | 'right'
  label: string
  shown: boolean
  onClick: () => void
}) {
  if (!shown) return <span aria-hidden className="size-9 shrink-0" />

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-9 shrink-0 place-items-center rounded-full border border-line/60 text-ink-muted transition hover:border-accent/60 hover:text-ink"
    >
      <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={side === 'left' ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'} />
      </svg>
    </button>
  )
}
