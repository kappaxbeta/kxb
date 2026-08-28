'use client'

import { useCallback, useRef, useTransition } from 'react'
import { OnboardingTour } from '@/app/components/onboarding-tour'
import { visibleTourSteps } from '@/app/components/tour-steps'
import { tourDict } from '@/app/i18n/tour'
import { markOnboardingSeen, skipOnboarding } from '@/app/onboarding/actions'
import { CreateTenantForm } from '@/app/tenants/create-tenant-form'
import { SubscribePrompt } from '@/app/tenants/subscribe-prompt'
import type { Entitlement } from '@/domain/billing/entitlement'
import type { FeatureKey } from '@/domain/flags/keys'
import type { Locale } from '@/domain/i18n/locale'

/**
 * The first-run tour, wired to the two things only a session can decide: where
 * skipping goes, and what the last panel asks for.
 *
 * A client wrapper exists because callbacks cannot cross from a server component
 * into one - the page resolves the flags, the entitlement and the words, and this
 * turns them into the handlers the tour needs.
 *
 * The fork on the closing panel is the same one the workspace picker makes, and
 * for the same reason spelled out there: showing the create form to somebody with
 * no seat to spend means the only way to discover the subscription is to fill it
 * in and be refused. `createTenant` still enforces it either way.
 */
export function OnboardingScreen({
  features,
  canCreate,
  entitlement,
  locale,
}: {
  features: Partial<Record<FeatureKey, boolean>>
  canCreate: boolean
  entitlement: Entitlement
  /** Resolved on the server by `readLocale` - see the page. */
  locale: Locale
}) {
  const dict = tourDict(locale)
  const steps = visibleTourSteps(features)
  const [, startTransition] = useTransition()
  /** The stamp is worth writing once, not on every re-render of the last panel. */
  const stamped = useRef(false)

  const reachedEnd = useCallback(() => {
    if (stamped.current) return
    stamped.current = true
    // Fire and forget. Failing to remember costs one skippable screen next
    // time, which is not worth interrupting somebody mid-tour to report.
    startTransition(async () => {
      try {
        await markOnboardingSeen()
      } catch {
        // Nothing to say about it here.
      }
    })
  }, [])

  const skip = useCallback(() => {
    startTransition(async () => {
      await skipOnboarding()
    })
  }, [])

  return (
    // The same frame the welcome wizard wears, one size wider: these panels have
    // a picture in them and `max-w-lg` cropped the measure to about six words a
    // line. `.enter` is the shared entrance - see globals.css.
    <div className="enter w-full max-w-xl rounded-2xl border border-line bg-surface-raised/80 p-6 backdrop-blur-md sm:p-8">
      <OnboardingTour
        steps={steps}
        dict={dict}
        onSkip={skip}
        onReachEnd={reachedEnd}
        finishTitle={canCreate ? dict.finish.createTitle : dict.finish.payTitle}
        finishBody={canCreate ? dict.finish.createBody : dict.finish.payBody}
        finish={
          canCreate ? (
            <CreateTenantForm bare locale={locale} />
          ) : (
            <SubscribePrompt entitlement={entitlement} bare locale={locale} />
          )
        }
      />
    </div>
  )
}
