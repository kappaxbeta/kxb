/**
 * The services a track may come from.
 *
 * One registry, imported by both the browser and the server, holding everything
 * that differs between them: which hosts count, what a *track* link looks like
 * on that host, how to build an embed, and - the field that shapes the whole
 * feature - whether the player can be steered.
 *
 * ---------------------------------------------------------------------------
 * `synced` is not a detail
 * ---------------------------------------------------------------------------
 * Keeping a room on the same second of the same song needs two things from a
 * player: tell me where you are, and go to this position. SoundCloud and
 * Mixcloud both expose them. Audiomack and hearthis.at publish embeds and no
 * control API at all - verified, not assumed: neither installs a global, and
 * neither documents a postMessage protocol.
 *
 * So they are supported, and they are honestly labelled. A track from one of
 * them plays from its beginning for whoever is listening, and somebody joining
 * late starts at the top rather than in the middle. That is a real limitation
 * and it is surfaced in the UI rather than buried here - see the help panel.
 * The alternative was to refuse them, which would have been a worse answer to
 * "can you add these": a slightly lesser radio beats no radio.
 */

export type ProviderId = 'soundcloud' | 'mixcloud' | 'audiomack' | 'hearthis'

export interface Provider {
  id: ProviderId
  label: string
  /**
   * Hosts whose links we accept, compared against a parsed `hostname`.
   *
   * Never matched with `includes` or a regex over the raw string:
   * `https://soundcloud.com.evil.test/x` contains "soundcloud.com" and
   * `https://evil.test/?u=soundcloud.com` contains it twice. Only parsing the
   * URL and reading the host back says where a browser would actually go - and
   * this value ends up in an iframe `src`, so that distinction is the security
   * boundary of the feature.
   */
  hosts: readonly string[]
  /**
   * Whether this path names one playable thing.
   *
   * The check that was missing when this shipped, and it cost real confusion:
   * `https://soundcloud.com/wydrob/` is a valid URL on an allowed host that
   * names an *artist*, not a track. SoundCloud's widget loads it happily as
   * that artist's queue, so it half-works - it plays something, the title is
   * whatever is first, and two listeners can end up on different items of the
   * same "track". Refused here, where there is somebody to tell.
   */
  isTrackPath(pathname: string, hostname: string): boolean
  /** Where the iframe points. */
  embedUrl(trackUrl: string): string
  /** Can the room be held together on this one? See the note above. */
  synced: boolean
  /**
   * Where to ask what a track is called.
   *
   * oEmbed on every one of them, which is the point: it is a public endpoint
   * needing no key and no account, so the lookup can live on the server without
   * this app holding a credential for four different services. Each host has
   * its own address for it, verified rather than assumed - Mixcloud's lives on
   * `app.`, and Audiomack redirects to `creators.`.
   */
  oembed: string
  /** What a link to a single track looks like, for the help panel. */
  example: string
}

