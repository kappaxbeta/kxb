'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AVATARS, avatarShotUrl } from '@/domain/lounge/avatars'
import { skinThumbUrl } from '@/domain/skins/application'
import { chatActions, useChatStatus, type ChatStatus } from '@/app/world/_stores/chat-store'
import { EmoteGrid } from '@/app/world/_hud/emote-grid'
import { MAX_MESSAGE_LENGTH } from '@/domain/chat/events'
import { useLocale } from '@/app/i18n/locale-context'
import { worldDict } from '@/app/i18n/world'
import {
  EMOTE_SHEET,
  EMOTE_SHEET_HEIGHT,
  EMOTE_SHEET_WIDTH,
  EMOTE_TILE,
  type EmoteId,
} from '@/domain/world/emotes'

/**
 * The HUD's emote button, and the panel it opens over a scene.
 *
 * The tiles themselves are `EmoteGrid`, shared with the pinboard. What is left
 * here is everything that is true of a *scene* and not of a page: the floating
 * placement, opening upward out of the corner, and the document-level listeners
 * below.
 *
 * Open/closed is owned by the caller rather than held here, because every scene
 * has a key for it *and* a button, and two sources of truth over one boolean is
 * how you end up with a panel that needs pressing twice after you clicked away.
 */
export function EmotePicker({
  open,
  onOpenChange,
  onPick,
  mirror,
  peep,
  /** Nudged aside where a HUD panel already owns the corner. */
  className = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (id: EmoteId) => void
  /**
   * Looking at yourself, for the scenes that offer it.
   *
   * Optional, because only the lounge has a mirror - the café and the house
   * would render a switch for a camera they do not have.
   *
   * Here rather than as another floating button, and that is the point of moving
   * it: on a phone the emote panel is already where "do a thing with my body"
   * lives, and the reason anybody turns the mirror on is to watch the emote they
   * are about to throw. The two belong within a thumb's travel of each other,
   * not in separate corners of the screen.
   */
  mirror?: {
    on: boolean
    onToggle: (next: boolean) => void
  }
  /**
   * Changing which animal you are, without leaving the room.
   *
   * Beside the mirror for the reason the mirror is here at all: the sequence
   * is "look at yourself, decide you would rather be a fox, look again", and
   * sending somebody to Settings to do the middle step breaks it. Optional,
   * because a scene that does not know who you are cannot offer it.
   *
   * Stills rather than a live canvas, exactly as the rail does: this opens
   * over a running world, and a second WebGL context beside the one drawing
   * the room is the one thing the picker must not be.
   */
  peep?: {
    current: string
    onChange: (avatar: string) => void
    /**
     * The skins this account owns, offered in the same grid as the animals.
     *
     * One wardrobe rather than two, because the question somebody opens this
     * to answer is "what am I standing in", and a peep and a skin are two
     * answers to it rather than two questions. Empty or absent for anybody who
     * owns none, which is most people and every guest - and then this is
     * exactly the animal picker it has always been.
     */
    skins?: { id: string; name: string }[]
    /** The skin worn here, or null when the animal is. */
    wearing?: string | null
    /** Wear a skin in this world, or `null` to go back to the animal. */
    onWearSkin?: (id: string | null) => void
  }
  className?: string
}) {
  const t = worldDict(useLocale()).dock
  const panel = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<'emotes' | 'chat'>('emotes')
  /** Not a tab: the faces stay one press away while you are choosing. */
  const [peeping, setPeeping] = useState(false)

  /**
   * Null wherever there is no chat to fire text into - most scenes, and every
   * scene in a space that has not turned chat on. The tab strip below is not
   * rendered at all in that case, which is what keeps this the plain emote
   * button it always was anywhere chat does not apply.
   */
  const chat = useChatStatus()

  /**
   * Escape closes, and so does clicking anywhere else.
   *
   * Registered on the document rather than as an overlay behind the panel: the
   * thing behind it is a 3D scene that wants its own pointer events, and a
   * full-screen click-catcher would swallow the first click back into the game
   * every single time.
   */
  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Stopped here so the scene's own Escape handler does not also fire and
        // drop the player out of build mode on the way past.
        event.stopPropagation()
        onOpenChange(false)
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (panel.current?.contains(event.target as Node)) return
      onOpenChange(false)
    }

    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, onOpenChange])

  return (
    <div className={`pointer-events-auto absolute z-30 ${className}`}>
      {open && (
        <div
          ref={panel}
          className="absolute bottom-full right-0 mb-2 w-[min(92vw,29rem)] overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-2xl backdrop-blur"
        >
          {/*
            Only worth a tab strip once there is a second tab. Chat rides along
            on the button that was already the fastest thing to reach on a
            phone, rather than adding a second floating button beside it - see
            `chat-store` for how this component learns a dock exists at all
            without importing the channel that owns it.
          */}
          {chat && (
            <div role="tablist" className="flex gap-1 border-b border-white/10 p-1.5">
              <TabButton active={tab === 'emotes'} onClick={() => setTab('emotes')}>
                {t.emotes}
              </TabButton>
              <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>
                {t.chat}
              </TabButton>
            </div>
          )}

          <div className="max-h-[46vh] overflow-y-auto overscroll-contain p-2">
            {chat && tab === 'chat' ? (
              <ChatFire
                status={chat}
                onSent={() => onOpenChange(false)}
              />
            ) : (
              <>
                {/*
                  The mirror, above the faces.

                  Deliberately does *not* close the panel, unlike picking a face:
                  the sequence this exists for is "turn round, then pull a
                  face", and a switch that shut the grid would make you reopen it
                  to do the second half.
                */}
                {(mirror || peep) && (
                  <div className="mb-2 flex gap-2">
                    {mirror && (
                      <button
                        type="button"
                        onClick={() => mirror.onToggle(!mirror.on)}
                        aria-pressed={mirror.on}
                        className={`flex flex-1 items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                          mirror.on
                            ? 'border-amber-300/40 bg-amber-400/25 text-amber-100'
                            : 'border-white/10 text-white/70 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span>{t.mirror}</span>
                        <span className="text-[10px] text-white/40">
                          {mirror.on ? t.mirrorOn : 'R'}
                        </span>
                      </button>
                    )}

                    {peep && (
                      <button
                        type="button"
                        onClick={() => setPeeping((was) => !was)}
                        aria-pressed={peeping}
                        aria-label={t.peep}
                        title={t.peep}
                        className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                          peeping
                            ? 'border-amber-300/40 bg-amber-400/25 text-amber-100'
                            : 'border-white/10 text-white/70 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {/* The animal you are now, which is also the label: a
                            word for it would be a word in three languages
                            saying what the picture already says. */}
                        <Image
                          src={avatarShotUrl(peep.current)}
                          alt=""
                          width={128}
                          height={128}
                          className="h-5 w-5 object-contain"
                        />
                        <span aria-hidden>{peeping ? '×' : '⌄'}</span>
                      </button>
                    )}
                  </div>
                )}

                {peep && peeping ? (
                  <>
                    {/*
                      The skins first, and only for somebody who owns any.

                      Above the animals rather than below because this is the
                      half that changes: the twenty-four have been in the same
                      place since the lounge shipped, and a row that appears
                      under a grid people already scroll past is a row nobody
                      finds. Selecting one is "wear this here"; selecting an
                      animal takes it off again, which is why the animal
                      buttons clear the skin as well as setting the peep - two
                      controls that can both be on would let you be two bodies.
                    */}
                    {peep.skins && peep.skins.length > 0 && (
                      <div className="mb-2">
                        <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-white/40">
                          {t.skin}
                        </p>
                        <div
                          role="radiogroup"
                          aria-label={t.skin}
                          className="grid grid-cols-6 gap-1"
                        >
                          {peep.skins.map((skin) => {
                            const current = peep.wearing === skin.id
                            return (
                              <button
                                key={skin.id}
                                type="button"
                                role="radio"
                                aria-checked={current}
                                aria-label={skin.name}
                                title={skin.name}
                                onClick={() => {
                                  peep.onWearSkin?.(current ? null : skin.id)
                                  setPeeping(false)
                                }}
                                className={`rounded-lg border p-1 transition-colors ${
                                  current
                                    ? 'border-amber-300/40 bg-amber-400/25'
                                    : 'border-white/10 hover:bg-white/5'
                                }`}
                              >
                                <Image
                                  src={skinThumbUrl(skin.id)}
                                  alt=""
                                  width={192}
                                  height={192}
                                  loading={current ? 'eager' : 'lazy'}
                                  className="h-8 w-8 object-contain"
                                />
                              </button>
                            )
                          })}
                        </div>
                        <p className="mb-1 mt-2 text-[10px] uppercase tracking-[0.14em] text-white/40">
                          {t.peepLabel}
                        </p>
                      </div>
                    )}

                    <div
                      role="radiogroup"
                      aria-label={t.peep}
                      className="grid grid-cols-6 gap-1"
                    >
                      {AVATARS.map((animal) => {
                        // Worn only when no skin is over the top of it.
                        const current = animal === peep.current && !peep.wearing
                        return (
                          <button
                            key={animal}
                            type="button"
                            role="radio"
                            aria-checked={current}
                            aria-label={animal}
                            title={animal}
                            onClick={() => {
                              peep.onChange(animal)
                              // Picking an animal is also taking the skin off,
                              // or the choice would land on a body nobody can
                              // see underneath the one they are wearing.
                              if (peep.wearing) peep.onWearSkin?.(null)
                              // Straight back to the faces: you came here to
                              // change, and staying in the grid after the change
                              // has landed is one press somebody has to undo.
                              setPeeping(false)
                            }}
                            className={`rounded-lg border p-1 transition-colors ${
                              current
                                ? 'border-amber-300/40 bg-amber-400/25'
                                : 'border-white/10 hover:bg-white/5'
                            }`}
                          >
                            <Image
                              src={avatarShotUrl(animal)}
                              alt=""
                              width={128}
                              height={128}
                              loading={current ? 'eager' : 'lazy'}
                              className="h-8 w-8 object-contain"
                            />
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <EmoteGrid
                    onPick={(id) => {
                      onPick(id)
                      onOpenChange(false)
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-label={open ? t.closeEmotes : t.openEmotes}
        title={t.emotesTitle}
        className={`flex h-11 w-11 items-center justify-center rounded-full border border-white/10 shadow-lg backdrop-blur transition-colors ${
          open ? 'bg-amber-400/30' : 'bg-black/55 hover:bg-black/70'
        }`}
      >
        <span
          aria-hidden
          className="block h-8 w-8"
          style={{
            backgroundImage: `url(${EMOTE_SHEET})`,
            // The first face on the sheet, scaled from 48px into the 32px
            // button. `background-size` carries the same ratio as the position.
            backgroundPosition: '0 0',
            backgroundSize: `${(EMOTE_SHEET_WIDTH * 32) / EMOTE_TILE}px ${
              (EMOTE_SHEET_HEIGHT * 32) / EMOTE_TILE
            }px`,
            imageRendering: 'pixelated',
          }}
        />
      </button>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-amber-400/25 text-amber-100' : 'text-white/50 hover:bg-white/5 hover:text-white/80'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * The composer, and nothing else - no scrollback here.
 *
 * A second one would only repeat what the sidebar already shows, and reporting
 * a message needs to see it sent and dated first, which this deliberately
 * cannot do. This exists for the one thing scrollback cannot give you on a
 * phone: reaching a text box without leaving the emote button you already have
 * a thumb on.
 */
function ChatFire({
  status,
  onSent,
}: {
  status: ChatStatus
  onSent: () => void
}) {
  const t = worldDict(useLocale()).dock
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!status.blockedReason) input.current?.focus()
  }, [status.blockedReason])

  if (status.blockedReason) {
    return (
      <p className="px-2 py-6 text-center text-xs leading-relaxed text-white/40">
        {status.blockedReason}
      </p>
    )
  }

  function send() {
    const body = draft.trim()
    if (!body) return
    chatActions()?.say(body)
    setDraft('')
    onSent()
  }

  return (
    <div className="flex items-end gap-2 p-1">
      <textarea
        ref={input}
        value={draft}
        onChange={(event) => setDraft(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
        onKeyDown={(event) => {
          // Belt and braces alongside `isTyping` in the scene's own listener -
          // see the note on the sidebar's composer, which this one is a smaller
          // copy of.
          event.stopPropagation()
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            send()
          }
        }}
        rows={2}
        placeholder={t.say}
        aria-label={t.message}
        className="max-h-24 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
      />
      <button
        type="button"
        onClick={send}
        disabled={draft.trim().length === 0}
        className="h-10 shrink-0 rounded-xl bg-amber-400/25 px-4 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-400/35 disabled:opacity-30"
      >
        {t.send}
      </button>
    </div>
  )
}
