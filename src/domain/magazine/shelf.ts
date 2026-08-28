import 'server-only'
import { listMagazine, type MagazineEntry } from '@/domain/magazine/queries'
import {
  listBuiltinXps,
  listPlayableXps,
  versionFor,
  type PlayableXp,
  type SummaryRow,
} from '@/domain/xps/playable'
import { parseXpRef } from '@/domain/xps/ref'
import type { Client } from '@/es/store'
import type { HostCapability } from '@kxb/xp/host'

/**
 * The shelf and everything else, as one list in two halves.
 *
 * ---------------------------------------------------------------------------
 * Why the picker cannot just read the read model
 * ---------------------------------------------------------------------------
 * `magazine_read_model` answers "what did this space take in" and nothing else -
 * a reference and the name it had at the time, deliberately, so a list needs no
 * join. A picker needs more than a list: what the level is, how many it is for,
 * whether a draft stands behind it. That is `listPlayableXps`, and it answers a
 * different question - "what may this space play at all".
 *
 * So this joins them, and the join is the whole module. Two halves out of one
 * call, because the surface draws them as one list with a line through it and
 * splitting it twice in two mounts is how the two halves drift apart.
 *
 * ---------------------------------------------------------------------------
 * Matched on identity, not on the reference
 * ---------------------------------------------------------------------------
 * A project reference carries its version - `p-<uuid>-v3` - so the reference a
 * space shelved on Tuesday is not the reference it would play on Thursday, once
 * somebody has saved the project again. Matching the two lists on the string
 * would show a shelf full of levels that had all just vanished.
 *
 * So the match is on *identity*: the builtin's filename, or the project's id
 * with the version dropped. A row then carries both - `ref` is what a place
 * should be given, and `shelvedAs` is what the magazine actually holds and what
 * putting it back has to name. They differ exactly when somebody saved.
 *
 * That is also what keeps the catalogue half honest: it drops anything whose
 * identity is on the shelf, so a project saved since it was taken in does not
 * appear in both halves and get taken in a second time under its new version.
 */

export interface ShelfRow {
  /**
   * What a place should be given.
   *
   * The *resolved* reference - the version this space would play now - rather
   * than the one on the shelf. `pinXp` refuses anything not in the playable
   * list, so a row that offered its shelved reference would be a button that
   * fails for everybody who saved since.
   */
  ref: string
  name: string
  blurb: string | null
  /** The summary, or null for a shelf entry nothing playable answers to. */
  xp: PlayableXp | null
  /**
   * What the document refuses to open without.
   *
   * Builtins only, and empty for everything else - it is read off the file, and
   * the summary a project gets is two JSON paths that do not include it. See
   * `OFFERED_IN_A_ROOM` for what this is checked against and why it matters
   * before somebody presses rather than after.
   */
  needs: HostCapability[]
  /**
   * The reference the magazine holds, or null for something not on the shelf.
   *
   * Doubles as "is this on the shelf", which is why it is null rather than
   * equal to `ref` for a catalogue row.
   */
  shelvedAs: string | null
  /**
   * The shelf is holding an older version than this space may now play.
   *
   * Null when it is current, when it is a builtin (a file we ship has no
   * versions to be behind), and when the entry names something gone.
   *
   * The shelf has always *resolved* to the newest - `ref` above is what a place
   * is given, so putting one out already used the new version - and said
   * nothing about it. That silence was the bug: a member could take a level in
   * on Tuesday, see the same row on Thursday, and have no way of knowing the
   * author had shipped a new one. The entry itself still holds the old
   * reference, which is what `restockXp` swaps.
   *
   * Deliberately *not* resolved by re-writing the row during a read. A read
   * that wrote would fire on every visitor loading the page, and the shelf is
   * shared - so the log would fill with restocks nobody performed. See
   * `findRoomUpdate`, which reaches the same conclusion for a room and for the
   * same reason.
   */
  update: { from: number; to: number } | null
}

