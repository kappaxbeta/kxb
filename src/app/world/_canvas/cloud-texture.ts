/**
 * The puff sprite every `<Clouds>` bank is drawn from.
 *
 * drei defaults this to a file on rawcdn.githack.com, which means the sky in
 * a lounge only appears if a third-party CDN is reachable - and when it is
 * not, the scene loads fine but the clouds silently never arrive. Self-hosted
 * from public/, it is the same 256x256 asset, served from our own origin and
 * cached with the rest of the build.
 *
 * Pass it to `<Clouds texture={CLOUD_TEXTURE}>`; the individual `<Cloud>`
 * children inherit it from the bank.
 */
export const CLOUD_TEXTURE = '/cloud.png'
