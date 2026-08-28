/**
 * The flag registry.
 *
 * Every flag the code branches on is named here. The database holds the
 * *values*; this holds the keys, so a typo is a compile error rather than a
 * feature that is silently always off.
 *
 * No 'server-only' import: the keys are not secret, and a client component that
 * needs to name a flag should be able to.
 */

export interface FeatureDefinition {
  label: string
  /**
   * The answer when the database cannot supply one - no row for this key, or
   * the resolver threw.
   *
   * Most flags here fall back to `true`, and the direction is chosen per flag
   * rather than by convention. For `billing` the safe failure is to *enforce*:
   * a resolver outage that fell back to `false` would hand the product out for
   * free until someone noticed. For the surfaces it is to *show*: falling back
   * to hidden would make a database blip look like half the app had been
   * deleted. A new flag guarding an unfinished feature should default `false`
   * here, so a failed lookup cannot ship it early.
   */
  fallback: boolean
  /**
   * This flag carries a number as well as a switch.
   *
   * The switch still decides *whether* the rule applies; the number says how
   * much. That ordering is what lets `seat_limit` express "no limit" at all -
   * off means unlimited, and no magic sentinel number has to stand in for it.
   *
   * Only the backoffice reads this, to decide whether to render a number input
   * beside the toggle. The value itself never travels through
   * `resolveFeatures` - see the note there.
   */
  valued?: {
    unit: string
    min: number
    max: number
    /**
     * Which kind of subject an override of this number attaches to.
     *
     * Defaults to `tenant` when absent, because all but one of these cap a
     * space. `free_space_limit` is the exception and says so, and the field
     * exists rather than being inferred at the screen because the database
     * already draws the same line: `tenant_feature_limit()` reads tenant-scope
     * overrides and ignores user ones, `account_feature_limit()` does the
     * reverse. A backoffice offering the wrong scope would be offering a
     * setting the database declines to honour.
     */
    scope?: FeatureScope
  }
}

