import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Klippa | AI Video Clipping',
  description: 'Paste a video URL, get the best 45-90 second clips in minutes.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  )
}
