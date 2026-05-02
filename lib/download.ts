import { supabase } from './supabase'

const BUCKET = 'clipper_clips'

/**
 * Download a clip from Supabase Storage.
 *
 * Uses Supabase's signed URL with the `download` option, which sets a
 * Content-Disposition: attachment header server-side. The browser then
 * downloads the file directly without needing fetch+blob.
 *
 * This is more reliable than fetch-blob because:
 *   1. Streams the file (no full memory load → works for large videos)
 *   2. No CORS headaches
 *   3. Browsers honour the Content-Disposition header for any origin
 */
export async function downloadFile(publicUrl: string, filename: string): Promise<void> {
  // Extract the storage path from the public URL.
  // Public URL pattern: https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
  const match = publicUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+?)(?:\?|$)/)
  const path  = match ? decodeURIComponent(match[1]) : filename

  // Get a signed URL with download disposition (1 hour expiry)
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600, { download: filename })

  if (error || !data?.signedUrl) {
    // Fallback to fetch-blob if signed URL fails
    return downloadViaBlob(publicUrl, filename)
  }

  const a = document.createElement('a')
  a.href     = data.signedUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

async function downloadViaBlob(url: string, filename: string): Promise<void> {
  const res  = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href     = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000)
}
