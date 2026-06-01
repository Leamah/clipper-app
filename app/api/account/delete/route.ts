/**
 * POST /api/account/delete
 *
 * Hard-deletes all data for the authenticated user and removes the auth
 * account.  This is irreversible — the client must send { confirm: "DELETE" }
 * in the request body as a safeguard against accidental calls.
 *
 * Deletion order respects FK constraints:
 *   timesheet_entries → timesheets → clients
 *   expense_records, income_records, mileage_trips, documents
 *   subscriptions, user_promotions, tax_returns
 *   profiles  →  auth user (last)
 */
import { createServerClient }       from '@supabase/ssr'
import { createClient }             from '@supabase/supabase-js'
import { cookies }                  from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const cookieStore = cookies()

  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Require explicit confirmation string
  const body = await req.json().catch(() => ({}))
  if (body?.confirm !== 'DELETE') {
    return NextResponse.json({ error: 'Confirmation required' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const uid = user.id

  // ── 1. Storage: best-effort cleanup of uploaded files ────────
  try {
    const BUCKET = 'klippa_documents'

    // List root-level items under userId/
    const { data: rootItems } = await admin.storage.from(BUCKET).list(uid, { limit: 500 })
    const allPaths: string[] = []

    for (const item of rootItems ?? []) {
      if (item.id) {
        // It's a file
        allPaths.push(`${uid}/${item.name}`)
      } else {
        // It's a sub-folder — list one level deeper
        const { data: subItems } = await admin.storage.from(BUCKET).list(`${uid}/${item.name}`, { limit: 500 })
        for (const sub of subItems ?? []) {
          if (sub.id) allPaths.push(`${uid}/${item.name}/${sub.name}`)
        }
      }
    }

    if (allPaths.length > 0) {
      await admin.storage.from(BUCKET).remove(allPaths)
    }
  } catch (err) {
    // Non-fatal — continue with DB deletion even if storage cleanup fails
    console.warn(`[account/delete] Storage cleanup failed for user=${uid}:`, err)
  }

  // ── 2. Database records ───────────────────────────────────────
  // Explicit order to avoid FK violations

  // Timesheet entries (FK → timesheets)
  await admin.from('klippa_timesheet_entries').delete().eq('user_id', uid)
  // Timesheets (FK → clients + user)
  await admin.from('klippa_timesheets').delete().eq('user_id', uid)
  // Clients
  await admin.from('klippa_clients').delete().eq('user_id', uid)
  // Financial records
  await admin.from('klippa_expense_records').delete().eq('user_id', uid)
  await admin.from('klippa_income_records').delete().eq('user_id', uid)
  // Mileage
  await admin.from('klippa_mileage_trips').delete().eq('user_id', uid)
  // Documents metadata
  await admin.from('klippa_documents').delete().eq('user_id', uid)
  // Tax returns
  await admin.from('klippa_tax_returns').delete().eq('user_id', uid)
  // Subscriptions & promos
  await admin.from('klippa_subscriptions').delete().eq('user_id', uid)
  await admin.from('klippa_user_promotions').delete().eq('user_id', uid)
  // Profile (must be after all child tables)
  await admin.from('klippa_profiles').delete().eq('id', uid)

  // ── 3. Delete the auth account ────────────────────────────────
  const { error: authErr } = await admin.auth.admin.deleteUser(uid)
  if (authErr) {
    console.error(`[account/delete] Auth deletion failed for user=${uid}:`, authErr)
    return NextResponse.json({ error: 'Failed to delete auth account' }, { status: 500 })
  }

  console.log(`[account/delete] Complete for user=${uid}`)
  return NextResponse.json({ success: true })
}
