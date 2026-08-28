'use client'

/**
 * The window the creator lives in.
 *
 * A macOS-shaped frame around the whole thing: traffic lights, a title bar, and
 * a body that clips to the same corner the frame has.
 *
 * ---------------------------------------------------------------------------
 * Why a frame at all
 * ---------------------------------------------------------------------------
 * Not decoration, and worth being clear about because a chrome that is only
 * decoration is a chrome to delete. Two things it does:
 *
 * It says *this is an application*. The creator is a tool with a docked layout,
 * panels you drag and a viewport - and a tool rendered edge to edge in a
 * browser tab reads as a web page that happens to have panels. The frame is the
 * cheapest way to set the expectation before anybody has clicked anything.
 *
 * It gives the layout an edge to be inside. Dockable panels need a boundary to
 * dock against; a drop zone at the very edge of the viewport is a drop zone
 * that fights the browser's own edge gestures.
 *
 * ---------------------------------------------------------------------------
 * The radius, and why it is stated twice
 * ---------------------------------------------------------------------------
 * A rounded frame with a rounded thing inside it needs the *inner* radius to be
 * the outer one minus the padding, or the two curves are concentric-looking and
 * subtly wrong - the gap between them pinches at the corner. So the padding and
 * both radii come from one place below rather than from three guesses.
 *
 * Opaque, not translucent. A blurred, see-through chrome over a 3D viewport
 * means the viewport is being composited through a backdrop filter every frame,
 * which is real GPU work for an effect nobody looks at - and over a dark scene
 * it mostly reads as grey.
 */

/** One number the frame is built from. Everything else is derived. */
const PAD = 0
const OUTER = 14
/** Inner radius = outer minus the padding, so the two curves stay parallel. */
const INNER = OUTER - PAD

export interface WindowChromeProps {
  /**
   * A node rather than a string, because on the editor the title is also the
   * control that changes it — see ./title. The frame still owns where it sits
   * and how it behaves when the name is longer than the bar; what it is made of
   * is the caller's.
   */
  title: React.ReactNode
  subtitle?: string
  /** Shown at the right of the title bar - counts, state, a save button. */
  actions?: React.ReactNode
  /**
   * A strip under the title bar, for the thing your hand is holding.
   *
   * Its own row rather than more of `actions`, which is already carrying undo,
   * redo and save. Those are things you do *to* the document; a tool is the
   * mode you are in, and a mode crammed in beside a save button is a mode
   * nobody finds.
   */
  toolbar?: React.ReactNode
  /**
   * Where the red light goes, when there is somewhere for it to go.
   *
   * The three lights were drawn and not wired, and the note below said why: a
   * close button in a browser tab either closes the tab, which is surprising,
   * or does nothing, which is a lie. What that argument was missing is a third
   * answer, and the workspace has had one all along - `backHref`, the project
   * page the editor was opened from. Leaving the editor *is* closing this
   * window, so the light is honest the moment it has a destination.
   *
   * Optional because the operator route has none: a `.xp.json` on disk was not
   * opened from anywhere. There the lights stay a shape, exactly as before.
   */
  back?: { href: string; label: string }
  /**
   * The workspace's menu, for the one screen size that needs it here.
   *
   * On a phone the workspace rail is a drawer, and its handle used to float
   * over the editor's own rail - the two were the same pixels, and the fix
   * was to shove the handle sideways into the level. The honest place for
   * "open the menu" on a phone is the title bar, beside "go back", which is
   * where every other full-screen tool on a phone keeps them. Only drawn below
   * `md`; wider screens have the rail itself and the lights.
   */
  menu?: { onOpen: () => void; label: string }
  children: React.ReactNode
}

