/**
 * Where the world is watched from - and, more importantly, which way is left.
 *
 * **This block is an input mode that happens to also move the camera.** That
 * sentence belongs at the top because the field is called `camera` and the bug
 * it exists to prevent is about `W`.
 *
 * `player.tsx` derives movement from `camera.getWorldDirection`: forward is
 * wherever you are looking. That is exactly right behind a body and exactly
 * wrong beside one - point a camera at the side of a level and forward becomes
 * *into the screen*, so `W` walks the player away from the viewer and `A`/`D`
 * push them towards and away from the glass. The controls do not fail, they
 * read as broken, which is worse.
 *
 * So a camera choice picks the movement basis with it. That is the half with
 * tests (`src/app/xp/_runtime/camera.ts`), because it is the half that can be
 * proved and the half that breaks; where the camera *sits* is four lines of
 * arithmetic you can check by looking, if the pane would ever draw a frame.
 *
 * ---------------------------------------------------------------------------
 * Why one axis, and not a path
 * ---------------------------------------------------------------------------
 * A side-on level runs in a straight line. That is a real constraint and it is
 * deliberate:
 *
 * - **A field with no system behind it is a promise nobody verifies** - the same
 *   argument that keeps `friendlyFire` out of the rules block. A per-leg path is
 *   a bigger idea and nothing has asked for it. A Mario level is a straight
 *   line; if the first real side-on document wants a corner, that is the
 *   evidence for extending this.
 * - **Cheap to widen, expensive to narrow.** `axis: 'x' | 'z'` can grow into
 *   something richer without breaking a document that declared `'x'`. A path
 *   shipped now is a shape every future reader has to handle whether or not
 *   anybody ever used it.
 *
 * Worth knowing before reaching for `ladder-run` as the test case: it is an L.
 * Forty-eight cells along +x, then thirty-nine along -z, measured rather than
 * remembered. A single-axis camera shows the first half correctly and then the
 * player walks into the screen. The first side-on level is a new document.
 */

export const CAMERA_KINDS = ['follow', 'side', 'fixed'] as const

export type CameraKind = (typeof CAMERA_KINDS)[number]

const KIND_SET: ReadonlySet<string> = new Set(CAMERA_KINDS)

export function isCameraKind(value: string): value is CameraKind {
  return KIND_SET.has(value)
}

export const CAMERA_AXES = ['x', 'z'] as const

export type CameraAxis = (typeof CAMERA_AXES)[number]

