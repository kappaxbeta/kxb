import Link from 'next/link'
import { CRASH_ALT, CrashScreen, HomeLink } from '@/app/components/crash-screen'
import { ReportCrash } from '@/app/components/report-crash'

/**
 * The 404, and it is reached far more often than a typed URL would explain.
 *
 * `notFound()` is this app's answer to "you may not see this" as well as to
 * "there is nothing here" - requireTenant() uses it for a non-member,
 * requireFeature() for a surface whose flag is off, requireBackofficeAdmin()
 * for anybody who is not an admin. That is deliberate and stays that way: a
 * page explaining what it would have been is an advertisement for something the
 * reader cannot have.
 *
 * What it does mean is that this page has to work for somebody who is *not*
 * lost - a member whose workspace stopped resolving, most of all - so it offers
 * the picker as well as the front door, and it files a report either way.
 */
export default function NotFound() {
  return (
    <>
      <ReportCrash source="not-found" message="Not found" />

      <CrashScreen
        code="404"
        tag="Nothing here"
        title="This door goes nowhere"
        avatar="fox-three"
        hue={190}
        body={
          <>
            <p>
              The page you asked for does not exist, or it does and it is not
              yours to see.
            </p>
            <p className="mt-3">
              If you were expecting a workspace, it may have been renamed or you
              may no longer be a member of it. The picker below lists the ones
              you are in.
            </p>
          </>
        }
      >
        <HomeLink />
        <Link href="/tenants" className={CRASH_ALT}>
          Your spaces
        </Link>
      </CrashScreen>
    </>
  )
}
