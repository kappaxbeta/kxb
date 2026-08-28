/**
 * Asking the workspace drawer to open, from somewhere that is not the rail.
 *
 * ---------------------------------------------------------------------------
 * Why an event and not a prop
 * ---------------------------------------------------------------------------
 * The drawer is the sidebar's own state and the sidebar is rendered by the
 * layout, a server component that does not know which page it is wrapping.
 * The one page that needs to open it from its own chrome - the XP editor on a
 * phone, which has a rail of its own down the edge the drawer's handle lives
 * on - is a client component three boundaries down. Threading a setter to it
 * would mean a client boundary around the whole rail to carry one function.
 *
 * This is the same move the fold already makes with `data-rail-left` and the
 * same one `slash-command.ts` makes with `EDITOR_IMAGE_REQUEST`: the page
 * says what it wants on a channel both ends already have, and the sidebar
 * listens. A document event rather than a window one, so a test can fire it
 * on a detached document.
 */
export const OPEN_RAIL = 'kxb:open-rail'

export function openRail(): void {
  document.dispatchEvent(new CustomEvent(OPEN_RAIL))
}
