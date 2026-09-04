---
name: kxb.team
description: A voxel arcade seen from inside its own night sky — neon on indigo, pixel type, and real renders instead of illustration.
colors:
  sky: "oklch(0.08 0.04 285)"
  surface: "oklch(0.1 0.035 285)"
  surface-raised: "oklch(0.16 0.04 285 / 0.9)"
  line: "oklch(0.66 0.16 275 / 0.6)"
  ink: "oklch(0.97 0.015 300)"
  ink-muted: "oklch(0.76 0.05 292)"
  accent: "oklch(0.7 0.27 322)"
  accent-2: "oklch(0.85 0.15 195)"
  danger: "oklch(0.7 0.21 20)"
  ok: "oklch(0.78 0.18 165)"
  warn: "oklch(0.82 0.16 80)"
typography:
  display:
    fontFamily: "var(--font-pixel-millennium), ui-monospace, monospace"
    fontSize: "clamp(1.5rem, 5.2vw, 2.75rem)"
    fontWeight: 400
    lineHeight: 1.18
    letterSpacing: "normal"
  doc-title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.62rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.18em"
  rail-body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  rail-note:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  field: "0.5rem"
  card: "1rem"
  panel: "1.5rem"
  pill: "999px"
spacing:
  xs: "0.35rem"
  sm: "0.85rem"
  md: "1.5rem"
  lg: "2rem"
  xl: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "oklch(0.16 0.04 300)"
    rounded: "{rounded.pill}"
    padding: "0.65rem 1.5rem"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "oklch(0.76 0.25 322)"
    textColor: "oklch(0.16 0.04 300)"
    rounded: "{rounded.pill}"
    padding: "0.65rem 1.5rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "0.65rem 1.5rem"
  button-ghost-hover:
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0.65rem 1.5rem"
  field:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0.5rem 0.75rem"
    typography: "{typography.body}"
  panel:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "1.5rem"
---

# Design System: kxb.team

## Overview

**Creative North Star: "A room seen from inside its own night sky"**

Every surface sits on one continuous indigo-black sky with a starfield behind it.
Nothing is a page on a background; things are lit objects standing in a dark
room. Two neons do all the signalling — fuchsia is the colour of anything you
can act on, cyan is the cold edge of everything that is finished, structural, or
ours. The one display face is a pixel face, and the product's own 3D renders do
the work illustration would otherwise do.

The rule that keeps it honest: **pictures are shot, not drawn.** Every render on
the site comes out of `/world/shots`, rendered by the same three.js the lounge
runs, so a page cannot advertise a block, an animal or a room the product does
not have.

## Colors

Dark is not a theme here; it is the subject. `color-scheme: dark` is declared on
`html` and there is no light variant.

### Primary

`accent` — `oklch(0.7 0.27 322)`, fuchsia. Reserved for interaction: primary
buttons, links, the current step, focus. If it is fuchsia, you can press it.

### Secondary

`accent-2` — `oklch(0.85 0.15 195)`, cyan. The cold half: finished states,
structural labels, ownership marks, document furniture. Never a primary action.

### Neutral

`sky` `oklch(0.08 0.04 285)` is the page under everything. `surface`
`oklch(0.1 0.035 285)` and `surface-raised` `oklch(0.16 0.04 285 / 0.9)` are
panels over it — raised carries alpha on purpose so panels read as glass over
space. `ink` and `ink-muted` are both tinted violet rather than grey.

### Named Rules

- **Two neons, two jobs.** Fuchsia means actionable; cyan means done, cold, or
  structural. A surface that uses them interchangeably has lost its only
  wayfinding system.
- **`--box-hue` carries local colour.** Cards and sections set one hue
  (`--box-hue: 285`) and the wash, edge, glow and tag all derive from it in
  OKLCH. Never hardcode a card's colour; set the hue.
- **Status colours are lifted, not replaced.** Tailwind's 500/600s disappear on
  this ground, so `red-500`, `emerald-600` and `amber-600` are redefined lighter
  and keep their names.

## Typography

One face beyond the system stack: **Millennium**, a fixed-pitch pixel face,
reached through `font-pixel` and used only for display. It ships one weight, so
it is never set bold (synthetic bold smears the pixels sideways) and never
tracked negative (that closes the one-pixel gaps the letterforms are drawn
around). It is set in caps.

Body and UI are the system sans. There is no third face.

### Hierarchy

| Role | Face | Size |
|---|---|---|
| Page display | pixel, caps | `clamp(1.5rem, 5.2vw, 2.75rem)` |
| Document title | sans, 600 | `1.75rem`, tracking `-0.01em` |
| Section display | pixel, caps | `1.5rem`–`2rem` |
| Heading | sans, 500 | `1.05rem`–`1.25rem` |
| Body | sans, 400 | `0.875rem`, line-height 1.65 |
| Tracked label | sans, 500, caps | `0.6rem`–`0.7rem`, `0.18em` |
| Rail body | sans, 400 | `11px` |
| Rail note | sans, 400 | `10px` |

### Named Rules

- **A document's own title is the one sans step above heading.** `doc-title`
  exists for surfaces where a person *types* the title - the workspace page
  editor is the first, and there will be others. It is not a page heading and
  it is never the pixel face: that face is caps-only display at one weight, and
  an editable field set in it cannot show what somebody actually typed. Use
  `heading` for a section, the pixel face for a page's display line, and this
  only for a field whose value is the document's name.
