/**
 * Turning a key a level bound into the name the level gave it.
 *
 * `player.keys` is a list of `{ key, does }`: a `KeyboardEvent.code` and a name.
 * The rules listen for the *name* - `on: 'pressed'` carries a `does`, never a
 * code - because which physical key is a setting a player might change and a
 * headset does not have, while what it means is a fact about the level. This
 * module is the one place the two are turned into each other.
 *
 * ---------------------------------------------------------------------------
 * Why this is not in ./player
 * ---------------------------------------------------------------------------
 * The controller's job is turning keys into *movement*, and an action key is
 * not movement: nothing here touches the body, and everything here ends up in
 * the entity world's trigger pass. `./simulation` already fires `finished` for
 * the reason its comment gives - it owns the entity world, and a second writer
 * reaching into it would be the bug - and a press is the same shape of event
 * arriving from outside the world. So the listener lives beside that pass and
 * `./player` stays about walking.
 *
 * ---------------------------------------------------------------------------
 * Why a buffer rather than a function
 * ---------------------------------------------------------------------------
 * A press is an *edge*, and the two ways to lose one are opposite. Reading the
 * key down each frame fires the action sixty times a second for as long as
 * somebody leans on it; reading only the `keydown` event fires it again on the
 * operating system's autorepeat, which starts after half a second and is
 * indistinguishable from a very fast player. Holding what is down is the only
 * thing that answers both, and it is the same shape `jumpPressed` already uses
 * one file over.
 */

/** A binding, as `player.keys` carries it. */
export interface Binding {
  key: string
  does: string
}

/**
 * How long a key has to be down to count as a hold rather than a tap.
 *
 * Three hundred milliseconds, which is the number every double-click and
 * long-press in every toolkit lands within a hair of - long enough that a
 * deliberate press is never mistaken for a tap, short enough that a hold does
 * not feel like it is waiting for permission.
 */
export const HOLD_AFTER = 300

/** Which edge a keystroke turned out to mean. */
export interface Edge {
  does: string
  on: 'pressed' | 'released'
}

export interface PressBuffer {
  /**
   * A key went down. Returns the name to emit, or nothing.
   *
   * Nothing means one of three ordinary things: the level did not bind this
   * key, it is already held, or the operating system is repeating it.
   */
  down(code: string, repeat?: boolean, now?: number): Edge | undefined
  /**
   * A key came back up. Returns the name to emit, or nothing.
   *
   * It returned nothing at all, because for a long time nothing wanted it: a
   * press is an edge and an action was one thing. Letting go is the *other*
   * edge, and it is the one a level needs to say "carry this while I hold it" -
   * which is how a person moves a piece across a board, and the reason `held`
   * had to be faked with a latch before this existed.
   *
   * Nothing means the level did not bind this key, or it was not down - a
   * release with no press is not an event, it is a keyup that arrived after a
   * blur cleared the set.
   */
  up(code: string, now?: number): Edge | undefined
  /**
   * Let go of everything.
   *
   * For the same reason `./player` clears its held keys on blur: alt-tab while
   * holding a bound key and the `keyup` never arrives, so the key is still down
   * when you come back and the next press is silently swallowed as a repeat.
   * The controller's version of this bug leaves you walking; this one leaves an
   * action dead until you press something else, which is harder to explain.
   */
  clear(): string[]
}

/**
 * A buffer over one document's bindings.
 *
 * Built from the list once rather than searched per event: five entries is
 * nothing, but this runs on every keystroke including the ones the level does
 * not bind, which is most of them.
 *
 * **Later bindings do not overwrite earlier ones.** The format already refuses a
 * document that binds one key twice, so a duplicate can only reach here from a
 * caller that skipped the parser - and first-wins matches what the panel in
 * ./controls shows, which lists them in order. Two answers to "what does E do"
 * is the failure worth avoiding; which one wins matters less than that the
 * panel and the world agree.
 */
