import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import {
  CHAPTERS,
  COUNTRIES,
  countryBySlug,
  DEPLOY_SLUG,
  MAKING,
  pick,
  STARTER_SLUG,
} from '@kxb/community'
import { CommunityCountryHub, CommunityDoc, resolveDoc } from '@/app/community/handbook'

/**
 * One segment, two kinds of page. A chapter slug (or the starter guide) is a
 * document; a country code is that country's hub, with the guide itself one
 * segment deeper under its readable title - see [doc]/page.tsx. Static both
 * ways, because every word comes out of the package at build time.
 */
export function generateStaticParams() {
  return [
    { slug: STARTER_SLUG },
    { slug: DEPLOY_SLUG },
    ...CHAPTERS.map((chapter) => ({ slug: chapter.slug })),
    ...MAKING.map((entry) => ({ slug: entry.slug })),
    // Every country on the roster, not only the written ones.
    //
    // `dynamicParams = false` below means this list *is* the set of URLs that
    // exist: a slug missing from it is refused at the routing layer, before
    // `generateMetadata` or the component are called. So a country with no
    // guide yet has to be here for the page to be able to redirect it to the
    // index - leaving it out is what made that redirect inert, and the 404s
    // for /community/al and the rest are exactly this.
    ...COUNTRIES.map((country) => ({ slug: country.slug })),
  ]
}

export const dynamicParams = false

export async function generateMetadata({ params }: PageProps<'/community/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const country = countryBySlug(slug)
  if (country?.guide) {
    const { doc } = pick(country.guide, 'en')
    return {
      title: `${country.name} - business guides & official resources`,
      description: doc.standfirst,
      alternates: {
        canonical: `/community/${slug}`,
        languages: { en: `/community/${slug}`, de: `/de/community/${slug}` },
      },
    }
  }
  // A roster country with no guide yet is not a 404 - the page redirects it to
  // the index. This has to agree, because `generateMetadata` runs first and a
  // `notFound()` here settles the request before the component is ever called.
  // That is exactly how the redirect below shipped inert.
  if (country) return {}

  const text = resolveDoc(slug)
  if (!text) notFound()
  const { doc } = pick(text, 'en')
  return {
    title: doc.title,
    description: doc.standfirst,
    alternates: {
      canonical: `/community/${slug}`,
      languages: { en: `/community/${slug}`, de: `/de/community/${slug}` },
    },
  }
}

export default async function CommunitySlugPage({ params }: PageProps<'/community/[slug]'>) {
  const { slug } = await params
  const country = countryBySlug(slug)
  if (country?.guide) return <CommunityCountryHub lang="en" slug={slug} />

  /*
    A country on the roster whose guide nobody has written yet goes back to the
    index rather than 404ing.

    These URLs get real traffic - /community/br, /hu, /pl, /ae, /fi all showed
    up in the error log - even though the index renders planned countries as
    plain text rather than links. People type them, and crawlers guess them
    from the ones that do exist. A 404 is the wrong answer to a guess that was
    reasonable: Brazil is on the roster, it is simply not written, and the page
    that says which countries *are* written is the index.

    A permanent redirect would be wrong in the other direction - the day the
    Brazilian guide lands, this URL becomes a real page, and browsers that
    cached a 308 would never see it. So: temporary, on purpose.

    A slug that is not a country at all still 404s, which is correct. That is
    a URL we never had.
  */
  if (country) redirect('/community')

  return <CommunityDoc lang="en" slug={slug} />
}
