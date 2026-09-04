import type { Metadata } from 'next'
import { AnalyticsBeacon } from './components/analytics-beacon'
import { CtaTracker } from './components/cta-tracker'
import pixelMillennium from './components/fonts/pixel'
import { ContactWidget } from './components/contact-widget'
import { ConnectionFavicon } from './components/connection-favicon'
import { CookieBanner } from './components/cookie-banner'
import { TelegramShell } from './components/telegram-shell'
import './globals.css'
import { Inter } from "next/font/google";
import { env } from '@/lib/env'
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const TITLE = 'Kappa - KXB.TEAM VIRTUAL ARCADE SPACE'
const DESCRIPTION =
  'Invite your friends or colleagues to play or hangout together in a virtual team space.'

/**
 * What a link to this site unfurls as.
 *
 * Every route inherits this, and the ones with something better to say override
 * their own half of it - see `/g/[token]`, which names the space it is an
 * invitation to.
 *
 * The picture is *not* here any more, and its absence is the point. It used to
 * be one flat `/og.png` for the whole site, which meant a story chapter, the
 * front page and somebody's invitation into a match all arrived in a chat
 * looking identical and saying nothing. It is now `app/opengraph-image.tsx`
 * and four overrides beside it - see `src/app/og/` - and a picture stated
 * here would silently beat every one of them, because an explicit
 * `openGraph.images` wins over the file convention. So there is no `images`
 * key in this file, deliberately, and adding one back turns all five cards off
 * at once.
 *
 * The title is not the headline either. `/` and `/de` set their own, and this
 * is what everything else wears: the product, said the way somebody would say
 * it out loud.
 *
 * `metadataBase` is what makes a relative image URL legal. Open Graph requires
 * an absolute one, and without a base Next resolves it against `localhost` in
 * development and drops it in production - so the tag is either wrong or
 * missing, and neither fails a build. The generated cards need it as much as a
 * file in `public` did. The origin comes from the same variable Stripe's
 * return URLs are built from, so there is one answer to "where does this site
 * live" rather than two that can disagree.
 *
 * The card is `summary_large_image`: the default `summary` crops the picture to
 * a small square beside the text, and these cards are a wide composition with
 * a sentence down the left of them. X has no `twitter:image` to read here, on
 * purpose - it falls back to `og:image`, which is the generated one.
 */
export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl()),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'kxb.team',
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    locale: 'en',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  /**
   * What happens when somebody keeps the site.
   *
   * `title` is the label under the home screen tile. Without it Safari falls
   * back to the `<title>` above, which names the product and what it is and
   * arrives on the home screen truncated to "Kappa - KXB...".
   *
   * `capable` drops the browser chrome on launch, the same thing
   * `display: standalone` in `manifest.ts` asks Android for. It is a real
   * trade - no URL bar and no back button, so the app's own navigation has to
   * carry it - taken because the thing being installed is a 3D room you walk
   * around in, and Safari's toolbars cost a tenth of a phone's viewport.
   *
   * `black-translucent` runs the page under the clock and battery rather than
   * beside them. Correct here and not everywhere: this app is dark at every
   * route, and the alternative leaves an opaque bar the palette does not reach.
   */
  appleWebApp: {
    capable: true,
    title: 'kxb',
    statusBarStyle: 'black-translucent',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // The font variable rides on <html>, not on the element that uses it: it is
    // declared once here so `font-pixel` resolves in any tree below, including
    // the client components that never import the font module.
    //
    // `dark` is not a preference here, it is the only mode. The app's own
    // palette - `--surface`, `--ink`, `--line` - has always been dark, but
    // shadcn ships its tokens as a light `:root` block and a `.dark` override,
    // and without this class every shadcn component resolved the *light* set on
    // top of a dark page: white buttons on white cards, invisible switches.
    // `pixelMillennium.variable` is not decoration: `--font-pixel` in
    // globals.css reads `--font-pixel-millennium`, which only exists where this
    // class is. It was dropped when Inter arrived, and the symptom is that
    // every `font-pixel` in the app silently fell back to `ui-monospace` - the
    // headline still rendered, just in the wrong face, which is why nothing
    // broke loudly enough to notice.
    <html
      lang="en"
      className={cn("dark font-sans", inter.variable, pixelMillennium.variable)}
    >
      <body className="min-h-screen antialiased">
        {children}
        <AnalyticsBeacon />
        <CtaTracker />
        {/*
          Turns the tab's mark red when this client cannot reach anybody, which
          is a thing worth saying on every route rather than only inside a room:
          the tab is the only part of a page that stays visible once somebody
          has switched away from it.
        */}
        <ConnectionFavicon />
        {/*
          Expands the sheet and stops a downward drag from closing the app, on
          every route, when — and only when — this tab was opened by Telegram.
          Here rather than in the world's own layout because the setting is not
          about the world: a guest arriving from a chat meets the door first,
          and a door that dismisses itself while somebody is typing their name
          never gets as far as a room. Renders nothing anywhere else, and
          fetches nothing anywhere else either.
        */}
        <TelegramShell />
        {/*
          Every page in the app, which is the point of it living here.

          The music toggle used to sit beside the contact launcher, on the
          argument that the loop plays everywhere inside a workspace so the way
          to stop it has to be everywhere too. That argument was answered rather
          than abandoned: the switch is in the rail now, beside the radio and
          the party lights, which is in every room - and a room is where anybody
          listening to the loop actually is. What the corner copy was left doing
          was standing on the bottom-right of every page in the product,
          including pages whose own last row is a link, to offer a control for a
          loop that had not started.

          `MusicButton` itself is untouched and is the same one control; only
          the second place it was mounted is gone. See `rail-tabs.tsx`.
        */}
        <div className="corner-dock">
          <ContactWidget />
        </div>
        <CookieBanner />
      </body>
    </html>
  )
}
