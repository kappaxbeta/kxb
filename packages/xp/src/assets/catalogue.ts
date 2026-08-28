/**
 * Every model the XP creator can place, as one searchable list.
 *
 * Provenance: copied from src/domain/builder/catalogue.ts when the XP creator
 * was started, and it has a sibling there. Bug fixes go both ways; behaviour
 * changes do not.
 *
 * This is the allow-list too. A model id ends up in a saved XP and then in a
 * `fetch`, so "is this a thing we ship" has to be answerable without touching
 * the disk - the generated list is what makes that a set lookup rather than a
 * hopeful string concatenation.
 *
 * Note what is deliberately *not* here: the builder's catalogue, and the
 * lounge's `isKnownModel`. Three lists, three questions. The lounge's 58 blocks
 * guard an immutable event log where a bad id is permanent; the builder's 1,393
 * guard a marketing render in a JSON file; these guard what a game is made of.
 * Collapsing any two of them means one tool inherits the other's ceiling.
 */

import { PACK_MODELS, type ModelSize } from './catalogue.generated'
import { PACK_ORDER, PACKS, splitModel } from './packs'

export interface CatalogueEntry {
  /** `pack/name`. */
  id: string
  packId: string
  name: string
  /** The name with its underscores knocked out, for reading and for searching. */
  label: string
  /**
   * How big it is *on the grid* - the authored bounds through the pack's
   * scale, so these are cells and comparable across packs.
   */
  size: { w: number; h: number; d: number }
  /**
   * The box's minimum corner relative to the model's origin, in cells.
   *
   * What makes a collision box land where the model is drawn. The prototype kit
   * centres most things horizontally - a four-wide wall runs -2..2 - but a door
   * is hinged and runs 0..1.6, so assuming the centre would put every door half
   * a metre into the wall beside it.
   */
  min: { x: number; y: number; z: number }
  /**
   * Drawn around its own centre rather than stood on the floor.
   *
   * Derived from the measured bounds rather than listed by hand. It was a
   * hand-pasted array for about an hour, which is exactly as long as it took to
   * notice that a list copied out of a script's output is a list that goes
   * stale the first time a pack is re-exported and nobody re-pastes it.
   *
   * What it means downstream: these are the things that hang off a socket or a
   * wall - the guns, the ammo, the coins, the barrels - and a blueprint made
   * from one needs lifting by half its height before it will stand on a floor.
   */
  centred: boolean
  /**
   * Which cells the geometry really fills, when that is not simply the box.
   *
   * Present for the eighteen pieces whose shape is the whole point of them -
   * stairs, doorways, slopes, anything with a hole. Absent for the rest, and
   * absent is the fast path: a box is a range loop, a mask is a bit test per
   * cell.
   */
  mask?: ModelSize['mask']
  /**
   * The mesh-bearing nodes inside this model's own `.glb`, when there is more
   * than one - a fan, a valve, anything with a moving part modelled as one
   * file rather than composed from separate models. What a blueprint's `spin`
   * picks from.
   */
  nodes?: ModelSize['nodes']
}

/**
 * Prettify a model name: Wall_Window_Closed -> Wall Window Closed.
 *
 * Separators only, and the first letter. The prototype kit names in Title_Case
 * where the builder's packs use snake_case, so lowercasing the rest would turn
 * `Wall_Target` into "Wall target" - a different thing from what the file is
 * called, which matters when somebody is looking for it on disk.
 */
