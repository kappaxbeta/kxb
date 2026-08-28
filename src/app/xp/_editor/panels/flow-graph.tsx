'use client'

import { useMemo, useState } from 'react'
import { RESERVED_GOES, ROUND_AGAIN, type XpFlow } from '@kxb/xp'

/**
 * The round, as the shape it is.
 *
 * The panel beside this lists phases and their arrows, which is readable and is
 * still a list - and a list is the thing a state machine is *not*. Two phases
 * pointing at each other read as four lines in four places; here they are one
 * loop you can see. That gap is why the panel deferred to "a graph editor"
 * rather than growing a destination dropdown per step.
 *
 * ---------------------------------------------------------------------------
 * Laid out in rows by distance from the start
 * ---------------------------------------------------------------------------
 * Not a force simulation and not draggable positions saved into the document.
 * A flow is *small* - `MAX_PHASES` is 32 and a real one is three - and the thing
 * an author wants to see is the order things happen in, which is exactly a
 * breadth-first walk from `start`. Positions in the document would also be a
 * second thing to keep in step with the phases, and the first time somebody
 * edited the JSON by hand they would disagree.
 *
 * Phases nothing reaches have no distance, so they go in a row of their own at
 * the bottom - which is a diagnosis rather than a fallback: an orphan sitting
 * apart from the graph is the clearest possible drawing of "nothing gets here".
 *
 * ---------------------------------------------------------------------------
 * Dragging draws the line and the reason lands with it
 * ---------------------------------------------------------------------------
 * A step with no `when`, `on` or `after` is refused by `flowProblems`, so a
 * graph that let you drop the line first and say why afterwards would hold a
 * document that cannot save for as long as you took to answer. So the drag
 * picks the two ends and opens the one small form the reason needs, and nothing
 * is written until it is answered.
 *
 * **And the drag is the second way rather than the only one.** A gesture that
 * starts on a five-pixel handle and has to land on a particular box has no
 * keyboard, no discoverability and one chance to succeed - so the panel below
 * also opens that same form from a button, with the destination as a dropdown.
 * The graph is the right thing to *read* a flow from; it is the wrong thing to
 * be the only thing that can write one.
 */

/** Room for a node, and the gaps between them. All in SVG units. */
const NODE = { width: 132, height: 34 }
const GAP = { x: 26, y: 58 }
const PAD = 14

export interface Spot {
  x: number
  y: number
}

/**
 * Where each phase sits: rows by how far it is from the start.
 *
 * Exported because the test for it is worth having on its own - the arrows and
 * the boxes both read it, and a layout that disagreed with itself would draw
 * lines to where a node is not.
 */
export function layoutOf(flow: XpFlow): Record<string, Spot> {
  const rows: string[][] = []
  const placed = new Set<string>()

  let row = Object.hasOwn(flow.phases, flow.start) ? [flow.start] : []
  while (row.length > 0) {
    rows.push(row)
    for (const name of row) placed.add(name)
    const next: string[] = []
    for (const name of row) {
      for (const step of flow.phases[name]?.next ?? []) {
        if (placed.has(step.go) || next.includes(step.go)) continue
        if (Object.hasOwn(flow.phases, step.go)) next.push(step.go)
      }
    }
    row = next
  }

  // Everything the walk never got to, together, at the bottom. An orphan sitting
  // apart from the graph is the clearest drawing of "nothing reaches this".
  const orphans = Object.keys(flow.phases).filter((name) => !placed.has(name))
  if (orphans.length > 0) rows.push(orphans)

  /**
   * The two destinations that are not phases, on a row under everything.
   *
   * Drawn, because the alternative is what this graph did before them: a step
   * to the seam simply had no arrow, so the one thing a best-of-three most
   * needs to show - that it goes round - was the one thing missing from the
   * picture of it. They are laid out here rather than special-cased by the
   * renderer so the arrows and the boxes keep reading one layout.
   */
  const ends = RESERVED_GOES.filter((word) =>
    Object.values(flow.phases).some((phase) => (phase.next ?? []).some((step) => step.go === word)),
  )
  if (ends.length > 0) rows.push(ends)

  const spots: Record<string, Spot> = {}
  const widest = Math.max(1, ...rows.map((one) => one.length))
  rows.forEach((names, y) => {
    const span = names.length * NODE.width + (names.length - 1) * GAP.x
    const full = widest * NODE.width + (widest - 1) * GAP.x
    names.forEach((name, x) => {
      spots[name] = {
        x: PAD + (full - span) / 2 + x * (NODE.width + GAP.x),
        y: PAD + y * (NODE.height + GAP.y),
      }
    })
  })
  return spots
}

