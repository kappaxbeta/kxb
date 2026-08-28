import { describe, expect, test } from 'bun:test'
import { presetFor, presetNames } from './presets'
import { isKnownModel } from '../assets/catalogue'
import { PACK_MODELS } from '../assets/catalogue.generated'
import { addBlueprint, editing, setBlueprint } from './edit'
import { parseXp, XP_FORMAT, type XpDocument } from './format'
import { entityBox } from './blueprints'

/**
 * What a model already knows about itself.
 *
 * The reason this exists rather than leaving four lines to every level: the four
 * lines have a trap in them. A hazard needs `collider: 'none'`, and the obvious
 * choice - a shallow solid box - is one the character controller *steps you up
 * onto*, so the spikes become a doorstep and nothing dies on them. That took a
 * traced walk to find once and should not have to be found again.
 */

function doc(overrides: Record<string, unknown> = {}): XpDocument {
  const parsed = parseXp({
    format: XP_FORMAT,
    id: 'p',
    name: 'P',
    packs: [{ id: 'proto' }, { id: 'platformer-neutral' }, { id: 'platformer-blue' }],
    world: { floorY: 0, placements: [], marks: [] },
    ...overrides,
  })
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.at}: ${p.message}`).join('\n'))
  return parsed.document
}

describe('what a model already knows', () => {
  test('spikes are a trigger you walk into, not a box you stand on', () => {
    const preset = presetFor('platformer-neutral/floor_spikes_2x2x1')
    expect(preset).not.toBeNull()
    // The whole point of the table. A shallow *solid* collider is under
    // STEP_HEIGHT, so the controller walks you up onto it and nothing fires.
    expect(preset!.collider).toBe('none')
    expect(preset!.triggers?.[0]?.on).toBe('enter')
  })

  /**
   * The platformer kit ships five colourways of the same piece. Keying on the
   * colour would mean five identical entries per hazard and a sixth colourway
   * silently having none.
   */
  test('a colourway gets the same answer as the neutral piece', () => {
    const blue = presetFor('platformer-blue/spikeblock_up_blue')
    expect(blue).not.toBeNull()
    expect(blue!.collider).toBe('none')
    expect(blue!.tags).toContain('hazard')
  })

  /**
   * Not a hazard or a pickup: the preset exists to tag the blueprint, so the
   * editor's Properties panel knows to show the text field at all.
   */
  test('a sign is tagged rather than given a collider or a trigger', () => {
    const preset = presetFor('platformer-neutral/sign')
    expect(preset).not.toBeNull()
    expect(preset!.tags).toContain('sign')
    expect(preset!.collider).toBeUndefined()
    expect(preset!.triggers).toBeUndefined()
  })

  test('most of a kit knows nothing about itself, and that is fine', () => {
    expect(presetFor('proto/Primitive_Wall')).toBeNull()
    expect(presetFor('platformer-blue/platform_4x4x1_blue')).toBeNull()
  })

  test('a model id that is not one gets null rather than throwing', () => {
    expect(presetFor('nonsense')).toBeNull()
    expect(presetFor('proto/Nope')).toBeNull()
  })

  /**
   * A table naming models we do not ship is a table that has drifted from the
   * catalogue - and the failure would be silent, because a preset that never
   * matches simply does nothing.
   */
  test('every name in the table matches something we actually ship', () => {
    const bare = new Set<string>()
    for (const models of Object.values(PACK_MODELS)) {
      for (const model of models) {
        bare.add(model.name.replace(/_(blue|green|red|yellow|neutral)$/, ''))
      }
    }
    for (const name of presetNames()) {
      expect(`${name}: shipped`).toBe(`${name}: ${bare.has(name) ? 'shipped' : 'MISSING'}`)
    }
  })
})

describe('creating a blueprint from one', () => {
  test('copies the behaviour in, so the document carries it', () => {
    const state = addBlueprint(editing(doc()), 'spikes', {
      model: 'platformer-neutral/floor_spikes_2x2x1',
    })!
    const made = state.document.blueprints.spikes
    expect(made.collider).toBe('none')
    expect(made.tags).toContain('hazard')
    expect(made.triggers).toHaveLength(1)
  })

  /**
   * Copied, not referenced. Nothing in the document says where this came from,
   * which is the point: an XP is one file, and a level whose behaviour lives in
   * a table it does not carry is a level that arrives half missing.
   */
  test('and what it wrote survives a round trip through the parser', () => {
    const state = addBlueprint(editing(doc()), 'spikes', {
      model: 'platformer-neutral/floor_spikes_2x2x1',
    })!
    const reread = parseXp(JSON.parse(JSON.stringify(state.document)))
    expect(reread.ok).toBe(true)
    if (!reread.ok) return
    expect(reread.document.blueprints.spikes.triggers).toHaveLength(1)
  })

  test('an explicit field wins over the preset', () => {
    const state = addBlueprint(editing(doc()), 'spikes', {
      model: 'platformer-neutral/floor_spikes_2x2x1',
      collider: 'auto',
    })!
    expect(state.document.blueprints.spikes.collider).toBe('auto')
  })

  test('a model with nothing to say still gets a plain blueprint', () => {
    const state = addBlueprint(editing(doc()), 'wall', { model: 'proto/Primitive_Wall' })!
    expect(state.document.blueprints.wall.collider).toBe('auto')
    expect(state.document.blueprints.wall.triggers).toEqual([])
  })

  /**
   * The property the collider choice exists for, asserted rather than described:
   * a hazard must have no box at all, or the controller treats it as ground.
   */
  test('a hazard built from a preset has no collision box', () => {
    const state = addBlueprint(editing(doc()), 'spikes', {
      model: 'platformer-neutral/floor_spikes_2x2x1',
    })!
    expect(entityBox(state.document.blueprints.spikes, { x: 0, y: 0, z: 0 }, 0)).toBeNull()
  })

  test('every model in the table is one the catalogue accepts', () => {
    // Guards the other direction from the sweep above: a preset keyed on
    // something unshippable would be dead, and one keyed on a real model that
    // the parser then refuses would be worse.
    expect(isKnownModel('platformer-neutral/floor_spikes_2x2x1')).toBe(true)
    expect(isKnownModel('platformer-blue/star_blue')).toBe(true)
  })
})

describe('choosing the model afterwards', () => {
  /**
   * The moment the table is actually for. A new blueprint starts as a floor
   * tile and the model is picked a moment later, so applying presets only at
   * creation would mean they never fired at all.
   */
  test('picking a hazard in the picker makes it a hazard', () => {
    let state = editing(doc())
    state = addBlueprint(state, 'spikes')!
    expect(state.document.blueprints.spikes.triggers).toEqual([])

    state = setBlueprint(state, 'spikes', {
      model: 'platformer-neutral/floor_spikes_2x2x1',
    })!
    expect(state.document.blueprints.spikes.collider).toBe('none')
    expect(state.document.blueprints.spikes.triggers).toHaveLength(1)
  })

  /**
   * The safety of the whole thing. Anyone who has edited the collider, the
   * tags, the properties or the triggers has said something about this
   * blueprint, and replacing it because they changed the model would throw away
   * work - much worse than a preset that did not fire.
   */
  test('but never over work somebody has already done', () => {
    let state = editing(doc())
    state = addBlueprint(state, 'spikes')!
    state = setBlueprint(state, 'spikes', { tags: ['mine'] })!
    state = setBlueprint(state, 'spikes', {
      model: 'platformer-neutral/floor_spikes_2x2x1',
    })!
    expect(state.document.blueprints.spikes.tags).toEqual(['mine'])
    expect(state.document.blueprints.spikes.collider).toBe('auto')
    expect(state.document.blueprints.spikes.triggers).toEqual([])
  })

  test('and a model with nothing to say changes only the model', () => {
    let state = editing(doc())
    state = addBlueprint(state, 'wall')!
    state = setBlueprint(state, 'wall', { model: 'proto/Primitive_Wall' })!
    expect(state.document.blueprints.wall.model).toBe('proto/Primitive_Wall')
    expect(state.document.blueprints.wall.triggers).toEqual([])
  })
})
