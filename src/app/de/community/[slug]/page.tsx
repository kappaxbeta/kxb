import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  CHAPTERS,
  COMMUNITY_DE,
  COUNTRIES,
  countryBySlug,
  DEPLOY_SLUG,
  MAKING,
  pick,
  STARTER_SLUG,
} from '@kxb/community'
import { CommunityCountryHub, CommunityDoc, resolveDoc } from '@/app/community/handbook'

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

export async function generateMetadata({ params }: PageProps<'/de/community/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const country = countryBySlug(slug)
  if (country?.guide) {
    const { doc } = pick(country.guide, 'de')
    const name = COMMUNITY_DE.countryNames[slug] ?? country.name
    return {
      title: `${name} - Gründungs-Guides & offizielle Quellen`,
      description: doc.standfirst,
      alternates: {
        canonical: `/de/community/${slug}`,
        languages: { en: `/community/${slug}`, de: `/de/community/${slug}` },
      },
    }
  }
  const text = resolveDoc(slug)
  if (!text) notFound()
  const { doc } = pick(text, 'de')
  return {
    title: doc.title,
    description: doc.standfirst,
    alternates: {
      canonical: `/de/community/${slug}`,
      languages: { en: `/community/${slug}`, de: `/de/community/${slug}` },
    },
  }
}

export default async function CommunitySlugPageDe({ params }: PageProps<'/de/community/[slug]'>) {
  const { slug } = await params
  if (countryBySlug(slug)?.guide) return <CommunityCountryHub lang="de" slug={slug} />
  return <CommunityDoc lang="de" slug={slug} />
}
