# Faces and voice — somebody's camera and microphone, in the room with you

A person in a world may switch their camera on, and it is drawn as a circle in
front of their peep's head. They may switch their microphone on, and their voice
comes from where they are standing and fades as you walk away. Both go
**directly from one browser to another**: never uploaded, never stored, never
through the app.

**Status: shipped and off.** The code is in production behind the `faces` flag,
which no space has. Nothing about it is reachable — no camera button, no
signalling, no peer connections — until an operator turns it on for a space.

---

## The switch, end to end

Three separate things have to be true before anyone is on camera, and they are
owned by three different people. That is the design, not an accident.

| Gate | Who decides | Where |
|---|---|---|
| Is `faces` on for this space? | an operator | `/ovaloffice/feature-flags`, or a per-space override |
| Is the camera or mic button pressed? | the person | the lounge HUD, two separate switches |
| May this page use the device? | the person's browser | the permission prompt, on their device |
| When is the mic actually open? | the person | push-to-talk or open mic, chosen at the door |

Nobody's camera or microphone can be switched on remotely. The flag reveals a
control; the control asks the browser; the browser asks the person.

Two switches rather than one, because plenty of people want to be heard and not
seen and rather more want the reverse — a single control would make each of
those a choice to give something up.

### Turning it on

The flag row arrives with migration `20261224000000`. **Without that row the
flag is not merely off — it is absent from the backoffice and cannot be turned
on by anybody**, because `/ovaloffice/feature-flags` lists what
`listFeatureFlags` reads out of the table rather than what the code registry
declares. The app is unaffected either way: `resolveFeatures` merges the
database over the registry's fallbacks, so a missing row resolves to `false`.

Migrations do not travel with a deploy. They are pushed separately:

```bash
bun run db:push-prod
```

**If that script says `port 55433 is already in use`, it did nothing.** A
previous run left its SSH tunnel behind; the script refuses rather than pushing
through a tunnel it does not own. Close it and run again:

```bash
kill $(lsof -t -i :55433) && bun run db:push-prod
```

This has already caught us once: the push was run, reported the port in use,
and the migration silently did not apply — production sat one migration behind
while everything looked done.

---

## Voice

### Push-to-talk or open mic, and why it is a device setting

The choice sits on the entry panel beside the camera-drive question, and again
in settings. It is stored **per device**, like `camera-mode` and `hand`, and
here the argument is sharper than for either: this is a fact about the room the
hardware is in. Open mic on headphones at home is not open mic on the laptop in
a shared office, and a preference that followed somebody between the two would
be wrong in one of them every time — in the direction that broadcasts a private
conversation.

**The default is push-to-talk**, and that is not a toss-up. Somebody who wanted
open mic and got push-to-talk holds a key and is briefly annoyed. Somebody who
wanted push-to-talk and got open mic has sent their room to everybody standing
near them and finds out afterwards. Defaults belong on the recoverable side.

The key is **T**, for talk. Not `V` — that is three keys from the movement hand
and already means view.

### Push-to-talk gates the track, not the volume

`track.enabled = false` sends silence. Muting on the far end would still put the
room on the wire, so the gate has to be on the sending side, and it has to be a
flag on an already-negotiated track rather than a track swap: this is pressed
and released many times a minute and a renegotiation per press is not a design.

Three things follow from taking that seriously, all in `face-store` and
`use-push-to-talk`:

- **The mic opens muted.** The device is live the instant the prompt resolves,
  and in push-to-talk that is exactly when nothing should be audible. Starting
  enabled and switching off a frame later is a frame of a room nobody agreed to
  send.
- **It closes on blur and on the tab being hidden.** A held key produces no
  `keyup` when the window loses focus. A microphone live in a tab nobody is
  looking at is the thing this feature would be remembered for.
- **`T` does nothing while somebody is typing.** The lounge has a chat box, and
  saying "tomorrow" in it would otherwise open the microphone eight times.

### Positional, which is what makes open mic tolerable

