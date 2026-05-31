import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://klippa.co.za'

// Public, crawlable routes only. App routes behind auth (/dashboard, /expenses,
// /practice/*, /org/*, /admin, /settings) and API routes are intentionally excluded.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: `${SITE_URL}/`,        lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${SITE_URL}/login`,   lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ]
}
