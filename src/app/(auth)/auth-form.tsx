'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import Logo from '@/app/components/logo'
import { useFormStatus } from 'react-dom'
import { KEEP_SIGNED_IN_FIELD } from '@/lib/auth-persistence'
import {
  type AuthResult,
  sendMagicLink,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
} from '@/app/(auth)/actions'
import { type AuthDict, authDict } from '@/app/i18n/auth'
import { type Locale, localePath } from '@/app/i18n/locales'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * Social sign-in.
 *
 * Plain forms rather than onClick handlers, so each button posts to its own
 * Server Action. That keeps the OAuth start on the server, where the PKCE code
 * verifier can be written to a cookie, and means the buttons work before any
 * JavaScript has loaded.
 */
function SocialButtons({
  invite,
  code,
  keep,
  dict,
}: {
  invite: string | null
  code: string | null
  keep: boolean
  dict: AuthDict
}) {
  return (
    <div className="space-y-2">
      <form action={signInWithGoogle}>
        <KeepField keep={keep} />
        {/* Carried through the provider round trip by the action, which writes
            it to a cookie on its way out - /auth/callback sees none of this
            page's query string. */}
        {invite && <input type="hidden" name="invite" value={invite} />}
        {/* Same trip, same mechanism. Somebody who arrived on a code and then
            chose Google must not lose the month by picking a different button. */}
        {code && <input type="hidden" name="code" value={code} />}
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface-raised px-4 py-2.5 text-sm font-medium transition hover:bg-surface"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
            <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.700-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
            <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
            <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
          </svg>
          {dict.google}
        </button>
      </form>

      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink-muted">{dict.or}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent'

/**
 * Stay signed in on this device.
 *
 * Checked by default, which is the honest default for what this app is: people
 * leave a tab parked in a lounge, and being asked to sign in again because they
 * closed the laptop is the single most annoying thing a session can do. Ticked
 * off, the auth cookies become session cookies and the browser drops them when
 * it closes - the shared-computer answer.
 *
 * It applies to every way in, including the Google button, because the choice is
 * about the *browser* and not about which credential was used - so it is one
 * controlled checkbox outside the forms, and each form carries a hidden field
 * that mirrors it. A checkbox can only belong to one form, and three visible
 * copies of the same question is not a design.
 *
 * With JavaScript off the state never moves, the hidden fields render, and
 * everybody stays signed in - which is the default anyway, so the degraded
 * behaviour is the ordinary behaviour.
 */
function KeepSignedIn({
  checked,
  onChange,
  dict,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  dict: AuthDict
}) {
  return (
    <label htmlFor="keep-signed-in" className="mt-5 flex items-start gap-2.5 text-sm">
      <input
        id="keep-signed-in"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border-line accent-accent"
      />
      <span>
        {dict.keepTitle}
        <span className="block text-xs text-ink-muted">{dict.keepNote}</span>
      </span>
    </label>
  )
}

/** The mirror of that checkbox, inside whichever form is being submitted. */
function KeepField({ keep }: { keep: boolean }) {
  // Absent rather than `value="0"`, because an unchecked box is how the action
  // reads "no" - see `rememberPersistence`. One representation, not two.
  return keep ? <input type="hidden" name={KEEP_SIGNED_IN_FIELD} value="1" /> : null
}

/**
 * The § 305 BGB notice, on the sign-up page only.
 *
 * AGB only become part of a contract if the other side could reasonably take
 * note of them *at the moment it is concluded*, which for this form is the
 * moment one of the three buttons below is pressed. So it sits above all three
 * rather than under one of them: Google, password and email link each conclude
 * the same contract, and a notice attached to the password form would leave the
 * two people out of three who used the other buttons having agreed to nothing.
 *
 * A tick box would be the belt-and-braces version and is not used, because the
 * law asks for the opportunity to read rather than a ritual, and every
 * additional required click on a sign-up form is paid for in people who do not
 * finish it. If a dispute ever makes proof of consent worth having, the thing
 * to add is a recorded terms version on the account, not a checkbox.
 *
 * The legal pages sit outside the `/de` prefix scheme - the German ones are the
 * originals at the bare path - so these hrefs are written out rather than run
 * through `localePath`. Same reasoning as the landing page footer.
 */
function TermsNotice({ locale, dict }: { locale: Locale; dict: AuthDict }) {
  const legal =
    locale === 'de'
      ? { terms: '/agb', privacy: '/datenschutz' }
      : { terms: '/agb/en', privacy: '/datenschutz/en' }

  return (
    <p className="mb-5 text-xs leading-relaxed text-ink-muted">
      {dict.termsLead}
      <Link href={legal.terms} className="text-accent hover:underline">
        {dict.termsLink}
      </Link>
      {dict.termsMid}
      <Link href={legal.privacy} className="text-accent hover:underline">
        {dict.termsPrivacyLink}
      </Link>
      {dict.termsTail}
    </p>
  )
}

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
    >
      {pending ? busy : idle}
    </button>
  )
}