export function FlowGraph({
  flow,
  selected,
  onSelect,
  onConnect,
}: {
  flow: XpFlow
  selected: string | null
  onSelect: (phase: string) => void
  /** Both ends of a new arrow. The reason is asked for by whoever owns this. */
  onConnect: (from: string, to: string) => void
}) {
  const spots = useMemo(() => layoutOf(flow), [flow])
  /** The phase a drag started on, or null. Not a ref: the node draws itself lit. */
  const [dragging, setDragging] = useState<string | null>(null)

  const names = Object.keys(flow.phases)
  const rows = Math.max(...Object.values(spots).map((spot) => spot.y), 0)
  const width = Math.max(...Object.values(spots).map((spot) => spot.x + NODE.width), 0) + PAD
  const height = rows + NODE.height + PAD

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full select-none"
      style={{ maxHeight: 420 }}
      // A drag that ends anywhere else is abandoned, which is what letting go
      // over nothing means. Without this the next click would connect.
      onPointerUp={() => setDragging(null)}
      onPointerLeave={() => setDragging(null)}
    >
      <defs>
        <marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
        </marker>
      </defs>

      {names.flatMap((from) =>
        (flow.phases[from].next ?? []).map((step, at) => {
          const a = spots[from]
          const b = spots[step.go]
          if (!a || !b) return null
          return (
            <Arrow
              key={`${from}-${at}`}
              from={a}
              to={b}
              self={from === step.go}
              lit={selected === from || selected === step.go}
            />
          )
        }),
      )}

      {/*
        The two ends, drawn as what they are and not as boxes you can wire.

        No drag handle and no selection: neither is a phase, so there is
        nothing to select and nothing to leave. They are the only nodes in the
        graph that are a destination and never a source, and looking different
        is how that reads without a legend.
      */}
      {RESERVED_GOES.filter((word) => spots[word]).map((word) => (
        <g key={word} transform={`translate(${spots[word].x} ${spots[word].y})`}>
          <rect
            width={NODE.width}
            height={NODE.height}
            rx={NODE.height / 2}
            fill="#171717"
            stroke="#6d28d9"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
          <text
            x={NODE.width / 2}
            y={NODE.height / 2 + 4}
            textAnchor="middle"
            className="fill-violet-300/80 font-mono"
            style={{ fontSize: 11 }}
          >
            {word === ROUND_AGAIN ? 'next round' : 'the end'}
          </text>
        </g>
      ))}

      {names.map((name) => (
        <Node
          key={name}
          name={name}
          at={spots[name]}
          start={name === flow.start}
          selected={selected === name}
          dragging={dragging === name}
          onSelect={() => onSelect(name)}
          onDragStart={() => setDragging(name)}
          onDrop={() => {
            if (dragging && dragging !== name) onConnect(dragging, name)
            setDragging(null)
          }}
        />
      ))}
    </svg>
  )
}

/**
 * One arrow, curved, and a loop when both ends are the same phase.
 *
 * A straight line from a box to itself is a dot, and "a six sends you round
 * again" is the arrow a board game most wants to see - so the self case is a
 * circle above the node rather than nothing.
 */
