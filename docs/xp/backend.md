# The XP backend

How an XP stops being a file on our disk and becomes a folder somebody else
made, checked, stored, published and found.

This is the v2 half that [xp-creator.md](creator.md) §12 deferred and §16.1
left open. That document decided *a file, for all of v1, and revisit when a
specific XP needs an audience*. This is the revisit. Read §3 (the cartridge),
§3.1 (where it lives) and §11 (the backend slot) first — nothing here replaces
them, and the document format they describe is the same document format.

[xp-manual.md](manual.md) stays the field-by-field reference. When this file
and the manual disagree about what a field does, the manual is right and this
one has drifted.

**The one sentence, if you read nothing else.** An XP is a project owned by an
*account* and living in a *space*; its document is a row and its assets are
content-addressed blobs the document refers to; **Save** writes that to the
database and **Export** assembles it into a zip. Everything here is a
consequence of one of those four.

---

## 0. The vision

Written down because the rest of this document is a set of trade-offs, and a
trade-off can only be judged against what it is for.

**An XP is a small game somebody made in a browser, in an afternoon, and sent to
their friends.** Not a level, not a map, not a room with a theme. A game: things
that break, a reason to be there, a way to win or a reason to stay. It opens
from a link the way the lounge does — no install, no account, five seconds — and
the person who made it did not write a line of code or open a terminal.

Three things follow from that, and they are the whole of why this backend looks
the way it does.

**A game is a folder, not a file.** The cartridge metaphor held for as long as
every XP used our art. The moment somebody wants their own music in the café
level, their own model for the thing you are collecting, their own picture on
the shelf, the document stops being the whole game and becomes the *index* of
one. A folder is what a person already understands a game to be, and it is what
they can put in a zip and keep.

**The store is the product's second front door.** `/demo` sells the lounge by
letting somebody stand in it. Nothing sells the creator, because there is
nothing to look at: a creator with no library is a text editor with a 3D view.
The store is where an XP stops being a thing the team can demo and starts being
a thing that accumulates — and the day it has thirty XPs on it made by twelve
people, it is the strongest asset the product has, stronger than the landing
page and stronger than the demo.

**Somebody else's game is the whole risk.** Every decision below that looks
paranoid is downstream of one sentence: *a stranger's files, served from our
origin, into a session that has a login in it.* The product's entire premise is
that a link is safe to click. An XP store is the first thing we have ever built
that could make that false.

### What this is not

Not a marketplace. Nothing is sold, nothing is bought, and there is no payout —
the creator fund in [xp-creator.md](creator.md) §18 remains an idea with one
cheap thing asked of the present, which is that finished sessions get logged.

Not a mod platform. An XP may not extend the engine, ship a shader, or run code
outside the script sandbox. What a creator gets is the vocabulary the engine
already has, plus their own art, audio and prose.

Not self-hosting. Export, the download and the published packages stay v2 as
§12 describes. A folder is *closer* to exportable than a file was — it is
literally a directory you could zip — but nothing here builds the exporter.

---

## 1. The folder

An XP is a directory. One file in it is required and its name is fixed:

```
minigolf-night/
  document.xp.json      required — the cartridge, exactly as xp-manual.md §1
  vision.json           optional — prose, shown on the store page (§3)
  preview/
    01-cover.png        optional — the store pictures, first one is the front (§4)
    02-hole-seven.png
    03-the-windmill.png
  models/
    windmill.glb
  audio/
    night-loop.ogg
    putt.ogg
  data/
    holes.json
```

Everything below `document.xp.json` is optional and everything below it is
addressed by *path*, relative to the folder root, from inside the document:

```jsonc
{
  "format": "xp/2",
  "id": "minigolf-night",
  "assets": {
    // Declared, not discovered. See §1.2.
    "windmill": { "path": "models/windmill.glb", "kind": "model" },
    "night":    { "path": "audio/night-loop.ogg", "kind": "audio" }
  },
  "blueprints": {
    "windmill": { "model": "@windmill", "collider": "auto" }
  }
}
```

`@name` is the whole of the addressing syntax. A model id today is
`pack/Model_Name` and resolves against the shipped catalogue; a leading `@`
means "an asset this document declared", and the two namespaces cannot collide
because a pack id may not contain `@`. That is a one-line change to the
resolver in `packages/xp/src/assets/packs.ts` and it keeps
[xp-creator.md](creator.md)'s hard rule intact: **a document still cannot
name a path.** It names a key, the key was declared in the same document, and
the manifest turns the key into an object in a bucket.

### 1.1 What may be in it

| Kind | Extensions | Sniffed as | Cap per file |
|---|---|---|---|
| Document | `document.xp.json` | UTF-8 JSON, `parseXp` | 2 MB |
| Prose | `vision.json` | UTF-8 JSON, ProseMirror schema (§3) | 16 kB |
| Data | `.json` | UTF-8 JSON, depth ≤ 32 | 1 MB |
| Image | `.png` `.jpg` `.webp` `.gif` | magic bytes, then re-encoded | 8 MB |
| Audio | `.ogg` `.mp3` `.wav` | container parse (§5.3) | 8 MB |
| Video | `.mp4` `.webm` | container parse (§5.3) | 32 MB |
| Model | `.glb` | GLB chunk parse (§5.4) | 16 MB |

**`.gltf` is not on that list, and `.glb` is.** A `.gltf` is JSON with a list of
URIs in it — buffers, images, and a `.bin` sibling — which means accepting one
means accepting a file whose job is to name other files, and every one of those
names is a path we then have to defend. A `.glb` is the same asset with the
buffers and textures inside it, one file, self-contained, and it is what every
exporter emits when you tick "binary". The editor accepts a dropped `.gltf` and
converts it to `.glb` before anything is stored, so this is a storage rule
rather than a creator-facing one.

### 1.2 What may not

**No `.html` and no `.js`.** This is the sharpest cut in the document and it was
made deliberately.

Serving a stranger's HTML from `kxb.team` is stored XSS with the victim's
session, and it is the same reason `src/lib/uploads.ts` refuses SVG — the
comment there is worth reading, because the argument is identical and it has
already been won once in this codebase. The containment that actually works is a
second origin: a distinct hostname with its own cookie jar, its own CSP, and the
XP embedded in a `sandbox` iframe without `allow-same-origin`. That is a DNS
record, a Caddy block on the Hetzner box, a second set of CORS rules, and a
whole class of "why does this work locally" bugs, and it buys a capability
nothing in the vision above asks for.

