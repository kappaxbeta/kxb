'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { studioEnvironment } from '@/app/components/cartridge/studio'
import { Cartridge, type ShelfItem, type ShelfPointer } from '@/app/components/cartridge/cartridge'
import { columnsFor, shelfExtent, placeOnShelf } from '@/app/components/cartridge/grid'

/**
 * A shelf of cartridges.
 *
 * ---------------------------------------------------------------------------
 * The grid is arithmetic, not a layout engine
 * ---------------------------------------------------------------------------
 * `@react-three/flex` is the obvious reach here and it is the wrong one: it is
 * unmaintained, its last release predates React 18, and it peer-requires React
 * ^18 against this app's 19 - so it arrives as a forced install of a yoga wasm
 * build to lay out a **uniform grid**, which is two multiplications. If the
 * shelf ever needs mixed cartridge sizes or wrapping around a caption this is
 * the paragraph to delete; today it would be a dependency and a wasm payload
 * bought with nothing.
 *
 * ---------------------------------------------------------------------------
 * The canvas is sized in world units first
 * ---------------------------------------------------------------------------
 * The grid's world size decides the element's aspect ratio, and the element's
 * measured width decides its height. That order matters: it means one cartridge
 * is the same size in pixels at every column count, so a shelf reflowing from
 * four columns to two makes the cartridges *bigger* rather than the rows
 * shorter, which is what a shelf does when you turn a phone.
 *
 * Because the camera is placed to make the grid exactly fill the frustum at
 * z = 0, a pointer's NDC position maps to the shelf plane by multiplication -
 * no unprojection, and no camera reference outside the canvas.
 *
 * ---------------------------------------------------------------------------
 * Drawn on demand
 * ---------------------------------------------------------------------------
 * `frameloop="demand"`. Nothing here animates on its own, so a shelf sitting in
 * a tab nobody is pointing at costs zero frames. Every source of movement -
 * the pointer, a cover arriving, a nameplate being painted - asks for a frame,
 * and a cartridge that is still catching up asks for the next one itself. See
 * the note at the end of `Cartridge`'s `useFrame`.
 */

/** Vertical, because the frustum is fitted to the grid's height. */
const FOV = 26

export function CartridgeShelf({
  items,
  selected = null,
  onOpen,
  columns: fixed,
  /** Read out to a screen reader in place of the canvas. */
  label,
}: {
  items: readonly ShelfItem[]
  selected?: string | null
  onOpen: (ref: string) => void
  /**
   * How many across, when the caller already knows.
   *
   * `columnsFor` floors at two, because a shelf one cartridge wide is a list.
   * That rule is about *shelves*, and a preview of a single cartridge on its
   * own project's page is not one - so the override exists for that case and
   * nothing else.
   */
  columns?: number
  label: string
}) {
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = frame.current
    if (!node) return

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    setWidth(node.getBoundingClientRect().width)

    return () => observer.disconnect()
  }, [])

  const { columns, rows, ...world } = shelfExtent(items.length, fixed ?? columnsFor(width))

  /*
    Shared by every cartridge, written by a DOM handler, read in `useFrame`.

    A ref rather than state, and that is not a micro-optimisation: pointer moves
    arrive at screen rate, and a `setState` per move would re-render every
    cartridge on the shelf sixty times a second to change a number none of them
    render with.
  */
  const pointer = useRef<ShelfPointer>({ x: 0, y: 0, near: false })

  /** Filled in from inside the canvas, which is the only place that has one. */
  const askRef = useRef<(() => void) | null>(null)

  const track = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      // NDC, then straight to shelf units - the frustum is the grid, so the two
      // are the same rectangle at two scales.
      const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1)

      pointer.current = {
        x: (ndcX * world.width) / 2,
        y: (ndcY * world.height) / 2,
        near: true,
      }
      askRef.current?.()
    },
    [world.width, world.height],
  )

  const release = useCallback(() => {
    pointer.current = { ...pointer.current, near: false }
    askRef.current?.()
  }, [])

  const grid = useMemo(
    () =>
      items.map((item, index) => ({
        item,
        position: placeOnShelf(index, columns, rows),
      })),
    [items, columns, rows],
  )

  return (
    <div className="relative">
      <div
        ref={frame}
        onPointerMove={track}
        onPointerLeave={release}
        style={{
          // Set from the grid rather than from a fixed aspect, so adding a row
          // grows the element instead of shrinking every cartridge in it.
          height: width > 0 ? (width * world.height) / world.width : undefined,
        }}
        className="w-full touch-pan-y"
      >
        {width > 0 && items.length > 0 && (
          <Canvas
            frameloop="demand"
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true }}
            camera={{
              fov: FOV,
              position: [0, 0, world.height / 2 / Math.tan((FOV / 2) * (Math.PI / 180))],
              near: 0.1,
              far: 100,
            }}
          >
            <Invalidator intoRef={askRef} />

            {/*
              A room to reflect, then key, fill and a cool rim.

              The lights alone were enough while every cartridge was matte
              plastic and are not enough now: a metal shell with nothing to
              reflect is black, and a clear one with nothing behind it is grey.
              Both need an environment. It is generated rather than fetched -
              no HDR, and in particular no request to `drei`'s presets, which
              are hosted off our origin - and it is a dark room with three neon
              lights in it rather than a white studio, because that is what
              these cartridges are actually standing in.
            */}
            <Studio />

            {/* Far lower than they were before the room arrived. The
                environment is now doing the fill, and the old numbers on top of
                it blew every pale finish out to white. */}
            <ambientLight intensity={0.18} />
            <directionalLight position={[3, 4, 6]} intensity={1.5} />
            <directionalLight position={[-4, -2, 3]} intensity={0.4} color="#8ab4ff" />

            <Suspense fallback={null}>
              {grid.map(({ item, position }) => (
                <Cartridge
                  key={item.ref}
                  item={item}
                  position={position}
                  pointer={pointer}
                  selected={selected === item.ref}
                  onOpen={onOpen}
                />
              ))}
            </Suspense>
          </Canvas>
        )}
      </div>

      {/*
        The shelf, for anybody not using a pointer.

        A canvas is one element with no children as far as assistive technology
        is concerned, so the same list exists here as real buttons. Not a
        fallback for a failed render - it is always in the document, and it is
        the reason the visual shelf is allowed to be a canvas at all.
      */}
      <ul className="sr-only">
        <li>{label}</li>
        {items.map((item) => (
          <li key={item.ref}>
            <button type="button" onClick={() => onOpen(item.ref)}>
              {item.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Something for the shiny finishes to be shiny *of*.
 *
 * Built once per canvas and attached declaratively - assigning `scene.environment`
 * from an effect would be writing to a value a hook returned, which the
 * immutability rule forbids and which R3F's `attach` does properly. What is
 * actually in the room, and why it is not three's own, is in `studio.ts`.
 */
function Studio() {
  const gl = useThree((state) => state.gl)

  const environment = useMemo(() => studioEnvironment(gl), [gl])

  useEffect(() => () => environment.dispose(), [environment])

  return <primitive object={environment} attach="environment" />
}

/**
 * Hands the canvas's `invalidate` out to the DOM handlers around it.
 *
 * A demand-driven canvas only redraws when something asks, and the thing that
 * knows the pointer moved is a React event on a div outside the reconciler.
 */
function Invalidator({ intoRef }: { intoRef: React.RefObject<(() => void) | null> }) {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    intoRef.current = invalidate
    return () => {
      intoRef.current = null
    }
  }, [intoRef, invalidate])

  return null
}
