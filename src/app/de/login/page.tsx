import { AuthForm } from '@/app/(auth)/auth-form'

export const metadata = {
  alternates: { canonical: '/de/login', languages: { en: '/login', de: '/de/login' } },
}

export default async function LoginPageDe({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return <AuthForm mode="signin" errorCode={error} locale="de" />
}