So the behaviour a creator gets is the behaviour the engine already has: rules
in the document ([xp-manual.md](manual.md) §7) and JavaScript in the QuickJS
sandbox, which has no DOM, no `fetch`, a fuel limit and a memory ceiling.

**This is a format decision, not an engine one, and it comes back cheaply.**
`kind` is an open string on an asset and the allow-list is one table. The day
somebody wants a scoreboard drawn in HTML, the work is the second origin and
nothing else — the folder, the manifest, the caps, the review queue and the
store are all unchanged. Writing it down here means the next person does not
have to re-derive why it is missing.

Also refused, with less argument: `.svg` (XML, may contain script, same
reasoning as uploads), archives of any kind (`.zip`, `.tar`, `.gz` — a folder is
already the archive, and a nested one is a decompression bomb waiting for
somebody to add extraction), fonts (`.ttf`, `.woff2` — no engine path renders
text from a document yet, so accepting them stores bytes nothing can use), and
anything with no extension.

### 1.3 The manifest is the folder

The folder is not stored as a folder. It is stored as **a manifest of path →
content hash, plus the bytes, content-addressed.**

```jsonc
{
  "document": "sha256-4f9a…",
  "files": {
    "vision.json":          { "sha": "sha256-1c2d…", "bytes": 3104,   "mime": "application/json" },
    "preview/01-cover.png": { "sha": "sha256-88ae…", "bytes": 412990, "mime": "image/png" },
    "models/windmill.glb":  { "sha": "sha256-b071…", "bytes": 2249104,"mime": "model/gltf-binary" }
  }
}
```

Three things fall out of this and each one is worth the indirection on its own.

**Saving is a diff.** The editor sends the manifest first; the server answers
with the subset of hashes it does not already hold; the editor uploads only
those. Changing one line of the document on a 40 MB XP moves 2 kB. This is the
difference between a save that feels like a save and a save with a progress bar,
and [xp-creator.md](creator.md) §3.1 is right that losing work is the one
unforgivable bug a builder can have — a save nobody wants to wait for is a save
people avoid.

**A version is free.** A published version is a manifest, and two versions of an
XP that differ in the document share every byte of their art. Keeping the last
ten published versions of every XP costs about as much as keeping one.

**Bytes are immutable, so caching is trivial.** The serving route can set
`Cache-Control: public, max-age=31536000, immutable` on every asset without a
single invalidation path anywhere in the system, because a hash cannot come to
mean different bytes.

The cost is one lookup between "the level wants `models/windmill.glb`" and a
byte range, which is a map in memory, resolved once when the XP loads.

---

## 2. Caps

Every number here is a ceiling on somebody else's ambition, so each one carries
its reason. Where a number is a guess rather than a measurement, it says so —
the ones in [xp-manual.md](manual.md) §3 come from `bun run xp:bench` and
these do not, because there is nothing to bench until there is a folder.

| Cap | Value | Why this number |
|---|---|---|
| Files per XP | **256** | Enough for a level with its own soundtrack and a dozen models. A folder that needs a thousand files is a folder with a build step in it, and there is no build step. |
| Total bytes per XP | **128 MB** | About four minutes of 720p video, or one very generous set of models. Ten published versions of an XP at the cap is 1.3 GB before dedup and much less after, which the box can hold. |
| Path depth | **4 segments** | `a/b/c/file.png`. Deeper is organisation nobody looking at the folder benefits from, and every segment is another place a `..` has to be refused. |
| Path charset | `[a-z0-9._-]` and `/` | Lowercase only, because the Hetzner box is case-sensitive and a designer's Mac is not, and "it worked on my machine" about *filename casing* is a support conversation nobody enjoys. |
| Preview pictures | **8** | A store page, not a gallery. Eight is more than anybody scrolls. |
| `vision.json` | **16 kB** | Roughly 2,500 words of prose once the ProseMirror tree is serialised. Longer than anybody reads on a store page, and small enough to render server-side without thinking about it. |
| Data JSON depth | **32** | A parser guard. Nothing legitimate nests 32 deep; a hostile file nests until the parser's stack goes. |
| Decoded image pixels | **50 MP** | Inherited from `MAX_IMAGE_PIXELS` in `src/lib/image-sanitize.ts`, and for the same reason: it is a memory budget wearing a resolution costume. |
| XPs per space | **32 drafts, unlimited published** | The draft cap bounds what an abandoned account costs us. Published is reviewed, so the cap on it is a human. |
| Uploads per space per hour | **500 files / 512 MB** | A rate limit, not a quota. It exists so that a stuck editor retrying a save cannot fill the bucket overnight. |

**Caps are enforced in three places and that is not redundancy.** The editor
refuses a file before uploading it, so a creator learns at the moment they drag
it in. The intake route refuses it, because the editor is a client and clients
lie. The `xp_files` table carries a check constraint, because a bug in the route
should be a failed insert rather than a filled disk. This is exactly the
three-copies argument `src/domain/renders/jobs.ts` makes about `MIN_SIZE` and
`MAX_SIZE`, and it was right there too.

---

## 3. The vision, as a field

`vision.json` at the folder root. Optional. It is what the store page shows
under the pictures, and it answers the question a screenshot cannot: *what is
this, and why did you make it.*

**Why prose and not a longer blurb.** `blurb` is one line and it is doing the
job of a subtitle in a list. Everything a creator actually wants to say — the
rules, who it is for, what to try first, the joke — has nowhere to go, and
without somewhere to put it that material ends up in the *title*. A store full
of XPs called `NIGHT GOLF (2 players, use the ramp!!)` is a store that
discouraged prose.

**It is the editor this repo already has.** `src/app/components/editor/` is a
TipTap surface with a slash menu, image upload, tables, task lists and code
highlighting, and it is what a space's Pages are written in. An XP's vision is
the same act by the same person, so it is the same editor — which means the
authoring surface for this field costs approximately nothing and a creator who
has written a page already knows it.

**And the thing that makes it safe is what it stores.** TipTap hands back a
ProseMirror document — a typed JSON tree — not HTML. `src/domain/pages` stores
that tree verbatim in the log and renders it through our own renderer. **The
schema is the allow-list**: a node type that is not in the schema cannot exist
in a stored document, so there is no sanitiser here trying to out-think an
attacker and no `dangerouslySetInnerHTML` anywhere in the path. That is the
same property markdown would have bought, already built, and without adding a
second authoring model to a product that has one.

The one honest cost: `vision.json` is not a file anybody hand-edits, and §0 said
a folder is a thing somebody can zip and keep. So a **markdown serialisation
runs on export** — one-way, from the tree, when the exporter is written. Writing
markdown *out* is a function over a known schema; accepting it *in* would be a
parser, a sanitiser and a second set of node types to keep in step.

