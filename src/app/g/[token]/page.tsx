import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Logo from '@/app/components/logo'
import { GuestDoor } from '@/app/g/[token]/door-form'
import { guestArrival, linkProblem } from '@/domain/guests/application'
import { readProfileSkin } from '@/domain/skins/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getUser } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * What a pasted link looks like before anybody clicks it.
 *
 * This URL's whole life is being sent to somebody - in a chat, a DM, a group -
 * and every one of those unfurls it. Left to the app's default title it
 * unfurled as the product name, which tells the person receiving it nothing
 * about why it was sent: the sentence that gets a link opened is "you have been
 * invited", the name of the place, and that it costs nothing.
 *
 * The space's *name* is in it and that is a deliberate, small disclosure. The
 * name is what makes the invitation legible - "join Acme" rather than "join a
 * space" - and anybody rendering this preview is holding the token already.
 *
 * `noindex` matters more than the words. A token in a URL that a crawler files
 * away is an invitation anybody can find, and links get pasted into places that
 * fetch and index them.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params

  const admin = createAdminClient()
  const { data: link } = await admin
    .from('guest_links')
    .select('tenant_id')
    .eq('token', token)
    .maybeSingle()

  const { data: tenant } = link
    ? await admin
        .from('tenants_read_model')
        .select('name')
        .eq('id', link.tenant_id)
        .maybeSingle()
    : { data: null }

  // A dead or invented token gets the generic line rather than a 404 in the
  // preview: the page itself already explains what happened, and the unfurl
  // should not be where somebody learns which guesses were real.
  const title = tenant?.name
    ? `You got invited to join ${tenant.name}`
    : 'You got invited to join'

  const description = 'Click to join. No account needed.'

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

/**
 * The door.
 *
 * Deliberately the smallest page in the app. Somebody arriving here has been
 * sent a link by a person they know, and the only thing standing between them
 * and the room is one field asking what to call them - no account, no email, no
 * explanation of what a workspace is.
 *
 * The link is checked twice: once here so a dead link is a page rather than a
 * form that fails on submit, and once again in `enterAsGuest`, which is the
 * check that counts. This one is politeness; that one is the boundary. They can
 * disagree - a link can be spent in the seconds between them - and the honest
 * place to lose that race is on submit, where there is somewhere to show it.
 */
