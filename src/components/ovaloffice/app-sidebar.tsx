'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Blocks,
  Camera,
  Clapperboard,
  LayoutDashboard,
  Users,
  Gamepad2,
  Globe,
  Wrench,
  ShieldAlert, 
  MessageSquare, 
  FileText,
  FlaskConical,
  LineChart,
  Bug,
  Flag,
  Database,
  ScrollText,
  UserCog,
  Activity,
  Gauge,
  CalendarClock,
  Images,
  Megaphone,
  PersonStanding,
  Shirt,
  Ticket,
  Trophy,
  Euro,
  Joystick,
  Frame,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarFooter,
  SidebarRail,
} from '@/components/ui/sidebar'
import { signOut } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'

const data = {
  navMain: [
    {
      title: 'Overview',
      items: [
        {
          title: 'Dashboard',
          url: '/ovaloffice',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: 'Management',
      items: [
        {
          title: 'Tenants & Spaces',
          url: '/tenants',
          icon: Users,
        },
        {
          title: 'Worlds',
          url: '/ovaloffice/worlds',
          icon: Globe,
        },
        {
          // Beside Worlds rather than under Operations, because it is the same
          // job seen twice: both queues are somebody else's work waiting on a
          // verdict from us. It is a review surface first and a catalogue
          // second, which is why it is not next to the store.
          title: 'XP review',
          url: '/ovaloffice/xp',
          icon: Gamepad2,
        },
        {
          // Beneath the review queue because it is the same shelf seen from the
          // other side: that one is what other people sent us, this is what we
          // ship.
          title: 'Our XPs',
          url: '/ovaloffice/xps',
          icon: Joystick,
        },
        {
          title: 'Studio',
          url: '/ovaloffice/studio',
          icon: Wrench,
        },
        {
          title: 'Scenes',
          url: '/ovaloffice/scenes',
          icon: Clapperboard,
        },
        {
          // Under the studio because it is the studio's output, not an
          // operational concern: the queue is only ever interesting in terms of
          // the scene somebody asked for a picture of.
          title: 'Renders',
          url: '/ovaloffice/renders',
          icon: Camera,
          // The one item here that can be absent. Named rather than boolean so
          // the next flagged page adds a key instead of another prop - and the
          // page itself still 404s on its own, because a hidden link is not an
          // access control.
          feature: 'renders' as const,
        },
        {
          // Beside the studio rather than under Operations: choosing a picture
          // for an announcement is the same act as choosing one for a scene,
          // and this is the page that says which ones exist.
          title: 'Pictures',
          url: '/ovaloffice/pictures',
          icon: Images,
        },
        {
          // Beside Pictures, and the difference is who the picture is for. Those
          // are chosen for an announcement we write; these are the twelve App
          // Store panels, which is the same art pointed at a stranger who has
          // never heard of any of it.
          title: 'Store banners',
          url: '/ovaloffice/banners',
          icon: Frame,
        },
        {
          title: 'World Builder',
          url: '/ovaloffice/builder',
          icon: Blocks,
        },
        {
          // Beside the builder: both are the tools that make the things the
          // worlds are built out of, and neither touches the database.
          title: 'Animator',
          url: '/ovaloffice/animator',
          icon: PersonStanding,
        },
      ],
    },
    {
      title: 'Operations',
      items: [
        {
          title: 'Access & Applications',
          url: '/ovaloffice/access',
          icon: ShieldAlert,
          badgeKey: 'waitingApplications',
        },
        {
          title: 'Contact Messages',
          url: '/ovaloffice/contact',
          icon: MessageSquare,
          badgeKey: 'openContact',
        },
        {
          // Directly under Access, because they are two answers to one
          // question: an invite gets somebody past a closed door, a code gets
          // them a month once they are through it.
          title: 'Codes',
          url: '/ovaloffice/promos',
          icon: Ticket,
        },
        {
          // Beside the codes, because half the job is minting another kind of
          // one. A voucher and a promo code are the same act from here: hand
          // somebody a string that is worth something.
          title: 'Skins',
          url: '/ovaloffice/skins',
          icon: Shirt,
        },
        {
          // And beside both, because it is made of both: a prize draw whose
          // "free to enter" clause is a promise about one promo code.
          title: 'Gewinnspiel',
          url: '/ovaloffice/gewinnspiel',
          icon: Trophy,
        },
        {
          // Operations rather than Analytics, even though it is all numbers.
          // An experiment is a thing you *run*: you start it, you leave it
          // alone, and you come back to end it - the same rhythm as the queues
          // around it. The Analytics tabs are where you go to look at what
          // happened; this is where you go to decide something.
          title: 'Experiments',
          url: '/ovaloffice/experiments',
          icon: FlaskConical,
        },
        {
          title: 'Reports',
          url: '/ovaloffice/reports',
          icon: FileText,
        },
        {
          // Under Operations rather than Management, because an event is a
          // thing you *run* on a date - the surface is opened when something
          // is happening or about to, which is the same rhythm as the queues
          // above it and not the same as configuring a world.
          title: 'Events',
          url: '/ovaloffice/events',
          icon: CalendarClock,
        },
        {
          // Operations, not Management: an announcement is a thing you send on
          // a day, aimed at people who are using the product right now.
          title: 'News',
          url: '/ovaloffice/news',
          icon: Megaphone,
        },
      ],
    },
    {
      title: 'System',
      items: [
        // First in this group on purpose: it is the one page that answers
        // "is anything wrong right now", which is the question you open the
        // backoffice with when something is.
        {
          title: 'Health',
          url: '/ovaloffice/health',
          icon: Activity,
        },
        {
          // Directly under Health, because it is the same question one layer in:
          // Health says whether the box is serving, this says whether the room
          // it is serving is playable. A healthy box and an unplayable lounge is
          // a real combination and neither page alone can show it.
          title: 'Performance',
          url: '/ovaloffice/performance',
          icon: Gauge,
          feature: 'perf',
        },
        {
          title: 'Analytics',
          url: '/ovaloffice/analytics',
          icon: LineChart,
        },
        {
          title: 'Errors',
          url: '/ovaloffice/errors',
          icon: Bug,
          badgeKey: 'openErrors',
        },
        {
          title: 'Feature Flags',
          url: '/ovaloffice/feature-flags',
          icon: Flag,
        },
        {
          // Beside the flags, and for the same reason they are here: both are
          // configuration that decides what the product does for everybody. A
          // flag says whether a thing exists; a tier says how much of it you
          // get. Neither is a queue, which is what keeps them out of Operations.
          title: 'Pricing',
          url: '/ovaloffice/pricing',
          icon: Euro,
        },
        {
          title: 'Audit log',
          url: '/ovaloffice/audit',
          icon: ScrollText,
        },
        {
          title: 'People & roles',
          url: '/ovaloffice/admins',
          icon: UserCog,
        },
      ],
    },
  ],
}

/**
 * The flags that hide a nav entry.
 *
 * A named union rather than a widening string, so adding a `feature` to an item
 * above without passing it down from the layout is a compile error rather than
 * a link that silently never appears.
 */
type FeatureGate = 'renders' | 'perf'

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  counts?: {
    openContact: number
    waitingApplications: number
    openErrors: number
  }
  userEmail?: string
  /** Which flagged pages this admin may see. Absent keys read as off. */
  features?: Partial<Record<FeatureGate, boolean>>
  /**
   * What the signed-in operator may view. A superadmin sees every link; a
   * scoped person sees the dashboard plus the sections they were granted.
   * Absent (the old shape) reads as a superadmin, so nothing regresses if a
   * caller has not been updated.
   */
  access?: { superadmin: boolean; sections: Record<string, string> }
  /** Supabase Studio URL — set only for superadmins, so only they see the link. */
  studioUrl?: string
}

/**
 * The section key a nav url belongs to - the slug under `/ovaloffice`.
 * The dashboard root has none and is shown to everybody with any access.
 */
function sectionOf(url: string): string | null {
  if (url === '/ovaloffice') return null
  return url.slice('/ovaloffice/'.length).split('/')[0] || null
}

export function AppSidebar({ counts, userEmail, features, access, studioUrl, ...props }: AppSidebarProps) {
  const pathname = usePathname()

  const canSee = (url: string): boolean => {
    if (!access || access.superadmin) return true
    const section = sectionOf(url)
    // The dashboard is everybody's; 'admins' is a superadmin-only section, so a
    // scoped person never sees it however the grants read.
    if (section === null) return true
    if (section === 'admins') return false
    return Boolean(access.sections[section])
  }

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <div className="flex h-12 items-center px-4">
          <Link href="/ovaloffice" className="flex items-center gap-2 font-semibold">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wrench className="size-4" />
            </div>
            <span>Backoffice</span>
          </Link>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {data.navMain.map((group) => {
          // A group whose every item is hidden from this operator should not
          // leave its heading floating over nothing.
          const visibleItems = group.items.filter((item) => {
            const gate = (item as { feature?: FeatureGate }).feature
            if (gate && !features?.[gate]) return false
            return canSee(item.url)
          })
          if (visibleItems.length === 0) return null

          return (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleItems.map((item) => {
                  // A link to a page that would 404 is worse than no link: it
                  // reads as the backoffice being broken rather than as a
                  // feature being switched off.
                  //
                  // Read through a cast rather than with `'feature' in item`,
                  // because `in` narrows the union to the one entry that has
                  // the key - and every optional field below it, `badgeKey`
                  // included, then stops existing.
                  const gate = (item as { feature?: FeatureGate }).feature
                  if (gate && !features?.[gate]) return null

                  const isActive = pathname === item.url || (item.url !== '/ovaloffice' && pathname.startsWith(item.url))
                  const badgeKey = (item as { badgeKey?: string }).badgeKey
                  let badgeValue = 0
                  if (badgeKey && counts) {
                    badgeValue = counts[badgeKey as keyof typeof counts]
                  }

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        isActive={isActive}
                        render={<Link href={item.url} />}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      {badgeValue > 0 && (
                        <SidebarMenuBadge>{badgeValue}</SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          )
        })}
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex flex-col gap-2">
          {userEmail && (
            <div className="text-xs text-muted-foreground px-2">
              {userEmail}
            </div>
          )}
          {studioUrl && (
            // An external link, not a nav route - Supabase Studio lives on the
            // database host behind its own basic auth, so it opens in its own
            // tab. `noreferrer` keeps this origin out of its logs.
            <a href={studioUrl} target="_blank" rel="noreferrer" className="w-full">
              <Button variant="outline" className="w-full justify-start gap-2" type="button">
                <Database />
                Supabase Studio
              </Button>
            </a>
          )}
          <form action={signOut}>
            <Button variant="outline" className="w-full justify-start gap-2" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
