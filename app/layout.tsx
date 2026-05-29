import type { Metadata } from 'next'
import './globals.css'
import PageTransition from '@/components/PageTransition'

export const metadata: Metadata = {
  title: 'Klippa | Tax Made Simple',
  description: 'Know your tax. Keep more money. Built for South African freelancers and consultants.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  )
}
