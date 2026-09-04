import Link from 'next/link'
import { Capture } from '@/app/ovaloffice/animator/capture/capture'
import { requireBackofficeSection } from '@/lib/backoffice'

export const metadata = { title: 'Capture' }

/**
 * Animating by doing the movement yourself.
 *
 * Under the animator rather than beside it, and behind the same grant: what
 * comes out of here is one of that editor's documents, and everything you do
 * with it afterwards - fixing the elbow the camera lost, keying the travel it
 * cannot see - happens next door. A capture is a first pass, not a clip.
 *
 * The guard runs here and not only in the layout, exactly as every other
 * backoffice page does: a layout does not re-run for a Server Action and can
 * be skipped by a direct request.
 *
 * Nothing below this line touches the database, and nothing leaves the
 * machine. The camera is read in the browser, the pose model is a file this
 * app serves, and the recording is landmarks in memory until you download it
 * or hand it to the animator. No video is stored anywhere at any point.
 */
export default async function CapturePage() {
  await requireBackofficeSection('animator')

  return (
    <section>
      <header className="mb-4">
        <h2 className="text-lg font-medium">Capture</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Stand where the camera can see all of you, press record, and do the movement. The dummy
          copies you live, and what you get back is an animation document you can open in the{' '}
          <Link href="/ovaloffice/animator" className="text-accent underline underline-offset-2">
            animator
          </Link>{' '}
          and fix by hand. Nothing is uploaded: the video never leaves this machine.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          One camera gives angles, not position — it cannot see you cross the room, and it cannot
          see a wrist roll at all. Arms and legs read well, depth is a guess, and a body turned
          side-on to the lens is the hardest thing you can ask of it.
        </p>
      </header>

      <Capture />
    </section>
  )
}
