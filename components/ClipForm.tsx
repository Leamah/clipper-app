'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ClipperJob } from '@/lib/types'
import { Scissors, Loader2, AlertCircle, ChevronDown } from 'lucide-react'

interface Props {
  onJobCreated: (job: ClipperJob) => void
}

const DURATIONS = [
  { label: '30s',  value: 30  },
  { label: '60s',  value: 60  },
  { label: '90s',  value: 90  },
]

const CLIP_COUNTS = [1, 2, 3, 4, 5]

export default function ClipForm({ onJobCreated }: Props) {
  const [url,         setUrl]         = useState('')
  const [instructions, setInstructions] = useState('')
  const [numClips,    setNumClips]    = useState(3)
  const [duration,    setDuration]    = useState(60)
  const [showOptions, setShowOptions] = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmed = url.trim()
    if (!trimmed) return

    try { new URL(trimmed) } catch {
      setError('Please enter a valid video URL')
      return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('You must be signed in'); return }

      const { data, error: dbErr } = await supabase
        .from('clipper_jobs')
        .insert({
          url:                  trimmed,
          user_id:              user.id,
          num_clips:            numClips,
          target_duration_sec:  duration,
          clip_instructions:    instructions.trim() || null,
        })
        .select()
        .single()

      if (dbErr) {
        // Surface the monthly limit error clearly
        if (dbErr.message?.includes('Monthly clip limit')) {
          setError('Monthly clip limit reached. Upgrade your plan to continue.')
        } else {
          setError(dbErr.message)
        }
        return
      }
      if (data) {
        onJobCreated(data as ClipperJob)
        setUrl('')
        setInstructions('')
        setNumClips(3)
        setDuration(60)
        setShowOptions(false)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create job')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto w-full space-y-2">
      <form onSubmit={handleSubmit} className="space-y-2">
        {/* URL row */}
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
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm bg-gradient-to-br from-violet-500 to-purple-600 text-white hover:from-violet-400 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/20 active:scale-95 whitespace-nowrap"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
            {loading ? 'Queuing…' : 'Clip It'}
          </button>
        </div>

        {/* Options toggle */}
        <button
          type="button"
          onClick={() => setShowOptions((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors pl-1"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showOptions ? 'rotate-180' : ''}`} />
          {showOptions ? 'Hide options' : 'Add context & options'}
        </button>

        {/* Expanded options */}
        {showOptions && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4 text-left">
            {/* Instructions */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">
                What do you want to clip?
                <span className="text-zinc-600 font-normal ml-1">(optional)</span>
              </label>
              <input
                type="text"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder='e.g. "key business insights", "funniest moments", "product demo highlights"'
                maxLength={200}
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-violet-500/60 transition-colors"
              />
              <p className="text-xs text-zinc-600">
                Be specific. The AI will target exactly this content instead of guessing.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Number of clips */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Number of clips</label>
                <div className="flex gap-1.5 flex-wrap">
                  {CLIP_COUNTS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setNumClips(n)}
                      className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                        numClips === n
                          ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clip duration */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Clip length</label>
                <div className="flex gap-1.5">
                  {DURATIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDuration(d.value)}
                      className={`px-3 h-8 rounded-lg text-xs font-semibold transition-all ${
                        duration === d.value
                          ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </form>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs px-1">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}
