/**
 * What the middle column is while a workspace page is still being built.
 *
 * Every page under here is `force-dynamic` and most of them fold a projection
 * or three before they can render, so the wait is real rather than theoretical.
 * The shell arrives immediately - the rails are in the layout and the layout
 * does not wait on the page - and this is what stands in the space between
 * them until the page itself lands.
 *
 * Shaped rather than spinning. A spinner says "something is happening"; a
 * skeleton says "a heading, a row of cards and a list are happening", and the
 * eye has somewhere to settle before the content arrives. The proportions are
 * the ones most pages under `/t/[slug]` actually have.
 *
 * It materialises rather than appearing: the same blur-resolve the rails do,
 * one piece after another, so the whole shell reads as a single thing coming up
 * rather than a page plus a loading state. See `.holo-in` in globals.css - and
 * in particular the note there about the delay, which is doing double duty as
 * the "do not flash a skeleton at a fast page" guard.
 */
export default function WorkspaceLoading() {
  return (
    <div className="holo-in flex flex-col gap-6" aria-hidden>
      {/* The page's title, and the sentence most of them carry under it. */}
      <div className="flex flex-col gap-3">
        <div className="holo-bar h-9 w-2/5 rounded-xl" />
        <div className="holo-bar h-4 w-3/5 rounded-lg" />
      </div>

      {/* A row of cards. Two on a phone would be a lie about the layout - every
          grid in here collapses to one column - so the second and third only
          exist from `sm` up. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="holo-bar h-32 rounded-3xl" />
        <div className="holo-bar hidden h-32 rounded-3xl sm:block" />
        <div className="holo-bar hidden h-32 rounded-3xl lg:block" />
      </div>

      {/* And a list under them, which is the other half of nearly every page
          here - rooms, members, tasks, worlds. */}
      <div className="flex flex-col gap-2.5">
        <div className="holo-bar h-12 rounded-2xl" />
        <div className="holo-bar h-12 w-11/12 rounded-2xl" />
        <div className="holo-bar h-12 w-4/5 rounded-2xl" />
      </div>
    </div>
  )
}
