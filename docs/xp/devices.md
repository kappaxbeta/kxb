# Mobile, desktop and XR

One XP on three device classes: a standard fit that works everywhere by
default, per-device overrides for the author who has a reason, and XR as a
second input model rather than a skin.

Split out of [xp-backlog.md](backlog.md), which keeps the short entry and
the gating. **The half this document called the large one is built** — see §6.1,
written from the code rather than from the plan. Section numbers in
cross-references are the backlog's unless stated otherwise.

---

## 6. Device targets

**State:** mobile largely exists; **XR is built and playable**; the presentation
block is the piece still open. **Size:** the block is small — and it is now the
whole entry.

**Mobile is already designed in** rather than pending. `MAX_PLAYER_KEYS` is five
*because* those become on-screen buttons on a phone — "a dozen is a control pad
nobody can reach the middle of" — and §8.1 names a mobile layout that is not a
walk stick as part of the shooter demo.

**The presentation block is what is left, and it is the cheap, high-value
piece**: what
this XP looks like and how it is controlled, per device class. Camera framing,
HUD, control layout, and which of the five keys become buttons. It is small, it
is the thing that makes a board game playable on a phone (§5), and it is the
half of §1's preview route that is worth building carefully.

**Standard fit by default, per-device route on top — and the default is the
part that has to be good.** The block is optional. Absent, an XP gets a
presentation that works on phone, desktop and headset without the author having
decided anything, derived from what the document already says: how many keys it
binds, whether there is a player at all, how big the world is. Present, it
overrides — per device class, and only the fields it names.

That tri-state is the shape this format already uses everywhere — *"Absent is
none, which is every document written before this"* — and it is load-bearing
rather than tidy. Every document written before the block exists has to keep
working on every device, and most authors will never open it. **A per-device
route that authors are obliged to use is a per-device route that ships three
broken layouts**, because two of the three are ones the author does not own the
hardware to check. The override is for the author who has a reason; the default
is for everybody else, and it carries the quality bar.

**What makes that promise safe to make is §4**, and the two entries should be
read together. A default derived automatically for hardware the author cannot
test *will* be wrong somewhere. With outcomes decided server-side, wrong means
an XP that looks bad on that device; with the client deciding, wrong means one
that plays unfairly on it. That is the difference between a layout fixed next
week and a result somebody disputes, and it is why §4 is a gate in front of
shipping this rather than a neighbour of it.

It must go through `parseXp` like everything else — [xp-scenes.md](scenes.md)
§0 has the argument about why a freeform blob does not get to reach the runtime,
and it applies here unchanged.

**XR was called the large half, and it is built.** It is a second input model
rather than a skin, exactly as this section argued — and the shape it took is
worth reading before anything is added to it, because three of the decisions are
ones a redesign would otherwise make again badly.

---

## 6.1 What XR turned out to be

`_runtime/input/vr.ts`, `vr-hud.ts` and `vr-panel.tsx` — a rig and two sticks, the
level's own keys on the controllers, and a HUD for the eyes that cannot see the
page. Four decisions, each of which is a refusal of the obvious version:

- **Jump moved to the right trigger, and the fifth binding is *said*.** A pair
  of controllers has four face buttons; a document may bind five keys, and jump
  and dance are reserved on top of that — seven wanted, four comfortable. So
  `bindingsFor` places what it can and **returns what it could not**, and the
  headset's own controls card prints it. The tempting version spills the fifth
  onto a grip and says nothing, which is this codebase's oldest refusal: a
  binding that silently does not work is worse than one that is missing, because
  the author believes it and hears about it from somebody wearing the headset.
- **The panel is body-locked, not welded to the face.** A rectangle parented to
  the camera never moves relative to the eye and fights every vestibular cue the
  wearer has. This one follows your yaw slowly and ignores pitch entirely, and
  sits two metres out — closer than about a metre asks the eyes to converge
  harder than they focus, which is the other reliable way to send somebody home
  with a headache.
- **There are two HUDs and they say the same things**, because an immersive
  session draws only what the renderer draws: the score, the clock, the ammunition
  and the *you are down for 3* all vanish at the moment they matter most. The
  arithmetic — what to say, where the panel goes — is in `vr-hud.ts` and tested;
  only the drawing is in the component.
- **The way in appears only when there is a way in.** `navigator.xr` is absent on
  every phone and on desktop browsers with no headset, and Chrome on a laptop
  *has* it and answers `false` — so the Enter VR button waits for
  `isSessionSupported` rather than trusting the object's existence. A button that
  is always there and fails on a laptop is worse than one that is simply not.

Movement is a left stick with a right stick that only turns, and turning is
**snapped** — 30° at a 0.7 deflection — which is the comfort default rather than
a preference, and the one thing here that a settings panel will eventually want
to make optional.

**What XR still does not have** is hands and rays (everything above is
controllers), scale as a design surface, and any of §5's *board game as a table
you stand at* — which remains the best XR case in this backlog and has never
been tried on a headset.

---

