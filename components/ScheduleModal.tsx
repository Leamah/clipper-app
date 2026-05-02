'use client'

import { useState } from 'react'
import { X, Calendar, Download, Loader2 } from 'lucide-react'
import { PLATFORMS, type PlatformId, type ClipResult } from '@/lib/types'
import { downloadFile } from '@/lib/download'

interface Props {
  clip:    ClipResult
  onClose: () => void
  onSaved: () => void
}

export default function ScheduleModal({ clip, onClose, onSaved }: Props) {
  const [caption,     setCaption]     = useState(clip.hook ?? '')
  const [platforms,   setPlatforms]   = useState<PlatformId[]>(['tiktok', 'instagram'])
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          clip_name:    clip.clip_name,
          public_url:   clip.public_url,
          caption,
          platforms,
          scheduled_at: new Date(scheduledAt).toISOString(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to queue')

      // Auto-download so the file is ready to post (fetch-blob method for cross-origin)
      await downloadFile(clip.public_url, clip.clip_name)
      onSaved()
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
          <div>
            <h2 className="font-semibold text-sm">Queue for Posting</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Plan when and where. Clip downloads automatically.</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Clip preview */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
            <video
              src={clip.public_url}
              className="w-14 h-10 rounded-lg object-cover bg-zinc-800 flex-shrink-0"
              muted preload="metadata"
            />
            <div className="min-w-0">
              <p className="text-xs text-zinc-300 truncate">{clip.clip_name}</p>
              <p className="text-xs text-zinc-500">
                {clip.duration_sec ? `${Math.floor(clip.duration_sec)}s` : ''} · {clip.size_mb}MB
              </p>
            </div>
            {/* Inline download shortcut */}
            <button
              onClick={() => downloadFile(clip.public_url, clip.clip_name)}
              className="ml-auto flex-shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Download now"
              type="button"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Caption */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              placeholder="Write your caption…"
              className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>

          {/* Platforms */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Platforms to post on</label>
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

          {/* Planned posting time */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">
              <Calendar className="w-3 h-3 inline mr-1" />
              Planned posting time
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
            />
            <p className="text-xs text-zinc-600">
              This is a reminder. You post manually. The clip will download now.
            </p>
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
            {loading
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
              : <><Download className="w-3 h-3" /> Save & Download</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
