'use client'

import { encodeQr, qrPath } from '@/domain/nearby/qr'

/**
 * A code, drawn.
 *
 * Lifted out of the nearby panel because it stopped being about the nearby
 * handshake the moment a guest link wanted one too. The encoder underneath it
 * is deliberately narrow - byte mode, level M, versions 1 to 10 - and that
 * ceiling is the reason this component has an opinion about failure: a payload
 * past 213 bytes is not an exception to throw, it is a link that has to be sent
 * some other way, and the panel around it already offers one.
 *
 * Rendered as a single `<path>` rather than a grid of rects. A version-10 code
 * is 3,249 modules; as elements that is a DOM node per dark square and a
 * visible hitch when the panel opens.
 */
export function QrBlock({
  text,
  label = 'QR code',
  className = 'h-56 w-56 rounded-lg bg-white p-2',
}: {
  text: string
  label?: string
  className?: string
}) {
  const code = (() => {
    try {
      return encodeQr(text)
    } catch {
      return null
    }
  })()

  if (!code) {
    return (
      <p className="rounded-lg bg-white/5 px-3 py-6 text-center text-xs text-white/50">
        Too long to show as a code — send the link instead.
      </p>
    )
  }

  // Four modules of quiet zone, which the standard requires and without which a
  // reader cannot find the edge against a dark page.
  const quiet = 4
  const span = code.size + quiet * 2

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      className={className}
    >
      <rect width={span} height={span} fill="#fff" />
      <g transform={`translate(${quiet},${quiet})`}>
        <path d={qrPath(code)} fill="#000" />
      </g>
    </svg>
  )
}
