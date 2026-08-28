/**
 * What a script sees.
 *
 * This file is mostly one string: JavaScript that runs *inside* the sandbox,
 * once, at the top of a fresh context. It builds the object API an author writes
 * against - `self`, `getEntityByName`, `world`, `log` - out of a handful of
 * primitive functions the host injected, and then hides those primitives.
 *
 * ---------------------------------------------------------------------------
 * Why the API is written in JavaScript rather than in the bridge
 * ---------------------------------------------------------------------------
 * Every value that crosses the wasm boundary has to be allocated, converted and
 * freed by hand on the host side. An `Entity` implemented in the bridge would be
 * a property descriptor per field per lookup and a few hundred lines of handle
 * bookkeeping that leaks the first time somebody adds a method.
 *
 * Written here it is a class. The bridge stays a flat list of functions that
 * take and return only numbers and strings, which is the part that is expensive
 * to get right; the part that is expensive to *read* is ordinary JavaScript
 * sitting next to the manual that describes it.
 *
 * The handles are cached by id, so a script calling `getEntityByName('door')`
 * sixty times a second allocates one object rather than sixty.
 *
 * ---------------------------------------------------------------------------
 * Why the list of bridge functions grows
 * ---------------------------------------------------------------------------
 * Because a *crossing* is the unit of cost here, not a function. `bun run
 * xp:bench` prices one at about 1.1 microseconds and prices everything on
 * either side of one at a fraction of that, so five hundred entities each doing
 * one thing a frame have room for about three trips apiece before the frame is
 * gone.
 *
 * That is why anything below written as several primitives - a distance out of
 * six reads, a nudge out of three reads and a write, an add out of a read and a
 * write - has since moved to the other side as one function. The rule when
 * adding to the API is: if it can be said in one trip, say it in one trip, and
 * put the arithmetic where the numbers already are.
 *
 * ---------------------------------------------------------------------------
 * Interning property keys, and why not
 * ---------------------------------------------------------------------------
 * A key crosses as a string, and a string crossing measures about 0.32us more
 * than a bare one - roughly a third again. `get`, `set` and `add` are the only
 * places that happens, so the obvious next move is to intern: the prelude keeps
 * a `Map` of key to a small integer, asks the host for the number once, and
 * passes the number ever after.
 *
 * It would be invisible to an author. Nothing in the format changes, nothing in
 * the editor changes, and a level still says `self.add('coins', 1)`. That is
 * the point of the idea and it is also the whole of its appeal.
 *
 * It is **not** being done, for three reasons that only appear once you write
 * it out:
 *
 *  - **A key built at run time gets slower, not faster.** `self.set('slot' + i,
 *    v)` is a fresh string every time, so every use pays the interning trip
 *    *and* the access trip - two crossings where there is one today. The habit
 *    is not rare: a level keying by lane, by team, by tick.
 *  - **The table has no end.** One entry per distinct key ever seen, on both
 *    sides, for the life of the level. A script keying by tick number leaks one
 *    a frame. Capping it means a `MAX_PROP_KEYS`, which means a level that hits
 *    it fails - a new way for a document to be refused, in a format whose
 *    limits are otherwise about how much a *frame* can hold.
 *  - **It buys about six per cent** of an ordinary script's step, and the trades
 *    already made here - `dist`, `moveBy`, `addProp` - were each strictly better
 *    in every case, with nothing to weigh up.
 *
 * What is worth taking first, if this is picked up again:
 *
 *  - `setProp` and `addProp` go through `applyVerb` with an object literal and
 *    a spread of an empty array per call. That is host work *inside* a crossing
 *    already paid for, it measures about the same as the string does, and it
 *    costs nothing to remove.
 *  - Nothing tells an author how many crossings their hook makes. A count in
 *    the editor would be worth more than any six per cent here, because the
 *    lever with the longest travel is not what a crossing costs - it is how
 *    many a level asks for.
 *
 * ---------------------------------------------------------------------------
 * Reading a position gives world coordinates; writing one moves it locally
 * ---------------------------------------------------------------------------
 * The asymmetry is deliberate and it is the only one in here.
 *
 * A script asking where something *is* means where it is drawn. "How far is the
 * player from this turret" has one answer, and for a gun hanging off a hand it
 * is not the offset within the hand's frame. So reads compose the parents.
 *
 * A script *moving* something can only move it relative to whatever it hangs
 * from, because that is the only position it owns - the rest belongs to its
 * parent. For anything unparented, which is nearly everything in a level, the
 * two are the same number and the distinction never comes up.
 */

