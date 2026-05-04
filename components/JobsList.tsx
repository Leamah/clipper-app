'use client'

import type { ClipperJob, JobStatus } from '@/lib/types'
import {
  Download, Mic, Sparkles, Scissors, CheckCircle2, XCircle, Clock, Loader2
} from 'lucide-react'

interface Props {
  jobs:    ClipperJob[]
  loading: boolean
}

const STATUS_CONFIG: Record<JobStatus, { label: string; icon: React.ReactNode; color: string }> = {
  pending:      { label: 'Queued',        icon: <Clock    className="w-3.5 h-3.5" />, color: 'text-zinc-400' },
  downloading:  { label: 'Downloading',   icon: <Download className="w-3.5 h-3.5 animate-bounce" />, color: 'text-blue-400' },
  transcribing: { label: 'Transcribing',  icon: <Mic      className="w-3.5 h-3.5 animate-pulse" />, color: 'text-cyan-400' },
  identifying:  { label: 'Identifying',   icon: <Sparkles className="w-3.5 h-3.5 animate-pulse" />, color: 'text-yellow-400' },
  cutting:      { label: 'Cutting clips', icon: <Scissors className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '2s' }} />, color: 'text-violet-400' },
  done:         { label: 'Done',          icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'text-emerald-400' },
  error:        { label: 'Error',         icon: <XCircle  className="w-3.5 h-3.5" />, color: 'text-red-400' },
}

function JobCard({ job }: { job: ClipperJob }) {
  const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.pending
  const pct = job.progress_pct ?? 0

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100 truncate">
            {job.title ?? (() => { try { return new URL(job.url).hostname } catch { return job.url } })()}
          </p>
          <p className="text-xs text-zinc-500 truncate mt-0.5">{job.url}</p>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-medium flex-shrink-0 ${cfg.color}`}>
          {cfg.icon}
          {cfg.label}
        </div>
      </div>

      {/* Progress bar */}
      {job.status !== 'error' && (
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: pct < 100
                  ? 'linear-gradient(90deg, #7c3aed, #a78bfa, #7c3aed)'
                  : '#10b981',
                backgroundSize: '200% 100%',
                animation: pct < 100 && pct > 0 ? 'shimmer 2s linear infinite' : 'none',
              }}
            />
          </div>
          <p className="text-xs text-zinc-600">{pct}%</p>
        </div>
      )}

      {/* Error message */}
      {job.status === 'error' && job.error_msg && (
        <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">
          {job.error_msg}
        </p>
      )}

      {/* Metadata chips */}
      {(job.platform || job.duration_sec) && (
        <div className="flex gap-2 flex-wrap">
          {job.platform && (
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-xs capitalize">
              {job.platform}
            </span>
          )}
          {job.duration_sec && (
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-xs">
              {Math.floor(job.duration_sec / 60)}m {job.duration_sec % 60}s
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default function JobsList({ jobs, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading jobs…
      </div>
    )
  }

  if (jobs.length === 0) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {jobs.map((job) => <JobCard key={job.id} job={job} />)}
    </div>
  )
}