**Three constraints on top of the Pages schema**, because a store page is read
by strangers and a space page is not:

- **Links** get `rel="noopener noreferrer nofollow"`. `nofollow` because a
  public page anybody can write on is an SEO target the day it ships, and that
  is not a thing to find out from a search penalty.
- **Images must resolve into the same folder.** The Pages editor uploads to
  `uploads` and stores a URL; for an XP the same flow writes into the XP's own
  `preview/` and stores a folder path. An arbitrary external `src` is a tracking
  pixel that fires for every visitor to the store page and reports their IP to
  whoever the creator chose — a privacy fact `/datenschutz` would then have to
  describe.
- **No tables and no task lists.** They are in the Pages schema because a page
  is a working document. A store page is a pitch, and a checklist on one is
  somebody using the wrong surface.

Capped at 16 kB of serialised JSON, which is roughly 2,500 words of prose.

---

## 4. Preview pictures

`preview/` holds up to eight images. **They are ordered by filename and the
first one is the front picture** — which is why the convention in §1 numbers
them, and why the editor names them that way when it writes them.

`meta.cover` in the document overrides which one is the front, by path:

```jsonc
"meta": {
  "name": "Minigolf, at night",
  "blurb": "Nine holes. The windmill is not fair.",
  "cover": "preview/03-the-windmill.png"
}
```

**Why both, rather than only the override.** Filename order is the rule that
needs no interface: drop three pictures in, the first is the front, done. The
override is for the case that actually happens — somebody adds a better shot
later and does not want to rename three files to promote it. Order is the
default so the common case is free; the override is the escape hatch so the
common case never becomes a trap.

**A cover is generated if there isn't one.** `bun run xp:shot <id>` already
draws a document through the same transform the renderer uses, and the render
worker (`scripts/render-worker.ts`, `src/domain/renders/`) already turns a
document into a stored PNG off the request. An XP submitted with no preview at
all gets one drawn from its own spawn point rather than a grey placeholder — the
store's whole job is to show what a thing looks like, and a placeholder is the
one image guaranteed to be wrong.

That inherits the site's existing rule from [DESIGN.md](../../DESIGN.md): **pictures
are shot, not drawn.** A store card cannot advertise a room the XP does not
have, because the picture came out of the XP.

**Dimensions.** Stored as uploaded (within the caps), served through the
existing image pipeline. The card wants 16:10 and the page wants whatever it is
given; the card crops from the centre and says so in the editor with a frame
overlay, because a creator who cannot see the crop will put the important thing
at the bottom.

---

## 5. Intake — what happens between "drop" and "stored"

One pipeline, run per file, in this order. It runs inside the request, which is
only viable while every step is cheap; §5.6 is the seam for the day one is not.

### 5.1 The name

Before anything is read. Lowercase, `[a-z0-9._-]` plus `/`, at most four
segments, no segment empty, no segment `.` or `..`, no leading slash, no double
slash, one extension, extension on the allow-list. This is
`isSafeStorageKey`'s argument from `src/lib/uploads.ts` generalised to a folder:
the danger is not `/etc/passwd`, it is `a/../../b` normalising into another
tenant's prefix.

### 5.2 The type, from the bytes

Never from `file.type` and never from the extension. `sniffImageType` in
`src/lib/uploads.ts` is the existing table and this extends it with audio, video
and GLB signatures. **The declared extension must match the sniffed type**, and
a mismatch is a rejection rather than a correction — a file named `.png` whose
bytes are an MP4 is either a mistake worth telling somebody about or an attempt
worth refusing.

### 5.3 The rebuild, where a rebuild is possible

Images go through `src/lib/image-sanitize.ts` unchanged: decoded to pixels and
re-encoded. The comment in that file is the best explanation of why this beats a
signature scanner on a pipeline with a fixed format list, and it applies here
verbatim. Preview pictures and any image asset both take this path.

Audio and video are **not** re-encoded. Transcoding is ffmpeg, a minute of CPU
and a container in the deploy, and the threat it would address — a payload
hidden in a media container — cannot execute in a browser that is decoding it as
media. What they get instead is a **container parse**: walk the box/page/chunk
structure to the end and confirm it is well-formed, that declared lengths match
actual lengths, and that there is no trailing data after the last box. A
polyglot fails that, because the appended payload is trailing data.

### 5.4 GLB, which needs its own pass

A `.glb` is a 12-byte header and a sequence of chunks. The parse confirms: magic
`glTF`, version 2, the declared total length equals the file length, exactly one
JSON chunk first and at most one BIN chunk after it, every chunk length inside
the file, and — the one that matters — **the JSON chunk contains no `uri` field
that is not a `data:` URI**. A `uri` pointing at `http://` is a model that
fetches from somewhere else when a player loads the level, which is both a
tracking beacon and a way to change what a reviewed XP does after it was
reviewed.

Textures inside the BIN chunk are sniffed and size-capped like any other image,
but not re-encoded — they are inside a container whose offsets a re-encode would
break, and unlike a standalone image they are never served as an image.

### 5.5 The document

`parseXp`, which already exists and already collects every problem rather than
throwing on the first. Then two checks the parser cannot make on its own:

- Every `@name` in the document resolves to a declared asset, and every declared
  asset resolves to a path in the manifest. Both directions: a dangling
  reference breaks at play time in front of a player, and an undeclared file is
  a byte we are storing and serving for no reason.
- Every limit in [xp-manual.md](manual.md) §3 holds. Placements, entities,
  world radius, script size. These are already checked when a document loads;
  checking them at intake means a level that cannot run is refused at the point
  somebody can still fix it.

### 5.6 The scan seam

Every file gets `scan_status`, exactly as `uploads` does — see
`supabase/migrations/20260919000000_uploads_scan_status.sql`, whose comment
already argued this and whose column already exists on the other pipeline.

`clean` is the only value the app writes today, because every check above is
inline and a failure returns an error instead of inserting a row. `pending` and
`rejected` exist for the day a scanner runs off the request. **The serving route
filters on `scan_status = 'clean'` from day one**, which is a no-op against a
table where every row is clean and is the entire difference between a quarantine
state and a column nobody reads.

Behind `FEATURES.xp_scan` (default `false`), the pipeline gains one step: files
land `pending`, a job goes on the same queue `render_jobs` uses, and the XP
cannot be submitted for review until every file in it is `clean`. Nothing else
in the system changes, because the states and the filter are already there.