Voice comes from the peer's body — `THREE.PositionalAudio` in the group the face
already hangs in — and falls off with distance. A flat conference mix lets a
room hold exactly one conversation and calls the second one interrupting;
falloff lets it hold as many as the room has corners. You drift toward somebody
and you are talking to them.

It also bounds the cost of an open mic: the blast radius of somebody's keyboard
is a few metres of world rather than everybody online.

The numbers — full volume within **2.5 cells**, inaudible past **18**, *linear*
falloff — are a first guess and worth tuning by ear. Linear rather than the
physically-correct inverse on purpose: inverse spends almost all of its range in
the first couple of metres, so somebody goes from clear to inaudible in one step
and the middle distance, where a room's conversations actually separate, barely
exists.

### The pump element

`PositionalAudio.setMediaStreamSource` has a known hole: several browsers will
not decode a `MediaStream` fed only into WebAudio, because nothing is *playing*
it. The cure is a muted `<audio>` element carrying the same stream, parked in
the document, which makes the browser pull frames. The element is silent; the
sound comes out of the graph.

It must be **in** the document. A detached element is not reliably decoded, and
a pump that is not pulling frames is a speaker that never makes a sound — the
same one-line, invisible-when-wrong mistake as the video path's.

---

## How a picture gets from one browser to the other

### Signalling rides the room's own channel

There is no new socket and no new topic. Offers, answers and ICE candidates go
out as a `face` broadcast on the same Realtime channel that already carries
movement, addressed to one connection and dropped by everybody else — the same
arrangement `hit` and `push` use, for the same reason: Realtime has no private
lane, and the alternative is a channel per pair.

**This is why there is no RLS migration.** A `face:<id>` topic would have needed
its own policy and would have been refused without one. An event on an existing
topic inherits the policy that topic already has.

### Presence carries the camera

`channel.track()` gained one boolean, `face`. Without it either every pair holds
an idle connection against the possibility of a camera, or a camera switched on
has no way to announce itself. One field on a payload already being sent is
cheaper than either.

### One connection, two tracks, negotiated once

Every link is built with a video transceiver **and** an audio one, `sendrecv`,
before anything is negotiated and whether or not there is a camera or a
microphone to put in them. Switching either on is then `replaceTrack` into a
sender that already exists: no second offer, and therefore no glare for perfect
negotiation to resolve.

**The order of the two matters.** m-lines are matched by position, so both ends
must add them the same way round or one end's camera arrives in the other's
speaker. Both ends run the same function, which is what makes that true rather
than a convention somebody has to remember.

This is also why the role can be decided by connection id alone. An earlier
version made the end holding the camera call, which meant a button press flipped
the role, which meant the connection had to be torn down to honour it —
everybody in the room saw a second of black because one person switched their
camera on.

### Nobody has to resolve a race

The usual arrangement for a mesh is *perfect negotiation*: both ends may offer,
and a polite peer rolls its own offer back when one arrives mid-flight. It
exists because two clients usually have no agreed ordering.

Here they do — presence hands everyone the same roster, and every client already
has a sorting connection id. So **the lower id offers and the other end never
offers at all**, which deletes the rollback path, the polite/impolite flag, and
the class of bug where both ends think they were the polite one.

### The cap is global, not local

`MAX_FACES` is 4, applied to the same sorted list on every machine, so all of
them admit the same four. A cap each client applied to its own view would let
two clients admit different sets — and a pair that disagrees about whether it
should exist is the one failure the whole module is arranged to avoid.

The decisions live in [`src/domain/world/faces.ts`](../../src/domain/world/faces.ts)
with their tests; [`face-links.ts`](../../src/app/world/_video/face-links.ts)
holds the connections and has no opinions.

---

## Two bugs worth not rediscovering

