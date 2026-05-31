'use client'

import { useState, useEffect } from 'react'
import { X, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export default function FeedbackWidget() {
  const [open,    setOpen]    = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [email,   setEmail]   = useState('')
  const [status,  setStatus]  = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errMsg,  setErrMsg]  = useState('')

  // Listen for open trigger from sidebar or other components
  useEffect(() => {
    const handler = () => { setOpen(true); setStatus('idle') }
    document.addEventListener('klippa:open-feedback', handler)
    return () => document.removeEventListener('klippa:open-feedback', handler)
  }, [])

  const send = async () => {
    if (!message.trim()) return
    setStatus('sending')
    try {
      const res = await fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim() || undefined,
          message: message.trim(),
          email:   email.trim()   || undefined,
          page:    typeof window !== 'undefined' ? window.location.pathname : undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Failed to send')
      }
      setStatus('sent')
      setTimeout(() => { setOpen(false); setStatus('idle'); setSubject(''); setMessage(''); setEmail('') }, 2500)
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Something went wrong')
      setStatus('error')
    }
  }

  return (
    <>
      {/* Modal — opened via klippa:open-feedback event (dispatched from sidebar) */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

          <div className="relative w-full max-w-md bg-surface border border-edge rounded-2xl shadow-2xl p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink-1">Feedback & Support</p>
                <p className="text-xs text-ink-3 mt-0.5">We read every message — usually reply within 24h.</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-ink-3 hover:text-ink-1 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {status === 'sent' ? (
              <div className="py-8 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <p className="text-sm font-semibold text-ink-1">Thanks — message received!</p>
                <p className="text-xs text-ink-3">We'll get back to you at <strong>info@leamah.co.za</strong></p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-2">Your email (optional)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="so we can reply to you"
                    className="w-full bg-raised/60 border border-edge rounded-xl px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 outline-none focus:border-emerald-500/60 transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-2">Subject (optional)</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="e.g. Bug report, Question, Idea…"
                    className="w-full bg-raised/60 border border-edge rounded-xl px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 outline-none focus:border-emerald-500/60 transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-2">Message *</label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={4}
                    placeholder="Tell us what's on your mind…"
                    className="w-full bg-raised/60 border border-edge rounded-xl px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 outline-none focus:border-emerald-500/60 transition-colors resize-none"
                  />
                </div>

                {status === 'error' && (
                  <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{errMsg}
                  </div>
                )}

                <button
                  onClick={send}
                  disabled={status === 'sending' || !message.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-all"
                >
                  {status === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {status === 'sending' ? 'Sending…' : 'Send message'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
