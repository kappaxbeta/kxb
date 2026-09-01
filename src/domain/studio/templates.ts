import { jumpLength } from '@/domain/studio/action'
import { DEFAULT_LIGHT } from '@/domain/studio/scene'
import { DEFAULT_ACTOR, DEFAULT_SHOT, type ShotSpec } from '@/domain/studio/shot'

/**
 * Ten scenes that already work.
 *
 * The empty studio is the hardest thing in it. Everything here can be done from
 * a blank timeline in about four minutes, and knowing *that* is the part nobody
 * has when they open it for the first time - so these exist to be opened,
 * watched once, and then taken apart.
 *
 * ---------------------------------------------------------------------------
 * Why they are code and not rows
 * ---------------------------------------------------------------------------
 * They ship with the app and nobody edits them in place - opening one makes a
 * document in the address bar, exactly like opening any other link, and saving
 * it makes a scene of your own. A table would mean seeding, a migration, and a
 * set of rows that could be deleted by accident in a way that leaves the
 * studio's front door empty.
 *
 * ---------------------------------------------------------------------------
 * Each one demonstrates one thing
 * ---------------------------------------------------------------------------
 * Deliberately, and it is written on each: the first is dialogue, the second is
 * a keyed prop, the third is the camera. A gallery of ten scenes that all use
 * every feature is a gallery where nothing is legible.
 */

export interface Template {
  id: string
  name: string
  /** The one thing it is for. Shown on the card. */
  teaches: string
  shot: ShotSpec
}

/** Shared bones: everything is 8 seconds on a small patch of grass unless it says otherwise. */
function base(overrides: Partial<ShotSpec> = {}): ShotSpec {
  return {
    ...DEFAULT_SHOT,
    duration: 8,
    cast: [],
    blocks: [],
    goals: [],
    balls: [],
    light: { ...DEFAULT_LIGHT, tracks: {} },
    camera: [{ t: 0, position: [8.2, 4.2, 9], target: [0, 1.1, 0], fov: 34 }],
    ...overrides,
  }
}

const actor = (avatar: string, fields: Partial<(typeof DEFAULT_ACTOR)> = {}) => ({
  ...DEFAULT_ACTOR,
  avatar,
  name: avatar[0].toUpperCase() + avatar.slice(1),
  ...fields,
})

