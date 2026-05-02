'use client'

import { useState } from 'react'
import { X, Calendar, Zap, Loader2 } from 'lucide-react'
import { PLATFORMS, type PlatformId, type ClipResult } from '@/lib/types'

interface Props {
  clip:     ClipResult
  onClose:  () => void
  onPosted: () => void
}

export default function ScheduleModal({ clip, onClose, onPosted }: Props) {
  const [caption,     setCaption]     = useState(clip.hook ?? '')
  const [platforms,   setPlatforms]   = useState<PlatformId[]>(['tiktok', 'instagram'])
  const [postNow,     setPostNow]     = useState(false)
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(); d.setMinutes(d.getMinutes() + 30)
    return d.toISOString().slice(0, 16)
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const togglePlatform = (id: PlatformId) =>
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )

  const handleSubmit = async () => {
    if (platforms.length === 0) { setError('Select at least one platform'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clip_name:    clip.clip_name,
          public_url:   clip.public_url,
          caption,
          platforms,
          scheduled_at: postNow ? null : new Date(scheduledAt).toISOString(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to schedule')
      onPosted()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="font-semibold text-sm">Schedule Post</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Clip preview */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
            <video src={clip.public_url} className="w-14 h-10 rounded-lg object-cover bg-zinc-800" muted preload="metadata" />
            <div className="min-w-0">
              <p className="text-xs text-zinc-300 truncate">{clip.clip_name}</p>
              <p className="text-xs text-zinc-500">{clip.duration_sec ? `${Math.floor(clip.duration_sec)}s` : ''} · {clip.size_mb}MB</p>
            </div>
          </div>

          {/* Caption */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              placeholder="Write your caption..."
              className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>

          {/* Platforms */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Platforms</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const active = platforms.includes(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      active
                        ? 'bg-violet-500/20 border-violet-500/60 text-violet-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                    }`}
                  >
                    <span>{p.emoji}</span>{p.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Timing */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Timing</label>
            <div className="flex gap-2">
              <button
                onClick={() => setPostNow(true)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium border transition-all ${
                  postNow
                    ? 'bg-violet-500/20 border-violet-500/60 text-violet-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                }`}
              >
                <Zap className="w-3 h-3" /> Post Now
              </button>
              <button
                onClick={() => setPostNow(false)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium border transition-all ${
                  !postNow
                    ? 'bg-violet-500/20 border-violet-500/60 text-violet-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                }`}
              >
                <Calendar className="w-3 h-3" /> Schedule
              </button>
            </div>
            {!postNow && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
              />
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-xs font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || platforms.length === 0}
            className="flex-1 py-2.5 rounded-xl text-xs font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
          >
            {loading ? <><Loader2 className="w-3 h-3 animate-spin" /> Scheduling…</> : postNow ? '🚀 Post Now' : '📅 Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
