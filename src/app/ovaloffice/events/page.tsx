import { EventsList } from '@/app/ovaloffice/events/events-list'
import { HoldEventForm } from '@/app/ovaloffice/events/hold-event-form'
import { NewEventForm } from '@/app/ovaloffice/events/new-event-form'
import { listEvents, listSpacesWithoutEvent } from '@/domain/events/queries'
import { requireBackofficeSection } from '@/lib/backoffice'

export const dynamic = 'force-dynamic'

/**
 * Every event, and the form that makes one.
 *
 * The list is ordered by when each event *closes*, newest first, so the thing
 * an operator actually looks for - what is running right now, and what ends
 * next - sits at the top. Ordering by creation date would bury a running event
 * under a year of finished ones.
 */
export default async function EventsPage() {
  const { admin } = await requireBackofficeSection('events')
  const [events, eventable] = await Promise.all([
    listEvents(admin),
    listSpacesWithoutEvent(admin),
  ])

  const running = events.filter((event) => event.phase === 'running')

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Events</h2>
        <p className="mt-1 text-sm text-ink-muted">
          An event is a window and a permission matrix laid over a space, not a
          kind of space — so a new space can be built for one, an existing space
          can hold one, and a space can go back to being an ordinary workspace
          when it is over.
          {running.length > 0 && (
            <>
              {' '}
              <span className="text-ink">
                {running.length} running right now.
              </span>
            </>
          )}
        </p>
      </div>

      {/*
        Two doors to the same row, in the order they are wanted.

        Building a space for an event is the common case and the one /events
        sells, so it leads. Holding one in a space that already exists is the
        case that matters more to a customer who has been here a year, and it is
        secondary only in how often it is pressed.
      */}
      <div className="flex flex-wrap gap-2">
        <NewEventForm />
        <HoldEventForm spaces={eventable} />
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No events yet. The enquiries that become them land in Contact, tagged
          as business.
        </p>
      ) : (
        <EventsList events={events} />
      )}
    </div>
  )
}
