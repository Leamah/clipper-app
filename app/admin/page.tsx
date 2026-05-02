'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, ArrowLeft, Loader2, Save, Infinity } from 'lucide-react'

interface UserRow {
  id:             string
  email:          string
  plan:           string
  clips_limit:    number | null
  used_this_month: number
  created_at:     string
}

function EditModal({ user, onClose, onSave }: {
  user:    UserRow
  onClose: () => void
  onSave:  (id: string, plan: string, limit: number | null) => Promise<void>
}) {
  const [plan,      setPlan]      = useState(user.plan)
  const [limit,     setLimit]     = useState<string>(user.clips_limit?.toString() ?? '')
  const [unlimited, setUnlimited] = useState(user.clips_limit === null)
  const [saving,    setSaving]    = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const resolvedPlan  = plan
    const resolvedLimit = (plan === 'admin' || unlimited) ? null : (parseInt(limit) || 5)
    await onSave(user.id, resolvedPlan, resolvedLimit)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl p-6 space-y-5">
        <div>
          <h3 className="font-semibold text-white">Edit user</h3>
          <p className="text-xs text-zinc-500 mt-0.5 truncate">{user.email}</p>
        </div>

        {/* Plan */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400">Plan</label>
          <div className="flex gap-2">
            {['free', 'admin'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => { setPlan(p); if (p === 'admin') setUnlimited(true) }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${
                  plan === p
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {p === 'admin' ? '⚡ Admin' : 'Free'}
              </button>
            ))}
          </div>
        </div>

        {/* Limit */}
        {plan !== 'admin' && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Monthly clip limit</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setUnlimited((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  unlimited
                    ? 'bg-violet-600/20 text-violet-300 border border-violet-500/40'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                <Infinity className="w-3.5 h-3.5" />
                Unlimited
              </button>
              {!unlimited && (
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-violet-500/60"
                />
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const router  = useRouter()
  const [users,   setUsers]   = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((d) => { setUsers(d.users ?? []); setLoading(false) })
      .catch(() => { setError('Failed to load users'); setLoading(false) })
  }, [])

  const handleSave = async (id: string, plan: string, clips_limit: number | null) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ plan, clips_limit }),
    })
    if (!res.ok) { setError('Failed to update user'); return }
    setUsers((prev) =>
      prev.map((u) => u.id === id ? { ...u, plan, clips_limit } : u)
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-violet-400" />
            <h1 className="text-lg font-semibold">User Management</h1>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-4 py-3">{error}</p>
        )}

        {/* Table */}
        <div className="rounded-2xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Used this month</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Limit</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-zinc-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-zinc-500 text-sm">No users yet</td>
                </tr>
              ) : users.map((user) => {
                const isAdmin = user.plan === 'admin'
                const cap     = user.clips_limit ?? 0
                const pct     = cap > 0 ? Math.min((user.used_this_month / cap) * 100, 100) : 0

                return (
                  <tr key={user.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-200 text-xs truncate max-w-[200px]">{user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        isAdmin
                          ? 'bg-violet-500/20 text-violet-300'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        {isAdmin ? '⚡ admin' : user.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <span className="text-xs text-zinc-500">{user.used_this_month} (unlimited)</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-zinc-800">
                            <div
                              className={`h-full rounded-full ${pct >= 80 ? 'bg-red-500' : 'bg-violet-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-400">{user.used_this_month}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {isAdmin || user.clips_limit === null ? '∞' : user.clips_limit}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditing(user)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditModal
          user={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
