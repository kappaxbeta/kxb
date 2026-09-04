/**
 * What the loose voxels behind a panel are arranged by.
 *
 * Its own module because two callers need the same answer and a second copy of
 * this expression would be a second scatter: the backoffice preview and the
 * render script have to draw the same picture, or the PNG that ships is not the
 * one anybody approved.
 *
 * Derived from the panel's id rather than stored, so a panel's background is
 * fixed the moment it is named and does not move when its words are edited.
 */
export function bannerSeed(panelId: string): number {
  return [...panelId].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0
}
