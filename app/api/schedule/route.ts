import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

async function getAuthUser() {
  const cookieStore = await cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cs: CookieToSet[]) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any)) },
      },
    }
  )
  const { data: { user } } = await anon.auth.getUser()
  return user
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/schedule — queue a clip for manual posting
export async function POST(request: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    clip_name:    string
    public_url:   string
    caption?:     string
    platforms:    string[]
    scheduled_at: string   // ISO string — when user plans to post
  }

  if (!body.clip_name || !body.public_url || !body.platforms?.length) {
    return NextResponse.json({ error: 'clip_name, public_url and platforms are required' }, { status: 400 })
  }

  const { data, error } = await adminClient()
    .from('clipper_scheduled_posts')
    .insert({
      user_id:      user.id,
      clip_name:    body.clip_name,
      public_url:   body.public_url,
      caption:      body.caption ?? '',
      platforms:    body.platforms,
      scheduled_at: body.scheduled_at,
      status:       'scheduled',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/schedule — mark a queued post as done or cancelled
export async function PATCH(request: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { id: string; status: 'posted' | 'cancelled' }
  if (!body.id || !body.status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })

  const { error } = await adminClient()
    .from('clipper_scheduled_posts')
    .update({ status: body.status })
    .eq('id', body.id)
    .eq('user_id', user.id)   // enforce ownership

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/schedule?id= — remove from queue
export async function DELETE(request: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await adminClient()
    .from('clipper_scheduled_posts')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'scheduled')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
