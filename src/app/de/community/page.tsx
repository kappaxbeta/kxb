import type { Metadata } from 'next'
import { COMMUNITY_DE } from '@kxb/community'
import { CommunityIndex } from '@/app/community/handbook'

export const metadata: Metadata = {
  title: COMMUNITY_DE.meta.title,
  description: COMMUNITY_DE.meta.description,
  alternates: { canonical: '/de/community', languages: { en: '/community', de: '/de/community' } },
}

export default function CommunityPageDe() {
  return <CommunityIndex lang="de" />
}
