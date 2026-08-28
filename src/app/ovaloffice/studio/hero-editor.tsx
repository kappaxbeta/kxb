'use client'

import { useEffect, useRef, useState } from 'react'
import { download } from '@/app/ovaloffice/studio/capture'
import { HeroControls } from '@/app/ovaloffice/studio/hero-controls'
import { paintHero } from '@/app/ovaloffice/studio/hero-paint'
import { HeroStage, useHeroAssets } from '@/app/ovaloffice/studio/hero-stage'
import { canRecord, captureNote, FFMPEG_HINT, record } from '@/app/ovaloffice/studio/record'
import { saveEventBanner } from '@/domain/events/banner-actions'
import { encodeHero, isSessionImage, type StudioHero } from '@/domain/studio/hero'

/**
 * Where a banner can be kept, when there is anywhere to keep it.
 *
 * Absent in the backoffice, which is not a coincidence to be tidied up later: a
 * banner belongs to the space whose event shows it, and /ovaloffice belongs to
 * no space. The platform studio composes and exports, exactly as it always has.
 */
export interface HeroSpace {
  slug: string
  /** The banner being edited, when this is a re-save rather than a first one. */
  bannerId?: string
  bannerName?: string
}

/**
 * The hero studio.
 *
 * Compose a banner — sky, drifting blocks, a headline, and a still lifted out
 * of the scene studio — then take it away as a PNG or as a WebM.
 *
 * The two exports are one canvas away from each other, which is the whole
 * reason this surface is drawn rather than laid out: the still is `toDataURL`
 * on the frame at `posterTime`, and the clip is the same painter driven by
 * `./record` off the recorder's clock. See the note at the top of
 * `./hero-paint`.
 *
 * Inside a space there is a third thing to do with it: keep it, so an event can
 * point at it. See `saveToSpace` below — the picture it stores is the same
 * `toDataURL` the PNG button hands you, which is the property that makes the
 * saved poster and the saved document incapable of disagreeing.
 */
