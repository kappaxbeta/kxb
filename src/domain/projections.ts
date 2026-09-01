import 'server-only'
import type { Projection } from '@/es/projection'
import type { DomainEvent } from '@/es/types'

import { agentsProjection } from '@/domain/agents/projection'
import { battlefieldsProjection } from '@/domain/battlefields/projection'
import { battlesProjection } from '@/domain/battle/projection'
import { billingProjection } from '@/domain/billing/projection'
import { boardProjection } from '@/domain/board/projection'
import { chatProjection } from '@/domain/chat/projection'
import { homesteadProjection } from '@/domain/homestead/projection'
import { loungeProjection } from '@/domain/lounge/projection'
import { magazineProjection } from '@/domain/magazine/projection'
import { pagesProjection } from '@/domain/pages/projection'
import { radioProjection } from '@/domain/radio/projection'
import { roomsProjection } from '@/domain/rooms/projection'
import { streaksProjection } from '@/domain/streaks/projection'
import { tasksProjection } from '@/domain/tasks/projection'
import { thingiverseProjection } from '@/domain/thingiverse/projection'
import { tournamentsProjection } from '@/domain/tournament/projection'
import { xpsProjection } from '@/domain/xps/projection'

/**
 * Every projection in the product, in one list.
 *
 * ---------------------------------------------------------------------------
 * Why this did not exist before, and why it does now
 * ---------------------------------------------------------------------------
 * Projections were only ever run one at a time, by the command that had just
 * appended to their stream - so each call site imported the one it needed and
 * nothing ever needed the set. The background sweep in
 * `/api/cron/project` is the first thing that does: it has no command to take a
 * hint from, so it has to ask every projection whether it is behind.
 *
 * The cost of a list like this is the one that always applies - a projection
 * added and not registered here is silently not swept, and the symptom is a
 * read model that is *nearly* right. There is no way to enumerate them at
 * runtime (they are module constants, not registrations), so the guard is the
 * test beside this file, which walks src/domain for `projection.ts` files and
 * fails if one is missing.
 */

/**
 * The cast is safe by construction, and the construction is in `runProjection`.
 *
 * `Projection<ChatEvent>` is not assignable to `Projection<DomainEvent>` -
 * `handle` takes its event type as a parameter, so it is contravariant and the
 * compiler is right to refuse. What makes it sound anyway is that
 * `runProjection` checks `streamTypes.includes(event.streamType)` *before*
 * calling `handle`, so a handler is only ever passed events from its own
 * streams. The list is heterogeneous; each element is still only ever invoked
 * with what it declared.
 */
function erase<T extends DomainEvent>(projection: Projection<T>): Projection<DomainEvent> {
  return projection as unknown as Projection<DomainEvent>
}

export const ALL_PROJECTIONS: readonly Projection<DomainEvent>[] = [
  erase(agentsProjection),
  erase(battlefieldsProjection),
  erase(battlesProjection),
  erase(billingProjection),
  erase(boardProjection),
  erase(chatProjection),
  erase(homesteadProjection),
  erase(loungeProjection),
  erase(magazineProjection),
  erase(pagesProjection),
  erase(radioProjection),
  erase(roomsProjection),
  erase(streaksProjection),
  erase(tasksProjection),
  erase(thingiverseProjection),
  erase(tournamentsProjection),
  erase(xpsProjection),
]
