/**
 * The page that says a visit is over, named once.
 *
 * Lives in its own file, free of `server-only`, because the guest's *tab* needs
 * it too - `GuestPulse` sends itself here when the admission is gone - and the
 * module that explains the path (`session.ts`) is server code. Four modules
 * point at it now; a typo in any one would put the redirect loop back with
 * nothing to show for it in a diff, so the string is written here and
 * imported everywhere else, `session.ts` included.
 */
export const GUEST_LEFT_PATH = '/g/left'