export const FEATURES = {
  /**
   * Whether this installation takes money and enforces having taken it.
   *
   * Off means: do not charge, do not block a write for want of a subscription,
   * do not draw the upgrade banner. It does **not** mean "this space is on the
   * top tier" - it used to, via `tier: billed ? tier : 'xp'` in `lib/tenant.ts`,
   * and that was a per-account switch rewriting a per-space fact. The account
   * with the override saw `xp`, everybody else in the same space saw the plan
   * they were actually on, and the two disagreed about what a match summoned in
   * that space was. See the note at the assignment.
   *
   * To comp a space, grant it a tier at `/ovaloffice/promos`. That is one row
   * everybody in the space reads, which is what a plan has to be.
   */
  billing: { label: 'Billing', fallback: true },
  pages: { label: 'Pages', fallback: true },
  /**
   * The task list, and the tab that opens it.
   *
   * `false`, and it is the one flag here whose direction is not the argument
   * the others make. Every other `false` guards surface that has not shipped;
   * this guards surface that has, and is being withdrawn - a checklist is not
   * what this product is for, and the pages editor already has task lists in
   * it for anybody who wants one. Off is therefore the intended state rather
   * than the cautious one, and the fallback agrees with it so a resolver
   * outage cannot be what puts the tab back.
   *
   * It gates the tab, the route and the writes, and deliberately not the data:
   * the events stay in the log and the read model stays populated, so turning
   * this back on for one space restores their list exactly as they left it.
   */
  tasks: { label: 'Tasks', fallback: false },
  lounge: { label: 'Lounge', fallback: true },
  cafe: { label: 'Café and world', fallback: true },
  /**
   * `false`, unlike the four above, and for the reason the comment on
   * `fallback` gives: this guards something new rather than describing
   * something already shipped, so a resolver outage must not be what puts
   * animals in everybody's kitchen.
   */
  agents: { label: 'Creatures', fallback: false },
  /**
   * `false` for the same reason as `agents`: battlefields, matches, challenges
   * and tournaments are new surface rather than a description of something
   * already shipped. The lounge's ambient sparring is *not* behind this - that
   * shipped with the lounge and stays under the `lounge` flag.
   */
  battle: { label: 'Battle system', fallback: false },
  /**
   * A text channel in the lounge, beside the emotes.
   *
   * `true`, and it was `false` for as long as chat was new surface. The old
   * argument was that a resolver blip defaulting to `true` would open a
   * durable, attributable, reportable channel in rooms that never asked for
   * one. Chat has shipped since, and every space now arrives with one, so the
   * same argument runs the other way: falling back to off would take the Chat
   * tab out of rooms that are talking in it and make a database blip look like
   * we had deleted the conversation. The messages are still there either way -
   * that is what makes off the more surprising of the two failures now.
   *
   * Not sufficient on its own, which is unusual here and deliberate. Every other
   * flag in this registry is the whole answer; this one only makes chat
   * *available*, and a space can still switch it off in Space Settings.
   * See `chatOpen()` in src/lib/tenant.ts, which is where the two are combined.
   */
  chat: { label: 'Lounge chat', fallback: true },
  /**
   * One track, playing for everybody in the space at once.
   *
   * `false`, like the other flags guarding new surface. The damage from a wrong
   * fallback is a particular one here and worth naming: this feature ends with
   * an iframe playing audio, so a resolver blip that defaulted to `true` would
   * not merely reveal a control - it would make noise in rooms that never asked
   * for a radio. Falling back to off costs silence, which is what those rooms
   * had anyway.
   *
   * Sufficient on its own, unlike `chat`. There is no second per-space switch,
   * because a radio with nothing on it is already off - see the note in the
   * radio migration. What each *listener* consents to is a separate question
   * again, and not a flag: nobody hears the radio until they say yes on their
   * own device. See src/lib/radio/prefs.ts.
   */
  radio: { label: 'Space radio', fallback: false },
  /**
   * A space's own world builder, and the catalogue it publishes into.
   *
   * `false`, like the other flags guarding new surface. What it gates is the
   * space half: the builder at /t/[slug]/builder, the space's saved worlds, and
   * pulling a published world into a battlefield. The public catalogue at
   * /worlds is not behind it - that page belongs to the platform rather than to
   * any space, and has no tenant to read a flag from.
   *
   * Not sufficient on its own for the one action that lands blocks in a space:
   * a world arrives as a battlefield, so `battle` has to be on as well or the
   * copy would land somewhere the space cannot open. See `addWorldToSpace`.
   */
  worlds: { label: 'World catalogue', fallback: false },
  /**
   * XPs: a level with its own rules, and a match fought inside one.
   *
   * `false`, like the other flags guarding new surface, and the damage from a
   * wrong fallback is specific enough to name: an XP match opens a Realtime
   * topic per room and every client in it sends eight messages a second for as
   * long as the tab is open. A resolver blip that defaulted to `true` would not
   * merely reveal a control - it would put that traffic in the budget of spaces
   * that never asked for it. Falling back to off costs a section in a wizard.
   *
   * What it gates is the *space* half: the XP section in the summon wizard,
   * creating a match with an `xpId` on it, and the door into the room. The
   * creator itself at /xp is not behind it - that is an operator tool with its
   * own gate (`src/app/xp/gate.ts`) and no tenant to read a flag from, which is
   * the same split `worlds` and `scenes` already make.
   *
   * Not sufficient on its own for a match: `battle` has to be on as well, or
   * there is no lobby to summon one from. That is not enforced twice - the
   * battle routes already require their own flag, and this one only decides
   * whether they offer an XP.
   */
  xp: { label: 'XP', fallback: false },
  /**
   * Is the xp tier something anybody can *buy* yet?
   *
   * Not the same question as `xp` above, and the two are deliberately not
   * folded together. `xp` asks whether a space may use the XP suite; this asks
   * whether we are selling the plan that includes it. A space can perfectly
   * well have the first and not the second - that is exactly what a comped
   * account is, and what an xp voucher grants.
   *
   * `false`, which means the launch posture is xo only: €5 is on sale, xp shows
   * as coming soon, and every path that would take money for it refuses. The
   * fallback agrees with that rather than being merely cautious - selling a
   * plan whose story and VR halves do not exist yet is a refund, and a resolver
   * blip must not be what starts doing it.
   *
   * It gates *taking money*, not the feature. Three places check it: the
   * Checkout for a new subscription, the scheduled move up from xo, and the
   * copy on the three surfaces that quote a price. It deliberately does not
   * gate `xpOpen()` - a space that already holds xp, by grant or by
   * grandfathering, keeps working when this is off, because withdrawing the
   * product from people who already have it is a different decision from
   * pausing sales and should not be made by the same switch.
   */
  xp_sales: { label: 'xp tier on sale', fallback: false },
  /**
   * Scenes from the motion studio, on a space's board.
   *
   * `false`, like the other flags guarding new surface. What it gates is the
   * space half: saving a scene under a workspace's name and pinning one to its
   * pinboard. The platform's own catalogue at /ovaloffice/scenes is not behind
   * it - that is backoffice surface with no tenant to read a flag from.
   *
   * It gates the *composer* and not the card. A flag turned off after somebody
   * pinned a scene would otherwise leave a notice pointing at a picture nobody
   * can see, which is a worse state than the feature simply being on; who may
   * watch one is the row-level policy's answer, not this flag's.
   */
  scenes: { label: 'Scenes', fallback: false },
  /**
   * Cameras in the lounge: a video circle worn as a face.
   *
   * `false`, like the other flags guarding new surface, and the damage from a
   * wrong fallback is a particular one here. Every other flag in this registry
   * decides whether a control is *offered*. This one decides whether a room
   * containing other people has a camera button in it at all - and a resolver
   * blip that defaulted to `true` would put one in front of everybody in every
   * space, in a product whose rooms nobody joined expecting to be seen in.
   * Nobody's camera can switch itself on: the browser's own prompt stands
   * between the button and the light. That is a reason the failure is
   * recoverable, not a reason to risk it.
   *
   * What it gates is the whole of it - the switch, the signalling handler on
   * the room's channel, and every peer connection. Off, and the code below it
   * is unreachable rather than merely quiet.
   *
   * Sufficient on its own, unlike `chat`: there is no second per-space switch,
   * because a room where nobody has pressed the button already has no video in
   * it. What each *person* consents to is a third question again and not a flag
   * - it is the permission prompt, and it is asked on their own device.
   */
  faces: { label: 'Faces in the lounge', fallback: false },
  /**
   * Turning a scene into a picture on a server, rather than in the tab that
   * composed it.
   *
   * `false`, like the other flags guarding new surface, and the damage from a
   * wrong fallback is worth naming because it is not a revealed control: this
   * flag is what lets a request enqueue work for a headless Chrome running
   * SwiftShader on a two-core box. A resolver blip that defaulted to `true`
   * would let every caller that can reach the API queue renders on the machine
   * that is also serving the site. Falling back to off costs a button.
   *
   * It gates *registering* a job - the API and the backoffice surface - and
   * deliberately not the worker, which drains whatever is already in the queue.
   * A flag turned off is a decision to stop accepting work, not a reason to
   * strand rows that were accepted while it was on.
   */
  renders: { label: 'Scene renders', fallback: false },
  /**
   * The front door.
   *
   * On, anybody may create an account. Off, sign-up is by invitation, and
   * everybody else is offered the waiting list at /waitlist.
   *
   * `false`, and this is the one flag where that direction needs arguing,
   * because it disagrees with the migration that seeds the row `true`. The two
   * answer different questions. The seed decides what a deployment that has
   * never touched this should do, and the answer must be "carry on as
   * yesterday" - shipping the flag cannot be what locks an existing product's
   * front door. The fallback decides what to assume when the resolver is
   * broken, and there the damaging direction is the opposite one: a database
   * blip that reopened a door an operator deliberately shut would let people in
   * who were meant to queue, and there is no undoing that afterwards. Falling
   * back to closed only delays somebody.
   */
  open_registration: { label: 'Open registration', fallback: false },
  /**
   * The projection sweep, `/api/cron/project`.
   *
   * A kill switch rather than a feature gate, and the only flag here whose
   * subject is a background job. It exists because the alternative during an
   * incident is ssh and `crontab -e` on the app box - which is a slow, manual,
   * error-prone thing to be doing at the moment you most want a fast one.
   *
   * `fallback: true`, and it is the *opposite* of the reasoning `agents` and
   * `battle` use. Those guard new surface, so a resolver outage must not switch
   * them on. This guards a repair pass that has been running for a while, so a
   * resolver outage must not switch it *off* - a sweep that stops is silent, and
   * what it leaves behind is read models drifting from the log while every page
   * still renders. Failing toward "keep sweeping" costs nothing if it is wrong;
   * failing toward "stop" costs correctness nobody will notice losing.
   *
   * Note this is the *global* flag only. Per-tenant overrides make no sense for
   * it - the sweep is not a property of any one space - and the deployment-level
   * switch is a separate mechanism with a separate purpose: PROJECTION_SWEEP=off
   * in compose.dev.yaml says "this deployment must never sweep, whatever the
   * database says", because develop shares production's data. That one is not
   * an operator decision and must not be togglable from a page.
   */
  projection_sweep: { label: 'Projection sweep', fallback: true },
  /**
   * Measuring a live xo room while people are standing in it.
   *
   * `false`, for the reason `agents` and `battle` give, and this flag is the
   * clearest case in the registry for it. What it switches on is not a control
   * or a page - it is a frame-rate sampler, a set of packet counters and a
   * round-trip probe running inside every lounge and battle room the space has.
   * A resolver blip that defaulted to `true` would start instrumenting rooms
   * nobody asked to be measured in, on a channel whose ceiling is the thing
   * being measured. Falling back to off costs a diagnostic that was not running
   * yesterday either.
   *
   * Read at three levels, and all three are load-bearing:
   *
   *   1. The backoffice nav entry and /ovaloffice/performance, resolved with no
   *      tenant, so it answers for the platform and this admin.
   *   2. The sampling in the room, which is the expensive half - the frame
   *      loop, the counters and the ping.
   *   3. `record_room_perf()`, which re-checks it in SQL. A client that keeps
   *      sampling after an operator turned this off writes nothing.
   *
   * One switch for the whole deployment, for now. Turning it on measures every
   * space's rooms - that is the intended use while there is a question about
   * how the product performs in general, rather than about one space.
   *
   * Because `feature_flag_overrides` exists, narrowing it to a single space is
   * free when the question *is* about one space: a tenant override on top of a
   * global `false`. Nothing here needs to change for that; it is the mechanism
   * every other flag already has.
   *
   * What is per-space is the *display* - whether the people in a space's rooms
   * are shown their own readings. That is `perf_display`, a capability a space
   * turns on for itself in Space Settings, and it is deliberately a different
   * decision with a different owner: measuring is an operator's diagnostic,
   * looking at it is a space's choice. See `perfDisplayOn` in src/lib/tenant.ts.
   *
   * It gates *collection*, not the data - the same split `tasks` makes. Samples
   * already written stay readable when it goes off, because the question an
   * operator asks afterwards is what the room looked like while it was bad.
   *
   * Nothing is drawn in the room while it is on, and that is a decision rather
   * than an omission. An earlier version put a chip in the HUD; it was taken
   * out deliberately. What it is measuring is the room's own plumbing - packet
   * counts, frame times, a round trip - and none of it identifies anybody to
   * anybody else or is shown to another player. A notice on a shared surface
   * would be a permanent piece of chrome in everyone's world explaining an
   * operator's diagnostic, which is a worse thing to put in front of players
   * than the diagnostic is to run.
   */
  perf: { label: 'Room performance', fallback: false },
  /**
   * How many people fit in one space.
   *
   * Off means unlimited - see `valued`. `false` is also the right failure: a
   * flag lookup that broke must not be what stops somebody joining a space
   * they were invited to, and an outage that briefly lifts a cap costs a
   * handful of seats that an admin can see and correct.
   */
  seat_limit: {
    label: 'Seat limit per space',
    fallback: false,
    valued: { unit: 'people per space', min: 1, max: 10_000 },
  },
  /**
   * How many guests may be in one space at the same time.
   *
   * Not the same question as `seat_limit`, which counts the people who belong
   * to a space. This counts the strangers standing in it right now, and a guest
   * leaving frees a place under it - so a space can be at its guest cap all
   * afternoon and never have used a seat.
   *
   * `false` for the same reason `seat_limit` is: a broken flag lookup must not
   * be what turns somebody away at a door they were sent a link to, and an
   * outage that briefly lifts the cap costs a few extra visitors that an admin
   * can see and remove.
   */
  guest_limit: {
    label: 'Guests in a space at once',
    fallback: false,
    valued: { unit: 'guests per space', min: 1, max: 1_000 },
  },
  /**
   * The rest of the caps a tier carries.
   *
   * `seat_limit` and `guest_limit` above predate tiers and were platform
   * ceilings: a number the installation imposed, with a per-space override for
   * whoever asked nicely. These four are the same mechanism extended to the
   * quantities `docs/product/pricing.md` prices - places, projects, matches -
   * so that every limit in the product resolves the same way and an operator
   * has one page to raise any of them from.
   *
   * All four keep the shape and the failure direction the two above chose, and
   * for the reason argued at `seat_limit`: off means unlimited, so "no cap"
   * needs no sentinel, and a broken lookup lifts a cap rather than clamping
   * one. An outage that briefly lets a space open a fifth room costs a room an
   * admin can see; an outage that clamps every space to zero is an incident.
   *
   * The tier is *not* here. It is the rung between these overrides and the
   * global default, and it lives in `billing/tiers.ts` - see `limits.ts` for
   * how the three are resolved against each other.
   */
  xo_place_limit: {
    label: 'Rooms per space',
    fallback: false,
    valued: { unit: 'rooms per space', min: 1, max: 1_000 },
  },
  xp_place_limit: {
    label: 'XP places per space',
    fallback: false,
    valued: { unit: 'xp places per space', min: 1, max: 1_000 },
  },
  project_limit: {
    label: 'XP projects per space',
    fallback: false,
    valued: { unit: 'projects per space', min: 1, max: 1_000 },
  },
  match_limit: {
    label: 'Matches at once per space',
    fallback: false,
    valued: { unit: 'matches at once', min: 1, max: 500 },
  },
  page_limit: {
    label: 'Pages per space',
    fallback: false,
    valued: { unit: 'pages per space', min: 1, max: 1_000 },
  },
  /**
   * Uploaded images, and the switch that stops them arriving at all.
   *
   * Two flags rather than one, because they answer different questions and the
   * one that matters most is not a number. `picture_limit` caps how many a
   * space may hold; `pictures` decides whether anybody may upload one *here* -
   * a kill switch for a feature that accepts bytes from the internet and stores
   * them under our own origin.
   *
   * `pictures` falls back **off**, and that is a deliberate departure from the
   * rule most of the surfaces above follow. They fall back to *show*, because a
   * lookup blip that hid half the app would look like a deletion. This one
   * follows `billing` instead: the safe failure is to *enforce*. A kill switch
   * that turns the thing back on when the resolver hiccups is not a kill
   * switch, and the whole reason to add it is that images are the one surface
   * where the cost of being wrong is somebody else's file on our domain.
   *
   * Off stops new uploads and takes away the surface that offers them. It does
   * **not** unpublish what is already stored - nothing in this codebase deletes
   * on a flag, and the freeze-never-delete instinct in `docs/product/pricing.md`
   * §6 is the same one. An operator who needs images *gone* rather than *off*
   * is asking for moderation, which has its own trail.
   */
  pictures: { label: 'Image uploads', fallback: false },
  picture_limit: {
    label: 'Uploaded images per space',
    fallback: false,
    valued: { unit: 'images per space', min: 1, max: 10_000 },
  },
  /**
   * How many *free* spaces one account may own.
   *
   * The odd one out, and the only limit in this registry that wants a `user`
   * override rather than a `tenant` one - which is what `FeatureScope` has had
   * two values for all along. Everything else here caps a space; this caps how
   * many spaces somebody may have without paying for any of them.
   *
   * Owning paid spaces is not capped and has no flag: a subscription is per
   * space, so a second one is a purchase rather than a loophole. Membership of
   * other people's spaces is not capped either, and deliberately so - see
   * `FREE_SPACES_PER_ACCOUNT` in `billing/tiers.ts` for why capping it would
   * cost us the people who bring other people here.
   *
   * Same failure direction as the rest: off means unlimited, and a broken
   * lookup lets somebody make a space rather than telling them they may not.
   */
  free_space_limit: {
    label: 'Free spaces one account may own',
    fallback: false,
    valued: { unit: 'free spaces per account', min: 1, max: 100, scope: 'user' },
  },
} as const satisfies Record<string, FeatureDefinition>