export function WindowChrome({
  title,
  subtitle,
  actions,
  toolbar,
  back,
  menu,
  children,
}: WindowChromeProps) {
  return (
    <div
      /*
        `h-viewport-inset` because the workspace shell wraps this in a `py-6`
        `<main>`: the window plus that padding is a page taller than the window,
        which scrolls by exactly the padding. On the operator route there is no
        shell and the inset is a band of page above and below - which is what
        every other scene here looks like. See globals.css.
      */
      className="xp-editor dark h-viewport-inset w-full"
      style={{ padding: PAD, background: 'transparent' }}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden border border-neutral-800 bg-neutral-950 shadow-2xl"
        style={{ borderRadius: OUTER }}
      >
        <header className="flex h-10 shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-900/60 px-3">
          {/*
            Two lights that are a shape, and one that is a door.
            
            The amber and the green stay drawn and unwired - minimise and zoom
            have no meaning in a browser tab, and a control that does nothing is
            worse than a picture of one. The red has somewhere real to go when
            the caller gives it one, and it is the first place anybody looks for
            the way out of a window. See `back`.

            The × appears on hover of the group, the way macOS does it, so the
            three read as a set at rest rather than as one button and two dots.
          */}
          {/*
            On a phone: two buttons that say what they do.

            The lights are twelve-pixel dots and the way out is the red one
            on hover - fine under a mouse, invisible under a thumb. Below `md`
            the cluster is a menu button and a back button, both a finger
            wide, and the lights do not draw at all. Above it, nothing here
            changes.
          */}
          {(menu || back) && (
            <div className="-ml-1 flex items-center gap-0.5 md:hidden">
              {menu ? (
                <button
                  type="button"
                  onClick={menu.onOpen}
                  aria-label={menu.label}
                  title={menu.label}
                  className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100 active:bg-white/10"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
                  </svg>
                </button>
              ) : null}
              {back ? (
                <a
                  href={back.href}
                  aria-label={back.label}
                  title={back.label}
                  className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100 active:bg-white/10"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M10 2.5 4.5 8 10 13.5" />
                  </svg>
                </a>
              ) : null}
            </div>
          )}

          <div className={`group gap-2 ${menu || back ? 'hidden md:flex' : 'flex'}`}>
            {back ? (
              <a
                href={back.href}
                aria-label={back.label}
                title={back.label}
                /*
                  Twelve pixels of dot and twenty-eight of target. The dot has
                  to stay a traffic light - three of them at a thumb's width
                  would be a row of buttons rather than a window's corner - but
                  this is the way out of the editor on a phone, and a twelve
                  pixel tap target is a control most thumbs miss.
                */
                className="relative grid h-3 w-3 place-items-center rounded-full bg-[#ff5f57] text-[8px] font-bold leading-none text-black/60 transition after:absolute after:-inset-2 after:content-[''] hover:brightness-110 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
              >
                <span aria-hidden className="opacity-0 transition group-hover:opacity-100">
                  ✕
                </span>
              </a>
            ) : (
              <span aria-hidden className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            )}
            <span aria-hidden className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span aria-hidden className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>

          <div className="flex min-w-0 items-baseline gap-2">
            <span className="flex min-w-0 items-center gap-2 truncate text-xs text-neutral-200">
              {title}
            </span>
            {subtitle ? (
              <span className="truncate font-mono text-[10px] text-neutral-600">{subtitle}</span>
            ) : null}
          </div>

          {/*
            The actions scroll sideways rather than wrapping, because on a phone
            undo, redo, save and a refusal do not fit in one row of 375 pixels
            and a title bar two rows tall is a title bar that has eaten the
            level. The hairline chips are each a few words; sliding the row is
            a thumb's gesture and wrapping it is not a layout anybody asked for.
          */}
          <div
            className="ml-auto flex shrink-0 items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
          >
            {actions}
          </div>
        </header>

        {toolbar ? (
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-neutral-800 bg-neutral-900/30 px-2">
            {toolbar}
          </div>
        ) : null}

        <div
          className="min-h-0 flex-1 overflow-hidden"
          style={{ borderBottomLeftRadius: INNER, borderBottomRightRadius: INNER }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
