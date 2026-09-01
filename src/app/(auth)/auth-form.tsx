'use client'

import Image from 'next/image'
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
import { normaliseCode, type SignupOffer } from '@/domain/promo/application'
import { type AuthDict, authDict } from '@/app/i18n/auth'
import { type Locale, localePath } from '@/app/i18n/locales'
import { stance } from '@/app/i18n/stance'
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
    <div className="space-y-3">
      <form action={signInWithGoogle}>
        <KeepField keep={keep} />
        {/* Carried through the provider round trip by the action, which writes
            it to a cookie on its way out - /auth/callback sees none of this
            page's query string. */}
        {invite && <input type="hidden" name="invite" value={invite} />}
        {/* Same trip, same mechanism. Somebody who arrived on a code and then
            chose Google must not lose the month by picking a different button.

            This is the code *as it currently stands on the form*, not the one
            the page was rendered with. It used to be the latter, which meant
            taking an offer or correcting a typo and then reaching for Google
            quietly sent the old value - the one case where the two halves of
            this form disagreed about what was being redeemed. */}
        {code && <input type="hidden" name="code" value={code} />}
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface-raised px-4 py-2.5 text-sm font-medium transition hover:bg-surface"
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

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink-muted">{dict.or}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-sm outline-none transition focus:border-accent'

const labelClass = 'block text-sm font-medium'

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
    <label htmlFor="keep-signed-in" className="flex items-start gap-2.5 text-sm">
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
    <p className="text-xs leading-relaxed text-ink-muted">
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
      className="w-full rounded-full bg-accent px-4 py-3 text-sm font-medium transition disabled:opacity-50"
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

/**
 * What is on offer, read off the codes an operator named `SIGNUP…`.
 *
 * The sign-up form used to open with an empty box labelled "Code (optional)" -
 * a question most visitors cannot answer, next to no indication that there was
 * anything to answer it with. This is the same thing said the other way round:
 * here is what is going, and here is the button that takes it.
 *
 * Cyan on everything except the button, which is fuchsia. The offer is a fact
 * about what exists; taking it is the only action in the strip, and the palette
 * has exactly one colour for that.
 *
 * The best offer is already applied by the time this renders - the page does it
 * server-side, so it survives having no JavaScript. These buttons only *swap*
 * between offers, which is why a visitor with scripting off loses nothing but
 * the ability to pick the second-best one.
 */