export interface Shelf {
  /** On the shelf, newest first - the order `listMagazine` returns. */
  inMagazine: ShelfRow[]
  /** Everything else this space could take in. */
  catalogue: ShelfRow[]
  /** Projects the picker's cap left out, passed through from `listPlayableXps`. */
  hidden: number
  /**
   * The shelf takes new versions without asking.
   *
   * A property of the *space*, so two members never disagree about whether a
   * level is current. Absent row means off - see the migration.
   */
  follow: boolean
}

/**
 * A reference with the version taken off.
 *
 * Not exported as a general utility on purpose. "The same XP, whichever version"
 * is a question about a *collection* - it is the magazine's question, and a
 * place deliberately asks the other one, because a room plays one version and
 * knowing which is the point.
 */
function identityOf(reference: string): string | null {
  const parsed = parseXpRef(reference)
  if (!parsed) return null
  return parsed.kind === 'builtin' ? `b:${parsed.id}` : `p:${parsed.xpId}`
}

/**
 * The join, without the two queries in front of it.
 *
 * Pure, and its own function for the reason `versionFor` is: this is the part
 * with decisions in it - what a shelf entry resolves to, what the name falls
 * back to, which half a row lands in - and the rest is I/O.
 */
export function splitShelf(
  entries: MagazineEntry[],
  playable: PlayableXp[],
  needs: Map<string, HostCapability[]>,
): { inMagazine: ShelfRow[]; catalogue: ShelfRow[] } {
  const byIdentity = new Map<string, PlayableXp>()
  for (const xp of playable) {
    const identity = identityOf(xp.ref)
    // First wins. `listPlayableXps` has already deduplicated on project id, so
    // this only ever fires for a list that surprised us, and keeping the first
    // keeps its own ordering meaningful.
    if (identity && !byIdentity.has(identity)) byIdentity.set(identity, xp)
  }

  const taken = new Set<string>()
  const inMagazine: ShelfRow[] = []

  for (const entry of entries) {
    const identity = identityOf(entry.xpRef)
    const found = identity ? byIdentity.get(identity) : undefined
    if (identity) taken.add(identity)

    inMagazine.push({
      // The resolved reference where there is one, and the shelved one where
      // there is not - so a row that cannot be played still has something to
      // key on and something to put back.
      ref: found?.ref ?? entry.xpRef,
      /*
       * The live name where the XP still exists, and the shelved one where it
       * does not.
       *
       * This is what the denormalised column is *for*. A project renamed since
       * it was taken in should read as its new name, because that is what its
       * author calls it - but a project that is gone has no new name, and the
       * old one is the only word anybody has for the thing they are looking at.
       */
      name: found?.name ?? entry.name,
      blurb: found?.blurb ?? null,
      xp: found ?? null,
      needs: found ? (needs.get(found.ref) ?? []) : [],
      shelvedAs: entry.xpRef,
      update: found ? behindBy(entry.xpRef, found.ref) : null,
    })
  }

  const catalogue: ShelfRow[] = []
  for (const xp of playable) {
    const identity = identityOf(xp.ref)
    if (identity && taken.has(identity)) continue

    catalogue.push({
      ref: xp.ref,
      name: xp.name,
      blurb: xp.blurb,
      xp,
      needs: needs.get(xp.ref) ?? [],
      shelvedAs: null,
      // Nothing to be behind. A catalogue row is whatever this space may play
      // right now, by construction.
      update: null,
    })
  }

  return { inMagazine, catalogue }
}

/**
 * How far the shelved reference is behind the playable one, or null.
 *
 * Only ever forward, and only between two versions of the same project. A shelf
 * holding v4 while the space may only play v3 - the level was withdrawn, or a
 * release rolled back - is not something to offer an "update" for, which is the
 * rule `findRoomUpdate` already states for a room and the one this has to
 * match. Answering "you are ahead" would put a button on the row that walked
 * somebody backwards without being asked.
 */
function behindBy(shelved: string, playable: string): { from: number; to: number } | null {
  const here = parseXpRef(shelved)
  const there = parseXpRef(playable)

  if (!here || !there) return null
  if (here.kind !== 'project' || there.kind !== 'project') return null
  if (here.xpId !== there.xpId) return null
  if (there.version <= here.version) return null

  return { from: here.version, to: there.version }
}

