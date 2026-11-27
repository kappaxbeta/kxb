/**
 * Telly, the companion the pen's "ai" calls.
 *
 * `BuddyBody` goes inside the canvas, `BuddyChat` on top of it, and the store
 * is what joins them across that line. Who he is lives in `domain/buddy`; what
 * he says comes from the browser's own model when it has one (./device-brain)
 * and from `/api/buddy` when it does not.
 */
export { Buddy, BuddyBody } from '@/app/world/_buddy/buddy-body'
export { BuddyChat } from '@/app/world/_buddy/buddy-chat'
export {
  callBuddy,
  sendBuddyHome,
  talkToBuddy,
  toggleBuddy,
  useBuddy,
} from '@/app/world/_buddy/buddy-store'