export function labelOf(name: string): string {
  const words = name.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Under a hundredth of a cell of slop, so a rounding error is not a pivot. */
const FLOOR_SLOP = 0.01

/** Two decimals of a cell - a centimetre, which is finer than anything here. */
const cells = (v: number) => Math.round(v * 100) / 100

/**
 * The same, for an extent, floored at a centimetre so a box is never flat.
 *
 * "Finer than anything here" was true of 611 models and is not true of 3,892.
 * Two things broke it, and neither is a rounding accident:
 *
 *   - the forest kit's `Hill_Top_E_Center` is a *plane* - a decal laid over a
 *     hill, zero units tall in the file itself;
 *   - a board game card is 0.05 units thick, and the board game pack is
 *     authored ten times life size and scaled by 0.05, so its real thickness is
 *     two and a half millimetres.
 *
 * Both are correct art, and both would put a zero-extent box into a collision
 * test that assumes a box has an inside. A centimetre is below anything the
 * grid can express and above anything that divides by zero.
 */
const extent = (v: number) => Math.max(cells(v), 0.01)

export const CATALOGUE: readonly CatalogueEntry[] = PACK_ORDER.flatMap((packId) => {
  const { scale } = PACKS[packId]
  return (PACK_MODELS[packId] ?? []).map((model) => ({
    id: `${packId}/${model.name}`,
    packId,
    name: model.name,
    label: labelOf(model.name),
    size: {
      w: extent(model.w * scale),
      h: extent(model.h * scale),
      d: extent(model.d * scale),
    },
    min: {
      x: cells(model.x0 * scale),
      y: cells(model.y0 * scale),
      z: cells(model.z0 * scale),
    },
    centred: model.y0 < -FLOOR_SLOP,
    ...(model.mask ? { mask: model.mask } : {}),
    ...(model.nodes ? { nodes: model.nodes } : {}),
  }))
})

const BY_ID = new Map(CATALOGUE.map((entry) => [entry.id, entry]))

export function isKnownModel(model: string): boolean {
  return BY_ID.has(model)
}

/** One model's entry, or null for an id we do not ship. */
export function findModel(model: string): CatalogueEntry | null {
  return BY_ID.get(model) ?? null
}

/**
 * Whether this model is drawn around its own centre rather than stood on the
 * floor - so a blueprint made from it should be lifted half its height.
 */
export function isCentred(model: string): boolean {
  return BY_ID.get(model)?.centred ?? false
}

/**
 * How much to raise a model so it stands on the floor, in cells.
 *
 * Zero for the 65 pieces you build with, half its height for the 20 that hang.
 * This is the blueprint's default offset, not a pack-wide `lift`: moving the
 * pack would lift the other 65 off the ground.
 */
export function floorOffset(model: string): number {
  const entry = BY_ID.get(model)
  if (!entry || !entry.centred) return 0
  return entry.size.h / 2
}

/** What the creator starts holding. A floor, because you build ground first. */
export const DEFAULT_MODEL = 'proto/Primitive_Floor'

/** The default player blueprint's model: the rigged dummy. */
export const DEFAULT_SKELETON = 'dummy/Dummy'

/**
 * How much the player blueprint shrinks the dummy.
 *
 * Sized to the lounge's own convention: a peep stands 1.69 cells and the
 * character controller puts an eye at 1.7, so an avatar's eye is level with the
 * top of its head. The dummy is 2.396 cells in the file, so 0.71 brings it to
 * 1.70 - the same size as the people in the lounge, in the same relationship to
 * the same camera.
 *
 * ---------------------------------------------------------------------------
 * Why height and not width
 * ---------------------------------------------------------------------------
 * Width looks like the obvious anchor and it is a trap. The dummy measures 1.94
 * across, a peep 1.25, which reads as a figure half again too wide - but 1.94 is
 * the dummy's *arm span* in its bind pose, arms straight out, and 1.25 is a
 * peep's actual body. Matching those two numbers shrinks the dummy to about
 * two-thirds and leaves the player noticeably shorter than everybody else.
 *
 * The collision box is a separate question with an answer that is already
 * right: `PLAYER_RADIUS` is 0.3, which is what the lounge uses for peeps that
 * are 1.25 wide. So the player is *already* peep-width in the only sense that
 * decides whether you fit through a gap.
 *
 * Here rather than in the pack entry because it is a fact about this character
 * against this camera, not about how the pack was drawn.
 */
export const PLAYER_SCALE = 0.71

/**
 * The catalogue filtered by a typed query, grouped by pack.
 *
 * Matching is on the *name*, lowercased, with underscores and spaces treated
 * the same - so "wall window" finds `Wall_Window_Closed` and so does
 * "wall_window". Typing a pack id matches everything in that pack.
 *
 * Every term has to match somewhere, in any order: "slope half" finds
 * `Primitive_Slope_Half` and "half slope" finds it too. A substring search on
 * the whole phrase is a search that mostly returns nothing.
 */
export function searchCatalogue(
  query: string,
  packId?: string,
): { packId: string; label: string; models: CatalogueEntry[] }[] {
  const terms = query.toLowerCase().split(/[\s_]+/).filter(Boolean)

  const groups = PACK_ORDER.filter((id) => !packId || id === packId).map((id) => ({
    packId: id as string,
    label: PACKS[id].label,
    models: CATALOGUE.filter((entry) => entry.packId === id).filter((entry) => {
      if (terms.length === 0) return true
      const haystack = `${id} ${entry.name.toLowerCase().replace(/_/g, ' ')}`
      return terms.every((term) => haystack.includes(term))
    }),
  }))

  return groups.filter((group) => group.models.length > 0)
}

/**
 * The colourways the platformer kit ships the same shape in.
 *
 * `neutral` is one of them here and is a pack of its own in `PACKS`, which is
 * not a contradiction: 37 of its 53 pieces have no coloured twin at all - the
 * spikes, the chains, the bomb - and the other 16 are the same shape as a
 * `_blue` and a `_red`. So neutral is a colour a shape may or may not come in,
 * exactly like the four painted ones, and grouping it apart would leave sixteen
 * shapes listed twice.
 */
export const VARIANT_COLOURS = ['neutral', 'blue', 'green', 'red', 'yellow'] as const

export type VariantColour = (typeof VARIANT_COLOURS)[number]

/** The one group every collapsed platformer tile lands in. */
const PLATFORMER_GROUP = { packId: 'platformer', label: 'Platformer' }

/**
 * One thing you can place, with every colour it comes in behind it.
 *
 * The picker's own premise - a search box over a grid, no tree - was written
 * for 86 models and the catalogue now holds 611. But 525 of those are the
 * platformer kit's 155 shapes wearing up to five coats: `arch_blue`,
 * `arch_green`, `arch_red`, `arch_yellow` are one arch. Collapsing a variant
 * set into one tile takes the grid to 241 without inventing tags or folders,
 * which is back inside the range the premise was true for.
 *
 * ---------------------------------------------------------------------------
 * Colour stays four model ids, and does not become a placement property
 * ---------------------------------------------------------------------------
 * The other shape this could take is a `colour` field on the placement over one
 * model id. That is a format change, it means the renderer has to know that
 * some models have a palette and others do not, and it makes the pack table -
 * which is a fact about directories on disk - lie about what is in them.
 *
 * This collapse is presentational only: a tile is a view over ids that already
 * exist, the document still stores `platformer-blue/arch_blue`, and every
 * document written before this still opens. If a genuine recolour ever arrives
 * - a material override rather than a second file - it can be argued then, on
 * its own, without a picker change riding along with it.
 */
export interface CatalogueTile {
  /**
   * The shape, colour suffix removed. Unique within the group, and the React
   * key - `entry.id` would change under the tile every time a colour is picked.
   */
  key: string
  /** The entry this tile currently stands for: the chosen colour's, or the first one it has. */
  entry: CatalogueEntry
  /** Which colours exist, in `VARIANT_COLOURS` order. One member for a shape with no twin. */
  colours: VariantColour[]
  /** Colour to model id, for the swatch row. */
  ids: Partial<Record<VariantColour, string>>
}

/** `arch_blue` in `platformer-blue` is the shape `arch`. Everything else is its own name. */
function variantOf(entry: CatalogueEntry): { key: string; colour: VariantColour } | null {
  if (!entry.packId.startsWith('platformer-')) return null
  const colour = entry.packId.slice('platformer-'.length) as VariantColour
  if (!VARIANT_COLOURS.includes(colour)) return null
  const suffix = `_${colour}`
  return { key: entry.name.endsWith(suffix) ? entry.name.slice(0, -suffix.length) : entry.name, colour }
}

/**
 * The catalogue as tiles, filtered by a query and grouped for the picker.
 *
 * Same matching as `searchCatalogue` - every term somewhere, in any order,
 * underscores and spaces alike - over a haystack that also carries the tile's
 * colours, so "blue" still finds the blue arch even though the tile is called
 * `arch`. A colour term does not *select* the colour; that is the swatch's job,
 * and a search that silently changed what you were holding would be worse than
 * one that only narrows.
 *
 * `prefer` is which colour a tile shows when it has it. It is the picker's own
 * setting rather than a document one: somebody building a blue level wants blue
 * tiles, and that preference is not worth writing into an XP.
 *
 * `only` is the packs the open document declares - undefined for every pack we
 * ship, which is what a picker with no document behind it should show. Filtered
 * here rather than by the caller because a pack the document is not built out
 * of should cost nothing: with 31 packs and 3,892 models, building tiles for a
 * group nobody is going to draw is the difference between a search box that
 * keeps up with typing and one that does not.
 *
 * By *pack* id rather than by group, because that is the vocabulary the
 * document speaks - `packs: [{ id: 'platformer-blue' }]`. The platformer group
 * then collapses whichever of its five colours are declared, which is the
 * right answer to a level built out of blue and red only: one tile per shape,
 * two swatches under it.
 */
export function searchTiles(
  query: string,
  prefer: VariantColour = 'neutral',
  only?: ReadonlySet<string>,
): { packId: string; label: string; tiles: CatalogueTile[] }[] {
  const terms = query.toLowerCase().split(/[\s_]+/).filter(Boolean)

  const plain: { packId: string; label: string; tiles: CatalogueTile[] }[] = []
  const shapes = new Map<string, { entries: Partial<Record<VariantColour, CatalogueEntry>> }>()
  const order: string[] = []

  for (const packId of PACK_ORDER) {
    if (only && !only.has(packId)) continue
    const models = CATALOGUE.filter((entry) => entry.packId === packId)
    for (const entry of models) {
      const variant = variantOf(entry)
      if (!variant) continue
      let shape = shapes.get(variant.key)
      if (!shape) {
        shape = { entries: {} }
        shapes.set(variant.key, shape)
        order.push(variant.key)
      }
      shape.entries[variant.colour] = entry
    }
    if (models.length > 0 && !models[0].packId.startsWith('platformer-')) {
      plain.push({
        packId,
        label: PACKS[packId].label,
        tiles: models.map((entry) => ({ key: entry.name, entry, colours: [], ids: {} })),
      })
    }
  }

  const collapsed: CatalogueTile[] = order.map((key) => {
    const { entries } = shapes.get(key)!
    const colours = VARIANT_COLOURS.filter((colour) => entries[colour])
    const entry = entries[prefer] ?? entries[colours[0]]!
    const ids: Partial<Record<VariantColour, string>> = {}
    for (const colour of colours) ids[colour] = entries[colour]!.id
    return { key, entry, colours, ids }
  })

  const groups =
    collapsed.length > 0 ? [...plain, { ...PLATFORMER_GROUP, tiles: collapsed }] : plain

  return groups
    .map((group) => ({
      ...group,
      tiles: group.tiles.filter((tile) => {
        if (terms.length === 0) return true
        const haystack = `${group.packId} ${tile.key.toLowerCase().replace(/_/g, ' ')} ${tile.colours.join(' ')}`
        return terms.every((term) => haystack.includes(term))
      }),
    }))
    .filter((group) => group.tiles.length > 0)
}

/**
 * A few model ids that show what a pack is, for a preview strip.
 *
 * Spread across the pack rather than taken off the front, and that is the
 * whole of it: a kit is alphabetical on disk, so the first four of the
 * adventure pack are `ammo_crate`, `ammo_crate_withLid`, `arrow_bow` and
 * `arrow_bow_bundle` - four pictures of two things, from a pack that also has
 * swords, shields and potions in it. Four evenly spaced entries are four
 * different objects in every pack we ship.
 *
 * Not a hand-picked list per pack, which is the obvious alternative and the
 * one that rots: thirty-one hand-picked sets is thirty-one things to redo the
 * day a kit is re-exported, and nobody would notice a stale one until the
 * picture stopped matching the pack.
 */
export function packPreview(packId: string, count = 4): string[] {
  const models = CATALOGUE.filter((entry) => entry.packId === packId)
  if (models.length === 0) return []
  const step = Math.max(1, Math.floor(models.length / count))
  const picked: string[] = []
  for (let i = 0; i < models.length && picked.length < count; i += step) {
    picked.push(models[i].id)
  }
  return picked
}

/**
 * The tile a model id belongs to, so a picker opened on a saved document knows
 * which tile is lit and which swatch is on.
 */
export function tileOf(model: string): { key: string; colour: VariantColour } | null {
  const entry = findModel(model)
  return entry ? variantOf(entry) : null
}

/** How many models a pack holds, for the picker's tab counts. */
export function packSize(packId: string): number {
  return PACK_MODELS[packId]?.length ?? 0
}

/** Every model in one pack, in catalogue order. */
export function packModels(packId: string): CatalogueEntry[] {
  return CATALOGUE.filter((entry) => entry.packId === packId)
}

/**
 * A model's display name, pack included, for chips and tooltips.
 *
 * Falls back to the raw id rather than throwing: this is called on whatever is
 * in a loaded document, and an XP written against a pack we have since dropped
 * should show its dangling id, not blow up the toolbar.
 */
export function describeModel(model: string): string {
  const parts = splitModel(model)
  if (!parts) return model
  return `${labelOf(parts.name)} · ${parts.pack.label}`
}
