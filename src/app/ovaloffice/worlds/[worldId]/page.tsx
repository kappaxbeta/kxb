import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LoungeScene } from '@/app/world/lounge/lounge-scene'
import { listLoungeBlocks } from '@/domain/lounge/queries'
import { findReportedWorld } from '@/domain/moderation/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * Walking through a reported world.
 *
 * The whole reason this page exists: an admin about to take an arena off the
 * platform should have stood in it. A one-line complaint and a world's name are
 * not enough to tell a genuine problem from somebody losing a match.
 *
 * Read through the admin client, because the point is to look at a space the
 * admin is not a member of - the ordinary policies would show them nothing, and
 * requiring them to join a workspace in order to moderate it would be a worse
 * answer than reading past RLS deliberately, here, on a page that already
 * demands `requireBackofficeSection('worlds')`.
 *
 * Read-only and unpeopled: no presence channel, no combat, no editing. This is
 * an inspection, not a visit - nobody in the space being moderated should see
 * an admin walk in.
 */
export default async function WorldPreviewPage({
  params,
}: {
  params: Promise<{ worldId: string }>
}) {
  const { worldId } = await params
  const { admin } = await requireBackofficeSection('worlds')

  const world = await findReportedWorld(admin, worldId)
  if (!world) notFound()

  const blocks = await listLoungeBlocks(admin, world.tenantId, worldId)

  return (
    <div className="fixed inset-0 bg-black">
      <LoungeScene
        // The scene wants a slug for its edit actions. It never calls one here
        // - `readOnly` closes every write path - and there is no workspace this
        // page belongs to, so there is no honest slug to give it.
        slug=""
        worldId={worldId}
        worldName={`${world.name} · ${world.spaceName ?? 'unknown space'}`}
        initialBlocks={blocks}
        initialImages={[]}
        readOnly
        canModerate={false}
        mode="creative"
        /*
         * Grounded here too, which is a real trade: flight would survey a big
         * arena faster. But an admin is deciding whether a world is alright for
         * people to be sent into, and the people sent into it will be walking.
         * A view nobody playing can get is the wrong view to judge from.
         */
        canFly={false}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/15 bg-black/75 px-4 py-2 text-xs text-white backdrop-blur-sm">
          <span>
            Reviewing {blocks.length.toLocaleString()} blocks
            {world.banned && <span className="ml-2 text-red-300">· banned</span>}
          </span>
          <Link href="/backoffice/reports" className="underline hover:text-white/80">
            Back to reports
          </Link>
        </div>
      </div>
    </div>
  )
}