export type FeatureKey = keyof typeof FEATURES

export type Features = Record<FeatureKey, boolean>

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[]

/** Every flag at its fallback. Used when the lookup fails, and as the merge base. */
export function fallbackFeatures(): Features {
  const features = {} as Features
  for (const key of FEATURE_KEYS) features[key] = FEATURES[key].fallback
  return features
}

export function isFeatureKey(value: string): value is FeatureKey {
  return Object.hasOwn(FEATURES, value)
}

/** The two things an override can be attached to. */
export type FeatureScope = 'tenant' | 'user'

/** The number a valued flag carries, or null if this flag is a plain switch. */
export function featureValueSpec(key: FeatureKey) {
  const definition: FeatureDefinition = FEATURES[key]
  return definition.valued ?? null
}

/** Every flag that carries a number, in registry order. */
export const VALUED_FEATURE_KEYS = FEATURE_KEYS.filter(
  // Through `featureValueSpec` rather than `FEATURES[key].valued`: the
  // `as const satisfies` on the registry narrows each entry to its own literal
  // type, so a plain switch genuinely has no `valued` property to read. The
  // accessor widens to `FeatureDefinition` first, which is the whole reason it
  // exists.
  (key) => featureValueSpec(key) !== null,
)

/**
 * Which kind of subject an override of this flag attaches to.
 *
 * `tenant` for anything that does not say otherwise, which is every cap on a
 * space. Only `free_space_limit` caps a person.
 */
export function featureOverrideScope(key: FeatureKey): FeatureScope {
  return featureValueSpec(key)?.scope ?? 'tenant'
}

/**
 * Resolve a valued flag to the number in force, or null for "no limit".
 *
 * The switch is checked before the number, which is the whole reason a valued
 * flag has both: `enabled: false` means the rule does not apply, whatever
 * number is parked in the row. Mirrors `tenant_seat_limit()` in
 * supabase/migrations/20260805000000_access_control.sql - the SQL is what
 * enforcement actually runs, this is the same rule for anything already
 * holding the rows.
 */
export function resolveLimit(
  enabled: boolean,
  value: number | null | undefined,
): number | null {
  if (!enabled) return null
  return typeof value === 'number' && value > 0 ? value : null
}
