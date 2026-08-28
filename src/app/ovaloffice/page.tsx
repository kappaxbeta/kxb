import Link from 'next/link'
import {
  listUsers,
  listWorkspaces,
} from '@/domain/backoffice/queries'
import { readSpaceActivity } from '@/domain/analytics/frequency'
import { requireBackofficeUser } from '@/lib/backoffice'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function OvalofficePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const search = (q ?? '').trim()

  const { admin, supabase } = await requireBackofficeUser()

  const [users, workspaces, activity] = await Promise.all([
    listUsers(admin, { search }),
    listWorkspaces(admin),
    readSpaceActivity(supabase, 30),
  ])

  const totalMembers = workspaces.reduce((sum, w) => sum + w.memberCount, 0)

  // Guests are anonymous share-link sign-ins, not accounts - same split, and
  // the same reason, as the backoffice page next door.
  const accounts = users.filter((account) => !account.anonymous)

  const trafficBySlug = new Map(activity.spaces.map((s) => [s.slug, s]))

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Welcome to the new backoffice redux. Here&rsquo;s a quick overview of the platform.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accounts.length}</div>
            <p className="text-xs text-muted-foreground">{search ? 'matching' : 'total'} registered users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Spaces</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workspaces.length}</div>
            <p className="text-xs text-muted-foreground">active environments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memberships</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMembers}</div>
            <p className="text-xs text-muted-foreground">across all spaces</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Space Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activity.combined.views}</div>
            <p className="text-xs text-muted-foreground">30d, all spaces</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            Search and view all user accounts registered on the platform.
          </CardDescription>
          <div className="flex items-center space-x-2 pt-2">
            <form method="get" className="flex flex-1 items-center space-x-2">
              <Input
                name="q"
                defaultValue={search}
                placeholder="Search email..."
                className="max-w-sm"
              />
              <Button type="submit" variant="secondary">Search</Button>
              {search && (
                <Button variant="ghost" render={<Link href="/ovaloffice" />}>
                  Clear
                </Button>
              )}
            </form>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Signed up</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>Sign-in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      {search ? `No account matches “${search}”.` : 'No accounts yet.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">
                        {account.email || <span className="text-muted-foreground">no email</span>}
                        {!account.confirmed && (
                          <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-500 border-amber-500/20">
                            unconfirmed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(account.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {account.lastSignInAt
                          ? new Date(account.lastSignInAt).toLocaleDateString()
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {account.providers.join(', ') || 'email'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spaces</CardTitle>
          <CardDescription>
            Overview of all spaces and their traffic.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Views (30d)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspaces.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      No spaces yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  workspaces.map((workspace) => {
                    const views = trafficBySlug.get(workspace.slug)?.views ?? 0
                    return (
                      <TableRow key={workspace.id}>
                        <TableCell>
                          <div className="font-medium">{workspace.name}</div>
                          <div className="text-xs font-mono text-muted-foreground">/t/{workspace.slug}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {workspace.ownerUsername ?? '—'}
                        </TableCell>
                        <TableCell>{workspace.memberCount}</TableCell>
                        <TableCell>
                          {views > 0 ? views : '—'}
                          {views > activity.median.views && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              above median
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