function Offers({
  offers,
  applied,
  onTake,
  dict,
  locale,
}: {
  offers: SignupOffer[]
  applied: string | null
  onTake: (code: string) => void
  dict: AuthDict
  locale: Locale
}) {
  return (
    <div className="space-y-2">
      {offers.map((offer) => {
        const taken = applied === offer.code
        const headline =
          offer.freeDays === null
            ? dict.offerForever.replace('{tier}', offer.tier)
            : dict.offerDays
                .replace('{n}', String(offer.freeDays))
                .replace('{tier}', offer.tier)

        /**
         * The two facts that make an offer feel finite, and neither is shown
         * unless it is true. An uncapped code has no "left" to report, and one
         * with no expiry has no date - printing "unlimited" and "no end" would
         * be two lines of nothing where the eye expects urgency.
         *
         * The count is held back until it is actually low. "196 left" is a
         * number about us; "4 left" is a number about the reader.
         */
        const meta = [
          offer.remaining !== null && offer.remaining <= 25
            ? dict.offerRemaining.replace('{n}', String(offer.remaining))
            : null,
          offer.closesAt
            ? dict.offerCloses.replace(
                '{date}',
                new Date(offer.closesAt).toLocaleDateString(locale),
              )
            : null,
        ].filter(Boolean)

        return (
          <div key={offer.code} className="auth-offer" data-applied={taken}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{headline}</p>
                <p className="auth-offer-code mt-0.5">{offer.code}</p>
                {offer.label && (
                  <p className="mt-1.5 text-xs text-ink-muted">{offer.label}</p>
                )}
              </div>

              {taken ? (
                <p className="auth-offer-done">
                  <svg viewBox="0 0 16 16" aria-hidden className="size-3.5">
                    <path
                      d="M3 8.5l3.2 3.2L13 5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {dict.offerApplied}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => onTake(offer.code)}
                  className="auth-offer-take"
                >
                  {dict.offerUse}
                </button>
              )}
            </div>

            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              {dict.offerNote}
              {offer.spaces !== null && (
                <> {dict.offerSpaces.replace('{n}', String(offer.spaces))}</>
              )}
            </p>

            {meta.length > 0 && (
              <p className="auth-offer-meta mt-1 text-xs text-accent-2">
                {meta.join(' · ')}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * The code field.
 *
 * Always here, always editable, even when an offer above has already filled it
 * in. Folding it away once something was applied was tried and is wrong: a code
 * off a flyer, a friend or a partner is not one of the published offers, and the
 * person holding one must never have to go looking for the box to type it in.
 * The offer strip and this field are the same value seen twice - the strip says
 * what is on, the field is where you change it.
 *
 * Controlled, where it used to hold a `defaultValue`. That changed when the
 * offers arrived: the value is now something the form writes to as well as reads
 * from, and it is shared with the Google button and the magic-link form, so one
 * owner is the only shape that stays honest.
 */
function CodeField({
  value,
  onChange,
  src,
  dict,
}: {
  value: string
  onChange: (next: string) => void
  src: string | null
  dict: AuthDict
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="promo-code" className={labelClass}>
        {dict.codeLabel}
      </label>
      <input
        id="promo-code"
        name="code"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={40}
        className={`${inputClass} font-mono uppercase`}
      />
      <p className="text-xs text-ink-muted">
        {value === '' ? dict.codeHint : dict.codeApplied}
      </p>
      {/* The campaign tag, so the redemption records where this person actually
          came from rather than only which code they held. */}
      {src && <input type="hidden" name="src" value={src} />}
    </div>
  )
}

function PasswordForm({
  mode,
  invite,
  code,
  onCode,
  src,
  keep,
  dict,
  locale,
}: {
  mode: 'signin' | 'signup'
  invite: string | null
  code: string
  onCode: (next: string) => void
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
        <label htmlFor="email" className={labelClass}>
          {dict.emailLabel}
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className={labelClass}>
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
      */}
      {mode === 'signup' && (
        <CodeField value={code} onChange={onCode} src={src} dict={dict} />
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
  code: string
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
        rather than through /code/…, and now also for somebody who took one of
        the published offers on the other tab. Without it, choosing the magic
        link over the password tab silently costs them the month.
      */}
      {code && <input type="hidden" name="code" value={code} />}
      {/* Read back by the actions so a refusal comes back in the language the
          form was read in. See AUTH_REPLIES. */}
      <input type="hidden" name="locale" value={locale} />
      <KeepField keep={keep} />
      <div className="space-y-1.5">
        <label htmlFor="magic-email" className={labelClass}>
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

/**
 * Who is already in the room.
 *
 * A line-up along the horizon rather than one mascot posed beside the words,
 * because the thing this product is actually selling is that there are people
 * in there. `z` is depth, nought to one, and everything else derives from it in
 * CSS: the near ones are bigger, brighter and lower in the frame, the far ones
 * are small, hazy and up near the line.
 *
 * Fixed per mode rather than picked at random. A line-up chosen on the client
 * would not match the one the server drew, and one chosen per request turns a
 * door that should feel like the same door every time into a slot machine.
 *
 * Sign-up gets the crowd, sign-in gets three: arriving somewhere you already
 * belong is a quieter event than walking in for the first time, and the two
 * pages should not be the same picture.
 */
interface Figure {
  /** `<avatar>-<angle>`, naming a real render in `public/xo/shots`. */
  shot: string
  /** Across the band. A percentage, so the row reflows with the viewport. */
  x: string
  /** Depth, 0 far to 1 near. */
  z: number
}

const CROWD: Record<'signin' | 'signup', Figure[]> = {
  signin: [
    { shot: 'deer-side', x: '9%', z: 0.25 },
    { shot: 'penguin-three', x: '30%', z: 0.85 },
    { shot: 'chick-front', x: '58%', z: 0.45 },
  ],
  signup: [
    { shot: 'deer-side', x: '5%', z: 0.2 },
    { shot: 'panda-three', x: '19%', z: 0.55 },
    { shot: 'fox-front', x: '35%', z: 1 },
    { shot: 'bunny-three', x: '51%', z: 0.4 },
    { shot: 'penguin-side', x: '62%', z: 0.7 },
  ],
}

function Crowd({ mode }: { mode: 'signin' | 'signup' }) {
  // Nearest first, so the figure that carries the composition arrives before
  // the ones behind it - a crowd that assembles back to front reads as a list
  // being populated rather than as people walking up.
  const figures = [...CROWD[mode]].sort((a, b) => b.z - a.z)

  return (
    <div className="auth-crowd" aria-hidden>
      {/* The ground is its own layer so the fade at the far end can be a mask
          without taking the figures with it - see `.auth-ground`. */}
      <span className="auth-ground">
        <span className="neon-floor" />
        <span className="neon-horizon" />
      </span>
      {figures.map((figure, order) => (
        <Image
          key={figure.shot}
          src={`/xo/shots/${figure.shot}.webp`}
          alt=""
          width={512}
          height={512}
          priority={order === 0}
          className="auth-peep"
          style={
            {
              '--x': figure.x,
              '--z': figure.z,
              '--i': order,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

export function AuthForm({
  mode,
  errorCode,
  registrationOpen = true,
  invite = null,
  code = null,
  src = null,
  offers = [],
  locale = 'en',
}: {
  mode: 'signin' | 'signup'
  errorCode?: string
  /** Only meaningful on the sign-up page; sign-in is never gated. */
  registrationOpen?: boolean
  invite?: string | null
  /**
   * A promo code this visitor arrived holding, from `?code=`, from the cookie
   * /code/[code] set, or - failing both - the best of the published offers,
   * which the page applies before rendering so it survives having no
   * JavaScript. Prefills the field; never applied without being shown.
   */
  code?: string | null
  /** The `?src=` campaign tag, carried into the redemption for attribution. */
  src?: string | null
  /** The live `SIGNUP…` codes. Sign-up only; empty everywhere else. */
  offers?: SignupOffer[]
  locale?: Locale
}) {
  const dict = authDict(locale)
  const position = stance(locale)
  const [method, setMethod] = useState<'password' | 'magic'>('password')
  const [keep, setKeep] = useState(true)
  /**
   * The code, owned here rather than by the field.
   *
   * Four things read it - the field, the offer strip, the Google button and the
   * magic-link form - and three of them are outside the form the field lives
   * in. One owner is what makes them agree.
   */
  const [codeValue, setCodeValue] = useState(code ?? '')
  const linkError = errorCode
    ? dict.linkErrors[errorCode as keyof typeof dict.linkErrors]
    : undefined

  // Three states, not two: an invited visitor on a closed installation should
  // be told their link is doing something, or the "by invitation only" notice
  // reads as a refusal aimed at them.
  const gated = mode === 'signup' && !registrationOpen
  const showOffers = mode === 'signup' && offers.length > 0

  return (
    <main className="auth-page" data-mode={mode}>
      <header className="auth-bar">
        {/* The mark doubles as the way back out - this page has no header of
            its own to carry a home link. */}
        <Link href={localePath(locale, '/')} className="auth-mark">
          <Logo />
          <span className="font-pixel text-xs tracking-widest text-ink-muted uppercase">
            team
          </span>
        </Link>

        {/* The other door, at the top rather than at the foot of a long form.
            Somebody who is on the wrong one of these two pages knows it before
            they start typing, not after. */}
        <p className="text-sm text-ink-muted">
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
      </header>

      {/*
        The stance, not the form's name.

        This is the landing page's headline, and it is here for the person who
        arrived on a link and has never seen the landing page: the door should
        say what the place is before it asks for an email address. The form
        keeps its own heading down in the column, where it belongs - it names
        the fields, not the page.

        Set exactly as the hero sets it, from the same two strings: the second
        clause is `inline-block` so the line breaks on the divider rather than
        stranding "PLAY." on its own, and it is the one word on the surface
        that glows. Never bold, never tracked negative - the pixel face ships
        one weight and its letterforms are drawn around one-pixel gaps.
      */}
      <section className="auth-stage">
        <h1 className="auth-title">
          {position.lead}{' '}
          <span className="ignite neon-breathe inline-block text-accent">
            {position.accent}
          </span>
        </h1>
        <p className="auth-lede">
          {mode === 'signin' ? dict.blurbSignIn : dict.blurbSignUp}
        </p>
        <Crowd mode={mode} />
      </section>

      <section className="auth-column">
        <div className="space-y-5">
          {/* The form's own name. Small, and in the display face because it is
              the one label on this surface that says which of the two doors
              you are standing at. */}
          <h2 className="auth-form-title">
            {mode === 'signin' ? dict.signInTitle : dict.signUpTitle}
          </h2>

          {gated && (
            <div className="rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-sm">
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
            <p role="alert" className="rounded-lg border border-line px-3 py-2 text-sm">
              {linkError}
            </p>
          )}

          {showOffers && (
            <Offers
              offers={offers}
              applied={normaliseCode(codeValue)}
              onTake={setCodeValue}
              dict={dict}
              locale={locale}
            />
          )}

          <SocialButtons
            invite={invite}
            code={codeValue || null}
            keep={keep}
            dict={dict}
          />

          <div role="tablist" aria-label={dict.methodLabel} className="auth-methods">
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
              code={codeValue}
              onCode={setCodeValue}
              src={src}
              keep={keep}
              dict={dict}
              locale={locale}
            />
          ) : (
            <MagicLinkForm
              invite={invite}
              code={codeValue}
              keep={keep}
              dict={dict}
              locale={locale}
            />
          )}

          <KeepSignedIn checked={keep} onChange={setKeep} dict={dict} />

          {method === 'magic' && (
            <p className="text-xs text-ink-muted">
              {gated ? dict.magicNoteGated : dict.magicNoteOpen}
            </p>
          )}

          {mode === 'signup' && <TermsNotice locale={locale} dict={dict} />}
        </div>
      </section>
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
      className="auth-method"
    >
      {label}
    </button>
  )
}
