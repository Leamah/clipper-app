/**
 * POST /api/chat
 *
 * Streaming Claude-powered SA tax assistant.
 * Requires the user to have a paid subscription tier (starter / professional / admin).
 */
import Anthropic                from '@anthropic-ai/sdk'
import { createServerClient }   from '@supabase/ssr'
import { createClient }         from '@supabase/supabase-js'
import { cookies }              from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are Klippa's SA Tax Assistant — a knowledgeable, friendly advisor specialising in South African personal income tax for freelancers, consultants and self-employed professionals.

You have deep expertise in:
- SARS eFiling, ITR12 and ITR14 submissions
- Provisional tax (IRP6) — calculating first and second provisional payments, penalties for under-estimation
- Allowable deductions: home office (trade test), wear & tear on assets, business travel (SARS logbook), retirement annuity (Section 11F cap), medical aid credits (Section 6B/6C), pension/provident fund
- Capital Gains Tax (CGT) basics for individuals
- VAT registration threshold (R1m rolling 12 months) and voluntary registration
- Employment vs independent contractor distinctions (section 23(m), IRP3)
- Current SARS tax tables, rebates (primary, secondary, tertiary), and tax thresholds for the relevant tax year
- PAYE vs provisional tax obligations
- Section 12H learnership allowances, turnover tax for micro businesses
- Common audit triggers and how to keep clean records

Guidelines:
- Always clarify which tax year the question relates to — SA tax years run 1 March to 28/29 February
- When quoting thresholds or rates, mention the tax year they apply to and recommend the user verify on the SARS website (sars.gov.za) for the latest figures
- Be specific and practical — give rand amounts, percentages and deadlines where relevant
- If a question requires a tax practitioner's personal advice (e.g. complex estate planning, tax disputes), say so clearly
- Keep answers concise but complete — use bullet points for multi-step answers
- Do not fabricate SARS rules. If unsure, say so and direct the user to sars.gov.za or a registered tax practitioner
- You are NOT a licensed tax practitioner — remind users of this when relevant

Respond in plain English. Be warm but professional.`

export async function POST(req: NextRequest) {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Premium gate — check subscription tier
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: profile } = await admin
    .from('klippa_profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single()

  const tier = profile?.subscription_tier ?? 'free'
  if (tier === 'free') {
    return NextResponse.json({ error: 'premium_required' }, { status: 402 })
  }

  const { messages } = await req.json() as {
    messages: { role: 'user' | 'assistant'; content: string }[]
  }

  if (!messages?.length) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 })
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 500 })
  }

  const anthropic = new Anthropic({ apiKey: anthropicKey })

  // Stream the response back
  const stream = await anthropic.messages.stream({
    model:      'claude-haiku-4-5',
    max_tokens: 1024,
    system:     SYSTEM_PROMPT,
    messages,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