export interface XpCamera {
  kind: CameraKind
  /**
   * Which world axis a `side` level runs along.
   *
   * The camera stands off the *other* one and looks back along it, so this is
   * the axis the player moves on and the axis the level is built on. Default
   * `x`, which is the way a course reads when you write it down.
   */
  axis?: CameraAxis
  /** How far off the plane the camera stands, in cells. */
  distance?: number
  /** How many cells tall the view is. The orthographic camera's whole framing. */
  span?: number
  /**
   * Where a `fixed` camera stands, in cells. All three, and required.
   *
   * A camera with no position is not a camera, so there is no default to fall
   * back on here the way `axis` has one - a `fixed` block missing a coordinate
   * is refused rather than placed at the origin, which would put it inside the
   * floor of most levels and read as the level failing to load.
   */
  x?: number
  y?: number
  z?: number
  /**
   * Which way a `fixed` camera looks, in degrees. **Absent means it watches the
   * player**, which is the useful default rather than a missing value.
   *
   * A camera nailed to a corner of a room that also turns to follow whoever is
   * in it is what a fixed camera is *for* - the security-camera shot, the
   * isometric arena. A dead stare is the special case, so it is the one you have
   * to type, and typing either one pins both: a document that says `yaw` and not
   * `pitch` is refused, because half a direction is a direction with an
   * unwritten half that would silently keep tracking.
   *
   * `yaw` is the document's own convention, the same one `Mark.facing` uses -
   * zero looks along +z, and it turns the way a mark turns. Not three.js's,
   * which is 180 degrees out; `yawFor` in the runtime is where that is undone,
   * in one place, because it has already cost one level a black screen.
   *
   * `pitch` is positive upwards, which is the way anybody describes a camera
   * angle out loud, and refused past straight up or straight down.
   *
   * ---------------------------------------------------------------------------
   * What "watches the player" does *not* mean
   * ---------------------------------------------------------------------------
   * It turns the shot, and it does not turn the keys. This block is an input
   * mode - the first line of this file - and reading the basis off a lens that
   * is tracking somebody makes `W` mean a slightly different direction after
   * every step they take, which reads as the level drifting under them. Worse
   * where a level puts the player near the lens: the flat heading collapses as
   * they walk underneath it and swings through a half turn as they pass.
   *
   * So the basis comes off where the *shot* points rather than where the lens is
   * looking this frame - the line from the camera to the spot it was placed to
   * frame, which is where the player arrives. `movementBasis` in
   * `src/app/xp/_runtime/camera.ts` is that, and it is one function so a camera
   * that did write a `yaw` still gets the direction it asked for.
   *
   * A level whose *view* swinging is the problem wants `at` below, which is the
   * third answer to "which way does it look" and the one a table needs.
   */
  yaw?: number
  pitch?: number
  /**
   * A spot a `fixed` camera looks at, in cells. The third answer beside
   * watching the player and staring down a `yaw`.
   *
   * ---------------------------------------------------------------------------
   * Why a point, when there is already a direction
   * ---------------------------------------------------------------------------
   * Because of `seats`. Four chairs round a table each look at **the same
   * place** from four different sides, and a direction cannot say that: blue
   * needs a yaw of 180, green 270, and the block has one `yaw` for the whole
   * document. A point is the same sentence for every chair - *look at the
   * middle* - so one field seats the whole table.
   *
   * It is also the shot a board game actually wants, which watching the player
   * is not. A camera that centres on whoever is playing centres on somebody
   * standing at the *edge* of the board, so half the frame is the floor behind
   * them and the board is shoved into a corner; and it swings as they walk,
   * which is the complaint `movementBasis` fixed for the keys and could not fix
   * for the view. Aimed at the middle, the board is centred, still, and can be
   * framed as tightly as the lens likes.
   *
   * Absent is unchanged: it watches the player, which is right for the shot a
   * fixed camera was built for - the corner of a room, the security camera.
   * Refused *together* with `yaw`/`pitch`, because a point and a direction are
   * two answers to one question and picking a winner would silently ignore the
   * one somebody typed second.
   *
   * All three axes, like a seat, and for the same reason: a point missing its
   * height is not a point at a default height, it is a point somebody meant to
   * finish. `y` is worth thinking about rather than copying - it is what the
   * camera is level with, so a table wants the height of the board and a room
   * wants somebody's head.
   */
  at?: { x: number; y: number; z: number }
  /**
   * How far behind, above and beside the body a `follow` camera sits, in cells.
   *
   * The chase camera has always been a fixed four metres straight back at eye
   * height, which is a good default and the only thing a level could have. These
   * are the three numbers that turn it into a shot: `beside` is the shoulder cam
   * every third-person shooter has, `above` is the slightly-overhead framing an
   * isometric-ish level wants, and `behind` is how much room the body gets.
   *
   * Absent is exactly what every document has today - `DEFAULT_BEHIND`, and zero
   * for the other two - so a level that says nothing is framed as it always was.
   *
   * `behind` is a *maximum* rather than a distance, like the constant it
   * replaces: the runtime shortens it whenever there is something in the way,
   * because a camera that clips through a wall is worse than a close one.
   */
  behind?: number
  above?: number
  beside?: number
  /**
   * How far the camera can see, in cells, and how wide the lens is in degrees.
   *
   * Both were constants in the scene - 400 and 75 - and both are things a level
   * has an opinion about: a corridor wants a narrower lens than an arena, and a
   * level whose far plane sits inside its own skybox draws a visible ring where
   * the fog runs out.
   *
   * `fov` is refused on a `side` camera, which is orthographic and has no lens
   * to be wide: three.js ignores `fov` entirely there, so a document setting it
   * would be a setting that does nothing. `far` applies to every kind.
   */
  fov?: number
  far?: number
  /**
   * Where each side's camera stands, when a `fixed` level has sides.
   *
   * -------------------------------------------------------------------------
   * The gap this closes, and why it took a table to find it
   * -------------------------------------------------------------------------
   * A `fixed` camera is one shot for the whole document, which is right for the
   * thing it was built for - a security-camera corner, an isometric arena, one
   * room everybody is looking at from the same place. It is wrong for the other
   * thing a fixed camera is for, which is a **table**: four people sit round it
   * and each of them sees the board from their own chair. Blue looking at the
   * board over red's shoulder is blue playing somebody else's game.
   *
   * Keyed by the same names `Mark.team` uses, because that is what a side *is*
   * here - `teamsOf` collects them off the spawn marks, `sideOf` puts a player
   * on one, and this is the third question the same answer settles. A side with
   * no entry falls back to the block's own `x, y, z`, which is what every
   * document written before this had and what a player on no side still gets.
   *
   * -------------------------------------------------------------------------
   * Positions, not whole cameras
   * -------------------------------------------------------------------------
   * A seat is *where you sit*, and every other thing about the shot - how wide
   * the lens is, how far it sees, whether it stares or watches you - is about
   * the level rather than the chair. Letting a seat override those would be four
   * cameras in a document that has one camera and four chairs, and the first
   * time two of them drifted apart nobody would be able to say which was
   * intended.
   *
   * `yaw` and `pitch` are deliberately not here either, and that is the one
   * worth defending: a table's camera *watches the player*, which is the
   * `fixed` default and the only sensible aim for a seat. A document that pins
   * a stare has aimed it at one thing, and four chairs staring at the same wall
   * is not four seats.
   */
  seats?: Readonly<Record<string, { x: number; y: number; z: number }>>
}

