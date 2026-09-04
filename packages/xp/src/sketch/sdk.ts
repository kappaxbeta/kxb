/**
 * The wrapper a sketch wakes up inside: `window.xp`, spelled as source.
 *
 * ---------------------------------------------------------------------------
 * Why this lives in the package
 * ---------------------------------------------------------------------------
 * This module moved here from `src/app/xp/_sketch/sdk.ts` because the
 * runtime now has two hosts: a web iframe and a phone's WebView. Both need
 * the same string, and a host-agnostic string (or, elsewhere in this file,
 * pure function) belongs where every host can reach it - the same argument
 * `packages/api` makes for its contract package rather than duplicating a
 * shape per client. The one place a host actually differs - how an outbound
 * message leaves this container - is a seam below, not a fork of this file.
 *
 * ---------------------------------------------------------------------------
 * Why this is a string and not a module
 * ---------------------------------------------------------------------------
 * The container is an opaque-origin iframe built from `srcdoc`. Nothing in
 * it can import anything of ours - that is the whole point of the container -
 * so the SDK travels the same way the sketch does: as source, inlined into
 * the document, evaluated before any of the author's files. A bundler
 * artefact would work too, and would be a build step whose output nobody can
 * read in view-source; a string in a file is greppable, testable and small.
 *
 * Written against the protocol in `./protocol.ts`, and the test asserts every
 * message type named there appears here, which is as close to a shared type
 * as a string can get.
 *
 * ---------------------------------------------------------------------------
 * What a sketch gets
 * ---------------------------------------------------------------------------
 * Identity and the room:
 *   xp.me                        me, with .avatar and .image
 *   xp.players                   everybody here, me included
 *   xp.on('join' | 'leave', fn)  fn(player)
 *
 * Controls - the document's `player.keys`, from a keyboard here, a button on
 * a phone, and the socket for everybody else:
 *   xp.on('press' | 'release', fn)   fn(name, player)
 *   xp.pressed(name, player?)        held right now
 *
 * The avatar - a position everybody else sees without anybody writing
 * netcode. Write your own each frame; the others arrive smoothed:
 *   xp.avatar.x = 120            mine, written in draw()
 *   xp.players[i].avatar         theirs, read in draw()
 *   xp.players[i].image          a picture of their skin, for image()
 *
 * The axis - one movement input for every device the config allows:
 *   xp.input                     { x, y } in -1..1; +y is down, like a canvas
 *                                (arrows and WASD here; the thumbstick on a
 *                                phone when the document set sketch.stick)
 *   xp.players[i].input          theirs, synced with the avatar packet
 *
 * Shared objects - one writer, everybody watching, the ball rule:
 *   var ball = xp.object('ball', { x: 0, y: 0 })
 *   ball.mine                    am I the one moving it
 *   ball.claim()                 take it (touching it, catching it)
 *   ball.x = 40                  owner writes; the rest see it smoothed
 *
 * The run, when the document has a `flow`:
 *   xp.phase                     { name, round, left, over, says, allowed }
 *   xp.on('phase', fn)           the run moved      fn(xp.phase)
 *   xp.emit('goal')              raise an event a flow step listens for
 *
 * Messages, for whatever the rest is not:
 *   xp.send(data)                to everybody else, fire and forget
 *   xp.on('message', fn)         fn(data, player)
 *
 * The run's context and the reader's language:
 *   xp.match                     { started, timeLimit, scoreLimit } from the
 *                                host's lobby; nulls mean the sketch decides
 *   xp.t('Catch the ball')       the words block, resolved for this reader -
 *                                draw it, never compare against it
 *
 * Art, loaded from the shipped packs:
 *   xp.load.image('peepz/Bob')   a model's picture as a stable handle:
 *                                check .ready, draw .image - because p5 2.x
 *                                hands back a Promise and 1.x an image, and
 *                                a sketch should not have to care which
 *   xp.load.model('proto/Barrel_A')  the model itself, in WEBGL mode: a
 *                                handle whose .draw() feeds p5 the mesh with
 *                                its base texture once .ready - a prop,
 *                                standing still (no skinning or animation)
 *   xp.load.sound('hit').play()  a player that cycles the sound's takes
 *   xp.tone(660, 0.12, 'square') a sound made rather than loaded - for the
 *                                blip whose pitch is data
 *   xp.imageUrl / xp.soundUrl    the bare URLs, when you want them raw
 *   player.skin                  the model id behind a player's look, ready
 *                                for xp.load.model
 *
 * The project's own carried files, and its declared length:
 *   xp.file('glow.frag')         a shader (or any carried text) as a string,
 *                                ready for createShader(vert, frag)
 *   xp.timeline                  { seconds } when the document declared one
 *
 * p5 itself is untouched: `keyPressed`, `keyIsDown`, `mouseX` all work,
 * because the stage forwards key edges it hears and this file replays them
 * as real KeyboardEvents on the window p5 listens to.
 */

