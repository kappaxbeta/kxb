/**
 * The colour the whole app is painted on.
 *
 * One constant, because four scenes and a stylesheet have to agree on it: the
 * canvases are transparent now, so the page's sky *is* each world's sky, and
 * the fog that carries a world's far edge into that sky has to be this exact
 * colour or the horizon shows as a seam.
 *
 * Hex rather than the oklch token in globals.css because three.js parses CSS
 * colours but not custom properties, and reading one out of the document at
 * runtime would make the scenes' look depend on the stylesheet having loaded.
 * It has to stay in step with the `html` background there by hand.
 */
export const SKY = '#0a0616'

/**
 * The feathered edge every scene ends at.
 *
 * A radial mask that fades the canvas to nothing before it reaches its own
 * corners, so a world stops by dissolving rather than by hitting a rectangle.
 * Done in CSS because a post-processing pass would mean another renderer
 * dependency for what is, in the end, a soft-edged oval.
 */
export const SCENE_MASK =
  'radial-gradient(ellipse 82% 82% at 50% 50%, black 58%, transparent 100%)'