**What we are choosing not to have, said plainly.** No ClamAV. A signature
scanner catches known malware in files we pass through, and on this pipeline the
files we pass through are audio, video and GLB — none of which the browser will
execute, and all of which are structure-checked. It costs a container, ~1 GB of
signatures, a daily `freshclam`, and a new failure mode where uploads block
because a scanner is down. The flag above is what makes that a decision somebody
can revisit in an afternoon rather than a rewrite.

---

## 6. Where the bytes live

### 6.0 One blob, or one row per file? — one row per file

The question stated properly, because both answers are defensible and one of
them is defensible for reasons that stop applying the moment two people share a
project:

- **A.** Store the whole project — document and assets — as one object in the
  bucket. The database holds a reference to it.
- **B.** Store the document in the database, and each asset as its own
  content-addressed object referenced by the project's manifest.

**B, and it is not close.** Five reasons, in the order they bite.

**A save is a diff or it is a wait.** Under A, changing one line of a document
in a 40 MB project rewrites 40 MB. Under B it writes a row and uploads nothing,
because every hash in the manifest is one the server already holds. This is the
difference between a save people press and a save people avoid, and
[xp-creator.md](creator.md) §3.1 is right that losing an afternoon of
building is the one unforgivable bug a builder can have — a save with a progress
bar on it is how you train somebody not to press it.

**Two editors are two saves.** This is the reason that arrived with
collaboration and it is decisive on its own. Under A, a project is one object,
so two people editing it are two writers of the same object: the second save
overwrites the first *entirely*, silently, including the parts they never
touched. Under B the only shared thing is the document, which is one stream with
`expected_version` on it — so a genuine conflict is detected and reported and
two people working on different parts of the same project do not collide at all.
A whole-project blob does not have a concurrency story; it has a last-writer.

**The runtime wants one file at a time.** A level streams a 16 MB `.glb` when it
reaches the room that needs it. Under A there is nothing to stream — the client
must have the whole archive before it can read any of it. Under B every asset is
its own URL under an immutable cache header, because a content address cannot
come to mean different bytes.

**The document is a thing we query.** Which capabilities, which packs, whose it
is, which space it is in, has it been published. Under A that is all inside an
opaque object, so either it is duplicated into columns — two sources of truth for
the same fact — or it cannot be asked. Under B it is `jsonb`, indexed, and there
is one copy.

**Bytes dedupe.** The same model in five projects is stored once, and ten
published versions of one project share every asset that did not change between
them. Under A, ten versions is ten copies of everything.

**What A was actually for, and how it survives.** The appeal of one object is
that a project is *one thing you can hand over* — atomic, exportable, complete.
That is real and it does not require storing it that way. **Export assembles it
on demand** (§9): walk the manifest, pull the blobs, write a zip. The artifact A
would have stored is the artifact Export produces. Storing it would mean paying
Export's cost on every single save, in exchange for making it free on the rare
occasion somebody wants a download.

So: the document is a row, the assets are refs, and the zip is a build.

### 6.1 The bucket

Supabase Storage, private bucket `xp`, reached only with the service-role
client. Same posture as `uploads`, and for the same reason: a public bucket is a
URL that keeps working after a row is deleted, after an XP is unpublished, and
after a file is marked `rejected`.

**The key is content-addressed and scoped to the space that uploaded it:**

```
<tenantId>/<sha256>.<ext>
```

Identical to `storageKeyFor` in `src/lib/uploads.ts`, deliberately — same shape,
same containment check, one fewer thing to reason about. Scoped by tenant rather
than global even though the hash makes collisions impossible, because a global
namespace lets one space confirm another holds a given file by uploading it and
watching the dedup, and because "delete everything this space ever uploaded" is
a prefix rather than a query.

**Serving.** `/api/xp/[xpId]/[...path]` resolves path → sha through the
published manifest, checks the XP's state and the file's `scan_status`, and
streams from the bucket with a one-year immutable cache header. A route rather
than a signed URL because the state check has to happen per request: an XP taken
down for review must stop serving immediately, and a signed URL minted an hour
ago will not.

**The document is not in the bucket.** It goes in a `jsonb` column on the
version row, because it is read on every load, it is small, it is queried
(`capabilities`, `packs`), and a round trip to object storage for 40 kB of JSON
is a round trip nobody should pay.

---

## 7. Where the identity lives

The shape [xp-creator.md](creator.md) §3.1 and §16.1 already named: **a
stream for the identity, a blob for the document.** It is the battlefield shape
(`src/domain/battlefields/events.ts`) and the argument there transfers without
change — "the level formerly called Sandpit is now called Coliseum, and was
published on the 4th, and taken down on the 9th" is a fact about an object with
a lifecycle, and a lifecycle wants its own stream.

### 7.0 A project has an owner and a home, and they are different things

The two facts every project carries:

- **The owner is an account.** One person. They named it, they can publish it,
  transfer it, and delete it, and nobody can take it from them.
- **The home is a space.** Where it lives, who else can see it, and whose
  subscription pays for the bytes.

Everything below is a consequence of keeping those apart, and the schema forced
the shape rather than the other way round.

**A project cannot exist outside a space, and this is not a policy.**
`events.tenant_id` is `not null`
(`supabase/migrations/20260725090000_event_store.sql` as amended by the tenants
migration), the select policy is `tenant_role(tenant_id) is not null`, and
projection checkpoints are keyed by tenant. There is no such thing as an event
belonging to a person rather than a space. The store began that way — the column
was called `owner_id` and pointed at `auth.users` — and the tenants migration
renamed it `actor_id` and added `tenant_id` beside it, with the comment saying
in as many words that ownership had moved. Undoing that for one feature would
touch RLS, every checkpoint and every projection in the product.

So `actor_id` is who did it and `tenant_id` is where. The owner is a field in
`XpCreated`, and the home is the stream's own tenant.

**Therefore a move is a copy.** Every row of the log carries the tenant it was
written under, and the log is append-only — there is no update, by design and by
the absence of any policy permitting one. A project cannot change space by
changing a field. Moving it means a *new stream in the target tenant* carrying
the current document and manifest, the assets re-keyed under the new tenant's
prefix (§6.1 keys them `<tenantId>/<sha>`), and `XpMovedOut` closing the
original. The new stream's history begins at the move; the old one keeps
everything before it and stops.

That is worth knowing before it is discovered. It also collapses two features
into one mechanism: "move to another space" and "copy this into my other space"
are the same operation with a different last step.