export const TEMPLATES: readonly Template[] = [
  {
    id: 'rock',
    name: 'Kick the rock',
    teaches: 'A keyed prop, reacting to something an animal did',
    shot: base({
      duration: 9,
      ground: { cols: 13, rows: 11, top: 'dirt_with_grass', rounded: true },
      cast: [
        actor('hog', {
          name: 'Hog',
          x: -3.4,
          z: 1.2,
          rotation: 90,
          actions: [
            { kind: 'move', t: 0.4, duration: 2.2, x: -0.9, z: 1.2 },
            // The wind-up and the contact. The rock's own wobble below is keyed
            // to land on the same instant - which is the whole trick, and the
            // reason both are written here rather than tuned separately.
            { kind: 'kick', t: 2.7, duration: 0.5 },
            { kind: 'talk', t: 3.3, duration: 1.6, text: 'OW. Ow ow ow.' },
            { kind: 'shake', t: 4.9, duration: 0.96 },
            { kind: 'emote', t: 5.2, duration: 3, emote: 25 },
          ],
        }),
        actor('crab', {
          name: 'Crab',
          x: 2.6,
          z: 2.4,
          rotation: -120,
          actions: [
            { kind: 'emote', t: 3.4, duration: 3.4, emote: 2 },
            { kind: 'talk', t: 3.6, duration: 2.4, text: 'HA! It is a rock!' },
            { kind: 'dance', t: 6, duration: 2.6 },
          ],
        }),
      ],
      blocks: [
        {
          model: 'stone',
          x: -0.2,
          top: 1,
          z: 1.2,
          rotation: 0,
          time: 0,
          scale: 1,
          tint: null,
          pitch: 0,
          roll: 0,
          // A wobble, not a launch. The rock is heavy and the joke is that it
          // does not care - so it rocks a few degrees and settles, and the
          // hold at the end is what stops it drifting for the rest of the shot.
          tracks: {
            rotation: [
              { t: 2.85, value: 0, ease: 'smooth' },
              { t: 2.99, value: 13, ease: 'smooth' },
              { t: 3.18, value: -9, ease: 'smooth' },
              { t: 3.4, value: 4, ease: 'smooth' },
              { t: 3.7, value: 0, ease: 'hold' },
            ],
            top: [
              { t: 2.85, value: 1, ease: 'smooth' },
              { t: 2.98, value: 1.12, ease: 'smooth' },
              { t: 3.2, value: 1, ease: 'hold' },
            ],
          },
        },
      ],
      camera: [
        { t: 0, position: [7.4, 3.4, 8.4], target: [-1, 1, 1.4], fov: 36 },
        { t: 3, position: [4.2, 2.2, 5.4], target: [-0.6, 0.8, 1.2], fov: 30 },
        { t: 9, position: [6.6, 3, 7.4], target: [0.6, 1, 1.6], fov: 34 },
      ],
    }),
  },
  {
    id: 'standoff',
    name: 'The standoff',
    teaches: 'Two actors talking in turn, and a camera that closes in',
    shot: base({
      duration: 10,
      ground: { cols: 15, rows: 11, top: 'dirt_with_grass', rounded: true },
      cast: [
        actor('fox', {
          x: -3.2,
          z: 0,
          rotation: 90,
          actions: [
            { kind: 'talk', t: 0.6, duration: 2, text: 'You took the last melon.' },
            { kind: 'move', t: 3.2, duration: 1.4, x: -1.6, z: 0 },
            { kind: 'talk', t: 6.6, duration: 2.2, text: 'I am going to remember this.' },
          ],
        }),
        actor('panda', {
          x: 3.2,
          z: 0,
          rotation: -90,
          actions: [
            { kind: 'talk', t: 3, duration: 2.6, text: 'I did. It was delicious.' },
            { kind: 'emote', t: 5.6, duration: 3, emote: 2 },
            { kind: 'shake', t: 8.6, duration: 1.2 },
          ],
        }),
      ],
      blocks: [{ model: 'melon', x: 0, top: 1, z: -2.4, rotation: 0, time: 0, scale: 1, tint: null, pitch: 0, roll: 0, tracks: {} }],
      camera: [
        { t: 0, position: [0.4, 6.4, 11], target: [0, 1.2, 0], fov: 40 },
        { t: 10, position: [0.2, 2.2, 5.2], target: [0, 1.2, 0], fov: 28 },
      ],
    }),
  },
  {
    id: 'entrance',
    name: 'The big entrance',
    teaches: 'A run, a jump, and everybody reacting on the same beat',
    shot: base({
      duration: 8,
      ground: { cols: 15, rows: 13, top: 'dirt_with_grass', rounded: true },
      cast: [
        actor('tiger', {
          x: -7,
          z: 0,
          rotation: 90,
          // Fast enough to be a run, which the clip picks up on its own.
          actions: [
            { kind: 'move', t: 0.6, duration: 1.6, x: -0.5, z: 0 },
            { kind: 'jump', t: 2.1, duration: jumpLength(true), air: true },
            { kind: 'talk', t: 3.4, duration: 1.8, text: 'Did somebody say melon?' },
          ],
        }),
        actor('bunny', {
          x: 2.2,
          z: 1.6,
          rotation: -140,
          actions: [{ kind: 'emote', t: 2.3, duration: 3, emote: 8 }],
        }),
        actor('deer', {
          x: 2.8,
          z: -1.8,
          rotation: -120,
          actions: [
            { kind: 'emote', t: 2.4, duration: 3, emote: 8 },
            { kind: 'move', t: 3.2, duration: 1, x: 4.6, z: -2.8 },
          ],
        }),
      ],
      blocks: [{ model: 'hay_bale', x: -3.6, top: 1, z: -3, rotation: 0, time: 0, scale: 1, tint: null, pitch: 0, roll: 0, tracks: {} }],
      camera: [{ t: 0, position: [1.4, 3.6, 10.4], target: [0, 1.2, 0], fov: 38 }],
    }),
  },
  {
    id: 'dance-off',
    name: 'Dance-off',
    teaches: 'Overlapping dances, and a light that changes with them',
    shot: base({
      duration: 10,
      background: { colour: '#12061f', image: null },
      ground: { cols: 11, rows: 11, top: 'stone_dark', rounded: true },
      cast: [
        actor('penguin', { x: -2, z: 0, rotation: 40, actions: [{ kind: 'dance', t: 0.4, duration: 4 }] }),
        actor('monkey', { x: 2, z: 0, rotation: -40, actions: [{ kind: 'dance', t: 4.4, duration: 4 }] }),
        actor('parrot', {
          x: 0,
          z: -2.6,
          rotation: 180,
          actions: [
            { kind: 'emote', t: 2, duration: 3, emote: 27 },
            { kind: 'dance', t: 8.4, duration: 1.6 },
          ],
        }),
      ],
      light: {
        ...DEFAULT_LIGHT,
        sun: 1.2,
        rim: 2.4,
        tracks: {
          // The rim swings between the two of them, which is the cheapest way
          // to make a static camera feel like a cut.
          azimuth: [
            { t: 0, value: -120, ease: 'smooth' },
            { t: 4.4, value: 120, ease: 'smooth' },
            { t: 8.4, value: 0, ease: 'smooth' },
          ],
          rim: [
            { t: 0, value: 2.4, ease: 'smooth' },
            { t: 5, value: 3.6, ease: 'smooth' },
            { t: 10, value: 2.4, ease: 'smooth' },
          ],
        },
      },
      camera: [{ t: 0, position: [0, 4, 9.4], target: [0, 1.2, -0.6], fov: 36 }],
    }),
  },
  {
    id: 'delivery',
    name: 'The delivery',
    teaches: 'A prop that travels, keyed alongside somebody carrying it',
    shot: base({
      duration: 9,
      ground: { cols: 17, rows: 11, top: 'dirt_with_grass', rounded: true },
      cast: [
        actor('beaver', {
          x: -5.5,
          z: 0.6,
          rotation: 90,
          actions: [
            { kind: 'move', t: 0.4, duration: 3.6, x: 3, z: 0.6 },
            { kind: 'talk', t: 4.2, duration: 2, text: 'One crate. Sign here.' },
          ],
        }),
        actor('koala', {
          x: 4.6,
          z: 0.6,
          rotation: -90,
          actions: [
            { kind: 'emote', t: 4.4, duration: 3, emote: 14 },
            { kind: 'talk', t: 6.6, duration: 2, text: 'I did not order a crate.' },
          ],
        }),
      ],
      blocks: [
        {
          model: 'crate',
          x: -5.5,
          top: 2.4,
          z: 0.6,
          rotation: 0,
          time: 0,
          scale: 1,
          tint: null,
          pitch: 0,
          roll: 0,
          // Rides along above the beaver's head for the length of the walk, then
          // is put down. Two tracks doing what one move does for an actor, which
          // is the honest cost of a prop having no verbs of its own.
          tracks: {
            x: [
              { t: 0.4, value: -5.5, ease: 'linear' },
              { t: 4, value: 3, ease: 'hold' },
            ],
            top: [
              { t: 4, value: 2.4, ease: 'smooth' },
              { t: 4.6, value: 1, ease: 'hold' },
            ],
          },
        },
      ],
      camera: [{ t: 0, position: [-0.4, 3.6, 9.6], target: [-0.4, 1.2, 0.6], fov: 38 }],
    }),
  },
  {
    id: 'flyby',
    name: 'Flyby',
    teaches: 'Three camera keys, and why easing matters',
    shot: base({
      duration: 9,
      ground: { cols: 21, rows: 17, top: 'dirt_with_grass', rounded: true },
      cast: [
        actor('giraffe', { x: 0, z: 0, rotation: 20, actions: [{ kind: 'emote', t: 4, duration: 3, emote: 2 }] }),
        actor('elephant', { x: -4, z: 3, rotation: 60, actions: [] }),
        actor('chick', { x: 3.6, z: -2.4, rotation: -150, actions: [{ kind: 'jump', t: 5.4, duration: jumpLength(false), air: false }] }),
      ],
      blocks: [
        { model: 'tree', x: -6, top: 1, z: -4, rotation: 0, time: 0, scale: 1, tint: null, pitch: 0, roll: 0, tracks: {} },
        { model: 'tree', x: 6.5, top: 1, z: -5, rotation: 0, time: 0, scale: 1, tint: null, pitch: 0, roll: 0, tracks: {} },
        { model: 'barrel', x: 2, top: 1, z: 4, rotation: 0, time: 0, scale: 1, tint: null, pitch: 0, roll: 0, tracks: {} },
      ],
      camera: [
        { t: 0, position: [-13, 2.2, 12], target: [0, 1.2, 0], fov: 42 },
        { t: 4.5, position: [0, 7.4, 13], target: [0, 1.2, 0], fov: 34 },
        { t: 9, position: [12, 2.4, 10], target: [0, 1.2, 0], fov: 42 },
      ],
    }),
  },
  {
    id: 'penalty',
    name: 'The penalty',
    teaches: 'A ball keyed to a kick, and a goal',
    shot: base({
      duration: 8,
      ground: { cols: 17, rows: 15, top: 'dirt_with_grass', rounded: true },
      cast: [
        actor('dog', {
          x: 0,
          z: 3.4,
          rotation: 0,
          actions: [
            { kind: 'move', t: 0.6, duration: 1.4, x: 0, z: 1.6 },
            { kind: 'kick', t: 2.1, duration: 0.5 },
            { kind: 'emote', t: 4.2, duration: 3, emote: 2 },
          ],
        }),
        actor('cat', {
          x: 0.4,
          z: -5.4,
          rotation: 180,
          actions: [
            { kind: 'move', t: 2.4, duration: 0.6, x: -1.6, z: -5.4 },
            { kind: 'shake', t: 3.6, duration: 1.2 },
          ],
        }),
      ],
      goals: [{ x: 0, z: -6, rotation: 0, width: 5, height: 3, colour: '#3b82f6', tracks: {} }],
      balls: [
        {
          x: 0,
          y: 0.42,
          z: 0.8,
          radius: 0.42,
          // Flat, fast and slightly lifted. A ball that arcs properly wants a
          // parabola, which is four keys nobody wants to place by hand - and
          // this reads correctly at the speed it travels.
          tracks: {
            z: [
              { t: 2.3, value: 0.8, ease: 'linear' },
              { t: 3.1, value: -5.6, ease: 'hold' },
            ],
            y: [
              { t: 2.3, value: 0.42, ease: 'smooth' },
              { t: 2.7, value: 1.3, ease: 'smooth' },
              { t: 3.1, value: 0.42, ease: 'hold' },
            ],
          },
        },
      ],
      camera: [{ t: 0, position: [6.4, 3.6, 7.4], target: [0, 1, -1.6], fov: 40 }],
    }),
  },
  {
    id: 'queue',
    name: 'The queue',
    teaches: 'Timing four actors so they move one after another',
    shot: base({
      duration: 10,
      ground: { cols: 15, rows: 11, top: 'stone', rounded: false },
      cast: [
        actor('pig', { x: -1.5, z: 0, rotation: 90, actions: [{ kind: 'move', t: 0.5, duration: 1, x: 0.5, z: 0 }, { kind: 'talk', t: 1.7, duration: 1.6, text: 'Finally.' }] }),
        actor('cow', { x: -3, z: 0, rotation: 90, actions: [{ kind: 'move', t: 1.5, duration: 1, x: -1.5, z: 0 }] }),
        actor('bee', { x: -4.5, z: 0, rotation: 90, actions: [{ kind: 'move', t: 2.5, duration: 1, x: -3, z: 0 }, { kind: 'emote', t: 5, duration: 3, emote: 14 }] }),
        actor('caterpillar', {
          x: -6,
          z: 0,
          rotation: 90,
          actions: [
            { kind: 'move', t: 3.5, duration: 1, x: -4.5, z: 0 },
            { kind: 'talk', t: 6, duration: 2.4, text: 'I have been here since Tuesday.' },
          ],
        }),
      ],
      blocks: [{ model: 'vault', x: 2.4, top: 1, z: 0, rotation: 0, time: 0, scale: 1, tint: null, pitch: 0, roll: 0, tracks: {} }],
      camera: [{ t: 0, position: [-1.4, 3, 8.6], target: [-1.4, 1.1, 0], fov: 40 }],
    }),
  },
  {
    id: 'growth',
    name: 'Growth spurt',
    teaches: 'Keying an actor’s size, which no verb can do',
    shot: base({
      duration: 8,
      ground: { cols: 13, rows: 11, top: 'dirt_with_grass', rounded: true },
      cast: [
        actor('fish', {
          x: -1.6,
          z: 0,
          rotation: 60,
          actions: [
            { kind: 'talk', t: 0.6, duration: 1.8, text: 'It was THIS big.' },
            { kind: 'emote', t: 5.4, duration: 3, emote: 2 },
          ],
          // Size is a keyed property, not an action - so this is the template
          // that shows what the key rows in the timeline are for.
          tracks: {
            scale: [
              { t: 0.6, value: 1, ease: 'smooth' },
              { t: 2.6, value: 2.4, ease: 'smooth' },
              { t: 4.6, value: 1, ease: 'hold' },
            ],
          },
        }),
        actor('polar', {
          x: 2.4,
          z: 0.6,
          rotation: -110,
          actions: [{ kind: 'shake', t: 3, duration: 1.6 }, { kind: 'talk', t: 4.8, duration: 2, text: 'It was not.' }],
        }),
      ],
      camera: [{ t: 0, position: [0.6, 3.2, 8.4], target: [0.2, 1.4, 0], fov: 36 }],
    }),
  },
  {
    id: 'night-shift',
    name: 'Night shift',
    teaches: 'A dark rig, a backdrop, and one animal alone',
    shot: base({
      duration: 9,
      background: { colour: '#0a0714', image: null },
      ground: { cols: 11, rows: 9, top: 'stone_dark', rounded: true },
      cast: [
        actor('cat', {
          x: 0,
          z: 0,
          rotation: 150,
          actions: [
            { kind: 'move', t: 0.6, duration: 2.4, x: -2.2, z: 1.4 },
            { kind: 'talk', t: 3.4, duration: 2.6, text: 'Everyone else went home hours ago.' },
            { kind: 'move', t: 6.4, duration: 2.4, x: 2.6, z: -0.6 },
          ],
        }),
      ],
      blocks: [
        { model: 'computer', x: 3, top: 1, z: -1, rotation: 0, time: 0, scale: 1, tint: null, pitch: 0, roll: 0, tracks: {} },
        { model: 'trashcan', x: -3.4, top: 1, z: -2, rotation: 0, time: 0, scale: 1, tint: null, pitch: 0, roll: 0, tracks: {} },
      ],
      light: {
        ...DEFAULT_LIGHT,
        sun: 0.5,
        ambient: 0.35,
        hemisphere: 0.4,
        rim: 2.8,
        tracks: {},
      },
      camera: [
        { t: 0, position: [5.4, 2.6, 6.6], target: [0, 1.1, 0], fov: 34 },
        { t: 9, position: [4.2, 2, 6], target: [1, 1, -0.4], fov: 32 },
      ],
    }),
  },
]

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((template) => template.id === id)
}