export const SKETCH_SDK = `
;(function () {
  'use strict'
  var BOOT = window.__XP_BOOT__ || {}
  delete window.__XP_BOOT__
  var ME = BOOT.me || { id: 'you', name: 'You' }
  var KEYS = BOOT.keys || []
  var THUMBS = typeof BOOT.thumbs === 'string' ? BOOT.thumbs : ''
  var SOUNDS = BOOT.sounds || {}
  var FLOW = BOOT.flow || null
  var MATCH = BOOT.match || { started: null, timeLimit: null, scoreLimit: null }
  var WORDS = BOOT.words || null
  var TEXT = BOOT.text || {}
  var TIMELINE = BOOT.timeline || null
  var PACK_TABLE = BOOT.packs || {}

  var players = []
  var held = {} // player id -> { control name: true }
  var listeners = {}
  var takes = {} // sound name -> which take goes next
  var media = {} // xp.load's cache: one handle per asset

  /**
   * p5 2.x's loadImage returns a Promise (measured, not assumed), and 1.x
   * returned the image itself - so nothing given straight to a sketch can be
   * either. A handle is returned instead, stable from the first call: check
   * .ready, draw .image. Works against both p5 lines.
   */
  function loadedImage(url) {
    var holder = { ready: false, image: null, width: 0, height: 0 }
    if (!url || typeof window.loadImage !== 'function') return holder
    var took = function (img) {
      if (!img) return
      holder.image = img
      holder.width = img.width || 0
      holder.height = img.height || 0
      holder.ready = true
    }
    var got = window.loadImage(url)
    if (got && typeof got.then === 'function') got.then(took).catch(function () {})
    else took(got)
    return holder
  }
  var allowed = null // null = every key; [] = watch, do not touch
  var phase = FLOW
    ? { name: FLOW.start, round: 1, left: null, over: false, says: null, allowed: null }
    : null

  function on(event, fn) {
    if (typeof fn !== 'function') return function () {}
    var list = listeners[event] || (listeners[event] = [])
    list.push(fn)
    return function () {
      var at = list.indexOf(fn)
      if (at !== -1) list.splice(at, 1)
    }
  }

  function emit(event, a, b) {
    var list = listeners[event]
    if (!list) return
    // A copy, so a handler that unsubscribes does not skip its neighbour.
    list.slice().forEach(function (fn) {
      try { fn(a, b) } catch (error) { report(error) }
    })
  }

  // The web host listens for this across an opaque-origin iframe boundary
  // (window.parent.postMessage); a React Native WebView has no parent and
  // posts strings over its own bridge instead (window.ReactNativeWebView.
  // postMessage, a string, not an object). Rather than fork every call
  // site that posts a FrameMessage, the host installs window.__XP_SEND__
  // before this SDK runs and every outbound message goes through this one
  // seam - byte-for-byte the old behaviour when nothing is installed.
  var send = typeof window.__XP_SEND__ === 'function'
    ? window.__XP_SEND__
    : function (message) { window.parent.postMessage(message, '*') }
  function post(message) {
    try { send(message) } catch (ignore) {}
  }

  // --- errors and logs, piped out for the editor's console ------------------
  function report(error) {
    var message = error && error.message ? String(error.message) : String(error)
    post({ t: 'trouble', message: message })
  }
  window.addEventListener('error', function (event) {
    post({
      t: 'trouble',
      message: String(event.message || 'error'),
      line: typeof event.lineno === 'number' ? event.lineno : undefined,
    })
  })
  window.addEventListener('unhandledrejection', function (event) { report(event.reason) })
  ;['log', 'warn', 'error'].forEach(function (level) {
    var real = console[level].bind(console)
    console[level] = function () {
      var parts = []
      for (var i = 0; i < arguments.length; i += 1) {
        var one = arguments[i]
        try { parts.push(typeof one === 'string' ? one : JSON.stringify(one)) }
        catch (ignore) { parts.push(String(one)) }
      }
      post({ t: 'log', level: level, line: parts.join(' ') })
      real.apply(null, arguments)
    }
  })

  // --- the axis: keys and the stick, folded into one input ------------------
  var stick = { x: 0, y: 0 }
  var axisHeld = {} // code -> true, tracked off the same key events p5 hears
  var AXIS = {
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0],
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
  }
  function readInput() {
    var x = stick.x, y = stick.y
    Object.keys(axisHeld).forEach(function (code) {
      var axis = AXIS[code]
      if (axis) { x += axis[0]; y += axis[1] }
    })
    // Clamped to the unit circle, so keys and a diagonal stick agree about
    // how fast fast is.
    var length = Math.sqrt(x * x + y * y)
    if (length > 1) { x /= length; y /= length }
    return { x: x, y: y }
  }

  // --- avatars: mine written, everybody else's arriving smoothed ------------
  function freshAvatar() { return { x: 0, y: 0, angle: 0, data: {} } }
  var myAvatar = freshAvatar()
  var ghosts = {} // peer id -> { now: avatar being drawn, target: last heard, input }

  function imageOf(skin) {
    if (typeof skin !== 'string') return null
    var parts = skin.split('/')
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null
    return THUMBS + '/' + parts[0] + '/' + parts[1] + '.webp'
  }

  function wrapPlayer(one) {
    var id = one.id
    return {
      id: id,
      name: one.name,
      team: one.team,
      you: id === ME.id,
      // The model id behind their look, for xp.load.model - and its picture.
      skin: typeof one.skin === 'string' ? one.skin : null,
      image: imageOf(one.skin),
      get avatar() {
        if (id === ME.id) return myAvatar
        var ghost = ghosts[id]
        return ghost ? ghost.now : freshAvatar()
      },
      get input() {
        if (id === ME.id) return readInput()
        var ghost = ghosts[id]
        return ghost && ghost.input ? ghost.input : { x: 0, y: 0 }
      },
    }
  }

  // --- shared objects: one writer, the ball rule ----------------------------
  var objects = {} // name -> { q: claim seq, o: owner id, live, target, fields }

  function lowestId() {
    var low = ME.id
    players.forEach(function (one) { if (one.id < low) low = one.id })
    return low
  }

  function makeObject(name, defaults) {
    var fields = Object.keys(defaults || {})
    var record = {
      q: 0,
      o: lowestId(),
      live: {},
      target: null,
      fields: fields,
    }
    fields.forEach(function (key) { record.live[key] = defaults[key] })
    objects[name] = record

    var handle = {
      get mine() { return record.o === ME.id },
      get owner() { return playerById(record.o) },
      claim: function () {
        if (record.o === ME.id) return
        record.q += 1
        record.o = ME.id
        record.target = null
      },
    }
    fields.forEach(function (key) {
      Object.defineProperty(handle, key, {
        enumerable: true,
        get: function () { return record.live[key] },
        set: function (value) { if (record.o === ME.id) record.live[key] = value },
      })
    })
    return handle
  }

  // --- the sync loop: ten times a second out, every frame smoothed in -------
  function packState() {
    var input = readInput()
    var out = {
      a: {
        x: myAvatar.x, y: myAvatar.y, g: myAvatar.angle, d: myAvatar.data,
        i: [Math.round(input.x * 100) / 100, Math.round(input.y * 100) / 100],
      },
    }
    var owned = {}
    var any = false
    Object.keys(objects).forEach(function (name) {
      var record = objects[name]
      // The claim travels even when somebody else owns it, so a late joiner
      // hears who the owner is from anybody rather than only from them.
      owned[name] = { q: record.q, o: record.o }
      if (record.o === ME.id) { owned[name].f = record.live; any = true }
    })
    if (any || Object.keys(owned).length > 0) out.o = owned
    return out
  }
  setInterval(function () { post({ t: 'state', state: packState() }) }, 100)

  function takeState(from, state) {
    if (!state || typeof state !== 'object') return
    var avatar = state.a
    if (avatar && typeof avatar === 'object' && from !== ME.id) {
      var ghost = ghosts[from] || (ghosts[from] = { now: freshAvatar(), target: freshAvatar() })
      if (typeof avatar.x === 'number') ghost.target.x = avatar.x
      if (typeof avatar.y === 'number') ghost.target.y = avatar.y
      if (typeof avatar.g === 'number') ghost.target.angle = avatar.g
      if (avatar.d && typeof avatar.d === 'object') ghost.now.data = ghost.target.data = avatar.d
      if (Array.isArray(avatar.i) && typeof avatar.i[0] === 'number' && typeof avatar.i[1] === 'number') {
        ghost.input = { x: avatar.i[0], y: avatar.i[1] }
      }
    }
    var theirs = state.o
    if (theirs && typeof theirs === 'object') {
      Object.keys(objects).forEach(function (name) {
        var incoming = theirs[name]
        var record = objects[name]
        if (!incoming || typeof incoming !== 'object') return
        var q = typeof incoming.q === 'number' ? incoming.q : -1
        // A newer claim wins; the same claim from a lower id wins the tie.
        if (q > record.q || (q === record.q && typeof incoming.o === 'string' && incoming.o < record.o)) {
          record.q = q
          record.o = incoming.o
        }
        if (record.o !== ME.id && record.o === from && incoming.f && typeof incoming.f === 'object') {
          record.target = incoming.f
        }
      })
    }
  }

  function smooth() {
    var RATE = 12
    var last = performance.now()
    function step(now) {
      var dt = Math.min(0.1, (now - last) / 1000)
      last = now
      var blend = Math.min(1, dt * RATE)
      Object.keys(ghosts).forEach(function (id) {
        var ghost = ghosts[id]
        ghost.now.x += (ghost.target.x - ghost.now.x) * blend
        ghost.now.y += (ghost.target.y - ghost.now.y) * blend
        ghost.now.angle += (ghost.target.angle - ghost.now.angle) * blend
      })
      Object.keys(objects).forEach(function (name) {
        var record = objects[name]
        if (record.o === ME.id || !record.target) return
        record.fields.forEach(function (key) {
          var wanted = record.target[key]
          if (typeof wanted === 'number' && typeof record.live[key] === 'number') {
            record.live[key] += (wanted - record.live[key]) * blend
          } else if (wanted !== undefined) {
            record.live[key] = wanted
          }
        })
      })
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  smooth()

  // --- pack models: a glTF reader the size of a prop ------------------------
  // Enough of glTF 2.0 for the shipped packs: one buffer, float attributes,
  // short or int indices, a node's own TRS, the base colour texture. Not
  // skinning, not animation, not the extension zoo - a prop, standing still,
  // looking like itself. p5 reads OBJ and STL, which is why this exists.
  function trsApply(node, x, y, z) {
    var s = node.scale || [1, 1, 1]
    var q = node.rotation || [0, 0, 0, 1]
    var t = node.translation || [0, 0, 0]
    x *= s[0]; y *= s[1]; z *= s[2]
    // v' = v + 2 * cross(q.xyz, cross(q.xyz, v) + q.w * v)
    var cx = q[1] * z - q[2] * y + q[3] * x
    var cy = q[2] * x - q[0] * z + q[3] * y
    var cz = q[0] * y - q[1] * x + q[3] * z
    return [
      x + 2 * (q[1] * cz - q[2] * cy) + t[0],
      y + 2 * (q[2] * cx - q[0] * cz) + t[1],
      z + 2 * (q[0] * cy - q[1] * cx) + t[2],
    ]
  }

  function accessorOf(json, buffers, index) {
    var accessor = json.accessors[index]
    var view = json.bufferViews[accessor.bufferView]
    var buffer = buffers[view.buffer]
    var comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type] || 1
    var offset = (view.byteOffset || 0) + (accessor.byteOffset || 0)
    var Kind =
      accessor.componentType === 5126 ? Float32Array
      : accessor.componentType === 5125 ? Uint32Array
      : accessor.componentType === 5123 ? Uint16Array
      : Uint8Array
    var stride = view.byteStride || 0
    var tight = comps * Kind.BYTES_PER_ELEMENT
    if (!stride || stride === tight) {
      return new Kind(buffer, offset, accessor.count * comps)
    }
    // Interleaved: copied out once, so draw() never does stride arithmetic.
    var out = new Kind(accessor.count * comps)
    for (var i = 0; i < accessor.count; i += 1) {
      var row = new Kind(buffer, offset + i * stride, comps)
      for (var c = 0; c < comps; c += 1) out[i * comps + c] = row[c]
    }
    return out
  }

  function parseGlb(raw) {
    var head = new DataView(raw)
    if (head.getUint32(0, true) !== 0x46546c67) return null
    var at = 12
    var json = null
    var bin = null
    while (at < raw.byteLength) {
      var length = head.getUint32(at, true)
      var kind = head.getUint32(at + 4, true)
      var body = raw.slice(at + 8, at + 8 + length)
      if (kind === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body))
      else if (kind === 0x004e4942) bin = body
      at += 8 + length
    }
    return json ? { json: json, bin: bin } : null
  }

  function buildModel(handle, json, buffers, base) {
    var parts = []
    var nodes = json.nodes || []
    for (var n = 0; n < nodes.length; n += 1) {
      var node = nodes[n]
      if (node.mesh === undefined) continue
      var prims = json.meshes[node.mesh].primitives || []
      for (var p = 0; p < prims.length; p += 1) {
        var prim = prims[p]
        if (prim.attributes.POSITION === undefined) continue
        var pos = accessorOf(json, buffers, prim.attributes.POSITION)
        // The node's own place, baked in once - a hierarchy is not walked,
        // which holds for every prop the packs ship (one node, one mesh).
        // A *skinned* node is different: the spec says its transform is
        // ignored (the joints place the mesh), and its vertices are already
        // in bind pose - so baking would move it twice.
        if (node.skin === undefined && (node.translation || node.rotation || node.scale)) {
          var baked = new Float32Array(pos.length)
          for (var v = 0; v < pos.length; v += 3) {
            var moved = trsApply(node, pos[v], pos[v + 1], pos[v + 2])
            baked[v] = moved[0]; baked[v + 1] = moved[1]; baked[v + 2] = moved[2]
          }
          pos = baked
        }
        var part = {
          pos: pos,
          nor: prim.attributes.NORMAL !== undefined ? accessorOf(json, buffers, prim.attributes.NORMAL) : null,
          uv: prim.attributes.TEXCOORD_0 !== undefined ? accessorOf(json, buffers, prim.attributes.TEXCOORD_0) : null,
          idx: prim.indices !== undefined ? accessorOf(json, buffers, prim.indices) : null,
          tex: null,
        }
        if (prim.material !== undefined && json.materials) {
          var material = json.materials[prim.material]
          var slot = material && material.pbrMetallicRoughness && material.pbrMetallicRoughness.baseColorTexture
          if (slot && json.textures && json.images) {
            var image = json.images[json.textures[slot.index].source]
            if (image && image.uri) part.tex = loadedImage(base + image.uri)
          }
        }
        parts.push(part)
      }
    }
    handle.parts = parts
    handle.ready = parts.length > 0
  }

  function fetchModel(handle, model) {
    var parts = String(model).split('/')
    var pack = parts.length === 2 && Object.prototype.hasOwnProperty.call(PACK_TABLE, parts[0])
      ? PACK_TABLE[parts[0]]
      : null
    if (!pack) return
    handle.scale = pack.scale || 1
    var url = pack.path + '/' + (pack.prefix || '') + parts[1] + pack.ext
    var base = url.slice(0, url.lastIndexOf('/') + 1)
    fetch(url)
      .then(function (response) {
        if (!response.ok) throw new Error('model ' + model + ': ' + response.status)
        return pack.ext === '.glb' ? response.arrayBuffer() : response.json()
      })
      .then(function (got) {
        var json = null
        var bin = null
        if (pack.ext === '.glb') {
          var unpacked = parseGlb(got)
          if (!unpacked) throw new Error('model ' + model + ': not a glb')
          json = unpacked.json
          bin = unpacked.bin
        } else {
          json = got
        }
        var fetches = (json.buffers || []).map(function (one) {
          if (!one.uri) return Promise.resolve(bin)
          return fetch(base + one.uri).then(function (r) { return r.arrayBuffer() })
        })
        return Promise.all(fetches).then(function (buffers) {
          buildModel(handle, json, buffers, base)
        })
      })
      .catch(function (error) { report(error) })
  }

  function drawModel(handle) {
    if (!handle.ready) return
    push()
    // glTF is +Y up; p5's WEBGL is +Y down. One flip here beats one in
    // every sketch - and beats a prop standing on its head.
    scale(1, -1, 1)
    for (var p = 0; p < handle.parts.length; p += 1) {
      var part = handle.parts[p]
      if (part.tex && part.tex.ready) {
        textureMode(NORMAL)
        texture(part.tex.image)
      }
      beginShape(TRIANGLES)
      var count = part.idx ? part.idx.length : part.pos.length / 3
      for (var i = 0; i < count; i += 1) {
        var vi = part.idx ? part.idx[i] : i
        if (part.nor) normal(part.nor[vi * 3], part.nor[vi * 3 + 1], part.nor[vi * 3 + 2])
        if (part.uv) vertex(part.pos[vi * 3], part.pos[vi * 3 + 1], part.pos[vi * 3 + 2], part.uv[vi * 2], part.uv[vi * 2 + 1])
        else vertex(part.pos[vi * 3], part.pos[vi * 3 + 1], part.pos[vi * 3 + 2])
      }
      endShape()
    }
    pop()
  }

  // --- a generated tone, for the sound an asset list cannot hold ------------
  // WebAudio, entirely inside the container: an oscillator with a short
  // exponential tail. The context can only start on a real gesture, so the
  // trusted listeners below resume it - a synthesized key event is not a
  // gesture, and a rhythm game's first beep should not be the one that is
  // silently swallowed.
  var audio = null
  function wakeAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)()
      if (audio.state === 'suspended') audio.resume()
    } catch (ignore) {}
  }
  window.addEventListener('pointerdown', wakeAudio, true)
  window.addEventListener('keydown', function (event) {
    if (event.isTrusted) wakeAudio()
  }, true)
  function tone(freq, seconds, type) {
    try {
      wakeAudio()
      if (!audio) return
      var osc = audio.createOscillator()
      var gain = audio.createGain()
      osc.type = typeof type === 'string' ? type : 'sine'
      osc.frequency.value = +freq > 0 ? +freq : 440
      var length = +seconds > 0 ? +seconds : 0.15
      gain.gain.setValueAtTime(0.12, audio.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + length)
      osc.connect(gain)
      gain.connect(audio.destination)
      osc.start()
      osc.stop(audio.currentTime + length)
    } catch (ignore) {}
  }

  // --- named controls, derived here whichever way a key arrives -------------
  function controlEdge(player, name, down) {
    // The phase's allow: a key it took away is not there, so no press - the
    // same silence a level's buttons keep. Releases always land, so a key
    // held across the boundary does not stick down forever.
    if (down && allowed !== null && allowed.indexOf(name) === -1) return false
    var mine = held[player] || (held[player] = {})
    if (!!mine[name] === down) return false // repeats: leaning on a key is one press
    if (down) mine[name] = true
    else delete mine[name]
    var who = playerById(player)
    emit('control', { player: who, name: name, down: down })
    emit(down ? 'press' : 'release', name, who)
    return true
  }

  function localKeyEdge(code, down) {
    for (var i = 0; i < KEYS.length; i += 1) {
      if (KEYS[i].key !== code) continue
      // Only a real edge travels; autorepeat and refused presses stop here.
      if (controlEdge(ME.id, KEYS[i].does, down)) {
        post({ t: 'control', name: KEYS[i].does, down: down })
      }
    }
  }
  window.addEventListener('keydown', function (event) {
    if (event.repeat) return
    if (AXIS[event.code]) axisHeld[event.code] = true
    localKeyEdge(event.code, true)
  }, true)
  window.addEventListener('keyup', function (event) {
    delete axisHeld[event.code]
    localKeyEdge(event.code, false)
  }, true)

  // --- the roster -----------------------------------------------------------
  function playerById(id) {
    for (var i = 0; i < players.length; i += 1) if (players[i].id === id) return players[i]
    return wrapPlayer({ id: id, name: 'Somebody' })
  }

  function takeRoster(next) {
    var before = players
    players = next.map(wrapPlayer)
    players.forEach(function (one) {
      if (!before.some(function (was) { return was.id === one.id })) emit('join', one)
    })
    before.forEach(function (was) {
      if (!players.some(function (one) { return one.id === was.id })) {
        // Fingers off their buttons: a player who left mid-press would
        // otherwise hold a control forever.
        var theirs = held[was.id] || {}
        Object.keys(theirs).forEach(function (name) { controlEdge(was.id, name, false) })
        delete held[was.id]
        delete ghosts[was.id]
        // An object they owned falls to the lowest id, same as it started.
        Object.keys(objects).forEach(function (name) {
          var record = objects[name]
          if (record.o === was.id) { record.o = lowestId(); record.target = null }
        })
        emit('leave', was)
      }
    })
  }

  // --- the run, as the stage drives it --------------------------------------
  function takeFlow(update) {
    if (!FLOW || !update) return
    var name = typeof update.p === 'string' ? update.p : FLOW.start
    var block = FLOW.phases && FLOW.phases[name]
    allowed = update.o === true ? [] : block && block.allow ? block.allow : null
    phase = {
      name: name,
      round: typeof update.r === 'number' ? update.r : 1,
      left: typeof update.l === 'number' ? update.l : null,
      over: update.o === true,
      says: block && typeof block.says === 'string' ? block.says : null,
      allowed: allowed,
    }
    // A phase that took a key away also takes the finger off it, everywhere.
    if (allowed !== null) {
      Object.keys(held).forEach(function (id) {
        Object.keys(held[id]).forEach(function (name) {
          if (allowed.indexOf(name) === -1) controlEdge(id, name, false)
        })
      })
    }
    emit('phase', phase)
  }

  // --- what the stage sends in ------------------------------------------------
  // Read as window 'message' events with event.data an object - left as
  // is on purpose. A native host has no parent to post from, but it can
  // still dispatch a synthetic MessageEvent at window with the same
  // shaped data, which this listener cannot tell apart from the real
  // thing. The inbound side needed no seam; only the outbound post above
  // did.
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return
    var m = event.data
    if (!m || typeof m.t !== 'string') return
    if (m.t === 'roster' && Array.isArray(m.players)) takeRoster(m.players)
    else if (m.t === 'control') controlEdge(m.player, m.name, m.down)
    else if (m.t === 'peer') emit('message', m.data, playerById(m.from))
    else if (m.t === 'peer-state') takeState(m.from, m.state)
    else if (m.t === 'flow') takeFlow(m.flow)
    else if (m.t === 'stick') {
      if (typeof m.x === 'number' && typeof m.y === 'number') {
        stick.x = Math.max(-1, Math.min(1, m.x))
        stick.y = Math.max(-1, Math.min(1, m.y))
      }
    }
    else if (m.t === 'key') {
      // Replayed as a real event so p5's keyPressed/keyIsDown see it too.
      try {
        window.dispatchEvent(new KeyboardEvent(m.down ? 'keydown' : 'keyup', {
          code: m.code, key: m.key, bubbles: true,
        }))
      } catch (ignore) {}
    }
  })

  // --- the object a sketch reaches for --------------------------------------
  window.xp = {
    get me() { return playerById(ME.id) },
    get players() { return players.slice() },
    get avatar() { return myAvatar },
    get input() { return readInput() },
    get phase() { return phase },
    // What scheduled this, if anything did. started null means nothing
    // outside has a lobby - run your own; limits null mean you decide.
    get match() { return { started: MATCH.started, timeLimit: MATCH.timeLimit, scoreLimit: MATCH.scoreLimit } },
    on: on,
    send: function (data) { post({ t: 'send', data: data }) },
    emit: function (name) { if (typeof name === 'string') post({ t: 'emit', name: name }) },
    // A sound made rather than loaded: xp.tone(660, 0.12, 'square'). For
    // the blip whose pitch is data - a streak, a countdown - which no
    // recorded take can be.
    tone: tone,
    object: makeObject,
    pressed: function (name, player) {
      var id = player ? (player.id || player) : ME.id
      return !!(held[id] && held[id][name])
    },
    // A carried file's source, by its path in the project: a .frag or .vert
    // for createShader, or any other text the project shipped beside its
    // code. Null for a path the project does not carry - and for .js files,
    // which run rather than read.
    file: function (path) {
      var key = String(path)
      if (Object.prototype.hasOwnProperty.call(TEXT, key)) {
        var source = TEXT[key]
        if (typeof source === 'string') return source
      }
      return null
    },
    // The declared length of one pass, when the document gave it one - a
    // composition can loop itself to it, and a render knows where to stop.
    get timeline() { return TIMELINE ? { seconds: TIMELINE.seconds } : null },
    // Assets from the shipped packs, loaded rather than merely named.
    // image() hands the URL to p5's own loadImage and caches the result per
    // model - use it exactly the way you use loadImage's. sound() returns a
    // little player whose play() cycles the takes, because five punches
    // cycled read as a fight and one punch five times reads as a bug.
    load: {
      image: function (model) {
        var key = 'i:' + model
        if (!Object.prototype.hasOwnProperty.call(media, key)) {
          media[key] = loadedImage(imageOf(String(model)))
        }
        return media[key]
      },
      model: function (model) {
        var key = 'm:' + model
        if (!Object.prototype.hasOwnProperty.call(media, key)) {
          var handle = {
            ready: false,
            parts: [],
            scale: 1,
            draw: function () { drawModel(handle) },
          }
          media[key] = handle
          fetchModel(handle, model)
        }
        return media[key]
      },
      sound: function (name) {
        var key = 's:' + name
        if (!Object.prototype.hasOwnProperty.call(media, key)) {
          var takes = Object.prototype.hasOwnProperty.call(SOUNDS, name) ? SOUNDS[name] : []
          var at = -1
          media[key] = {
            play: function () {
              if (!takes.length) return
              at = (at + 1) % takes.length
              try {
                var going = new Audio(takes[at]).play()
                if (going && going.catch) going.catch(function () {})
              } catch (ignore) {}
            },
          }
        }
        return media[key]
      },
    },
    // The document's words block, resolved for this reader outside. It
    // differs per reader by design: draw what it returns, never compare
    // against it or name a signal by it - the level runtime's t() warning.
    t: function (sentence) {
      var key = String(sentence)
      if (WORDS && Object.prototype.hasOwnProperty.call(WORDS, key)) {
        var said = WORDS[key]
        if (typeof said === 'string') return said
      }
      return key
    },
    imageUrl: function (model) { return imageOf(String(model)) || '' },
    soundUrl: function (name) {
      var list = Object.prototype.hasOwnProperty.call(SOUNDS, name) ? SOUNDS[name] : null
      if (!list || !list.length) return ''
      var at = takes[name] = ((takes[name] || 0) + 1) % list.length
      return list[at]
    },
  }

  takeRoster([{ id: ME.id, name: ME.name, you: true }])
  post({ t: 'ready' })
})()
`
