'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('klippa-theme')
    // Default to dark if not set
    const dark = saved ? saved === 'dark' : true
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)
  }, [])

  const toggle = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('klippa-theme', next ? 'dark' : 'light')
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex items-center justify-center w-8 h-8 rounded-lg text-ink-2 hover:text-ink-1 hover:bg-raised transition-colors"
    >
      {isDark
        ? <Sun  className="w-4 h-4" />
        : <Moon className="w-4 h-4" />
      }
    </button>
  )
}