/**
 * The bridge, by name, so the host and the prelude cannot drift apart silently.
 *
 * Written once rather than twice: the host builds exactly these and the prelude
 * destructures exactly these, and a missing one is a `TypeError` on the first
 * line of setup rather than `undefined is not a function` three frames into
 * somebody's level.
 */
import { MATERIALS } from '../document/blueprints'

export const BRIDGE = [
  'num',
  'setNum',
  'setPos',
  // A nudge, which used to be three reads and a write. See `moveBy` in ./script
  // - it is also the only spelling that is right for a parented entity.
  'moveBy',
  'alive',
  'prop',
  'setProp',
  // Adding to a number is one thing an author does and used to be two
  // crossings - read it, add, write it back. See the numbers in xp-bench: a
  // crossing is the expensive part, so the arithmetic moves to the side that
  // already holds the number.
  'addProp',
  'byName',
  // Distance is one call rather than six reads, because the boundary is what
  // this design pays for - see `dist` in ./script and the numbers in xp-bench.
  'dist',
  'damage',
  'runAnimation',
  'despawn',
  'material',
  'setMaterial',
  'spawn',
  'score',
  'emit',
  'log',
  // What the level says, in the reader's language. See `t` in the prelude and
  // the note on determinism in ./words.
  'say',
  'state',
  // What the level is, in words: `world.mode` and `world.style`. A string
  // rather than another `state` slot, because a script asking is going to
  // compare against a name.
  'about',
  'random',
  'data',
  'setData',
  // `world.add`, for `addProp`'s reason word for word: the level's fields are
  // the same idea one storey up.
  'addData',
  'spendData',
  // Velocity is the one field a script writes that the engine keeps writing
  // back, so it gets a verb of its own rather than a `setNum`: see `push`.
  'push',
] as const

export type BridgeName = (typeof BRIDGE)[number]

/** Which number `num` and `setNum` mean. Kept in step with the host's reader. */
export const FIELDS = ['x', 'y', 'z', 'rotation', 'scale'] as const
export type Field = (typeof FIELDS)[number]

/** Which number `state` means. Same deal. */
export const STATES = ['tick', 'time', 'seed'] as const

/**
 * The prelude, evaluated once per document into a fresh context.
 *
 * It leaves three names behind for a script to use - `Entity` is not one of
 * them, deliberately, because a script has no business building an entity out of
 * an id it invented - plus one for the host, which the host reads and then
 * deletes. After that there is no name in the sandbox that reaches out of it
 * except through the API below.
 */
