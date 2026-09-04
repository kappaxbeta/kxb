import 'server-only'
import { DEFAULT_AVATAR } from '@/domain/lounge/avatars'
import type { Client } from '@/es/store'

/**
 * Putting a body on, from either front door.
 *
 * Three writes that used to live inside three Server Actions, moved here when
 * the native app arrived and had to make the identical ones from a route
 * handler. Each is a small upsert with one non-obvious column on it, and the
 * whole reason this file exists is that those columns must not be re-decided by
 * whoever writes the next caller:
 *
 *   - choosing an animal also clears any space that was overruling the profile;
 *   - equipping a skin pointedly does *not* touch the mode, so buying a body
 *     for the games cannot silently replace the peep everywhere;
 *   - which of the two bodies a world draws is its own switch, on its own row.
 *
 * The arguments for all three are in `avatar-actions.ts` and `skins/actions.ts`,
 * where they were made; they are not repeated here, only obeyed.
 *
 * Ownership is not checked in this file. The row policy on `profile_skins`
 * refuses a skin nobody owns, which is the boundary that holds for a route
 * handler, a Server Action and PostgREST alike - a check here would be a second
 * copy of it that only two of those three would ever run.
 */

export type LookResult = { ok: true } | { ok: false; error: string }

/** Pick your animal. */
export async function wearAvatar(
  supabase: Client,
  userId: string,
  model: string,
): Promise<LookResult> {
  const { error } = await supabase.from('profile_avatars').upsert(
    {
      user_id: userId,
      model,
      // `show_xp` is absent on purpose. An upsert writes only the columns it
      // names, so the mode somebody set survives changing the peep underneath
      // it: picking a fox while a world is drawing your XP body changes the
      // fox, and nothing on screen.
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) return { ok: false, error: 'That change did not save. Try again.' }

  /**
   * And any space that was quietly overruling it.
   *
   * A failure here is not worth failing the call over: the profile is saved,
   * which is what was asked for, and the worst case is one space still showing
   * an animal its owner can change from inside it.
   */
  await supabase.from('space_avatars').delete().eq('user_id', userId)

  return { ok: true }
}

/** Dress the XP body, or `null` to strip it back to the dummy. */
export async function wearSkin(
  supabase: Client,
  userId: string,
  model: string | null,
): Promise<LookResult> {
  if (model === null) {
    const { error } = await supabase.from('profile_skins').delete().eq('user_id', userId)
    if (error) return { ok: false, error: 'That change did not save. Try again.' }
    return { ok: true }
  }

  const { error } = await supabase.from('profile_skins').upsert(
    {
      user_id: userId,
      model,
      // Nothing about the mode, on purpose - it does not even live on this
      // table any more. Equipping is not being seen; see `showSkinInLounge`.
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) return { ok: false, error: 'You can only wear a skin you own.' }
  return { ok: true }
}

/**
 * Which of your two bodies a world draws: the peep, or the XP body.
 *
 * On `profile_avatars` rather than on `profile_skins`, and that move is what
 * made this stop refusing. It used to update the skin row and read it back, so
 * somebody with no skin equipped was told *"put a skin on first"* - which made
 * the dummy unreachable to exactly the people who wanted it, since the dummy
 * *is* the XP body with nothing on it. An account always has a peep row, or can
 * be given one at the animal it was already being drawn as, so the switch
 * always has somewhere to land.
 *
 * A model is deliberately not written for the peep half beyond that default:
 * the mode says which body to draw, and the peep underneath it is whoever it
 * already was. `readProfileAvatar` answers `DEFAULT_AVATAR` for a missing row,
 * so the insert below writes down the answer it was already giving.
 */
export async function showSkinInLounge(
  supabase: Client,
  userId: string,
  wear: boolean,
): Promise<LookResult> {
  const stamp = new Date().toISOString()

  /**
   * Update first, insert only if there was nothing to update.
   *
   * Pointedly not an upsert. An upsert writes every column it names on the
   * conflict too, so naming a model to satisfy the insert would reset the
   * animal of everybody who already had one - flipping the mode would quietly
   * turn your fox back into a penguin, which is the exact class of bug that
   * split these two writes apart in the first place.
   */
  const { data, error } = await supabase
    .from('profile_avatars')
    .update({ show_xp: wear, updated_at: stamp })
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle()

  if (error) return { ok: false, error: 'That change did not save. Try again.' }
  if (data) return { ok: true }

  /**
   * Nothing to update means no row yet, which is the common case for somebody
   * who has never picked an animal - and asking to be drawn as your XP body is
   * exactly what somebody who does not want an animal would do. The default is
   * the answer `readProfileAvatar` was already giving them, written down so
   * turning the mode off afterwards means something.
   *
   * Not written when turning it off: no row already means the peep.
   */
  if (!wear) return { ok: true }

  const { error: insert } = await supabase
    .from('profile_avatars')
    .insert({ user_id: userId, model: DEFAULT_AVATAR, show_xp: true, updated_at: stamp })

  if (insert) return { ok: false, error: 'That change did not save. Try again.' }
  return { ok: true }
}
