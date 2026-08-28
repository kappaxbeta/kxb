'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { setInitialPassword } from '@/app/welcome/actions'
import { useRefusal } from '@/app/i18n/use-refusal'

/**
 * One field, and a way past it.
 *
 * The skip link is not a courtesy - it is what keeps this page off the critical
 * path of accepting an invitation. The account works without a password; this
 * only decides whether getting back in needs a mailbox.
 */
function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-accent px-6 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
    >
      {pending ? 'Saving…' : 'Set password'}
    </button>
  )
}

export function PasswordSetup({ email }: { email: string }) {
  const refusal = useRefusal()
  const [state, formAction] = useActionState(setInitialPassword, null)

  return (
    <div className="enter w-full max-w-lg rounded-2xl border border-line bg-surface-raised/80 p-6 backdrop-blur-md sm:p-8">
      <span className="text-xs tracking-widest text-ink-muted uppercase">
        Invitation accepted
      </span>

      {state && (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs font-medium text-red-500"
        >
          ✕ {refusal(state.error)}
        </div>
      )}

      <h1 className="font-pixel mt-5 text-2xl leading-tight sm:text-3xl">
        Pick a password.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        You&rsquo;re already signed in{email && <> as {email}</>}. Choosing a password
        now means you can sign straight back in later instead of waiting for a link
        in your inbox.
      </p>

      <form action={formAction} className="mt-6 space-y-3">
        {/* Hidden, and there for password managers: without a username field
            beside it they offer to save a password with no account attached. */}
        <input
          type="email"
          name="email"
          value={email}
          readOnly
          autoComplete="username"
          aria-hidden="true"
          tabIndex={-1}
          className="hidden"
        />
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          autoFocus
          aria-label="New password"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <p className="text-xs text-ink-muted">At least 8 characters.</p>
        <SubmitButton />
      </form>

      <p className="mt-4 text-center text-sm">
        <Link href="/welcome" className="text-ink-muted hover:underline">
          Skip — I&rsquo;ll sign in by email link
        </Link>
      </p>
    </div>
  )
}
