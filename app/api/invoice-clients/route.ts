import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

function createSupabaseServer() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs: { name: string; value: string; options?: object }[]) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any)),
      },
    }
  )
}

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('klippa_freelancer_clients')
    .select('*')
    .eq('user_id', user.id)
    .order('name')

  if (error) return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 })
  return NextResponse.json({ clients: data })
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  if (!body.name?.trim()) return NextResponse.json({ error: 'Client name is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('klippa_freelancer_clients')
    .insert({
      user_id:        user.id,
      name:           body.name.trim(),
      contact_person: body.contact_person || null,
      email:          body.email || null,
      phone:          body.phone || null,
      vat_number:     body.vat_number || null,
      address:        body.address || null,
      notes:          body.notes || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  return NextResponse.json({ client: data })
}
