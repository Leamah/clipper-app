'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { UserReaction } from '@/lib/types'
import { Trash2, Upload, Video } from 'lucide-react'

const MAX_REACTIONS    = 10
const MAX_DURATION_SEC = 5

export default function ReactionsPage() {
  const fileRef = useRef<HTMLInputElement>(null)

  const [reactions,  setReactions]  = useState<UserReaction[]>([])
  const [loading,    setLoading]    = useState(true)
  const [uploading,  setUploading]  = useState(false)
  const [isPremium,  setIsPremium]  = useState(false)
  const [pendingName, setPendingName] = useState('')

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('clipper_user_profiles')
      .select('plan')
      .eq('id', user.id)
      .single()
    setIsPremium(profile?.plan === 'premium' || profile?.plan === 'admin')

    const { data } = await supabase
      .from('clipper_user_reactions')
      .select('*')
      .order('created_at', { ascending: true })

    if (!data) { setLoading(false); return }

    const withUrls = await Promise.all(
      data.map(async (r) => {
        if (!r.thumbnail_path) return { ...r, thumbnailUrl: undefined }
        const { data: signed } = await supabase.storage
          .from('clipper_reaction_videos')
          .createSignedUrl(r.thumbnail_path, 3600)
        return { ...r, thumbnailUrl: signed?.signedUrl }
      })
    )
    setReactions(withUrls)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function upload(file: File) {
    if (!file.type.startsWith('video/')) { alert('Please choose a video file (MP4 or WebM).'); return }
    if (file.size > 20 * 1024 * 1024) { alert('Max file size is 20 MB.'); return }
    if (reactions.length >= MAX_REACTIONS) { alert(`Max ${MAX_REACTIONS} reaction videos.`); return }
    if (!pendingName.trim()) { alert('Give this reaction video a name first.'); return }

    const duration = await getVideoDuration(file)
    if (duration > MAX_DURATION_SEC) {
      alert(`Reaction videos must be ${MAX_DURATION_SEC} seconds or shorter. This video is ${duration.toFixed(1)}s.`)
      return
    }

    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const ext       = file.type.includes('webm') ? 'webm' : 'mp4'
    const uuid      = crypto.randomUUID()
    const videoPath = `${user.id}/${uuid}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('clipper_reaction_videos')
      .upload(videoPath, file, { contentType: file.type })

    if (uploadError) { alert('Upload failed: ' + uploadError.message); setUploading(false); return }

    // Generate thumbnail from first frame (best-effort)
    let thumbnailPath: string | null = null
    try {
      const thumbBlob = await extractFirstFrame(file)
      if (thumbBlob) {
        const thumbPath = `${user.id}/${uuid}_thumb.jpg`
        const { error: thumbErr } = await supabase.storage
          .from('clipper_reaction_videos')
          .upload(thumbPath, thumbBlob, { contentType: 'image/jpeg' })
        if (!thumbErr) thumbnailPath = thumbPath
      }
    } catch { /* thumbnail is optional */ }

    await supabase.from('clipper_user_reactions').insert({
      user_id:        user.id,
      name:           pendingName.trim(),
      storage_path:   videoPath,
      thumbnail_path: thumbnailPath,
      duration_sec:   parseFloat(duration.toFixed(1)),
    })

    setPendingName('')
    await load()
    setUploading(false)
  }

  async function remove(r: UserReaction) {
    const paths = [r.storage_path]
    if (r.thumbnail_path) paths.push(r.thumbnail_path)
    await supabase.storage.from('clipper_reaction_videos').remove(paths)
    await supabase.from('clipper_user_reactions').delete().eq('id', r.id)
    setReactions((prev) => prev.filter((x) => x.id !== r.id))
  }

  const atLimit = reactions.length >= MAX_REACTIONS

  if (!loading && !isPremium) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <div className="text-4xl">🎬</div>
        <h2 className="text-lg font-semibold text-zinc-100">Premium feature</h2>
        <p className="text-sm text-zinc-500 max-w-xs">
          Reaction video overlays are available on the Premium plan. Upgrade to add your personality to every clip.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Reaction Videos</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Upload short reaction clips (≤{MAX_DURATION_SEC}s) to overlay as picture-in-picture.{' '}
          <span className="text-zinc-400">{reactions.length}/{MAX_REACTIONS} used.</span>
        </p>
      </div>

      {/* Upload form */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
        <p className="text-sm font-medium text-zinc-300">Add reaction video</p>
        <div>
          <label className="text-xs text-zinc-500">Name</label>
          <input
            className="mt-1 w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-violet-500/60 transition-colors"
            placeholder="e.g. Surprised reaction"
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
          />
        </div>

        <input
          ref={fileRef} type="file" accept="video/mp4,video/webm" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={atLimit || uploading}
          className="flex items-center gap-2 w-full justify-center border-2 border-dashed border-zinc-700 rounded-xl py-4 text-sm text-zinc-500 hover:border-violet-500/60 hover:text-violet-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Upload className="w-4 h-4" />
          {uploading ? 'Uploading…' : atLimit ? `Limit reached (${MAX_REACTIONS})` : 'Choose MP4 or WebM (max 5 sec)'}
        </button>
      </div>

      {/* Thumbnail grid */}
      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : reactions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-zinc-600">
          <Video className="w-8 h-8" />
          <p className="text-sm">No reaction videos yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {reactions.map((r) => (
            <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <div className="aspect-video bg-zinc-800 flex items-center justify-center">
                {r.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.thumbnailUrl} alt={r.name} className="w-full h-full object-cover" />
                ) : (
                  <Video className="w-6 h-6 text-zinc-600" />
                )}
              </div>
              <div className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-200 truncate">{r.name}</p>
                  {r.duration_sec && (
                    <p className="text-xs text-zinc-500">{r.duration_sec}s</p>
                  )}
                </div>
                <button
                  onClick={() => remove(r)}
                  className="p-1.5 rounded-lg hover:bg-red-900/20 text-zinc-600 hover:text-red-400 transition shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => { URL.revokeObjectURL(video.src); resolve(video.duration) }
    video.onerror = reject
    video.src = URL.createObjectURL(file)
  })
}

function extractFirstFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.currentTime = 0.1
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0)
      canvas.toBlob((blob) => { URL.revokeObjectURL(video.src); resolve(blob) }, 'image/jpeg', 0.8)
    }
    video.onerror = () => { URL.revokeObjectURL(video.src); resolve(null) }
    video.src = URL.createObjectURL(file)
  })
}