function Feedback({
  state,
  dict,
  locale,
}: {
  state: AuthResult | null
  dict: AuthDict
  locale: Locale
}) {
  const refusal = useRefusal()
  if (!state) return null
  if (state.ok) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {state.message}
      </p>
    )
  }

  return (
    <div role="alert" className="space-y-1">
      <p className="text-sm text-red-500">{refusal(state.error)}</p>
      {/* Only when the refusal was "the door is shut". A dead invite gets the
          message and no link - see the note on `waitlist` in AuthResult. */}
      {state.waitlist && (
        <p className="text-sm">
          <Link
            href={localePath(locale, '/waitlist')}
            className="font-medium text-accent hover:underline"
          >
            {dict.waitlistLink}
          </Link>{' '}
          <span className="text-ink-muted">{dict.waitlistTail}</span>
        </p>
      )}
    </div>
  )
}

function PasswordForm({
  mode,
  invite,
  code,
  src,
  keep,
  dict,
  locale,
}: {
  mode: 'signin' | 'signup'
  invite: string | null
  code: string | null
  src: string | null
  keep: boolean
  dict: AuthDict
  locale: Locale
}) {
  const [state, formAction] = useActionState(
    mode === 'signin' ? signInWithPassword : signUpWithPassword,
    null,
  )

  return (
    <form action={formAction} className="space-y-4">
      {invite && <input type="hidden" name="invite" value={invite} />}
      {/* Read back by the actions so a refusal comes back in the language the
          form was read in. See AUTH_REPLIES. */}
      <input type="hidden" name="locale" value={locale} />
      <KeepField keep={keep} />
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">
          {dict.emailLabel}
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium">
          {dict.passwordLabel}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          required
          minLength={8}
          className={inputClass}
        />
      </div>

      {/*
        Sign-up only. A code is a thing you redeem when an account is created,
        and putting the field on the sign-in form would invite people to type
        one there and watch it do nothing.

        `defaultValue` rather than a controlled input: the value is a starting
        point that came off the link, not state this component owns. Somebody
        handed the wrong flyer types over it, and the server normalises whatever
        arrives - "cafe 24" and "CAFE24" are the same code by the time it is
        looked up.
      */}
      {mode === 'signup' && (
        <div className="space-y-1.5">
          <label htmlFor="promo-code" className="block text-sm font-medium">
            {dict.codeLabel}
          </label>
          <input
            id="promo-code"
            name="code"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            defaultValue={code ?? ''}
            maxLength={40}
            className={`${inputClass} font-mono uppercase`}
          />
          <p className="text-xs text-ink-muted">
            {code ? dict.codeApplied : dict.codeHint}
          </p>
          {/* The campaign tag, so the redemption records where this person
              actually came from rather than only which code they held. */}
          {src && <input type="hidden" name="src" value={src} />}
        </div>
      )}

      <Feedback state={state} dict={dict} locale={locale} />
      <SubmitButton
        idle={mode === 'signin' ? dict.signIn : dict.createAccount}
        busy={mode === 'signin' ? dict.signingIn : dict.creating}
      />
    </form>
  )
}

