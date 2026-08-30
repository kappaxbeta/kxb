import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { COUNTRIES, countryBySlug, guideSlug, pick } from '@kxb/community'
import { CommunityDoc } from '@/app/community/handbook'

export function generateStaticParams() {
  return COUNTRIES.filter((country) => country.guide).map((country) => ({
    slug: country.slug,
    doc: guideSlug(country.guide!),
  }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: PageProps<'/de/community/[slug]/[doc]'>): Promise<Metadata> {
  const { slug, doc: docSlug } = await params
  const country = countryBySlug(slug)
  if (!country?.guide || guideSlug(country.guide) !== docSlug) notFound()
  /* German metadata for a German URL - falls back per document like the page. */
  const { doc } = pick(country.guide, 'de')
  return {
    title: doc.title,
    description: doc.standfirst,
    alternates: {
      canonical: `/de/community/${slug}/${docSlug}`,
      languages: {
        en: `/community/${slug}/${docSlug}`,
        de: `/de/community/${slug}/${docSlug}`,
      },
    },
  }
}

export default async function CommunityCountryDocPageDe({ params }: PageProps<'/de/community/[slug]/[doc]'>) {
  const { slug, doc: docSlug } = await params
  const country = countryBySlug(slug)
  if (!country?.guide || guideSlug(country.guide) !== docSlug) notFound()
  return <CommunityDoc lang="de" slug={slug} />
}