export function pressBuffer(
  keys: readonly Binding[],
  /**
   * Which actions the document has a `released` rule for, by `does`.
   *
   * -------------------------------------------------------------------------
   * The latch is for carrying things, and only a level that carries wants it
   * -------------------------------------------------------------------------
   * A quick tap withholds its release and owes it to the next tap, so one key
   * gives both gestures - tap to pick up, tap again to place. That is the whole
   * of `use` on a board, and it is a debt nothing collects for an action nobody
   * listens to letting go of: `roll` fired on the first tap, spent the second
   * paying the debt off, fired on the third. Which is *"the mobile button for
   * roll seems not to work right"* - on glass every action is a circle somebody
   * taps, so half the taps did nothing and there was no hold to fall back on.
   *
   * It was the same on a keyboard and less visible there, because a key held
   * past `HOLD_AFTER` releases honestly and a keyboard is where people lean on
   * keys. A phone is where they do not.
   *
   * So the latch is now asked for rather than assumed, and the thing that knows
   * is the document: `releasedKeys` reads which `does` names any blueprint has
   * an `on: 'released'` rule for. An action nobody listens to letting go of
   * releases the moment the finger lifts, which is what a button that does one
   * thing should do.
   *
   * **Absent means latch everything**, which is what every caller did before
   * this existed - a buffer built with no document to ask should not silently
   * take a gesture away from a level that needs it.
   */
  latching?: ReadonlySet<string>,
): PressBuffer {
  const bound = new Map<string, string>()
  for (const binding of keys) {
    if (!bound.has(binding.key)) bound.set(binding.key, binding.does)
  }

  /** Whether a quick tap of this action owes its release to the next one. */
  const latches = (does: string) => latching === undefined || latching.has(does)

  const held = new Set<string>()
  /** When each held key went down, so a tap can be told from a hold. */
  const since = new Map<string, number>()
  /**
   * Keys tapped rather than held, whose release is owed to the next press.
   *
   * The whole of the tap-tap gesture: a quick press-and-let-go means *I have
   * picked this up*, so the release it would otherwise have fired is kept here
   * until the person taps again.
   */
  const latched = new Set<string>()

  return {
    down(code, repeat = false, now = 0) {
      const does = bound.get(code)
      if (does === undefined) return undefined
      /**
       * Held is checked even though `repeat` is, and deliberately.
       *
       * `KeyboardEvent.repeat` is the browser telling us, and it is right nearly
       * always. What it cannot cover is a `keydown` with no matching `keyup` -
       * a focus change mid-press, a synthetic event, a modifier eating the
       * release - after which the *next* real press arrives with `repeat` false
       * and would fire twice if this set were not consulted.
       */
      if (repeat) return undefined
      if (held.has(code)) return undefined

      /**
       * A second tap is a *release*, which is how one key does both gestures.
       *
       * -----------------------------------------------------------------------
       * Tap-tap and press-hold, from the same two events
       * -----------------------------------------------------------------------
       * A level says *pick up on the way down, put down on the way up*, and that
       * is exactly right for carrying something across a board - you can feel
       * what you are holding. It is also the only way to do it, and holding a
       * key for the length of a walk is not what everybody reaches for: **"can
       * you make it so you press E once and then once to release."**
       *
       * Both, and no document knows the difference. A key let go of quickly did
       * not mean *put it down*, it meant *I have picked this up* - so no release
       * is emitted, the key is left latched, and the next tap emits the release
       * the quick one withheld. A key held past `HOLD_AFTER` is somebody
       * carrying something, and lifting a finger means what it looks like.
       *
       * The whole of it lives here because it is a fact about *keystrokes*. A
       * trigger reading `on: 'released'` should not have to know whether the
       * person was holding the key or had tapped it a minute ago, and a level
       * that wanted only one of the two gestures would have to say so twice.
       */
      if (latched.has(code)) {
        latched.delete(code)
        return { does, on: 'released' }
      }

      held.add(code)
      since.set(code, now)
      return { does, on: 'pressed' }
    },
    up(code, now = 0) {
      if (!held.delete(code)) return undefined
      const at = since.get(code) ?? 0
      since.delete(code)
      const does = bound.get(code)
      if (does === undefined) return undefined

      // A tap: the release is withheld and owed to the next press. See `down`.
      // Only for an action the level can hear a release of - see `latching`.
      if (now - at < HOLD_AFTER && latches(does)) {
        latched.add(code)
        return undefined
      }
      return { does, on: 'released' }
    },
    clear() {
      /**
       * Everything that was down, so a level hears the release it will never
       * get from the browser.
       *
       * Alt-tab while carrying something and the `keyup` goes to whatever has
       * focus instead. Without this, the piece stays in your hand across the
       * blur and the next press puts it down somewhere you are not - so a lost
       * release is reported as a release, which is the honest reading of a key
       * that is no longer held.
       */
      const letting: string[] = []
      for (const code of held) {
        const does = bound.get(code)
        if (does !== undefined) letting.push(does)
      }
      held.clear()
      since.clear()
      // And anything tapped is let go of too: coming back to the tab still
      // holding a piece you cannot see yourself holding is worse than dropping
      // it where it was.
      for (const code of latched) {
        const does = bound.get(code)
        if (does !== undefined) letting.push(does)
      }
      latched.clear()
      return letting
    },
  }
}
