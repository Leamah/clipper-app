'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { Bell, ExternalLink, Loader2, Lock } from 'lucide-react'
import type { FeatureFlags, KlippaProfile, InvestSensEvent } from '@/lib/types'

const FAIS_DISCLAIMER = 'SENS alerts are informational screening signals only and do not constitute financial advice as defined by the FAIS Act.'

export default function SensPage() {
  const [profile, setProfile] = useState<KlippaProfile | null>(null)
  const [events, setEvents] = useState<InvestSensEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({ timesheets: false, logbook: false, provisional: false })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase.from('klippa_profiles').select('*').eq('id', user.id).single()
      if (prof) {
        setProfile(prof as KlippaProfile)
        setFeatureFlags({
          timesheets:     prof.feature_timesheets  ?? false,
          logbook:        prof.feature_logbook     ?? false,
          provisional:    prof.feature_provisional ?? false,
          is_org_user:    prof.user_type === 'company_owner' || prof.user_type === 'practitioner',
          invest_basic:   prof.feature_invest_basic ?? false,
          invest_enabled: prof.invest_enabled ?? false,
        })
      }

      const res = await fetch('/api/invest/sens')
      if (res.ok) {
        const data = await res.json()
        setEvents((data.events ?? []) as InvestSensEvent[])
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ink-3" />
      </main>
    </div>
  )

  const isFull = profile?.feature_invest_full ?? false

  return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main px-4 py-8 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-ink-1 flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-400" />
            SENS Watchlist Alerts
          </h1>
          <p className="text-xs text-ink-3 mt-0.5">Recent announcements for companies on your watchlist</p>
        </div>

        {!isFull ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center space-y-4">
            <Lock className="w-10 h-10 text-amber-400 mx-auto" />
            <div>
              <p className="text-sm font-semibold text-ink-1">SENS alerts require Full Invest</p>
              <p className="text-xs text-ink-2 mt-1">Available on Starter and Professional plans.</p>
            </div>
            <Link href="/subscription" className="inline-block px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">Upgrade to Starter</Link>
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-edge bg-surface/40 p-8 text-center">
            <p className="text-sm text-ink-3">No SENS events for your watchlist yet.</p>
            <Link href="/invest/screener" className="text-xs text-emerald-500 hover:underline mt-2 inline-block">Add companies to watchlist</Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-edge bg-surface/40 divide-y divide-edge overflow-hidden">
            {events.map((event) => (
              <div key={event.id} className="px-4 py-3 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-ink-1">{event.company?.name ?? event.company_code}</p>
                  <p className="text-xs text-ink-3 mt-0.5">
                    {event.company_code} - {event.category ?? 'Announcement'} - {new Date(event.published_at).toLocaleString('en-ZA')}
                  </p>
                </div>
                {event.pdf_url && (
                  <a href={event.pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-500 hover:underline flex items-center gap-1 shrink-0">
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-ink-3 leading-relaxed border-t border-edge/40 pt-4">{FAIS_DISCLAIMER}</p>
      </main>
    </div>
  )
}
