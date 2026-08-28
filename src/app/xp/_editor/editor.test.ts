import { describe, expect, test } from 'bun:test'
import { draftToRestore } from '@/app/xp/_editor/editor'

/**
 * Which `localStorage` draft an opening editor is allowed to layer over what the
 * server sent.
 *
 * The rule earns tests because both ways of getting it wrong are silent. Keep a
 * draft that is too old and somebody's screen quietly shows v5's work over v7,
 * with a refused save at the end of it. Drop one that is current and an
 * afternoon of building disappears on a refresh - the one unforgivable bug a
 * builder can have.
 */

const DOC = { name: 'a document' }

describe('draftToRestore', () => {
  test('a stamped draft from the version on disk is this session, so it is kept', () => {
    expect(draftToRestore({ savedAs: 8, document: DOC }, 8)).toEqual(DOC)
  })

  test('a draft older than what loaded is dropped', () => {
    // Closed on v5, somebody else saved v6 and v7, reopened.
    expect(draftToRestore({ savedAs: 5, document: DOC }, 7)).toBeNull()
  })

  test('a draft newer than what loaded is kept', () => {
    // The save landed and the page has not caught up - the draft is the newer
    // truth, and it is this browser's own.
    expect(draftToRestore({ savedAs: 9, document: DOC }, 8)).toEqual(DOC)
  })

  test('never-saved work is kept whatever the page loaded', () => {
    // `savedAs: null` is an afternoon that has not landed anywhere. No version
    // comparison can call it stale, and dropping it is the unforgivable bug.
    expect(draftToRestore({ savedAs: null, document: DOC }, 12)).toEqual(DOC)
  })

  test('a bare document from an older build is kept', () => {
    // Written before the wrapper existed. Enforcing a guard retroactively would
    // throw away work done when the guard did not exist.
    expect(draftToRestore(DOC, 8)).toEqual(DOC)
  })

  test('with no version to compare against, everything is kept', () => {
    // The operator route edits a file and has no versions at all.
    expect(draftToRestore({ savedAs: 3, document: DOC })).toEqual(DOC)
  })

  test('a wrapper with a non-numeric stamp is treated as never-saved', () => {
    expect(draftToRestore({ savedAs: 'eight', document: DOC }, 8)).toEqual(DOC)
  })

  test('a document that is not an object is handed on for the parser to refuse', () => {
    // Not this function's job to validate the document - `restore` runs it
    // through `parseXp`, which is the one boundary that decides.
    expect(draftToRestore('nonsense', 8)).toBe('nonsense')
  })
})
