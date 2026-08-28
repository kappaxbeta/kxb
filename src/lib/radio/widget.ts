import { PROVIDERS, type Provider, type ProviderId } from '@/domain/radio/providers'

/**
 * The players, wrapped so the rest of the app never sees an iframe.
 *
 * ---------------------------------------------------------------------------
 * Why none of this is part of the audio engine
 * ---------------------------------------------------------------------------
 * Everything in src/lib/audio decodes into an `AudioContext` and runs through
 * one gain node, which is what makes the mixer coherent. The radio cannot join
 * it: every service here serves audio that is not CORS-readable and requires
 * playback through its own player, so there is no buffer to decode and no node
 * to connect - only an iframe, driven over postMessage.
 *
 * The consequence worth stating up front: radio volume is the widget's own
 * `setVolume`, not the engine's gain bus. Two things that look like one mixer
 * are two, and the music slider has to be told to both.
 *
 * ---------------------------------------------------------------------------
 * Two kinds of player
 * ---------------------------------------------------------------------------
 * SoundCloud and Mixcloud expose position and seek, so a room can be held on
 * the same second of the same song. Audiomack and hearthis.at publish embeds
 * and no control API - so their player is an iframe that starts at the top and
 * is honest about it. `Provider.synced` is the flag; see providers.ts for why
 * they are supported anyway rather than refused.
 */

export interface RadioPlayerHandlers {
  /**
   * The track cannot play *here* - embedding disabled by the uploader, a
   * regional block, a link to something since deleted.
   *
   * Surfaced rather than swallowed, because the alternative is a listener
   * looking at a panel that says a song is playing while their speakers are
   * silent, with nothing to say which of the two is lying.
   */
  onError: () => void
}

export interface RadioPlayer {
  readonly provider: Provider
  /** Point it at a track. Resolves once it is loaded and safe to seek. */
  load(trackUrl: string): Promise<void>
  play(): void
  pause(): void
  seekTo(milliseconds: number): void
  /** 0..1, converted to each widget's own scale internally. */
  setVolume(level: number): void
  position(): Promise<number>
  duration(): Promise<number>
  /**
   * Did playback actually start?
   *
   * Asked because `play()` is a request, not a guarantee, and the case that
   * matters is iOS: Safari requires a user gesture in the same call stack as
   * the play, and a gesture in *this* page does not carry into a cross-origin
   * iframe. So the widget accepts the command, reports no error, and stays
   * silent - the worst possible failure, because the panel says a track is on
   * and the phone disagrees with no explanation.
   *
   * True from a player that cannot answer, which is the honest default: it
   * means "I cannot promise this is playing", and the caller offers a tap.
   */
  isPaused(): Promise<boolean>
  destroy(): void
}

/* -------------------------------------------------------------------------
 * Shared plumbing
 * ------------------------------------------------------------------------- */

const scriptPromises = new Map<string, Promise<void>>()

/**
 * Fetch a third-party widget script, once per URL.
 *
 * Memoised on the promise rather than a boolean, so two mounts in one tick wait
 * on one request instead of appending two tags. A rejection clears the memo:
 * the usual causes are a blocked request or a dropped connection, and both are
 * worth retrying next time somebody presses play rather than remembering as
 * permanent.
 */