/** What every document has today, and what absent means. */
export const DEFAULT_CAMERA: XpCamera = { kind: 'follow' }

export const DEFAULT_AXIS: CameraAxis = 'x'
/** Far enough to see a level, near enough that it is not a map. */
export const DEFAULT_DISTANCE = 24
/** About seven body heights, which is a platformer's worth of vertical. */
export const DEFAULT_SPAN = 20
/**
 * Four metres behind the body, which is the constant this replaces.
 *
 * `CHASE_BACK` in `_runtime/player.tsx`, moved into the format because it is a
 * framing decision and framing is the level's: two body heights is what every
 * third-person game settles on, near enough that the body is the thing you are
 * looking at and far enough to see what is about to walk into you.
 */
export const DEFAULT_BEHIND = 4
/** Level with the eye and straight back, which is where the camera has always sat. */
export const DEFAULT_ABOVE = 0
export const DEFAULT_BESIDE = 0
/** The two the scene had hardcoded. */
export const DEFAULT_FOV = 75
export const DEFAULT_FAR = 400

/** One line for a picker. */
export function describeCameraKind(kind: CameraKind): string {
  switch (kind) {
    case 'follow':
      return 'Behind the body, looking where you look - first or third person'
    case 'side':
      return 'Flat on, from the side, along one axis - a platformer'
    case 'fixed':
      return 'Nailed to one spot in the world, watching the player or staring one way'
  }
}

/**
 * Which fields belong to which kind.
 *
 * A table rather than three branches, because the refusal below and the sweep in
 * `isDefaultCamera` are the same question asked twice and they must not be able
 * to disagree - a field allowed here and forgotten there is a setting silently
 * deleted on the next save, which is the trap `isDefaultRules` documents at
 * length.
 *
 * `fov` is on `follow` and `fixed` and not on `side`: a side-on camera is
 * orthographic, three.js ignores `fov` entirely, and a field that does nothing
 * is the one thing this file refuses to ship.
 */
const FIELDS: Readonly<Record<CameraKind, readonly (keyof XpCamera)[]>> = {
  follow: ['behind', 'above', 'beside', 'fov', 'far'],
  side: ['axis', 'distance', 'span', 'far'],
  fixed: ['x', 'y', 'z', 'yaw', 'pitch', 'at', 'fov', 'far', 'seats'],
}

