import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
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
    ...COUNTRIES.filter((country) => country.guide).map((country) => ({ slug: country.slug })),
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
  if (countryBySlug(slug)?.guide) return <CommunityCountryHub lang="en" slug={slug} />
  return <CommunityDoc lang="en" slug={slug} />
}
