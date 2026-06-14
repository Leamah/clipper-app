import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id }      = params
  const cookieStore = cookies()
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: portfolio, error } = await supabase
    .from('klippa_invest_portfolios')
    .select('*, holdings:klippa_invest_holdings(*, company:klippa_invest_companies(*))')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !portfolio) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(portfolio)
}
