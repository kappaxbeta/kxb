import {
  MUSIC_TRACK,
  SOUNDS,
  allSoundFiles,
  pickVariant,
  type SoundId,
} from '@/lib/audio/catalogue'
import {
  DEFAULT_PREFS,
  musicGain,
  sfxGain,
  type AudioPrefs,
} from '@/lib/audio/prefs'

/**
 * The mixer.
 *
 * A module of functions over module state rather than a class or a React
 * context, because there is exactly one set of speakers and every consumer -
 * the layout that starts the music, the lounge that mutes it, four scenes that
 * fire effects - is talking to the same one. A context would have made that
 * singleton implicit and given each provider boundary a chance to disagree.
 *
 * Two audio APIs, on purpose:
 *
 *   Effects go through Web Audio. They are short, they overlap (two people can
 *   be hit in the same frame), and they must start on the frame they are asked
 *   for. Decoded buffers fired at a GainNode do all three; a pool of <audio>
 *   elements does none of them well.
 *
 *   The music is an <audio> element. It is a 150KB file that plays for the
 *   whole session, and decoding it into a buffer would mean holding the entire
 *   uncompressed track in memory to gain nothing - an element streams it and
 *   loops it natively.
 *
 * Nothing here runs at import time. This module is pulled into a layout that
 * renders on the server, so every browser API is reached through a lazy getter
 * that returns null when there is no window.
 */

/* -------------------------------------------------------------------------
 * State
 * ------------------------------------------------------------------------- */

let context: AudioContext | null = null
/** Everything an effect plays through, so one value changes all of them. */
let bus: GainNode | null = null
let music: HTMLAudioElement | null = null

const buffers = new Map<string, AudioBuffer>()
/** In-flight decodes, so twenty punches in a row cause one fetch and not twenty. */
const decoding = new Map<string, Promise<AudioBuffer | null>>()

let prefs: AudioPrefs = DEFAULT_PREFS

/**
 * Whether anything has asked for music to be playing.
 *
 * Separate from `prefs.music`, and the distinction matters: one is "the player
 * wants music", the other is "there is a page mounted that has music". Muting
 * in the lounge must not be undone by navigating to settings, and leaving the
 * workspace must stop the track without touching the preference.
 */
let musicWanted = false

/**
 * Whether the space's radio has taken the music slot.
 *
 * A third input to `syncMusic`, and the only one that is not about this device.
 * When somebody has put a track on and this listener has agreed to hear it, the
 * built-in loop stops - two pieces of music at once is not a mix, it is a
 * mistake, and the ambient loop is the one nobody chose.
 *
 * Deliberately not `musicWanted = false`. The two mean different things and
 * collapsing them would lose the state that has to be restored: when the radio
 * stops, the loop should come back for anybody who had it, and nothing would
 * remember that they did. This suppresses; it does not un-want.
 *
 * The preference is untouched for the same reason. Somebody who muted the music
 * before the radio started must still find it muted afterwards.
 */
let radioHasTheFloor = false

/** Whether a user gesture has been seen. See `arm`. */
let unlocked = false

/**
 * Last play time per sound, for the `minGapMs` floor.
 *
 * Keyed by string rather than `SoundId` since an XP's sounds share this floor -
 * a name from `@kxb/xp/sounds` and one from `SOUNDS` cannot collide, because
 * the XP side keys on its URL.
 */
const lastPlayed = new Map<string, number>()

/* -------------------------------------------------------------------------
 * Lazy browser handles
 * ------------------------------------------------------------------------- */

type ContextCtor = typeof AudioContext

