import type { MetadataRoute } from 'next'

/**
 * What the site becomes once somebody keeps it.
 *
 * "Add to Home Screen" on iOS reads two things: `apple-icon.png` for the tile
 * and `short_name` for the label under it. Without a short name Safari uses the
 * `<title>`, and this site's title is a comma-separated list of six event types
 * - which arrives on the home screen truncated to "kxb.team - Game...". Android
 * and the desktop install prompt read this whole file.
 *
 * `display: standalone` drops the browser chrome. That is a real trade - no URL
 * bar, no back button, so the app's own navigation has to carry it - but the
 * thing being installed is a 3D room you walk around in, and a toolbar over the
 * top of it costs a tenth of the viewport on a phone.
 *
 * The two colours are not decoration either. `background_color` is what iOS and
 * Android paint during the cold start before any CSS has parsed, and the
 * default is white: without this, launching from the home screen flashes a full
 * white screen into your eyes before the dark app appears.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'kxb',
    short_name: 'kxb',
    description:
      'Invite your friends or colleagues to play or hangout together in a virtual team space.',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    // Both are the `--surface` token from globals.css. The manifest is read
    // before any stylesheet, so there is nothing to inherit from.
    background_color: '#03020e',
    theme_color: '#03020e',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        // A separate file, declared maskable: Android launchers crop icons to
        // their own shape, and an icon that does not claim `maskable` gets
        // shrunk into a white circle rather than filling the shape. This one is
        // the same artwork pulled back inside the safe zone (see
        // scripts/render-app-icon.ts), because the full-bleed version would
        // lose the corners of the wire box to the crop.
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
