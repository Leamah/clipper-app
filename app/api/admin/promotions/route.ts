import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

function getClients() {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  return { anon, admin }
}

async function requireAdmin(anon: ReturnType<typeof createServerClient>) {
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return null
  const { data: profile } = await anon
    .from('klippa_profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single()
  return profile?.subscription_tier === 'admin' ? user : null
}

// GET — list all promotions
export async function GET() {
  const { anon, admin } = getClients()
  const user = await requireAdmin(anon)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await admin
    .from('klippa_promotions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ promotions: data })
}

// POST — create a new promotion
export async function POST(request: Request) {
  const { anon, admin } = getClients()
  const user = await requireAdmin(anon)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const {
    code, type, trial_days, discount_pct, free_submissions,
    applies_to_plan, max_uses, valid_from, valid_until, note, is_active,
  } = body

  if (!code || !type) {
    return NextResponse.json({ error: 'code and type are required' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('klippa_promotions')
    .insert({
      code:             code.toUpperCase().trim(),
      type,
      trial_days:       type === 'trial'           ? (trial_days ?? 7)    : null,
      discount_pct:     type === 'discount'        ? (discount_pct ?? 10) : null,
      free_submissions: type === 'free_submission' ? (free_submissions ?? 1) : null,
      applies_to_plan:  applies_to_plan ?? null,
      max_uses:         max_uses ?? null,
      valid_from:       valid_from ?? new Date().toISOString(),
      valid_until:      valid_until ?? null,
      is_active:        is_active ?? true,
      note:             note ?? null,
      created_by:       user.id,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A promo with that code already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ promotion: data })
}

// PATCH — update a promotion (toggle active, change dates, etc.)
export async function PATCH(request: Request) {
  const { anon, admin } = getClients()
  const user = await requireAdmin(anon)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, ...updates } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Prevent updating sensitive read-only fields
  delete updates.used_count
  delete updates.created_by
  delete updates.created_at

  if (updates.code) updates.code = updates.code.toUpperCase().trim()

  const { data, error } = await admin
    .from('klippa_promotions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ promotion: data })
}

// DELETE — deactivate (soft delete) a promotion
export async function DELETE(request: Request) {
  const { anon, admin } = getClients()
  const user = await requireAdmin(anon)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await admin
    .from('klippa_promotions')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
