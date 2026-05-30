import type { Metadata } from 'next'
import './globals.css'
import PageTransition from '@/components/PageTransition'
import IdleGuard     from '@/components/IdleGuard'

export const metadata: Metadata = {
  title: 'Klippa | Tax Made Simple',
  description: 'Know your tax. Keep more money. Built for South African freelancers and consultants.',
}

// Prevent flash of wrong theme: reads localStorage before first paint
const themeScript = `(function(){
  var t = localStorage.getItem('klippa-theme') || 'dark';
  document.documentElement.classList.toggle('dark', t === 'dark');
})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-base text-ink-1 antialiased">
        <IdleGuard />
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  )
}