export const PRELUDE = `
'use strict';
(function () {
  var b = globalThis.$b;
  var handles = new Map();
  // The list, inlined from ./blueprints by the export below, so a name that is
  // not on it throws *here* - inside the author's own script, with their line
  // number - rather than being dropped silently across the bridge.
  var MATERIALS = ${JSON.stringify(MATERIALS)};

  function Entity(id) { this.id = id; }

  Object.defineProperties(Entity.prototype, {
    alive:    { get: function () { return b.alive(this.id) === 1; } },
    x:        { get: function () { return b.num(this.id, 0); }, set: function (v) { b.setNum(this.id, 0, +v); } },
    y:        { get: function () { return b.num(this.id, 1); }, set: function (v) { b.setNum(this.id, 1, +v); } },
    z:        { get: function () { return b.num(this.id, 2); }, set: function (v) { b.setNum(this.id, 2, +v); } },
    rotation: { get: function () { return b.num(this.id, 3); }, set: function (v) { b.setNum(this.id, 3, +v); } },
    scale:    { get: function () { return b.num(this.id, 4); }, set: function (v) { b.setNum(this.id, 4, +v); } },
    // The lamp, for anything the document gave a \`light\` block. Zero on
    // everything else, and writing them there does nothing - see setNum.
    intensity:{ get: function () { return b.num(this.id, 5); }, set: function (v) { b.setNum(this.id, 5, +v); } },
    range:    { get: function () { return b.num(this.id, 6); }, set: function (v) { b.setNum(this.id, 6, +v); } },
    colour:   { get: function () { return b.num(this.id, 7); }, set: function (v) { b.setNum(this.id, 7, +v); } },
    // Read-only: being carried is a fact about the world, and \`carry\` and
    // \`drop\` are how it changes. 1 in anybody's hands, ours or a peer's.
    held:     { get: function () { return b.num(this.id, 9) === 1; } },
    angle:    { get: function () { return b.num(this.id, 8); }, set: function (v) { b.setNum(this.id, 8, +v); } },
    // How fast it is going, in cells a second, on each axis. Zero on anything
    // the document did not give a \`body\` to, and writing them there does
    // nothing - the same silent contract the lamp fields have, and for the
    // same reason: a level that moved its own scenery would leave a wall
    // drifting with nothing in the file to explain it.
    //
    // Readable as well as writable, which is the half a \`push\` cannot cover:
    // \"how fast is the ball going\" is what decides whether it is worth a
    // sound, a streak, or a rule about a shot that was too soft to count.
    dx:       { get: function () { return b.num(this.id, 10); }, set: function (v) { b.setNum(this.id, 10, +v); } },
    dy:       { get: function () { return b.num(this.id, 11); }, set: function (v) { b.setNum(this.id, 11, +v); } },
    dz:       { get: function () { return b.num(this.id, 12); }, set: function (v) { b.setNum(this.id, 12, +v); } },
  });

  // How fast it is going, whichever way. The number a \`hit\` rule wants.
  // Slot 13 rather than the three velocity slots squared here, because that
  // was three crossings for one number - see \`num\` in ./script.
  Object.defineProperty(Entity.prototype, 'speed', {
    get: function () { return b.num(this.id, 13); },
  });

  /**
   * What it is made of. \`'own'\` is the model's own glTF materials.
   *
   * A property and not a pair of methods, because it reads as one - a level
   * says \`self.material = 'rainbow'\` the way it says \`self.y = 3\`, and both
   * are facts about how the thing is drawn rather than things it does.
   *
   * A name the engine does not know is refused rather than ignored: a typo here
   * would otherwise be a thing that quietly never glows, which is the failure
   * every other named field in this format is arranged to avoid.
   */
  Object.defineProperty(Entity.prototype, 'material', {
    get: function () { return b.material(this.id); },
    set: function (v) {
      var name = String(v);
      if (MATERIALS.indexOf(name) < 0) {
        throw new Error("'" + name + "' is not a material: it is one of " + MATERIALS.join(', '));
      }
      b.setMaterial(this.id, name);
    },
  });

  Entity.prototype.get = function (key) { return b.prop(this.id, String(key)); };
  Entity.prototype.set = function (key, value) { b.setProp(this.id, String(key), +value); return this; };
  Entity.prototype.add = function (key, value) {
    b.addProp(this.id, String(key), +value);
    return this;
  };

  // Damage goes down the same path a shot does, so the entity's own \`damaged\`
  // rules still fire. A script that wanted to change health *without* waking
  // the rules up wanted \`set('hp', n)\`, and can say so.
  Entity.prototype.damage = function (amount) { b.damage(this.id, +amount); return this; };
  Entity.prototype.heal = function (amount) { return this.add('hp', +amount); };
  /**
   * Play a clip on this body.
   *
   * The one thing a script could not touch. \`blueprint.pose\` says what a body
   * holds *at rest* and the host picks the rest from how it is moving, so a
   * script could make a character walk somewhere and could not make it wave
   * when it got there.
   *
   * \`loop\` is off unless asked for, because most of what anybody wants is a
   * moment - a wave, a swing, a nod - and a one-shot that has finished hands the
   * body back to whatever it was doing. A looping one runs until something else
   * is asked for or \`runAnimation(null)\` clears it.
   *
   * The name is a clip in the pack the host loaded. One it did not load leaves
   * the body doing what it was doing, which is the same contract
   * \`blueprint.pose\` has and the reason the editor offers a list.
   *
   * \`parts\` is the difference between an animation and a *layer*. Left out, the
   * clip is the whole body and replaces what it was doing. Given - \`['arms']\`,
   * \`['torso', 'head']\` - it applies to those parts only and is laid over
   * whatever else is happening, so a character can wave while it walks.
   */
  Entity.prototype.runAnimation = function (name, loop, parts) {
    b.runAnimation(
      this.id,
      name === null || name === undefined ? '' : String(name),
      loop ? 1 : 0,
      // JSON across the bridge, which carries numbers and strings and nothing
      // else. An array is what a script writes and what it reads back in the
      // manual; the encoding is this line and is not anybody's business.
      parts && parts.length ? JSON.stringify(parts) : ''
    );
    return this;
  };
  Entity.prototype.despawn = function () { b.despawn(this.id); };

  Entity.prototype.spawn = function (blueprint, dx, dy, dz) {
    var id = b.spawn(this.id, String(blueprint), +dx || 0, +dy || 0, +dz || 0);
    return id < 0 ? null : entity(id);
  };

  // The entity you call it on is the one that gets the point. That is a shade
  // different from the \`score\` verb, which credits whoever set the trigger off
  // - and it has to be, because a script has no "whoever set it off".
  Entity.prototype.score = function (amount) { b.score(+amount, this.id); };
  Entity.prototype.emit = function (event) { b.emit(String(event), this.id); };

  // One crossing, not six. Reading x, y and z off both sides is six trips over
  // the boundary for one number, and the boundary is what this design pays for.
  Entity.prototype.distanceTo = function (other) {
    if (!other) return Infinity;
    return b.dist(this.id, other.id, 0);
  };

  // Flat distance, which is what "how close is the player" usually means in a
  // level with stairs in it: somebody one floor up is not out of range.
  Entity.prototype.flatDistanceTo = function (other) {
    if (!other) return Infinity;
    return b.dist(this.id, other.id, 1);
  };

  Entity.prototype.moveTo = function (x, y, z) {
    b.setPos(this.id, +x, +y, +z);
    return this;
  };

  Entity.prototype.moveBy = function (dx, dy, dz) {
    b.moveBy(this.id, +dx || 0, +dy || 0, +dz || 0);
    return this;
  };

  /**
   * Shove it, in cells a second, divided by its own mass.
   *
   * The difference between this and \`moveBy\` is the difference between a kick
   * and a teleport, and it is the whole of what \`body\` bought: \`moveBy\` puts
   * a thing somewhere and it stays there, and this gives it somewhere to be
   * going and lets gravity, the floor and the walls have their say about
   * whether it gets there.
   *
   * **Adds** rather than sets, so a ball already rolling that is kicked again
   * goes faster - and so two things pushing at once do not cancel down to
   * whichever ran last. Setting it outright is \`self.dx = …\`, which is there
   * for the level that wants to stop something dead.
   *
   * Divided by mass here rather than by the caller, because mass is on the
   * blueprint and a script that had to read it to push properly would be a
   * script that gets it wrong on the second blueprint.
   *
   * Answers \`true\` when it landed. \`false\` means the thing is not a body -
   * the document gave it no \`body\` block - which is worth knowing, because
   * the alternative is a kick that silently does nothing.
   */
  Entity.prototype.push = function (dx, dy, dz) {
    return b.push(this.id, +dx || 0, +dy || 0, +dz || 0) === 1;
  };

  Entity.prototype.toString = function () { return 'Entity(' + this.id + ')'; };

  function entity(id) {
    var found = handles.get(id);
    if (!found) { found = new Entity(id); handles.set(id, found); }
    return found;
  }

  function getEntityByName(name) {
    var id = b.byName(String(name));
    return id < 0 ? null : entity(id);
  }

  function log() {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) parts.push(text(arguments[i]));
    b.log(parts.join(' '));
  }

  /**
   * What this level says, in whatever language the person reading it has.
   *
   *     log(t('the gate is locked'))
   *
   * The sentence is the key. A level with no \`words\` block, or a reader whose
   * language it does not list, gets back exactly the string that was passed -
   * so wrapping something in \`t\` changes nothing at all until somebody adds a
   * translation, and there is no state in which a player reads an identifier.
   *
   * **It is not the same on two machines.** Two people in one room read
   * different languages, which is the point and is also the one hazard: a
   * script that compares \`t(x)\` against a literal, or emits a signal named by
   * one, has written a rule that fires for the German player and not the
   * English one. Use it on the way to a screen and nowhere else.
   */
  function t(key) {
    return b.say(text(key));
  }

  // Enough to see a number, a string or a small object, without pulling a
  // serialiser and its cycle handling into the sandbox.
  function text(v) {
    if (typeof v === 'string') return v;
    if (v === null || v === undefined || typeof v !== 'object') return String(v);
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }

  var world = {};
  Object.defineProperties(world, {
    tick: { get: function () { return b.state(0); } },
    time: { get: function () { return b.state(1); } },
    // The number the whole room was told when the match opened. Exposed so an
    // author who wants their own stream - a shuffle they keep, a layout
    // generated once - can build it on something everybody agrees about
    // instead of inventing a seed per machine.
    seed: { get: function () { return b.state(2); } },
    /**
     * What this level is: \`'space'\`, \`'lobby'\` or \`'battle'\`. The document's
     * \`rules.mode\`, and \`'space'\` when it says nothing.
     */
    mode: { get: function () { return b.about(0); } },
    /**
     * And what you do in it: \`'freestyle'\`, \`'deathmatch'\`, \`'football'\`,
     * \`'parkour'\` or \`'shooter'\`. The document's \`rules.preset\`.
     *
     * Two axes rather than one - see \`MODES\` in ../document/rules. A script
     * that wants "am I in a round" asks \`mode\`; one that wants "is this a
     * shooting game" asks \`style\`; and neither has to know about the other.
     */
    style: { get: function () { return b.about(1); } },
    /**
     * Whether anybody else is in here.
     *
     * True in a room with a host behind it - other people, a channel, an
     * arbiter deciding - and false alone: the editor's try-out, a shot, a test,
     * a level opened at its own address with no room.
     *
     * The distinction a script actually acts on. A level that keeps its own
     * score when it is on its own and defers to the arbiter when it is not is
     * two lines with this and unwritable without it, and the failure without it
     * is the quiet kind: the single-player fallback runs *beside* the arbiter
     * and the two disagree about the score.
     *
     * It can change while you are playing - somebody joins - so it is read each
     * time rather than captured. Never assume it is still what it was a frame
     * ago.
     */
    live: { get: function () { return b.state(3) === 1; } },
  });

  /**
   * What the level keeps — the \`data\` block, from a script.
   *
   * The same three names an entity has for its own properties, because it is
   * the same idea one level up: \`world.get('money')\`, \`world.set(...)\`,
   * \`world.add('money', 5)\`. A rule says this as \`addProp target: 'world'\`,
   * and a script that had to reach for a rule to add a coin would be a script
   * that cannot finish a sentence it started.
   *
   * A field nobody declared reads as **0** and writing to one does nothing.
   * That is not silence for its own sake: \`parseXp\` refuses a *rule* naming an
   * undeclared field, and it cannot do the same here — a key in a script is a
   * string that may be built at runtime. So the model is still the document's,
   * and a script that invents a field finds it does not stick.
   */
  world.get = function (key) { return b.data(String(key)); };
  /**
   * Take some, if there is some — and say whether there was.
   *
   * \`world.add('money', -5)\` already subtracts, so this is not a subtract with
   * a nicer name: it is the **refusal**. Buying something is *check the balance
   * and take it*, and written as two calls that is two moments a level can be
   * wrong between — a script that checks, does something else, then takes, has
   * spent money it did not have. One call cannot be wrong between them.
   *
   * Answers \`true\` when it went through and \`false\` when the balance was
   * short, writing nothing in that case. So the shape it is for reads:
   *
   * \`\`\`js
   * if (world.spend('money', 5)) self.spawn('sapling', 0, 0, 1)
   * \`\`\`
   *
   * Nothing here has an opinion about debt: \`add\` will take a balance below
   * zero quite happily, which is right for a score and wrong for a purse, and
   * the difference is the level's to know.
   */
  world.spend = function (key, amount) { return b.spendData(String(key), +amount) === 1; };
  world.set = function (key, value) { b.setData(String(key), +value); return world; };
  world.add = function (key, value) { b.addData(String(key), +value); return world; };

  // In \`[0, 1)\`, like the function it replaces, so that everything an author
  // already knows how to write with \`Math.random\` still reads the same.
  world.random = function () { return b.random(); };

  // Inclusive at both ends, because "a number from 1 to 6" is what somebody
  // means and \`randomInt(1, 7)\` is a bug somebody writes once a project.
  world.randomInt = function (min, max) {
    var lo = Math.ceil(+min), hi = Math.floor(+max);
    if (!(hi >= lo)) return lo;
    return lo + Math.floor(b.random() * (hi - lo + 1));
  };

  /** A die. \`roll(6)\` is 1 to 6, and \`roll()\` is the die people mean. */
  world.roll = function (sides) {
    var faces = Math.floor(+sides);
    if (!(faces >= 1)) faces = 6;
    return 1 + Math.floor(b.random() * faces);
  };

  // One of them, uniformly. Returns undefined for an empty list rather than
  // throwing: a table of loot that ran out is not a broken script.
  world.pick = function (items) {
    if (!items || !items.length) return undefined;
    return items[Math.floor(b.random() * items.length)];
  };

  globalThis.getEntityByName = getEntityByName;
  globalThis.log = log;
  globalThis.world = world;

  var instances = new Map();

  globalThis.$xp = {
    /**
     * Instantiate a compiled factory for one entity.
     *
     * The host compiles rather than this file, because a compile error with a
     * line number in it is the most useful thing a scripting system produces
     * and \`eval\` in here throws the position away.
     */
    make: function (key, factory, id) {
      var hooks = factory(entity(id), world, log, getEntityByName, t) || {};
      instances.set(key, hooks);
      // Which hooks it actually has, as bits, so the host can skip crossing
      // into wasm for a script with no onTick - which is the whole per-frame
      // cost of a script that only reacts to things.
      return (typeof hooks.onSpawn === 'function' ? 1 : 0)
        | (typeof hooks.onTick === 'function' ? 2 : 0)
        | (typeof hooks.onTrigger === 'function' ? 4 : 0);
    },

    drop: function (key) { instances.delete(key); },

    spawned: function (key) {
      var hooks = instances.get(key);
      if (hooks && hooks.onSpawn) hooks.onSpawn();
    },

    tick: function (key, dt) {
      var hooks = instances.get(key);
      if (hooks && hooks.onTick) hooks.onTick(dt);
    },

    trigger: function (key, event, otherId) {
      var hooks = instances.get(key);
      if (hooks && hooks.onTrigger) hooks.onTrigger(event, otherId < 0 ? null : entity(otherId));
    },
  };

  /**
   * Everything non-deterministic, removed.
   *
   * Two clients run the same rules over the same entities and have to agree
   * about the result. \`Math.random\` guarantees they will not, and \`Date\` is a
   * clock per machine - two browsers on one desk are commonly seconds apart.
   * They are also the first two things anybody reaches for, which is why they
   * are taken away rather than discouraged: a script using them looks correct
   * on the machine it was written on and desynchronises everywhere else.
   *
   * What replaces them is \`world.time\`, which is one clock, agreed by
   * everybody, and injected - so a test can run a five-minute match in a
   * millisecond - and \`world.random\`, which is a stream addressed by the seed
   * and the tick rather than a cursor each machine keeps (see ./random).
   * \`Math.random\` throws rather than disappearing, because "random is not a
   * function" sends an author looking for a typo and this message sends them
   * to the replacement.
   */
  delete globalThis.Date;
  Math.random = function () {
    throw new Error('Math.random is not available to a script: two clients would disagree about the result. Use world.random(), world.roll(6) or world.randomInt(a, b), which every client agrees about.');
  };

  // The raw bridge, hidden. The closures above kept it; nothing else can.
  delete globalThis.$b;
})();
`

