/**
 * What a spoken line looks like, wherever it is drawn.
 *
 * There are three of these bubbles and they are three separate canvases: the
 * live one over an avatar in a room (`@/app/world/chat-bubble`), the static one
 * in a composed still (`Say` in `@/app/world/shots/pieces`), and whatever the
 * next surface turns out to be. They were three different dark blues, drifting
 * apart a shade at a time, which is exactly the thing a constant fixes.
 *
 * ---------------------------------------------------------------------------
 * Why blue and not the room's own near-black
 * ---------------------------------------------------------------------------
 * A bubble the same colour as every panel in the lounge is a *label*. It reads
 * as chrome — the nameplate, the health bar, the HUD are all that colour — and
 * a sentence somebody just said is not chrome, it is the one thing on screen
 * that came from another person.
 *
 * iMessage blue is doing the work here for a reason that has nothing to do with
 * imitating Apple: it is the single most legible "this is a person talking"
 * signal in software, and a voxel room full of animals gets to borrow it for
 * free. The emote bubble stays white with a face on it, so the two registers
 * are still distinguishable at a glance across a room — a reaction is white, a
 * sentence is blue.
 *
 * Kept in the domain rather than next to either canvas so neither owns it, and
 * as hex strings because both consumers are `CanvasRenderingContext2D`, which
 * takes CSS colours and knows nothing about the app's oklch tokens.
 */

/**
 * The fill.
 *
 * The dark-mode value rather than the light one — every surface this is drawn
 * on is a night sky or a lit room, and `#007AFF` against those is noticeably
 * heavier than it looks in a mockup.
 */
export const SAID_BLUE = '#0b84fe'

/**
 * The bottom of the fill.
 *
 * A shallow vertical gradient rather than a flat fill. Flat is fine on a phone
 * screen, which is flat; these bubbles hang in a 3D scene next to shaded voxel
 * solids, and a perfectly even rectangle among them reads as a sticker rather
 * than as an object in the room.
 */
export const SAID_BLUE_DEEP = '#0064e0'

/** The text on it. White, because that is the only thing legible on this blue. */
export const SAID_INK = '#ffffff'

/**
 * The edge.
 *
 * Slightly lighter than the fill rather than a contrasting outline: it exists so
 * the bubble has a silhouette against a pale wall, not so it has a border.
 */
export const SAID_EDGE = 'rgba(150, 200, 255, 0.55)'
