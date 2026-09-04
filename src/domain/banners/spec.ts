/**
 * What a store banner is, as a value.
 *
 * The tool edits one of these and the painter draws one of these, which is the
 * whole reason it is a type and not a pile of props: the preview on screen and
 * the PNG that goes to App Store Connect come out of the same function reading
 * the same object, so there is no second layout to keep in step with the first.
 *
 * Everything here is content or choice. Nothing here is geometry - where the
 * headline sits on a 1290-wide canvas is `devices.ts`, and it is not editable,
 * because a banner that can be nudged is a banner that stops matching the other
 * eleven.
 */
import type { Locale } from '@/domain/i18n/locale'

/**
 * The canvases App Store Connect accepts, by the slot each one fills.
 *
 * Not one iPhone size but three, because the store asks per *slot* and refuses
 * a picture that is a few pixels off: a 6.9" render offered to the 6.5" slot
 * comes back as "Mindestens ein Screenshot weist falsche Maße auf", which is
 * true and unhelpful - the sizes are within half a percent of each other and
 * look identical side by side.
 */
export type DeviceKey = 'iphone69' | 'iphone67' | 'iphone65' | 'ipad13' | 'ipad129'

/**
 * Which of the three pitches a panel belongs to.
 *
 * `overview` is the three that carry the whole story - play, create, share.
 * The rest are the standalone ones that take a single sentence out of an
 * overview and give it a page. The grouping is not decoration: it decides the
 * order they are listed in and, on the day somebody uploads them, which three
 * go first.
 */
export type PanelGroup = 'overview' | 'play' | 'create' | 'share'

/**
 * How more than one capture frame is arranged.
 *
 * `rows` stacks wide strips down the panel, which is the shape an editor
 * screenshot is: a timeline, a code pane, a level laid out sideways. `columns`
 * stands them beside each other, which is the shape a phone screenshot is.
 * Picking wrong is not a style mistake - it is the difference between a
 * screenshot that fills its frame and one that gets cropped to a band across
 * the middle of itself.
 */
export type SlotLayout = 'rows' | 'columns'

/** The words, in one language. */
export interface PanelCopy {
  /** The pixel headline. Short, and about the picture rather than the product. */
  funny: string
  /** The feature, said plainly. */
  title: string
  /** How it works, in two or three sentences. */
  body: string
}

/**
 * A place a gameplay capture gets pasted in by hand.
 *
 * The label is drawn *above* the rectangle and never inside it, so pasting a
 * capture over the slot never has to cover type - which is the reason a panel
 * can afford three of these without the labels becoming a problem.
 */
export interface SlotRect {
  x: number
  y: number
  w: number
  h: number
  label: string | null
}

/** One panel, in every language it is written in. */
export interface Panel {
  id: string
  group: PanelGroup
  /** Public path to the big transparent render that carries the panel. */
  character: string
  /** Public path to the one object that names the feature. */
  hero: string
  /** Public paths to the row along the bottom. */
  band: string[]
  /** How many capture slots, how they sit, and what each is called. */
  slots: number
  slotLayout?: SlotLayout
  slotLabels?: Record<Locale, string[]>
  copy: Record<Locale, PanelCopy>
}

/**
 * How a capture is sized into its frame.
 *
 * `cover` fills the frame and clips whichever axis overflows. `contain` fits
 * the whole picture inside and lets the backing show - the only honest option
 * when the shapes disagree badly, since a tall phone screenshot in a wide strip
 * has to be either shrunk or beheaded.
 *
 * `height` and `width` are `cover` with the choice made by hand rather than by
 * arithmetic: match the frame's height and crop the sides, or match its width
 * and crop top and bottom. `cover` always picks whichever crops less, and that
 * is usually right and occasionally exactly wrong - a screenshot whose subject
 * is at the bottom wants its width matched even when that crops more.
 */
export type CaptureFit = 'cover' | 'contain' | 'height' | 'width'

/** One screenshot, and how it sits in its frame. */
export interface BannerCapture {
  /** A data URL. Nothing here ever points at a file the painter cannot reach. */
  src: string
  fit: CaptureFit
}

/** A panel, in one language, on one canvas: everything the painter needs. */
export interface BannerSpec {
  device: DeviceKey
  locale: Locale
  copy: PanelCopy
  character: string
  hero: string
  band: string[]
  slots: number
  slotLayout: SlotLayout
  slotLabels: string[]
  /**
   * What goes in the frames, one entry per slot.
   *
   * `null` for a frame left empty, and empty is a first-class state rather
   * than a missing value: a panel with nothing in it yet is what gets handed
   * to whoever is taking the screenshots, and it has to draw.
   */
  captures: (BannerCapture | null)[]
  /**
   * A word drawn inside each frame, in the pixel face.
   *
   * Not the caption above the frame - that one names what the screenshot is,
   * and belongs to the layout. This is a label on the picture: "LEVEL 3",
   * "2 PLAYERS", the thing a store panel points at. `null` for a frame that
   * says nothing, which is most of them.
   */
  slotTexts: (string | null)[]
  /** What colour those are drawn in. One colour, so the panel stays coherent. */
  slotTextColor: string
  /**
   * Whether the word sits on the picture or next to it.
   *
   * `over` is a label on a screenshot. `beside` gives the word its own half of
   * the frame and shrinks the picture into the other one - which is the better
   * answer whenever the screenshot is busy, because a pixel face over a
   * cluttered game view is unreadable however heavy its shadow is.
   *
   * Which way the frame splits is not a setting: a wide frame splits left and
   * right, a tall one splits top and bottom, because the alternative in each
   * case leaves a picture too letterboxed to see.
   */
  slotTextPlace: 'over' | 'beside'
  /** Glints scattered over the cast. Off makes a quieter panel. */
  sparkles: boolean
  /**
   * Frames sitting a degree or two off square.
   *
   * Off by default, and not only for taste: a tilted frame is no longer at the
   * coordinates `slots.json` reports, so it breaks the workflow where an empty
   * panel is rendered first and the captures are pasted in afterwards. Turn it
   * on once the pictures are in the frames.
   */
  jaunty: boolean
  /** The half of the stance that is always said, in the accent colour. */
  tagline: string
  /**
   * What the loose voxels behind the panel are arranged by.
   *
   * The scatter is random once and then it is the layout: the same seed has to
   * give the same picture every time the tool redraws, or nudging a comma in
   * the body copy would reshuffle the background and the twelve panels would
   * stop looking like a set.
   */
  seed: number
}

/**
 * What art the tool may reach for, grouped for a picker.
 *
 * The type lives here rather than beside the reader that fills it, because the
 * reader touches `node:fs` and the editor is a Client Component: a type is
 * erased at compile time and can cross that line, and the function that walks
 * a directory cannot.
 */
export interface ArtCatalogue {
  /** The big transparent renders: one animal, or a whole staged scene. */
  cast: { label: string; items: string[] }[]
  /** The small objects: the hero, and everything in the bottom row. */
  objects: { label: string; items: string[] }[]
}