- **The pixel face is wide.** It eats about a third more width than its size
  suggests. Size it fluid, and check it at 360px before shipping.
- **Tracked labels tighten on phones.** Below 480px, `0.18em` drops to `0.11em`;
  the tracking, not the size, is what runs a label out of road.
- **Figures are tabular** anywhere numbers sit in a column.
- **The rails have their own two steps, and only two.** `11px` for anything you
  read, `10px` for the line underneath it that explains what you just read. They
  are written in pixels rather than rem deliberately: these are chrome, and they
  should not grow with a page's root size the way content does.

  This is a *dense-surface* scale, not a licence for small text generally. It
  applies to the side rails, the HUDs floating over the scenes, and the
  backoffice tables — surfaces that are permanently on screen beside something
  else and are read in glances rather than sentences. Body copy in the main
  column stays at `0.875rem`.

  Two steps is the whole ramp. A third invites a `12px` that is neither, which
  is exactly what happened once and read as a slightly-wrong input box.

## Layout

Content is centred with a max width and generous side padding: `max-w-6xl` for
the bento landing, `68rem` for document surfaces. The landing page runs on a
six-column bento grid where cards claim spans; document surfaces run on a single
ruled column with a left gutter.

Breakpoints follow Tailwind's defaults. The two that carry real decisions are
`640px` (where dense rows unstack) and `1024px` (where a two-column
work-plus-preview layout collapses to one).

**Coarse pointers get a 44px floor.** Under `(pointer: coarse)`, pills, chips and
launchers take a `min-height: 2.75rem` through padding rather than height, so the
label stays optically centred and desktop density is untouched.

## Elevation & Depth

Depth is light, not shadow. Panels glow from their own hue rather than casting
grey.

### Shadow Vocabulary

- **Card rest:** `inset 0 1px 0 <hue>/0.14`, plus a wide soft hue-tinted drop.
- **Card hover:** the same, brighter, plus `0 1.5rem 3.5rem <hue>/0.28`.
- **Lit control:** `0 0 0 1px accent/0.35, 0 0.25rem 1.5rem accent/0.35` — a ring
  and a bloom, used for the element that currently has the floor.
- **Renders:** two `drop-shadow`s, a tight dark contact shadow to sit the object
  on the page and a wide hue-tinted one for the room's light.

### Named Rules

- **A glow is not a shadow.** Every elevation carries a real offset and blur; the
  hue-tinted halo sits alongside it, never instead of it.
- **The neon floor and horizon** (`.neon-floor`, `.neon-horizon`) are the shared
  way to say "this is a room." Reuse them; do not draw a new grid.

## Shapes

`0.5rem` on fields, `1rem` on small cards and inline renders, `1.5rem` on panels,
`999px` on every button. Nothing is square, and nothing is a perfect circle
except the pill and the cue number.

## Components

### Buttons

Primary is a fuchsia pill with dark text — the accent is bright enough that
white-on-accent fails, so the label goes dark. Ghost is a hairline pill in
`line` with muted text that warms to `ink` on hover. `.summon-cta` is the loud
variant: a fuchsia-to-cyan gradient with a sweeping shimmer, reserved for the one
control on a surface that is the point of it.

### Cards / Containers

`.box` is the house card: a hue-washed glass panel with a lit top edge, an
optional peep render leaning into its corner, and a `.box-tag` label. It sets
`--box-hue` and derives everything else.

### Inputs / Fields

`surface-raised` ground, `line` border, `0.5rem` radius, border warms to `accent`
on focus. **Never below 16px on mobile** — iOS zooms the viewport on any smaller
field.

### Cue sheet (document surfaces)

Introduced by `/events`. A single ruled column with a 1px gutter line, numbered
plates hung on it, an owner column in the two neons, and bodies that open by
animating `grid-template-rows: 0fr → 1fr`. Reach for it when a surface is a
document that runs top to bottom and changes hands partway.

## Motion

Six tokens, and the feel lives in them: `--ease-out-soft` (default),
`--ease-out-snap` (things that travel), `--ease-spring` (one overshoot, for two
or three moments), `--dur-fast` 140ms, `--dur-base` 220ms, `--dur-slow` 520ms.

**Everything eases out.** `ease-in` is deliberately absent: nothing in a UI
should start slowly, because the delay reads as lag rather than as grace.

Every animation has a `prefers-reduced-motion` rule, and where an animation holds
an `opacity: 0` from-state it is removed with `animation: none` rather than
shortened, or the content stays hidden.

## Do's and Don'ts

**Do**

- Set `--box-hue` and let the card derive its own colour.
- Shoot a new render in `/world/shots` rather than drawing an illustration.
- Reserve fuchsia for things that can be pressed.
- Give every new animation its reduced-motion escape hatch.
- Keep the pixel face for display, in caps, at one weight.

**Don't**

- Don't put a live 3D canvas on a marketing surface. The renders exist so a
  visitor does not pay for a renderer to look at a picture.
- Don't set the pixel face bold or with negative tracking.
- Don't use cyan for a primary action, or fuchsia for a finished state.
- Don't drop a field below 16px on mobile.
- Don't add a third typeface.