function MagicLinkForm({
  invite,
  code,
  keep,
  dict,
  locale,
}: {
  invite: string | null
  code: string | null
  keep: boolean
  dict: AuthDict
  locale: Locale
}) {
  const [state, formAction] = useActionState(sendMagicLink, null)

  if (state?.ok) {
    return (
      <div className="rounded-lg border border-line bg-surface-raised px-4 py-3">
        <p className="text-sm">{state.message}</p>
        <p className="mt-2 text-xs text-ink-muted">
          {dict.mailpitLead}
          <a
            href="http://127.0.0.1:54324"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            {dict.mailpitLink}
          </a>
          {dict.mailpitTail}
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      {invite && <input type="hidden" name="invite" value={invite} />}
      {/*
        Hidden rather than a second visible field, because this form cannot
        redeem anything: `signInWithOtp` sends a mail and creates the account
        only when the link is followed, which happens in /auth/confirm - a
        different request, quite possibly minutes later. So the action stashes
        the code in the cookie and the confirm route spends it.

        It is here at all for somebody who reached /signup?code=… directly
        rather than through /code/…, where no cookie was ever set. Without it,
        choosing the magic link over the password tab silently costs them the
        month.
      */}
      {code && <input type="hidden" name="code" value={code} />}
      {/* Read back by the actions so a refusal comes back in the language the
          form was read in. See AUTH_REPLIES. */}
      <input type="hidden" name="locale" value={locale} />
      <KeepField keep={keep} />
      <div className="space-y-1.5">
        <label htmlFor="magic-email" className="block text-sm font-medium">
          {dict.emailLabel}
        </label>
        <input
          id="magic-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
        />
      </div>

      <Feedback state={state} dict={dict} locale={locale} />
      <SubmitButton idle={dict.magicSubmit} busy={dict.magicSending} />
    </form>
  )
}

export function AuthForm({
  mode,
  errorCode,
  registrationOpen = true,
  invite = null,
  code = null,
  src = null,
  locale = 'en',
}: {
  mode: 'signin' | 'signup'
  errorCode?: string
  /** Only meaningful on the sign-up page; sign-in is never gated. */
  registrationOpen?: boolean
  invite?: string | null
  /**
   * A promo code this visitor arrived holding, from `?code=` or from the cookie
   * /code/[code] set. Prefills the field; never applied without being shown.
   */
  code?: string | null
  /** The `?src=` campaign tag, carried into the redemption for attribution. */
  src?: string | null
  locale?: Locale
}) {
  const dict = authDict(locale)
  const [method, setMethod] = useState<'password' | 'magic'>('password')
  const [keep, setKeep] = useState(true)
  const linkError = errorCode
    ? dict.linkErrors[errorCode as keyof typeof dict.linkErrors]
    : undefined

  // Three states, not two: an invited visitor on a closed installation should
  // be told their link is doing something, or the "by invitation only" notice
  // reads as a refusal aimed at them.
  const gated = mode === 'signup' && !registrationOpen

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* The mark doubles as the way back out - this page has no header to
            carry a home link of its own. */}
        <Link href={localePath(locale, '/')} className="mb-5 inline-flex items-center gap-3">
          <Logo />
          <span className="font-pixel text-sm tracking-widest text-ink-muted uppercase">team</span>
        </Link>

        <h1 className="mb-1 text-2xl font-semibold tracking-tight">
          {mode === 'signin' ? dict.signInTitle : dict.signUpTitle}
        </h1>
        <p className="mb-6 text-sm text-ink-muted">
          {dict.blurb}
        </p>

        {gated && (
          <div className="mb-5 rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-sm">
            {invite ? (
              <p>
                <span className="font-medium">{dict.invitedTitle}</span>{' '}
                <span className="text-ink-muted">{dict.invitedBody}</span>
              </p>
            ) : (
              <p className="text-ink-muted">
                {dict.gatedLead}
                <span className="font-medium text-ink">{dict.gatedStrong}</span>
                {dict.gatedMid}
                <Link
                  href={localePath(locale, '/waitlist')}
                  className="font-medium text-accent hover:underline"
                >
                  {dict.gatedLink}
                </Link>
                {dict.gatedTail}
              </p>
            )}
          </div>
        )}

        {linkError && (
          <p role="alert" className="mb-4 rounded-lg border border-line px-3 py-2 text-sm">
            {linkError}
          </p>
        )}

        {mode === 'signup' && <TermsNotice locale={locale} dict={dict} />}

        <SocialButtons invite={invite} code={code} keep={keep} dict={dict} />

        <div
          role="tablist"
          aria-label={dict.methodLabel}
          className="mb-5 flex gap-1 rounded-lg border border-line p-1"
        >
          <MethodTab
            active={method === 'password'}
            onClick={() => setMethod('password')}
            label={dict.methodPassword}
          />
          <MethodTab
            active={method === 'magic'}
            onClick={() => setMethod('magic')}
            label={dict.methodMagic}
          />
        </div>

        {method === 'password' ? (
          <PasswordForm
            mode={mode}
            invite={invite}
            code={code}
            src={src}
            keep={keep}
            dict={dict}
            locale={locale}
          />
        ) : (
          <MagicLinkForm
            invite={invite}
            code={code}
            keep={keep}
            dict={dict}
            locale={locale}
          />
        )}

        <KeepSignedIn checked={keep} onChange={setKeep} dict={dict} />

        {method === 'magic' && (
          <p className="mt-4 text-xs text-ink-muted">
            {gated
              ? dict.magicNoteGated
              : dict.magicNoteOpen}
          </p>
        )}

        <p className="mt-6 text-center text-sm text-ink-muted">
          {mode === 'signin' ? (
            <>
              {dict.noAccount}{' '}
              <Link
                href={localePath(locale, '/signup')}
                className="font-medium text-accent hover:underline"
              >
                {dict.createOne}
              </Link>
            </>
          ) : (
            <>
              {dict.haveAccount}{' '}
              <Link
                href={localePath(locale, '/login')}
                className="font-medium text-accent hover:underline"
              >
                {dict.signInLink}
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  )
}

function MethodTab({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${
        active ? 'bg-surface-raised font-medium' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}