/**
 * Which optional fields this kind may carry.
 *
 * Exported because the editor's write path needs the same answer: switching
 * kinds has to *drop* the fields that no longer belong, the way `setTrigger`
 * drops a key when a rule stops being a press. Without it the editor would
 * write a block `cameraProblems` refuses and the save would silently do
 * nothing - and two copies of this table is how the panel and the parser come
 * to disagree about what a `side` camera is.
 */
export function cameraFieldsFor(kind: CameraKind): readonly (keyof XpCamera)[] {
  return FIELDS[kind]
}

/** Every optional field, so a refusal can name the ones that do not belong. */
const ALL: readonly (keyof XpCamera)[] = [
  'axis',
  'distance',
  'span',
  'x',
  'y',
  'z',
  'yaw',
  'pitch',
  'behind',
  'above',
  'beside',
  'fov',
  'far',
  // Neither of these two is a number, unlike everything above them, and they are
  // on this list for the reason the list exists: `isDefaultCamera` sweeps it to
  // decide whether a block is worth keeping, and a field it does not sweep is a
  // field an author sets and the next save throws away.
  'at',
  'seats',
]

/**
 * Why this camera does not hold, or an empty list if it does.
 *
 * ---------------------------------------------------------------------------
 * What changed, and the guarantee that went with it
 * ---------------------------------------------------------------------------
 * This function used to buy something specific: by refusing every field that
 * could sit beside `follow`, it made "is this the default camera" *provably*
 * just "is it `follow`", which cannot be got wrong by forgetting a field.
 *
 * A `follow` camera with a shoulder offset is a real thing to want, so that
 * guarantee is gone and pretending otherwise would be worse than losing it. What
 * replaces it is the table above and a sweep test over `Required<XpCamera>`,
 * which is the same pair `XpRules` runs on - a field added to the type and not
 * to `FIELDS` fails to compile, and one added to `FIELDS` and not handled by
 * `isDefaultCamera` fails a test. The trap is not closed by construction any
 * more; it is closed by something that shouts.
 */
