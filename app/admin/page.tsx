'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ShieldCheck, ArrowLeft, Loader2, Shield, FileText,
  RefreshCw, AlertCircle, ChevronDown, Tag, Plus,
  ToggleLeft, ToggleRight, Trash2, SlidersHorizontal,
} from 'lucide-react'
import type { KlippaTierFeature } from '@/lib/types'

interface UserRow {
  id:                  string
  email:               string
  subscription_tier:   string
  tax_year:            number | null
  employment_type:     string | null
  onboarding_complete: boolean
  created_at:          string
}

interface DocRow {
  id:                string
  user_id:           string
  document_type:     string
  original_filename: string | null
  ocr_status:        string
  created_at:        string
}

interface PromoRow {
  id:              string
  code:            string
  type:            string
  trial_days:      number | null
  discount_pct:    number | null
  free_submissions: number | null
  applies_to_plan: string | null
  max_uses:        number | null
  used_count:      number
  valid_until:     string | null
  is_active:       boolean
  note:            string | null
  created_at:      string
}

const TIER_STYLES: Record<string, string> = {
  admin:        'bg-emerald-500/20 text-emerald-300',
  professional: 'bg-violet-500/20 text-violet-300',
  starter:      'bg-blue-500/20 text-blue-300',
  free:         'bg-raised text-ink-2',
}
const TIERS = ['free', 'starter', 'professional', 'admin'] as const

const TYPE_LABELS: Record<string, string> = {
  trial:           'Free trial',
  discount:        'Discount',
  free_submission: 'Free filing',
}

