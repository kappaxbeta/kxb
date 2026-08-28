/**
 * A picture off the canvas, into somewhere the person can find it again.
 *
 * ---------------------------------------------------------------------------
 * Why this is not one line
 * ---------------------------------------------------------------------------
 * On a desktop browser it is: an `<a download>` pointed at the data URL puts a
 * PNG in the downloads folder and the folder is a real place you can open.
 *
 * On iOS that same anchor is a dead end. Safari honours `download` far enough
 * to show its download bubble, and the file lands in Files > Downloads under a
 * name Safari picked - it is *not* in Photos, and a photo of a room that is not
 * in the camera roll may as well not exist, because the camera roll is what
 * every app asking for a picture opens. There is no attribute that changes
 * this; the anchor cannot reach Photos at all.
 *
 * The share sheet can. `navigator.share` with a `File` gives the OS the actual
 * image, and iOS then offers "Save Image" (which is Photos), "Save to Files",
 * and every app that accepts a picture - which is usually where it was going
 * anyway. So on a touch device that can share files, that is the route, and the
 * anchor stays as the fallback for everything else.
 *
 * ---------------------------------------------------------------------------
 * The one rule this file exists to keep
 * ---------------------------------------------------------------------------
 * `navigator.share` must be called during the click that asked for it. Safari
 * counts a user gesture as spent the moment the call stack yields, so anything
 * awaited before `share()` - `canvas.toBlob`, a `fetch` of the data URL, even
 * an `await` that resolves immediately - turns the share into a
 * `NotAllowedError`. That is why the data URL is decoded here synchronously
 * with `atob` rather than the tidier `await fetch(dataUrl).then(r => r.blob())`,
 * and why `saveShot` does its deciding before its first `await`.
 */

/** What became of the picture, in words the HUD can use. */
export type ShotOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * A data URL as a file, without yielding.
 *
 * `atob` over `fetch` for the reason in the header note: the gesture has to
 * survive this. A full-window PNG is a few megabytes, so this loop runs a few
 * million times - measured at well under a frame, and the alternative costs the
 * share sheet entirely.
 */
export function fileFromDataUrl(dataUrl: string, name: string): File {
  const comma = dataUrl.indexOf(',')
  const head = dataUrl.slice(0, comma)
  const type = head.slice(head.indexOf(':') + 1, head.indexOf(';')) || 'image/png'

  const binary = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)

  return new File([bytes], name, { type })
}

/**
 * Whether to go through the OS rather than the downloads folder.
 *
 * Two conditions, and both matter. `canShare` with the actual file is the only
 * honest test of file sharing - a browser can have `navigator.share` for links
 * and refuse files - and it has to be asked about *this* file, because it
 * answers per type.
 *
 * The coarse pointer is what keeps a desktop on the anchor. Chrome and Safari
 * on a laptop will happily share a file too, but a download there lands in a
 * folder the person already has open, and replacing that with a share sheet
 * would be a worse answer to "save this". Touch is where the downloads folder
 * is the dead end, so touch is where the sheet earns it.
 */
function shouldShare(file: File): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  if (!window.matchMedia('(pointer: coarse)').matches) return false

  try {
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

/** The anchor route: a download, for anything that has a downloads folder. */
function download(dataUrl: string, name: string): 'downloaded' {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = name
  link.click()
  return 'downloaded'
}

/**
 * Save it, by whichever route this device actually has.
 *
 * Must be called *from* the click handler, not from a promise chained off one.
 * See the header note.
 *
 * A cancelled share sheet is reported as cancelled rather than retried as a
 * download: somebody who dismissed the sheet decided not to keep the picture,
 * and answering that by dropping a file in their downloads is not what they
 * asked for. Any other failure does fall back, because that one is the browser
 * refusing rather than the person.
 */
export async function saveShot(dataUrl: string, name: string): Promise<ShotOutcome> {
  const file = fileFromDataUrl(dataUrl, name)

  if (!shouldShare(file)) return download(dataUrl, name)

  try {
    // No `await` above this line, and none between here and the call: this is
    // the gesture being spent.
    await navigator.share({ files: [file], title: name })
    return 'shared'
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
    return download(dataUrl, name)
  }
}
