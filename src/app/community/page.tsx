import type { Metadata } from 'next'
import { COMMUNITY_EN } from '@kxb/community'
import { CommunityIndex } from '@/app/community/handbook'

export const metadata: Metadata = {
  title: COMMUNITY_EN.meta.title,
  description: COMMUNITY_EN.meta.description,
  alternates: { canonical: '/community', languages: { en: '/community', de: '/de/community' } },
}

export default function CommunityPage() {
  return <CommunityIndex lang="en" />
}