export default function AdminPage() {
  const router = useRouter()
  const [tab,       setTab]      = useState<'users' | 'ocr' | 'promotions' | 'plan_features'>('users')
  const [users,     setUsers]    = useState<UserRow[]>([])
  const [docs,      setDocs]     = useState<DocRow[]>([])
  const [promos,    setPromos]   = useState<PromoRow[]>([])
  const [loading,   setLoading]  = useState(true)
  const [error,     setError]    = useState<string | null>(null)
  const [updating,  setUpdating] = useState<string | null>(null)
  const [showNew,   setShowNew]  = useState(false)

  // New promo form state
  const [newCode,    setNewCode]    = useState('')
  const [newType,    setNewType]    = useState<'trial' | 'discount' | 'free_submission'>('trial')
  const [newDays,    setNewDays]    = useState(7)
  const [newPct,     setNewPct]     = useState(20)
  const [newSubs,    setNewSubs]    = useState(1)
  const [newMax,     setNewMax]     = useState('')
  const [newUntil,   setNewUntil]   = useState('')
  const [newNote,    setNewNote]    = useState('')
  const [newActive,  setNewActive]  = useState(true)
  const [creating,   setCreating]   = useState(false)

  // Plan Features state
  const [tierFeatures,    setTierFeatures]    = useState<KlippaTierFeature[]>([])
  const [togglingFeature, setTogglingFeature] = useState<string | null>(null)
  const [syncMsg,         setSyncMsg]         = useState<string | null>(null)

  const loadUsers = useCallback(() => {
    setLoading(true); setError(null)
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setUsers(d.users ?? []) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const loadDocs = useCallback(() => {
    fetch('/api/admin/ocr')
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setDocs(d.docs ?? []) })
      .catch((e) => setError(e.message))
  }, [])

  const loadPromos = useCallback(() => {
    fetch('/api/admin/promotions')
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setPromos(d.promotions ?? []) })
      .catch((e) => setError(e.message))
  }, [])

  const loadTierFeatures = useCallback(() => {
    fetch('/api/admin/tier-features')
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setTierFeatures(d.features ?? []) })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])
  useEffect(() => { if (tab === 'ocr') loadDocs() }, [tab, loadDocs])
  useEffect(() => { if (tab === 'promotions') loadPromos() }, [tab, loadPromos])
  useEffect(() => { if (tab === 'plan_features') loadTierFeatures() }, [tab, loadTierFeatures])

  const changeTier = async (userId: string, tier: string) => {
    setUpdating(userId)
    try {
      const r = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, subscription_tier: tier }),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, subscription_tier: tier } : u))
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Update failed') }
    finally { setUpdating(null) }
  }

  const togglePromo = async (id: string, is_active: boolean) => {
    const r = await fetch('/api/admin/promotions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active }),
    })
    const d = await r.json()
    if (!d.error) setPromos((prev) => prev.map((p) => p.id === id ? { ...p, is_active } : p))
  }

  const deletePromo = async (id: string) => {
    const r = await fetch('/api/admin/promotions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const d = await r.json()
    if (!d.error) setPromos((prev) => prev.map((p) => p.id === id ? { ...p, is_active: false } : p))
  }

  const toggleTierFeature = async (tier: string, feature_key: string, enabled: boolean) => {
    const key = `${tier}:${feature_key}`
    setTogglingFeature(key)
    setSyncMsg(null)
    // Optimistic update
    setTierFeatures((prev) =>
      prev.map((f) => f.tier === tier && f.feature_key === feature_key ? { ...f, enabled } : f)
    )
    try {
      const r = await fetch('/api/admin/tier-features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, feature_key, enabled, sync_users: true }),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      if (d.synced_users > 0) {
        setSyncMsg(`Synced ${d.synced_users} user${d.synced_users === 1 ? '' : 's'} on ${tier}`)
        setTimeout(() => setSyncMsg(null), 4000)
      }
    } catch (e: unknown) {
      // Revert on error
      setTierFeatures((prev) =>
        prev.map((f) => f.tier === tier && f.feature_key === feature_key ? { ...f, enabled: !enabled } : f)
      )
      setError(e instanceof Error ? e.message : 'Toggle failed')
    } finally {
      setTogglingFeature(null)
    }
  }

  const createPromo = async () => {
    if (!newCode.trim()) return
    setCreating(true); setError(null)
    try {
      const body: Record<string, unknown> = {
        code:      newCode.trim(),
        type:      newType,
        is_active: newActive,
        note:      newNote || null,
        max_uses:  newMax ? parseInt(newMax) : null,
        valid_until: newUntil || null,
      }
      if (newType === 'trial')           body.trial_days       = newDays
      if (newType === 'discount')        body.discount_pct     = newPct
      if (newType === 'free_submission') body.free_submissions = newSubs

      const r = await fetch('/api/admin/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setPromos((prev) => [d.promotion, ...prev])
      setShowNew(false); setNewCode(''); setNewNote('')
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setCreating(false) }
  }

  const tabs = [
    { key: 'users',         label: 'Users',         icon: <Shield              className="w-3.5 h-3.5" /> },
    { key: 'ocr',           label: 'OCR Queue',     icon: <FileText            className="w-3.5 h-3.5" /> },
    { key: 'promotions',    label: 'Promotions',    icon: <Tag                 className="w-3.5 h-3.5" /> },
    { key: 'plan_features', label: 'Plan Features', icon: <SlidersHorizontal  className="w-3.5 h-3.5" /> },
  ] as const

  return (
    <div className="min-h-screen bg-base text-ink-1">
      <header className="relative z-30 border-b border-edge/60 bg-base/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/dashboard')} className="flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink-1 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
            </button>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400" />
              <h1 className="text-lg font-semibold">Admin</h1>
            </div>
          </div>
          <button
            onClick={() => { if (tab === 'users') loadUsers(); else if (tab === 'ocr') loadDocs(); else if (tab === 'promotions') loadPromos(); else loadTierFeatures() }}
            className="flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink-1 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-edge">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key ? 'border-emerald-500 text-emerald-300' : 'border-transparent text-ink-2 hover:text-ink-1'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── Users tab ── */}
        {tab === 'users' && (
          <div className="rounded-2xl border border-edge overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge bg-surface/60">
                  {['Email','Plan','Employment','Tax year','Onboarded','Joined'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-ink-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin mx-auto text-ink-3" /></td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-ink-2 text-sm">No users yet</td></tr>
                ) : users.map((user) => (
                  <tr key={user.id} className="border-b border-edge/60 hover:bg-surface/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-ink-1 truncate max-w-[180px]">{user.email}</td>
                    <td className="px-4 py-3">
                      {updating === user.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-2" /> : (
                        <div className="relative inline-block">
                          <select
                            value={user.subscription_tier ?? 'free'}
                            onChange={(e) => changeTier(user.id, e.target.value)}
                            className={`appearance-none text-xs font-medium px-2.5 py-0.5 rounded-full pr-6 cursor-pointer border-0 outline-none ${TIER_STYLES[user.subscription_tier] ?? TIER_STYLES.free}`}
                            style={{ background: 'transparent' }}
                          >
                            {TIERS.map((t) => <option key={t} value={t} className="bg-surface text-ink-1">{t}</option>)}
                          </select>
                          <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none opacity-60" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2 capitalize">{user.employment_type ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-ink-2">{user.tax_year ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${user.onboarding_complete ? 'text-emerald-400 bg-emerald-500/10' : 'text-ink-2 bg-raised'}`}>
                        {user.onboarding_complete ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2">
                      {new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(user.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── OCR tab ── */}
        {tab === 'ocr' && (
          <div className="rounded-2xl border border-edge overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge bg-surface/60">
                  {['File','Type','Status','Uploaded'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-ink-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-12 text-ink-2 text-sm">No documents yet</td></tr>
                ) : docs.map((doc) => (
                  <tr key={doc.id} className="border-b border-edge/60 hover:bg-surface/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-ink-1 truncate max-w-[200px]">{doc.original_filename ?? 'Unknown'}</td>
                    <td className="px-4 py-3 text-xs text-ink-2 capitalize">{doc.document_type}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        doc.ocr_status === 'complete'   ? 'bg-emerald-500/15 text-emerald-300' :
                        doc.ocr_status === 'processing' ? 'bg-blue-500/15 text-blue-300' :
                        doc.ocr_status === 'failed'     ? 'bg-red-500/15 text-red-300' :
                                                          'bg-raised text-ink-2'
                      }`}>{doc.ocr_status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2">
                      {new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(doc.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Plan Features tab ── */}
        {tab === 'plan_features' && (
          <div className="space-y-6">
            {/* Info + sync message */}
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs text-ink-2 max-w-lg">
                Control which features are available per subscription tier. Toggling a cell immediately updates all users on that tier (unless they have individual overrides set).
              </p>
              {syncMsg && (
                <span className="flex-shrink-0 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                  ✓ {syncMsg}
                </span>
              )}
            </div>

            {/* Feature matrix */}
            <div className="rounded-2xl border border-edge overflow-hidden">
              <div className="px-5 py-4 border-b border-edge bg-surface/60">
                <p className="text-sm font-semibold text-ink-1">Feature matrix</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-edge">
                      <th className="text-left px-5 py-3 text-xs font-medium text-ink-2 w-44">Feature</th>
                      {(['free', 'starter', 'professional', 'admin'] as const).map((tier) => (
                        <th key={tier} className="px-5 py-3 text-center text-xs font-medium">
                          <span className={`px-2.5 py-0.5 rounded-full capitalize ${TIER_STYLES[tier]}`}>{tier}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      { key: 'logbook',     label: 'Logbook',     desc: 'SARS vehicle logbook & mileage tracking' },
                      { key: 'timesheets',  label: 'Timesheets',  desc: 'Consultant timesheet management & signoff' },
                      { key: 'provisional', label: 'Provisional', desc: 'Provisional tax returns (IRP6)' },
                    ] as const).map(({ key: featureKey, label, desc }) => (
                      <tr key={featureKey} className="border-b border-edge/60 last:border-0">
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-ink-1">{label}</p>
                          <p className="text-xs text-ink-2 mt-0.5">{desc}</p>
                        </td>
                        {(['free', 'starter', 'professional', 'admin'] as const).map((tier) => {
                          const row     = tierFeatures.find((f) => f.tier === tier && f.feature_key === featureKey)
                          const enabled = row?.enabled ?? false
                          const togKey  = `${tier}:${featureKey}`
                          const busy    = togglingFeature === togKey
                          return (
                            <td key={tier} className="px-5 py-4 text-center">
                              {tierFeatures.length === 0 ? (
                                <Loader2 className="w-4 h-4 animate-spin text-ink-3 mx-auto" />
                              ) : (
                                <button
                                  onClick={() => toggleTierFeature(tier, featureKey, !enabled)}
                                  disabled={busy}
                                  title={`${enabled ? 'Disable' : 'Enable'} ${label} for ${tier}`}
                                  className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${
                                    enabled ? 'bg-emerald-500' : 'bg-edge'
                                  }`}
                                >
                                  {busy ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-white mx-auto" />
                                  ) : (
                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                  )}
                                </button>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Per-user overrides note */}
            <div className="rounded-xl border border-edge bg-surface/30 px-5 py-4">
              <p className="text-xs font-medium text-ink-1 mb-1">Per-user overrides</p>
              <p className="text-xs text-ink-2">
                To override features for a specific user (bypassing their tier defaults), go to the <button onClick={() => setTab('users')} className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">Users tab</button>, change their plan — the feature flags will sync automatically. Once a user has a manual override (<code className="text-ink-2">feature_overrides = true</code>), tier-level changes won't affect them until the override is cleared.
              </p>
            </div>
          </div>
        )}

        {/* ── Promotions tab ── */}
        {tab === 'promotions' && (
          <div className="space-y-5">

            {/* Create new */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowNew((v) => !v)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> New promo code
              </button>
            </div>

            {showNew && (
              <div className="rounded-2xl border border-edge bg-surface/50 p-6 space-y-5">
                <p className="text-sm font-semibold text-ink-1">Create promo code</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-ink-2">Code</label>
                    <input
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                      placeholder="e.g. LAUNCH50"
                      className="w-full bg-raised/60 border border-edge rounded-xl px-3 py-2 text-sm font-mono text-ink-1 placeholder:text-ink-3 outline-none focus:border-emerald-500/60"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-ink-2">Type</label>
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as typeof newType)}
                      className="w-full bg-raised/60 border border-edge rounded-xl px-3 py-2 text-sm text-ink-1 outline-none focus:border-emerald-500/60"
                    >
                      <option value="trial">Free trial (days)</option>
                      <option value="discount">Discount (%)</option>
                      <option value="free_submission">Free ITR12 filing</option>
                    </select>
                  </div>

                  {newType === 'trial' && (
                    <div className="space-y-1">
                      <label className="text-xs text-ink-2">Trial days</label>
                      <select
                        value={newDays}
                        onChange={(e) => setNewDays(Number(e.target.value))}
                        className="w-full bg-raised/60 border border-edge rounded-xl px-3 py-2 text-sm text-ink-1 outline-none focus:border-emerald-500/60"
                      >
                        {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
                      </select>
                    </div>
                  )}
                  {newType === 'discount' && (
                    <div className="space-y-1">
                      <label className="text-xs text-ink-2">Discount %</label>
                      <input
                        type="number" min={1} max={100}
                        value={newPct}
                        onChange={(e) => setNewPct(Number(e.target.value))}
                        className="w-full bg-raised/60 border border-edge rounded-xl px-3 py-2 text-sm text-ink-1 outline-none focus:border-emerald-500/60"
                      />
                    </div>
                  )}
                  {newType === 'free_submission' && (
                    <div className="space-y-1">
                      <label className="text-xs text-ink-2">Free filings</label>
                      <input
                        type="number" min={1}
                        value={newSubs}
                        onChange={(e) => setNewSubs(Number(e.target.value))}
                        className="w-full bg-raised/60 border border-edge rounded-xl px-3 py-2 text-sm text-ink-1 outline-none focus:border-emerald-500/60"
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs text-ink-2">Max uses (blank = unlimited)</label>
                    <input
                      type="number" min={1}
                      value={newMax}
                      onChange={(e) => setNewMax(e.target.value)}
                      placeholder="unlimited"
                      className="w-full bg-raised/60 border border-edge rounded-xl px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 outline-none focus:border-emerald-500/60"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-ink-2">Expires (blank = never)</label>
                    <input
                      type="datetime-local"
                      value={newUntil}
                      onChange={(e) => setNewUntil(e.target.value)}
                      className="w-full bg-raised/60 border border-edge rounded-xl px-3 py-2 text-sm text-ink-1 outline-none focus:border-emerald-500/60"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs text-ink-2">Admin note (optional)</label>
                    <input
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Internal note…"
                      className="w-full bg-raised/60 border border-edge rounded-xl px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 outline-none focus:border-emerald-500/60"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-ink-2">
                    <input
                      type="checkbox"
                      checked={newActive}
                      onChange={(e) => setNewActive(e.target.checked)}
                      className="rounded border-zinc-600 bg-raised text-emerald-500"
                    />
                    Active immediately
                  </label>
                  <div className="flex gap-3">
                    <button onClick={() => setShowNew(false)} className="text-xs text-ink-2 hover:text-ink-1">Cancel</button>
                    <button
                      onClick={createPromo}
                      disabled={creating || !newCode.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white transition-all"
                    >
                      {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Create
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Promo table */}
            <div className="rounded-2xl border border-edge overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge bg-surface/60">
                    {['Code','Type','Value','Uses','Expires','Status',''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-ink-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {promos.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-ink-2 text-sm">No promo codes yet</td></tr>
                  ) : promos.map((p) => (
                    <tr key={p.id} className="border-b border-edge/60 hover:bg-surface/30 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono text-emerald-300">{p.code}</td>
                      <td className="px-4 py-3 text-xs text-ink-2">{TYPE_LABELS[p.type] ?? p.type}</td>
                      <td className="px-4 py-3 text-xs text-ink-1">
                        {p.type === 'trial'           && `${p.trial_days} days`}
                        {p.type === 'discount'        && `${p.discount_pct}% off`}
                        {p.type === 'free_submission' && `${p.free_submissions} filing(s)`}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-2">
                        {p.used_count}{p.max_uses ? ` / ${p.max_uses}` : ''}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-2">
                        {p.valid_until
                          ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(p.valid_until))
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => togglePromo(p.id, !p.is_active)} className="flex items-center gap-1">
                          {p.is_active
                            ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                            : <ToggleLeft  className="w-5 h-5 text-ink-3" />
                          }
                          <span className={`text-xs ${p.is_active ? 'text-emerald-400' : 'text-ink-3'}`}>
                            {p.is_active ? 'Active' : 'Off'}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => deletePromo(p.id)} className="text-ink-3 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