**And there is no personal shelf.** A project lives in a space with an active
subscription or it does not live. Leaving with your work is **Export** (§9) — a
zip in your files, not a project in the product. That is the honest version:
somewhere has to pay for 128 MB of somebody's assets, and a free space cannot
write (`canWrite` in `src/lib/tenant.ts` refuses on `subscription.writable`),
which would make a "kept" project one you could look at and never touch. A file
you actually hold is worth more than a project you cannot open.

### 7.1 The stream

`src/domain/xps/events.ts`, stream type `xp`, on the home space's tenant.

| Event | Payload | Note |
|---|---|---|
| `XpCreated` | `name`, `owner`, `template`, `movedFrom?` | `owner` is the account, and it is the field the whole of 7.4 hangs off. `movedFrom` names the stream this one continues. |
| `XpRenamed` | `name` | |
| `XpVersionSaved` | `version`, `manifest`, `bytes`, `files`, `by` | The editor's save. `by` because saves are the record of who actually built it. |
| `XpAccessSet` | `spacePolicy` | `none` \| `view` \| `edit` — what every member of the home space may do. |
| `XpShared` | `account`, `right` | One person, `view` or `edit`. The invitation half is 7.5. |
| `XpUnshared` | `account` | |
| `XpTransferred` | `to`, `by` | The owner handing ownership to another account. |
| `XpMovedOut` | `to`, `by` | This project now continues as a stream in another space. Terminal. |
| `XpRemoved` | `by`, `reason` | The space owner taking it out of their space. See 7.4. |
| `XpSubmitted` | `version`, `note` | Asks for review. |
| `XpWithdrawn` | — | The creator taking their own submission back. |
| `XpPublished` | `version`, `by`, `listing` | Platform decision — see 7.3. |
| `XpRejected` | `version`, `by`, `reason` | Reason is shown to the creator. |
| `XpUnpublished` | `by`, `reason` | Was live, now is not. |
| `XpArchived` | — | Retired, not deleted. The bytes stay. |

**Publishing is not a field on the XP the space can set.** It is a platform
verdict, which is why `XpPublished` and `XpRejected` carry a `by` and are only
appended by the backoffice. This is the same distinction
[PRODUCT.md](../../PRODUCT.md) draws for event spaces: the ceiling is the
platform's, the switch is the host's.

**There is no delete.** The log is append-only by design and this is a place
where that is felt rather than merely true: an XP that was played by forty people
last week is referenced by forty analytics rows and possibly a match. `XpArchived`
removes it from every list; the bytes stay addressable by anybody holding a
direct link until a retention sweep collects them, and `/datenschutz` already
describes exactly this property of the system.

### 7.2 The read model

Projected into three tables. All three are read-side and rebuildable from the
log, per [architecture.md](../architecture/event-sourcing.md).

- **`xps`** — one row per XP. `id`, `tenant_id`, `owner_id`, `name`, `blurb`,
  `state`, `space_policy`, `current_version`, `published_version`, `cover_path`,
  `created_at`, `updated_at`, `plays`, `bytes`. This is what the store queries.
  `owner_id` beside `tenant_id` is the whole of 7.0 in two columns, and it is
  what makes "everything I own, wherever it lives" a query rather than a fan-out
  across every space somebody belongs to.
- **`xp_grants`** — one row per person shared with. `xp_id`, `account_id`,
  `right`, `granted_by`, `created_at`. Its own table rather than an array on
  `xps`, because it is joined against on every read and because revoking one
  person should not rewrite the row every reader is looking at.
- **`xp_versions`** — one row per save. `xp_id`, `version`, `document jsonb`,
  `manifest jsonb`, `bytes`, `files`, `created_by`, `created_at`. Immutable.
- **`xp_files`** — one row per distinct blob per tenant. `tenant_id`, `sha`,
  `ext`, `mime`, `bytes`, `scan_status`, `created_at`. Deduped, so this is the
  table the byte quota is summed from and the one a retention sweep walks.

### 7.3 The states

```
draft ──save──▶ draft
  │
  └─submit──▶ submitted ──┬── approve ──▶ published ──┬── unpublish ──▶ unlisted
                          │                            └── new submit ──▶ submitted
                          ├── reject  ──▶ draft (with a reason attached)
                          └── withdraw ─▶ draft
```

`unlisted` rather than back to `draft` on unpublish, because an XP that was live
has links pointing at it and dropping those to a 404 is worse than a page that
says it was taken down. Same argument `/v/[slug]` already makes for a space that
turns its public view off.

**A published XP whose creator edits it stays published on the old version.**
The draft moves; the store does not. This is the single most important thing in
the state machine and it is what makes review meaningful — a system where
publishing approves *an XP* rather than *a version of an XP* is a system where
the review is theatre, because the next save can be anything.

### 7.3.1 Releases are what the public sees

**A version is a save. A release is a version that was approved.** The store,
every link, every play and every embed resolve to a release — never to
`current_version`, which is a draft by definition the moment its author carries
on working.

That distinction earns a table (`xp_releases`) rather than staying one integer,
because one integer answers only "what is live" and the two questions that
arrive the day a project ships twice are *what has been approved before* and
*can we go back to it*.

**Rolling back is the owner's, not ours.** Every version a rollback can reach
has already been read and approved, so moving between them is movement *inside*
what review permitted rather than a way around it. Somebody who ships a bug at
midnight can put back the release from an hour earlier without waiting for a
reviewer to wake up, and the invariant that keeps that safe is one line in the
decider: you may only roll back to a version with a release row.

Three things fall out and each is deliberate:

- **A save is not a release.** Only approval writes a row, which is what keeps
  the list a set of things review has actually seen.
- **A withdrawn release stays in the list.** Deleting the row would erase the
  evidence that we approved something we later pulled — the row a moderation
  question wants. What stops a pulled release being quietly restored is that a
  take-down leaves the project `unlisted`, so going live again is a publish
  decision rather than a pointer move.
- **The history is not public.** A stranger playing a published project has no
  business knowing it shipped four times and pulled one of them. Owners, the
  space, grantees and the backoffice see it; nobody else does.

### 7.4 Who may do what

Resolved in one function, in this order, first match wins. Written as a ladder
rather than a set of checks scattered through the routes, because the question
"may this person edit this project" is asked from the editor, the save endpoint,
the space library, the profile list and the export route, and five copies of a
permission rule is one rule that drifts.