export default async function GuestDoorPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Service role, because the visitor has no session and `guest_links` is
  // admin-only. All that is read is the space's name and whether the link is
  // alive - nothing about the space's contents reaches this page.
  const admin = createAdminClient()

  const { data: link } = await admin
    .from('guest_links')
    .select('tenant_id, max_uses, uses, expires_at, revoked_at, destination')
    .eq('token', token)
    .maybeSingle()

  // A token that never existed and a token that has been used up are the same
  // page on purpose - the refusal text is shared for the reason `linkProblem`
  // gives, and a distinct 404 would leak which guesses were real.
  const linkFault = link
    ? linkProblem({
        maxUses: link.max_uses,
        uses: link.uses,
        expiresAt: link.expires_at,
        revokedAt: link.revoked_at,
      })
    : 'That link is not valid any more. Ask whoever sent it for a new one.'

  /**
   * An event whose doors have shut.
   *
   * Only asked when the link itself is fine, because the two refusals want
   * different words and the link's problem is the more specific one - a
   * revoked link during a running event is a revoked link, not an ended event.
   *
   * It gets its own heading rather than being folded into `linkFault`, which
   * is the whole point of asking separately. "This link has expired" is what
   * the page says to a dead token, and it is the wrong sentence here twice
   * over: nothing expired, and it sends somebody hunting for a newer link that
   * was never going to exist.
   */
  const eventEnded =
    link && !linkFault
      ? (await admin.rpc('event_open', { p_tenant_id: link.tenant_id })).data === false
      : false

  const problem = linkFault ?? (eventEnded ? 'The room is still standing, and everything built in it is still there. New visitors just cannot be let in any more.' : null)

  const heading = eventEnded ? 'This event has ended' : 'This link has expired'

  /**
   * What this particular door actually opens onto.
   *
   * An ordinary space's guest may look, emote and fight, and that is what the
   * copy said for everybody - which is right for a guest link into somebody's
   * workspace and wrong for every event that sold building. The terms are
   * already in `event_spaces`; this reads them.
   *
   * Only the ceiling is consulted, not the host's switches. The door is read
   * once, before anybody is inside, and a promise that flickered as a host
   * toggled something during the day would be worse than one that describes
   * what the event is for.
   */
  const promise = link ? await doorPromise(admin, link.tenant_id) : ''

  const { data: tenant } = link
    ? await admin
        .from('tenants_read_model')
        .select('name, slug')
        .eq('id', link.tenant_id)
        .maybeSingle()
    : { data: null }

  if (!tenant && !problem) notFound()

  /**
   * Somebody who is already signed in.
   *
   * Two different people arrive holding a session, and until now both got the
   * stranger's door: a form asking them to pick a name and an animal, which
   * then signed them out into a fresh anonymous account. For a member of the
   * space being invited that is absurd twice over - they have a name here
   * already, and walking through it *replaced* their own account with a guest
   * pass to their own room.
   *
   * A member is sent straight in as themselves. No form, no guest row, and no
   * use spent off the link - they were never the person it was minted for.
   *
   * Everybody else keeps their account and comes in as a guest, which is what
   * the door below now says out loud. `enterAsGuest` does the same two things
   * again on submit; this is only so the right page is drawn.
   */
  const viewer = link && tenant && !problem ? await getUser().catch(() => null) : null

  const role =
    viewer && !viewer.is_anonymous
      ? await (async () => {
          const supabase = await createClient()
          const { data } = await supabase.rpc('tenant_role', {
            p_tenant_id: link!.tenant_id,
          })
          return data ?? null
        })()
      : null

  // 'guest' counts as already inside: they followed a link before, and being
  // handed a second one should put them back in the room rather than through
  // the door again.
  if (role) redirect(guestArrival(link!.destination, tenant!.slug))

  /**
   * The xp body that will be standing on the pad beside the animal.
   *
   * The same rule `readLookFor` writes down for the rooms themselves, asked
   * one page earlier so the door shows it rather than announcing it: nobody at
   * all is the dummy, and somebody holding an account gets the skin they
   * chose. A visitor here is a visitor *here* - it says nothing about who they
   * are everywhere else, and their body should not stop at somebody else's
   * door.
   *
   * Read as the viewer rather than through the service role: `profile_skins`
   * is theirs, and this page has no business reading anybody else's.
   */
  const skin =
    viewer && !viewer.is_anonymous
      ? await readProfileSkin(await createClient(), viewer.id)
      : null

  return (
    /**
     * The room the door stands in.
     *
     * The lobby's shell, verbatim: the neon floor running to a lit horizon,
     * behind everything, at the house hue. It is what turns a page into a
     * place, and it is the single cheapest thing this page could do to stop
     * looking like a login form for a product about standing in a room.
     *
     * `consent-clear` stays where it was - the cookie banner needs the same
     * clearance it always did.
     */
    <div className="consent-clear relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 [--box-hue:285]">
        <div className="neon-horizon" style={{ '--box-horizon': '30%' } as React.CSSProperties} />
        <div className="neon-floor !h-[45%]" />
      </div>

      {/* The mark, and nothing else.
       *
       * Whose door this is, said once, because most people reading it have
       * never heard of the product and are about to type their name into it.
       * Not a link: the one thing this page is for is walking through it, and
       * a way out in the top-left corner of a door is a way out taken.
       */}
      <header className="relative z-10 flex items-center gap-3 px-4 py-4 sm:px-8">
        <span className="inline-flex items-center gap-3 text-sm text-ink-muted">
          <Logo />
          <span className="font-pixel uppercase tracking-widest">team</span>
        </span>
      </header>

      {problem ? (
        <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-10 sm:px-8">
          <div className="hud-panel w-full max-w-sm space-y-3 p-8 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-raised text-2xl">
              🔒
            </div>
            <h1 className="font-pixel text-xl uppercase leading-tight text-ink">{heading}</h1>
            <p className="text-sm leading-relaxed text-ink-muted">{problem}</p>
          </div>
        </div>
      ) : (
        <GuestDoor
          token={token}
          spaceName={tenant!.name}
          promise={promise}
          // Null for a stranger, which is who this door is mostly for. An
          // address - or the empty string, for an account without one - is
          // what puts the "you stay signed in" notice on the panel.
          signedInAs={viewer && !viewer.is_anonymous ? (viewer.email ?? '') : null}
          skin={skin}
        />
      )}
    </div>
  )
}

/**
 * One sentence describing what a visitor may do here.
 *
 * Built from the event's `guest_writes` rather than hardcoded, and worded as
 * capabilities rather than as a list of nouns, because the reader is about to
 * walk into a 3D room and "board_post" means nothing to them.
 *
 * Falls back to the pre-events sentence for an ordinary space, which is what
 * every guest link that is not an event still is.
 */
async function doorPromise(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
): Promise<string> {
  const { data } = await admin
    .from('event_spaces')
    .select('guest_writes')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const writes = (data?.guest_writes ?? null) as string[] | null

  // Not an event: the rule guest links have always had.
  if (!writes) {
    return 'You can look around, use emotes and join a match. You won\u2019t be able to build or change anything.'
  }

  const can: string[] = ['look around and use emotes']
  if (writes.includes('build')) can.push('build')
  if (writes.includes('rooms')) can.push('open rooms')
  if (writes.includes('board')) can.push('post on the board')
  if (writes.includes('tasks')) can.push('write tasks')
  if (writes.includes('battle')) can.push('take part in matches')
  if (writes.includes('chat')) can.push('chat')

  // "a, b and c" - an Oxford-less list, because it is one sentence on a door
  // rather than a specification.
  const last = can.pop()!
  const list = can.length > 0 ? `${can.join(', ')} and ${last}` : last

  return `You can ${list}.`
}
