import Link from 'next/link'
import { Animator } from '@/app/ovaloffice/animator/animator'
import { requireBackofficeSection } from '@/lib/backoffice'

export const metadata = { title: 'Animator' }

/**
 * Where a clip gets animated.
 *
 * The guard runs here and not only in the layout, exactly as every other
 * backoffice page does: a layout does not re-run for a Server Action and can be
 * skipped by a direct request.
 *
 * Nothing below this line touches the database. The whole editor is a working
 * file in the browser that hands back a `.glb` - see the note at the top of
 * `@/domain/animator/clip` for why that is the right shape for it, and the
 * same note in `@/domain/builder/world` for the precedent.
 */
export default async function AnimatorPage() {
  await requireBackofficeSection('animator')

  return (
    <section>
      <header className="mb-4">
        <h2 className="text-lg font-medium">Animator</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pose the prototype dummy by dragging the dots on it, key the pose on the strip, and
          download the whole thing as a <code>.glb</code> with the clip inside. Grab a hand and the
          arm follows it; grab the big dot at the hips and the body moves. Pin a foot before you
          lower the hips and you get a crouch instead of a figure sinking through the floor.
        </p>
      </header>

      <p className="mb-4 text-sm text-muted-foreground">
        Or{' '}
        <Link href="/ovaloffice/animator/capture" className="text-accent underline underline-offset-2">
          do the movement in front of a webcam
        </Link>{' '}
        and key over what comes back.
      </p>

      <p className="mb-4 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground xl:hidden">
        On a phone: one finger drags a dot or turns the camera, and the panel is below the viewport.
        The keyboard shortcuts are the thing you are missing.
      </p>

      <Animator />
    </section>
  )
}
