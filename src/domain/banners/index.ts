/**
 * The banner tool's domain, behind one door.
 *
 * Four subjects: what a banner is, where things sit on each canvas, what the
 * twelve say, and what art may be reached for. Adding a fifth should be a new
 * file and one line here.
 */
export type {
  ArtCatalogue, BannerCapture, BannerSpec, CaptureFit, DeviceKey, Panel, PanelCopy,
  PanelGroup, SlotLayout, SlotRect,
} from '@/domain/banners/spec'
export { DEVICES, slotRects } from '@/domain/banners/devices'
export type { DeviceGeometry } from '@/domain/banners/devices'
export { PANELS, TAGLINE, panel } from '@/domain/banners/panels'

/* `catalogue.ts` is deliberately NOT re-exported here. It reads a directory, so
 * it imports `node:fs`, and this barrel is imported by the editor - which is a
 * Client Component. A barrel that mixes the two is how `node:fs` ends up in a
 * browser bundle. The page imports the reader from its own module instead; the
 * shape it returns is a type, and types cross that line for free. */
