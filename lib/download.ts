/**
 * Download a file from a cross-origin URL (e.g. Supabase Storage CDN).
 *
 * The browser ignores the `download` attribute on <a> tags for cross-origin
 * URLs regardless of CORS headers. The workaround is to fetch the file,
 * create a local blob URL, then trigger the download from that same-origin URL.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  const res  = await fetch(url)
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)

  const a    = document.createElement('a')
  a.href     = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  // Small delay so the browser has time to start the download before revoke
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5_000)
}
