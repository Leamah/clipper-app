'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Bot, X, Send, Loader2, Sparkles, Lock, ChevronRight,
  RotateCcw,
} from 'lucide-react'
import Link from 'next/link'

type Msg = { role: 'user' | 'assistant'; content: string }

const STARTERS = [
  'How do I calculate my provisional tax?',
  'What home office expenses can I deduct?',
  'When do I need to register for VAT?',
  'What is the current tax-free threshold?',
]

export default function TaxChatbot() {
  const [open,    setOpen]    = useState(false)
  const [tier,    setTier]    = useState<string | null>(null)
  const [msgs,    setMsgs]    = useState<Msg[]>([])
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Load user tier once on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('klippa_profiles')
        .select('subscription_tier')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setTier(data?.subscription_tier ?? 'free'))
    })
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, loading])

  // Focus input when panel opens
  useEffect(() => {
    if (open && tier !== 'free') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, tier])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setInput('')

    const userMsg: Msg = { role: 'user', content: trimmed }
    const history = [...msgs, userMsg]
    setMsgs(history)
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: history }),
      })

      if (res.status === 402) {
        setMsgs(prev => [...prev, { role: 'assistant', content: '__upgrade__' }])
        setLoading(false)
        return
      }
      if (!res.ok) {
        throw new Error('Request failed')
      }

      // Stream the response
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      setMsgs(prev => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setMsgs(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: accumulated }
          return updated
        })
      }
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't connect. Please try again." }])
    } finally {
      setLoading(false)
    }
  }, [msgs, loading])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const isPremium = tier !== null && tier !== 'free'

  return (
    <>
      {/* Floating button — bottom-right */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Chat to Klip"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 text-white text-xs font-semibold shadow-lg shadow-emerald-900/40 hover:from-emerald-400 hover:to-teal-600 transition-all"
      >
        <Bot className="w-4 h-4" />
        <span className="hidden sm:inline">Chat to Klip</span>
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-[calc(100vw-3rem)] sm:w-[380px] flex flex-col bg-surface border border-edge rounded-2xl shadow-2xl overflow-hidden"
          style={{ maxHeight: 'min(560px, calc(100vh - 120px))' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge bg-gradient-to-r from-emerald-600/20 to-teal-600/20 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-1">Chat to Klip</p>
                <p className="text-[10px] text-emerald-400">Your Klippa &amp; SA tax assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {msgs.length > 0 && (
                <button onClick={() => setMsgs([])} title="Clear chat"
                  className="p-1.5 text-ink-3 hover:text-ink-1 transition-colors rounded-lg hover:bg-raised">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => setOpen(false)}
                className="p-1.5 text-ink-3 hover:text-ink-1 transition-colors rounded-lg hover:bg-raised">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          {!isPremium ? (
            // ── Premium gate ──
            <div className="flex flex-col items-center justify-center gap-4 p-6 text-center flex-1">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Lock className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-1">Premium feature</p>
                <p className="text-xs text-ink-2 mt-1 leading-relaxed">
                  Get instant answers about Klippa and SA tax — included with every paid plan.
                </p>
              </div>
              <Link href="/subscription"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors">
                <Sparkles className="w-3.5 h-3.5" /> Upgrade to unlock
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
              <p className="text-[10px] text-ink-3">From R149/month · Cancel anytime</p>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {msgs.length === 0 ? (
                  <div className="space-y-4">
                    <div className="text-center py-4">
                      <Sparkles className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                      <p className="text-xs text-ink-2 leading-relaxed">
                        Ask me anything about using Klippa, or SA tax — provisional tax, deductions, VAT, eFiling and more.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium text-ink-3 uppercase tracking-wider">Try asking:</p>
                      {STARTERS.map(s => (
                        <button key={s} onClick={() => send(s)}
                          className="w-full text-left text-xs text-ink-2 hover:text-ink-1 px-3 py-2 rounded-lg border border-edge hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  msgs.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {m.content === '__upgrade__' ? (
                        <div className="max-w-[85%] text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5">
                          Your plan doesn't include the AI assistant. <Link href="/subscription" className="underline">Upgrade here →</Link>
                        </div>
                      ) : (
                        <div className={`max-w-[85%] text-xs leading-relaxed rounded-xl px-3 py-2.5 whitespace-pre-wrap ${
                          m.role === 'user'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-raised border border-edge text-ink-1'
                        }`}>
                          {m.content || (loading && i === msgs.length - 1 ? (
                            <span className="flex items-center gap-1 text-ink-3">
                              <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
                            </span>
                          ) : '')}
                        </div>
                      )}
                    </div>
                  ))
                )}
                {loading && msgs[msgs.length - 1]?.role !== 'assistant' && (
                  <div className="flex justify-start">
                    <div className="bg-raised border border-edge rounded-xl px-3 py-2.5 text-xs text-ink-3 flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="border-t border-edge p-3 flex-shrink-0">
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    disabled={loading}
                    rows={1}
                    placeholder="Ask Klip anything…"
                    className="flex-1 bg-raised/60 border border-edge rounded-xl px-3 py-2 text-xs text-ink-1 placeholder:text-ink-3 outline-none focus:border-emerald-500/60 transition-colors resize-none disabled:opacity-50 max-h-24 overflow-y-auto"
                    style={{ lineHeight: '1.5' }}
                  />
                  <button
                    onClick={() => send(input)}
                    disabled={loading || !input.trim()}
                    className="flex-shrink-0 w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white flex items-center justify-center transition-colors"
                  >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-ink-3 mt-1.5 text-center">
                  Not a licensed tax practitioner · Verify with{' '}
                  <a href="https://sars.gov.za" target="_blank" rel="noreferrer" className="underline hover:text-ink-2">sars.gov.za</a>
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
