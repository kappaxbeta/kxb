import Image from 'next/image'
import type { LandingDict } from '@/app/i18n/landing'
import { emoteTileStyle } from '@/domain/world/emotes'

/**
 * The world band: a dotted map with a few of the cast pinned on it.
 *
 * Answers the question a first-time visitor actually has about a product whose
 * whole pitch is a room - whether the people they want to play with have to be
 * in the same building. The band this replaced was four numbered steps about
 * writes going through an append-only log, which is true, interesting, and the
 * answer to a question nobody asked on the way in.
 *
 * ---------------------------------------------------------------------------
 * What this deliberately does not claim
 * ---------------------------------------------------------------------------
 * A world map with faces on it is one word away from promising to show you who
 * is near you, and there is no geolocation here, no friend graph and nothing to
 * track. So the map is scenery for a claim the product does back: a space is a
 * link, and the people in it can be anywhere. The copy says that and stops.
 *
 * No `'use client'`. Everything here is static markup over a constant, so it
 * renders on the server and costs the visitor no JavaScript at all - which is
 * the same reason the marketing renders are baked images rather than a live
 * three.js scene.
 */

/**
 * Who is on the map.
 *
 * Each pin is a real render off the same GLB the lounge loads, placed on a
 * landmass rather than in an ocean, because a pin in the middle of the Pacific
 * is the first thing anybody notices. Positions are percentages of the map, so
 * a pin stays on its continent at every width.
 *
 * Two carry an emote tile off the actual sheet. Emotes are the only thing
 * anybody says here - there is no text chat to put in a speech bubble, and a
 * marketing page that invents a nicer one is lying.
 */
const WORLD_PINS = [
  { avatar: 'fox', angle: 'front', x: 17, y: 27, emote: 2 },
  { avatar: 'panda', angle: 'three', x: 46, y: 20, emote: null },
  { avatar: 'penguin', angle: 'front', x: 21, y: 71, emote: 27 },
  { avatar: 'koala', angle: 'three', x: 86, y: 74, emote: null },
]

export function World({ dict }: { dict: LandingDict }) {
  return (
    <section
      id="world"
      className="box rise col-span-6 overflow-hidden"
      style={{ '--box-hue': 250 } as React.CSSProperties}
    >
      <header className="text-center">
        <p className="box-tag justify-center">{dict.world.tag}</p>
        <h2 className="font-pixel mx-auto mt-4 max-w-3xl text-2xl leading-[1.25] uppercase sm:text-3xl">
          {dict.world.title}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">
          {dict.world.body}
        </p>
      </header>

      <div className="world-stage">
        {/* Decorative, hence the empty alt and `aria-hidden`: the heading above
            has already said what this is, and "a dotted map of the world" adds
            nothing to a screen reader but noise. */}
        <Image
          src="/enter/map.webp"
          alt=""
          aria-hidden
          width={1600}
          height={719}
          className="world-shot"
          sizes="(max-width: 900px) 100vw, 60rem"
        />
        {WORLD_PINS.map((pin, i) => (
          <span
            key={pin.avatar}
            className="world-pin"
            style={{ '--x': `${pin.x}%`, '--y': `${pin.y}%`, '--i': i } as React.CSSProperties}
          >
            {/* The ring is the whole claim: it says this one is here now, which
                is the difference between a roster and a room. */}
            <span className="world-ping" aria-hidden />
            <Image
              src={`/xo/shots/${pin.avatar}-${pin.angle}.webp`}
              alt=""
              width={256}
              height={256}
              className="world-face"
            />
            {pin.emote !== null && (
              <span className="world-emote" aria-hidden style={emoteTileStyle(pin.emote, 26)} />
            )}
          </span>
        ))}
      </div>
    </section>
  )
}
