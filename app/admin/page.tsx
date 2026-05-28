'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ShieldCheck, ArrowLeft, Loader2, Shield, FileText,
  RefreshCw, AlertCircle, ChevronDown,
} from 'lucide-react'

interface UserRow {
  id:                 string
  email:              string
  subscription_tier:  string
  tax_year:           number | null
  employment_type:    string | null
  onboarding_complete: boolean
  created_at:         string
}

interface DocRow {
  id:                string
  user_id:           string
  document_type:     string
  original_filename: string | null
  ocr_status:        string
  created_at:        string
}

const TIER_STYLES: Record<string, string> = {
  admin:        'bg-emerald-500/20 text-emerald-300',
  professional: 'bg-violet-500/20 text-violet-300',
  starter:      'bg-blue-500/20 text-blue-300',
  free:         'bg-zinc-800 text-zinc-400',
}

const TIERS = ['free', 'starter', 'professional', 'admin'] as const

export default function AdminPage() {
  const router  = useRouter()
  const [tab,        setTab]      = useState<'users' | 'ocr'>('users')
  const [users,      setUsers]    = useState<UserRow[]>([])
  const [docs,       setDocs]     = useState<DocRow[]>([])
  const [loading,    setLoading]  = useState(true)
  const [error,      setError]    = useState<string | null>(null)
  const [updating,   setUpdating] = useState<string | null>(null)

  const loadUsers = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setUsers(d.users ?? [])
      })
      .catch((e) => setError(e.message ?? 'Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  const loadDocs = useCallback(() => {
    fetch('/api/admin/ocr')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setDocs(d.docs ?? [])
      })
      .catch((e) => setError(e.message ?? 'Failed to load OCR jobs'))
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  useEffect(() => {
    if (tab === 'ocr') loadDocs()
  }, [tab, loadDocs])

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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
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
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
            </button>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400" />
              <h1 className="text-lg font-semibold">Admin</h1>
            </div>
          </div>
          <button
            onClick={tab === 'users' ? loadUsers : loadDocs}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800">
          {([
            { key: 'users', label: 'Users',     icon: <Shield   className="w-3.5 h-3.5" /> },
            { key: 'ocr',   label: 'OCR Queue', icon: <FileText className="w-3.5 h-3.5" /> },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'border-emerald-500 text-emerald-300'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Users tab */}
        {tab === 'users' && (
          <div className="rounded-2xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60">
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Plan</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Employment</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Tax year</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Onboarded</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Joined</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-zinc-600" />
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-zinc-500 text-sm">
                      No users yet
                    </td>
                  </tr>
                ) : users.map((user) => (
                  <tr key={user.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-zinc-200 truncate max-w-[180px]">{user.email}</td>
                    <td className="px-4 py-3">
                      {updating === user.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />
                      ) : (
                        <div className="relative inline-block">
                          <select
                            value={user.subscription_tier ?? 'free'}
                            onChange={(e) => changeTier(user.id, e.target.value)}
                            className={`appearance-none text-xs font-medium px-2.5 py-0.5 rounded-full pr-6 cursor-pointer border-0 outline-none ${TIER_STYLES[user.subscription_tier] ?? TIER_STYLES.free}`}
                            style={{ background: 'transparent' }}
                          >
                            {TIERS.map((t) => (
                              <option key={t} value={t} className="bg-zinc-900 text-zinc-100">
                                {t}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none opacity-60" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400 capitalize">{user.employment_type ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{user.tax_year ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${user.onboarding_complete ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-500 bg-zinc-800'}`}>
                        {user.onboarding_complete ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(user.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* OCR tab */}
        {tab === 'ocr' && (
          <div className="rounded-2xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60">
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">File</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {docs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-zinc-500 text-sm">
                      No documents yet
                    </td>
                  </tr>
                ) : docs.map((doc) => (
                  <tr key={doc.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-zinc-200 truncate max-w-[200px]">{doc.original_filename ?? 'Unknown'}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400 capitalize">{doc.document_type}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        doc.ocr_status === 'complete'   ? 'bg-emerald-500/15 text-emerald-300' :
                        doc.ocr_status === 'processing' ? 'bg-blue-500/15 text-blue-300' :
                        doc.ocr_status === 'failed'     ? 'bg-red-500/15 text-red-300' :
                                                          'bg-zinc-800 text-zinc-400'
                      }`}>
                        {doc.ocr_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(doc.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
