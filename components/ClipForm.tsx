'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ClipperJob } from '@/lib/types'
import { Scissors, Loader2, AlertCircle } from 'lucide-react'

interface Props {
  onJobCreated: (job: ClipperJob) => void
}

const SUPPORTED_PATTERNS = [
  'youtube.com', 'youtu.be',
  'tiktok.com',
  'instagram.com',
  'twitter.com', 'x.com',
  'facebook.com', 'fb.watch',
]

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export default function ClipForm({ onJobCreated }: Props) {
  const [url, setUrl]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmed = url.trim()
    if (!trimmed) return
    if (!isValidUrl(trimmed)) {
      setError('Please enter a valid URL')
      return
    }

    setLoading(true)
    try {
      const { data, error: dbError } = await supabase
        .from('clipper_jobs')
        .insert({ url: trimmed })
        .select()
        .single()

      if (dbError) throw dbError
      if (data) {
        onJobCreated(data as ClipperJob)
        setUrl('')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create job'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex gap-2 p-1.5 rounded-2xl border border-zinc-700/60 bg-zinc-900/80 backdrop-blur shadow-xl shadow-black/40 focus-within:border-violet-500/60 transition-colors">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a YouTube, TikTok, Instagram or X URL…"
            disabled={loading}
            className="flex-1 bg-transparent px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm bg-gradient-to-br from-violet-500 to-purple-600 text-white hover:from-violet-400 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/20 active:scale-95"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Scissors className="w-4 h-4" />
            )}
            {loading ? 'Queuing…' : 'Clip It'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-red-400 text-xs px-1">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      <p className="mt-3 text-xs text-zinc-600 text-center">
        Supports {SUPPORTED_PATTERNS.slice(0, 4).join(', ')} + more
      </p>
    </div>
  )
}