export function cameraProblems(camera: XpCamera): string[] {
  const problems: string[] = []

  /**
   * Fields that belong to another kind, named rather than ignored.
   *
   * A `distance` on a `fixed` camera is an author who has changed their mind
   * half way and left the old shot behind, and leaving it in the document is how
   * it comes back the next time they switch kinds.
   */
  const allowed = FIELDS[camera.kind]
  for (const field of ALL) {
    if (camera[field] === undefined) continue
    if (!allowed.includes(field)) {
      problems.push(`"${field}" only means something for a ${kindsWith(field)} camera`)
    }
  }

  /**
   * A camera inside the player is a camera looking at the inside of a body, and
   * a negative one is a camera behind the level looking away from it. Neither is
   * a setting anybody means.
   */
  if (camera.distance !== undefined && camera.distance <= 0) {
    problems.push('a side-on camera has to stand off the level, so distance must be more than zero')
  }
  /**
   * A span of zero divides by nothing when the zoom is worked out, and a huge
   * one is a level seen from orbit. The ceiling is generous rather than tuned -
   * it is there to catch a typo, not to have an opinion.
   */
  if (camera.span !== undefined && (camera.span <= 0 || camera.span > 512)) {
    problems.push('span is how many cells tall the view is, and must be between 1 and 512')
  }

  if (camera.kind === 'fixed') {
    /**
     * All three or none, and none is refused.
     *
     * There is no sensible default for where a camera stands: the origin is
     * inside the floor of most levels, and a `fixed` camera that quietly went
     * there would read as the level failing to load rather than as a missing
     * field. Two of three is the typo this catches.
     */
    const placed = (['x', 'y', 'z'] as const).filter((axis) => camera[axis] !== undefined)
    if (placed.length !== 3) {
      problems.push('a fixed camera needs x, y and z - there is nowhere sensible to default it to')
    }

    /**
     * Half a direction is refused, because the other half would keep tracking.
     *
     * Absent means "watch the player", so a document that sets `yaw` alone gets
     * a camera turning to follow somebody vertically while staring one way
     * horizontally - which is not a shot anybody composed, and reads as the
     * setting being ignored.
     */
    const aimed = [camera.yaw, camera.pitch].filter((angle) => angle !== undefined)
    if (aimed.length === 1) {
      problems.push('yaw and pitch go together - set both to aim it, or neither to watch the player')
    }
    /**
     * A point and a direction are two answers to one question.
     *
     * Honouring one would silently ignore the other, and which one wins is not
     * something an author can guess from the file. Named rather than resolved,
     * like every other "you have said this twice" in this parser.
     */
    if (camera.at !== undefined && aimed.length > 0) {
      problems.push('a camera looks at "at" or along yaw/pitch, not both - drop one of them')
    }
    if (camera.pitch !== undefined && (camera.pitch < -90 || camera.pitch > 90)) {
      problems.push('pitch is degrees from level, between -90 (straight down) and 90 (straight up)')
    }
  }

  /**
   * The framing numbers, bounded at both ends because both ends are typos.
   *
   * A `behind` of zero is first person by accident - there is a `view` toggle
   * for that and it is not a document field - and a hundred is a camera in the
   * next postcode. `beside` and `above` may be negative, deliberately: a
   * left-shoulder camera and a low angle are both shots.
   */
  if (camera.behind !== undefined && (camera.behind <= 0 || camera.behind > 64)) {
    problems.push('behind is how far back the camera sits, and must be between 1 and 64 cells')
  }
  for (const field of ['above', 'beside'] as const) {
    const value = camera[field]
    if (value !== undefined && Math.abs(value) > 64) {
      problems.push(`${field} must be within 64 cells of the body`)
    }
  }

  /**
   * A lens narrower than a keyhole or wider than a fisheye, and a far plane
   * inside the player.
   *
   * The far bound is the one worth having: a level whose far plane is shorter
   * than the level draws the fog running out in mid-air, and the symptom is
   * "the world ends" rather than anything pointing at a number.
   */
  if (camera.fov !== undefined && (camera.fov < 20 || camera.fov > 140)) {
    problems.push('fov is the width of the lens in degrees, and must be between 20 and 140')
  }
  if (camera.far !== undefined && (camera.far < 16 || camera.far > 4096)) {
    problems.push('far is how many cells the camera can see, and must be between 16 and 4096')
  }

  return problems
}

/** Which kinds a field belongs to, for a refusal that says where it should go. */
function kindsWith(field: keyof XpCamera): string {
  const kinds = CAMERA_KINDS.filter((kind) => FIELDS[kind].includes(field))
  return kinds.join(' or ')
}

/**
 * Is this the camera a document without a block would have got?
 *
 * An enumeration now rather than a one-line proof - see `cameraProblems` for
 * what was traded and what guards it instead. Every optional field has to be
 * listed here or an author's setting is dropped on the next save, which nobody
 * notices until the shot is wrong a week later.
 */
export function isDefaultCamera(camera: XpCamera): boolean {
  if (camera.kind !== DEFAULT_CAMERA.kind) return false
  return ALL.every((field) => camera[field] === undefined)
}

export function cameraOf(document: { camera?: XpCamera }): XpCamera {
  return document.camera ?? DEFAULT_CAMERA
}

/**
 * The camera as it stands for one player.
 *
 * The whole of the per-seat feature at the point of use: a `fixed` camera with
 * `seats` and a player on a side stands where that side's chair is, and
 * everything else about the shot is the document's.
 *
 * A function rather than a lookup at the call site because the fallback chain is
 * the part that has to be identical everywhere it is asked - the runtime places
 * the lens, the editor draws a preview, and a screenshot script draws a picture,
 * and a seat that only some of them know about is a picture that lies.
 */
export function cameraFor(camera: XpCamera, team: string | undefined): XpCamera {
  if (camera.kind !== 'fixed' || team === undefined) return camera
  const seat = camera.seats?.[team]
  if (!seat) return camera
  return { ...camera, x: seat.x, y: seat.y, z: seat.z }
}