**Presence appends, it does not replace.** A client that re-tracks is in
`presenceState()` *twice* — once as it joined, once as it is now. The lounge
roster of people has always survived this by deduping on first-seen, where the
answer is the same either way. It is not the same either way for a camera: the
two copies disagree, `linkRole` answers differently depending on which it reads,
and the two ends settle on incompatible roles and rebuild the connection on
every sync, forever. `freshest()` collapses by connection, last row wins.

**A probe that grows the space it measures eventually measures the growing.**
The two-browser probe minted two accounts into the test space on every run and
left them there. At sixty-nine members the space was over `seat_limit`, being
over the cap *shelves* members, and the second player of every pair was the one
shelved — which presents as a scene that never finishes loading. It cost the
better part of a day, misattributed to machine load throughout. The probe now
removes its players on exit.

---

## Getting through a NAT

Face video connects directly wherever it can. Two people on one network always
can; two people who both have IPv6 usually can, because a globally routable
address needs nothing reflected. Everybody else needs a relay, which is a
separate piece of infrastructure and is **not running**.

[operations/relay.md](../operations/relay.md) is authoritative: the three
candidate tiers, what IPv6 does and does not fix, the credential scheme, how to
stand a relay up, and the deny list that stops a relay becoming a proxy into its
own network.

---

## Verifying it

One tab cannot be both ends of a call, so this needs two browsers:

```bash
node scripts/faces-two-browsers.mjs
```

It turns the flag on locally, mints two players into a local space, gives each a
synthetic camera, and screenshots what each one sees. `HEADED=1` to watch.

It wants **a quiet machine** — two headless SwiftShader contexts and a dev
server is most of a laptop, and under load the scene does not finish inside the
timeouts and the run tells you nothing. Check for orphaned browsers from a run
that timed out before blaming the machine:
`pgrep -f playwright_chromiumdev_profile`.

What success looks like: `videos after backing off: 2 2` and `voices heard:
1 1`. Two `<video>` elements per page — each player's own camera plus the peer's
— and one `<audio>`, because your own microphone is never played back to you.
Fewer means it never crossed.

**Voice was first confirmed by hand rather than by this probe**, on two real
devices with real microphones. The probe's audio assertions have not themselves
been run, so a failure from them is as likely to be the probe as the feature.

---

## What it does not do yet

Honest list, roughly in the order they would bite:

- **The falloff numbers are guesses.** 2.5 cells to full volume and 18 to
  inaudible were picked by reasoning, not by ear, and they are the one part of
  voice that can only be judged with real people in a real room.
- **A broadcaster's upload is unbounded in room size.** The cap bounds how many
  cameras a room carries, not how many copies each one sends — in a mesh, one
  broadcaster sends a copy per person present. That is the point at which the
  answer stops being a relay and starts being an SFU.
- **iOS is untested.** Safari needs a gesture for `getUserMedia`, needs
  `playsInline`, and kills the stream when the tab backgrounds. All three are
  handled in the code and none has been proven on a device.
- **Nobody is told who can see or hear them.** A person knows their own camera
  and microphone are on — the chips say so, and the mic chip lights while sound
  is actually leaving. There is no indicator of who is receiving either.

---

## The privacy position

Worth stating plainly, because it is the part a Datenschutz page has to be able
to describe:

- The picture and the voice are **peer to peer**. Neither is stored, logged, or
  reaches the app's servers. Nothing is persisted anywhere: the camera and mic
  state live on presence and die with the tab.
- **Push-to-talk sends nothing while the key is up.** It is a gate on the track
  rather than a mute on the far end, so the silence is real rather than
  something a listener could turn up.
- A **relay, once one exists, carries the bytes** — encrypted end to end
  (DTLS-SRTP), so it is transport rather than an audience, but it is a third
  party in the path and belongs in the text.
- **ICE discloses addresses.** Peers learn each other's candidates, which is how
  they connect. Over IPv4 that is a per-household NAT address; over IPv6 it is a
  globally routable address of that person's *device*. Privacy extensions blunt
  it. This is the sharpest disclosure in the feature and it is inherent to
  peer-to-peer, not a choice we can configure away.
