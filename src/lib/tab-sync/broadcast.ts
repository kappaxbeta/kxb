/**
 * The relay between two tabs of the same browser on the same lobby.
 *
 * `BroadcastChannel` is same-origin only and needs no permission of any kind,
 * which is why nothing asks for one before this runs.
 *
 * ---------------------------------------------------------------------------
 * There used to be a dialog in front of this, and why it went
 * ---------------------------------------------------------------------------
 * `tab-activity-consent.tsx` explained the relay and then called
 * `Notification.requestPermission()`, and the whole relay was gated on its
 * answer so that a decline read as one coherent no.
 *
 * That was a good argument for a feature nobody had asked for. The dialog was
 * three paragraphs of privacy prose in front of the *first* thing anybody sees
 * in a space, to buy an OS notification when a message lands in a tab they are
 * not looking at - and it was doing it for every visitor, including the ones
 * who only wanted to look around. Removed at the user's request.
 *
 * **What that changes, precisely.** The relay now always runs, because it never
 * needed permission. `notifyIfHidden` below still works and now simply never
 * fires unless the browser granted notifications somewhere else entirely — we
 * no longer ask. Nothing is lost from chat or radio: Supabase Realtime already
 * reaches a second tab of the same browser, and this only ever existed to beat
 * that round trip.
 *
 * If OS notifications are wanted again, the thing to build is a switch in
 * settings that somebody goes looking for, not a card that opens on arrival.
 */
export function openTabChannel(name: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  return new BroadcastChannel(name)
}

/**
 * Tell the OS, but only if there is a reason to - somebody looking at a
 * *different* tab, who agreed to be told and whose browser has agreed too.
 *
 * The three guards are independent failures, not redundant ones: `document`
 * is absent on the server, `Notification` is absent on iOS Safari and in
 * older browsers, and `permission` can be `'granted'` from a dialog answered
 * days ago just as easily as one answered this second. Skipping any of them
 * either crashes on a platform that lacks the API or, worse, pops a system
 * notification over a tab the person is actively reading.
 */
export function notifyIfHidden(title: string, body: string): void {
  if (typeof document === 'undefined' || !document.hidden) return
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

  new Notification(title, { body })
}
