'use server'

import { revalidatePath } from 'next/cache'
import { DEFAULT_AVATAR, DUMMY_LOOK } from '@/domain/lounge/avatars'
import { chooseAvatarSchema } from '@/domain/profile/avatar-commands'
import { wearAvatar } from '@/domain/profile/looks'
import { createClient } from '@/lib/supabase/server'
import { requireTenant } from '@/lib/tenant'

export type AvatarResult = { ok: true; model: string } | { ok: false; error: string }

/**
 * Pick your animal.
 *
 * A direct write rather than a command through the event store, because the
 * avatar is no longer workspace history - see the migration for why. What is
 * kept from the old path is the part that mattered: the actor comes from the
 * session and nothing in the input names a user, which is what makes it
 * impossible to dress somebody else up as a crab.
 *
 * No entitlement check either, and that is a deliberate reversal. Choosing used
 * to be blocked in a read-only workspace because it wrote to the log; it no
 * longer writes to any workspace's log, and refusing to let somebody whose
 * subscription lapsed change their own costume would be punishing them in a
 * place that has nothing to do with what they stopped paying for.
 */
export async function chooseAvatar(model: string): Promise<AvatarResult> {
  const parsed = chooseAvatarSchema.safeParse({ model })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Unknown animal' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to choose an animal.' }

  // The write itself, including the dummy coming off and any space override
  // being cleared, is in `./looks.ts` - the phone makes the identical one.
  const result = await wearAvatar(supabase, user.id, parsed.data.model)
  if (!result.ok) return result

  /**
   * Every page that draws you, not just the one the form is on.
   *
   * The whole point of moving this off the workspace is that the choice shows
   * up in the café and the house too, and those are separate routes with their
   * own caches. Revalidating only the settings page would have left the café
   * rendering yesterday's animal until something else happened to evict it.
   */
  revalidatePath('/', 'layout')

  return { ok: true, model: parsed.data.model }
}

/**
 * Stand in the dummy instead of your animal, or take it off again.
 *
 * The third body, and the only one that is nobody: the plain mannequin every
 * player is in the games before they own a skin, and the one a visitor with no
 * account already stands in. It could not be chosen from inside a room before
 * this, which meant putting an animal on was a door that locked behind you.
 *
 * Here rather than beside `wearLoungeSkin` because the dummy is not a skin and
 * cannot be stored as one - `profile_skins` refuses a model you do not own, and
 * nobody owns this. It is a second answer to the question `profile_avatars`
 * already asks, so it is written where that answer lives.
 *
 * Taking it off restores the animal on the row, which is why the flag is a flag
 * rather than a value in `model`: the peep you had is still there underneath.
 * A person who has never chosen an animal has no row at all, so wearing the
 * dummy writes one at the default - the animal they would have had anyway.
 */
export async function wearDummy(wear: boolean): Promise<AvatarResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to change your body.' }

  const stamp = new Date().toISOString()
  const { data, error } = await supabase
    .from('profile_avatars')
    .update({ as_dummy: wear, updated_at: stamp })
    .eq('user_id', user.id)
    .select('model')
    .maybeSingle()

  if (error) return { ok: false, error: 'That change did not save. Try again.' }

  /**
   * Nothing to update means no row yet, which is the common case for somebody
   * who has never picked an animal - and picking the dummy first is exactly
   * what somebody who does not want an animal would do. Inserting at the
   * default keeps "take the dummy off" meaning something afterwards.
   *
   * Not written when taking it off: no row already means no dummy.
   */
  if (!data && wear) {
    const { error: insert } = await supabase
      .from('profile_avatars')
      .insert({ user_id: user.id, model: DEFAULT_AVATAR, as_dummy: true, updated_at: stamp })

    if (insert) return { ok: false, error: 'That change did not save. Try again.' }
  }

  // Every page that draws you, for the reason `chooseAvatar` gives above.
  revalidatePath('/', 'layout')

  return { ok: true, model: wear ? DUMMY_LOOK : (data?.model ?? DEFAULT_AVATAR) }
}

/**
 * Be somebody else, here only.
 *
 * The override `readAvatarHere` prefers, and it is deliberately a *separate*
 * action rather than a flag on `chooseAvatar`: the two answer different
 * questions - "who am I" and "who am I in this room" - and one call that did
 * either depending on an argument is one call somebody will pass the wrong
 * argument to. `null` takes the override off and hands you back to your
 * profile, which is why "unset" has to stay distinct from any animal.
 *
 * The actor comes from the session and nothing in the input names a user, which
 * is the property that makes it impossible to dress somebody else up. Not gated
 * on membership either: a guest standing in the space is drawn beside everybody
 * else, and being one of four identical penguins is not a thing that should
 * check whether you were invited.
 */
export async function chooseSpaceAvatar(
  slug: string,
  model: string | null,
): Promise<AvatarResult> {
  if (model !== null) {
    const parsed = chooseAvatarSchema.safeParse({ model })
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Unknown animal' }
    }
  }

  const context = await requireTenant(slug, { guests: true })
  const { supabase, user, tenant } = context

  /**
   * Split rather than a ternary over two different query builders.
   *
   * The delete and the upsert have different row types, so one expression
   * covering both leaves TypeScript unable to name either - and the error it
   * gives points at `onConflict` rather than at the shape, which is a long way
   * from the cause.
   */
  let failed = false
  if (model === null) {
    const { error } = await supabase
      .from('space_avatars')
      .delete()
      .eq('user_id', user.id)
      .eq('tenant_id', tenant.id)
    failed = error !== null
  } else {
    const { error } = await supabase.from('space_avatars').upsert(
      {
        user_id: user.id,
        tenant_id: tenant.id,
        model,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,tenant_id' },
    )
    failed = error !== null
  }

  if (failed) {
    return { ok: false, error: 'That change did not save. Try again.' }
  }

  /**
   * And the same animal on the profile, so the two are one choice.
   *
   * Asked for directly - *"sync the profile and space as one, the profile will
   * update the space and vice versa"* - and it is the right shape rather than a
   * shortcut. Two places to pick an animal is a feature; two *answers* to "what
   * animal am I" is a bug you meet by picking in one of them and being
   * something else in the other.
   *
   * `null` is left alone on purpose, and it is the case that makes the pair
   * coherent: it means *"stop overruling my profile"*, so writing the profile
   * there would be taking an instruction to forget a preference and using it to
   * change the preference.
   *
   * Not fatal if it fails. What was asked for is saved; the profile catching up
   * is the part somebody can redo without losing anything.
   */
  if (model !== null) {
    await supabase.from('profile_avatars').upsert(
      { user_id: user.id, model, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  }

  // The whole space, because this changes how you are drawn in every room of
  // it - the same reason the profile action revalidates rather than the page.
  revalidatePath(`/t/${slug}`, 'layout')
  // And everywhere else, now that it is the profile too.
  if (model !== null) revalidatePath('/', 'layout')
  return { ok: true, model: model ?? '' }
}
