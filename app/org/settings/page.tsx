'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ShieldCheck, Settings, ArrowLeft, Loader2, Check,
  AlertCircle, Building2, Users, Crown, Calendar,
} from 'lucide-react'
import type { KlippaOrganisation } from '@/lib/types'

const ORG_TYPE_LABELS: Record<string, string> = {
  company:  'Company',
  practice: 'Accounting Practice',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-ink-2">{label}</label>
      {children}
    </div>
  )
}

export default function OrgSettingsPage() {
  const router = useRouter()
  const [org,     setOrg]     = useState<KlippaOrganisation | null>(null)
  const [role,    setRole]    = useState<string | null>(null)
  const [name,    setName]    = useState('')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    const res  = await fetch('/api/org/settings')
    const json = await res.json()
    if (json.error) { router.replace('/dashboard'); return }
    setOrg(json.org as KlippaOrganisation)
    setRole(json.role)
    setName(json.org.name)
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!name.trim() || name === org?.name) return
    setSaving(true); setError(null)
    try {
      const res  = await fetch('/api/org/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setOrg(json.org as KlippaOrganisation)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const isOwner = role === 'owner'

  if (loading) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-ink-3" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-base text-ink-1">
      {/* Header */}
      <header className="border-b border-edge/60 bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <span className="text-edge">·</span>
          <span className="text-sm font-medium text-ink-2">{org?.name ?? 'Organisation'}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* Back + title */}
        <div className="flex items-center gap-4">
          <Link href="/org/dashboard" className="flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink-1 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-semibold">Organisation settings</h1>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
          </div>
        )}

        {/* ── Organisation details ──────────────────────────────── */}
        <div className="rounded-2xl border border-edge bg-surface/40 p-6 space-y-5">
          <p className="text-sm font-semibold text-ink-1">General</p>

          <Field label="Organisation name">
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setSaved(false) }}
                disabled={!isOwner}
                placeholder="e.g. Acme Consulting"
                className="input flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {isOwner && (
                <button
                  onClick={save}
                  disabled={saving || !name.trim() || name === org?.name}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors flex-shrink-0"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : null}
                  {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
                </button>
              )}
            </div>
            {!isOwner && <p className="text-xs text-ink-3 mt-1">Only the org owner can change the name.</p>}
          </Field>
        </div>

        {/* ── Read-only info cards ──────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Building2, label: 'Type',       value: ORG_TYPE_LABELS[org?.org_type ?? ''] ?? org?.org_type ?? '—' },
            { icon: Crown,     label: 'Your role',  value: role ? role.charAt(0).toUpperCase() + role.slice(1) : '—' },
            { icon: Users,     label: 'Seats',      value: String(org?.seat_count ?? 0) },
            { icon: Calendar,  label: 'Created',    value: org?.created_at ? new Intl.DateTimeFormat('en-ZA', { month: 'short', year: 'numeric' }).format(new Date(org.created_at)) : '—' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-xl border border-edge bg-surface/40 p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-ink-3">
                <Icon className="w-3.5 h-3.5" />
                <span className="text-xs">{label}</span>
              </div>
              <p className="text-sm font-semibold text-ink-1">{value}</p>
            </div>
          ))}
        </div>

        {/* ── Quick links ───────────────────────────────────────── */}
        <div className="rounded-2xl border border-edge bg-surface/40 p-6 space-y-3">
          <p className="text-sm font-semibold text-ink-1">Quick links</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/org/consultants" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised transition-colors">
              <Users className="w-3.5 h-3.5" /> Manage consultants
            </Link>
            <Link href="/org/dashboard" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised transition-colors">
              <ShieldCheck className="w-3.5 h-3.5" /> Org dashboard
            </Link>
          </div>
        </div>

      </main>
    </div>
  )
}
