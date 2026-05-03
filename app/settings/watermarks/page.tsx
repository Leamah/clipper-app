'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { UserWatermark, WatermarkPosition } from '@/lib/types'
import { Trash2, Star, StarOff, Upload, ImageIcon } from 'lucide-react'

const MAX_WATERMARKS = 5
const POSITIONS: WatermarkPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

export default function WatermarksPage() {
  const fileRef = useRef<HTMLInputElement>(null)

  const [watermarks,  setWatermarks]  = useState<UserWatermark[]>([])
  const [loading,     setLoading]     = useState(true)
  const [uploading,   setUploading]   = useState(false)
  const [isPremium,   setIsPremium]   = useState(false)
  const [form, setForm] = useState({
    name:     '',
    position: 'bottom-right' as WatermarkPosition,
    opacity:  0.8,
    scale:    0.15,
  })

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
      .from('clipper_user_watermarks')
      .select('*')
      .order('created_at', { ascending: true })

    if (!data) { setLoading(false); return }

    const withUrls = await Promise.all(
      data.map(async (w) => {
        const { data: signed } = await supabase.storage
          .from('clipper_watermarks')
          .createSignedUrl(w.storage_path, 3600)
        return { ...w, url: signed?.signedUrl }
      })
    )
    setWatermarks(withUrls)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function upload(file: File) {
    if (!file.type.includes('png')) { alert('Only PNG files are supported.'); return }
    if (file.size > 2 * 1024 * 1024) { alert('Max file size is 2 MB.'); return }
    if (watermarks.length >= MAX_WATERMARKS) { alert(`Max ${MAX_WATERMARKS} watermarks.`); return }
    if (!form.name.trim()) { alert('Give this watermark a name first.'); return }

    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const path = `${user.id}/${crypto.randomUUID()}.png`

    const { error: uploadError } = await supabase.storage
      .from('clipper_watermarks')
      .upload(path, file, { contentType: 'image/png' })

    if (uploadError) { alert('Upload failed: ' + uploadError.message); setUploading(false); return }

    await supabase.from('clipper_user_watermarks').insert({
      user_id:      user.id,
      name:         form.name.trim(),
      storage_path: path,
      position:     form.position,
      opacity:      form.opacity,
      scale:        form.scale,
      is_default:   watermarks.length === 0,
    })

    setForm({ name: '', position: 'bottom-right', opacity: 0.8, scale: 0.15 })
    await load()
    setUploading(false)
  }

  async function remove(w: UserWatermark) {
    await supabase.storage.from('clipper_watermarks').remove([w.storage_path])
    await supabase.from('clipper_user_watermarks').delete().eq('id', w.id)
    setWatermarks((prev) => prev.filter((x) => x.id !== w.id))
  }

  async function setDefault(w: UserWatermark) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('clipper_user_watermarks').update({ is_default: false }).eq('user_id', user.id)
    await supabase.from('clipper_user_watermarks').update({ is_default: true }).eq('id', w.id)
    setWatermarks((prev) => prev.map((x) => ({ ...x, is_default: x.id === w.id })))
  }

  const atLimit = watermarks.length >= MAX_WATERMARKS

  if (!loading && !isPremium) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <div className="text-4xl">✨</div>
        <h2 className="text-lg font-semibold text-zinc-100">Premium feature</h2>
        <p className="text-sm text-zinc-500 max-w-xs">
          Custom watermarks are available on the Premium plan. Upgrade to brand every clip you export.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Watermarks</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Add your logo or branding to every clip.{' '}
          <span className="text-zinc-400">{watermarks.length}/{MAX_WATERMARKS} used.</span>
        </p>
      </div>

      {/* Upload form */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
        <p className="text-sm font-medium text-zinc-300">Add watermark</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-zinc-500">Name</label>
            <input
              className="mt-1 w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-violet-500/60 transition-colors"
              placeholder="e.g. My Logo"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">Position</label>
            <select
              className="mt-1 w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500/60 transition-colors"
              value={form.position}
              onChange={(e) => setForm((f) => ({ ...f, position: e.target.value as WatermarkPosition }))}
            >
              {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500">Opacity ({Math.round(form.opacity * 100)}%)</label>
            <input
              type="range" min={0.1} max={1} step={0.05}
              className="mt-2 w-full accent-violet-500"
              value={form.opacity}
              onChange={(e) => setForm((f) => ({ ...f, opacity: parseFloat(e.target.value) }))}
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-zinc-500">Size ({Math.round(form.scale * 100)}% of video width)</label>
            <input
              type="range" min={0.05} max={0.4} step={0.01}
              className="mt-2 w-full accent-violet-500"
              value={form.scale}
              onChange={(e) => setForm((f) => ({ ...f, scale: parseFloat(e.target.value) }))}
            />
          </div>
        </div>

        <input
          ref={fileRef} type="file" accept="image/png" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={atLimit || uploading}
          className="flex items-center gap-2 w-full justify-center border-2 border-dashed border-zinc-700 rounded-xl py-4 text-sm text-zinc-500 hover:border-violet-500/60 hover:text-violet-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Upload className="w-4 h-4" />
          {uploading ? 'Uploading…' : atLimit ? `Limit reached (${MAX_WATERMARKS})` : 'Choose PNG file'}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : watermarks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-zinc-600">
          <ImageIcon className="w-8 h-8" />
          <p className="text-sm">No watermarks yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {watermarks.map((w) => (
            <div key={w.id} className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              {w.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={w.url} alt={w.name}
                  className="h-12 w-20 object-contain rounded border border-zinc-800 bg-zinc-800/60"
                />
              ) : (
                <div className="h-12 w-20 rounded border border-zinc-800 bg-zinc-800 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4 text-zinc-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">{w.name}</p>
                <p className="text-xs text-zinc-500">
                  {w.position} · {Math.round(w.opacity * 100)}% opacity · {Math.round(w.scale * 100)}% size
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  title={w.is_default ? 'Default watermark' : 'Set as default'}
                  onClick={() => setDefault(w)}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition"
                >
                  {w.is_default
                    ? <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    : <StarOff className="w-4 h-4 text-zinc-600" />}
                </button>
                <button
                  title="Delete"
                  onClick={() => remove(w)}
                  className="p-2 rounded-lg hover:bg-red-900/20 text-zinc-600 hover:text-red-400 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