/** Path helper: how many non-empty segments a path has. */
function segments(pathname: string): string[] {
  return pathname.split('/').filter((part) => part.length > 0)
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  /**
   * The one with the richest control: play, pause, seek, position, duration,
   * and a `load` that swaps the track without replacing the frame.
   */
  soundcloud: {
    id: 'soundcloud',
    label: 'SoundCloud',
    hosts: ['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'],
    isTrackPath(pathname, hostname) {
      const parts = segments(pathname)
      /**
       * The single-segment case is legitimate on exactly one host.
       *
       * `on.soundcloud.com/aBcDeF` is the share-sheet shortener - what people
       * copy off a phone - and its whole path is an opaque code. On
       * `soundcloud.com` the same shape is `/wydrob`, an artist. Keying this on
       * the host rather than the shape is the difference: the two are
       * indistinguishable as strings, which is how a profile URL got through in
       * the first place and quietly played an artist's queue.
       */
      if (parts.length === 1) {
        return hostname.toLowerCase() === 'on.soundcloud.com' && /^[A-Za-z0-9]{4,}$/.test(parts[0])
      }
      // `/artist/track`. `/artist/sets/name` is a playlist - also two-plus, and
      // deliberately allowed: a set is a legitimate thing to put on.
      return parts.length >= 2
    },
    embedUrl(trackUrl) {
      const params = new URLSearchParams({
        url: trackUrl,
        auto_play: 'false',
        show_artwork: 'false',
        show_comments: 'false',
        sharing: 'false',
        buying: 'false',
        download: 'false',
        visual: 'false',
      })
      return `https://w.soundcloud.com/player/?${params.toString()}`
    },
    synced: true,
    oembed: 'https://soundcloud.com/oembed',
    example: 'soundcloud.com/wydrob/ily',
  },

  /**
   * Long-form: DJ sets, radio shows, podcasts, licensed for mixes - which is
   * the reason to want it over SoundCloud for a room that is having a party
   * rather than listening to a song.
   */
  mixcloud: {
    id: 'mixcloud',
    label: 'Mixcloud',
    hosts: ['mixcloud.com', 'www.mixcloud.com', 'm.mixcloud.com'],
    // `/user/show/` - a show always sits under an account, so one segment is a
    // profile here too.
    isTrackPath: (pathname) => segments(pathname).length >= 2,
    embedUrl(trackUrl) {
      const params = new URLSearchParams({ hide_cover: '1' })
      /**
       * An empty link boots an empty player, and `feed` is left off entirely
       * rather than sent blank.
       *
       * This is the fix for a real mess: the player used to be booted with a
       * made-up `/placeholder/show/` feed, which Mixcloud dutifully went and
       * looked up - failing with a wall of `ERR_CONNECTION_CLOSED` GraphQL
       * errors in everybody's console before the real track had even been
       * asked for. A widget with no feed is a widget waiting to be told one,
       * which is exactly what `load()` then does.
       */
      if (trackUrl) params.set('feed', new URL(trackUrl).pathname)
      return `https://player-widget.mixcloud.com/widget/iframe/?${params.toString()}`
    },
    synced: true,
    oembed: 'https://app.mixcloud.com/oembed/',
    example: 'mixcloud.com/artist/show-name/',
  },

  /**
   * Hip-hop, rap and R&B, with free unlimited uploads - so it is where a lot of
   * independent work actually lives.
   *
   * Embed only. Not steerable, so not synchronised; see the note at the top.
   */
  audiomack: {
    id: 'audiomack',
    label: 'Audiomack',
    hosts: ['audiomack.com', 'www.audiomack.com'],
    // `/artist/song/slug` or `/artist/album/slug`.
    isTrackPath: (pathname) => segments(pathname).length >= 2,
    embedUrl(trackUrl) {
      const parts = segments(new URL(trackUrl).pathname)
      /**
       * Audiomack's embed wants `<kind>/<artist>/<slug>`, where the kind is the
       * *second* segment of a page URL (`/artist/song/slug`). Rearranged rather
       * than passed through, because their embed host does not accept a page
       * URL as a parameter the way SoundCloud's does.
       */
      const [artist, kind, slug] = parts
      const path = slug ? `${kind}/${artist}/${slug}` : parts.join('/')
      return `https://audiomack.com/embed/${path}?background=1`
    },
    synced: false,
    oembed: 'https://creators.audiomack.com/oembed',
    example: 'audiomack.com/artist/song/track-name',
  },

  /**
   * The closest thing to SoundCloud for independent creators, and the usual
   * landing place for people who have been pushed off it.
   *
   * Embed only, like Audiomack.
   */
  hearthis: {
    id: 'hearthis',
    label: 'hearthis.at',
    hosts: ['hearthis.at', 'www.hearthis.at', 'app.hearthis.at'],
    isTrackPath: (pathname) => segments(pathname).length >= 2,
    embedUrl(trackUrl) {
      const params = new URLSearchParams({
        hcolor: '',
        color: '',
        style: '2',
        block_size: '2',
        block_space: '1',
        background: '1',
        waveform: '0',
        cover: '0',
        autoplay: '0',
        css: '',
      })
      // hearthis embeds by page URL under /embed/, keeping the artist/track
      // path intact.
      const path = segments(new URL(trackUrl).pathname).join('/')
      return `https://app.hearthis.at/embed/${path}/transparent_black/?${params.toString()}`
    },
    synced: false,
    oembed: 'https://hearthis.at/oembed/',
    example: 'hearthis.at/artist/track-name/',
  },
}

export const PROVIDER_LIST: Provider[] = Object.values(PROVIDERS)

/** Which service a hostname belongs to, or null if it is none of ours. */
export function providerForHost(hostname: string): Provider | null {
  const host = hostname.toLowerCase()
  return PROVIDER_LIST.find((provider) => provider.hosts.includes(host)) ?? null
}

export function isProviderId(value: string): value is ProviderId {
  return value in PROVIDERS
}