export function HeroEditor({ initial, space }: { initial: StudioHero; space?: HeroSpace }) {
  const [hero, setHero] = useState(initial)
  const [playing, setPlaying] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [hint, setHint] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [name, setName] = useState(space?.bannerName ?? 'hero')
  const [saving, setSaving] = useState(false)
  /**
   * Which row a save writes to.
   *
   * Seeded from the page and then updated by the first save, so composing and
   * pressing Save four times leaves one banner rather than four. Reopening a
   * saved banner arrives here through the prop; a fresh document starts
   * undefined and becomes an id the moment it is kept.
   */
  const [bannerId, setBannerId] = useState(space?.bannerId)

  const canvas = useRef<HTMLCanvasElement>(null)
  const { assets, ready } = useHeroAssets(hero)

  /**
   * The link, rewritten as the document changes.
   *
   * `history.replaceState` and debounced, for the reasons the scene editor
   * spells out: this fires on every slider tick, and a navigation per tick would
   * make the back button useless and re-run the server component on the way.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      window.history.replaceState(null, '', `?h=${encodeHero(hero)}`)
    }, 300)
    return () => clearTimeout(timer)
  }, [hero])

  const exportPng = () => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx) return

    // Painted deliberately rather than read off whatever the preview last drew:
    // if the clock is running, the frame on screen is some arbitrary moment of
    // the loop, and the still is supposed to be `posterTime`.
    paintHero(ctx, hero, assets, hero.motion.posterTime)
    download(element.toDataURL('image/png'), `${name || 'hero'}.png`)
    setNote(`saved ${name || 'hero'}.png — ${hero.width}×${hero.height}`)
    setHint(false)
  }

  const exportVideo = async () => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx) return

    // The preview's own loop is stopped for the take. Two things painting the
    // same canvas would have the recorder sampling frames from whichever ran
    // last, which is a clip that jitters between two clocks.
    setPlaying(false)
    setProgress(0)
    setNote(null)

    try {
      const capture = await record(element, {
        fps: hero.motion.fps,
        duration: hero.motion.duration,
        width: hero.width,
        height: hero.height,
        render: (t) => paintHero(ctx, hero, assets, t),
        onProgress: setProgress,
      })
      const result = captureNote(capture)
      download(URL.createObjectURL(capture.blob), `${name || 'hero'}.webm`)
      setNote(`saved ${name || 'hero'}.webm — ${result.text}`)
      setHint(true)
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'The recording failed.')
    } finally {
      setProgress(null)
      // Back to the held poster frame, which is what the panel showed before.
      paintHero(ctx, hero, assets, hero.motion.posterTime)
    }
  }

  /**
   * Keep it, so the event can point at it.
   *
   * Three steps in one click, in this order for a reason:
   *
   *   1. Paint `posterTime` deliberately, exactly as the PNG export does. The
   *      preview may be mid-loop, and the poster is supposed to be the
   *      composition rather than an arbitrary moment of it.
   *   2. Upload that frame through the ordinary image route, which sniffs it,
   *      content-addresses it and files it under this space's prefix. The
   *      banner row stores the slug it hands back.
   *   3. Write the document *and* that slug together, so a row can never hold a
   *      picture of an older arrangement — the failure that took `poster` back
   *      out of `published_scenes`, answered here by there being one writer.
   *
   * A failed upload does not stop the save. Losing the picture costs the door a
   * banner until the next save; losing the document costs somebody their
   * evening, and the two should not share a fate.
   */
  const saveToSpace = async () => {
    if (!space) return
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx) return

    setSaving(true)
    setNote(null)

    try {
      paintHero(ctx, hero, assets, hero.motion.posterTime)

      const blob = await new Promise<Blob | null>((resolve) =>
        element.toBlob(resolve, 'image/png'),
      )

      let posterSlug: string | undefined
      if (blob) {
        const form = new FormData()
        form.append('file', new File([blob], `${name || 'banner'}.png`, { type: 'image/png' }))
        form.append('slug', space.slug)
        const response = await fetch('/api/upload', { method: 'POST', body: form })
        if (response.ok) {
          posterSlug = ((await response.json()) as { slug?: string }).slug
        }
      }

      const result = await saveEventBanner(space.slug, {
        id: bannerId,
        name: name || 'Banner',
        document: hero,
        posterSlug,
      })

      if (!result.ok) {
        setNote(result.error)
        return
      }

      setBannerId(result.id)
      setNote(
        posterSlug
          ? 'saved — pick it in Settings to put it on the door'
          : 'saved, but the picture would not export — save again to get one',
      )
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not save it.')
    } finally {
      setSaving(false)
    }
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setNote(
      isSessionImage(hero)
        ? 'link copied — without the imported picture, which cannot travel in a URL'
        : 'link copied',
    )
  }

  const recording = progress !== null

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-3">
        {/*
          Pinned below `lg`, like the still and motion viewports. This editor
          stacks later than the other two - the panel only moves alongside at
          `lg` - so on a tablet the whole hero panel is a scroll away from the
          hero, which is the case that wanted this most.
        */}
        <div className="sticky top-0 z-20 lg:relative">
          <HeroStage hero={hero} assets={assets} playing={playing && !recording} canvasRef={canvas} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label={space ? 'Banner name' : 'File name'}
            className="w-32 rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          />
          {/* First, and filled, only inside a space — keeping it is what a host
              is here to do, and exporting a PNG is what they do afterwards if
              they also want it on a poster. In the backoffice there is nowhere
              to keep it and the export is the point. */}
          {space && (
            <button
              type="button"
              onClick={saveToSpace}
              disabled={!ready || recording || saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition disabled:opacity-40"
            >
              {saving ? 'Saving…' : bannerId ? 'Save' : 'Save to this space'}
            </button>
          )}
          <button
            type="button"
            onClick={exportPng}
            disabled={!ready || recording}
            // Demoted to an outline where Save is present, so the row has one
            // obvious thing to press. Two filled buttons side by side is two
            // primary actions, which is none.
            className={
              space
                ? 'rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-secondary disabled:opacity-40'
                : 'rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition disabled:opacity-40'
            }
          >
            {ready ? 'Export PNG' : 'Loading…'}
          </button>
          <button
            type="button"
            onClick={exportVideo}
            disabled={!ready || recording || !canRecord()}
            title={canRecord() ? undefined : 'This browser cannot record a canvas.'}
            className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-secondary disabled:opacity-40"
          >
            {recording ? `Recording ${Math.round((progress ?? 0) * 100)}%` : 'Export video'}
          </button>
          <button
            type="button"
            onClick={() => setPlaying((on) => !on)}
            disabled={recording}
            className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-secondary disabled:opacity-40"
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={copyLink}
            className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-secondary"
          >
            Copy link
          </button>
          {note && <span className="text-sm text-muted-foreground">{note}</span>}
        </div>

        {/* Shown next to the download rather than left to be discovered: a WebM
            is not something most timelines or social sites will take. */}
        {hint && (
          <p className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            WebM is the only format a browser will record. One pass through
            ffmpeg gets an mp4:
            <code className="mt-1 block font-mono text-[11px] break-all text-foreground">
              {FFMPEG_HINT.replace(/shot\./g, `${name || 'hero'}.`)}
            </code>
          </p>
        )}
      </div>

      <aside className="lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pr-1">
        <HeroControls hero={hero} onChange={setHero} />
      </aside>
    </div>
  )
}
