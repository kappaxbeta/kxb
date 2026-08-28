'use client'

import { arm, play } from '@/lib/audio/engine'
import type { Contact, Corner } from '@kxb/boxing'
import type { Ears } from '@kxb/boxing/ears'

/**
 * What a framed game sounds like.
 *
 * ---------------------------------------------------------------------------
 * Sound is the host's job, and this is the host
 * ---------------------------------------------------------------------------
 * `@kxb/boxing` declares `Ears` in `@kxb/boxing/ears` and implements none of it,
 * for the same reason `@kxb/xp` declares `XpNetwork` and implements none of
 * that: what a punch sounds like is a recording somebody licensed, a volume the
 * player set and a mute they can toggle, and every one of those belongs to the
 * app rather than to the game.
 *
 * The game ships its own *drawing* and not its own audio, which looks
 * inconsistent and is the line in the right place: the sprites are the game, and
 * the mixer is the product.
 *
 * Lives beside `./framed.tsx` because that is the only thing that mounts a
 * cartridge. It used to sit under a `/boxing` route of its own, which is gone -
 * see that file for why there is one way in rather than two.
 *
 * The practical payoff is that the app's existing sounds are reused rather than
 * a second audio system appearing. `src/lib/audio` already owns the player's
 * volume, the mute, the ducking against the radio, and a per-sound rate limit -
 * a game that reached for `new Audio()` would ignore all four.
 *
 * ---------------------------------------------------------------------------
 * Only ids the catalogue names, and that is a hard rule
 * ---------------------------------------------------------------------------
 * `public/audio` is pruned to exactly what `src/lib/audio/catalogue.ts` names.
 * A recording reached by path rather than by id is a recording the next asset
 * pass deletes, and the failure is a silent game rather than a broken build -
 * so everything below goes through `play(id)`, and where the perfect sound does
 * not exist the nearest catalogued one is used and the compromise is noted.
 *
 * ---------------------------------------------------------------------------
 * Which sound, and why the distinction is the point
 * ---------------------------------------------------------------------------
 * The catalogue's `hit` and `hurt` were written for this exact problem and its
 * comment says so: *"in a scrap you need to know whose blow it was without
 * looking at the bar."* A boxing match is that problem at four times the rate,
 * and it is most of what this file does - the mapping is by **who it happened
 * to** first and what it was second.
 */

/**
 * @param mine which corner is at this keyboard - the whole mapping turns on it.
 */
export function ears(mine: Corner): Ears {
  let woken = false

  const landed = (contact: Contact, onMe: boolean) => {
    switch (contact.kind) {
      case 'clean':
      case 'broken':
        /**
         * Loud both ways, and two different recordings.
         *
         * A clean punch is the most important thing that happens in this game,
         * so it is the loudest thing in it. A guard *breaking* gets the same
         * pair rather than the block's tap: what the player needs to hear is
         * that the guard did not hold, and a knock would say the opposite.
         */
        play(onMe ? 'hurt' : 'hit')
        return
      case 'blocked':
        // `build` is the block-placed sound - a dry light tap, which is what a
        // glove on a glove is. Same sound both ways: a block is the one contact
        // where neither fighter has really got anything.
        play('build')
        return
      case 'parried':
        // The best thing either player can do, and the only contact with a
        // voice of its own. Rising, because whoever hears it just won the
        // exchange - and `arrive` is the catalogue's rising blip.
        play('arrive')
        return
      case 'slipped':
      case 'miss':
        /**
         * Silent, and deliberately.
         *
         * A whiff wants a rush of air and the pack has not recorded one; the
         * nearest catalogued sound is the block's tap, which would say a punch
         * connected when it did not. Between a wrong sound and no sound in a
         * game where sound is how you tell what landed, no sound is the honest
         * one - and a miss is the commonest event in the game, so anything here
         * becomes a metronome.
         */
        return
    }
  }

  return {
    wake() {
      if (woken) return
      woken = true
      // Browsers refuse to start an audio context without a gesture, and the
      // engine's `arm` is the app's one place that knows it. From the first key
      // or touch rather than on mount, or the context is created suspended and
      // every sound afterwards is dropped without a word.
      arm()
    },

    hear(events) {
      for (const event of events) {
        switch (event.type) {
          case 'contact':
            landed(event.contact, event.on === mine)
            break
          case 'down':
            play('defeat')
            break
          case 'rose':
            play('arrive')
            break
          case 'bell':
            // The bell, which the pack has not got either. `demolish` is the
            // heaviest short knock in the catalogue and it reads as one.
            play('demolish')
            break
          case 'over':
            play(event.verdict.winner === mine ? 'win' : 'defeat')
            break
          case 'threw':
            // No sound for throwing one. A punch you can hear leaving is a
            // punch the *other* player can hear leaving, which would make the
            // startup window audible and hand a free read to whoever is not
            // looking at the screen.
            break
        }
      }
    },
  }
}