/**
 * One reference, resolved: may this space shelve it, and what is it called?
 *
 * ---------------------------------------------------------------------------
 * Why not `listPlayableXps`, which answers the same question
 * ---------------------------------------------------------------------------
 * Because it answers it for a *list*, and a list has a cap. `PICKER_LIMIT`
 * keeps the picker to twenty-four projects, which is right for something
 * somebody scans in one look and wrong as an authorisation rule: a space with
 * thirty projects would be told its own twenty-fifth is "not an XP this space
 * can take in", from a button on that project's own page.
 *
 * And not `playableExists` either, which has no cap and is the authority on
 * this question everywhere else. It parses the document to answer, and a
 * document is up to 128MB of level - too much to read to write a reference and
 * a name into a row.
 *
 * So: one query, and the version rule comes from `versionFor` rather than from
 * a second opinion about it. That is the part that must not drift - it is what
 * decides that a space plays its own project at whatever it has saved and
 * everybody else's at exactly what they published.
 */
export async function resolveForMagazine(
  supabase: Client,
  tenantId: string,
  reference: string,
): Promise<{ ref: string; name: string } | null> {
  const parsed = parseXpRef(reference)
  if (!parsed) return null

  if (parsed.kind === 'builtin') {
    // The eight files, read and parsed. A builtin that no longer parses is not
    // listed and so cannot be shelved, which is the rule everywhere else too.
    const found = (await listBuiltinXps()).find((builtin) => builtin.ref === reference)
    return found ? { ref: found.ref, name: found.name } : null
  }

  const { data } = await supabase
    .from('xps_read_model')
    .select('id, tenant_id, name, blurb, state, current_version, published_version, copied_from, updated_at')
    .eq('id', parsed.xpId)
    .maybeSingle()

  if (!data) return null

  const row = data as SummaryRow

  /*
   * Archived and removed are out, which `listProjects` says with a `not in` and
   * this has to say on its own.
   *
   * Only for our own: somebody else's is reachable here at all only by being
   * published, and `versionFor` already refuses a published_version that is not
   * the one asked for.
   */
  if (row.tenant_id === tenantId && (row.state === 'archived' || row.state === 'removed')) {
    return null
  }

  return versionFor(row, tenantId) === parsed.version
    ? { ref: reference, name: row.name }
    : null
}

/**
 * What the picker draws, in one call.
 *
 * `listBuiltinXps` a second time - `listPlayableXps` already read those files -
 * and it is a read of eight small documents rather than a query. The
 * alternative is carrying `needs` on `PlayableXp`, which would mean a third
 * JSON path in the summary and a field every other picker ignores; this stays
 * inside the module that wants it.
 */
export async function readShelf(
  supabase: Client,
  tenantId: string,
  /** `xpOpen()`. False empties both halves, which switches the picker off. */
  enabled: boolean,
): Promise<Shelf> {
  if (!enabled) return { inMagazine: [], catalogue: [], hidden: 0, follow: false }

  const [entries, playable, builtins, follow] = await Promise.all([
    listMagazine(supabase, tenantId),
    listPlayableXps(supabase, tenantId, true),
    listBuiltinXps(),
    readShelfFollow(supabase, tenantId),
  ])

  const needs = new Map(builtins.map((builtin) => [builtin.ref, [...builtin.needs]]))

  return { ...splitShelf(entries, playable.xps, needs), hidden: playable.hidden, follow }
}

/**
 * Does this space's shelf follow new versions?
 *
 * False on a missing row and false on an error, and both are the same answer
 * for the same reason: this decides whether levels change under people without
 * being asked, so the direction that fails safe is the one that keeps asking.
 */
export async function readShelfFollow(supabase: Client, tenantId: string): Promise<boolean> {
  const { data } = await supabase
    .from('magazine_settings')
    .select('auto_update')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return data?.auto_update ?? false
}
