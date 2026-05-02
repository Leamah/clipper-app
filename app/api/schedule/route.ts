import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

async function getAuthenticatedUser() {
  const cookieStore = await cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs: CookieToSet[]) {
          cs.forEach(({ name, value, options }) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cookieStore.set(name, value, options as any)
          )
        },
      },
    }
  )
  const { data: { user } } = await anon.auth.getUser()
  return user
}

// POST /api/schedule — create a scheduled post
export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    clip_name:    string
    public_url:   string
    caption?:     string
    platforms:    string[]
    scheduled_at: string | null   // ISO string or null (= post now)
  }

  if (!body.clip_name || !body.public_url || !body.platforms?.length) {
    return NextResponse.json({ error: 'clip_name, public_url and platforms are required' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Insert the record
  const { data: post, error: insertError } = await admin
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

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // 2. If post now (no scheduled_at), call Ayrshare immediately
  if (!body.scheduled_at) {
    const ayrResult = await postToAyrshare({
      post_id:    post.id,
      public_url: body.public_url,
      caption:    body.caption ?? '',
      platforms:  body.platforms,
    })

    await admin
      .from('clipper_scheduled_posts')
      .update(ayrResult)
      .eq('id', post.id)

    return NextResponse.json({ ...post, ...ayrResult })
  }

  // 3. Scheduled: also call Ayrshare with scheduleDate so it handles the timing
  const ayrResult = await postToAyrshare({
    post_id:      post.id,
    public_url:   body.public_url,
    caption:      body.caption ?? '',
    platforms:    body.platforms,
    scheduled_at: body.scheduled_at,
  })

  await admin
    .from('clipper_scheduled_posts')
    .update(ayrResult)
    .eq('id', post.id)

  return NextResponse.json({ ...post, ...ayrResult })
}

// DELETE /api/schedule?id=... — cancel a scheduled post
export async function DELETE(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await admin
    .from('clipper_scheduled_posts')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('user_id', user.id)   // enforce ownership
    .eq('status', 'scheduled') // can only cancel pending posts

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── Ayrshare helper ───────────────────────────────────────────────────────────
async function postToAyrshare(opts: {
  post_id:      string
  public_url:   string
  caption:      string
  platforms:    string[]
  scheduled_at?: string
}): Promise<Partial<{ status: string; ayrshare_post_id: string; platform_post_ids: Record<string, string>; error_msg: string }>> {
  const apiKey = process.env.AYRSHARE_API_KEY
  if (!apiKey) {
    console.warn('[ayrshare] AYRSHARE_API_KEY not set — skipping actual post')
    return { status: opts.scheduled_at ? 'scheduled' : 'posted' }
  }

  try {
    const payload: Record<string, unknown> = {
      post:      opts.caption,
      platforms: opts.platforms,
      mediaUrls: [opts.public_url],
    }
    if (opts.scheduled_at) payload.scheduleDate = opts.scheduled_at

    const res = await fetch('https://app.ayrshare.com/api/post', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    const json = await res.json() as {
      id?: string
      postIds?: Record<string, { id: string }>
      errors?: { platform: string; message: string }[]
      status?: string
    }

    if (!res.ok) {
      const msg = json.errors?.map((e) => `${e.platform}: ${e.message}`).join('; ') ?? 'Ayrshare error'
      return { status: 'failed', error_msg: msg }
    }

    const platformPostIds: Record<string, string> = {}
    for (const [platform, data] of Object.entries(json.postIds ?? {})) {
      platformPostIds[platform] = data.id
    }

    return {
      status:            opts.scheduled_at ? 'scheduled' : 'posted',
      ayrshare_post_id:  json.id,
      platform_post_ids: platformPostIds,
    }
  } catch (e) {
    return { status: 'failed', error_msg: String(e) }
  }
}
