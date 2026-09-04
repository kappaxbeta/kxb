/**
 * The GIF encoder, where the render scripts have always imported it from.
 *
 * It moved into `src/domain/studio/gif.ts` when the studio started writing
 * these in the browser, which has no `Buffer` - see the note there. This file
 * is left as the address rather than updating a handful of `import` lines,
 * because the scripts are the older caller and the shorter path is the one they
 * read better with.
 */
export { encodeGif, type Frame, type GifOptions } from '../src/domain/studio/gif'
