'use server'

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { DECO_ROOT, publicDir } from '@/domain/pictures/catalogue'
import { requireBackofficeSection } from '@/lib/backoffice'

/**
 * Keeping a studio render as a deco picture.
 *
 * ---------------------------------------------------------------------------
 * This writes into the repo, and only in development
 * ---------------------------------------------------------------------------
 * `public/` is part of the *build*. In development it is the working copy on
 * this machine, so a file written here shows up immediately, goes into `git
 * status`, and is kept by committing it - which is the whole point: the picture
 * becomes part of the product rather than a row in a database.
 *
 * In production it is a directory inside a container image. A file written
 * there would be served until the next deploy and then silently vanish, and on
 * the Hetzner box - where two replicas run the same image - it would exist on
 * one replica and not the other, so the same URL would work or 404 depending on
 * which one answered. That is a worse outcome than not offering the button, so
 * production refuses in plain words rather than half-working.
 *
 * Anything a space needs to upload at runtime already has a home: the uploads
 * pipeline, with its content addressing and its storage prefix. This is not
 * that. This is an admin putting an asset into the codebase without leaving the
 * studio.
 */

export type PictureResult = { ok: true; path: string } | { ok: false; error: string }

/**
 * A file name, and nothing that could be a path.
 *
 * The name is joined onto a directory this file chooses, so a `..` or a slash
 * getting through would be a write anywhere on the disk as the server user.
 * The pattern is a whitelist for that reason rather than a tidiness rule, and
 * the resolved path is checked against the directory again below - belt and
 * braces, because this is the one action in the codebase that writes a file
 * by name.
 */
const nameSchema = z
  .string()
  .trim()
  .min(1, 'Give the picture a name')
  .max(60, 'Keep the name under 60 characters')
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Lower case, digits and dashes only')

/** What `toDataURL('image/png')` hands back, and nothing else. */
const PNG_PREFIX = 'data:image/png;base64,'

/** Roughly six megabytes of base64. A 1920x1080 PNG is well under it. */
const MAX_BYTES = 6 * 1024 * 1024

export async function saveDecoPicture(input: {
  name: string
  /** The canvas export, as a `data:image/png;base64,` URL. */
  dataUrl: string
}): Promise<PictureResult> {
  const { user } = await requireBackofficeSection('pictures', 'write')

  if (process.env.NODE_ENV === 'production') {
    return {
      ok: false,
      error: 'Deco pictures are saved into the repo, so this only works in development.',
    }
  }

  const parsed = nameSchema.safeParse(input.name)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the name' }
  }

  if (!input.dataUrl.startsWith(PNG_PREFIX)) {
    return { ok: false, error: 'That is not a PNG export' }
  }

  const bytes = Buffer.from(input.dataUrl.slice(PNG_PREFIX.length), 'base64')
  if (bytes.length === 0) return { ok: false, error: 'That export is empty' }
  if (bytes.length > MAX_BYTES) return { ok: false, error: 'That export is too large' }

  // A PNG starts with these eight bytes. Checked rather than trusted, because
  // the prefix above is a claim the caller made about its own string.
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!bytes.subarray(0, 8).equals(signature)) {
    return { ok: false, error: 'That is not a PNG export' }
  }

  const folder = publicDir(DECO_ROOT)
  const file = path.join(folder, `${parsed.data}.png`)

  // The second half of the traversal guard. `nameSchema` already makes this
  // impossible; this is what catches the day somebody loosens it.
  if (path.dirname(path.resolve(file)) !== path.resolve(folder)) {
    return { ok: false, error: 'Check the name' }
  }

  try {
    // `wx` fails rather than overwrites. A picture already committed under this
    // name is referenced by rows and by pages, and quietly replacing it would
    // change what they show - "pick another name" is the honest answer.
    await writeFile(file, bytes, { flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return { ok: false, error: `There is already a picture called ${parsed.data}` }
    }
    return { ok: false, error: 'Could not write that file' }
  }

  await recordBackofficeAction({
    actor: user,
    section: 'pictures',
    action: 'picture.save',
    summary: `Saved deco picture ${parsed.data}`,
    detail: { name: parsed.data, path: `/${DECO_ROOT}/${parsed.data}.png` },
  })

  revalidatePath('/ovaloffice/pictures')
  revalidatePath('/ovaloffice/news')
  return { ok: true, path: `/${DECO_ROOT}/${parsed.data}.png` }
}
