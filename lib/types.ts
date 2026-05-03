export type JobStatus =
  | 'pending'
  | 'downloading'
  | 'transcribing'
  | 'identifying'
  | 'cutting'
  | 'done'
  | 'error'

export interface ClipResult {
  clip_name:    string
  public_url:   string
  duration_sec: number
  size_mb:      number
  score:        number | null
  hook:         string
}

export interface ClipperJob {
  id:                  string
  url:                 string
  user_id:             string | null
  title:               string | null
  platform:            string | null
  duration_sec:        number | null
  status:              JobStatus
  progress_pct:        number
  error_msg:           string | null
  clips:               ClipResult[]
  num_clips:           number
  clip_instructions:   string | null
  target_duration_sec: number
  enable_captions:     boolean
  created_at:          string
  updated_at:          string
}

export interface StorageClip {
  name:       string
  size_mb:    number
  created_at: string
  public_url: string
}

export type PostStatus = 'scheduled' | 'posting' | 'posted' | 'failed' | 'cancelled'

export const PLATFORMS = [
  { id: 'tiktok',    label: 'TikTok',    emoji: '🎵' },
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'youtube',   label: 'YouTube',   emoji: '▶️' },
  { id: 'twitter',   label: 'X',         emoji: '𝕏'  },
  { id: 'facebook',  label: 'Facebook',  emoji: '👥' },
] as const

export type PlatformId = typeof PLATFORMS[number]['id']

export interface ScheduledPost {
  id:                string
  user_id:           string
  clip_name:         string
  public_url:        string
  caption:           string | null
  platforms:         PlatformId[]
  scheduled_at:      string | null
  status:            PostStatus
  ayrshare_post_id:  string | null
  platform_post_ids: Record<string, string> | null
  error_msg:         string | null
  created_at:        string
  updated_at:        string
}
