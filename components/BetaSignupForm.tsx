'use client'

import { useState } from 'react'
import { trackEvent } from '@/lib/posthog'
import { trackMeta } from '@/utils/trackMeta'
import { gtagEvent, trackGoogleAdsLeadConversion } from '@/lib/gtag'
import { parseCookie, GUEST_ID_COOKIE_NAME, ATTR_COOKIE_NAME, ATTR_COOKIE_MAX_AGE_DAYS } from '@/utils/cookies'

const REDIRECT_DELAY_MS = 1000

export default function BetaSignupForm() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setFormError(null)

    gtagEvent('form_submitted', {
      source: 'landing_page_cta',
    })

    try {
      trackEvent('form_submitted', {
        source: 'landing_page_cta',
        email,
      })

      try {
        const cookies = parseCookie()
        const existingGuestId = cookies[GUEST_ID_COOKIE_NAME]

        // Read UTMs directly from the current URL only
        const urlParams = new URLSearchParams(window.location.search)

        // Read attribution cookie for referrer (captured on first page load)
        let initialReferrer: string | null = null
        try {
          const rawAttr = cookies[ATTR_COOKIE_NAME]
          if (rawAttr) {
            const attrData = JSON.parse(decodeURIComponent(rawAttr))
            initialReferrer = attrData.initial_referrer || null
          }
        } catch {
          // ignore malformed cookie
        }

        const res = await fetch('/api/lead-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            existingGuestId: existingGuestId || undefined,
            utmData: {
              utm_source: urlParams.get('utm_source'),
              utm_medium: urlParams.get('utm_medium'),
              utm_campaign: urlParams.get('utm_campaign'),
              utm_term: urlParams.get('utm_term'),
              utm_content: urlParams.get('utm_content'),
            },
            landingPage: window.location.pathname,
            referrer: initialReferrer,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          trackEvent('lead_capture_failed', {
            source: 'landing_page_cta',
            email,
            error_message: data.error || 'Unknown error',
            error_code: data.code ?? undefined,
          })
        } else {
          // If this was a new insert (or stale cookie fallback), set the guest ID cookie
          if (data.isNew && data.guestId) {
            // Clear stale cookie if it existed
            if (existingGuestId) {
              document.cookie = `${GUEST_ID_COOKIE_NAME}=; Path=/; Max-Age=0`
            }
            const maxAge = ATTR_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
            document.cookie = `${GUEST_ID_COOKIE_NAME}=${data.guestId}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
          }

          trackEvent('lead_captured', {
            source: 'landing_page_cta',
            email,
          })

          await trackMeta('Lead', { email })
          trackGoogleAdsLeadConversion({ email })
        }
      } catch (storageError) {
        trackEvent('lead_capture_failed', {
          source: 'landing_page_cta',
          email,
          error_message: storageError instanceof Error ? storageError.message : 'Unknown error',
        })
        console.warn('Lead storage failed:', storageError)
      }

      sessionStorage.setItem('signup_email', email)
      await new Promise(r => setTimeout(r, REDIRECT_DELAY_MS))
      window.location.href = '/thank-you'
    } catch (error) {
      console.error('Lead submit error:', error)
      setFormError(error instanceof Error ? error.message : 'Unknown error')
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 mb-5">
      <input
        className="w-full px-5 py-4 bg-[#141413] border border-[#3A3A37] rounded-lg text-white text-base placeholder-[#706B63] focus:outline-none focus:ring-2 focus:ring-[#C2410C] focus:border-transparent transition-all"
        placeholder="Your email address"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onFocus={() => {
          trackEvent('form_focused', { source: 'landing_page_cta' })
          gtagEvent('form_focused', { source: 'landing_page_cta' })
        }}
        disabled={isSubmitting}
      />
      {formError && (
        <div className="text-red-400 text-sm px-1">{formError}</div>
      )}
      <button
        className="w-full px-5 py-4 bg-[#C2410C] text-white font-bold text-base rounded-lg hover:bg-[#9A3412] transition-all flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Submitting...' : 'Get Free Beta Access'}
        {!isSubmitting && <span className="material-icons-outlined text-sm">arrow_forward</span>}
      </button>
    </form>
  )
}
