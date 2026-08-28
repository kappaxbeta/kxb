import { notFound } from 'next/navigation'
import { ShotStudio } from './shot-studio'

/**
 * The render studio: the scenes the landing page shows, drawn live so they can
 * be shot to PNG.
 *
 * Not part of the product. It is a tool that happens to live in the app because
 * that is where the models, the emote sheet and the light rig already are -
 * building the shots anywhere else would mean a second copy of all three, and a
 * second copy is a thing that drifts.
 *
 * `notFound()` in production rather than a route guard: there is nothing here
 * worth authenticating, there is just no reason for it to exist on a deployed
 * site.
 */
export default async function ShotsPage({
  searchParams,
}: {
  searchParams: Promise<{ scene?: string; shoot?: string }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()

  // Read here rather than in the client: which scene to draw is known before
  // the page is sent, so the studio can render it on the first pass instead of
  // mounting one scene and swapping to another once an effect has looked at the
  // URL.
  const { scene, shoot } = await searchParams
  return <ShotStudio scene={scene} shoot={shoot === '1'} />
}
