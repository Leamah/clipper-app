'use client'

import AppNav from '@/components/AppNav'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pl-52">
      <AppNav activePage="settings" />
      <main className="max-w-2xl mx-auto px-6 py-10">
        {children}
      </main>
    </div>
  )
}
