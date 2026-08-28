import { AuthForm } from '@/app/(auth)/auth-form'
import { readLocale } from '@/app/i18n/preference'

/**
 * The unprefixed sign-in page, in whichever language the reader has.
 *
 * `/de/login` still pins German - that URL is a statement, and it carries the
 * `hreflang` pair. This one has no locale in its path, so it takes the same
 * answer the app behind it uses: the saved preference, or the browser's
 * `Accept-Language` for somebody who has never expressed one. Signing out of a
 * German app and landing on an English sign-in page was the case this fixes.
 */

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return <AuthForm mode="signin" errorCode={error} locale={await readLocale()} />
}