| Who | Read | Edit & save | Share | Move / transfer / delete | Submit |
|---|---|---|---|---|---|
| **The owner** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Granted `edit`** (§7.5) | ✓ | ✓ | — | — | — |
| **Granted `view`** | ✓ | — | — | — | — |
| **Member of the home space**, policy `edit` | ✓ | ✓ | — | — | — |
| **Member of the home space**, policy `view` | ✓ | — | — | — | — |
| **Member of the home space**, policy `none` | — | — | — | — | — |
| **Owner of the home space** | ✓ | — | — | remove only | — |
| **Backoffice admin** | ✓ | — | — | publish / take down | — |
| **Anybody, including signed out** | published only | — | — | — | — |

Four rules underneath it, and each one is a decision somebody will otherwise
make differently later:

**Editing needs the space to be writable, not just the person to be allowed.**
Every row above that says ✓ under edit is additionally subject to
`canWrite(context)` and `tierAtLeast(tier, 'xp')`. The grant says who; the
subscription says whether anybody at all. A space whose billing lapsed has no
editors, however many people it has shared a project with, and that is the same
answer the rest of the product gives.

**Sharing is the owner's, not the space's.** An `edit` grant survives the
grantee leaving the space, and it is the owner who revokes it. If sharing were a
space power, a space admin could hand somebody else's work to a third party.

**The space owner can remove, and can never take.** It is their space and their
bill, so `XpRemoved` is always available to them — the project leaves their
library and stops costing them bytes. What they cannot do is edit it, publish
it, rename it or become its owner. Nobody can be held hostage by the other:
an owner cannot squat in a space that no longer wants their project, and a
space cannot appropriate work made in it.

Removal is not deletion. It archives the project in that space and tells the
owner, with the reason, and their route to keeping it is Export (§9) — which is
the honest consequence of 7.0's "no personal shelf". So the notification has to
say that plainly and link the export, rather than saying "removed" and leaving
somebody to work out that their project is now a page they can read and not a
file they hold.

**Playing a published XP needs nothing, including an account.** A guest on a
link is the majority of everyone who will ever open one, and
[PRODUCT.md](../../PRODUCT.md)'s fourth principle applies to an XP exactly as it
applies to a lounge.

`src/app/xp/gate.ts` stays as it is for the *operator* creator at `/xp`. The
tenant-facing editor is a different route with a different gate, and the two are
deliberately not merged: the operator tool is open in development for the reason
its comment gives, and that reason must not leak onto a route real customers
reach.

### 7.5 Inviting somebody who is not here

Two cases, and only one of them is new.

**Already in the space.** A member picker; `XpShared` names their account.
Nothing to send.

**Not in the space.** This is where it gets expensive, and the answer is to not
build it: **an invitation to a project is an invitation to the space.** The
existing tenant invitation flow (`tenant_invitations`,
`has_tenant_invitation`, the whole of `/t/<slug>/members`) already handles the
email, the acceptance, the role and the seat, and it is the thing that decides
who is inside the RLS boundary the project's stream lives behind. A parallel
"project invitation" would be a second half-built version of it that still had
to end by making somebody a member, because a non-member cannot read the stream.

So the editor's Share panel offers "invite to the space and share this with
them", which is one form producing two events — the existing invitation, and an
`XpShared` that applies the moment they accept. What it must not do is imply the
guest gets access to *only* this project: they are becoming a member of a space,
and the panel says so in those words.

### 7.6 The profile list

"Everything I own" is `select * from xps where owner_id = me`, across every
space, ordered by when it was last saved. It is one query because `owner_id` is
a column on the row rather than a fact inside the log, which is the reason 7.2
puts it there.

It shows the home space on every entry, because a project's name is not unique
and "which one is this" is answered by where it lives. A project in a space the
viewer has since left still appears — they own it — and its controls collapse to
Export, because editing needs a writable space they are a member of.

---

## 8. The store

### 8.1 Two routes, because there are two questions

| | `/browse` | `/t/<slug>/browse` |
|---|---|---|
| Who | Anybody, signed out | A member of this space |
| Asks | *What is this, and is there anything here I want to play?* | *What are we working on?* |
| Shows | Published XPs, then a Misc section of worlds | This space's projects — drafts and all — plus yours from elsewhere |
| Controls | Play | Open in the editor, share, move, export, submit |
| Replaces | Nothing; `/worlds` stays as it is | The **Worlds** tab, for `xp` spaces |

**Neither is a version of the other, which is why they are two pages.** The
public one is a shop window: it is the only surface that can bring somebody who
has never heard of this in, and it is read by people with no account, so it can
only ever show what has been published and reviewed. The in-space one is a
workbench: it is mostly drafts, mostly unfinished, and the useful controls on it
are the ones nobody outside the space may press. A single adaptive page would be
a weak shop window wrapped around a weak workbench.

They meet in one place: **opening something from the public store lands you in a
space.** Play is a session and a session needs a home — so the play control on
`/browse/xp/<id>` resolves to a space you are in, and asks which one if you are
in several. That is the whole of "browse opens in the space".

**The Worlds tab.** `src/app/t/[slug]/sidebar.tsx` shows Worlds on
`features.worlds`. For a space on the `xp` tier that entry becomes **Browse**
and points at `/t/<slug>/browse`, with the space's worlds moving into a Misc
section on it — the same split the public page makes, for the same reason. An
`xo` space keeps Worlds exactly as it is, because it has no projects to put
above them.

**`/worlds` is untouched.** It keeps every filter, the saved list and the shared
tag links, and it links to `/browse`. An earlier draft of this document had it
redirecting; that was wrong. It is the full catalogue and the store shows six of
it — a page that people have sent each other links to should not become a
redirect to a page that shows less.

### 8.2 What is on it

Per the ask, in this order:

1. **XP, on top.** The largest cards on the page, three across on desktop, each
   one a front picture with a name, a blurb and who made it. This is the section
   the page exists for and it gets the space to say so.
2. **Misc, underneath.** Everything else that is publishable and browsable:
   worlds, battlefields, and whatever comes next. One section with its own
   filters rather than a section per kind — the honest description of the rest
   of the catalogue is "and also these", and three more headed sections would
   imply three more things as important as the first.

The existing filter chips (`WORLD_TAGS`, most-used vs newest, saved) move into
Misc unchanged. XP gets its own, smaller set — nothing tagged yet, so newest and
most-played until there is enough to filter.

**The empty state is the design problem, not the full one.** On the day this
ships there are perhaps four XPs, all made by us. A store with four things in it
must not look like a store that failed; it must look like a store that just
opened. That means the section carries its own invitation — *make one, it takes
an afternoon* — rather than a grid with five empty cells in it.

### 8.3 The XP page

