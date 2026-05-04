'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { UserWatermark, UserReaction, OverlayOptions, WatermarkPosition } from '@/lib/types'
import { Droplets, Video } from 'lucide-react'

const POSITIONS: WatermarkPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

interface Props {
  isPremium: boolean
  value:     OverlayOptions
  onChange:  (v: OverlayOptions) => void
}

export default function ClipOverlayOptions({ isPremium, value, onChange }: Props) {
  const [watermarks,      setWatermarks]      = useState<UserWatermark[]>([])
  const [reactions,       setReactions]       = useState<UserReaction[]>([])
  const [applyWatermark,  setApplyWatermark]  = useState(false)
  const [applyReaction,   setApplyReaction]   = useState(false)

  useEffect(() => {
    if (!isPremium) return

    supabase
      .from('clipper_user_watermarks')
      .select('*')
      .order('created_at')
      .then(({ data }) => {
        if (!data?.length) return
        setWatermarks(data)
        // Don't auto-apply — user must explicitly toggle the watermark on
      })

    supabase
      .from('clipper_user_reactions')
      .select('*')
      .order('created_at')
      .then(async ({ data }) => {
        if (!data?.length) return
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
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium])

  if (!isPremium) return null
  if (!watermarks.length && !reactions.length) return null

  return (
    <div className="space-y-3 border-t border-zinc-800 pt-4 mt-1">
      {/* ── Watermark ── */}
      {watermarks.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              const next = !applyWatermark
              setApplyWatermark(next)
              onChange({
                ...value,
                watermark_id: next ? (watermarks.find((w) => w.is_default)?.id ?? watermarks[0].id) : null,
              })
            }}
            className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
              applyWatermark
                ? 'border-violet-500/40 bg-violet-500/10'
                : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center gap-2.5 text-left">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                applyWatermark ? 'bg-violet-500/20 text-violet-300' : 'bg-zinc-800 text-zinc-500'
              }`}>
                <Droplets className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-200">Apply watermark</p>
                <p className="text-xs text-zinc-500 mt-0.5">Overlay your logo on the exported clip</p>
              </div>
            </div>
            <div className={`relative w-10 h-5 rounded-full transition-colors ${applyWatermark ? 'bg-violet-500' : 'bg-zinc-700'}`}>
              <div
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: applyWatermark ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </div>
          </button>

          {applyWatermark && (
            <select
              className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500/60 transition-colors"
              value={value.watermark_id ?? ''}
              onChange={(e) => onChange({ ...value, watermark_id: e.target.value })}
            >
              {watermarks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}{w.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ── Reaction video ── */}
      {reactions.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              const next = !applyReaction
              setApplyReaction(next)
              onChange({
                ...value,
                reaction_video_id: next ? (reactions[0]?.id ?? null) : null,
              })
            }}
            className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
              applyReaction
                ? 'border-violet-500/40 bg-violet-500/10'
                : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center gap-2.5 text-left">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                applyReaction ? 'bg-violet-500/20 text-violet-300' : 'bg-zinc-800 text-zinc-500'
              }`}>
                <Video className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-200">
                  Reaction overlay
                  <span className="ml-2 text-xs bg-gradient-to-r from-violet-500 to-purple-600 text-white px-1.5 py-0.5 rounded font-semibold">
                    Premium
                  </span>
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">Picture-in-picture with AI voice commentary</p>
              </div>
            </div>
            <div className={`relative w-10 h-5 rounded-full transition-colors ${applyReaction ? 'bg-violet-500' : 'bg-zinc-700'}`}>
              <div
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: applyReaction ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </div>
          </button>

          {applyReaction && (
            <div className="space-y-3 pl-1">
              {/* Thumbnail picker */}
              <div>
                <p className="text-xs text-zinc-500 mb-2">Choose reaction clip</p>
                <div className="grid grid-cols-4 gap-2">
                  {reactions.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onChange({ ...value, reaction_video_id: r.id })}
                      title={r.name}
                      className={`rounded-lg overflow-hidden border-2 aspect-video bg-zinc-800 transition ${
                        value.reaction_video_id === r.id
                          ? 'border-violet-500 ring-2 ring-violet-500/20'
                          : 'border-transparent hover:border-zinc-600'
                      }`}
                    >
                      {r.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.thumbnailUrl} alt={r.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className="w-4 h-4 text-zinc-600" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Corner position */}
              <div>
                <p className="text-xs text-zinc-500 mb-2">Corner position</p>
                <div className="flex gap-1.5 flex-wrap">
                  {POSITIONS.map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => onChange({ ...value, reaction_position: pos })}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${
                        value.reaction_position === pos
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              {/* Commentary */}
              <div>
                <p className="text-xs text-zinc-500 mb-1.5">
                  Commentary note <span className="italic">(optional — read aloud by AI voice)</span>
                </p>
                <textarea
                  rows={2}
                  maxLength={280}
                  placeholder='e.g. "This part got me — the timing is perfect!"'
                  className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-violet-500/60 transition-colors resize-none"
                  value={value.commentary_text}
                  onChange={(e) => onChange({ ...value, commentary_text: e.target.value })}
                />
                <p className="text-xs text-zinc-600 text-right">{value.commentary_text.length}/280</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
