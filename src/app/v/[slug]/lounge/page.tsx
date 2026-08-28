import { redirect } from 'next/navigation'

export default async function ShowcaseLoungePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/v/${slug}`)
}
