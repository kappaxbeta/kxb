'use client'

import { MusicButton } from '@/app/components/audio/music-button'
import { useInScene } from '@/app/world/_stores/here-store'

/**
 * The music button, in the corner of every page that is not a world.
 *
 * The button itself has always been global, and its own note says why: the
 * moment somebody wants the music off is the moment they are already doing
 * something else, and anything that makes them navigate to a settings page and
 * back is long enough that they close the tab instead.
 *
 * A world is the one place that argument comes apart. The corner is over a
 * canvas there - it sits on top of the thing being looked at, beside the HUD's
 * own controls, and it is the only chrome in the viewport that belongs to the
 * page rather than to the room. So in a world it moves into the rail, where the
 * radio and the party lights already are, and this is what takes it out of the
 * corner while that is true.
 *
 * The same button either way, so there is one state and one aria-pressed. What
 * changes is which corner of the screen it is in.
 */
export function CornerMusic() {
  return useInScene() ? null : <MusicButton />
}
