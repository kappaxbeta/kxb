/**
 * What a model already knows about itself.
 *
 * A `floor_spikes` is a hazard in every level anybody will ever build with it.
 * Without this, every one of those levels writes the same four lines - collider
 * `none`, tag `hazard`, an `enter` trigger, a `damage` verb - and gets them
 * subtly wrong in the ways this repo has already discovered: a solid collider
 * half a cell tall is a doorstep the controller walks you up onto rather than
 * spikes you die on, which took a trace of a walk to find and is not the sort of
 * thing an author should have to rediscover.
 *
 * ---------------------------------------------------------------------------
 * Copied into the document, never referenced from it
 * ---------------------------------------------------------------------------
 * This is the decision the whole file hangs on. A blueprint created from a
 * preset is a *plain blueprint* in the document - the four lines are written
 * out, and nothing records that they came from here.
 *
 * The alternative is a document that says `preset: 'spikes'` and looks tidier
 * right up until it is handed to somebody: an XP is one file (§3.1), and a level
 * whose behaviour lives in a table it does not carry is a level that arrives
 * half missing. It also means changing a preset would silently change every
 * level ever built from it, which is the kind of action-at-a-distance nobody
 * asks for and everybody has to debug.
 *
 * So: a starting point, not an inheritance. Edit the blueprint afterwards and
 * nothing here objects, because nothing here is watching.
 *
 * ---------------------------------------------------------------------------
 * Keyed by the bare name, not the full id
 * ---------------------------------------------------------------------------
 * The platformer kit ships its pieces in five colourways -
 * `platformer-blue/spikeblock_up_blue`, and four more - which are the same
 * *thing* five times. Keying on the colour would mean five identical entries
 * per hazard and a sixth colourway silently having none, so the lookup strips
 * the pack and the colour suffix and asks about `spikeblock_up`.
 */

import type { Blueprint } from './blueprints'
import { splitModel } from '../assets/packs'

/** The fields a preset fills in. Never the model - that is what was asked about. */
export type BlueprintPreset = Partial<Omit<Blueprint, 'model'>>

/** Kill whatever walks in. The shape three documents have already written by hand. */
const LETHAL: BlueprintPreset = {
  /**
   * `none`, and this is the field the preset exists for.
   *
   * A solid collider under `STEP_HEIGHT` - which half a cell is - means the
   * controller helpfully steps the player *onto* the spikes and they stroll
   * across the top with their health untouched. It was traced from a walk: feet
   * at 2.5 crossing a patch topping out at 2.5, `hp` never moving. Anything
   * whose point is a trigger has to be something you can walk into.
   */
  collider: 'none',
  tags: ['hazard'],
  props: {},
  triggers: [{ on: 'enter', do: [{ op: 'damage', target: 'other', amount: 99 }] }],
}

/**
 * Every model this knows something about, by bare name.
 *
 * Deliberately short. A preset is worth writing when the *same* four lines would
 * otherwise be written in every level - not for everything that could
 * conceivably have behaviour. A crate that breaks is a design decision with
 * numbers in it; a spike is a spike.
 */
const PRESETS: Readonly<Record<string, BlueprintPreset>> = {
  floor_spikes_2x2x1: LETHAL,
  floor_spikes_4x4x1: LETHAL,
  floor_spikes_curved_4x2x2: LETHAL,
  floor_spikes_trap_2x2x1: LETHAL,
  floor_spikes_trap_4x4x1: LETHAL,

  spikeblock_up: LETHAL,
  spikeblock_down: LETHAL,
  spikeblock_left: LETHAL,
  spikeblock_right: LETHAL,
  spikeblock_omni: LETHAL,
  spikeblock_quad: LETHAL,
  spikeblock_double_horizontal: LETHAL,
  spikeblock_double_vertical: LETHAL,

  spikeball: LETHAL,
  spikeball_hanger: LETHAL,
  spikeroller_horizontal: LETHAL,
  spikeroller_vertical: LETHAL,

  saw_trap: LETHAL,
  saw_trap_double: LETHAL,
  saw_trap_long: LETHAL,

  /**
   * The blade is solid *and* lethal, which is the one that is not just LETHAL.
   *
   * A box rather than the disc it is drawn as, and narrow, so a sweeping blade
   * is a gate that opens and shuts rather than a wall. Two cells tall so it
   * cannot be jumped on the spot: the way past a saw is to wait, not to
   * out-jump it.
   */
  sawblade: {
    collider: { w: 5, h: 1.4, d: 3 },
    tags: ['hazard'],
    props: {},
    triggers: [{ on: 'enter', do: [{ op: 'damage', target: 'other', amount: 99 }] }],
  },

  /**
   * A coin's shape, not a hazard's: walk through it, and it is gone when you do.
   *
   * `despawn` rather than `deactivate` here on purpose - a star somebody has
   * collected has been collected, and a document that wants it to come back can
   * say so by changing one verb. The preset guesses the common case and is easy
   * to argue with.
   */
  star: {
    collider: 'none',
    tags: ['pickup'],
    props: { value: 1 },
    triggers: [{ on: 'enter', do: [{ op: 'score', amount: 1 }, { op: 'despawn', target: 'self' }] }],
  },
  diamond: {
    collider: 'none',
    tags: ['pickup'],
    props: { value: 5 },
    triggers: [{ on: 'enter', do: [{ op: 'score', amount: 5 }, { op: 'despawn', target: 'self' }] }],
  },
  heart: {
    collider: 'none',
    tags: ['pickup'],
    props: { value: 1 },
    triggers: [{ on: 'enter', do: [{ op: 'heal', amount: 1, target: 'other' }, { op: 'despawn', target: 'self' }] }],
  },

  /**
   * Not a hazard or a pickup - the tag is what the editor's Properties panel
   * reads to decide whether to show the text field at all, the same way
   * `savesProgress` decides whether to show `order`. No collider override: a
   * signpost is solid, the way the catalogue box for it already says.
   */
  sign: {
    tags: ['sign'],
    props: {},
  },
}

/**
 * The colourway suffix the platformer kit puts on its coloured pieces.
 *
 * Stripped so one entry covers all five. A model whose name genuinely ends in a
 * colour word and is *not* a colourway would be mis-stripped, which is a real
 * risk and a small one: the lookup would simply miss, and a missed preset is a
 * blueprint the author fills in themselves.
 */
const COLOURWAY = /_(blue|green|red|yellow|neutral)$/

/**
 * What this model already knows about itself, or null.
 *
 * Null is the common answer and is not a failure - most of a kit is scenery, and
 * a preset for everything would be a table nobody could keep true.
 */
export function presetFor(model: string): BlueprintPreset | null {
  const parts = splitModel(model)
  if (!parts) return null
  const bare = parts.name.replace(COLOURWAY, '')
  return PRESETS[bare] ?? null
}

/** Every bare model name this knows about. For a test, and for a panel that wants to say so. */
export function presetNames(): string[] {
  return Object.keys(PRESETS)
}