function contextCtor(): ContextCtor | null {
  if (typeof window === 'undefined') return null
  // Safari still ships the prefixed constructor on some versions in the support
  // window, and it is a one-line fallback rather than a polyfill.
  const w = window as unknown as {
    AudioContext?: ContextCtor
    webkitAudioContext?: ContextCtor
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

function ensureContext(): AudioContext | null {
  if (context) return context

  const Ctor = contextCtor()
  if (!Ctor) return null

  context = new Ctor()
  bus = context.createGain()
  bus.gain.value = sfxGain(prefs)
  bus.connect(context.destination)

  return context
}

function ensureMusic(): HTMLAudioElement | null {
  if (music) return music
  if (typeof Audio === 'undefined') return null

  music = new Audio(MUSIC_TRACK)
  music.loop = true
  music.preload = 'auto'
  music.volume = musicGain(prefs)

  return music
}

/* -------------------------------------------------------------------------
 * The autoplay gate
 * ------------------------------------------------------------------------- */

/**
 * Wait for the first gesture, then let sound out.
 *
 * Browsers will not start audio until the user has interacted with the page,
 * and there is no way to ask whether they will - `play()` simply rejects, and
 * an AudioContext created too early sits suspended and plays silence without
 * reporting an error. So rather than guess, everything is armed here and the
 * first click, key or touch anywhere in the document opens the gate.
 *
 * `once` on each listener and a shared flag, so the three of them cost nothing
 * after the first one fires. Capture phase, because scenes stop propagation on
 * their own canvases - the lounge takes the entry click for pointer lock, and
 * that click is exactly the one we want to be let in by.
 */
export function arm(): void {
  if (typeof document === 'undefined' || unlocked) return

  const open = () => {
    if (unlocked) return
    unlocked = true

    // A context created before the gesture is suspended and must be resumed
    // from inside one; a context created here is already running.
    void ensureContext()?.resume().catch(() => {})
    syncMusic()
    void warm()
  }

  for (const event of ['pointerdown', 'keydown', 'touchstart'] as const) {
    document.addEventListener(event, open, { once: true, capture: true })
  }
}

/**
 * Decode the whole catalogue.
 *
 * Run once, on the gesture that opens the gate, and not on page load: the
 * files are small but they are still bytes that a visitor who never makes a
 * sound should not pay for. Doing it here also means the buffers are warm
 * before the player has walked anywhere, so the first punch of a session is as
 * prompt as the fiftieth - a hit sound that arrives after a fetch is worse
 * than useless, because it lands on the wrong moment.
 */
async function warm(): Promise<void> {
  await Promise.all(allSoundFiles().map((url) => decode(url)))
}

/* -------------------------------------------------------------------------
 * Buffers
 * ------------------------------------------------------------------------- */

async function decode(url: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(url)
  if (cached) return cached

  const inFlight = decoding.get(url)
  if (inFlight) return inFlight

  const ctx = ensureContext()
  if (!ctx) return null

  const work = (async () => {
    try {
      const response = await fetch(url)
      if (!response.ok) return null

      const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
      buffers.set(url, buffer)
      return buffer
    } catch {
      // A missing or undecodable file is a silent sound, not a broken page.
      // The catalogue test is what catches this before it ships.
      return null
    } finally {
      decoding.delete(url)
    }
  })()

  decoding.set(url, work)
  return work
}

/* -------------------------------------------------------------------------
 * Playing
 * ------------------------------------------------------------------------- */

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

/**
 * Fire one effect.
 *
 * Deliberately synchronous and deliberately fire-and-forget: it is called from
 * inside frame loops and Realtime callbacks, and neither has anywhere to put a
 * promise or a failure. Every reason this cannot make a sound - no window, no
 * gesture yet, effects turned off, the buffer not decoded, the file missing -
 * ends in the same quiet return.
 */
export function play(id: SoundId): void {
  const sound = SOUNDS[id]
  fire(pickVariant(id), sound.gain, sound.minGapMs, id)
}

/**
 * Fire a file this catalogue has never heard of.
 *
 * The door an XP's sound pack comes through. A level names a sound from
 * `@kxb/xp/sounds`, the runtime turns that into a URL and a trim, and
 * everything below - the gesture gate, the player's own volume, the decode
 * cache, the ducking while the radio has the floor - is the same machinery
 * this module already runs.
 *
 * ---------------------------------------------------------------------------
 * Shared rather than copied, which is the opposite of the renderer's rule
 * ---------------------------------------------------------------------------
 * docs/xp/creator.md §1.2 says the XP creator copies what it borrows, and
 * `eslint.config.mjs` enforces it for `@/app/world` and `@/domain/world`. This
 * module is deliberately not in that list, and audio is the case the exception
 * exists for: there is **one** `AudioContext` per page, one gesture unlock and
 * one "effects off" preference. Two engines would mean a level that kept
 * playing after somebody turned sound off in the lounge, and a second context
 * competing for the same output - which is a correctness problem, where two
 * renderers drawing different worlds is merely two renderers.
 *
 * `key` is what the `minGapMs` floor is measured against. The URL, for a pack
 * sound, so five takes of a punch share one floor rather than each having their
 * own - the floor is about how often *that sound* may be heard.
 */
export function playFile(url: string, gain: number, minGapMs: number): void {
  fire(url, gain, minGapMs, url)
}

/**
 * The whole of playing something, once.
 *
 * Deliberately synchronous and deliberately fire-and-forget: it is called from
 * inside frame loops and Realtime callbacks, and neither has anywhere to put a
 * promise or a failure. Every reason this cannot make a sound - no window, no
 * gesture yet, effects turned off, the buffer not decoded, the file missing -
 * ends in the same quiet return.
 */
function fire(url: string, trimTo: number, minGapMs: number, key: string): void {
  const gain = sfxGain(prefs)
  if (gain <= 0) return
  if (!unlocked) return

  const at = now()
  if (at - (lastPlayed.get(key) ?? Number.NEGATIVE_INFINITY) < minGapMs) return
  lastPlayed.set(key, at)

  const ctx = ensureContext()
  if (!ctx || !bus) return

  // A tab that has been in the background long enough gets its context
  // suspended; the first sound after coming back is what notices.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})

  const buffer = buffers.get(url)

  if (!buffer) {
    // Warm it for next time. Not played on arrival: by then the moment this
    // sound was describing has passed, and a punch heard half a second late
    // reads as a second punch that never happened.
    void decode(url)
    return
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer

  // Per-sound trim, so the catalogue can balance a hot jingle against a quiet
  // footstep without the player's slider having to compensate for it.
  const trim = ctx.createGain()
  trim.gain.value = trimTo

  source.connect(trim)
  trim.connect(bus)
  source.start()

  // Nodes are single-use. Without this the graph grows by one disconnected
  // pair per sound for the life of the session.
  source.onended = () => {
    source.disconnect()
    trim.disconnect()
  }
}

/* -------------------------------------------------------------------------
 * Music
 * ------------------------------------------------------------------------- */

/**
 * Bring the element in line with what is wanted and what is allowed.
 *
 * One reconciler called from every edge - preference changed, page mounted,
 * page unmounted, gate opened - rather than a play() here and a pause() there.
 * The states interact (muted while not yet unlocked, unmuted while nothing is
 * mounted) and enumerating them at four call sites is how one of them ends up
 * wrong.
 */
function syncMusic(): void {
  const gain = musicGain(prefs)
  const shouldPlay = musicWanted && unlocked && gain > 0 && !radioHasTheFloor

  // Nothing wanted and nothing built yet: do not construct an element just to
  // leave it paused.
  const element = shouldPlay ? ensureMusic() : music
  if (!element) return

  element.volume = gain

  if (shouldPlay) {
    // Still rejects if the gesture we saw was not one this browser counts.
    // Nothing to do about that here; the next gesture will call back through.
    if (element.paused) void element.play().catch(() => {})
  } else if (!element.paused) {
    element.pause()
  }
}

/**
 * The radio is playing, so stand down - or has stopped, so carry on.
 *
 * The one place the two music systems meet. They are genuinely two systems: the
 * loop is an `<audio>` element on this device's mixer, the radio is a
 * cross-origin iframe on SoundCloud's, and neither can see the other. This
 * function is the whole of their relationship, which is why it is one boolean
 * and not a fade or a duck to a lower volume - the loop and a real track
 * competing at any level is just two songs.
 *
 * Effects are untouched. Somebody's footsteps and a block landing should still
 * be audible over the radio; they carry information, and they are short.
 */
export function duckForRadio(active: boolean): void {
  if (radioHasTheFloor === active) return
  radioHasTheFloor = active
  syncMusic()
}

/** A page that should have music is on screen. */
export function wantMusic(): void {
  musicWanted = true
  syncMusic()
}

/** …and is not any more. Does not touch the preference. */
export function releaseMusic(): void {
  musicWanted = false
  syncMusic()
}

/* -------------------------------------------------------------------------
 * Preferences
 * ------------------------------------------------------------------------- */

/** Apply new preferences live. Called by the store on every change. */
export function configure(next: AudioPrefs): void {
  prefs = next

  if (bus && context) {
    /**
     * Ramped rather than assigned.
     *
     * A gain that jumps produces a click - the waveform is cut mid-cycle - and
     * with a slider being dragged that is a click per pointer event. 20ms is
     * below the threshold where a volume change reads as gradual and well above
     * where it reads as a pop.
     */
    bus.gain.setTargetAtTime(sfxGain(next), context.currentTime, 0.02)
  }

  syncMusic()
}

/**
 * Test seam.
 *
 * The engine is unreachable from bun's test runner - there is no AudioContext
 * and no document - so what the tests cover is `prefs` and `catalogue`. This
 * exists so a future test that stubs the browser globals has a way back to a
 * clean mixer rather than one carrying state from the previous case.
 */
export function reset(): void {
  context = null
  bus = null
  music = null
  buffers.clear()
  decoding.clear()
  lastPlayed.clear()
  prefs = DEFAULT_PREFS
  musicWanted = false
  radioHasTheFloor = false
  unlocked = false
}
