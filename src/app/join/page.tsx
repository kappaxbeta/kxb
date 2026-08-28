import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { JoinForm } from '@/app/join/join-form'
import { readLocale } from '@/app/i18n/preference'
import { spacesDict } from '@/app/i18n/spaces'
import { guestPathFromPastedLink } from '@/domain/guests/application'
import { env } from '@/lib/env'

/**
 * The tab, in the reader's own language.
 *
 * `generateMetadata` rather than a static export, because the title is now one
 * of two - and a static one would have left a German page announcing itself in
 * English to the window that holds it.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: spacesDict(await readLocale()).join.metaTitle,
    // The same reasoning as the door itself: a page whose job is to accept an
    // invitation has no business in an index.
    robots: { index: false, follow: false },
  }
}

export const dynamic = 'force-dynamic'

/**
 * The other end of a code somebody read out.
 *
 * A guest link is 43 characters of base64url, which is right for a URL and
 * wrong for every other way people actually invite each other - across a table,
 * over voice, into a phone somebody is holding. `/join` is where the spoken
 * form is typed.
 *
 * A page rather than a field tucked into the landing page, because the person
 * arriving here was *told* to come here: "go to kxb.team/join and type ABC234"
 * is one instruction somebody can follow while holding a drink, and it is the
 * sentence the match card now prints.
 *
 * `?c=` is honoured so the QR and the code can be the same door - a phone that
 * scanned it lands here with the field filled in, and a person who typed it
 * gets the same page. Nothing is looked up here: resolution is the action's, so
 * that a wrong code is a message on this page rather than a 404 somebody has to
 * back out of.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const { c } = await searchParams

  /*
   * A full link pasted into the box, rather than a code.
   *
   * Somebody who has both will paste the thing already on their clipboard, and
   * sending them back to type six characters they can see would be the app
   * being pedantic about its own two formats.
   */
  if (c) {
    /*
     * Confined to a guest door on this origin - see `guestPathFromPastedLink`
     * for why the obvious "if it looks like a URL, go there" was an open
     * redirect. Anything it refuses falls through to the form as a code, where
     * the action turns it away with the same sentence as any wrong code.
     */
    const door = guestPathFromPastedLink(c, env.appUrl())
    if (door) redirect(door)
  }

  const locale = await readLocale()
  const t = spacesDict(locale).join

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      <h1 className="font-pixel text-2xl uppercase leading-tight">{t.title}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t.body}</p>

      <JoinForm initial={c ?? ''} locale={locale} />
    </main>
  )
}
