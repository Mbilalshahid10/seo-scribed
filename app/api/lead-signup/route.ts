import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'

export async function POST(req: NextRequest) {
  try {
    const { email, existingGuestId, utmData, landingPage, referrer } =
      await req.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const hasUtms = !!(
      utmData?.utm_source ||
      utmData?.utm_medium ||
      utmData?.utm_campaign ||
      utmData?.utm_term ||
      utmData?.utm_content
    )

    // UPDATE path: returning visitor with existing cookie
    if (existingGuestId) {
      const { data: updatedRow, error: updateError } = await supabase
        .from('guest_users')
        .update({
          email,
          source: 'landing_page_cta_lead',
          last_seen_at: new Date().toISOString(),
          ...(hasUtms
            ? {
                utm_source: utmData.utm_source,
                utm_medium: utmData.utm_medium,
                utm_campaign: utmData.utm_campaign,
                utm_term: utmData.utm_term,
                utm_content: utmData.utm_content,
                landing_page: landingPage,
              }
            : {}),
        })
        .eq('id', existingGuestId)
        .select('id')
        .maybeSingle()

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message, code: updateError.code },
          { status: 500 }
        )
      }

      // Row found and updated
      if (updatedRow) {
        return NextResponse.json({ guestId: updatedRow.id })
      }

      // Row was deleted but cookie persisted — fall through to INSERT
    }

    // INSERT path: new visitor (or stale cookie)
    const { data: insertData, error: insertError } = await supabase
      .from('guest_users')
      .insert({
        email,
        source: 'landing_page_cta_lead',
        utm_source: utmData?.utm_source || null,
        utm_medium: utmData?.utm_medium || null,
        utm_campaign: utmData?.utm_campaign || null,
        utm_term: utmData?.utm_term || null,
        utm_content: utmData?.utm_content || null,
        landing_page: landingPage,
        referrer: referrer || null,
      })
      .select('id')
      .single()

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message, code: insertError.code },
        { status: 500 }
      )
    }

    return NextResponse.json({ guestId: insertData.id, isNew: true })
  } catch (error) {
    console.error('Lead signup error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