function loadScript(src: string): Promise<void> {
  const existing = scriptPromises.get(src)
  if (existing) return existing

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Could not load ${src}`))
    document.head.append(script)
  }).catch((error: unknown) => {
    scriptPromises.delete(src)
    throw error
  })

  scriptPromises.set(src, promise)
  return promise
}

/**
 * Make the hidden frame.
 *
 * Parked off-screen rather than `display:none` or zero-sized: a hidden or
 * zero-area iframe is treated by some browsers as not really on the page, and
 * media inside it is throttled or refused outright. One pixel, off the edge, is
 * the shape that reliably keeps playing.
 */
function makeFrame(src: string): HTMLIFrameElement {
  const frame = document.createElement('iframe')
  /**
   * Both permissions, and `encrypted-media` is not optional.
   *
   * `allow` is a whitelist, not an addition: naming `autoplay` alone silently
   * *revokes* everything else the frame would otherwise have inherited. That
   * cost real playback - Mixcloud and SoundCloud reach for Encrypted Media
   * Extensions on protected streams, and the frame was answering
   *
   *   Permissions policy violation: encrypted-media is not allowed
   *
   * which is not a warning; it is the audio pipeline being refused. The whole
   * failure is invisible from outside the iframe, so it presents as a track
   * that loads, reports no error, and never makes a sound.
   */
  frame.allow = 'autoplay; encrypted-media'
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin')
  frame.title = 'Space radio'
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none'
  frame.src = src
  document.body.append(frame)
  return frame
}

/**
 * Wait until the frame has actually navigated to the player.
 *
 * A freshly appended iframe is on `about:blank`, which inherits the *parent's*
 * origin - so anything that posts into it before it has loaded is aiming at the
 * wrong window. Mixcloud's `PlayerWidget()` constructor posts immediately, and
 * constructing it too early produced exactly that:
 *
 *   Failed to execute 'postMessage': the target origin provided
 *   ('https://player-widget.mixcloud.com') does not match the recipient
 *   window's origin ('https://kxb.team')
 *
 * The handshake is lost with that message, so the widget never becomes usable -
 * and it fails silently from then on, because every later call is posting into
 * a widget that never finished setting itself up.
 *
 * Resolves rather than rejects on timeout: a frame that is slow is still worth
 * trying, and the caller's own error handling is better placed to give up.
 */
function waitForFrame(frame: HTMLIFrameElement): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    frame.addEventListener('load', done, { once: true })
    setTimeout(done, 10_000)
  })
}

/**
 * Ask a widget something that answers by callback, as a promise.
 *
 * Every query gets a timeout, which looks defensive until you notice what these
 * calls are: postMessage into a cross-origin frame that may have failed to
 * load, been blocked by an extension, or be sitting behind a consent wall.
 * There is no rejection path there - the callback simply never fires - and an
 * awaited promise that never settles would wedge the drift loop for good.
 *
 * A `null` answer is folded into the fallback too. That is not hypothetical:
 * SoundCloud answers `getDuration` with null for a track it could not play, and
 * a null flowing into the sync arithmetic becomes NaN a few frames later.
 */
function ask<T>(call: (resolve: (value: T) => void) => void, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), 2_000)
    call((value: T) => {
      clearTimeout(timer)
      resolve(value == null ? fallback : value)
    })
  })
}

/* -------------------------------------------------------------------------
 * SoundCloud
 * ------------------------------------------------------------------------- */

interface ScWidget {
  bind(event: string, handler: () => void): void
  unbind(event: string): void
  load(url: string, options: Record<string, unknown>): void
  play(): void
  pause(): void
  seekTo(milliseconds: number): void
  setVolume(percent: number): void
  getPosition(callback: (ms: number) => void): void
  getDuration(callback: (ms: number) => void): void
  isPaused(callback: (paused: boolean) => void): void
}

interface ScApi {
  (element: HTMLIFrameElement): ScWidget
  Events: { READY: string; PLAY: string; PAUSE: string; FINISH: string; ERROR: string }
}

async function createSoundcloudPlayer(
  provider: Provider,
  handlers: RadioPlayerHandlers,
): Promise<RadioPlayer> {
  await loadScript('https://w.soundcloud.com/player/api.js')
  const api = (window as unknown as { SC?: { Widget?: ScApi } }).SC?.Widget
  if (!api) throw new Error('SoundCloud’s player did not load')

  /**
   * Booted with an empty `url`, which is deliberate and was checked rather than
   * assumed: the widget still reaches READY, and every track then arrives
   * through `load()`. Reusing one frame matters because a freshly created frame
   * has not inherited the page's user activation on some browsers, so the
   * second song of an evening would silently fail to autoplay.
   */
  const frame = makeFrame(provider.embedUrl(''))
  const widget = api(frame)
  widget.bind(api.Events.ERROR, handlers.onError)

  let ready = false
  /**
   * Every command is refused once the frame is gone.
   *
   * Not defensive padding - this was a crash. React effects unmount in their
   * own order, so the effect that pauses on `listening` going false can fire
   * after the effect that destroyed the player, and the widget's own `pause`
   * then dereferences the removed iframe:
   *
   *   TypeError: Cannot read properties of null (reading 'postMessage')
   *
   * Guarding at each call site would mean remembering to, in five places, for
   * the lifetime of the file. Guarding here means a destroyed player is simply
   * inert, which is what "destroyed" should have meant all along.
   */
  let destroyed = false

  return {
    provider,
    load(trackUrl) {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve()
          return
        }
        ready = false
        // Resolved on a timer as well as the callback: `load` is a postMessage
        // and its callback is not guaranteed to arrive for a frame that failed
        // to initialise. Without this the awaiting effect never continues.
        const timer = setTimeout(() => {
          ready = true
          resolve()
        }, 8_000)
        widget.load(trackUrl, {
          auto_play: false,
          show_artwork: false,
          visual: false,
          callback: () => {
            clearTimeout(timer)
            ready = true
            resolve()
          },
        })
      })
    },
    play: () => {
      if (ready && !destroyed) widget.play()
    },
    pause: () => {
      if (ready && !destroyed) widget.pause()
    },
    seekTo: (ms) => {
      if (ready && !destroyed) widget.seekTo(Math.max(0, Math.round(ms)))
    },
    setVolume: (level) => {
      if (!destroyed) widget.setVolume(Math.round(clamp01(level) * 100))
    },
    position: () =>
      destroyed ? Promise.resolve(0) : ask<number>((r) => widget.getPosition(r), 0),
    duration: () =>
      destroyed ? Promise.resolve(0) : ask<number>((r) => widget.getDuration(r), 0),
    // Defaults to `true` - "assume it is not playing" - so a widget that has
    // stopped answering produces an offered tap rather than a confident claim
    // that music is coming out.
    isPaused: () =>
      destroyed ? Promise.resolve(true) : ask<boolean>((r) => widget.isPaused(r), true),
    destroy: () => {
      destroyed = true
      try {
        widget.unbind(api.Events.ERROR)
      } catch {
        // The frame may already be gone - a full teardown, or an extension that
        // removed it. Nothing left to unbind either way.
      }
      frame.remove()
    },
  }
}

/* -------------------------------------------------------------------------
 * Mixcloud
 * ------------------------------------------------------------------------- */

interface McWidget {
  ready: Promise<void>
  getIsPaused(): Promise<boolean>
  load(feed: string, autoplay?: boolean): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  seek(seconds: number): Promise<boolean>
  getPosition(): Promise<number>
  getDuration(): Promise<number>
  setVolume(level: number): Promise<void>
}

/**
 * Mixcloud's API is promise-based and its times are in **seconds**, where
 * SoundCloud's are milliseconds. Converted at this boundary so that everything
 * above - the sync arithmetic, the drift loop, the stored offset - speaks one
 * unit. A seconds/milliseconds mix-up here would look exactly like drift, which
 * is the hardest kind of bug to see in a feature whose whole job is drift.
 */
async function createMixcloudPlayer(
  provider: Provider,
  handlers: RadioPlayerHandlers,
): Promise<RadioPlayer> {
  await loadScript('https://widget.mixcloud.com/media/js/widgetApi.js')
  const api = (window as unknown as {
    Mixcloud?: { PlayerWidget(el: HTMLIFrameElement): McWidget }
  }).Mixcloud
  if (!api) throw new Error('Mixcloud’s player did not load')

  // Empty, so the widget boots idle instead of fetching a show that does not
  // exist - see `embedUrl`.
  const frame = makeFrame(provider.embedUrl(''))

  /**
   * The frame has to have navigated before the widget is built.
   *
   * `PlayerWidget()` posts a handshake the moment it is constructed, and an
   * iframe that has not loaded yet is still on `about:blank` under this page's
   * own origin - so the post is rejected and the widget is dead on arrival.
   * See `waitForFrame`.
   */
  await waitForFrame(frame)

  const widget = api.PlayerWidget(frame)

  // Same guard, same reason, as the SoundCloud player above: unmount order can
  // put a `pause()` after the frame has gone, and the widget then dereferences
  // a null iframe.
  let destroyed = false

  try {
    await widget.ready
  } catch {
    handlers.onError()
  }

  return {
    provider,
    async load(trackUrl) {
      if (destroyed) return
      try {
        await widget.load(new URL(trackUrl).pathname, false)
      } catch {
        handlers.onError()
      }
    },
    play: () => {
      if (!destroyed) void widget.play().catch(handlers.onError)
    },
    pause: () => {
      if (!destroyed) void widget.pause().catch(() => {})
    },
    seekTo: (ms) => {
      if (!destroyed) void widget.seek(Math.max(0, ms) / 1000).catch(() => {})
    },
    setVolume: (level) => {
      if (!destroyed) void widget.setVolume(clamp01(level)).catch(() => {})
    },
    position: async () => {
      if (destroyed) return 0
      try {
        return ((await widget.getPosition()) ?? 0) * 1000
      } catch {
        return 0
      }
    },
    duration: async () => {
      if (destroyed) return 0
      try {
        return ((await widget.getDuration()) ?? 0) * 1000
      } catch {
        return 0
      }
    },
    isPaused: async () => {
      if (destroyed) return true
      try {
        return (await widget.getIsPaused()) !== false
      } catch {
        return true
      }
    },
    destroy: () => {
      destroyed = true
      frame.remove()
    },
  }
}

/* -------------------------------------------------------------------------
 * Embed-only services
 * ------------------------------------------------------------------------- */

/**
 * Audiomack and hearthis.at: an iframe, and no way to steer it.
 *
 * Neither publishes a control API - verified rather than assumed. So this is
 * deliberately a stub that admits what it cannot do rather than one that
 * pretends: `seekTo` does nothing, and `position` answers 0.
 *
 * Answering 0 is not a lie that breaks anything, because nothing asks. The dock
 * skips the drift loop entirely for a provider whose `synced` is false, so the
 * only consumer of these two methods never runs. They exist to satisfy one
 * interface, and the honest value is the one that would not silently cause a
 * seek if that ever changed.
 *
 * `play` and `pause` are the frame's `src`, with autoplay on or off. Crude, and
 * the only lever there is: reloading the frame is how you start one of these.
 */
function createEmbedPlayer(
  provider: Provider,
  handlers: RadioPlayerHandlers,
): RadioPlayer {
  const frame = makeFrame('about:blank')
  let current: string | null = null

  frame.addEventListener('error', handlers.onError)

  const point = (trackUrl: string, autoplay: boolean) => {
    const url = new URL(provider.embedUrl(trackUrl))
    url.searchParams.set('autoplay', autoplay ? '1' : '0')
    frame.src = url.toString()
  }

  return {
    provider,
    async load(trackUrl) {
      current = trackUrl
      point(trackUrl, false)
    },
    play: () => {
      if (current) point(current, true)
    },
    pause: () => {
      // No pause command exists, so the frame is emptied. Blunt, and it is the
      // difference between a listener being able to stop the sound and not.
      frame.src = 'about:blank'
    },
    seekTo: () => {},
    // No volume control either. The listener's own system volume is the only
    // one that applies to these two, which the help panel says out loud.
    setVolume: () => {},
    position: async () => 0,
    duration: async () => 0,
    /**
     * No way to ask, so this answers "not playing".
     *
     * Which reads as pessimistic and is the right way round: the consequence is
     * that a tap-to-start is offered on these two, and an unnecessary tap costs
     * one tap. The opposite mistake is a phone that is silent while the panel
     * insists music is playing, with nothing to press.
     */
    isPaused: async () => true,
    destroy: () => {
      frame.removeEventListener('error', handlers.onError)
      frame.remove()
    },
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Build the right player for a service.
 *
 * Called by the dock once per provider change and torn down with it. Not a
 * module singleton, unlike the audio engine: this owns a DOM node, and a
 * singleton holding a detached iframe across a navigation is how you end up
 * with two players and no way to address the first.
 */
export async function createRadioPlayer(
  providerId: ProviderId,
  handlers: RadioPlayerHandlers,
): Promise<RadioPlayer> {
  const provider = PROVIDERS[providerId]

  switch (providerId) {
    case 'soundcloud':
      return createSoundcloudPlayer(provider, handlers)
    case 'mixcloud':
      return createMixcloudPlayer(provider, handlers)
    default:
      return createEmbedPlayer(provider, handlers)
  }
}
