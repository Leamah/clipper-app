'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ClipperJob, ClipResult } from '@/lib/types'
import { Copy, Trash2, Check, Play, Download, CalendarPlus, Loader2 } from 'lucide-react'
import ScheduleModal from '@/components/ScheduleModal'
import { downloadFile } from '@/lib/download'

interface Props {
  jobs: ClipperJob[]
}

interface FlatClip extends ClipResult {
  job_id:    string
  job_title: string | null
}

function ClipCard({ clip, onDelete }: { clip: FlatClip; onDelete: (name: string) => void }) {
  const [copied,     setCopied]     = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [hovering,   setHovering]   = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await downloadFile(clip.public_url, clip.clip_name)
    } finally {
      setDownloading(false)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(clip.public_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${clip.clip_name}"?`)) return
    setDeleting(true)
    try {
      // 1. Remove file from storage
      await supabase.storage.from('clipper_clips').remove([clip.clip_name])

      // 2. Remove this clip from the job's clips array in the DB so it
      //    doesn't reappear after a page refresh or realtime update.
      const { data: job } = await supabase
        .from('clipper_jobs')
        .select('clips')
        .eq('id', clip.job_id)
        .single()
      if (job?.clips) {
        const updated = (job.clips as import('@/lib/types').ClipResult[]).filter(
          (c) => c.clip_name !== clip.clip_name
        )
        await supabase
          .from('clipper_jobs')
          .update({ clips: updated })
          .eq('id', clip.job_id)
      }

      onDelete(clip.clip_name)
    } catch {
      setDeleting(false)
    }
  }

  const durationStr = clip.duration_sec
    ? `${Math.floor(clip.duration_sec)}s`
    : ''

  return (
    <div className="group rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden hover:border-zinc-700 transition-all">
      {/* Video preview */}
      <div
        className="relative aspect-video bg-zinc-950 cursor-pointer"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={() => window.open(clip.public_url, '_blank')}
      >
        <video
          src={clip.public_url}
          className="w-full h-full object-cover"
          muted
          preload="metadata"
          autoPlay={hovering}
          loop
        />
        {!hovering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </div>
          </div>
        )}
        {/* Score badge */}
        {clip.score !== null && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-xs font-semibold text-violet-300">
            {clip.score}/10
          </div>
        )}
        {durationStr && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/70 text-xs text-zinc-300">
            {durationStr}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        {clip.hook && (
          <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed">{clip.hook}</p>
        )}

        <p className="text-xs text-zinc-600 truncate">
          {clip.clip_name}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-1">
          {/* Download */}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-50"
          >
            {downloading
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Download className="w-3 h-3" />}
            Download
          </button>
          {/* Queue for posting */}
          <button
            onClick={() => setScheduling(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 transition-colors"
          >
            <CalendarPlus className="w-3 h-3" /> Queue
          </button>
          {/* Copy URL */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        {scheduling && (
          <ScheduleModal
            clip={clip}
            onClose={() => setScheduling(false)}
            onSaved={() => setScheduling(false)}
          />
        )}
      </div>
    </div>
  )
}

export default function ClipsGallery({ jobs }: Props) {
  const [deleted, setDeleted] = useState<Set<string>>(new Set())

  // Defensive: backend has stored clips as either a real array or a JSON
  // string in different code paths. Normalise to an array.
  const parseClips = (raw: unknown): ClipResult[] => {
    if (!raw) return []
    if (Array.isArray(raw)) return raw as ClipResult[]
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
      } catch { return [] }
    }
    return []
  }

  // Flatten all clips from all done jobs, dedupe by clip_name as a safety
  // net in case the same job slipped into state twice.
  const seen = new Set<string>()
  const allClips: FlatClip[] = jobs
    .flatMap((job) =>
      parseClips(job.clips)
        .filter((c) => c && c.clip_name && !deleted.has(c.clip_name))
        .map((c) => ({ ...c, job_id: job.id, job_title: job.title }))
    )
    .filter((c) => {
      if (seen.has(c.clip_name)) return false
      seen.add(c.clip_name)
      return true
    })
    // Sort by score desc, then newest first
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  if (allClips.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-600 text-sm space-y-2">
        <div className="text-4xl">✂️</div>
        <p>Your clips will appear here</p>
        <p className="text-xs text-zinc-700">Paste a video URL above to get started</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {allClips.map((clip) => (
        <ClipCard
          key={clip.clip_name}
          clip={clip}
          onDelete={(name) => setDeleted((prev) => new Set([...prev, name]))}
        />
      ))}
    </div>
  )
}
