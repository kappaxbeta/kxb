/**
 * The mark, with `team` pinned to its corner.
 *
 * The two used to sit side by side, which reads as two controls rather than as
 * one address. Overlapped, the badge behaves the way a sticker does: it belongs
 * to the thing underneath it, and the eye takes the pair in as a single object
 * instead of scanning across a gap between them.
 *
 * `.logo-wrap` exists only to be the badge's containing block. Without a
 * positioned ancestor the badge's offsets resolve against the page and it lands
 * in the corner of the viewport rather than on the mark.
 */
/**
 * `badge` is opt-in, and only the landing page opts in.
 *
 * Everywhere else the mark appears - the sidebar of a space, the sign-in card,
 * the demo lounge - it is wayfinding rather than branding: it says "you are in
 * this product, click to leave". Naming the company again in a room somebody is
 * already standing in is the kind of thing that reads as an advert on your own
 * furniture.
 */
const Logo = ({ badge = false }: { badge?: boolean }) => (
  <span className="logo-wrap">
    <span className="logo">κXβ</span>
    {badge ? <TeamBadge /> : null}
  </span>
)

/**
 * The second half of the lockup: `team` in a solid pink block.
 *
 * Filled rather than outlined, and square rather than rounded, because it is
 * not a second copy of the mark - it is the label on it. The mark owns the cyan
 * wire, the glow and the rounded corner; a badge repeating any of those reads
 * as a control that got split in half, which is what the wire-box version it
 * replaces did.
 *
 * Real text, not a drawing, so it is read out and searched like a word. The
 * rendered-out copy in `public/team.png` is a photograph of this rule rather
 * than a second definition of it - see `scripts/` and the note in the route
 * that saved it.
 */
export const TeamBadge = () => <span className="team-badge">team</span>

export default Logo
