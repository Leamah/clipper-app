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
  id:           string
  url:          string
  title:        string | null
  platform:     string | null
  duration_sec: number | null
  status:       JobStatus
  progress_pct: number
  error_msg:    string | null
  clips:        ClipResult[]
  created_at:   string
  updated_at:   string
}

export interface StorageClip {
  name:       string
  size_mb:    number
  created_at: string
  public_url: string
}
