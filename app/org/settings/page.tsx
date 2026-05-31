'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ShieldCheck, Settings, ArrowLeft, Loader2, Check,
  AlertCircle, Building2, Users, Crown, Calendar,
  Palette, Upload, Trash2, ImageIcon,
} from 'lucide-react'
import type { KlippaOrganisation } from '@/lib/types'

const ORG_TYPE_LABELS: Record<string, string> = {
  company:  'Company',
  practice: 'Accounting Practice',
}

const PRESET_COLORS = [
  '#10b981', // emerald (default)
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#6366f1', // indigo
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-ink-2">{label}</label>
      {children}
    </div>
  )
}

export default function OrgSettingsPage() {
  const router  = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [org,          setOrg]          = useState<KlippaOrganisation | null>(null)
  const [role,         setRole]         = useState<string | null>(null)
  const [name,         setName]         = useState('')
  const [brandColor,   setBrandColor]   = useState('#10b981')
  const [logoUrl,      setLogoUrl]      = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [logoUploading,setLogoUploading]= useState(false)
  const [logoError,    setLogoError]    = useState<string | null>(null)

  const load = useCallback(async () => {
    const res  = await fetch('/api/org/settings')
    const json = await res.json()
    if (json.error) { router.replace('/dashboard'); return }
    const o = json.org as KlippaOrganisation
    setOrg(o)
    setRole(json.role)
    setName(o.name)
    setBrandColor(o.brand_color ?? '#10b981')
    setLogoUrl(o.logo_url ?? null)
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  const saveName = async () => {
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
      flash()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const saveBrandColor = async (color: string) => {
    setBrandColor(color)
    try {
      await fetch('/api/org/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ brand_color: color }),
      })
    } catch { /* silent — color is still applied locally */ }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true); setLogoError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch('/api/org/logo', { method: 'POST', body: fd })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setLogoUrl(json.logo_url)
    } catch (e: unknown) {
      setLogoError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setLogoUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeLogo = async () => {
    setLogoUploading(true); setLogoError(null)
    try {
      const res  = await fetch('/api/org/logo', { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setLogoUrl(null)
    } catch (e: unknown) {
      setLogoError(e instanceof Error ? e.message : 'Remove failed')
    } finally { setLogoUploading(false) }
  }

  function flash() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
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
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={org?.name} className="w-7 h-7 rounded-lg object-cover" />
            ) : (
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                style={{ background: brandColor }}
              >
                {org?.name?.charAt(0)?.toUpperCase() ?? 'K'}
              </div>
            )}
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

        {/* ── Organisation name ─────────────────────────────── */}
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
                  onClick={saveName}
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

        {/* ── Branding ──────────────────────────────────────── */}
        <div className="rounded-2xl border border-edge bg-surface/40 p-6 space-y-6">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-ink-2" />
            <p className="text-sm font-semibold text-ink-1">Branding</p>
            <span className="text-xs text-ink-3 ml-1">Applies to timesheets, logbooks &amp; emails</span>
          </div>

          {/* Logo */}
          <Field label="Organisation logo">
            <div className="flex items-center gap-4">
              {/* Preview */}
              <div className="w-16 h-16 rounded-xl border border-edge bg-raised flex items-center justify-center flex-shrink-0 overflow-hidden">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-white text-xl font-bold"
                    style={{ background: brandColor }}
                  >
                    {org?.name?.charAt(0)?.toUpperCase() ?? 'K'}
                  </div>
                )}
              </div>

              <div className="space-y-2 flex-1">
                {logoError && (
                  <p className="text-xs text-red-400">{logoError}</p>
                )}
                {isOwner ? (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={logoUploading}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised transition-colors disabled:opacity-50"
                    >
                      {logoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {logoUploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
                    </button>
                    {logoUrl && (
                      <button
                        onClick={removeLogo}
                        disabled={logoUploading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-edge text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-ink-3">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span className="text-xs">Only the org owner can change the logo.</span>
                  </div>
                )}
                <p className="text-xs text-ink-3">PNG, JPG, WebP or SVG · max 2 MB</p>
              </div>
            </div>
          </Field>

          {/* Brand color */}
          <Field label="Brand colour">
            <div className="space-y-3">
              {/* Preset swatches */}
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => isOwner && saveBrandColor(c)}
                    disabled={!isOwner}
                    title={c}
                    className="w-8 h-8 rounded-lg border-2 transition-all disabled:cursor-not-allowed"
                    style={{
                      background:   c,
                      borderColor:  brandColor === c ? '#fff' : 'transparent',
                      boxShadow:    brandColor === c ? `0 0 0 2px ${c}` : 'none',
                    }}
                  />
                ))}
                {/* Custom hex input */}
                <div className="flex items-center gap-1.5 ml-1">
                  <div className="w-8 h-8 rounded-lg border border-edge overflow-hidden flex-shrink-0">
                    <input
                      type="color"
                      value={brandColor}
                      disabled={!isOwner}
                      onChange={e => setBrandColor(e.target.value)}
                      onBlur={e  => isOwner && saveBrandColor(e.target.value)}
                      className="w-10 h-10 -m-1 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </div>
                  <input
                    type="text"
                    value={brandColor}
                    disabled={!isOwner}
                    onChange={e => setBrandColor(e.target.value)}
                    onBlur={e  => {
                      if (isOwner && /^#[0-9a-fA-F]{6}$/.test(e.target.value))
                        saveBrandColor(e.target.value)
                    }}
                    maxLength={7}
                    className="input w-24 font-mono text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Live preview card */}
              <div
                className="rounded-xl p-4 text-white text-sm font-semibold flex items-center gap-3"
                style={{ background: brandColor }}
              >
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-base font-bold">
                  {org?.name?.charAt(0)?.toUpperCase() ?? 'K'}
                </div>
                <span>{org?.name ?? 'Organisation name'}</span>
              </div>
              {!isOwner && <p className="text-xs text-ink-3">Only the org owner can change the brand colour.</p>}
            </div>
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
