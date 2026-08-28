import Image from 'next/image'
import type { LandingDict } from '@/app/i18n/landing'
import { type EmoteId, emoteTileStyle } from '@/domain/world/emotes'
import { PALETTE } from '@/domain/lounge/palette'

/**
 * The two holograms flanking the stage.
 *
 * They are angled panes of glass, not cards: the hero is a room, and a flat
 * rectangle pinned to the front of it reads as UI laid over a picture rather
 * than as something standing in the scene.
 *
 * Both show real things. The left one holds animals off the same renders the
 * lounge loads, each with an emote out of the shared atlas — the lounge has no
 * text chat, so a speech bubble with words in it would be advertising a feature
 * that does not exist. The right one holds blocks out of the actual palette,
 * and counts it rather than quoting a number that could drift from it.
 *
 * Deliberately not the reference design's "LEVEL 1/0 · POWER 20" stat rows.
 * Nothing here levels anybody up, and a hero that invents a progression system
 * is writing a promise the product has to keep.
 */

/** Left: who is in the room, and what they are saying. */
const CAST: { avatar: string; emote: EmoteId; hue: number }[] = [
  { avatar: 'fox', emote: 24, hue: 40 }, // YES
  { avatar: 'panda', emote: 6, hue: 210 }, // heart eyes
  { avatar: 'penguin', emote: 48, hue: 245 }, // LOL
]

/** Right: a handful of the palette, shot off the same glTF the lounge loads. */
const BLOCKS = ['dirt_with_grass', 'lava', 'chest', 'stone_with_gold', 'melon', 'computer']

export function LoungePanel({ dict }: { dict: LandingDict }) {
  return (
    <aside className="holo-panel holo-panel-left" aria-hidden="true">
      <p className="holo-title">{dict.holo.loungeTitle}</p>
      <ul className="holo-list">
        {CAST.map((member) => (
          <li
            key={member.avatar}
            className="holo-row"
            style={{ '--hue': member.hue } as React.CSSProperties}
          >
            <span className="holo-avatar">
              <Image
                src={`/xo/shots/${member.avatar}-front.webp`}
                alt=""
                width={128}
                height={128}
              />
            </span>
            <span className="holo-emote" style={emoteTileStyle(member.emote, 22)} />
          </li>
        ))}
      </ul>
      <p className="holo-note">{dict.holo.loungeNote}</p>
    </aside>
  )
}

export function PalettePanel({ dict }: { dict: LandingDict }) {
  return (
    <aside className="holo-panel holo-panel-right" aria-hidden="true">
      <p className="holo-title">{dict.holo.paletteTitle}</p>
      <ul className="holo-grid">
        {BLOCKS.map((model) => (
          <li key={model} className="holo-tile">
            {/*
              `.holo-grid` is three columns inside an 11rem panel, so a tile is
              about 48px. Without `sizes` next/image serves the 2x entry of the
              `width` prop - a 256px render for a 48px hole, six times over, on
              a panel that is `display: none` below 1024px in the first place.
            */}
            <Image
              src={`/xo/blocks/${model}.png`}
              alt=""
              width={128}
              height={128}
              sizes="48px"
            />
          </li>
        ))}
      </ul>
      <p className="holo-note">
        <strong>{PALETTE.length}</strong> {dict.holo.paletteBlocks}
      </p>
    </aside>
  )
}