/**
 * How many lines the wrapper puts above an author's first line.
 *
 * A script is compiled as the body of a factory function so that each entity
 * gets its own closure - two turrets each need their own cooldown, and a module
 * evaluated once would give them one between them. The cost is that the VM's
 * idea of line 1 is not the author's, so every line number coming back out is
 * shifted by exactly this much, and shifted back before anybody sees it.
 */
export const WRAPPER_LINES = 1

/**
 * An author's source, as an expression the sandbox can evaluate into a factory.
 *
 * The five parameters are the whole API a script is handed, passed rather than
 * read off a global: a script that shadows `self` breaks only itself, and there
 * is no arrangement of names by which one entity's script reaches another's
 * hooks.
 *
 * The hooks are picked up whether they were written as declarations or as
 * `const` arrows, because both are what somebody writes and neither is worth
 * correcting.
 */
export function wrap(source: string): string {
  const prefix = `(function (self, world, log, getEntityByName, t) { 'use strict';`
  const suffix =
    `\n;return { onSpawn: typeof onSpawn === 'function' ? onSpawn : null,` +
    ` onTick: typeof onTick === 'function' ? onTick : null,` +
    ` onTrigger: typeof onTrigger === 'function' ? onTrigger : null }; })`
  return `${prefix}\n${source}${suffix}`
}
