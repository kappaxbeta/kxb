import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CHAPTERS, COUNTRIES, pick, STARTER_SLUG } from '@kxb/community'
import { CommunityDoc, resolveDoc } from '@/app/community/handbook'

export function generateStaticParams() {
  return [
    { slug: STARTER_SLUG },
    ...CHAPTERS.map((chapter) => ({ slug: chapter.slug })),
    ...COUNTRIES.filter((country) => country.guide).map((country) => ({ slug: country.slug })),
  ]
}

export const dynamicParams = false

export async function generateMetadata({ params }: PageProps<'/de/community/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const text = resolveDoc(slug)
  if (!text) notFound()
  /* German metadata for a German URL - `pick` falls back to English per
     document, the same way the page body does. */
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

export default async function CommunityDocPageDe({ params }: PageProps<'/de/community/[slug]'>) {
  const { slug } = await params
  return <CommunityDoc lang="de" slug={slug} />
}
