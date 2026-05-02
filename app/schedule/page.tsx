'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ScheduledPost, PostStatus } from '@/lib/types'
import { PLATFORMS } from '@/lib/types'
import { Scissors, Calendar, CheckCircle2, XCircle, Clock, Loader2, Trash2, RefreshCw, Download } from 'lucide-react'
import Link from 'next/link'
import UserNav from '@/components/UserNav'
import { downloadFile } from '@/lib/download'

const STATUS_TABS = [
  { key: 'all',       label: 'All'       },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'posted',    label: 'Posted'    },
  { key: 'failed',    label: 'Failed'    },
] as const

function statusIcon(status: ScheduledPost['status']) {
  switch (status) {
    case 'posted':    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
    case 'failed':    return <XCircle      className="w-3.5 h-3.5 text-red-400"     />
    case 'cancelled': return <XCircle      className="w-3.5 h-3.5 text-zinc-500"    />
    case 'posting':   return <Loader2      className="w-3.5 h-3.5 text-violet-400 animate-spin" />
    default:          return <Clock        className="w-3.5 h-3.5 text-amber-400"   />
  }
}

function statusLabel(status: ScheduledPost['status']) {
  const map: Record<ScheduledPost['status'], string> = {
    scheduled: 'Scheduled',
    posting:   'Posting…',
    posted:    'Posted',
    failed:    'Failed',
    cancelled: 'Cancelled',
  }
  return map[status]
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en', {
    month: 'short', day: 'numeric',
    hour:  'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

function PostRow({
  post,
  onUpdate,
}: {
  post:     ScheduledPost
  onUpdate: (id: string, status: PostStatus) => void
}) {
  const [busy, setBusy] = useState(false)

  const act = async (status: 'posted' | 'cancelled') => {
    setBusy(true)
    await fetch('/api/schedule', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: post.id, status }),
    })
    onUpdate(post.id, status)
    setBusy(false)
  }

  const platformEmojis = post.platforms
    .map((id) => PLATFORMS.find((p) => p.id === id)?.emoji)
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-all">
      {/* Thumbnail */}
      <video
        src={post.public_url}
        className="w-20 h-14 rounded-lg object-cover bg-zinc-800 flex-shrink-0"
        muted preload="metadata"
      />

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 text-xs font-medium text-zinc-300">
            {statusIcon(post.status)}
            {statusLabel(post.status)}
          </span>
          {platformEmojis && (
            <span className="text-sm tracking-wider">{platformEmojis}</span>
          )}
          <span className="text-xs text-zinc-600 ml-auto">
            {post.scheduled_at ? formatDate(post.scheduled_at) : '—'}
          </span>
        </div>

        {post.caption && (
          <p className="text-sm text-zinc-300 line-clamp-2 leading-relaxed">{post.caption}</p>
        )}

        <p className="text-xs text-zinc-600 truncate">{post.clip_name}</p>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-1">
        {/* Always show download */}
        <button
          onClick={() => downloadFile(post.public_url, post.clip_name)}
          className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          title="Download"
          type="button"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        {post.status === 'scheduled' && (
          <>
            <button
              onClick={() => act('posted')}
              disabled={busy}
              className="px-2 py-1 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
              title="Mark as posted"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : '✓ Done'}
            </button>
            <button
              onClick={() => act('cancelled')}
              disabled={busy}
              className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50"
              title="Remove from queue"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function SchedulePage() {
  const [posts,   setPosts]   = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<'all' | 'scheduled' | 'posted' | 'failed'>('all')
  const [userId,  setUserId]  = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])

  const fetchPosts = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('clipper_scheduled_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (data) setPosts(data as ScheduledPost[])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (!userId) return
    fetchPosts()

    const channel = supabase
      .channel('scheduled_posts_rt')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'clipper_scheduled_posts', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setPosts((prev) => prev.map((p) => p.id === payload.new.id ? payload.new as ScheduledPost : p))
          } else if (payload.eventType === 'INSERT') {
            setPosts((prev) => [payload.new as ScheduledPost, ...prev])
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchPosts])

  const filtered = tab === 'all'
    ? posts.filter((p) => p.status !== 'cancelled')
    : posts.filter((p) => p.status === tab)

  const counts = {
    scheduled: posts.filter((p) => p.status === 'scheduled').length,
    posted:    posts.filter((p) => p.status === 'posted').length,
    failed:    posts.filter((p) => p.status === 'failed').length,
  }

  return (
    <div className="min-h-screen">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-600/10 blur-[120px] rounded-full" />
      </div>

      {/* Nav */}
      <header className="relative z-10 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
              <Scissors className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <nav className="flex items-center gap-1 ml-4">
            <Link href="/dashboard" className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Clips</Link>
            <span className="px-3 py-1.5 rounded-lg text-xs text-violet-300 bg-violet-500/10 font-medium">Stream</span>
          </nav>
          <div className="ml-auto">
            <UserNav />
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="w-5 h-5 text-violet-400" />
            Social Stream
          </h1>
          <p className="text-sm text-zinc-500">Schedule and track your clip posts across platforms</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Scheduled', value: counts.scheduled, color: 'text-amber-400'  },
            { label: 'Posted',    value: counts.posted,    color: 'text-emerald-400' },
            { label: 'Failed',    value: counts.failed,    color: 'text-red-400'     },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-zinc-800 pb-0">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'border-violet-500 text-violet-300'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={fetchPosts}
            className="ml-auto p-1.5 text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Posts */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <div className="text-4xl">📅</div>
            <p className="text-sm text-zinc-500">No {tab === 'all' ? '' : tab} posts yet</p>
            <p className="text-xs text-zinc-600">
              Schedule clips from the{' '}
              <Link href="/dashboard" className="text-violet-400 hover:underline">clips dashboard</Link>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                onUpdate={(id, status) =>
                  setPosts((prev) => prev.map((p) => p.id === id ? { ...p, status } : p))
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
