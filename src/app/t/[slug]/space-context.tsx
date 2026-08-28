'use client'

import { createContext, useContext, useMemo } from 'react'

/**
 * Which space the browser is standing in, for the client components that cannot
 * be handed it.
 *
 * ---------------------------------------------------------------------------
 * Why a context rather than a prop
 * ---------------------------------------------------------------------------
 * Nearly everything in this app is handed its slug by the server, and that is
 * still the rule: a page knows where it is, and threading the answer down is
 * cheaper to read than a lookup. This exists for the one shape that cannot be
 * threaded - a **framed XP**.
 *
 * A cartridge is mounted by `src/app/xp/_runtime/framed.tsx` out of a registry,
 * against `FrameProps`, which is deliberately the same six fields for every
 * game and carries no fact about our product. Widening it to carry a slug would
 * be widening a contract that `@kxb/xp` publishes for hosts that have no such
 * thing - see the note on `FrameProps` itself.
 *
 * `./games/maumau.tsx` already names the escape hatch for exactly this and uses
 * it for the reader's language: *the platform's own locale lives in a cookie and
 * a React context that `@kxb/xp` has never heard of and must not*. The café and
 * the house are the second case. They are not games that happen to be opened in
 * a space; they are **rooms of a space**, with a purse in that space's event log
 * and a roster on that space's presence channel, and the adapter is the one file
 * allowed to know both sides.
 *
 * ---------------------------------------------------------------------------
 * Null outside a space, and that is an answer
 * ---------------------------------------------------------------------------
 * The public `/xp/<id>` host renders no space around it, so `useSpace()` there
 * is null and a cartridge that needs one refuses with a sentence rather than
 * loading a café with no till behind it. That is the same shape every other
 * refusal in `framed.tsx` has.
 */
export interface Space {
  slug: string
  /** For the channels that are keyed by id rather than by name. */
  tenantId: string
}

const SpaceContext = createContext<Space | null>(null)

export function SpaceProvider({
  slug,
  tenantId,
  children,
}: Space & { children: React.ReactNode }) {
  // Memoised on the two strings it is made of, so the whole space does not
  // re-render every time the layout does.
  const value = useMemo(() => ({ slug, tenantId }), [slug, tenantId])
  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>
}

/** The space this is being rendered inside, or null when it is not inside one. */
export function useSpace(): Space | null {
  return useContext(SpaceContext)
}
