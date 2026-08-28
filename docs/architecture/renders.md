# Renders

Turning a scene into an image somewhere other than the tab that composed it.

## What this is for

The studio draws scenes in whichever browser is looking at them. That is right
when a person is watching and useless for everything else — a card that wants a
thumbnail, a post that wants a still, a catalogue that wants twenty of them.
Those callers have no canvas, and the ones that do should not wait behind a glTF
download and a shadow pass.

So a render is **a row first and a picture second**.

## The one idea

Everything here is registered before it is created.

| Registered | …then created |
| --- | --- |
| a `render_jobs` row, `pending` | the picture |
| a `render_servers` row, with a deadline | the rented machine |
| `kxb-render:<sha>` in GHCR | the container on the box |
| the `renders` flag key and its row | any code that branches on it |

The reason is the same in each case, and it is not tidiness. Render-then-record
cannot describe a render that was asked for and never finished: a worker that
dies mid-frame leaves nothing behind, and "the thumbnail never appeared" reads
exactly like "nobody ever asked for one". Create-then-record on a rented server
is worse — it fails to a machine nobody knows about, which is €120 a month and
invisible until the invoice.

Recording first fails the other way: an orphan row, which costs nothing and is
obvious.

## The pieces

| | |
| --- | --- |
| `render_jobs` | the queue. Input is a **shot document**, an instant and a size |
| `renders` bucket | public, webp only, object key is the job's uuid |
| `/world/render` | the bench: a canvas and a `window.draw` function, no data, no authority |
| `scripts/render-worker.ts` | claims a job, drives headless Chrome, uploads, reports |
| `POST /api/renders` | register a job. 202 and an id |
| `GET /api/renders/<id>` | status, and a `url` once there is one |
| `/ovaloffice/renders` | the queue, with thumbnails, behind the flag |
| `scripts/render-burst.ts` | rent a box for a backlog, and make sure it dies |

### The input is a document, not a scene id

The board wants a still of a post, the catalogue a card, a space a hero, a
script the landing page's heaps — and only some of those are rows in
`published_scenes`. Keying the queue to any one caller makes the rest either
impossible or a second queue. `scene_id` on a job is **provenance**; nothing
reads it to decide what to draw.

### The flag gates asking, not drawing

`renders` gates *registering* a job — the API and the backoffice surface. It
does not gate the worker. Turning it off is a decision to stop accepting work,
and rows accepted while it was on still deserve to be drained rather than
stranded half-rendered.

## Running one

```bash
bun run render:worker --once
```

Needs `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
`RENDER_APP_URL` pointing at something serving `/world/render`.

In production it is the `renderer` service in `compose.yaml`: one instance, one
job at a time, `mem_limit: 1200m`, `shm_size: 1gb`, reaching the app at
`http://app:3000` on the compose network. It publishes nothing and nothing
reaches it.

## Renting a box for a backlog

Only worth it for a few hundred jobs at once — a catalogue backfill, or the
first time every scene needs a thumbnail. For anything smaller the box worker is
the answer.

```bash
bun run render:burst status                      # what exists right now
bun run render:burst up --purpose backfill       # dry run, says what it would do
bun run render:burst up --purpose backfill --confirm
bun run render:burst reap --dry-run
```

`up` refuses an empty queue, refuses to create without `--confirm`, and pushes
the row's `deadline_at` forward every minute while it works — so the deadline is
also the heartbeat. Stop pushing it (crash, closed laptop, `^C`) and `reap`
takes the machine.

`reap` reconciles **both ways**: rows past their deadline whose server still
exists, and servers labelled `role=render` whose record is not live. The second
half is what catches a create that succeeded while its answer was being lost.

Needs `HCLOUD_TOKEN` and `GHCR_TOKEN`. The Supabase credentials are read off the
production box's own `.env` over ssh rather than required locally.

## Things that will bite

- **`createRoot` does not extend the THREE namespace** the way `<Canvas>` does.
  Forget `extend(THREE)` and the first `<color>` throws, the root never commits,
  and the draw promise never settles — which from the worker is
  indistinguishable from a slow render, and surfaces as a timeout three minutes
  later.
- **An empty queue is a row of nulls, not null.** A `language sql` function
  returning a composite does that when its final statement matches nothing.
  Guarding on `data.id` is the whole of how "nothing to do" is recognised;
  without it the worker hot loops against the database.
- **A container reaching a host dev server needs
  `DEV_ORIGINS=host.docker.internal`** — the `render` launch config on 3600.
  Next dev blocks its own chunks by host name, so the page arrives and never
  hydrates.
- **A canvas asked for a format it cannot encode silently returns PNG.** The
  worker checks the data URL prefix rather than slicing it off, because
  uploading those bytes as `image/webp` puts a mislabelled file behind a public
  URL.
- **Renders of private scenes are readable by anyone holding the path.** The
  bucket is public so a board of twelve thumbnails does not make twelve
  authenticated round trips. That is why the object key is the job's uuid and
  not the scene's name or id. A scene that must not have a shareable picture
  must not be rendered.
- **develop runs no renderer.** A second Chromium beside two production
  replicas, one develop replica and Caddy on 3.8GB is the OOM killer choosing
  between the renderer and the site.