`/browse/xp/[id]`. Front picture large, the rest of the previews under it, the
name, the blurb, who made it and which space, `vision.json` rendered, what it
needs (players, whether it has a match in it), and one control: **play**.

Public and signed out on purpose, exactly as `/worlds` already is and for the
reason its comment gives — this is the page that answers "what is this" for
somebody with no account, in the only way that lands.

### 8.4 Creating from the store

The store carries the create door, because the store is where somebody is when
they think *I could make one of these*. It goes to the editor for a space they
own on the `xp` tier, or to the tier page if they have none — and that second
path is a conversion surface that did not exist before, arrived at by somebody
who has just been looking at what they would be buying.

---

## 9. The editor, and what saving means

The editor is the one at `src/app/xp/_editor/`, given a different host. Today it
autosaves to `localStorage` and Save writes a `.xp.json` ([xp-creator.md](creator.md)
§3.1). Both behaviours stay — they are what makes the operator tool usable — and
the tenant editor adds a third: **Save writes the folder**.

The sequence, which is the manifest doing its job:

1. Editor computes the manifest of the current folder — hashing happens in the
   browser, so an unchanged 16 MB model is never read off disk again.
2. `POST /api/xp/<id>/save` with the manifest and the document. The server
   answers with the list of hashes it does not hold.
3. Editor uploads exactly those, each through the intake pipeline of §5.
4. When the last one lands, the server appends `XpVersionSaved`.

**Nothing is a save until step 4.** A half-uploaded folder leaves orphan blobs
in `xp_files` and no version referencing them, which the retention sweep
collects. The alternative — a version row written first and patched as files
arrive — is a version that can be read while it is incomplete, and it would be
read, because the store reads versions.

### 9.0 There is no preview environment, and that is the point

The obvious next feature after the editor is a try-out with other people in it —
a lobby, an invite, a way to get two colleagues into an unsaved document. It is
not being built, because the product already has two places where people are:

- **Load it into a place.** A room in your space, with whoever is already
  standing in it.
- **Load it into a battle.** `/t/<slug>/battle` already takes an `xpId`, already
  has seats, an invite, a lobby and a result.

So "try this with other people" is not a new surface, it is a destination the
editor hands a project to. That removes an entire multiplayer environment, its
invite path, its presence layer and its lifecycle from the plan — and everything
it would have done is done better by a battle, which already knows how to end.

The editor's own try-out stays solo: one player, the unsaved document, the
`local` host ([xp-creator.md](creator.md) §2.3). That is the fast loop, and
it is fast precisely because nobody else has to be told about it.

**`localStorage` autosave does not go away when the folder does.** It is the
guard against a closed tab, and a network save is not, because the case it
protects against includes "the network was the problem". Keep the last few
snapshots, warn before opening over unsaved edits, exactly as §3.1 says.

### 9.1 Save is not Export, and the editor must not blur them

Two controls, two meanings, and the names are load-bearing because the old
editor used **Save** for the thing that is now **Export** — it wrote a
`.xp.json` to your downloads folder. Anybody who used it before this lands has
the wrong idea of what the button does, so the two are worth stating flatly:

| | **Save** | **Export** |
|---|---|---|
| Does | Writes the project to the database | Assembles the folder and hands back a zip |
| Where it goes | The space | Your computer |
| Cost | A row plus whatever changed | Every byte of the project |
| How often | Constantly, and automatically | Occasionally, on purpose |
| Produces | A version | A file |

**Save is the game; Export is a copy of it.** Saving is not a thing somebody
should be thinking about — it happens on a timer and on blur, and the only
interface it needs is a line saying when it last happened. Export is a deliberate
act with a wait attached, so it is a button that reports progress and finishes
with a download.

**Export is the one place a whole-project object exists** (§6.0). The manifest is
walked, the blobs are pulled, and the result is a zip whose contents are exactly
§1's folder — `document.xp.json`, `vision.json`, `preview/`, the assets. It is
also the thing somebody leaves a space with, per 7.0, which raises its stakes:
this is not a convenience feature, it is the answer to "what happens to my work",
and it has to work on the largest project the caps allow rather than on a demo.

The zip is built server-side and streamed rather than assembled in memory —
128 MB is the cap, the box has 3.7 GB across two replicas, and a few people
exporting at once is not an unusual afternoon.

**Nothing about Export is an exporter in [xp-creator.md](creator.md) §12's
sense.** That one produces a runnable, self-hosted game with an engine bundled
beside it. This produces the folder, which is the input to that and is useful on
its own long before it exists.

---

## 10. The published list, in the backoffice

`/ovaloffice/xp`. Two queues on one page, deliberately, for the reason
`/ovaloffice/reports` already gives about worlds and messages: two queues on two
pages means one of them goes unchecked.

**Submitted** — what is waiting. Each row is the XP's front picture, its name,
the space that made it, when it was submitted, what changed since the last
approved version, and two controls: **publish** and **reject with a reason**.
The reason is shown to the creator, so it is written to be read by them, and the
field says so.

**Published** — what is live. Name, space, published version, when, plays, and
**take down with a reason**. Sortable by plays, because the honest answer to
"what should I look at first" on a moderation queue is usually "the one the most
people are seeing".

**Reviewing an XP means opening it.** A world is a place an admin must go and
stand in — `/ovaloffice/reports` already knows this — and an XP is more so,
because it has rules in it. The queue links straight into the player on the
submitted version, and the row carries the things that cannot be seen by
standing in it: file count, total bytes, what kinds, and whether any file's
`scan_status` is not `clean`.

**A reject is not a delete.** It moves the XP back to draft with the reason
attached, and the creator can fix it and submit again. The whole loop is
`XpRejected` → edit → `XpSubmitted`, and none of it destroys anything.

---

## 11. What to build, in order

Each step ends with something that works on its own, which is the same
discipline [xp-creator.md](creator.md) §14 uses.

**B0 — the folder, in the engine.** `xp/2`: `assets`, `@name` resolution,
`meta.cover`, the parse rules of §5.5. Pure, in `packages/xp`, tested with
`bun test packages`. An `xp/1` document still parses. *Ends with:* a document
that references its own model, loaded from disk by the existing operator route.

**Narrowed, and it is worth knowing before this is picked up.** B0 is for art
*an author supplies*. Art **we** draw does not need it and never did: a model or
a clip of ours goes into a pack under `public/xp/packs/`, through the generators,
and a document names it `pack/Model_Name` the way it always could. So B0 no
longer gates our own content or the animator — [backlog.md](backlog.md) §0.1 and
§0.7 carry that decision and why the same move cannot work for a tenant's upload
(one image, two replicas, one flat namespace). What that leaves B0 gating is the
first customer with a file, which is a better reason to build it than the one
this list opened with.