function Arrow({
  from,
  to,
  self,
  lit,
}: {
  from: Spot
  to: Spot
  self: boolean
  lit: boolean
}) {
  const colour = lit ? '#a78bfa' : '#525252'

  if (self) {
    const x = from.x + NODE.width / 2
    const y = from.y
    return (
      <path
        d={`M ${x - 14} ${y} C ${x - 26} ${y - 34}, ${x + 26} ${y - 34}, ${x + 12} ${y}`}
        fill="none"
        stroke={colour}
        strokeWidth={1.25}
        markerEnd="url(#flow-arrow)"
        color={colour}
      />
    )
  }

  const ax = from.x + NODE.width / 2
  const bx = to.x + NODE.width / 2
  // Out of the bottom and into the top when it goes down the page, and the
  // reverse when it comes back up - so a return arrow is visibly a return.
  const down = to.y > from.y
  const ay = down ? from.y + NODE.height : from.y
  const by = down ? to.y : to.y + NODE.height
  const bend = Math.max(24, Math.abs(by - ay) / 2)

  return (
    <path
      d={`M ${ax} ${ay} C ${ax} ${ay + (down ? bend : -bend)}, ${bx} ${by - (down ? bend : -bend)}, ${bx} ${by}`}
      fill="none"
      stroke={colour}
      strokeWidth={1.25}
      markerEnd="url(#flow-arrow)"
      color={colour}
    />
  )
}

function Node({
  name,
  at,
  start,
  selected,
  dragging,
  onSelect,
  onDragStart,
  onDrop,
}: {
  name: string
  at: Spot
  start: boolean
  selected: boolean
  dragging: boolean
  onSelect: () => void
  onDragStart: () => void
  onDrop: () => void
}) {
  return (
    <g
      transform={`translate(${at.x} ${at.y})`}
      className="cursor-pointer"
      onPointerDown={onSelect}
      onPointerUp={onDrop}
    >
      <rect
        width={NODE.width}
        height={NODE.height}
        rx={4}
        fill={selected ? '#252036' : '#171717'}
        stroke={dragging ? '#a78bfa' : selected ? '#a78bfa' : '#404040'}
        strokeWidth={1}
      />
      <text
        x={10}
        y={NODE.height / 2 + 4}
        className="fill-neutral-200 font-mono"
        style={{ fontSize: 11 }}
      >
        {name}
      </text>
      {start ? (
        <text
          x={NODE.width - 10}
          y={NODE.height / 2 + 4}
          textAnchor="end"
          className="fill-violet-300 font-mono"
          style={{ fontSize: 10 }}
        >
          ▸
        </text>
      ) : null}

      {/*
        The handle a new arrow is dragged from. Its own target rather than the
        whole box, so selecting a phase and connecting one are two gestures
        instead of one that guesses.

        **The hit area is twice what is drawn**, which is the fix for a handle
        that was a five-pixel circle with no cursor and no hover: an invisible
        ring takes the press, and the visible dot stays small so the graph is
        still a graph. It is still a drag, so it is still the *second* way to
        draw an arrow - the panel below has a button and a dropdown, because a
        gesture with no keyboard cannot be the only way to say where a phase
        goes.

        `releasePointerCapture` is not decoration. A pointerdown inside SVG gets
        implicit capture for touch, which sends the matching pointerup back to
        *this* element rather than to the node it was released over - so on a
        phone the drag could never complete, silently.
      */}
      <circle
        cx={NODE.width / 2}
        cy={NODE.height}
        r={11}
        fill="transparent"
        className="cursor-crosshair"
        onPointerDown={(event) => {
          event.stopPropagation()
          event.currentTarget.releasePointerCapture?.(event.pointerId)
          onDragStart()
        }}
      />
      <circle
        cx={NODE.width / 2}
        cy={NODE.height}
        r={5}
        fill={dragging ? '#a78bfa' : '#262626'}
        stroke={dragging ? '#a78bfa' : '#525252'}
        className="pointer-events-none"
      />
    </g>
  )
}
