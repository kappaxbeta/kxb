/**
 * What a drag from a model picker carries.
 *
 * Its own module because two pickers put models on the stage - the panel's grid
 * and the full-screen viewer - and the stage that catches them is a third
 * place. A named type rather than `text/plain` so that dragging a word from
 * somewhere else onto the stage does nothing, instead of trying to place a
 * model called "Tuesday".
 */
export const MODEL_MIME = 'application/x-xp-model'
