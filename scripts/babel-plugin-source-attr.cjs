'use strict'

/**
 * Stamps `data-src="src/app/world/lounge/companions.tsx:42"` onto every DOM
 * element, so the browser inspector tells you which file to open.
 *
 * This exists because Tailwind gives you no way back. You inspect an element,
 * you see `flex items-center gap-2 rounded-md`, and that string is in eleven
 * files. PostCSS cannot help - it only ever sees CSS, never the JSX that
 * emitted the class - so the only place the filename is still known is the
 * compiler, while it is looking at the JSX itself. Hence a Babel plugin.
 *
 * It is dev-only and opt-in: see `bun run dev-css-classname`, which is the only
 * thing that turns it on. Nothing here runs during `next build`.
 *
 * ---------------------------------------------------------------------------
 * What it points at, and the one case where that is not what you wanted
 * ---------------------------------------------------------------------------
 * The attribute names the file where the JSX tag literally is. For a `<div>`
 * you wrote, that is the file you want. For `<Button className="..." />` it is
 * `ui/button.tsx:50`, because that is where the `<button>` lives - the call
 * site that supplied the classes is one level up, and you find it from the
 * data-src of the surrounding element.
 *
 * Stamping the call site instead would mean putting a `data-src` prop on every
 * component element and letting `{...props}` carry it down, which is neat right
 * up until a component spreads rest onto a three.js object and react-three-fiber
 * tries to assign `instance.data.src`. Not worth it for a debug mode.
 *
 * It is prepended rather than appended purely so it reads first in the
 * inspector, ahead of the className you actually came to look at.
 *
 * ---------------------------------------------------------------------------
 * Why only known HTML and SVG tags, and why react-three-fiber files are skipped
 * ---------------------------------------------------------------------------
 * Under `<Canvas>`, lowercase JSX is not HTML - `<mesh>`, `<boxGeometry>` and
 * friends are three.js objects, and react-three-fiber applies unknown props by
 * walking the dash: `data-src` would be read as `instance.data.src` and throw.
 * Two defences, because `<line>`, `<points>`, `<sprite>` and `<audio>` are both
 * valid three.js elements and valid HTML/SVG ones: an allowlist of real markup
 * tags, and a hard skip of any file that imports `three` or `@react-three/*`.
 * The world scenes are therefore untouched - which costs nothing, since nothing
 * in them is styled with Tailwind anyway.
 */

const path = require('path')

const R3F_IMPORT = /^three(\/|$)|^@react-three\//

// Tags that become real DOM nodes. Deliberately a list and not "is it
// lowercase", for the react-three-fiber reason in the header.
const MARKUP_TAGS = new Set([
  // HTML
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base',
  'bdi', 'bdo', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption',
  'cite', 'code', 'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details',
  'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head',
  'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd',
  'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu', 'meta',
  'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output',
  'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
  'script', 'search', 'section', 'select', 'slot', 'small', 'source', 'span',
  'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td',
  'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr',
  'track', 'u', 'ul', 'var', 'video', 'wbr',
  // SVG
  'circle', 'clipPath', 'defs', 'ellipse', 'feBlend', 'feColorMatrix',
  'feComposite', 'feDropShadow', 'feGaussianBlur', 'feMerge', 'feMergeNode',
  'feOffset', 'filter', 'foreignObject', 'g', 'image', 'line', 'linearGradient',
  'marker', 'mask', 'path', 'pattern', 'polygon', 'polyline', 'radialGradient',
  'rect', 'stop', 'svg', 'text', 'textPath', 'tspan', 'use',
])

/** @type {import('@babel/core').PluginObj} */
module.exports = function sourceAttrPlugin({ types: t }, options = {}) {
  const root = options.root || process.cwd()
  const attribute = options.attribute || 'data-src'

  return {
    name: 'source-attr',
    visitor: {
      Program(programPath, state) {
        const filename = state.file.opts.filename

        // `skip()` on Program is the bail-out: it stops this pass from
        // descending into the file at all, so JSXOpeningElement never fires.
        if (!filename || filename.includes(`${path.sep}node_modules${path.sep}`)) {
          programPath.skip()
          return
        }

        for (const node of programPath.node.body) {
          if (node.type === 'ImportDeclaration' && R3F_IMPORT.test(node.source.value)) {
            programPath.skip()
            return
          }
        }

        state.sourceLabel = path.relative(root, filename).split(path.sep).join('/')
      },

      JSXOpeningElement(elementPath, state) {
        if (!state.sourceLabel) return

        const name = elementPath.node.name
        if (name.type !== 'JSXIdentifier' || !MARKUP_TAGS.has(name.name)) return

        const line = elementPath.node.loc && elementPath.node.loc.start.line
        if (!line) return

        const alreadyStamped = elementPath.node.attributes.some(
          (a) =>
            a.type === 'JSXAttribute' &&
            a.name.type === 'JSXIdentifier' &&
            a.name.name === attribute,
        )
        if (alreadyStamped) return

        elementPath.node.attributes.unshift(
          t.jsxAttribute(
            t.jsxIdentifier(attribute),
            t.stringLiteral(`${state.sourceLabel}:${line}`),
          ),
        )
      },
    },
  }
}