**B1 — intake.** The name/sniff/rebuild/parse pipeline of §5, as
`src/lib/xp-intake.ts`, with the audio, video and GLB signature tables. Tested
against a corpus of deliberately broken files — a truncated GLB, a GLB with an
`http` uri, an MP4 with a payload after the last box, a PNG that is an MP4.
*Ends with:* nothing user-facing, and the thing every later step depends on.

**B2 — storage and the stream.** Bucket, `xp_files`, `xp_versions`, `xps`,
`xp_grants`, the events of 7.1, the projection, `/api/xp/[xpId]/[...path]`.
`owner_id` and `space_policy` are columns from the first migration rather than
added later — 7.0 is not a feature on top of this, it is the shape of it. *Ends
with:* an XP stored as a folder and played from the database instead of
`public/`.

**B3 — save from the editor.** The manifest handshake of §9, and the tenant
editor route with its tier and `canWrite` gates. *Ends with:* somebody on an
`xp` space can make an XP and reopen it tomorrow.

**B4 — the public store.** `/browse`, the XP section, the XP page,
`vision.json` rendering, previews, the create door. *Ends with:* the thing in
§0's second paragraph. **Done, against the documents on disk** — see
`src/domain/xps/catalogue.ts`, which returns a summary rather than a document
precisely so that B2 can fill the same seven fields without the pages changing.

**B5 — the space library.** `/t/<slug>/browse`, the Worlds tab becoming Browse
for `xp` spaces, the permission ladder of 7.4 as one function, and the profile
list of 7.6. *Ends with:* two people in one space working on the same project.

**B6 — sharing and moving.** `XpShared`/`XpUnshared`, the space policy switch,
the invite-to-the-space flow of 7.5, `XpTransferred`, and the copy-to-another-
space of 7.0. *Ends with:* a project that outlives the space it started in.

**B7 — Export.** The zip, streamed, from the manifest. Small on its own and it
should not be last: it is the answer to "what happens to my work", so it wants
to exist before the first person is told their project was removed from a space.

**B8 — review.** `/ovaloffice/xp`, both queues, publish and take-down. *Ends
with:* a published XP that somebody outside the team made.

B0 and B1 are independent of everything else and of each other. B5 needs B2 but
not B3 — a library can list projects before the editor can write them. B7 needs
only B2. The one ordering that is not negotiable is B2 before anything that
stores a project, because `owner_id` on the first migration is what stops 7.0
from being a retrofit.

---

## 12. Decisions still open

**12.1 Does an XP get a slug or an id in its URL?** `/browse/xp/minigolf-night`
reads better and is a namespace with a squatting problem and a rename problem.
*Recommendation: id in the path, slug in the path as decoration —
`/browse/xp/<id>/<slug>` with the slug ignored, which is the shape that survives
a rename.*

**12.2 What happens to `public/xp/xps/`?** The four documents we ship are
fixtures for tests and demos as much as they are content. *Recommendation: they
stay on disk and stay the operator route's source, and the store reads the
database only. Two sources for the same route is where this gets confusing.*

**12.3 Retention on archived and rejected bytes.** A sweep needs a policy and
the policy is a privacy question rather than a storage one. *Recommendation: 90
days after the last version referencing a blob is archived, and say it in
`/datenschutz` before the first sweep runs rather than after.*

**12.4 Does a published XP count against its space's byte quota?** If it does,
a popular creator pays for their own success. If it does not, a space can
publish 40 XPs at the cap and stop paying. *Recommendation: it counts, and the
cap is generous enough that the question is theoretical until it is not.*

**12.5 Cross-space forking.** Worlds can be forked; an XP has rules and prose
and somebody's music in it, which makes a fork a different kind of act. *Not v2.
Raise it when somebody asks.* Note that 7.0's copy-to-another-space is already
the mechanism — a fork is that, with a different owner and a credit line.

**12.6 What does a move cost the space it leaves?** A copy leaves the source
tenant's blobs in place until a sweep collects them, so for a while both spaces
are billed for the same bytes. *Recommendation: accept it, and make the sweep
run soon after `XpMovedOut` rather than on the general 90-day clock in 12.3 —
this is the one case where the bytes are provably referenced somewhere else.*

**12.7 Can two people have the editor open at once?** ~~Open.~~ **Answered —
no, one at a time.** A project is claimed when somebody opens the editor, and
while that claim is live nobody else can save into it. Collaboration is a real
project and this is not a small version of it; it is the thing that means we do
not have to pretend.

**The claim is a row with a clock, not a lock.** `xp_claims` holds who has it
and until when. The editor renews every 20 seconds and the claim dies 90 seconds
after the last renewal, so a closed laptop frees a project in a minute and a
half — which is the entire reason it expires. A lock that has to be released to
be given up is a lock that a crashed tab holds forever, and the person it holds
it against is usually the person who owns the thing.

**Taking over is allowed, and only once the claim is stale.** Not while it is
live: that would make the claim advice rather than an answer, and two people
saving over each other is exactly what this exists to stop. So a second editor
sees *"Ana has this open"* and gets the project read-only until the claim
lapses, at which point the button becomes Take over.

**It is not a permission and it is not the correctness guarantee.** The ladder
in 7.4 still decides who may edit at all, and `expected_version` on the stream
is still what makes a concurrent save fail rather than clobber. The claim
reduces how often anybody meets that failure; it is not what makes the failure
safe. Two mechanisms with two jobs — and if the claim were the only thing
standing between two writers, a clock skew would be a data-loss bug.

**Whose claim wins when the owner is locked out by a collaborator?** Nobody's,
deliberately. The owner waits ninety seconds like everybody else. A claim the
owner can break instantly is one a collaborator cannot rely on, and "I lost ten
minutes of work because the owner opened the tab" is worse than "I waited".

Not this: live co-editing, a shared cursor, presence in the editor, operational
transform. A shared cursor in a 3D editor is not a feature you add to a save
endpoint, and doing a bad version of it first would make the good version
harder.

**12.8 Does removal from a space need a grace period?** 7.4 says the space
owner may always remove, and Export is the owner's recourse — which is only true
if they see the notice before they lose access. *Recommendation: `XpRemoved`
hides it from the space immediately and keeps the owner's read and export for 30
days, said in the notification. A removal that takes the download with it makes
7.0's promise false at the one moment it matters.*
