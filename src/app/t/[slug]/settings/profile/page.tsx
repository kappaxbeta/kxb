import type { Metadata } from 'next'
import { AudioSettings } from '@/app/t/[slug]/settings/audio-settings'
import { AvatarPicker } from '@/app/t/[slug]/settings/avatar-picker'
import { BlockedPanel } from '@/app/t/[slug]/settings/blocked-panel'
import { CloseAccountPanel } from '@/app/t/[slug]/settings/close-account-panel'
import { ControlSettings } from '@/app/t/[slug]/settings/control-settings'
import { EmailPanel } from '@/app/t/[slug]/settings/email-panel'
import { LanguagePicker } from '@/app/t/[slug]/settings/language-picker'
import { PasswordPanel } from '@/app/t/[slug]/settings/password-panel'
import { UsernamePicker } from '@/app/t/[slug]/settings/username-picker'
import { closeObstacles, NO_OBSTACLES } from '@/domain/account/obstacles'
import { listBlockedPeople } from '@/domain/blocks/queries'
import { readProfileAvatar } from '@/domain/profile/avatar-queries'
import { emailVerified } from '@/domain/profile/email-verification'
import { hasPassword } from '@/domain/profile/password-actions'
import { readDisplayName } from '@/domain/profile/username-queries'
import { requireTenant } from '@/lib/tenant'
import { settingsDict } from '@/app/i18n/settings'
import { readLocale } from '@/app/i18n/preference'

/** The tab, in the reader's language. The layout adds the space's name. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: settingsDict(await readLocale()).metaProfile }
}

/**
 * Everything on this page is yours rather than the space's.
 *
 * None of it is scoped to the workspace at all: the name, the avatar and the
 * password follow your account into every space you belong to, and the audio
 * settings never reach the server. The tenant is still required, because this
 * lives inside a space's shell and a signed-out reader has no profile to edit -
 * but nothing here is read from it.
 */
export default async function ProfileSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { supabase, user } = await requireTenant(slug)

  /**
   * Two more reads, and both are about the account rather than about this
   * space: who this person has blocked, and which of their spaces would be
   * stranded if they closed the account.
   *
   * A guest gets neither. They have no account to close - `closeAccount`
   * refuses one outright - and asking the obstacles question for a visitor pass
   * is a query whose answer is never read. `NO_OBSTACLES` keeps the type total
   * without a nullable prop threading through the panel.
   */
  const [avatar, username, passwordSet, blocked, obstacles] = await Promise.all([
    readProfileAvatar(supabase, user.id),
    readDisplayName(supabase, user.id),
    hasPassword(),
    listBlockedPeople(supabase),
    user.is_anonymous ? NO_OBSTACLES : closeObstacles(supabase, user.id),
  ])

  /**
   * Both read off the `user` this page already has, so neither costs a round
   * trip: whether the address has been proven (see `emailVerified`) and whether
   * a change to another one is still waiting on a link.
   */
  const verified = emailVerified(user)
  const pending = (user as { new_email?: unknown }).new_email

  return (
    <div className="space-y-6">
      <UsernamePicker initialUsername={username} />
      <AvatarPicker initialAvatar={avatar} />
      {/* The one thing here that is about getting back in rather than about
          being seen. Which form it shows is decided on the server: an invited
          account has no password to ask for. */}
      <PasswordPanel email={user.email ?? ''} hasPassword={passwordSet} />
      {/* Directly after the password, because changing the address needs one -
          somebody sent here by the "set a password first" line has the form
          they need immediately above. Never for a guest: an anonymous account
          has no address to show, let alone move. */}
      {user.email && !user.is_anonymous && (
        <EmailPanel
          email={user.email}
          verified={verified}
          pending={typeof pending === 'string' && pending ? pending : null}
          hasPassword={passwordSet}
        />
      )}
      {/* Further out still: these two never reach the server at all. See the
          notes in the components. */}
      <AudioSettings />
      <ControlSettings />
      {/* Then the page rather than the person: it decides which language
          everything above it was printed in. */}
      <LanguagePicker />
      {/* Who you have decided not to hear. Under the language because that is
          where its own words come from, and because it is the first panel on
          this page that is about other people. */}
      <BlockedPanel initial={blocked} />
      {/* And last, the way out. Never for a guest: a visitor pass is a session
          that ends on its own, and a "delete your account" button on one is a
          promise about something that is not an account. */}
      {!user.is_anonymous && <CloseAccountPanel obstacles={obstacles} />}
    </div>
  )
}
