#!/usr/bin/env bun
/**
 * Draws every App Store panel to a PNG.
 *
 *     bun run banners:render                  # all twelve, three languages, both canvases
 *     bun run banners:render --device=iphone  # one canvas
 *     bun run banners:render --locale=de      # one language
 *     bun run banners:render bank cube        # named panels only
 *
 * Writes `marketing/banners/<panel>_<locale>_<device>.png`, and a `slots.json`
 * beside them saying where the gameplay captures go.
 *
 * ---------------------------------------------------------------------------
 * Why this runs a browser rather than drawing the picture itself
 * ---------------------------------------------------------------------------
 * Because the backoffice draws it in a browser, and there must not be a second
 * renderer. `paint.ts` is the template and `panels.ts` is the config; a script
 * that reimplemented either in `sharp` would be a third version of the layout
 * to keep in step with the other two, and the failure mode is the worst kind -
 * the preview somebody approved and the file that shipped are different
 * pictures, and nothing says so.
 *
 * So the same module is bundled for the browser, handed to a headless Chromium
 * with the app's own `public/` served under it, and asked for a data URL. The
 * canvas is already the delivered size, so nothing is scaled on the way out.
 *
 * It never touches the dev server. `public/` is served by the few lines below
 * on a port of its own, because the dev server on 3000 is shared with whoever
 * else is working and a render is not a good reason to restart it.
 */
import { chromium } from '@playwright/test'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { DEVICES, slotRects } from '@/domain/banners/devices'
import type { DeviceKey } from '@/domain/banners/spec'
import { PANELS } from '@/domain/banners/panels'
import { LOCALES, type Locale } from '@/domain/i18n/locale'

const ROOT = path.join(import.meta.dir, '..')
const PUBLIC = path.join(ROOT, 'public')
const OUT = path.join(ROOT, 'marketing', 'banners')
const CAPTURES = path.join(ROOT, 'marketing', 'captures')
const PORT = 8791

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

/**
 * The gameplay capture for one frame, if somebody has taken it yet.
 *
 * Looked up as `<panel>_<locale>_<slot>` first and `<panel>_<slot>` second, so
 * the common case is one file per frame shared by all three languages and a
 * localised screenshot is an override rather than a different scheme. Slots are
 * numbered from one, because they are numbered from one on the page.
 *
 * A frame with no file draws empty, which is the point: the render is useful
 * before any screenshots exist, and that empty panel is what gets handed to
 * whoever is going to take them.
 */
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']
const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
}

function capture(panelId: string, locale: Locale, slot: number): string | null {
  for (const stem of [`${panelId}_${locale}_${slot + 1}`, `${panelId}_${slot + 1}`]) {
    for (const ext of EXTENSIONS) {
      const file = path.join(CAPTURES, `${stem}.${ext}`)
      if (existsSync(file)) {
        return `data:${MIME[ext]};base64,${readFileSync(file).toString('base64')}`
      }
    }
  }
  return null
}

const argv = process.argv.slice(2)
const flag = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const only = argv.filter((a) => !a.startsWith('--'))

const devices = (flag('device') ? [flag('device')] : Object.keys(DEVICES)) as DeviceKey[]
const locales = (flag('locale') ? [flag('locale')] : [...LOCALES]) as Locale[]
const panels = only.length ? PANELS.filter((p) => only.includes(p.id)) : [...PANELS]

if (!panels.length) {
  console.error(`no such panel. known: ${PANELS.map((p) => p.id).join(', ')}`)
  process.exit(1)
}

const built = await Bun.build({
  entrypoints: [path.join(ROOT, 'scripts', 'banner-page.ts')],
  target: 'browser',
  minify: false,
})
if (!built.success) {
  console.error(built.logs.join('\n'))
  process.exit(1)
}
const bundle = await built.outputs[0].text()

const HARNESS = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#0d0819}</style>
<script>${bundle}</script>`

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0])
  if (url === '/__banners') {
    res.writeHead(200, { 'content-type': 'text/html' })
    return res.end(HARNESS)
  }
  const file = path.join(PUBLIC, url)
  // Never serve outside `public/`: this is a local tool, but a path traversal
  // that works locally is one that works wherever somebody copies this next.
  if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404)
    return res.end('not found')
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})
await new Promise<void>((resolve) => server.listen(PORT, resolve))

mkdirSync(OUT, { recursive: true })
mkdirSync(CAPTURES, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.goto(`http://127.0.0.1:${PORT}/__banners`, { waitUntil: 'load' })

let written = 0
const manifest: unknown[] = []

for (const panel of panels) {
  for (const locale of locales) {
    for (const device of devices) {
      const name = `${panel.id}_${locale}_${device}`
      const shots = Array.from({ length: panel.slots }, (_, i) => capture(panel.id, locale, i))
      const dataUrl = await page.evaluate(
        ({ id, loc, dev, shots: s }) => window.paint(id as string, loc as Locale, dev as DeviceKey, s),
        { id: panel.id, loc: locale, dev: device, shots },
      )
      writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'))
      const d = DEVICES[device]
      manifest.push({
        file: `${name}.png`,
        panel: panel.id,
        group: panel.group,
        locale,
        device,
        canvas: { w: d.w, h: d.h },
        slots: slotRects(device, panel.slots, panel.slotLabels ? panel.slotLabels[locale] : []),
      })
      written += 1
      const filled = shots.filter(Boolean).length
      console.log(`  ${name}.png${filled ? ` (${filled}/${panel.slots} filled)` : ''}`)
    }
  }
}

writeFileSync(path.join(OUT, 'slots.json'), `${JSON.stringify(manifest, null, 2)}\n`)

await browser.close()
server.close()
console.log(`\n${written} banners → marketing/banners/`)
